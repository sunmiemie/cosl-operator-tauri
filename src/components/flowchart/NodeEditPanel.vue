<script setup lang="ts">
/**
 * 节点编辑面板
 * 对齐 Studio BlockEditModal 实现
 * 使用原生样式，不依赖 Element Plus
 */
import { ref, computed, watch, onMounted } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessage } from 'element-plus'
import type { Node } from '@vue-flow/core'
import type { BlockData, CtrlData, BlockParameterValue } from '@/views/process-halt-hass/types'
import { useBlockManifest } from '@/composables/useBlockManifest'

// 使用 Block Manifest composable 获取最新的参数定义
const { loadManifest, getParamOptions } = useBlockManifest()

// Props
interface Props {
  // 要编辑的节点
  node: Node<BlockData> | null
  // 其他节点（用于 NodeReference 类型）
  otherNodes?: Node<BlockData>[]
  // 是否显示
  visible: boolean
}

const props = withDefaults(defineProps<Props>(), {
  otherNodes: () => [],
  visible: false,
})

// Emits
const emit = defineEmits<{
  // 关闭面板
  (e: 'close'): void
  // 更新节点标签
  (e: 'updateLabel', nodeId: string, label: string): void
  // 更新节点参数
  (e: 'updateParam', nodeId: string, paramName: string, value: BlockParameterValue): void
  // 更新初始化参数
  (e: 'updateInitParam', nodeId: string, paramName: string, value: BlockParameterValue): void
  // 删除节点
  (e: 'delete', nodeId: string): void
}>()

// 状态
const isEditingLabel = ref(false)
const editedLabel = ref('')

// 计算属性
const nodeData = computed(() => props.node?.data)
const hasCtrls = computed(() => nodeData.value?.ctrls && Object.keys(nodeData.value.ctrls).length > 0)
const hasInitCtrls = computed(() => nodeData.value?.initCtrls && Object.keys(nodeData.value.initCtrls).length > 0)

// 节点引用选项
const nodeReferenceOptions = computed(() =>
  props.otherNodes.map(n => ({
    label: n.data?.label || n.id,
    value: n.id,
  }))
)

// 监听节点变化，重置编辑状态
watch(() => props.node?.id, () => {
  isEditingLabel.value = false
  if (props.node) {
    editedLabel.value = props.node.data?.label || ''
  }
})

// 开始编辑标签
function startEditLabel() {
  if (props.node) {
    editedLabel.value = props.node.data?.label || ''
    isEditingLabel.value = true
  }
}

// 确认标签修改
function confirmLabelChange() {
  if (props.node && editedLabel.value.trim()) {
    emit('updateLabel', props.node.id, editedLabel.value.trim())
    isEditingLabel.value = false
  }
}

// 取消编辑标签
function cancelEditLabel() {
  isEditingLabel.value = false
  if (props.node) {
    editedLabel.value = props.node.data?.label || ''
  }
}

// 更新参数值
function handleParamChange(paramName: string, value: BlockParameterValue, isInit = false) {
  if (!props.node) return
  if (isInit) {
    emit('updateInitParam', props.node.id, paramName, value)
  } else {
    emit('updateParam', props.node.id, paramName, value)
  }
}

// 删除节点
function handleDelete() {
  if (props.node) {
    emit('delete', props.node.id)
    emit('close')
  }
}

// 关闭面板
function handleClose() {
  emit('close')
}

// 设备类型列表（对齐 Studio ParamValueType）
const DEVICE_TYPES = [
  'CameraDevice', 'CameraConnection',
  'SerialDevice', 'SerialConnection',
  'VisaDevice', 'VisaConnection',
  'NIDAQmxDevice', 'NIDMMDevice', 'NIConnection',
]

// 获取参数输入类型（考虑从 manifest 获取的最新 options）
function getParamInputType(ctrl: CtrlData[string], paramName?: string, isInit = false): string {
  const type = ctrl.type || 'str'
  const typeLower = type.toLowerCase()
  
  // 先尝试从 manifest 获取最新的 options
  let hasOptions = ctrl.options && Array.isArray(ctrl.options) && ctrl.options.length > 0
  
  // 如果提供了参数名，尝试从 manifest 获取最新的 options
  if (!hasOptions && paramName && nodeData.value) {
    const func = nodeData.value.func || nodeData.value.blockKey
    const freshOptions = getParamOptions(func, paramName, undefined, isInit)
    hasOptions = !!freshOptions && freshOptions.length > 0
  }
  
  // 有 options 或类型为 select 就是下拉选择
  if (hasOptions || typeLower === 'select') {
    return 'select'
  }
  
  // 设备类型 - 渲染为下拉选择（从后端获取设备列表）
  if (DEVICE_TYPES.some(dt => dt.toLowerCase() === typeLower || type === dt)) {
    return 'device-select'
  }
  
  // NodeReference - 引用其他节点
  if (typeLower === 'nodereference') {
    return 'node-reference'
  }
  
  // 基础类型
  switch (typeLower) {
    case 'float':
    case 'int':
    case 'number':
      return 'number'
    case 'bool':
    case 'boolean':
      return 'boolean'
    case 'file':
      return 'file'
    case 'directory':
      return 'directory'
    case 'textarea':
      return 'textarea'
    case 'str':
    case 'string':
    default:
      return 'string'
  }
}

// 获取设备类型的占位符
function getDevicePlaceholder(type: string): string {
  const typeLower = type.toLowerCase()
  if (typeLower.includes('camera')) return '选择摄像头...'
  if (typeLower.includes('serial')) return '选择串口设备...'
  if (typeLower.includes('visa')) return '选择 VISA 设备...'
  if (typeLower.includes('nidaq')) return '选择 NI DAQmx 设备...'
  if (typeLower.includes('nidmm') || typeLower.includes('niconnection')) return '选择 NI 设备...'
  return '选择设备...'
}

// 获取参数描述
function getParamDescription(ctrl: CtrlData[string]): string {
  return ctrl.desc || ''
}

// 获取参数的最新 options（从 manifest 获取，回退到 ctrl 中的 options）
function getFreshOptions(paramName: string, ctrl: CtrlData[string], isInit = false): unknown[] {
  const func = nodeData.value?.func || nodeData.value?.blockKey
  const freshOptions = getParamOptions(func, paramName, ctrl.options, isInit)
  return freshOptions || []
}

// 初始化时加载 manifest
onMounted(() => {
  loadManifest()
})
</script>

<template>
  <div v-if="visible && node" class="node-edit-panel">
    <!-- 头部 -->
    <div class="panel-header">
      <!-- 标签编辑 -->
      <div class="label-section">
        <template v-if="isEditingLabel">
          <input
            v-model="editedLabel"
            type="text"
            class="label-input"
            @keyup.enter="confirmLabelChange"
            @keyup.escape="cancelEditLabel"
          />
          <button class="icon-btn btn-primary" @click="confirmLabelChange" title="确认">
            <Icon icon="mdi:check" />
          </button>
          <button class="icon-btn" @click="cancelEditLabel" title="取消">
            <Icon icon="mdi:close" />
          </button>
        </template>
        <template v-else>
          <h3 class="node-label">{{ nodeData?.label }}</h3>
          <button class="icon-btn" @click="startEditLabel" title="编辑标签">
            <Icon icon="mdi:pencil" />
          </button>
        </template>
      </div>
      
      <!-- 关闭按钮 -->
      <button class="icon-btn" @click="handleClose" title="关闭">
        <Icon icon="mdi:close" />
      </button>
    </div>
    
    <!-- 节点信息 -->
    <div class="node-info">
      <span class="info-label">类型:</span>
      <span class="info-value">{{ nodeData?.func || nodeData?.blockKey || node.type }}</span>
    </div>
    
    <!-- 参数列表 -->
    <div class="params-scrollbar">
      <div class="params-content">
        <!-- 初始化参数 -->
        <template v-if="hasInitCtrls">
          <div class="params-section">
            <h4 class="section-title">
              <Icon icon="mdi:cog-outline" />
              初始化参数
            </h4>
            <div class="params-list">
              <div
                v-for="(ctrl, paramName) in nodeData?.initCtrls"
                :key="paramName"
                class="param-item"
              >
                <div class="param-header">
                  <label class="param-name">{{ paramName }}</label>
                  <Icon
                    v-if="getParamDescription(ctrl)"
                    icon="mdi:information-outline"
                    class="param-info-icon"
                    :title="getParamDescription(ctrl)"
                  />
                </div>
                
                <!-- 参数输入 -->
                <div class="param-input">
                  <!-- 下拉选择（有 options） -->
                  <select
                    v-if="getParamInputType(ctrl, paramName as string, true) === 'select'"
                    :value="ctrl.value"
                    class="form-select"
                    @change="(e) => handleParamChange(paramName as string, (e.target as HTMLSelectElement).value, true)"
                  >
                    <option v-if="ctrl.value != null && !getFreshOptions(paramName as string, ctrl, true).includes(ctrl.value)" :value="ctrl.value">
                      {{ ctrl.value }}
                    </option>
                    <option
                      v-for="(opt, optIdx) in getFreshOptions(paramName as string, ctrl, true)"
                      :key="`${paramName}-opt-${optIdx}`"
                      :value="opt"
                    >
                      {{ opt }}
                    </option>
                  </select>
                  
                  <!-- 设备选择 -->
                  <select
                    v-else-if="getParamInputType(ctrl, paramName as string, true) === 'device-select'"
                    :value="ctrl.value"
                    class="form-select"
                    @change="(e) => handleParamChange(paramName as string, (e.target as HTMLSelectElement).value, true)"
                  >
                    <option value="" disabled>{{ getDevicePlaceholder(ctrl.type || '') }}</option>
                    <option v-if="ctrl.value" :value="ctrl.value">{{ ctrl.value }}</option>
                  </select>
                  
                  <!-- 节点引用 -->
                  <select
                    v-else-if="getParamInputType(ctrl, paramName as string, true) === 'node-reference'"
                    :value="ctrl.value"
                    class="form-select"
                    @change="(e) => handleParamChange(paramName as string, (e.target as HTMLSelectElement).value, true)"
                  >
                    <option value="" disabled>选择节点...</option>
                    <option
                      v-for="opt in nodeReferenceOptions"
                      :key="opt.value"
                      :value="opt.value"
                    >
                      {{ opt.label }}
                    </option>
                  </select>
                  
                  <!-- 数字输入 -->
                  <input
                    v-else-if="getParamInputType(ctrl, paramName as string, true) === 'number'"
                    type="number"
                    :value="ctrl.value"
                    class="form-input"
                    @input="(e) => handleParamChange(paramName as string, Number((e.target as HTMLInputElement).value) || 0, true)"
                  />
                  
                  <!-- 布尔开关 -->
                  <button
                    v-else-if="getParamInputType(ctrl, paramName as string, true) === 'boolean'"
                    class="toggle-btn"
                    :class="{ active: !!ctrl.value }"
                    @click="handleParamChange(paramName as string, !ctrl.value, true)"
                  >
                    <span class="toggle-track">
                      <span class="toggle-thumb" />
                    </span>
                  </button>
                  
                  <!-- 多行文本 -->
                  <textarea
                    v-else-if="getParamInputType(ctrl, paramName as string, true) === 'textarea'"
                    :value="ctrl.value as string"
                    class="form-textarea"
                    rows="3"
                    @input="(e) => handleParamChange(paramName as string, (e.target as HTMLTextAreaElement).value, true)"
                  />
                  
                  <!-- 文本输入 -->
                  <input
                    v-else
                    type="text"
                    :value="ctrl.value"
                    class="form-input"
                    @input="(e) => handleParamChange(paramName as string, (e.target as HTMLInputElement).value, true)"
                  />
                </div>
              </div>
            </div>
          </div>
        </template>
        
        <!-- 运行时参数 -->
        <template v-if="hasCtrls">
          <div class="params-section">
            <h4 class="section-title">
              <Icon icon="mdi:tune-variant" />
              运行时参数
            </h4>
            <div class="params-list">
              <div
                v-for="(ctrl, paramName) in nodeData?.ctrls"
                :key="paramName"
                class="param-item"
              >
                <div class="param-header">
                  <label class="param-name">{{ paramName }}</label>
                  <Icon
                    v-if="getParamDescription(ctrl)"
                    icon="mdi:information-outline"
                    class="param-info-icon"
                    :title="getParamDescription(ctrl)"
                  />
                </div>
                
                <!-- 参数输入 -->
                <div class="param-input">
                  <!-- 下拉选择（有 options） -->
                  <select
                    v-if="getParamInputType(ctrl, paramName as string, false) === 'select'"
                    :value="ctrl.value"
                    class="form-select"
                    @change="(e) => handleParamChange(paramName as string, (e.target as HTMLSelectElement).value)"
                  >
                    <option v-if="ctrl.value != null && !getFreshOptions(paramName as string, ctrl, false).includes(ctrl.value)" :value="ctrl.value">
                      {{ ctrl.value }}
                    </option>
                    <option
                      v-for="(opt, optIdx) in getFreshOptions(paramName as string, ctrl, false)"
                      :key="`${paramName}-opt-${optIdx}`"
                      :value="opt"
                    >
                      {{ opt }}
                    </option>
                  </select>
                  
                  <!-- 设备选择 -->
                  <select
                    v-else-if="getParamInputType(ctrl, paramName as string, false) === 'device-select'"
                    :value="ctrl.value"
                    class="form-select"
                    @change="(e) => handleParamChange(paramName as string, (e.target as HTMLSelectElement).value)"
                  >
                    <option value="" disabled>{{ getDevicePlaceholder(ctrl.type || '') }}</option>
                    <option v-if="ctrl.value" :value="ctrl.value">{{ ctrl.value }}</option>
                  </select>
                  
                  <!-- 节点引用 -->
                  <select
                    v-else-if="getParamInputType(ctrl, paramName as string, false) === 'node-reference'"
                    :value="ctrl.value"
                    class="form-select"
                    @change="(e) => handleParamChange(paramName as string, (e.target as HTMLSelectElement).value)"
                  >
                    <option value="" disabled>选择节点...</option>
                    <option
                      v-for="opt in nodeReferenceOptions"
                      :key="opt.value"
                      :value="opt.value"
                    >
                      {{ opt.label }}
                    </option>
                  </select>
                  
                  <!-- 数字输入 -->
                  <input
                    v-else-if="getParamInputType(ctrl, paramName as string, false) === 'number'"
                    type="number"
                    :value="ctrl.value"
                    class="form-input"
                    @input="(e) => handleParamChange(paramName as string, Number((e.target as HTMLInputElement).value) || 0)"
                  />
                  
                  <!-- 布尔开关 -->
                  <button
                    v-else-if="getParamInputType(ctrl, paramName as string, false) === 'boolean'"
                    class="toggle-btn"
                    :class="{ active: !!ctrl.value }"
                    @click="handleParamChange(paramName as string, !ctrl.value)"
                  >
                    <span class="toggle-track">
                      <span class="toggle-thumb" />
                    </span>
                  </button>
                  
                  <!-- 多行文本 -->
                  <textarea
                    v-else-if="getParamInputType(ctrl, paramName as string, false) === 'textarea'"
                    :value="ctrl.value as string"
                    class="form-textarea"
                    rows="3"
                    @input="(e) => handleParamChange(paramName as string, (e.target as HTMLTextAreaElement).value)"
                  />
                  
                  <!-- 文本输入 -->
                  <input
                    v-else
                    type="text"
                    :value="ctrl.value"
                    class="form-input"
                    @input="(e) => handleParamChange(paramName as string, (e.target as HTMLInputElement).value)"
                  />
                </div>
              </div>
            </div>
          </div>
        </template>
        
        <!-- 无参数提示 -->
        <div v-if="!hasCtrls && !hasInitCtrls" class="no-params">
          <Icon icon="mdi:information-outline" />
          <span>此节点没有可配置的参数</span>
        </div>
      </div>
    </div>
    
    <!-- 底部操作 -->
    <div class="panel-footer">
      <button class="action-btn btn-danger" @click="handleDelete">
        <Icon icon="mdi:delete" />
        <span>删除节点</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.node-edit-panel {
  position: absolute;
  right: 16px;
  top: 60px;
  width: 320px;
  max-height: calc(100vh - 200px);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
  display: flex;
  flex-direction: column;
  z-index: 100;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
}

.label-section {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.node-label {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.label-input {
  flex: 1;
  max-width: 180px;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 14px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
}

.label-input:focus {
  outline: none;
  border-color: var(--color-accent-blue);
  box-shadow: 0 0 0 2px rgba(88, 166, 255, 0.15);
}

/* 图标按钮 */
.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.icon-btn:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

.icon-btn.btn-primary {
  background: var(--color-accent-blue);
  color: #fff;
}

.icon-btn.btn-primary:hover {
  background: #4a94e8;
}

.node-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: var(--color-bg-tertiary);
  font-size: 13px;
}

.info-label {
  color: var(--color-text-secondary);
}

.info-value {
  color: var(--color-text-primary);
  font-family: var(--font-mono);
}

.params-scrollbar {
  flex: 1;
  max-height: 400px;
  overflow-y: auto;
}

.params-content {
  padding: 16px;
}

.params-section {
  margin-bottom: 16px;
}

.params-section:last-child {
  margin-bottom: 0;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 12px 0;
}

.params-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.param-item {
  padding: 0;
  margin-bottom: 4px;
}

.param-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.param-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.param-info-icon {
  font-size: 14px;
  color: var(--color-text-muted);
  cursor: help;
}

.param-input {
  width: 100%;
}

/* 表单输入样式 */
.form-input,
.form-select,
.form-textarea {
  width: 100%;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 13px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
  transition: all 0.2s ease;
}

.form-input:focus,
.form-select:focus,
.form-textarea:focus {
  outline: none;
  border-color: var(--color-accent-blue);
  box-shadow: 0 0 0 2px rgba(88, 166, 255, 0.15);
}

.form-textarea {
  resize: vertical;
  min-height: 60px;
}

/* 开关按钮 */
.toggle-btn {
  padding: 0;
  background: none;
  border: none;
  cursor: pointer;
}

.toggle-track {
  display: block;
  width: 40px;
  height: 22px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 11px;
  position: relative;
  transition: all 0.2s ease;
}

.toggle-btn.active .toggle-track {
  background: var(--color-accent-blue);
  border-color: var(--color-accent-blue);
}

.toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

.toggle-btn.active .toggle-thumb {
  transform: translateX(18px);
}

.no-params {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 24px;
  color: var(--color-text-muted);
  font-size: 14px;
  justify-content: center;
}

.panel-footer {
  display: flex;
  justify-content: flex-end;
  padding: 12px 16px;
  border-top: 1px solid var(--color-border);
}

/* 操作按钮 */
.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-btn.btn-danger {
  background: var(--color-danger);
  color: #fff;
}

.action-btn.btn-danger:hover {
  opacity: 0.9;
}

/* 滚动条样式 */
.params-scrollbar::-webkit-scrollbar {
  width: 6px;
}

.params-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.params-scrollbar::-webkit-scrollbar-thumb {
  background: var(--color-scrollbar);
  border-radius: 3px;
}

.params-scrollbar::-webkit-scrollbar-thumb:hover {
  background: var(--color-scrollbar-hover);
}
</style>
