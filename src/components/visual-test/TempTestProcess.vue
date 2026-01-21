<script setup lang="ts">
/**
 * TempTestProcess.vue - 临时工单检测面板组件
 * 
 * 功能：
 * - 显示临时工单的 tempTest 检测项列表
 * - 支持动态添加/删除检测项
 * - 支持标记为：合格(pass=1)、缺陷(pass=2)、疑问(pass=3)、缺陷+疑问(pass=4)
 * - 支持制程警示 (warn)
 * - 支持拍照保存到 save[]、error.url[]、question.url[]、warn.url[]
 */
import { ref, computed, Teleport } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessageBox } from 'element-plus'
import ImgEditor from '@/views/process-visual/components/ImgEditor.vue'

// ==================== 类型定义 ====================

/** 临时检测项 */
export interface TempTestItem {
  id: number
  pass: 0 | 1 | 2 | 3 | 4  // 0=未检测, 1=合格, 2=缺陷, 3=疑问, 4=缺陷+疑问
  name: string
  desc: string
  save: string[]
  error?: { url: string[]; desc: string }
  question?: { url: string[]; desc: string }
  warn?: { url: string[]; desc: string }
}

/** 临时工单报告 JSON 结构 */
export interface TempReportJson {
  dev_testunit_id: number | string
  testunit_type: number
  board_id: number | string
  board_serialnumber: string
  json: {
    tempTest: TempTestItem[]
  }
}

// ==================== Props & Emits ====================

const props = defineProps<{
  tempReportJson: TempReportJson
  mode?: 'normal' | 'feedback' | 'question'  // 测试模式
  feedbackList?: number[]  // 打回/疑问模式下需要处理的项目ID列表
}>()

const emit = defineEmits<{
  'update:tempReportJson': [value: TempReportJson]
  'click:save': [id: number]           // 拍照保存到 save[]
  'click:saveError': [id: number]      // 拍照保存到 error.url[]
  'click:saveQuestion': [id: number]   // 拍照保存到 question.url[]
  'click:saveWarn': [id: number]       // 拍照保存到 warn.url[]
}>()

// ==================== 响应式状态 ====================

// 本地报告数据 (双向绑定)
const localReport = computed({
  get: () => props.tempReportJson,
  set: (value) => emit('update:tempReportJson', value)
})

// 图片查看器
const viewerVisible = ref(false)
const viewerUrl = ref('')

// 图片编辑器
const editorVisible = ref(false)
const editorUrl = ref('')
const editingItemIndex = ref(-1)
const editingImageIndex = ref(-1)
const editingImageType = ref<'save' | 'error' | 'question' | 'warn'>('save')

// ==================== 检测项操作 ====================

/** 添加新检测记录 */
function addTestRecord() {
  const newItem: TempTestItem = {
    id: localReport.value.json.tempTest.length + 1,
    pass: 0,
    name: '',
    desc: '',
    save: []
  }
  localReport.value.json.tempTest.push(newItem)
}

/** 删除检测记录 */
async function deleteTestRecord(id: number) {
  try {
    await ElMessageBox.confirm(
      '该操作会删除该记录，确定删除吗？',
      '删除确认',
      { type: 'warning', confirmButtonText: '确定', cancelButtonText: '取消' }
    )
    
    const index = id - 1
    localReport.value.json.tempTest.splice(index, 1)
    // 重新编号
    localReport.value.json.tempTest.forEach((item, idx) => {
      item.id = idx + 1
    })
  } catch {
    // 用户取消
  }
}

/** 标记为合格 */
function handleCorrect(id: number) {
  const item = localReport.value.json.tempTest[id - 1]
  item.pass = 1
  item.name = '合格项'
  // 清除缺陷和疑问数据
  if ('error' in item) delete item.error
  if ('question' in item) delete item.question
}

/** 标记为缺陷 */
function handleError(id: number) {
  const item = localReport.value.json.tempTest[id - 1]
  
  if ('question' in item) {
    item.pass = 4
    item.name = '缺陷/疑问项'
  } else {
    item.pass = 2
    item.name = '缺陷项'
  }
  
  if (!('error' in item)) {
    item.error = { url: [], desc: '' }
  }
}

/** 标记为疑问 */
function handleQuestion(id: number) {
  const item = localReport.value.json.tempTest[id - 1]
  
  if ('error' in item) {
    item.pass = 4
    item.name = '缺陷/疑问项'
  } else {
    item.pass = 3
    item.name = '疑问项'
  }
  
  if (!('question' in item)) {
    item.question = { url: [], desc: '' }
  }
}

/** 添加制程警示 */
function handleWarn(id: number) {
  const item = localReport.value.json.tempTest[id - 1]
  
  if (!item.name.startsWith('制程警示-')) {
    item.name = '制程警示-' + item.name
  }
  
  if (!('warn' in item)) {
    item.warn = { url: [], desc: '' }
  }
}

/** 删除缺陷标记 */
async function deleteError(id: number) {
  try {
    await ElMessageBox.confirm(
      '该操作会删除该缺陷项，确定删除吗？',
      '删除确认',
      { type: 'warning', confirmButtonText: '确定', cancelButtonText: '取消' }
    )
    
    const item = localReport.value.json.tempTest[id - 1]
    if ('question' in item) {
      item.pass = 3
      item.name = '疑问项'
    } else {
      item.pass = 0
      item.name = ''
    }
    if ('error' in item) delete item.error
  } catch {
    // 用户取消
  }
}

/** 删除疑问标记 */
async function deleteQuestion(id: number) {
  try {
    await ElMessageBox.confirm(
      '该操作会删除该疑问项，确定删除吗？',
      '删除确认',
      { type: 'warning', confirmButtonText: '确定', cancelButtonText: '取消' }
    )
    
    const item = localReport.value.json.tempTest[id - 1]
    if ('error' in item) {
      item.pass = 2
      item.name = '缺陷项'
    } else {
      item.pass = 0
      item.name = ''
    }
    if ('question' in item) delete item.question
  } catch {
    // 用户取消
  }
}

/** 删除制程警示 */
async function deleteWarn(id: number) {
  try {
    await ElMessageBox.confirm(
      '该操作会删除该制程警示，确定删除吗？',
      '删除确认',
      { type: 'warning', confirmButtonText: '确定', cancelButtonText: '取消' }
    )
    
    const item = localReport.value.json.tempTest[id - 1]
    if (item.name.startsWith('制程警示-')) {
      item.name = item.name.replace('制程警示-', '')
    }
    if ('warn' in item) delete item.warn
  } catch {
    // 用户取消
  }
}

// ==================== 图片操作 ====================

/** 触发拍照保存 */
function takeSave(id: number) {
  emit('click:save', id)
}

function takeSaveError(id: number) {
  emit('click:saveError', id)
}

function takeSaveQuestion(id: number) {
  emit('click:saveQuestion', id)
}

function takeSaveWarn(id: number) {
  emit('click:saveWarn', id)
}

/** 删除图片 */
async function deleteImage(images: string[], index: number) {
  try {
    await ElMessageBox.confirm(
      '确定删除该图片吗？',
      '删除确认',
      { type: 'warning', confirmButtonText: '确定', cancelButtonText: '取消' }
    )
    images.splice(index, 1)
  } catch {
    // 用户取消
  }
}

/** 打开图片查看器 */
function openViewer(url: string) {
  viewerUrl.value = url
  viewerVisible.value = true
}

/** 打开图片编辑器 */
function openEditor(url: string, itemIndex: number, imageIndex: number, type: 'save' | 'error' | 'question' | 'warn') {
  editorUrl.value = url
  editingItemIndex.value = itemIndex
  editingImageIndex.value = imageIndex
  editingImageType.value = type
  editorVisible.value = true
}

/** 保存编辑后的图片 */
function saveEdit(dataUrl: string) {
  const item = localReport.value.json.tempTest[editingItemIndex.value]
  
  switch (editingImageType.value) {
    case 'save':
      item.save[editingImageIndex.value] = dataUrl
      break
    case 'error':
      if (item.error) item.error.url[editingImageIndex.value] = dataUrl
      break
    case 'question':
      if (item.question) item.question.url[editingImageIndex.value] = dataUrl
      break
    case 'warn':
      if (item.warn) item.warn.url[editingImageIndex.value] = dataUrl
      break
  }
  
  editorVisible.value = false
}

/** 关闭编辑器 */
function closeEditor() {
  editorVisible.value = false
}

// ==================== 辅助方法 ====================

/** 检查项目是否被遮罩（打回/疑问模式下非目标项目） */
function isItemMasked(id: number): boolean {
  if (props.mode === 'normal' || !props.mode) return false
  if (!props.feedbackList || props.feedbackList.length === 0) return false
  return !props.feedbackList.includes(id)
}

/** 获取遮罩文字 */
function getMaskText(): string {
  if (props.mode === 'feedback') return '未打回，无需编辑'
  if (props.mode === 'question') return '非疑问，无需编辑'
  return ''
}

/** 获取状态CSS类 (与 StepProcess 一致) */
function getItemStatusClass(pass: number): string {
  switch (pass) {
    case 1: return 'status-pass'
    case 2: return 'status-error'
    case 3: return 'status-question'
    case 4: return 'status-both'
    default: return 'status-pending'
  }
}

/** 获取状态文字 */
function getStatusText(pass: number): string {
  switch (pass) {
    case 1: return '合格'
    case 2: return '缺陷'
    case 3: return '疑问'
    case 4: return '缺陷+疑问'
    default: return '待检测'
  }
}
</script>

<template>
  <div class="temp-test-process">
    <!-- 头部 (与 StepProcess 一致) -->
    <div class="step-header">
      <Icon icon="mdi:clipboard-text-clock-outline" class="header-icon" />
      <span class="header-title">临时检测项</span>
      <span class="header-count">{{ localReport.json.tempTest.length }} 项</span>
      <button 
        v-if="mode !== 'question'" 
        class="add-record-btn"
        @click="addTestRecord"
      >
        <Icon icon="mdi:plus" />
        新增
      </button>
    </div>

    <!-- 检测项列表 -->
    <div class="step-list">
      <div 
        v-for="(item, index) in localReport.json.tempTest" 
        :key="item.id"
        class="step-item"
        :class="getItemStatusClass(item.pass)"
      >
        <!-- 遮罩层 (打回/疑问模式下非目标项目) -->
        <div v-if="isItemMasked(item.id)" class="item-mask">
          <Icon icon="mdi:cancel" class="mask-icon" />
          <span>{{ getMaskText() }}</span>
        </div>

        <!-- 基本信息行 -->
        <div class="step-info">
          <div class="step-index">{{ index + 1 }}</div>
          <div class="step-content">
            <input 
              v-model="item.name"
              type="text"
              class="step-name-input"
              placeholder="请输入检测项名称"
            />
            <div v-if="item.desc" class="step-desc">{{ item.desc }}</div>
          </div>
          <div class="step-status">
            <span class="status-badge" :class="getItemStatusClass(item.pass)">
              {{ getStatusText(item.pass) }}
            </span>
            <!-- 制程警示标记 -->
            <Icon v-if="'warn' in item" icon="mdi:alert-circle" class="warn-badge" />
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="step-actions">
          <!-- 合格按钮 -->
          <button 
            class="action-btn pass-btn"
            :class="{ active: item.pass === 1 }"
            @click="handleCorrect(item.id)"
            title="标记为合格"
          >
            <Icon icon="mdi:check-circle" />
          </button>

          <!-- 缺陷按钮 -->
          <button 
            class="action-btn error-btn"
            :class="{ active: item.pass === 2 || item.pass === 4 }"
            @click="handleError(item.id)"
            title="标记为缺陷"
          >
            <Icon icon="mdi:close-circle" />
          </button>

          <!-- 疑问按钮 -->
          <button 
            v-if="mode !== 'question'"
            class="action-btn question-btn"
            :class="{ active: item.pass === 3 || item.pass === 4 }"
            @click="handleQuestion(item.id)"
            title="标记为疑问"
          >
            <Icon icon="mdi:help-circle" />
          </button>

          <!-- 警示按钮 -->
          <button 
            class="action-btn warn-btn"
            :class="{ active: !!item.warn }"
            @click="handleWarn(item.id)"
            title="添加制程警示"
          >
            <Icon icon="mdi:alert-circle" />
          </button>

          <!-- 分隔 -->
          <div class="action-separator"></div>

          <!-- 删除按钮 -->
          <button 
            class="action-btn delete-btn"
            @click="deleteTestRecord(item.id)"
            title="删除记录"
          >
            <Icon icon="mdi:trash-can" />
          </button>
        </div>

        <!-- 描述输入 -->
        <div class="desc-panel">
          <textarea 
            v-model="item.desc"
            class="desc-input"
            placeholder="请输入描述..."
            rows="2"
          />
        </div>

        <!-- 留存图片 -->
        <div class="detail-panel save-panel">
          <div class="panel-header">
            <Icon icon="mdi:image-multiple" class="panel-icon save" />
            <span>留存图片 ({{ item.save.length }}/10)</span>
          </div>
          <div class="image-gallery">
            <div 
              v-for="(img, idx) in item.save" 
              :key="idx"
              class="image-item"
            >
              <img :src="img" alt="" @click="openViewer(img)" />
              <button class="img-edit" @click.stop="openEditor(img, item.id - 1, idx, 'save')" title="编辑">
                <Icon icon="mdi:pencil" />
              </button>
              <button class="img-delete" @click.stop="deleteImage(item.save, idx)" title="删除">
                <Icon icon="mdi:close" />
              </button>
            </div>
            <button 
              v-if="item.save.length < 10"
              class="add-image-btn"
              @click="takeSave(item.id)"
            >
              <Icon icon="mdi:camera-plus" />
              <span>拍照</span>
            </button>
          </div>
        </div>

        <!-- 缺陷详情 (pass=2 或 pass=4) -->
        <div v-if="item.error" class="detail-panel error-panel">
          <div class="panel-header">
            <Icon icon="mdi:close-circle" class="panel-icon error" />
            <span>缺陷详情</span>
            <button class="delete-btn" @click="deleteError(item.id)">
              <Icon icon="mdi:trash-can" />
            </button>
          </div>
          <div class="image-gallery">
            <div 
              v-for="(img, idx) in item.error.url" 
              :key="idx"
              class="image-item"
            >
              <img :src="img" alt="" @click="openViewer(img)" />
              <button class="img-edit" @click.stop="openEditor(img, item.id - 1, idx, 'error')" title="编辑">
                <Icon icon="mdi:pencil" />
              </button>
              <button class="img-delete" @click.stop="deleteImage(item.error!.url, idx)" title="删除">
                <Icon icon="mdi:close" />
              </button>
            </div>
            <button 
              v-if="item.error.url.length < 5"
              class="add-image-btn"
              @click="takeSaveError(item.id)"
            >
              <Icon icon="mdi:camera-plus" />
              <span>拍照</span>
            </button>
          </div>
          <textarea 
            v-model="item.error.desc"
            class="desc-input"
            placeholder="请输入缺陷描述..."
            rows="3"
          />
        </div>

        <!-- 疑问详情 (pass=3 或 pass=4) -->
        <div v-if="item.question" class="detail-panel question-panel">
          <div class="panel-header">
            <Icon icon="mdi:help-circle" class="panel-icon question" />
            <span>疑问详情</span>
            <button class="delete-btn" @click="deleteQuestion(item.id)">
              <Icon icon="mdi:trash-can" />
            </button>
          </div>
          <div class="image-gallery">
            <div 
              v-for="(img, idx) in item.question.url" 
              :key="idx"
              class="image-item"
            >
              <img :src="img" alt="" @click="openViewer(img)" />
              <button class="img-edit" @click.stop="openEditor(img, item.id - 1, idx, 'question')" title="编辑">
                <Icon icon="mdi:pencil" />
              </button>
              <button class="img-delete" @click.stop="deleteImage(item.question!.url, idx)" title="删除">
                <Icon icon="mdi:close" />
              </button>
            </div>
            <button 
              v-if="item.question.url.length < 5"
              class="add-image-btn"
              @click="takeSaveQuestion(item.id)"
            >
              <Icon icon="mdi:camera-plus" />
              <span>拍照</span>
            </button>
          </div>
          <textarea 
            v-model="item.question.desc"
            class="desc-input"
            placeholder="请输入疑问描述..."
            rows="3"
            :disabled="mode === 'question'"
          />
        </div>

        <!-- 制程警示详情 -->
        <div v-if="item.warn" class="detail-panel warn-panel">
          <div class="panel-header">
            <Icon icon="mdi:alert-circle" class="panel-icon warn" />
            <span>制程警示</span>
            <button class="delete-btn" @click="deleteWarn(item.id)">
              <Icon icon="mdi:trash-can" />
            </button>
          </div>
          <div class="image-gallery">
            <div 
              v-for="(img, idx) in item.warn.url" 
              :key="idx"
              class="image-item"
            >
              <img :src="img" alt="" @click="openViewer(img)" />
              <button class="img-edit" @click.stop="openEditor(img, item.id - 1, idx, 'warn')" title="编辑">
                <Icon icon="mdi:pencil" />
              </button>
              <button class="img-delete" @click.stop="deleteImage(item.warn!.url, idx)" title="删除">
                <Icon icon="mdi:close" />
              </button>
            </div>
            <button 
              v-if="item.warn.url.length < 5"
              class="add-image-btn"
              @click="takeSaveWarn(item.id)"
            >
              <Icon icon="mdi:camera-plus" />
              <span>拍照</span>
            </button>
          </div>
          <textarea 
            v-model="item.warn.desc"
            class="desc-input"
            placeholder="请输入制程警示描述..."
            rows="3"
          />
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="localReport.json.tempTest.length === 0" class="empty-state">
        <Icon icon="mdi:clipboard-text-outline" class="empty-icon" />
        <span>暂无检测记录</span>
        <button class="add-btn" @click="addTestRecord">
          <Icon icon="mdi:plus" /> 添加记录
        </button>
      </div>
    </div>

    <!-- 图片查看器 -->
    <Teleport to="body">
      <div v-if="viewerVisible" class="viewer-overlay" @click="viewerVisible = false">
        <div class="viewer-content" @click.stop>
          <img :src="viewerUrl" alt="" />
          <button class="viewer-close" @click="viewerVisible = false">
            <Icon icon="mdi:close" />
          </button>
        </div>
      </div>
    </Teleport>

    <!-- 图片编辑器 -->
    <Teleport to="body">
      <div v-if="editorVisible" class="editor-overlay">
        <div class="editor-container">
          <div class="editor-header">
            <span>图片编辑</span>
            <button class="editor-close" @click="closeEditor">
              <Icon icon="mdi:close" />
            </button>
          </div>
          <div class="editor-body">
            <ImgEditor :img-url="editorUrl" @save="saveEdit" />
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* 主容器 - 限制高度防止撑开外部页面 */
.temp-test-process {
  display: flex;
  flex-direction: column;
  height: 100%;
  max-height: 100%;  /* 关键: 限制最大高度 */
  min-height: 0;     /* 关键: flex子项可收缩 */
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  overflow: hidden;
}

/* 头部 - 固定高度不收缩 */
.step-header {
  flex-shrink: 0;  /* 不收缩 */
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--color-border);
}

.header-icon {
  font-size: 1.25rem;
  color: rgb(245, 158, 11);
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

.add-record-btn {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.375rem 0.75rem;
  margin-left: 0.5rem;
  border: none;
  border-radius: 0.5rem;
  background: rgb(245, 158, 11);
  color: white;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.add-record-btn:hover {
  opacity: 0.9;
}

/* 列表 - 需要 min-height: 0 让 flex 子元素正确滚动 */
.step-list {
  flex: 1 1 0;      /* 可伸缩，基础大小为0 */
  min-height: 0;    /* 允许收缩到0 */
  max-height: 100%; /* 限制最大高度 */
  overflow-y: auto;
  padding: 0.75rem;
}

/* 检测项卡片 (与 StepProcess 一致) */
.step-item {
  position: relative;
  background: var(--color-bg-tertiary);
  border-radius: 0.5rem;
  margin-bottom: 0.75rem;
  border: 1px solid var(--color-border);
  border-left: 3px solid var(--color-border);
  transition: all 0.2s;
}

.step-item.status-pass { border-left-color: #22c55e; }
.step-item.status-error { border-left-color: #ef4444; }
.step-item.status-question { border-left-color: #f59e0b; }
.step-item.status-both { border-left-color: #a855f7; }

/* 遮罩层 */
.item-mask {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 0.5rem;
  color: white;
  font-size: 1.25rem;
}

.mask-icon {
  font-size: 3rem;
}

/* 基本信息行 (与 StepProcess 一致) */
.step-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
}

.step-index {
  width: 2.25rem;
  height: 2.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-hover);
  border-radius: 50%;
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.step-content {
  flex: 1;
  min-width: 0;
}

.step-name-input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  background: var(--color-bg-primary);
  color: var(--color-text);
  font-size: 1rem;
  font-weight: 500;
}

.step-name-input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.step-desc {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  margin-top: 0.25rem;
}

.step-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.status-badge {
  display: inline-block;
  padding: 0.375rem 0.75rem;
  border-radius: 0.75rem;
  font-size: 0.875rem;
  font-weight: 500;
  background: var(--color-bg-hover);
  color: var(--color-text-secondary);
}

.status-badge.status-pass { background: rgba(34, 197, 94, 0.2); color: #22c55e; }
.status-badge.status-error { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
.status-badge.status-question { background: rgba(245, 158, 11, 0.2); color: #f59e0b; }
.status-badge.status-both { background: rgba(168, 85, 247, 0.2); color: #a855f7; }

.warn-badge {
  font-size: 1.25rem;
  color: #6366f1;
}

/* 操作按钮 (与 StepProcess 一致) */
.step-actions {
  display: flex;
  gap: 0.75rem;
  padding: 0 0.75rem 0.75rem;
}

.action-btn {
  width: 3rem;
  height: 3rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border);
  border-radius: 0.625rem;
  cursor: pointer;
  font-size: 1.5rem;
  transition: all 0.2s;
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
}

.action-btn:hover { background: var(--color-bg-hover); }

.action-btn.pass-btn:hover,
.action-btn.pass-btn.active { background: rgba(34, 197, 94, 0.2); color: #22c55e; }

.action-btn.error-btn:hover,
.action-btn.error-btn.active { background: rgba(239, 68, 68, 0.2); color: #ef4444; }

.action-btn.question-btn:hover,
.action-btn.question-btn.active { background: rgba(245, 158, 11, 0.2); color: #f59e0b; }

.action-btn.warn-btn:hover,
.action-btn.warn-btn.active { background: rgba(99, 102, 241, 0.2); color: #6366f1; }

.action-btn.delete-btn:hover { background: rgba(239, 68, 68, 0.2); color: #ef4444; }

.action-separator {
  width: 1px;
  height: 2rem;
  background: var(--color-border);
  margin: 0 0.25rem;
}

/* 描述面板 */
.desc-panel {
  padding: 0 0.75rem 0.75rem;
}

/* 描述输入框 (与 StepProcess 一致) */
.desc-input {
  width: 100%;
  padding: 0.625rem 0.875rem;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  background: var(--color-bg-primary);
  color: var(--color-text);
  font-size: 0.875rem;
  resize: none;
}

.desc-input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.desc-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 详情面板 (与 StepProcess 一致) */
.detail-panel {
  margin: 0 0.75rem 0.75rem;
  padding: 0.75rem;
  background: var(--color-bg-primary);
  border-radius: 0.5rem;
  border: 1px solid var(--color-border);
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  font-size: 0.875rem;
  font-weight: 500;
}

.panel-icon {
  font-size: 1.125rem;
}

.panel-icon.save { color: #3b82f6; }
.panel-icon.error { color: #ef4444; }
.panel-icon.question { color: #f59e0b; }
.panel-icon.warn { color: #6366f1; }

.panel-header .delete-btn {
  margin-left: auto;
  width: 1.75rem;
  height: 1.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 0.375rem;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 1rem;
}

.panel-header .delete-btn:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.error-panel { border-left: 3px solid #ef4444; }
.question-panel { border-left: 3px solid #f59e0b; }
.warn-panel { border-left: 3px solid #6366f1; }
.save-panel { border-left: 3px solid #3b82f6; }

/* 图片画廊 (与 StepProcess 一致) */
.image-gallery {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.image-item {
  position: relative;
  width: 6rem;
  height: 6rem;
  border-radius: 0.5rem;
  overflow: hidden;
  border: 1px solid var(--color-border);
}

.image-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  cursor: pointer;
}

.img-edit,
.img-delete {
  position: absolute;
  width: 1.5rem;
  height: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 0.25rem;
  cursor: pointer;
  font-size: 0.75rem;
  opacity: 0;
  transition: opacity 0.2s;
}

.image-item:hover .img-edit,
.image-item:hover .img-delete {
  opacity: 1;
}

.img-edit {
  bottom: 0.25rem;
  left: 0.25rem;
  background: rgba(59, 130, 246, 0.9);
  color: white;
}

.img-delete {
  top: 0.25rem;
  right: 0.25rem;
  background: rgba(239, 68, 68, 0.9);
  color: white;
}

/* 添加图片按钮 (与 StepProcess 一致) */
.add-image-btn {
  width: 6rem;
  height: 6rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  border: 2px dashed var(--color-border);
  border-radius: 0.5rem;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 0.75rem;
  transition: all 0.2s;
}

.add-image-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.add-image-btn svg {
  font-size: 1.5rem;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 3rem;
  color: var(--color-text-secondary);
}

.empty-icon {
  font-size: 3rem;
  opacity: 0.5;
}

.add-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 0.5rem;
  background: rgb(245, 158, 11);
  color: white;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.add-btn:hover {
  opacity: 0.9;
}

/* 图片查看器 */
.viewer-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.9);
}

.viewer-content {
  position: relative;
  max-width: 90vw;
  max-height: 90vh;
}

.viewer-content img {
  max-width: 100%;
  max-height: 90vh;
  object-fit: contain;
}

.viewer-close {
  position: absolute;
  top: -2rem;
  right: -2rem;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: white;
  color: #333;
  cursor: pointer;
  font-size: 1.25rem;
}

/* 图片编辑器 */
.editor-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.8);
}

.editor-container {
  width: 70vw;
  height: 90vh;
  background: var(--color-bg);
  border-radius: 0.75rem;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
  font-weight: 600;
}

.editor-close {
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 0.5rem;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 1.25rem;
}

.editor-close:hover {
  background: var(--color-bg-tertiary);
}

.editor-body {
  flex: 1;
  overflow: hidden;
}

/* 滚动条样式 */
.step-list::-webkit-scrollbar {
  width: 6px;
}

.step-list::-webkit-scrollbar-track {
  background: var(--color-bg-secondary);
  border-radius: 3px;
}

.step-list::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: 3px;
}

.step-list::-webkit-scrollbar-thumb:hover {
  background: var(--color-text-tertiary);
}
</style>
