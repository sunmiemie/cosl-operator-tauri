<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessageBox } from 'element-plus'

interface ProcessPic {
  id: number
  url: string
  name: string
  desc: string
  save: string[]
}

interface Props {
  pic: ProcessPic
  oriUrl?: string
  deviceType?: 'micro' | 'plane' | 'xray'  // 摄像头设备类型
  // 回调函数 props（不能以 on 开头，Vue 会当作事件处理）
  cameraHandler?: (picId: number) => void
  multiPhotoHandler?: (picId: number) => void
  editImageHandler?: (picId: number) => void
}

const props = withDefaults(defineProps<Props>(), {
  deviceType: 'micro'
})

// 定义 emit 事件（同时支持 emit 和 props 回调两种方式）
const emit = defineEmits<{
  (e: 'delete', id: number): void
  (e: 'open-camera', picId: number): void
  (e: 'open-multi-photo', picId: number): void
  (e: 'edit-image', picId: number): void
}>()

// 编辑状态
const isExpanded = ref(false)

// 显示拍照选项下拉菜单
const showPhotoMenu = ref(false)

// 点击外部关闭下拉菜单
function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest('.photo-dropdown')) {
    showPhotoMenu.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

// 直接使用 computed 进行双向绑定（因为 pic 是响应式的父对象）
const picName = computed({
  get: () => props.pic.name,
  set: (value: string) => { props.pic.name = value }
})

const picDesc = computed({
  get: () => props.pic.desc,
  set: (value: string) => { props.pic.desc = value }
})

// 上传图片
function handleUpload() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const result = e.target?.result as string
        props.pic.url = result
      }
      reader.readAsDataURL(file)
    }
  }
  input.click()
}

// 删除（需确认）
async function handleDelete() {
  const name = props.pic.name || `留存项 ${props.pic.id}`
  try {
    await ElMessageBox.confirm(
      `确定要删除「${name}」吗？`,
      '删除确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )
    emit('delete', props.pic.id)
  } catch {
    // 用户取消
  }
}

// 拍摄单张照片（优先使用 props 回调，否则使用 emit）
function handleTakeSingle() {
  console.log('PicEditor: handleTakeSingle 被点击, picId:', props.pic.id)
  showPhotoMenu.value = false
  if (props.cameraHandler) {
    props.cameraHandler(props.pic.id)
  } else {
    emit('open-camera', props.pic.id)
  }
}

// 多图拼接（优先使用 props 回调，否则使用 emit）
function handleTakeMulti() {
  console.log('PicEditor: handleTakeMulti 被点击, picId:', props.pic.id)
  showPhotoMenu.value = false
  if (props.multiPhotoHandler) {
    props.multiPhotoHandler(props.pic.id)
  } else {
    emit('open-multi-photo', props.pic.id)
  }
}

// 编辑图片（优先使用 props 回调，否则使用 emit）
function handleEditImage() {
  console.log('PicEditor: handleEditImage 被点击, picId:', props.pic.id)
  if (props.pic.url) {
    if (props.editImageHandler) {
      props.editImageHandler(props.pic.id)
    } else {
      emit('edit-image', props.pic.id)
    }
  }
}
</script>

<template>
  <div class="pic-editor" :class="{ expanded: isExpanded }">
    <!-- 头部 -->
    <div class="pic-header" @click="isExpanded = !isExpanded">
      <div class="pic-info">
        <div class="pic-number">{{ pic.id }}</div>
        <div class="pic-preview">
          <img 
            v-if="pic.url" 
            :src="pic.url" 
            alt="预览"
            class="preview-img"
          />
          <Icon v-else icon="mdi:image-outline" class="preview-placeholder" />
        </div>
        <div class="pic-title">
          <span v-if="pic.name" class="name">{{ pic.name }}</span>
          <span v-else class="placeholder">未命名留存项</span>
        </div>
      </div>
      <div class="pic-actions">
        <button 
          class="action-btn delete" 
          @click.stop="handleDelete"
          title="删除"
        >
          <Icon icon="mdi:delete-outline" />
        </button>
        <Icon 
          :icon="isExpanded ? 'mdi:chevron-up' : 'mdi:chevron-down'" 
          class="expand-icon"
        />
      </div>
    </div>

    <!-- 展开内容 -->
    <Transition name="expand">
      <div v-show="isExpanded" class="pic-content">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">
              <Icon icon="mdi:format-title" />
              留存项名称
            </label>
            <input 
              v-model="picName"
              type="text"
              placeholder="请输入留存项名称"
              class="form-input"
            />
          </div>
          
          <div class="form-group">
            <label class="form-label">
              <Icon icon="mdi:text" />
              留存区域标记
            </label>
            <textarea
              v-model="picDesc"
              placeholder="请输入留存区域标记描述"
              class="form-textarea"
              rows="3"
            />
          </div>
        </div>

        <!-- 图片设置 -->
        <div class="image-section">
          <div class="image-section-header">
            <label class="form-label">
              <Icon icon="mdi:image-area" />
              留存区域标记
            </label>
            <!-- 操作按钮组 -->
            <div class="image-actions">
              <!-- 拍照下拉菜单 -->
              <div class="photo-dropdown">
                <button 
                  class="photo-btn"
                  @click.stop="showPhotoMenu = !showPhotoMenu"
                >
                  <Icon icon="mdi:camera" />
                  拍照
                  <Icon icon="mdi:chevron-down" class="dropdown-arrow" />
                </button>
                <Transition name="dropdown">
                  <div v-show="showPhotoMenu" class="dropdown-menu" @click.stop>
                    <button class="dropdown-item" @click="handleTakeSingle">
                      <Icon icon="mdi:image" />
                      拍摄单张
                    </button>
                    <button class="dropdown-item" @click="handleTakeMulti">
                      <Icon icon="mdi:image-multiple" />
                      多张拼图
                    </button>
                  </div>
                </Transition>
              </div>
              
              <!-- 编辑按钮 -->
              <button 
                v-if="pic.url"
                class="edit-btn"
                @click="handleEditImage"
                title="编辑标注"
              >
                <Icon icon="mdi:pencil" />
                编辑
              </button>
              
              <!-- 上传按钮 -->
              <button 
                class="upload-btn"
                @click="handleUpload"
                title="上传图片"
              >
                <Icon icon="mdi:upload" />
                上传
              </button>
            </div>
          </div>
          
          <!-- 图片预览区域 -->
          <div class="image-preview-area">
            <template v-if="pic.url">
              <img :src="pic.url" alt="留存区域" class="preview-image" />
            </template>
            <template v-else>
              <div class="empty-placeholder">
                <Icon icon="mdi:image-off-outline" />
                <span>暂无图片</span>
                <span class="hint">点击上方按钮拍照或上传</span>
              </div>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.pic-editor {
  background: var(--color-bg-tertiary);
  border-radius: 10px;
  overflow: hidden;
  transition: all 0.3s ease;
  border: 1px solid transparent;
}

.pic-editor:hover {
  border-color: var(--color-border);
}

.pic-editor.expanded {
  border-color: var(--color-accent-purple);
  box-shadow: 0 4px 12px rgba(168, 85, 247, 0.1);
}

.pic-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  cursor: pointer;
  transition: background 0.2s ease;
}

.pic-header:hover {
  background: var(--color-bg-hover);
}

.pic-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.pic-number {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: var(--color-accent-purple);
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  color: white;
}

.pic-preview {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--color-bg-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
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

.pic-title .name {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.pic-title .placeholder {
  font-size: 14px;
  color: var(--color-text-tertiary);
  font-style: italic;
}

.pic-actions {
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

.expand-icon {
  font-size: 20px;
  color: var(--color-text-tertiary);
  transition: transform 0.3s ease;
}

.pic-content {
  padding: 0 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
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
  border-color: var(--color-accent-purple);
}

.form-input::placeholder,
.form-textarea::placeholder {
  color: var(--color-text-tertiary);
}

.form-textarea {
  resize: vertical;
  min-height: 80px;
  max-height: 200px;
  line-height: 1.6;
}

.image-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.image-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.image-actions {
  display: flex;
  gap: 8px;
}

/* 拍照下拉菜单 */
.photo-dropdown {
  position: relative;
}

.photo-btn {
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

.photo-btn:hover {
  background: #4c9aed;
}

.dropdown-arrow {
  font-size: 14px;
  transition: transform 0.2s;
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  min-width: 140px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  z-index: 100;
  overflow: hidden;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 14px;
  background: transparent;
  border: none;
  color: var(--color-text-primary);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s;
  text-align: left;
}

.dropdown-item:hover {
  background: var(--color-bg-hover);
}

.dropdown-item :deep(svg) {
  color: var(--color-text-secondary);
}

/* 编辑和上传按钮 */
.edit-btn,
.upload-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.edit-btn:hover {
  background: rgba(168, 85, 247, 0.1);
  border-color: var(--color-accent-purple);
  color: var(--color-accent-purple);
}

.upload-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

/* 图片预览区域 */
.image-preview-area {
  min-height: 120px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-image {
  width: 100%;
  max-height: 180px;
  object-fit: contain;
}

.empty-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px;
  color: var(--color-text-tertiary);
}

.empty-placeholder :deep(svg) {
  font-size: 36px;
  opacity: 0.5;
}

.empty-placeholder span {
  font-size: 14px;
}

.empty-placeholder .hint {
  font-size: 12px;
  opacity: 0.7;
}

/* 下拉菜单动画 */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.2s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-8px);
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

.expand-enter-to,
.expand-leave-from {
  opacity: 1;
  transform: translateY(0);
}
</style>
