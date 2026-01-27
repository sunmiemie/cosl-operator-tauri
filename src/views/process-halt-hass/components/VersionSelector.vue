<script setup lang="ts">
/**
 * 版本选择器组件
 * 支持输入新版本号、选择基础版本
 */
import { ref, computed, watch } from 'vue'
import { Icon } from '@iconify/vue'

interface ProcessVersion {
  id: number
  name: string
  version: string
}

interface BaseVersion {
  processId: number
  version: string
}

interface Props {
  version: string
  baseVersion?: BaseVersion
  existingVersions?: ProcessVersion[]
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  existingVersions: () => [],
  disabled: false,
})

const emit = defineEmits<{
  'update:version': [value: string]
  'update:baseVersion': [value: BaseVersion | undefined]
}>()

// 是否启用基于版本迭代
const useBaseVersion = ref(!!props.baseVersion)

// 选中的基础版本行
const selectedRow = ref<number | null>(props.baseVersion?.processId ?? null)

// 版本号校验正则
const versionRegex = /^\d+\.\d+\.\d+$/

// 版本号是否有效
const isVersionValid = computed(() => {
  if (!props.version) return false
  return versionRegex.test(props.version)
})

// 版本号校验提示
const versionHint = computed(() => {
  if (!props.version) return '请输入版本号'
  if (!isVersionValid.value) return '格式: x.y.z (如 1.0.0)'
  return ''
})

// 自动递增版本号
function incrementVersion() {
  const current = props.version || '1.0.0'
  const parts = current.split('.')
  if (parts.length === 3) {
    const patch = parseInt(parts[2], 10)
    parts[2] = String(patch + 1)
    emit('update:version', parts.join('.'))
  }
}

// 选择基础版本
function selectBaseVersion(row: ProcessVersion) {
  if (!useBaseVersion.value) return
  selectedRow.value = row.id
  emit('update:baseVersion', {
    processId: row.id,
    version: row.version,
  })
}

// 清除基础版本选择
function clearBaseVersion() {
  selectedRow.value = null
  emit('update:baseVersion', undefined)
}

// 切换基于版本迭代
function toggleUseBaseVersion() {
  useBaseVersion.value = !useBaseVersion.value
  if (!useBaseVersion.value) {
    clearBaseVersion()
  }
}

// 监听 baseVersion 变化
watch(
  () => props.baseVersion,
  (newVal) => {
    useBaseVersion.value = !!newVal
    selectedRow.value = newVal?.processId ?? null
  }
)
</script>

<template>
  <div class="version-selector">
    <!-- 版本号输入 -->
    <div class="version-input-section">
      <div class="form-group">
        <label class="form-label">
          <Icon icon="mdi:source-branch" />
          工艺版本
        </label>
        <div class="version-input-wrapper">
          <span class="version-prefix">V</span>
          <input
            :value="version"
            type="text"
            placeholder="1.0.0"
            class="version-input"
            :class="{ invalid: version && !isVersionValid }"
            :disabled="disabled"
            @input="$emit('update:version', ($event.target as HTMLInputElement).value)"
          />
          <button class="increment-btn" @click="incrementVersion" :disabled="disabled" title="版本号 +1">
            <Icon icon="mdi:plus" />
          </button>
        </div>
        <span v-if="versionHint" class="version-hint" :class="{ error: version && !isVersionValid }">
          {{ versionHint }}
        </span>
      </div>
    </div>

    <!-- 基于版本迭代 -->
    <div class="base-version-section">
      <div class="section-header">
        <label class="checkbox-label" @click="toggleUseBaseVersion">
          <div class="checkbox" :class="{ checked: useBaseVersion }">
            <Icon v-if="useBaseVersion" icon="mdi:check" />
          </div>
          <span>基于已有版本迭代</span>
        </label>
        <button
          v-if="useBaseVersion && selectedRow"
          class="clear-btn"
          @click="clearBaseVersion"
        >
          <Icon icon="mdi:close" />
          清除选择
        </button>
      </div>

      <Transition name="expand">
        <div v-if="useBaseVersion" class="version-list-wrapper">
          <p class="section-desc">选择一个已有版本作为基础</p>

          <div class="version-table-wrapper">
            <table class="version-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>工艺名称</th>
                  <th>版本</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in existingVersions"
                  :key="row.id"
                  :class="{ selected: selectedRow === row.id }"
                  @click="selectBaseVersion(row)"
                >
                  <td class="mono">{{ row.id }}</td>
                  <td>{{ row.name }}</td>
                  <td class="mono">V{{ row.version }}</td>
                </tr>
                <tr v-if="existingVersions.length === 0">
                  <td colspan="3" class="empty-row">
                    <div class="empty-content">
                      <Icon icon="mdi:package-variant" class="empty-icon" />
                      <span>暂无已创建的工艺版本</span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.version-selector {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 版本输入区域 */
.version-input-section {
  padding: 16px 20px;
  background: var(--color-bg-tertiary);
  border-radius: 10px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.version-input-wrapper {
  display: flex;
  align-items: stretch;
}

.version-prefix {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 14px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-right: none;
  border-radius: 8px 0 0 8px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.version-input {
  flex: 1;
  padding: 12px 14px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  font-size: 14px;
  color: var(--color-text-primary);
  transition: all 0.2s ease;
  font-family: var(--font-mono);
}

.version-input:focus {
  outline: none;
  border-color: var(--color-accent-blue);
}

.version-input.invalid {
  border-color: var(--color-accent-red);
}

.version-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.version-input::placeholder {
  color: var(--color-text-tertiary);
}

.increment-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 14px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-left: none;
  border-radius: 0 8px 8px 0;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.increment-btn:hover:not(:disabled) {
  background: var(--color-accent-blue);
  color: white;
}

.increment-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.version-hint {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.version-hint.error {
  color: var(--color-accent-red);
}

/* 基于版本迭代区域 */
.base-version-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.checkbox {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: 2px solid var(--color-border);
  border-radius: 4px;
  transition: all 0.2s ease;
  font-size: 12px;
  color: white;
}

.checkbox.checked {
  background: var(--color-accent-blue);
  border-color: var(--color-accent-blue);
}

.clear-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 13px;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.clear-btn:hover {
  border-color: var(--color-accent-red);
  color: var(--color-accent-red);
}

.version-list-wrapper {
  padding: 16px;
  background: var(--color-bg-tertiary);
  border-radius: 10px;
}

.section-desc {
  font-size: 13px;
  color: var(--color-text-tertiary);
  margin: 0 0 12px 0;
}

/* 版本表格 */
.version-table-wrapper {
  max-height: 200px;
  overflow-y: auto;
  border-radius: 8px;
  border: 1px solid var(--color-border);
}

.version-table-wrapper::-webkit-scrollbar {
  width: 4px;
}

.version-table-wrapper::-webkit-scrollbar-track {
  background: transparent;
}

.version-table-wrapper::-webkit-scrollbar-thumb {
  background: var(--color-scrollbar);
  border-radius: 2px;
}

.version-table {
  width: 100%;
  border-collapse: collapse;
}

.version-table th {
  position: sticky;
  top: 0;
  padding: 10px 14px;
  background: var(--color-bg-secondary);
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-align: left;
  border-bottom: 1px solid var(--color-border);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.version-table td {
  padding: 10px 14px;
  font-size: 14px;
  color: var(--color-text-primary);
  border-bottom: 1px solid var(--color-border-light);
}

.version-table tbody tr {
  cursor: pointer;
  transition: background 0.15s ease;
}

.version-table tbody tr:hover {
  background: var(--color-bg-hover);
}

.version-table tbody tr.selected {
  background: rgba(88, 166, 255, 0.1);
}

.version-table tbody tr.selected td {
  color: var(--color-accent-blue);
  font-weight: 500;
}

.version-table tbody tr:last-child td {
  border-bottom: none;
}

.mono {
  font-family: var(--font-mono);
}

.empty-row {
  padding: 32px 14px !important;
}

.empty-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--color-text-tertiary);
}

.empty-content .empty-icon {
  font-size: 28px;
  opacity: 0.5;
}

/* 展开动画 */
.expand-enter-active,
.expand-leave-active {
  transition: all 0.3s ease;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
