<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ElDialog, ElMessage } from 'element-plus'

import {
  getDeviceInfo,
  resolveHassHardwareBindings,
  type DeviceInfo,
} from '@/services/flojoy-api'
import type {
  HassHardwareProfile,
  HassHardwareRole,
} from '@/services/hass-hardware-binding'
import {
  HASS_HARDWARE_ROLE_ORDER,
  createDefaultHassWorkbenchConfig,
  extractInstrumentSerialFromIdentity,
  learnHardwareProfilesFromBindings,
  loadHassWorkbenchConfig,
  saveHassWorkbenchConfig,
  type HassWorkbenchConfig,
} from '@/services/hass-workbench-config'

const visible = defineModel<boolean>({ default: false })
const emit = defineEmits<{ saved: [] }>()

const config = reactive<HassWorkbenchConfig>(loadHassWorkbenchConfig())
const deviceInfo = ref<DeviceInfo | null>(null)
const isRefreshing = ref(false)
const isResolving = ref(false)
const roleMessages = reactive<Partial<Record<HassHardwareRole, { ok: boolean; text: string }>>>({})

const orderedProfiles = computed(() => {
  const byRole = new Map(config.hardwareProfiles.map(profile => [profile.role, profile]))
  return HASS_HARDWARE_ROLE_ORDER
    .map(role => byRole.get(role))
    .filter((profile): profile is HassHardwareProfile => Boolean(profile))
})

function replaceConfig(next: HassWorkbenchConfig): void {
  config.version = 1
  config.mqtt = { ...next.mqtt }
  config.hardwareProfiles = next.hardwareProfiles.map(profile => ({
    ...profile,
    matcher: { ...profile.matcher },
  }))
}

function optionValue(profile: HassHardwareProfile, item: Record<string, unknown>): string {
  return profile.resourceType === 'visa'
    ? String(item.address || '')
    : String(item.port || '')
}

function deviceOptions(profile: HassHardwareProfile): Array<Record<string, unknown>> {
  if (!deviceInfo.value) return []
  return profile.resourceType === 'visa'
    ? deviceInfo.value.visaDevices
    : deviceInfo.value.serialDevices
}

function optionLabel(profile: HassHardwareProfile, item: Record<string, unknown>): string {
  const resource = optionValue(profile, item)
  const description = String(item.description || item.name || '').trim()
  return description ? `${resource} · ${description}` : resource
}

function handleDeviceSelection(profile: HassHardwareProfile): void {
  const selected = deviceOptions(profile).find(
    item => optionValue(profile, item) === profile.matcher.preferredPort,
  )
  if (!selected) return

  if (profile.resourceType === 'visa') {
    const serial = extractInstrumentSerialFromIdentity(String(selected.description || ''))
    if (serial) profile.matcher.instrumentSerial = serial
  } else {
    const vid = Number(selected.vid)
    const pid = Number(selected.pid)
    profile.matcher.vid = Number.isInteger(vid) ? vid : undefined
    profile.matcher.pid = Number.isInteger(pid) ? pid : undefined
    profile.matcher.serialNumber = String(selected.serialNumber || '').trim() || undefined
    const interfaceName = String(selected.interfaceName || '').trim()
    if (interfaceName && !profile.matcher.interfaceMarker) {
      profile.matcher.interfaceMarker = interfaceName
    }
  }
  delete roleMessages[profile.role]
}

function bindingBasis(profile: HassHardwareProfile): string {
  const matcher = profile.matcher
  const parts = [
    matcher.instrumentSerial ? `仪器SN ${matcher.instrumentSerial}` : '',
    matcher.serialNumber ? `USB SN ${matcher.serialNumber}` : '',
    matcher.interfaceMarker ? `接口 ${matcher.interfaceMarker}` : '',
    matcher.preferredPort ? `稳定路径 ${matcher.preferredPort}` : '',
  ].filter(Boolean)
  return parts.join(' · ') || '尚未配置识别依据'
}

async function refreshDevices(): Promise<void> {
  isRefreshing.value = true
  try {
    deviceInfo.value = await getDeviceInfo(false, false, true, false)
  } catch (error) {
    ElMessage.error(`读取本机设备失败：${error instanceof Error ? error.message : String(error)}`)
  } finally {
    isRefreshing.value = false
  }
}

async function autoResolve(): Promise<void> {
  isResolving.value = true
  for (const role of HASS_HARDWARE_ROLE_ORDER) delete roleMessages[role]
  try {
    const baudrates = Object.fromEntries(
      config.hardwareProfiles
        .filter(profile => profile.baudrate)
        .map(profile => [profile.role, profile.baudrate]),
    ) as Partial<Record<HassHardwareRole, number>>
    const response = await resolveHassHardwareBindings(
      HASS_HARDWARE_ROLE_ORDER,
      baudrates,
      config.hardwareProfiles,
    )
    config.hardwareProfiles = learnHardwareProfilesFromBindings(
      config.hardwareProfiles,
      response.bindings,
    )
    response.bindings.forEach(binding => {
      roleMessages[binding.role] = {
        ok: true,
        text: `已绑定 ${binding.resource}`,
      }
    })
    Object.entries(response.errors || {}).forEach(([role, message]) => {
      roleMessages[role as HassHardwareRole] = { ok: false, text: message }
    })
    if (response.bindings.length) {
      ElMessage.success(`已识别 ${response.bindings.length} 个设备角色`)
    } else {
      ElMessage.warning('未识别到可绑定设备，请检查供电或手动选择')
    }
  } catch (error) {
    ElMessage.error(`自动识别失败：${error instanceof Error ? error.message : String(error)}`)
  } finally {
    isResolving.value = false
  }
}

function saveSettings(): void {
  replaceConfig(saveHassWorkbenchConfig(config))
  ElMessage.success('本机工作台设备绑定已保存')
  emit('saved')
  visible.value = false
}

function restoreDefaults(): void {
  replaceConfig(createDefaultHassWorkbenchConfig())
  for (const role of HASS_HARDWARE_ROLE_ORDER) delete roleMessages[role]
  ElMessage.info('已载入默认识别规则，点击“保存本机绑定”后生效')
}

watch(visible, (open) => {
  if (!open) return
  replaceConfig(loadHassWorkbenchConfig())
  void refreshDevices()
})
</script>

<template>
  <ElDialog
    v-model="visible"
    title="本机工作台设备绑定"
    width="860px"
    append-to-body
    destroy-on-close
    class="hardware-binding-dialog"
  >
    <div class="binding-intro">
      <Icon icon="mdi:usb-port" />
      <div>
        <strong>工艺只记录设备角色，串口由当前客户端自动解析</strong>
        <p>首次部署先自动识别；同型号设备无法唯一判断时手动选择一次。Deepin 优先保存 /dev/serial/by-id、USB 序列号和仪器序列号，不保存临时 ttyUSB/COM 编号。</p>
      </div>
    </div>

    <div class="binding-toolbar">
      <button type="button" :disabled="isRefreshing" @click="refreshDevices">
        <Icon icon="mdi:refresh" :class="{ spin: isRefreshing }" />
        刷新设备
      </button>
      <button type="button" class="primary" :disabled="isResolving" @click="autoResolve">
        <Icon icon="mdi:auto-fix" :class="{ spin: isResolving }" />
        自动识别并绑定
      </button>
    </div>

    <div class="binding-list">
      <section v-for="profile in orderedProfiles" :key="profile.role" class="binding-row">
        <div class="role-heading">
          <span class="role-icon"><Icon :icon="profile.resourceType === 'visa' ? 'mdi:power-plug' : 'mdi:serial-port'" /></span>
          <div>
            <strong>{{ profile.displayName }}</strong>
            <small>{{ profile.resourceType === 'visa' ? 'VISA 串口仪器' : `串口设备 · ${profile.baudrate || '--'} baud` }}</small>
          </div>
        </div>

        <label class="device-select">
          <span>本机设备</span>
          <select v-model="profile.matcher.preferredPort" @change="handleDeviceSelection(profile)">
            <option value="">按身份自动解析</option>
            <option
              v-for="item in deviceOptions(profile)"
              :key="optionValue(profile, item)"
              :value="optionValue(profile, item)"
            >
              {{ optionLabel(profile, item) }}
            </option>
          </select>
        </label>

        <div class="binding-evidence">
          <span>绑定依据</span>
          <p :title="bindingBasis(profile)">{{ bindingBasis(profile) }}</p>
          <small
            v-if="roleMessages[profile.role]"
            :class="roleMessages[profile.role]?.ok ? 'success' : 'error'"
          >
            {{ roleMessages[profile.role]?.text }}
          </small>
        </div>
      </section>
    </div>

    <template #footer>
      <div class="dialog-actions">
        <button type="button" class="ghost" @click="restoreDefaults">恢复默认</button>
        <span class="action-spacer" />
        <button type="button" class="ghost" @click="visible = false">取消</button>
        <button type="button" class="primary" @click="saveSettings">
          <Icon icon="mdi:content-save-outline" />
          保存本机绑定
        </button>
      </div>
    </template>
  </ElDialog>
</template>

<style scoped>
.binding-intro {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.9rem 1rem;
  border: 1px solid rgba(59, 130, 246, 0.22);
  border-radius: 0.65rem;
  background: rgba(59, 130, 246, 0.06);
}

.binding-intro > svg {
  flex: 0 0 auto;
  margin-top: 0.1rem;
  color: rgb(37, 99, 235);
  font-size: 1.35rem;
}

.binding-intro strong { color: var(--color-text-primary, #1e293b); }
.binding-intro p {
  margin: 0.25rem 0 0;
  color: var(--color-text-secondary, #64748b);
  font-size: 0.82rem;
  line-height: 1.55;
}

.binding-toolbar,
.dialog-actions {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.binding-toolbar { margin: 1rem 0 0.75rem; }
.action-spacer { flex: 1; }

button {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0 0.9rem;
  border: 1px solid var(--color-border, #dbe3ee);
  border-radius: 0.5rem;
  background: var(--color-bg-primary, #fff);
  color: var(--color-text-primary, #334155);
  font-weight: 600;
  cursor: pointer;
}

button:hover:not(:disabled) { background: var(--color-bg-secondary, #f8fafc); }
button:focus-visible { outline: 3px solid rgba(59, 130, 246, 0.28); outline-offset: 2px; }
button:disabled { opacity: 0.55; cursor: not-allowed; }
button.primary { border-color: rgb(37, 99, 235); background: rgb(37, 99, 235); color: #fff; }
button.primary:hover:not(:disabled) { background: rgb(29, 78, 216); }
button.ghost { background: transparent; }

.binding-list {
  display: grid;
  gap: 0.65rem;
  max-height: min(56vh, 560px);
  overflow-y: auto;
  padding-right: 0.25rem;
}

.binding-row {
  display: grid;
  grid-template-columns: minmax(170px, 0.8fr) minmax(260px, 1.3fr) minmax(240px, 1fr);
  align-items: center;
  gap: 0.9rem;
  padding: 0.85rem;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 0.65rem;
  background: var(--color-bg-primary, #fff);
}

.role-heading { display: flex; align-items: center; gap: 0.65rem; min-width: 0; }
.role-icon {
  display: inline-flex;
  width: 2.25rem;
  height: 2.25rem;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 0.55rem;
  background: rgba(59, 130, 246, 0.1);
  color: rgb(37, 99, 235);
  font-size: 1.15rem;
}
.role-heading strong { display: block; color: var(--color-text-primary, #1e293b); }
.role-heading small { display: block; margin-top: 0.15rem; color: var(--color-text-secondary, #64748b); }

.device-select,
.binding-evidence { min-width: 0; }
.device-select > span,
.binding-evidence > span {
  display: block;
  margin-bottom: 0.3rem;
  color: var(--color-text-secondary, #64748b);
  font-size: 0.75rem;
  font-weight: 600;
}
.device-select select {
  width: 100%;
  min-height: 42px;
  padding: 0 0.65rem;
  border: 1px solid var(--color-border, #cbd5e1);
  border-radius: 0.45rem;
  background: var(--color-bg-primary, #fff);
  color: var(--color-text-primary, #1e293b);
}
.device-select select:focus-visible { outline: 3px solid rgba(59, 130, 246, 0.2); border-color: rgb(59, 130, 246); }

.binding-evidence p {
  overflow: hidden;
  margin: 0;
  color: var(--color-text-primary, #334155);
  font-size: 0.78rem;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.binding-evidence small { display: block; margin-top: 0.3rem; font-size: 0.75rem; }
.binding-evidence small.success { color: rgb(22, 163, 74); }
.binding-evidence small.error { color: rgb(220, 38, 38); }

.spin { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 900px) {
  .binding-row { grid-template-columns: 1fr; }
}

@media (prefers-reduced-motion: reduce) {
  .spin { animation: none; }
}
</style>
