<script setup lang="ts">
/**
 * Device Panel Component
 * Main panel for hardware device discovery and management
 */
import { ref, onMounted, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { useHardware } from '@/composables/useHardware'
import DeviceList from './DeviceList.vue'
import type { DeviceCategory } from '@/types'

const props = withDefaults(defineProps<{
  autoRefresh?: boolean
  showNIOptions?: boolean
}>(), {
  autoRefresh: true,
  showNIOptions: true,
})

const {
  devices,
  isLoading,
  error,
  totalCount,
  hasDevices,
  discoverNIDAQmx,
  discoverNIDMM,
  refreshDevices,
  setDiscoverNIDAQmx,
  setDiscoverNIDMM,
} = useHardware()

// Track which categories are expanded
const expandedCategories = ref<Record<DeviceCategory, boolean>>({
  camera: true,
  serial: true,
  visa: false,
  nidaqmx: false,
  nidmm: false,
})

// Initial load
onMounted(async () => {
  if (props.autoRefresh) {
    await refreshDevices()
  }
})

// Re-fetch when NI options change
watch([discoverNIDAQmx, discoverNIDMM], async () => {
  if (props.autoRefresh) {
    await refreshDevices()
  }
})

function handleNIDAQmxToggle() {
  setDiscoverNIDAQmx(!discoverNIDAQmx.value)
}

function handleNIDMMToggle() {
  setDiscoverNIDMM(!discoverNIDMM.value)
}

async function handleRefresh() {
  await refreshDevices()
}
</script>

<template>
  <div class="device-panel">
    <div class="panel-header">
      <div class="header-left">
        <div class="header-icon">
          <Icon icon="mdi:harddisk" />
        </div>
        <div class="header-title">
          <h2>设备管理</h2>
          <p class="header-desc">发现并管理连接的硬件设备</p>
        </div>
      </div>
      <div class="header-right">
        <span v-if="hasDevices" class="badge badge-primary">
          {{ totalCount }} 设备
        </span>
        <span v-else class="badge badge-secondary">
          无设备
        </span>
        <button
          class="refresh-btn"
          :disabled="isLoading"
          @click="handleRefresh"
        >
          <Icon
            icon="mdi:refresh"
            class="refresh-icon"
            :class="{ spinning: isLoading }"
          />
        </button>
      </div>
    </div>

    <div class="panel-content">
      <!-- Error Message -->
      <div v-if="error" class="error-message">
        <Icon icon="mdi:alert-circle" class="error-icon" />
        <span>{{ error }}</span>
      </div>

      <!-- NI Discovery Options -->
      <div v-if="showNIOptions" class="ni-options">
        <div class="option-row">
          <label for="nidaqmx-switch">启用 NI DAQmx 发现</label>
          <button
            id="nidaqmx-switch"
            class="toggle-switch"
            :class="{ active: discoverNIDAQmx }"
            @click="handleNIDAQmxToggle"
          >
            <span class="toggle-thumb" />
          </button>
        </div>
        <div class="option-row">
          <label for="nidmm-switch">启用 NI DMM 发现</label>
          <button
            id="nidmm-switch"
            class="toggle-switch"
            :class="{ active: discoverNIDMM }"
            @click="handleNIDMMToggle"
          >
            <span class="toggle-thumb" />
          </button>
        </div>
        <hr class="separator" />
      </div>

      <!-- Device Lists -->
      <div class="device-lists">
        <DeviceList
          v-model:open="expandedCategories.camera"
          category="camera"
          :devices="[...devices.cameras]"
        />

        <DeviceList
          v-model:open="expandedCategories.serial"
          category="serial"
          :devices="devices.serialDevices.map(d => ({ name: d.description, ...d }))"
        />

        <DeviceList
          v-model:open="expandedCategories.visa"
          category="visa"
          :devices="[...devices.visaDevices]"
        />

        <DeviceList
          v-if="discoverNIDAQmx"
          v-model:open="expandedCategories.nidaqmx"
          category="nidaqmx"
          :devices="[...devices.nidaqmxDevices]"
        />

        <DeviceList
          v-if="discoverNIDMM"
          v-model:open="expandedCategories.nidmm"
          category="nidmm"
          :devices="[...devices.nidmmDevices]"
        />
      </div>

      <!-- Loading Indicator -->
      <div v-if="isLoading" class="loading-message">
        <Icon icon="mdi:refresh" class="spinning" />
        <span>正在发现设备...</span>
      </div>

      <!-- Success Message -->
      <div v-else-if="hasDevices && !error" class="success-message">
        <Icon icon="mdi:check-circle" />
        <span>已发现 {{ totalCount }} 个设备</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.device-panel {
  background: var(--card, white);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--border);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-icon {
  width: 40px;
  height: 40px;
  background: var(--primary, #3b82f6);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 20px;
}

.header-title h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.header-desc {
  margin: 0;
  font-size: 13px;
  color: var(--muted-foreground);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.badge {
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 9999px;
}

.badge-primary {
  background: var(--primary, #3b82f6);
  color: white;
}

.badge-secondary {
  background: var(--muted, #f1f5f9);
  color: var(--muted-foreground);
}

.refresh-btn {
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid var(--border);
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.refresh-btn:hover:not(:disabled) {
  background: var(--muted);
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.refresh-icon {
  width: 16px;
  height: 16px;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.panel-content {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.error-message {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  border-radius: 8px;
  font-size: 13px;
}

.error-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.ni-options {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.option-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.option-row label {
  font-size: 13px;
}

.toggle-switch {
  width: 44px;
  height: 24px;
  padding: 2px;
  border: none;
  background: var(--muted, #e2e8f0);
  border-radius: 9999px;
  cursor: pointer;
  position: relative;
  transition: background 0.2s;
}

.toggle-switch.active {
  background: var(--primary, #3b82f6);
}

.toggle-thumb {
  display: block;
  width: 20px;
  height: 20px;
  background: white;
  border-radius: 50%;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.toggle-switch.active .toggle-thumb {
  transform: translateX(20px);
}

.separator {
  border: none;
  border-top: 1px solid var(--border);
  margin: 4px 0;
}

.device-lists {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.loading-message,
.success-message {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
  font-size: 13px;
  color: var(--muted-foreground);
}

.success-message {
  color: #22c55e;
}
</style>
