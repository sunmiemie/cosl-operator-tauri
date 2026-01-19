<script setup lang="ts">
import { ref, computed } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessageBox, ElMessage } from 'element-plus'
import StepEditor from './StepEditor.vue'
import PicEditor from './PicEditor.vue'
import QuickStepSelector from './QuickStepSelector.vue'
import CameraDialog from './CameraDialog.vue'
import MultiPhotoDialog from './MultiPhotoDialog.vue'
import ImgEditor from './ImgEditor.vue'

// 类型定义
interface ProcessStep {
  id: number
  name: string
  desc: string
  pass: number
}

interface ProcessPic {
  id: number
  name: string
  url: string
  desc: string
  save: string[]
}

interface DetailPoint {
  id: number
  name: string
  url: string
  step: ProcessStep[]
  pic: ProcessPic[]
}

// Props
const props = withDefaults(defineProps<{
  detail: DetailPoint
  oriUrl: string  // 区域原图，用于"使用原图"功能
  deviceType?: 'micro' | 'plane' | 'xray'
}>(), {
  deviceType: 'micro'
})

// Emits
const emit = defineEmits<{
  (e: 'delete', id: number): void
  (e: 'open-camera', target: { type: 'detail'; detailId: number }): void
}>()

// 编辑弹窗状态
const editDialogVisible = ref(false)
const showQuickSelector = ref(false)

// 摄像头和图片编辑相关状态
const showCameraDialog = ref(false)
const showMultiPhotoDialog = ref(false)
const showImgEditor = ref(false)
const currentEditTarget = ref<'detail' | 'pic'>('detail')
const currentEditPicId = ref<number>(0)
const currentEditImageUrl = ref<string>('')

// 本地数据绑定
const localName = computed({
  get: () => props.detail.name,
  set: (value) => {
    props.detail.name = value
  }
})

const localUrl = computed({
  get: () => props.detail.url,
  set: (value) => {
    props.detail.url = value
  }
})

// 删除点位
async function handleDelete() {
  try {
    await ElMessageBox.confirm(
      '该操作会导致该点位被永久移除，确定删除吗？',
      '删除确认',
      {
        type: 'warning',
        confirmButtonText: '确定',
        cancelButtonText: '取消',
      }
    )
    emit('delete', props.detail.id)
  } catch {
    // 用户取消
  }
}

// 上传图片
function handleUploadImage() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (e) => {
        localUrl.value = e.target?.result as string
      }
      reader.readAsDataURL(file)
    }
  }
  input.click()
}

// 拍照
function handleTakePhoto() {
  emit('open-camera', { type: 'detail', detailId: props.detail.id })
}

// 使用原图
function handleUseOriginal() {
  if (props.oriUrl) {
    localUrl.value = props.oriUrl
    ElMessage.success('已使用区域原图')
  } else {
    ElMessage.warning('没有可用的原图')
  }
}

// ===== 检测项管理 =====
function addStep() {
  const newId = props.detail.step.length + 1
  props.detail.step.push({
    id: newId,
    name: '',
    desc: '',
    pass: 0
  })
}

function addQuickStep(step: { name: string; desc: string }) {
  const newId = props.detail.step.length + 1
  props.detail.step.push({
    id: newId,
    name: step.name,
    desc: step.desc,
    pass: 0
  })
}

function deleteStep(id: number) {
  const index = props.detail.step.findIndex(s => s.id === id)
  if (index !== -1) {
    props.detail.step.splice(index, 1)
    // 重新编号
    props.detail.step.forEach((s, i) => {
      s.id = i + 1
    })
  }
}

// ===== 留存项管理 =====
function addPic() {
  const newId = props.detail.pic.length + 1
  props.detail.pic.push({
    id: newId,
    name: '',
    url: '',
    desc: '',
    save: []
  })
}

function deletePic(id: number) {
  const index = props.detail.pic.findIndex(p => p.id === id)
  if (index !== -1) {
    props.detail.pic.splice(index, 1)
    // 重新编号
    props.detail.pic.forEach((p, i) => {
      p.id = i + 1
    })
  }
}

// 处理快捷选择结果
function handleQuickSelect(item: { name: string; desc: string }) {
  addQuickStep(item)
  showQuickSelector.value = false
}

// ===== 摄像头和图片编辑相关 =====

// 打开单张拍照（用于留存项）
function handleOpenPicCamera(picId: number) {
  currentEditTarget.value = 'pic'
  currentEditPicId.value = picId
  showCameraDialog.value = true
}

// 打开多图拼接（用于留存项）
function handleOpenPicMultiPhoto(picId: number) {
  currentEditTarget.value = 'pic'
  currentEditPicId.value = picId
  showMultiPhotoDialog.value = true
}

// 打开图片编辑器（用于留存项）
function handleEditPicImage(picId: number) {
  const pic = props.detail.pic.find(p => p.id === picId)
  if (pic && pic.url) {
    currentEditTarget.value = 'pic'
    currentEditPicId.value = picId
    currentEditImageUrl.value = pic.url
    showImgEditor.value = true
  }
}

// 打开单张拍照（用于点位指示图）
function handleOpenDetailCamera() {
  currentEditTarget.value = 'detail'
  showCameraDialog.value = true
}

// 打开多图拼接（用于点位指示图）
function handleOpenDetailMultiPhoto() {
  currentEditTarget.value = 'detail'
  showMultiPhotoDialog.value = true
}

// 打开图片编辑器（用于点位指示图）
function handleEditDetailImage() {
  if (localUrl.value) {
    currentEditTarget.value = 'detail'
    currentEditImageUrl.value = localUrl.value
    showImgEditor.value = true
  }
}

// 处理单张拍照结果
function handlePhotoTaken(dataUrl: string) {
  if (currentEditTarget.value === 'detail') {
    localUrl.value = dataUrl
  } else {
    const pic = props.detail.pic.find(p => p.id === currentEditPicId.value)
    if (pic) {
      pic.url = dataUrl
    }
  }
  showCameraDialog.value = false
  ElMessage.success('照片已保存')
}

// 处理多图拼接结果
function handleMultiPhotoUse(dataUrl: string) {
  if (currentEditTarget.value === 'detail') {
    localUrl.value = dataUrl
  } else {
    const pic = props.detail.pic.find(p => p.id === currentEditPicId.value)
    if (pic) {
      pic.url = dataUrl
    }
  }
  showMultiPhotoDialog.value = false
  ElMessage.success('拼接图片已保存')
}

// 处理图片编辑结果
function handleImageEditorSave(dataUrl: string) {
  if (currentEditTarget.value === 'detail') {
    localUrl.value = dataUrl
  } else {
    const pic = props.detail.pic.find(p => p.id === currentEditPicId.value)
    if (pic) {
      pic.url = dataUrl
    }
  }
  showImgEditor.value = false
  ElMessage.success('编辑已保存')
}
</script>

<template>
  <div class="detail-editor">
    <!-- 点位卡片 -->
    <div class="detail-card">
      <!-- 卡片头部 -->
      <div class="card-header">
        <div class="point-badge">{{ detail.id }}</div>
        <input 
          v-model="localName"
          class="point-name-input"
          placeholder="点位名称"
        />
        <div class="card-actions">
          <button 
            class="action-btn edit-btn"
            title="编辑点位"
            @click="editDialogVisible = true"
          >
            <Icon icon="mdi:pencil" />
          </button>
          <button 
            class="action-btn delete-btn"
            title="删除点位"
            @click="handleDelete"
          >
            <Icon icon="mdi:delete-outline" />
          </button>
        </div>
      </div>

      <!-- 点位图片预览 -->
      <div class="card-body">
        <div class="image-preview" @click="editDialogVisible = true">
          <img v-if="localUrl" :src="localUrl" alt="点位指示图" />
          <div v-else class="image-placeholder">
            <Icon icon="mdi:image-outline" />
            <span>点击编辑</span>
          </div>
        </div>
        
        <!-- 快捷操作 -->
        <div class="quick-actions">
          <button class="quick-btn" @click="handleUploadImage" title="上传图片">
            <Icon icon="mdi:upload" />
          </button>
          <button class="quick-btn" @click="handleTakePhoto" title="拍照">
            <Icon icon="mdi:camera" />
          </button>
          <button class="quick-btn" @click="handleUseOriginal" title="使用原图">
            <Icon icon="mdi:image-sync-outline" />
          </button>
        </div>

        <!-- 统计信息 -->
        <div class="point-stats">
          <span class="stat-item">
            <Icon icon="mdi:format-list-checks" />
            {{ detail.step?.length || 0 }} 检测项
          </span>
          <span class="stat-item">
            <Icon icon="mdi:image-multiple" />
            {{ detail.pic?.length || 0 }} 留存项
          </span>
        </div>
      </div>
    </div>

    <!-- 编辑弹窗 -->
    <Teleport to="body">
      <Transition name="dialog-fade">
        <div v-if="editDialogVisible" class="dialog-overlay" @click.self="editDialogVisible = false">
          <div class="edit-dialog">
            <!-- 弹窗头部 -->
            <div class="dialog-header">
              <div class="header-title">
                <Icon icon="mdi:map-marker-outline" class="header-icon" />
                <span>编辑点位: {{ localName || `点位 ${detail.id}` }}</span>
              </div>
              <button class="close-btn" @click="editDialogVisible = false">
                <Icon icon="mdi:close" />
              </button>
            </div>

            <!-- 弹窗内容 -->
            <div class="dialog-content">
              <!-- 左侧：图片和基本信息 -->
              <div class="left-panel">
                <div class="info-section">
                  <label class="section-label">点位名称</label>
                  <input 
                    v-model="localName"
                    class="name-input"
                    placeholder="请输入点位名称"
                  />
                </div>

                <div class="image-section">
                  <label class="section-label">点位指示图</label>
                  <div class="image-container">
                    <img v-if="localUrl" :src="localUrl" alt="点位指示图" />
                    <div v-else class="no-image">
                      <Icon icon="mdi:image-outline" />
                      <span>请设置指示图</span>
                    </div>
                  </div>
                  <div class="image-actions">
                    <button class="action-btn" @click="handleUploadImage">
                      <Icon icon="mdi:upload" />
                      上传
                    </button>
                    <!-- 拍照下拉菜单 -->
                    <div class="photo-dropdown-wrapper">
                      <button class="action-btn photo-dropdown-btn" @click="handleOpenDetailCamera">
                        <Icon icon="mdi:camera" />
                        单张
                      </button>
                      <button class="action-btn photo-dropdown-btn" @click="handleOpenDetailMultiPhoto">
                        <Icon icon="mdi:image-multiple" />
                        拼图
                      </button>
                    </div>
                    <button v-if="localUrl" class="action-btn" @click="handleEditDetailImage">
                      <Icon icon="mdi:pencil" />
                      编辑
                    </button>
                    <button class="action-btn" @click="handleUseOriginal">
                      <Icon icon="mdi:image-sync-outline" />
                      原图
                    </button>
                  </div>
                </div>
              </div>

              <!-- 右侧：检测项和留存项 -->
              <div class="right-panel">
                <!-- 检测项 -->
                <div class="items-section">
                  <div class="section-header">
                    <div class="header-left">
                      <Icon icon="mdi:format-list-checks" class="section-icon" />
                      <span>检测项设置</span>
                    </div>
                    <div class="header-right">
                      <button class="add-btn secondary" @click="showQuickSelector = true">
                        <Icon icon="mdi:lightning-bolt" />
                        快捷新增
                      </button>
                      <button class="add-btn" @click="addStep">
                        <Icon icon="mdi:plus" />
                        新增
                      </button>
                    </div>
                  </div>
                  <div class="items-list">
                    <template v-if="detail.step && detail.step.length > 0">
                      <StepEditor 
                        v-for="step in detail.step" 
                        :key="step.id"
                        :step="step"
                        @delete="deleteStep"
                      />
                    </template>
                    <div v-else class="empty-items">
                      <Icon icon="mdi:playlist-plus" />
                      <span>暂无检测项，点击上方按钮添加</span>
                    </div>
                  </div>
                </div>

                <!-- 留存项 -->
                <div class="items-section">
                  <div class="section-header">
                    <div class="header-left">
                      <Icon icon="mdi:image-multiple" class="section-icon" />
                      <span>留存项设置</span>
                    </div>
                    <button class="add-btn" @click="addPic">
                      <Icon icon="mdi:plus" />
                      新增
                    </button>
                  </div>
                  <div class="items-list">
                    <template v-if="detail.pic && detail.pic.length > 0">
                      <PicEditor 
                        v-for="pic in detail.pic" 
                        :key="pic.id"
                        :pic="pic"
                        :ori-url="localUrl"
                        :device-type="deviceType"
                        @delete="deletePic"
                        @open-camera="handleOpenPicCamera"
                        @open-multi-photo="handleOpenPicMultiPhoto"
                        @edit-image="handleEditPicImage"
                      />
                    </template>
                    <div v-else class="empty-items">
                      <Icon icon="mdi:image-plus" />
                      <span>暂无留存项，点击上方按钮添加</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 弹窗底部 -->
            <div class="dialog-footer">
              <button class="confirm-btn" @click="editDialogVisible = false">
                <Icon icon="mdi:check" />
                完成编辑
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 快捷选择弹窗 -->
    <QuickStepSelector 
      v-model:visible="showQuickSelector"
      @select="handleQuickSelect"
    />

    <!-- 单张拍照对话框 -->
    <CameraDialog
      v-model:visible="showCameraDialog"
      :device-type="deviceType"
      @photo-taken="handlePhotoTaken"
    />

    <!-- 多图拼接对话框 -->
    <MultiPhotoDialog
      v-model:visible="showMultiPhotoDialog"
      :device-type="deviceType"
      @use="handleMultiPhotoUse"
    />

    <!-- 图片编辑器对话框 -->
    <Teleport to="body">
      <Transition name="dialog-fade">
        <div v-if="showImgEditor" class="img-editor-overlay">
          <div class="img-editor-container">
            <div class="img-editor-header">
              <span>图片编辑</span>
              <button class="close-btn" @click="showImgEditor = false">
                <Icon icon="mdi:close" />
              </button>
            </div>
            <ImgEditor
              :img-url="currentEditImageUrl"
              @save="handleImageEditorSave"
            />
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.detail-editor {
  /* 卡片容器 */
}

/* ===== 点位卡片 ===== */
.detail-card {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.2s ease;
}

.detail-card:hover {
  border-color: var(--color-accent-blue);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  background: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);
}

.point-badge {
  min-width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-accent-blue);
  color: white;
  font-size: 12px;
  font-weight: 600;
  border-radius: 6px;
}

.point-name-input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  font-size: 13px;
}

.point-name-input:focus {
  outline: none;
  border-color: var(--color-accent-blue);
}

.card-actions {
  display: flex;
  gap: 4px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px;
  border: none;
  border-radius: 6px;
  background: var(--color-bg-hover);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 13px;
}

.action-btn:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

.edit-btn:hover {
  color: var(--color-accent-blue);
}

.delete-btn:hover {
  color: var(--color-accent-red);
}

.card-body {
  padding: 12px;
}

.image-preview {
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 8px;
  overflow: hidden;
  background: var(--color-bg-tertiary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.image-preview:hover {
  opacity: 0.9;
}

.image-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--color-text-tertiary);
}

.image-placeholder .iconify {
  font-size: 32px;
}

.quick-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.quick-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg-primary);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.quick-btn:hover {
  border-color: var(--color-accent-blue);
  color: var(--color-accent-blue);
}

.point-stats {
  display: flex;
  gap: 16px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--color-border);
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--color-text-tertiary);
}

/* ===== 编辑弹窗 ===== */
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 40px;
}

.edit-dialog {
  width: 100%;
  max-width: 80%;
  max-height: calc(100vh - 80px);
  background: var(--color-bg-primary);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
  border-radius: 16px 16px 0 0;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.header-icon {
  font-size: 20px;
  color: var(--color-accent-blue);
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.dialog-content {
  flex: 1;
  display: flex;
  gap: 20px;
  padding: 20px;
  overflow: hidden;
}

/* 左侧面板 */
.left-panel {
  width: 300px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.info-section,
.image-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.name-input {
  padding: 10px 14px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  font-size: 14px;
}

.name-input:focus {
  outline: none;
  border-color: var(--color-accent-blue);
}

.image-container {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 10px;
  overflow: hidden;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
}

.image-container img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.no-image {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--color-text-tertiary);
}

.no-image .iconify {
  font-size: 48px;
}

.image-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.image-actions .action-btn {
  width: 100%;
  justify-content: flex-start;
  padding: 10px 14px;
}

/* 右侧面板 */
.right-panel {
  flex: 1;
  display: flex;
  gap: 20px;
  overflow: hidden;
}

.items-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--color-bg-secondary);
  border-radius: 12px;
  border: 1px solid var(--color-border);
  overflow: hidden;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.section-icon {
  font-size: 18px;
  color: var(--color-accent-blue);
}

.header-right {
  display: flex;
  gap: 8px;
}

.add-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: none;
  border-radius: 6px;
  background: var(--color-accent-blue);
  color: white;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.add-btn:hover {
  background: #4c9aed;
}

.add-btn.secondary {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.add-btn.secondary:hover {
  background: var(--color-border);
}

.items-list {
  flex: 1;
  padding: 12px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.empty-items {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px;
  color: var(--color-text-tertiary);
  text-align: center;
}

.empty-items .iconify {
  font-size: 32px;
}

/* 弹窗底部 */
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  padding: 16px 20px;
  background: var(--color-bg-secondary);
  border-top: 1px solid var(--color-border);
  border-radius: 0 0 16px 16px;
}

.confirm-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  background: var(--color-accent-blue);
  color: white;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.confirm-btn:hover {
  background: #4c9aed;
}

/* ===== 弹窗动画 ===== */
.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: all 0.3s ease;
}

.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
}

.dialog-fade-enter-from .edit-dialog,
.dialog-fade-leave-to .edit-dialog {
  transform: scale(0.95);
}

/* ===== 滚动条 ===== */
.items-list::-webkit-scrollbar {
  width: 6px;
}

.items-list::-webkit-scrollbar-track {
  background: transparent;
}

.items-list::-webkit-scrollbar-thumb {
  background: var(--color-scrollbar);
  border-radius: 3px;
}

.items-list::-webkit-scrollbar-thumb:hover {
  background: var(--color-scrollbar-hover);
}

/* ===== 拍照下拉按钮组 ===== */
.photo-dropdown-wrapper {
  display: flex;
  gap: 4px;
}

.photo-dropdown-btn {
  flex: 1;
  font-size: 12px !important;
  padding: 8px 10px !important;
}

/* ===== 图片编辑器弹窗 ===== */
.img-editor-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.img-editor-container {
  width: 90vw;
  max-width: 1200px;
  max-height: 90vh;
  background: var(--color-bg-primary);
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.img-editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
  font-weight: 600;
  color: var(--color-text-primary);
}

.img-editor-header .close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.img-editor-header .close-btn:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}
</style>
