<script setup lang="ts">
/**
 * IssueLibrarySaveDialog - 保存条目到缺陷/疑问库弹窗
 *
 * 功能：
 * - 选择一级目录和二级目录
 * - 输入条目名称
 * - 保存到库
 */
import { ref, computed, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessage } from 'element-plus'
import {
  useIssueLibrary,
  type IssueLibraryType,
} from '@/composables/useIssueLibrary'

// ==================== Props & Emits ====================

const props = withDefaults(
  defineProps<{
    visible: boolean
    type: IssueLibraryType // 'defect' | 'question'
    defaultName?: string   // 默认名称（当前描述内容）
  }>(),
  {
    visible: false,
    type: 'defect',
    defaultName: '',
  }
)

const emit = defineEmits<{
  'update:visible': [value: boolean]
  saved: []
}>()

// ==================== Composables ====================

const issueLib = useIssueLibrary()

// ==================== 状态 ====================

// 表单数据
const selectedFirstDirId = ref<number | null>(null)
const selectedSecondDirId = ref<number | null>(null)
const itemName = ref('')

// 加载状态
const isLoadingFirst = ref(false)
const isLoadingSecond = ref(false)

// ==================== 计算属性 ====================

const title = computed(() =>
  props.type === 'defect' ? '保存到缺陷库' : '保存到疑问库'
)

const canSubmit = computed(() =>
  selectedSecondDirId.value !== null && itemName.value.trim().length > 0
)

// ==================== 方法 ====================

/** 加载一级目录 */
async function loadFirstLevelDirs() {
  isLoadingFirst.value = true
  try {
    await issueLib.fetchFirstLevelDirectories(props.type)
  } finally {
    isLoadingFirst.value = false
  }
}

/** 选择一级目录，加载二级目录 */
async function selectFirstDir(id: number) {
  selectedFirstDirId.value = id
  selectedSecondDirId.value = null
  isLoadingSecond.value = true
  try {
    await issueLib.fetchSecondLevelDirectories(props.type, id)
  } finally {
    isLoadingSecond.value = false
  }
}

/** 选择二级目录 */
function selectSecondDir(id: number) {
  selectedSecondDirId.value = id
}

/** 提交保存 */
async function handleSubmit() {
  if (!canSubmit.value) return

  const success = await issueLib.addItem(
    props.type,
    itemName.value.trim(),
    selectedSecondDirId.value!
  )

  if (success) {
    ElMessage.success('保存成功')
    emit('saved')
    close()
  } else {
    ElMessage.error('保存失败，请重试')
  }
}

/** 关闭弹窗 */
function close() {
  emit('update:visible', false)
}

/** 重置表单 */
function resetForm() {
  selectedFirstDirId.value = null
  selectedSecondDirId.value = null
  itemName.value = props.defaultName
  issueLib.firstLevelDirs.value = []
  issueLib.secondLevelDirs.value = []
}

// ==================== 监听 ====================

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      resetForm()
      loadFirstLevelDirs()
    }
  }
)

watch(
  () => props.defaultName,
  (name) => {
    if (props.visible) {
      itemName.value = name
    }
  }
)
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="visible" class="save-overlay" @click.self="close">
        <div class="save-card">
          <!-- 头部 -->
          <div class="save-header">
            <div class="header-title">
              <Icon :icon="type === 'defect' ? 'mdi:content-save' : 'mdi:content-save'" class="title-icon" />
              <span>{{ title }}</span>
            </div>
            <button class="close-btn" @click="close">
              <Icon icon="mdi:close" />
            </button>
          </div>

          <!-- 表单内容 -->
          <div class="save-body">
            <!-- 一级目录选择 -->
            <div class="form-group">
              <label class="form-label">
                <Icon icon="mdi:folder" />
                一级目录
              </label>
              <div class="dir-selector">
                <div v-if="isLoadingFirst" class="loading-inline">
                  <Icon icon="mdi:loading" class="spin" />
                  <span>加载中...</span>
                </div>
                <div v-else-if="issueLib.firstLevelDirs.value.length === 0" class="empty-hint">
                  暂无可用目录
                </div>
                <div v-else class="dir-list">
                  <button
                    v-for="dir in issueLib.firstLevelDirs.value"
                    :key="dir.id"
                    class="dir-chip"
                    :class="{ active: selectedFirstDirId === dir.id }"
                    @click="selectFirstDir(dir.id)"
                  >
                    {{ dir.name }}
                  </button>
                </div>
              </div>
            </div>

            <!-- 二级目录选择 -->
            <div class="form-group">
              <label class="form-label">
                <Icon icon="mdi:folder-open" />
                二级目录
              </label>
              <div class="dir-selector">
                <div v-if="!selectedFirstDirId" class="empty-hint">
                  请先选择一级目录
                </div>
                <div v-else-if="isLoadingSecond" class="loading-inline">
                  <Icon icon="mdi:loading" class="spin" />
                  <span>加载中...</span>
                </div>
                <div v-else-if="issueLib.secondLevelDirs.value.length === 0" class="empty-hint">
                  该一级目录下暂无二级目录
                </div>
                <div v-else class="dir-list">
                  <button
                    v-for="dir in issueLib.secondLevelDirs.value"
                    :key="dir.id"
                    class="dir-chip"
                    :class="{ active: selectedSecondDirId === dir.id }"
                    @click="selectSecondDir(dir.id)"
                  >
                    {{ dir.name }}
                  </button>
                </div>
              </div>
            </div>

            <!-- 条目名称 -->
            <div class="form-group">
              <label class="form-label">
                <Icon icon="mdi:tag" />
                条目名称
              </label>
              <input
                v-model="itemName"
                type="text"
                class="name-input"
                placeholder="请输入条目名称..."
                maxlength="100"
              />
            </div>
          </div>

          <!-- 底部按钮 -->
          <div class="save-footer">
            <button class="btn-cancel" @click="close">取消</button>
            <button
              class="btn-submit"
              :disabled="!canSubmit || issueLib.isSaving.value"
              @click="handleSubmit"
            >
              <Icon v-if="issueLib.isSaving.value" icon="mdi:loading" class="spin" />
              <Icon v-else icon="mdi:check" />
              <span>{{ issueLib.isSaving.value ? '保存中...' : '保存' }}</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* 遮罩层 */
.save-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
}

/* 弹窗卡片 */
.save-card {
  display: flex;
  flex-direction: column;
  width: 480px;
  max-width: 90vw;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}

/* 头部 */
.save-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.875rem 1rem;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1rem;
  font-weight: 600;
}

.title-icon {
  font-size: 1.25rem;
  color: rgb(34, 197, 94);
}

.close-btn {
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 0.375rem;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 1.25rem;
  transition: all 0.2s;
}

.close-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

/* 表单主体 */
.save-body {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-label {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.form-label svg {
  font-size: 1rem;
}

/* 目录选择器 */
.dir-selector {
  min-height: 2.5rem;
}

.dir-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.dir-chip {
  padding: 0.375rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 1rem;
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  font-size: 0.8125rem;
  cursor: pointer;
  transition: all 0.15s;
}

.dir-chip:hover {
  background: var(--color-bg-hover);
  border-color: rgb(96, 165, 250);
}

.dir-chip.active {
  background: rgba(96, 165, 250, 0.15);
  border-color: rgb(96, 165, 250);
  color: rgb(96, 165, 250);
}

.loading-inline {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.empty-hint {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  padding: 0.25rem 0;
}

/* 名称输入框 */
.name-input {
  width: 100%;
  padding: 0.625rem 0.875rem;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  font-size: 0.875rem;
  transition: border-color 0.2s;
}

.name-input:focus {
  outline: none;
  border-color: rgb(96, 165, 250);
}

.name-input::placeholder {
  color: var(--color-text-secondary);
}

/* 底部按钮 */
.save-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
}

.btn-cancel,
.btn-submit {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel {
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-primary);
}

.btn-cancel:hover {
  background: var(--color-bg-hover);
}

.btn-submit {
  border: none;
  background: rgb(34, 197, 94);
  color: white;
}

.btn-submit:hover:not(:disabled) {
  background: rgb(22, 163, 74);
}

.btn-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 动画 */
.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 弹窗动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-active .save-card {
  animation: slideUp 0.2s ease;
}

.fade-leave-active .save-card {
  animation: slideDown 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes slideDown {
  from {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  to {
    opacity: 0;
    transform: translateY(10px) scale(0.98);
  }
}
</style>
