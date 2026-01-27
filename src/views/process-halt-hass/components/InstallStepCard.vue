<script setup lang="ts">
/**
 * 安装步骤卡片组件
 * 编辑单个安装步骤：标题、内容、图片、视频
 */
import { ref } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessageBox } from 'element-plus'

interface InstallationStep {
  id: number
  title: string
  content: string
  images: string[]
  video?: string
}

interface Props {
  step: InstallationStep
  index: number
  canDelete?: boolean
  canMoveUp?: boolean
  canMoveDown?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  canDelete: true,
  canMoveUp: false,
  canMoveDown: false,
})

const emit = defineEmits<{
  update: [step: InstallationStep]
  delete: [id: number]
  moveUp: [index: number]
  moveDown: [index: number]
}>()

// 展开状态
const isExpanded = ref(false)

// 更新步骤
function updateStep(updates: Partial<InstallationStep>) {
  emit('update', { ...props.step, ...updates })
}

// 删除步骤
async function handleDelete() {
  const name = props.step.title || `步骤 ${props.index + 1}`
  try {
    await ElMessageBox.confirm(`确定要删除「${name}」吗？`, '删除确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
    emit('delete', props.step.id)
  } catch {
    // 用户取消
  }
}

// 上传图片
function handleUploadImage() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.multiple = true
  input.onchange = (e) => {
    const files = (e.target as HTMLInputElement).files
    if (files) {
      Array.from(files).forEach((file) => {
        const reader = new FileReader()
        reader.onload = (e) => {
          const result = e.target?.result as string
          const newImages = [...props.step.images, result]
          updateStep({ images: newImages })
        }
        reader.readAsDataURL(file)
      })
    }
  }
  input.click()
}

// 删除图片
function removeImage(index: number) {
  const newImages = [...props.step.images]
  newImages.splice(index, 1)
  updateStep({ images: newImages })
}

// 上传视频
function handleUploadVideo() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'video/*'
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const result = e.target?.result as string
        updateStep({ video: result })
      }
      reader.readAsDataURL(file)
    }
  }
  input.click()
}

// 删除视频
function removeVideo() {
  updateStep({ video: undefined })
}

// 预览图片
function previewImage(url: string) {
  window.open(url, '_blank')
}
</script>

<template>
  <div class="install-step-card" :class="{ expanded: isExpanded }">
    <!-- 头部 -->
    <div class="step-header" @click="isExpanded = !isExpanded">
      <div class="step-info">
        <div class="step-number">{{ index + 1 }}</div>
        <div class="step-preview">
          <img
            v-if="step.images.length > 0"
            :src="step.images[0]"
            alt="预览"
            class="preview-img"
          />
          <Icon v-else icon="mdi:image-outline" class="preview-placeholder" />
        </div>
        <div class="step-title">
          <span v-if="step.title" class="title">{{ step.title }}</span>
          <span v-else class="placeholder">未命名步骤</span>
          <span v-if="step.images.length > 0" class="media-count">
            <Icon icon="mdi:image" />
            {{ step.images.length }}
          </span>
          <span v-if="step.video" class="media-count">
            <Icon icon="mdi:video" />
            1
          </span>
        </div>
      </div>
      <div class="step-actions">
        <!-- 排序按钮 -->
        <button
          v-if="canMoveUp"
          class="action-btn move"
          @click.stop="$emit('moveUp', index)"
          title="上移"
        >
          <Icon icon="mdi:arrow-up" />
        </button>
        <button
          v-if="canMoveDown"
          class="action-btn move"
          @click.stop="$emit('moveDown', index)"
          title="下移"
        >
          <Icon icon="mdi:arrow-down" />
        </button>
        <!-- 删除按钮 -->
        <button
          v-if="canDelete"
          class="action-btn delete"
          @click.stop="handleDelete"
          title="删除"
        >
          <Icon icon="mdi:delete-outline" />
        </button>
        <!-- 展开图标 -->
        <Icon
          :icon="isExpanded ? 'mdi:chevron-up' : 'mdi:chevron-down'"
          class="expand-icon"
        />
      </div>
    </div>

    <!-- 收起时显示内容预览 -->
    <div v-if="!isExpanded && step.content" class="step-content-preview">
      {{ step.content }}
    </div>

    <!-- 展开内容 -->
    <Transition name="expand">
      <div v-show="isExpanded" class="step-content">
        <!-- 步骤标题 -->
        <div class="form-group">
          <label class="form-label">
            <Icon icon="mdi:format-title" />
            步骤标题
          </label>
          <input
            :value="step.title"
            type="text"
            placeholder="请输入步骤标题"
            class="form-input"
            @input="updateStep({ title: ($event.target as HTMLInputElement).value })"
          />
        </div>

        <!-- 步骤说明 -->
        <div class="form-group">
          <label class="form-label">
            <Icon icon="mdi:text" />
            步骤说明
          </label>
          <textarea
            :value="step.content"
            placeholder="请输入步骤说明..."
            class="form-textarea"
            rows="4"
            @input="updateStep({ content: ($event.target as HTMLTextAreaElement).value })"
          />
        </div>

        <!-- 图片管理 -->
        <div class="media-section">
          <div class="section-header">
            <label class="form-label">
              <Icon icon="mdi:image-multiple" />
              步骤图片
            </label>
            <button class="upload-btn" @click="handleUploadImage">
              <Icon icon="mdi:upload" />
              上传图片
            </button>
          </div>

          <div class="image-grid" v-if="step.images.length > 0">
            <div v-for="(img, idx) in step.images" :key="idx" class="image-item">
              <img :src="img" alt="步骤图片" @click="previewImage(img)" />
              <button class="remove-btn" @click="removeImage(idx)">
                <Icon icon="mdi:close" />
              </button>
            </div>
          </div>
          <div v-else class="empty-media">
            <Icon icon="mdi:image-off-outline" />
            <span>暂无图片</span>
          </div>
        </div>

        <!-- 视频管理 -->
        <div class="media-section">
          <div class="section-header">
            <label class="form-label">
              <Icon icon="mdi:video" />
              步骤视频（可选）
            </label>
            <button v-if="!step.video" class="upload-btn" @click="handleUploadVideo">
              <Icon icon="mdi:upload" />
              上传视频
            </button>
            <button v-else class="remove-video-btn" @click="removeVideo">
              <Icon icon="mdi:delete-outline" />
              删除视频
            </button>
          </div>

          <div v-if="step.video" class="video-preview">
            <video :src="step.video" controls />
          </div>
          <div v-else class="empty-media">
            <Icon icon="mdi:video-off-outline" />
            <span>暂无视频</span>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.install-step-card {
  background: var(--color-bg-tertiary);
  border-radius: 10px;
  overflow: hidden;
  transition: all 0.3s ease;
  border: 1px solid transparent;
}

.install-step-card:hover {
  border-color: var(--color-border);
}

.install-step-card.expanded {
  border-color: var(--color-accent-blue);
  box-shadow: 0 4px 12px rgba(88, 166, 255, 0.1);
}

/* 头部 */
.step-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  cursor: pointer;
  transition: background 0.2s ease;
}

.step-header:hover {
  background: var(--color-bg-hover);
}

.step-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.step-number {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: var(--color-accent-blue);
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  color: white;
  flex-shrink: 0;
}

.step-preview {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--color-bg-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.preview-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.preview-placeholder {
  font-size: 20px;
  color: var(--color-text-tertiary);
}

.step-title {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.step-title .title {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.step-title .placeholder {
  font-size: 14px;
  color: var(--color-text-tertiary);
  font-style: italic;
}

.media-count {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: var(--color-bg-secondary);
  border-radius: 4px;
  font-size: 12px;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

/* 操作按钮 */
.step-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 16px;
}

.action-btn:hover {
  transform: scale(1.1);
}

.action-btn.delete:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.action-btn.move:hover {
  background: rgba(88, 166, 255, 0.1);
  color: var(--color-accent-blue);
}

.expand-icon {
  font-size: 20px;
  color: var(--color-text-tertiary);
  transition: transform 0.3s ease;
}

/* 内容预览 */
.step-content-preview {
  padding: 0 16px 14px;
  padding-left: 56px;
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 60px;
  overflow: hidden;
  position: relative;
}

.step-content-preview::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 30px;
  background: linear-gradient(transparent, var(--color-bg-tertiary));
  pointer-events: none;
}

/* 展开内容 */
.step-content {
  padding: 0 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
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
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.form-input,
.form-textarea {
  padding: 12px 14px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 14px;
  color: var(--color-text-primary);
  transition: all 0.2s ease;
  font-family: inherit;
}

.form-input:focus,
.form-textarea:focus {
  outline: none;
  border-color: var(--color-accent-blue);
}

.form-input::placeholder,
.form-textarea::placeholder {
  color: var(--color-text-tertiary);
}

.form-textarea {
  resize: vertical;
  min-height: 100px;
  max-height: 300px;
  line-height: 1.6;
}

/* 媒体区域 */
.media-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.upload-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--color-accent-blue);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.upload-btn:hover {
  background: #4c9aed;
}

.remove-video-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: transparent;
  color: var(--color-accent-red);
  border: 1px solid var(--color-accent-red);
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.remove-video-btn:hover {
  background: rgba(239, 68, 68, 0.1);
}

/* 图片网格 */
.image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 10px;
}

.image-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: 8px;
  overflow: hidden;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
}

.image-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  cursor: pointer;
  transition: transform 0.2s;
}

.image-item img:hover {
  transform: scale(1.05);
}

.image-item .remove-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  border: none;
  border-radius: 50%;
  color: white;
  font-size: 14px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
}

.image-item:hover .remove-btn {
  opacity: 1;
}

.image-item .remove-btn:hover {
  background: #ef4444;
}

/* 视频预览 */
.video-preview {
  border-radius: 8px;
  overflow: hidden;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
}

.video-preview video {
  width: 100%;
  max-height: 200px;
  object-fit: contain;
}

/* 空状态 */
.empty-media {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--color-bg-secondary);
  border: 1px dashed var(--color-border);
  border-radius: 8px;
  color: var(--color-text-tertiary);
  gap: 8px;
}

.empty-media :deep(svg) {
  font-size: 32px;
  opacity: 0.5;
}

.empty-media span {
  font-size: 13px;
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
