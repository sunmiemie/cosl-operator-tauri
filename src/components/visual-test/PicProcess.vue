<script setup lang="ts">
/**
 * PicProcess 组件 - 留存图片拍摄
 * 
 * 参考原程序 gui/src/components/Tools/PicProcess.vue
 * 
 * 功能:
 * - 显示需要拍摄的图片列表
 * - 支持拍照保存和删除
 * - 支持图片编辑（标注、绘制）
 * - 显示参考示例图
 */
import { ref, computed } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessageBox } from 'element-plus'
import ImgEditor from '@/views/process-visual/components/ImgEditor.vue'

// ==================== 类型定义 ====================

// 留存图片项
export interface PicItem {
  id: number
  name: string           // 留存项名称
  desc?: string          // 拍摄描述
  url?: string           // 参考示例图 URL
  save: string[]         // 已拍摄的图片列表
}

// Props
const props = defineProps<{
  // 图片数据列表
  picData: PicItem[]
  // 参考图片（全局）
  image?: string
}>()

// Emits
const emit = defineEmits<{
  'update:picData': [data: PicItem[]]
  'click:save': [picId: number]  // 拍照保存
}>()

// ==================== 状态 ====================

// 图片预览
const previewVisible = ref(false)
const previewUrl = ref('')

// 图片编辑
const editorVisible = ref(false)
const editingPic = ref<PicItem | null>(null)
const editingIndex = ref(-1)
const editingUrl = ref('')

// 计算属性 - 本地图片数据
const localPics = computed({
  get: () => props.picData,
  set: (value) => emit('update:picData', value)
})

// ==================== 方法 ====================

// 删除图片
async function deleteImage(pic: PicItem, index: number) {
  try {
    await ElMessageBox.confirm('确定删除该图片吗？', '确认删除', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    pic.save.splice(index, 1)
  } catch {
    // 用户取消
  }
}

// 预览图片
function previewImage(url: string) {
  previewUrl.value = url
  previewVisible.value = true
}

// 编辑图片
function editImage(pic: PicItem, index: number) {
  editingPic.value = pic
  editingIndex.value = index
  editingUrl.value = pic.save[index]
  editorVisible.value = true
}

// 保存编辑后的图片
function handleEditorSave(dataUrl: string) {
  if (editingPic.value && editingIndex.value >= 0) {
    // 替换原图片
    editingPic.value.save[editingIndex.value] = dataUrl
  }
  closeEditor()
}

// 关闭编辑器
function closeEditor() {
  editorVisible.value = false
  editingPic.value = null
  editingIndex.value = -1
  editingUrl.value = ''
}

// 拍照
function takeSave(picId: number) {
  emit('click:save', picId)
}

// 获取完成状态
function getPicStatus(pic: PicItem): 'pending' | 'done' {
  return pic.save.length > 0 ? 'done' : 'pending'
}

// 获取完成数量
function getCompletedCount(): number {
  return localPics.value.filter(p => p.save.length > 0).length
}
</script>

<template>
  <div class="pic-process">
    <!-- 头部 -->
    <div class="pic-header">
      <Icon icon="mdi:camera-outline" class="header-icon" />
      <span class="header-title">拍照留存项</span>
      <span class="header-count">
        {{ getCompletedCount() }} / {{ localPics.length }} 完成
      </span>
    </div>

    <!-- 图片列表 -->
    <div class="pic-list">
      <div 
        v-for="pic in localPics" 
        :key="pic.id"
        class="pic-item"
        :class="getPicStatus(pic)"
      >
        <!-- 左侧参考图 -->
        <div class="pic-reference" @click="pic.url && previewImage(pic.url)">
          <img v-if="pic.url" :src="pic.url" />
          <div v-else class="no-reference">
            <Icon icon="mdi:image-off" />
          </div>
          <div class="reference-label">示例</div>
        </div>

        <!-- 中间内容 -->
        <div class="pic-content">
          <div class="pic-name">
            <Icon 
              :icon="getPicStatus(pic) === 'done' ? 'mdi:check-circle' : 'mdi:circle-outline'" 
              :class="getPicStatus(pic)"
            />
            {{ pic.name }}
          </div>
          <div v-if="pic.desc" class="pic-desc">{{ pic.desc }}</div>
          
          <!-- 已拍摄图片 -->
          <div class="pic-gallery">
            <div 
              v-for="(img, index) in pic.save" 
              :key="index"
              class="saved-image"
            >
              <img :src="img" @click="previewImage(img)" />
              <span class="image-index">{{ index + 1 }}</span>
              <!-- 编辑按钮 -->
              <button class="edit-btn" @click.stop="editImage(pic, index)" title="编辑图片">
                <Icon icon="mdi:pencil" />
              </button>
              <!-- 删除按钮 -->
              <button class="delete-btn" @click.stop="deleteImage(pic, index)" title="删除图片">
                <Icon icon="mdi:close" />
              </button>
            </div>

            <!-- 添加按钮 -->
            <button 
              v-if="pic.save.length < 5"
              class="add-btn"
              @click="takeSave(pic.id)"
            >
              <Icon icon="mdi:camera-plus" />
            </button>
          </div>
        </div>

        <!-- 右侧拍照按钮 -->
        <div class="pic-action">
          <button 
            class="capture-btn"
            :class="{ done: getPicStatus(pic) === 'done' }"
            @click="takeSave(pic.id)"
            :disabled="pic.save.length >= 5"
          >
            <Icon icon="mdi:camera" />
            <span>拍照</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 图片预览弹窗 -->
    <Teleport to="body">
      <div v-if="previewVisible" class="image-preview-overlay" @click="previewVisible = false">
        <div class="preview-container" @click.stop>
          <img :src="previewUrl" />
          <button class="close-btn" @click="previewVisible = false">
            <Icon icon="mdi:close" />
          </button>
        </div>
      </div>
    </Teleport>

    <!-- 图片编辑器弹窗 -->
    <Teleport to="body">
      <div v-if="editorVisible" class="editor-overlay">
        <div class="editor-container">
          <div class="editor-header">
            <span class="editor-title">
              <Icon icon="mdi:image-edit" />
              图片编辑
            </span>
            <button class="editor-close-btn" @click="closeEditor">
              <Icon icon="mdi:close" />
            </button>
          </div>
          <div class="editor-body">
            <ImgEditor 
              :img-url="editingUrl" 
              @save="handleEditorSave" 
            />
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.pic-process {
  display: flex;
  flex-direction: column;
  height: 100%;
  max-height: 100%;  /* 关键: 限制最大高度 */
  min-height: 0;     /* 关键: flex子项可收缩 */
  background: var(--color-bg-secondary);
  border-radius: 0.75rem;
  border: 1px solid var(--color-border);
  overflow: hidden;
}

.pic-header {
  flex-shrink: 0;    /* 头部不收缩 */
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--color-border);
}

.header-icon {
  font-size: 1.25rem;
  color: rgb(96, 165, 250);
}

.header-title {
  font-size: 0.9375rem;
  font-weight: 600;
}

.header-count {
  margin-left: auto;
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  background: var(--color-bg-tertiary);
  padding: 0.125rem 0.5rem;
  border-radius: 0.625rem;
}

.pic-list {
  flex: 1 1 0;       /* 可伸缩，基础大小为0 */
  min-height: 0;     /* 允许收缩到0 */
  max-height: 100%;  /* 限制最大高度 */
  overflow-y: auto;
  padding: 0.75rem;
}

.pic-item {
  display: flex;
  gap: 0.75rem;
  background: var(--color-bg-tertiary);
  border-radius: 0.5rem;
  padding: 0.75rem;
  margin-bottom: 0.75rem;
  border: 1px solid var(--color-border);
  border-left: 3px solid var(--color-border);
  transition: all 0.2s;
}

.pic-item.done {
  border-left-color: rgb(74, 222, 128);
}

.pic-reference {
  position: relative;
  width: 6.5rem;
  height: 6.5rem;
  flex-shrink: 0;
  border-radius: 0.5rem;
  border: 1px solid var(--color-border);
  overflow: hidden;
  cursor: pointer;
  background: var(--color-bg-primary);
}

.pic-reference img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.no-reference {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  font-size: 1.5rem;
}

.reference-label {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 0.25rem;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  font-size: 0.75rem;
  text-align: center;
}

.pic-content {
  flex: 1;
  min-width: 0;
}

.pic-name {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.875rem;
  font-weight: 500;
  margin-bottom: 0.25rem;
}

.pic-name svg {
  font-size: 1rem;
  color: var(--color-text-secondary);
}

.pic-name svg.done {
  color: rgb(74, 222, 128);
}

.pic-desc {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  margin-bottom: 0.5rem;
}

.pic-gallery {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.saved-image {
  position: relative;
  width: 5.5rem;
  height: 5.5rem;
  border-radius: 0.5rem;
  border: 1px solid var(--color-border);
  overflow: hidden;
  cursor: pointer;
}

.saved-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-index {
  position: absolute;
  top: 0.25rem;
  left: 0.25rem;
  width: 1.25rem;
  height: 1.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 50%;
  color: white;
  font-size: 0.75rem;
}

.saved-image .edit-btn,
.saved-image .delete-btn {
  position: absolute;
  width: 1.5rem;
  height: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  color: white;
  cursor: pointer;
  font-size: 0.75rem;
  opacity: 0;
  transition: opacity 0.2s;
}

.saved-image .edit-btn {
  bottom: 0.25rem;
  right: 0.25rem;
  background: rgba(96, 165, 250, 0.9);
}

.saved-image .delete-btn {
  top: 0.25rem;
  right: 0.25rem;
  background: rgba(239, 68, 68, 0.9);
}

.saved-image:hover .edit-btn,
.saved-image:hover .delete-btn {
  opacity: 1;
}

.add-btn {
  width: 5.5rem;
  height: 5.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-tertiary);
  border: 2px dashed var(--color-border);
  border-radius: 0.5rem;
  cursor: pointer;
  color: var(--color-text-secondary);
  font-size: 1.75rem;
  transition: all 0.2s;
}

.add-btn:hover {
  background: rgba(96, 165, 250, 0.1);
  border-color: rgb(96, 165, 250);
  color: rgb(96, 165, 250);
}

.pic-action {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.capture-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.625rem 1rem;
  background: rgba(96, 165, 250, 0.1);
  border: 1px solid rgba(96, 165, 250, 0.3);
  border-radius: 0.5rem;
  color: rgb(96, 165, 250);
  cursor: pointer;
  transition: all 0.2s;
}

.capture-btn:hover:not(:disabled) {
  background: rgba(96, 165, 250, 0.2);
}

.capture-btn.done {
  background: rgba(74, 222, 128, 0.1);
  border-color: rgba(74, 222, 128, 0.3);
  color: rgb(74, 222, 128);
}

.capture-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.capture-btn svg {
  font-size: 1.25rem;
}

.capture-btn span {
  font-size: 0.75rem;
}

/* 图片预览遮罩 */
.image-preview-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.preview-container {
  position: relative;
  max-width: 90vw;
  max-height: 90vh;
}

.preview-container img {
  max-width: 100%;
  max-height: 90vh;
  object-fit: contain;
}

.close-btn {
  position: absolute;
  top: -2.5rem;
  right: 0;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 50%;
  color: white;
  cursor: pointer;
  font-size: 1.25rem;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

/* 滚动条样式 */
.pic-list::-webkit-scrollbar {
  width: 0.375rem;
}

.pic-list::-webkit-scrollbar-track {
  background: transparent;
}

.pic-list::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: 0.1875rem;
}

.pic-list::-webkit-scrollbar-thumb:hover {
  background: var(--color-text-secondary);
}

/* 图片编辑器弹窗 */
.editor-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 1rem;
}

.editor-container {
  width: 100%;
  max-width: 1200px;
  height: 90vh;
  background: var(--color-bg-primary);
  border-radius: 0.75rem;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
}

.editor-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1rem;
  font-weight: 600;
}

.editor-title svg {
  font-size: 1.25rem;
  color: rgb(96, 165, 250);
}

.editor-close-btn {
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 0.375rem;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 1.25rem;
  transition: all 0.2s;
}

.editor-close-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.editor-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
</style>
