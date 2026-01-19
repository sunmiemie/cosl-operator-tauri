<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessageBox, ElMessage, ElPopover } from 'element-plus'
import { useProcess } from './composables/useProcess'
import { useLayout } from '@/composables/useLayout'

// 组件导入
import ProcessSteps from './components/ProcessSteps.vue'
import BoardSelector from './components/BoardSelector.vue'
import StepEditor from './components/StepEditor.vue'
import PicEditor from './components/PicEditor.vue'
import AreaCard from './components/AreaCard.vue'
import ProcessPreview from './components/ProcessPreview.vue'
import JobDrawer from './components/JobDrawer.vue'
import QuickStepSelector from './components/QuickStepSelector.vue'
import CameraDialog from './components/CameraDialog.vue'
import MultiPhotoDialog from './components/MultiPhotoDialog.vue'
import DetailEditor from './components/DetailEditor.vue'
import ImgEditor from './components/ImgEditor.vue'

// 使用布局管理
const { enterEditMode, exitEditMode } = useLayout()

// 定义 props，接收工艺类型
const props = withDefaults(defineProps<{
  processType?: 'eyes' | 'xray'
}>(), {
  processType: 'eyes'
})

// 使用工艺管理，根据 props 传入工艺类型
const process = useProcess(props.processType)

// 抽屉和弹窗状态
const showJobDrawer = ref(false)
const showQuickSelector = ref(false)
const showCameraDialog = ref(false)
const showMultiPhotoDialog = ref(false)  // 多图拼接对话框
const showPhotoDropdown = ref(false)     // 拍照下拉菜单
const showImgEditor = ref(false)         // 图片编辑器
const cameraMultiMode = ref(false)
const currentCameraTarget = ref<'total' | 'area' | 'pic'>('total')
const currentCameraAreaId = ref<number | null>(null)
const currentEditPicId = ref<number | null>(null)   // 当前编辑的留存项ID
const currentEditImageUrl = ref('')                  // 当前编辑的图片URL
const currentEditPicSource = ref<'total' | 'area'>('total')  // 当前编辑留存项来源（整体/分区）

// 根据工艺类型计算对应的摄像头设备类型
const cameraDeviceType = computed<'micro' | 'xray'>(() => {
  return props.processType === 'xray' ? 'xray' : 'micro'
})

// 当前选中的分区索引
const selectedAreaIndex = ref(0)
// 分区Tab (general/detail)
const areaTab = ref<'general' | 'detail'>('general')
// 裁剪框数据
const cropBox = ref({ x: 0, y: 0, width: 192, height: 108 })
// 是否正在拖动
const isDragging = ref(false)

// 图片元素
const imageRef = ref<HTMLImageElement | null>(null)

// 当前分区数据
const currentAreaData = computed(() => {
  if (process.currentArea.value.length === 0) return null
  return process.currentArea.value[selectedAreaIndex.value] || null
})

// 处理节点点击
function handleNodeClick(node: { id: number; label: string }) {
  process.fetchProcessByBoardModel(node.id, node.label)
}

// 开始编辑
async function handleStartEdit() {
  if (process.isOnlineMode.value && process.currentSelectProcess.value) {
    // 基于已有版本进行迭代编辑
    const selectedVersion = process.currentSelectProcess.value
    console.log('基于版本迭代:', selectedVersion)
    
    // 下载并加载选中的工艺
    const success = await process.downloadProcess(selectedVersion.id)
    if (!success) {
      console.error('下载工艺失败')
      return
    }
    
    // 设置为编辑模式（基于已有版本迭代）
    // 注意：这里是创建新版本，所以 isEdit 保持 false
    // 但 processId 需要记录来源版本（用于参考）
    console.log('加载工艺成功，准备编辑')
    console.log('当前 processJson:', process.processJson.value)
    console.log('当前 currentTotal:', process.currentTotal.value)
    console.log('当前 currentArea:', process.currentArea.value)
  }
  process.startEdit()
}

// 退出编辑
async function handleExit() {
  console.log('handleExit 被调用')
  try {
    console.log('准备显示 ElMessageBox')
    const result = await ElMessageBox.confirm('确定要退出编辑吗？未保存的更改将丢失。', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    console.log('ElMessageBox 结果:', result)
    process.resetProcess()
  } catch (e) {
    console.log('ElMessageBox 取消或错误:', e)
    // 用户取消
  }
}

// 监听步骤变化，进入/退出编辑模式时隐藏/显示侧边栏
watch(
  () => process.currentStep.value,
  (step) => {
    // 步骤 >= 1 时进入编辑模式，隐藏侧边栏
    if (step >= 1) {
      enterEditMode()
    } else {
      exitEditMode()
    }
  }
)

// 页面卸载时确保退出编辑模式
onUnmounted(() => {
  exitEditMode()
})

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
        const result = e.target?.result as string
        process.setTotalImage(result)
      }
      reader.readAsDataURL(file)
    }
  }
  input.click()
}

// 截取分区
function handleCutArea() {
  const totalUrl = process.currentTotal.value.url
  if (!totalUrl) {
    ElMessage.warning('请先上传整体图片')
    return
  }
  
  // 创建临时canvas进行裁剪
  const img = new Image()
  img.onload = () => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    // 计算实际裁剪区域
    const scaleX = img.width / (imageRef.value?.clientWidth || img.width)
    const scaleY = img.height / (imageRef.value?.clientHeight || img.height)
    
    const actualX = cropBox.value.x * scaleX
    const actualY = cropBox.value.y * scaleY
    const actualWidth = cropBox.value.width * scaleX
    const actualHeight = cropBox.value.height * scaleY
    
    canvas.width = actualWidth
    canvas.height = actualHeight
    
    ctx.drawImage(img, actualX, actualY, actualWidth, actualHeight, 0, 0, actualWidth, actualHeight)
    
    const croppedUrl = canvas.toDataURL('image/png')
    process.addArea(croppedUrl)
  }
  img.src = totalUrl
}

// 替换分区图片
function handleReplaceArea(areaId: number) {
  const totalUrl = process.currentTotal.value.url
  if (!totalUrl) return
  
  const img = new Image()
  img.onload = () => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    const scaleX = img.width / (imageRef.value?.clientWidth || img.width)
    const scaleY = img.height / (imageRef.value?.clientHeight || img.height)
    
    const actualX = cropBox.value.x * scaleX
    const actualY = cropBox.value.y * scaleY
    const actualWidth = cropBox.value.width * scaleX
    const actualHeight = cropBox.value.height * scaleY
    
    canvas.width = actualWidth
    canvas.height = actualHeight
    
    ctx.drawImage(img, actualX, actualY, actualWidth, actualHeight, 0, 0, actualWidth, actualHeight)
    
    const croppedUrl = canvas.toDataURL('image/png')
    process.setAreaImage(areaId, croppedUrl)
  }
  img.src = totalUrl
}

// 选择分区
function handleSelectArea(id: number) {
  const index = process.currentArea.value.findIndex(a => a.id === id)
  if (index !== -1) {
    selectedAreaIndex.value = index
  }
}

// 删除分区
function handleDeleteArea(id: number) {
  process.deleteArea(id)
  // 重置选中状态
  if (selectedAreaIndex.value >= process.currentArea.value.length) {
    selectedAreaIndex.value = Math.max(0, process.currentArea.value.length - 1)
  }
}

// 分区拖拽排序
const dragFromIndex = ref(-1)
const dragToIndex = ref(-1)

function handleAreaDragStart(index: number) {
  dragFromIndex.value = index
}

function handleAreaDragOver(index: number) {
  dragToIndex.value = index
}

function handleAreaDragEnd() {
  if (dragFromIndex.value !== -1 && dragToIndex.value !== -1 && dragFromIndex.value !== dragToIndex.value) {
    process.reorderAreas(dragFromIndex.value, dragToIndex.value)
  }
  dragFromIndex.value = -1
  dragToIndex.value = -1
}

// 完成并上传
async function handleUpload() {
  if (process.isEdit.value) {
    const success = await process.updateProcess()
    if (success) {
      ElMessage.success('更新成功')
      process.resetProcess()
    } else {
      ElMessage.error('更新失败，请重试')
    }
  } else {
    const success = await process.uploadProcess()
    if (success) {
      ElMessage.success('上传成功')
      process.resetProcess()
    } else {
      ElMessage.error('上传失败，请重试')
    }
  }
}

// 裁剪框拖动
// 拖拽移动裁剪框
function handleCropMouseDown(e: MouseEvent) {
  // 阻止事件冒泡，避免与 resize 冲突
  if ((e.target as HTMLElement).classList.contains('resize-handle')) return
  
  isDragging.value = true
  const startX = e.clientX - cropBox.value.x
  const startY = e.clientY - cropBox.value.y
  
  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging.value) return
    cropBox.value.x = Math.max(0, e.clientX - startX)
    cropBox.value.y = Math.max(0, e.clientY - startY)
  }
  
  const handleMouseUp = () => {
    isDragging.value = false
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }
  
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
}

// 调整裁剪框大小
function handleResizeMouseDown(e: MouseEvent, direction: string) {
  e.stopPropagation()
  e.preventDefault()
  
  const startX = e.clientX
  const startY = e.clientY
  const startBoxX = cropBox.value.x
  const startBoxY = cropBox.value.y
  const startWidth = cropBox.value.width
  const startHeight = cropBox.value.height
  const minSize = 20 // 最小尺寸
  
  const handleMouseMove = (e: MouseEvent) => {
    const deltaX = e.clientX - startX
    const deltaY = e.clientY - startY
    
    // 根据方向调整
    if (direction.includes('e')) {
      cropBox.value.width = Math.max(minSize, startWidth + deltaX)
    }
    if (direction.includes('w')) {
      const newWidth = Math.max(minSize, startWidth - deltaX)
      cropBox.value.x = startBoxX + (startWidth - newWidth)
      cropBox.value.width = newWidth
    }
    if (direction.includes('s')) {
      cropBox.value.height = Math.max(minSize, startHeight + deltaY)
    }
    if (direction.includes('n')) {
      const newHeight = Math.max(minSize, startHeight - deltaY)
      cropBox.value.y = startBoxY + (startHeight - newHeight)
      cropBox.value.height = newHeight
    }
  }
  
  const handleMouseUp = () => {
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }
  
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
}

// ========== 新增功能处理函数 ==========

// 打开工作抽屉（同时刷新数据）
function handleOpenJobDrawer() {
  // 打开抽屉时刷新待处理和暂存数据
  if (process.isOnlineMode.value) {
    process.fetchMyJobData()
  }
  process.fetchTempProcessData()
  showJobDrawer.value = true
}

// 提交审核
async function handleSubmitProcess(processId: number) {
  try {
    await ElMessageBox.confirm('确定要提交审核吗？', '提交审核', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'info'
    })
    const success = await process.submitProcess(processId)
    if (success) {
      ElMessage.success('提交成功')
      process.fetchMyJobData()
    } else {
      ElMessage.error('提交失败')
    }
  } catch {
    // 用户取消
  }
}

// 编辑工艺
async function handleEditProcess(row: any) {
  showJobDrawer.value = false
  process.editForm.processId = row.id
  process.editForm.name = row.name
  process.editForm.version = row.version
  process.isEdit.value = true
  
  // 如果有反馈列表，显示反馈
  if (row.feedback && row.feedback.length > 0) {
    process.showFeedback.value = true
    process.feedbackList.value = row.feedback
  }
  
  // 下载工艺
  const success = await process.downloadProcess(row.id)
  if (success) {
    process.startEdit()
  } else {
    ElMessage.error('下载工艺失败')
  }
}

// 删除工艺
async function handleDeleteProcess(processId: number) {
  try {
    await ElMessageBox.confirm('确定要删除该工艺吗？此操作不可恢复。', '删除确认', {
      confirmButtonText: '确定删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    const success = await process.deleteProcess(processId)
    if (success) {
      ElMessage.success('删除成功')
      process.fetchMyJobData()
    } else {
      ElMessage.error('删除失败')
    }
  } catch {
    // 用户取消
  }
}

// 继续编辑暂存工艺
async function handleContinueEdit(row: any) {
  showJobDrawer.value = false
  
  const success = await process.loadTempProcess(row.fileName)
  if (success) {
    if (row.mode === '修改' && row.processId) {
      process.editForm.processId = row.processId
      process.isEdit.value = true
    }
    process.startEdit()
  } else {
    ElMessage.error('加载暂存工艺失败')
  }
}

// 删除暂存工艺
async function handleDeleteTemp(fileName: string) {
  try {
    await ElMessageBox.confirm('确定要删除该暂存工艺吗？', '删除确认', {
      confirmButtonText: '确定删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    const success = await process.deleteTempProcess(fileName)
    if (success) {
      ElMessage.success('删除成功')
    } else {
      ElMessage.error('删除失败')
    }
  } catch {
    // 用户取消
  }
}

// 打开快捷检测项选择器
function handleOpenQuickSelector() {
  showQuickSelector.value = true
  if (process.quickTreeData.value.length === 0) {
    process.fetchQuickTestTree()
  }
}

// 选择快捷检测项分类
function handleSelectQuickCategory(categoryId: number) {
  process.fetchQuickTestData(categoryId)
}

// 添加快捷检测项
function handleAddQuickStep(name: string, desc: string) {
  if (process.currentStep.value === 2) {
    // 整体流程
    process.addQuickTotalStep(name, desc)
  } else if (process.currentStep.value === 3 && currentAreaData.value) {
    // 分区流程
    process.addQuickAreaStep(currentAreaData.value.id, name, desc)
  }
}

// 打开相机拍照
function handleOpenCamera(target: 'total' | 'area', areaId?: number, multiMode: boolean = false) {
  currentCameraTarget.value = target
  currentCameraAreaId.value = areaId || null
  cameraMultiMode.value = multiMode
  showCameraDialog.value = true
}

// 打开多图拼接
function handleOpenMultiPhoto(target: 'total' | 'area', areaId?: number) {
  currentCameraTarget.value = target
  currentCameraAreaId.value = areaId || null
  showMultiPhotoDialog.value = true
}

// 存储当前拍照的点位信息
const currentDetailInfo = ref<{ areaId: number; detailId: number } | null>(null)

// 处理拍照完成
function handlePhotoTaken(dataUrl: string) {
  // 如果是点位拍照
  if (currentDetailInfo.value) {
    const { areaId, detailId } = currentDetailInfo.value
    const area = process.currentArea.value.find(a => a.id === areaId)
    if (area) {
      const detail = area.detail.find(d => d.id === detailId)
      if (detail) {
        detail.url = dataUrl
        ElMessage.success('点位拍照成功')
      }
    }
    currentDetailInfo.value = null
    return
  }
  
  // 如果是留存项拍照（根据来源区分整体/分区）
  if (currentCameraTarget.value === 'pic' && currentEditPicId.value !== null) {
    let pic = null
    if (currentEditPicSource.value === 'total') {
      pic = process.currentTotal.value.pic.find(p => p.id === currentEditPicId.value)
    } else if (currentEditPicSource.value === 'area' && currentAreaData.value) {
      pic = currentAreaData.value.general.pic.find(p => p.id === currentEditPicId.value)
    }
    if (pic) {
      pic.url = dataUrl
      ElMessage.success('照片已保存到留存项')
    }
    currentEditPicId.value = null
    return
  }
  
  // 整体图片拍照
  if (currentCameraTarget.value === 'total') {
    process.setTotalImage(dataUrl)
  } else if (currentCameraTarget.value === 'area' && currentCameraAreaId.value) {
    process.setAreaImage(currentCameraAreaId.value, dataUrl)
  }
}

// 打开点位拍照 (处理 DetailEditor 组件的相机请求)
function handleOpenDetailCamera(target: { type: string; detailId: number }) {
  if (!currentAreaData.value) return
  
  currentDetailInfo.value = {
    areaId: currentAreaData.value.id,
    detailId: target.detailId
  }
  
  // 使用现有的相机对话框
  showCameraDialog.value = true
  cameraMultiMode.value = false
}

// 处理多张拍照完成
function handlePhotosTaken(dataUrls: string[]) {
  // 多张照片处理逻辑，可用于留存项等
  console.log('多张照片:', dataUrls)
}

// 处理多图拼接结果
function handleMultiPhotoUse(dataUrl: string) {
  // 如果是点位拍照
  if (currentDetailInfo.value) {
    const { areaId, detailId } = currentDetailInfo.value
    const area = process.currentArea.value.find(a => a.id === areaId)
    if (area) {
      const detail = area.detail.find(d => d.id === detailId)
      if (detail) {
        detail.url = dataUrl
        ElMessage.success('拼接图片已保存到点位')
      }
    }
    currentDetailInfo.value = null
    return
  }
  
  // 如果是留存项拍照（根据来源区分整体/分区）
  if (currentCameraTarget.value === 'pic' && currentEditPicId.value !== null) {
    let pic = null
    if (currentEditPicSource.value === 'total') {
      pic = process.currentTotal.value.pic.find(p => p.id === currentEditPicId.value)
    } else if (currentEditPicSource.value === 'area' && currentAreaData.value) {
      pic = currentAreaData.value.general.pic.find(p => p.id === currentEditPicId.value)
    }
    if (pic) {
      pic.url = dataUrl
      ElMessage.success('拼接图片已保存到留存项')
    }
    currentEditPicId.value = null
    return
  }
  
  // 整体图片拼接
  if (currentCameraTarget.value === 'total') {
    process.setTotalImage(dataUrl)
    ElMessage.success('拼接图片已保存到整体图')
  } else if (currentCameraTarget.value === 'area' && currentCameraAreaId.value) {
    process.setAreaImage(currentCameraAreaId.value, dataUrl)
    ElMessage.success('拼接图片已保存到分区')
  }
}

// ========== 留存项 PicEditor 事件处理 ==========

// 留存项 - 打开单张拍照（整体留存项）
function handlePicOpenCamera(picId: number) {
  console.log('handlePicOpenCamera 被调用, picId:', picId)
  currentEditPicId.value = picId
  currentEditPicSource.value = 'total'
  currentCameraTarget.value = 'pic'
  showCameraDialog.value = true
}

// 留存项 - 打开多图拼接（整体留存项）
function handlePicOpenMultiPhoto(picId: number) {
  console.log('handlePicOpenMultiPhoto 被调用, picId:', picId)
  currentEditPicId.value = picId
  currentEditPicSource.value = 'total'
  currentCameraTarget.value = 'pic'
  showMultiPhotoDialog.value = true
}

// 留存项 - 编辑图片（整体留存项）
function handlePicEditImage(picId: number) {
  console.log('handlePicEditImage 被调用, picId:', picId)
  const pic = process.currentTotal.value.pic.find(p => p.id === picId)
  console.log('找到的 pic:', pic)
  if (pic && pic.url) {
    currentEditPicId.value = picId
    currentEditPicSource.value = 'total'
    currentEditImageUrl.value = pic.url
    showImgEditor.value = true
  }
}

// ========== 分区留存项事件处理 ==========

// 分区留存项 - 打开单张拍照
function handleAreaPicOpenCamera(picId: number) {
  console.log('handleAreaPicOpenCamera 被调用, picId:', picId)
  currentEditPicId.value = picId
  currentEditPicSource.value = 'area'
  currentCameraTarget.value = 'pic'
  showCameraDialog.value = true
}

// 分区留存项 - 打开多图拼接
function handleAreaPicOpenMultiPhoto(picId: number) {
  console.log('handleAreaPicOpenMultiPhoto 被调用, picId:', picId)
  currentEditPicId.value = picId
  currentEditPicSource.value = 'area'
  currentCameraTarget.value = 'pic'
  showMultiPhotoDialog.value = true
}

// 分区留存项 - 编辑图片
function handleAreaPicEditImage(picId: number) {
  console.log('handleAreaPicEditImage 被调用, picId:', picId)
  if (!currentAreaData.value) return
  const pic = currentAreaData.value.general.pic.find(p => p.id === picId)
  console.log('找到的分区 pic:', pic)
  if (pic && pic.url) {
    currentEditPicId.value = picId
    currentEditPicSource.value = 'area'
    currentEditImageUrl.value = pic.url
    showImgEditor.value = true
  }
}

// 图片编辑器保存（支持整体留存项和分区留存项）
function handleImageEditorSave(dataUrl: string) {
  if (currentEditPicId.value !== null) {
    let pic = null
    // 根据来源查找对应的 pic 对象
    if (currentEditPicSource.value === 'total') {
      pic = process.currentTotal.value.pic.find(p => p.id === currentEditPicId.value)
    } else if (currentEditPicSource.value === 'area' && currentAreaData.value) {
      pic = currentAreaData.value.general.pic.find(p => p.id === currentEditPicId.value)
    }
    if (pic) {
      pic.url = dataUrl
    }
  }
  showImgEditor.value = false
  currentEditPicId.value = null
  ElMessage.success('编辑已保存')
}

// 导入离线JSON文件
function handleImportOfflineJson() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (file) {
      const success = await process.readOfflineJson(file)
      if (success) {
        process.startEdit()
      } else {
        ElMessage.error('导入失败，请检查文件格式')
      }
    }
  }
  input.click()
}

// 暂存当前工艺
async function handleSaveTempProcess() {
  if (!process.editForm.name || !process.editForm.version) {
    ElMessage.warning('请填写工艺名称和版本')
    return
  }
  
  const success = await process.saveTempProcess()
  if (success) {
    ElMessage.success('暂存成功')
  } else {
    ElMessage.error('暂存失败')
  }
}

// 导出工艺到文件
async function handleExportProcess() {
  const success = await process.exportProcessToFile()
  if (success) {
    ElMessage.success('导出成功')
  } else {
    ElMessage.error('导出失败')
  }
}

// 监听步骤变化，返回选择页时刷新数据
watch(() => process.currentStep.value, (newStep, oldStep) => {
  // 当从编辑步骤返回到选择页时，刷新待处理和暂存数据
  if (newStep === -1 && oldStep !== -1 && process.isOnlineMode.value) {
    process.fetchMyJobData()
    process.fetchTempProcessData()
  }
})

// 初始化
onMounted(() => {
  if (process.isOnlineMode.value) {
    process.fetchTreeData()
    process.fetchMyJobData()
    process.fetchTempProcessData()
  }
})
</script>

<template>
  <div class="process-visual-page">
    <!-- 页面标题 -->
    <div class="page-header" v-if="process.currentStep.value === -1">
      <div class="header-left">
        <Icon :icon="props.processType === 'eyes' ? 'mdi:eye-check-outline' : 'mdi:radioactive'" class="header-icon" />
        <div class="header-text">
          <h1>{{ props.processType === 'eyes' ? '目检工艺编辑' : 'X-Ray工艺编辑' }}</h1>
          <p>{{ props.processType === 'eyes' ? '电路板目检测试流程编辑' : '电路板X-Ray测试流程编辑' }}</p>
        </div>
      </div>
      
      <div class="header-actions">
        <!-- 工作菜单 -->
        <div class="work-menu">
          <button class="work-btn" @click="handleOpenJobDrawer">
            <Icon icon="mdi:briefcase-outline" />
            <span>工作</span>
            <span 
              v-if="process.tempProcessData.value.length > 0 || process.myJobData.value.length > 0"
              class="badge"
            >
              {{ process.tempProcessData.value.length + process.myJobData.value.length }}
            </span>
          </button>
        </div>
        
        <!-- 模式切换 -->
        <div class="mode-toggle">
          <button 
            class="mode-btn"
            :class="{ active: process.isOnlineMode.value }"
            @click="process.isOnlineMode.value = true"
          >
            <Icon icon="mdi:cloud-outline" />
            在线模式
          </button>
          <button 
            class="mode-btn"
            :class="{ active: !process.isOnlineMode.value }"
            @click="process.isOnlineMode.value = false"
          >
            <Icon icon="mdi:cloud-off-outline" />
            离线模式
          </button>
        </div>
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="main-content">
      <Transition mode="out-in" name="fade">
        <!-- 步骤 -1: 选择页面 -->
        <div v-if="process.currentStep.value === -1" key="select" class="select-page">
          <BoardSelector 
            :tree-data="process.treeData.value"
            :present-process="process.presentProcess.value"
            :selected-board-model="process.editForm.boardModel"
            :selected-board-model-id="process.editForm.boardModelId"
            :process-name="process.editForm.name"
            :process-version="process.editForm.version"
            :current-select-process="process.currentSelectProcess.value"
            :is-online="process.isOnlineMode.value"
            @update:selected-board-model="process.editForm.boardModel = $event"
            @update:selected-board-model-id="process.editForm.boardModelId = $event"
            @update:process-name="process.editForm.name = $event"
            @update:process-version="process.editForm.version = $event"
            @update:current-select-process="process.currentSelectProcess.value = $event"
            @node-click="handleNodeClick"
          />
        </div>

        <!-- 步骤 1-4: 编辑页面 -->
        <div v-else key="edit" class="edit-page">
          <!-- 步骤指示器 -->
          <ProcessSteps 
            :active="process.stepsActivate.value"
            :type="props.processType"
            @exit="handleExit"
          />

          <!-- 步骤 1: 图片分区 -->
          <div v-if="process.currentStep.value === 1 && !process.showPlane.value" class="step-content step-1">
            <!-- 裁剪区域 -->
            <div class="cropper-section">
              <div class="section-header">
                <div class="section-title">
                  <Icon icon="mdi:crop" />
                  <span>图片分区</span>
                </div>
                <div class="section-actions">
                  <button class="action-btn" @click="handleUploadImage">
                    <Icon icon="mdi:upload" />
                    上传图片
                  </button>
                  <button 
                    class="action-btn primary" 
                    @click="handleCutArea"
                    :disabled="!process.currentTotal.value.url"
                  >
                    <Icon icon="mdi:content-cut" />
                    截取分区
                  </button>
                </div>
              </div>
              
              <div class="cropper-area">
                <template v-if="process.currentTotal.value.url">
                  <img 
                    ref="imageRef"
                    :src="process.currentTotal.value.url" 
                    alt="原始图片"
                    class="cropper-image"
                  />
                  <!-- 裁剪框 -->
                  <div 
                    class="crop-box"
                    :style="{
                      left: cropBox.x + 'px',
                      top: cropBox.y + 'px',
                      width: cropBox.width + 'px',
                      height: cropBox.height + 'px'
                    }"
                    @mousedown="handleCropMouseDown"
                  >
                    <div class="crop-info">
                      {{ cropBox.width }} x {{ cropBox.height }}
                    </div>
                    <!-- 调整大小的手柄 -->
                    <div class="resize-handle resize-n" @mousedown="handleResizeMouseDown($event, 'n')"></div>
                    <div class="resize-handle resize-s" @mousedown="handleResizeMouseDown($event, 's')"></div>
                    <div class="resize-handle resize-e" @mousedown="handleResizeMouseDown($event, 'e')"></div>
                    <div class="resize-handle resize-w" @mousedown="handleResizeMouseDown($event, 'w')"></div>
                    <div class="resize-handle resize-ne" @mousedown="handleResizeMouseDown($event, 'ne')"></div>
                    <div class="resize-handle resize-nw" @mousedown="handleResizeMouseDown($event, 'nw')"></div>
                    <div class="resize-handle resize-se" @mousedown="handleResizeMouseDown($event, 'se')"></div>
                    <div class="resize-handle resize-sw" @mousedown="handleResizeMouseDown($event, 'sw')"></div>
                  </div>
                </template>
                <div v-else class="cropper-placeholder">
                  <Icon icon="mdi:image-plus" />
                  <span>请上传整体电路板图片</span>
                </div>
              </div>
            </div>

            <!-- 分区列表 -->
            <div class="areas-section">
              <div class="section-header">
                <div class="section-title">
                  <Icon icon="mdi:grid-large" />
                  <span>已分区 ({{ process.currentArea.value.length }})</span>
                </div>
              </div>
              
              <div class="areas-list">
                <AreaCard 
                  v-for="(area, index) in process.currentArea.value"
                  :key="area.id"
                  :id="area.id"
                  :url="area.url"
                  :index="index"
                  :is-selected="selectedAreaIndex === index"
                  :class="{ 'drag-over': dragToIndex === index && dragFromIndex !== index }"
                  @select="handleSelectArea"
                  @replace="handleReplaceArea"
                  @delete="handleDeleteArea"
                  @drag-start="handleAreaDragStart"
                  @drag-over="handleAreaDragOver"
                  @drag-end="handleAreaDragEnd"
                />
                
                <div v-if="process.currentArea.value.length === 0" class="empty-areas">
                  <Icon icon="mdi:grid-off" />
                  <span>暂无分区，请从图片中截取</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 步骤 1 弓曲度检查 (仅目检正面流程) -->
          <div v-if="process.currentStep.value === 1 && process.showPlane.value && process.currentProcess.value === 'eyes'" class="step-content step-plane">
            <div class="plane-section">
              <div class="section-header">
                <div class="section-title">
                  <Icon icon="mdi:ruler-square" />
                  <span>弓曲度检查 - 厚度设置</span>
                </div>
              </div>
              
              <div class="plane-form">
                <label class="form-label">电路板厚度 (mm)</label>
                <div class="input-group">
                  <input 
                    v-model="process.processJson.value.eyes.plane.size"
                    type="text"
                    placeholder="请输入厚度值"
                    class="form-input"
                  />
                  <span class="input-suffix">mm</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 步骤 2: 整体流程 -->
          <div v-if="process.currentStep.value === 2" class="step-content step-2">
            <!-- 整体示意图 -->
            <div class="total-image-section">
              <div class="section-header">
                <div class="section-title">
                  <Icon icon="mdi:image-outline" />
                  <span>{{ 
                    process.currentProcess.value === 'xray' ? '整体示意图' : 
                    process.currentProcess.value === 'eyesBak' ? '背面整体示意图' : '正面整体示意图' 
                  }}</span>
                </div>
              </div>
              <div class="total-image">
                <img 
                  v-if="process.currentTotal.value.url" 
                  :src="process.currentTotal.value.url" 
                  alt="整体图"
                />
                <div v-else class="no-image">
                  <Icon icon="mdi:image-off-outline" />
                </div>
              </div>
            </div>

            <!-- 检测项和留存项 -->
            <div class="flow-settings">
              <!-- 检测项设置 -->
              <div class="setting-panel">
                <div class="panel-header">
                  <div class="panel-title">
                    <Icon icon="mdi:clipboard-list-outline" />
                    <span>检测项设置</span>
                  </div>
                  <button class="add-btn" @click="process.addTotalStep">
                    <Icon icon="mdi:plus" />
                    新增
                  </button>
                </div>
                
                <div class="panel-content">
                  <StepEditor 
                    v-for="step in process.currentTotal.value.step"
                    :key="step.id"
                    :step="step"
                    @delete="process.deleteTotalStep"
                  />
                  
                  <div v-if="process.currentTotal.value.step.length === 0" class="empty-list">
                    <Icon icon="mdi:playlist-plus" />
                    <span>暂无检测项，点击新增按钮添加</span>
                  </div>
                </div>
              </div>

              <!-- 留存项设置 -->
              <div class="setting-panel">
                <div class="panel-header">
                  <div class="panel-title">
                    <Icon icon="mdi:image-multiple-outline" />
                    <span>留存项设置</span>
                  </div>
                  <button class="add-btn" @click="process.addTotalPic">
                    <Icon icon="mdi:plus" />
                    新增
                  </button>
                </div>
                
                <div class="panel-content">
                  <PicEditor 
                    v-for="pic in process.currentTotal.value.pic"
                    :key="pic.id"
                    :pic="pic"
                    :ori-url="process.currentTotal.value.url"
                    :device-type="cameraDeviceType"
                    :camera-handler="handlePicOpenCamera"
                    :multi-photo-handler="handlePicOpenMultiPhoto"
                    :edit-image-handler="handlePicEditImage"
                    @delete="process.deleteTotalPic"
                  />
                  
                  <div v-if="process.currentTotal.value.pic.length === 0" class="empty-list">
                    <Icon icon="mdi:image-plus" />
                    <span>暂无留存项，点击新增按钮添加</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 步骤 3: 分区流程 -->
          <div v-if="process.currentStep.value === 3" class="step-content step-3">
            <div class="area-editor">
              <!-- 分区选择 -->
              <div class="area-tabs">
                <button 
                  v-for="(area, index) in process.currentArea.value"
                  :key="area.id"
                  class="area-tab"
                  :class="{ active: selectedAreaIndex === index }"
                  @click="selectedAreaIndex = index"
                >
                  <span class="tab-num">{{ area.id }}</span>
                  <span class="tab-label">第{{ area.id }}区域</span>
                </button>
              </div>

              <!-- 分区内容 -->
              <div v-if="currentAreaData" class="area-content">
                <!-- 分区示意图 -->
                <div class="area-image-section">
                  <div class="area-image">
                    <img 
                      v-if="currentAreaData.url" 
                      :src="currentAreaData.url" 
                      alt="分区图"
                    />
                  </div>
                </div>

                <!-- 通用/具体切换 -->
                <div class="content-tabs">
                  <button 
                    class="content-tab"
                    :class="{ active: areaTab === 'general' }"
                    @click="areaTab = 'general'"
                  >
                    <Icon icon="mdi:format-list-checks" />
                    通用检测
                  </button>
                  <button 
                    class="content-tab"
                    :class="{ active: areaTab === 'detail' }"
                    @click="areaTab = 'detail'"
                  >
                    <Icon icon="mdi:target" />
                    具体点位
                  </button>
                </div>

                <!-- 通用检测 -->
                <div v-if="areaTab === 'general'" class="general-content">
                  <div class="flow-settings">
                    <!-- 检测项 -->
                    <div class="setting-panel">
                      <div class="panel-header">
                        <div class="panel-title">
                          <Icon icon="mdi:clipboard-list-outline" />
                          <span>检测项</span>
                        </div>
                        <button class="add-btn" @click="process.addAreaStep(currentAreaData.id)">
                          <Icon icon="mdi:plus" />
                          新增
                        </button>
                      </div>
                      
                      <div class="panel-content">
                        <StepEditor 
                          v-for="step in currentAreaData.general.step"
                          :key="step.id"
                          :step="step"
                          @delete="(id) => currentAreaData && process.deleteAreaStep(currentAreaData.id, id)"
                        />
                      </div>
                    </div>

                    <!-- 留存项 -->
                    <div class="setting-panel">
                      <div class="panel-header">
                        <div class="panel-title">
                          <Icon icon="mdi:image-multiple-outline" />
                          <span>留存项</span>
                        </div>
                        <button class="add-btn" @click="process.addAreaPic(currentAreaData.id)">
                          <Icon icon="mdi:plus" />
                          新增
                        </button>
                      </div>
                      
                      <div class="panel-content">
                        <PicEditor 
                          v-for="pic in currentAreaData.general.pic"
                          :key="pic.id"
                          :pic="pic"
                          :ori-url="currentAreaData.url"
                          :device-type="cameraDeviceType"
                          :camera-handler="handleAreaPicOpenCamera"
                          :multi-photo-handler="handleAreaPicOpenMultiPhoto"
                          :edit-image-handler="handleAreaPicEditImage"
                          @delete="(id) => currentAreaData && process.deleteAreaPic(currentAreaData.id, id)"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 具体点位 -->
                <div v-if="areaTab === 'detail'" class="detail-content">
                  <div class="detail-header">
                    <div class="header-left">
                      <Icon icon="mdi:map-marker-multiple" class="header-icon" />
                      <span>具体点位设置</span>
                      <span class="count-badge">{{ currentAreaData.detail?.length || 0 }}</span>
                    </div>
                    <button class="add-btn" @click="process.addAreaDetail(currentAreaData.id)">
                      <Icon icon="mdi:plus" />
                      新增点位
                    </button>
                  </div>
                  
                  <div class="detail-list">
                    <template v-if="currentAreaData.detail && currentAreaData.detail.length > 0">
                      <DetailEditor 
                        v-for="detail in currentAreaData.detail" 
                        :key="detail.id"
                        :detail="detail"
                        :ori-url="currentAreaData.url"
                        :device-type="props.processType === 'xray' ? 'xray' : 'micro'"
                        @delete="(id) => currentAreaData && process.deleteAreaDetail(currentAreaData.id, id)"
                        @open-camera="handleOpenDetailCamera"
                      />
                    </template>
                    <div v-else class="empty-detail">
                      <Icon icon="mdi:map-marker-plus-outline" />
                      <span>暂无具体点位</span>
                      <span class="hint">点击上方"新增点位"按钮添加</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 步骤 4: 预览导出 -->
          <div v-if="process.currentStep.value === 4" class="step-content step-4">
            <!-- X-Ray 流程预览 -->
            <template v-if="props.processType === 'xray'">
              <ProcessPreview 
                :data="process.processJson.value.xray"
                :has-plane="false"
                title="X-Ray流程预览"
              />
            </template>
            
            <!-- 目检流程预览 (正面 + 可选背面) -->
            <template v-else>
              <!-- 正面流程预览 -->
              <div v-if="process.currentProcess.value === 'eyes'" class="preview-full">
                <ProcessPreview 
                  :data="process.processJson.value.eyes"
                  :has-plane="true"
                  title="目检流程预览"
                />
              </div>
              
              <!-- 正面 + 背面并排预览 (创建了背面的情况) -->
              <div v-else class="preview-dual">
                <ProcessPreview 
                  :data="process.processJson.value.eyes"
                  :has-plane="true"
                  title="正面目检流程预览"
                />
                <ProcessPreview 
                  :data="process.processJson.value.eyesBak"
                  :has-plane="false"
                  title="背面目检流程预览"
                />
              </div>
            </template>
          </div>
        </div>
      </Transition>
    </div>

    <!-- 底部操作栏 -->
    <div class="bottom-bar">
      <!-- 选择页面 -->
      <template v-if="process.currentStep.value === -1">
        <!-- 离线模式: 导入按钮 -->
        <button 
          v-if="!process.isOnlineMode.value" 
          class="secondary-btn"
          @click="handleImportOfflineJson"
        >
          <Icon icon="mdi:file-import-outline" />
          导入JSON
        </button>
        <div v-else></div>
        
        <button 
          class="primary-btn"
          :disabled="!process.editForm.name || !process.editForm.version"
          @click="handleStartEdit"
        >
          开始编辑
          <Icon icon="mdi:arrow-right" />
        </button>
      </template>

      <!-- 编辑页面 -->
      <template v-else>
        <div class="bottom-left">
          <button class="secondary-btn" @click="process.prevStep">
            <Icon icon="mdi:arrow-left" />
            上一步
          </button>
          
          <!-- 暂存按钮 -->
          <button class="secondary-btn" @click="handleSaveTempProcess" title="暂存到本地">
            <Icon icon="mdi:content-save-outline" />
            暂存
          </button>
          
          <!-- 修改意见按钮 (待修改状态时显示) -->
          <el-popover 
            v-if="process.showFeedback.value && process.feedbackList.value.length > 0"
            placement="top" 
            :width="Math.min(process.feedbackList.value.length * 320, 960)"
            trigger="click"
          >
            <template #reference>
              <button class="secondary-btn danger" title="查看修改意见">
                <Icon icon="mdi:lightbulb-on-outline" />
                修改意见
              </button>
            </template>
            <div class="feedback-list">
              <div 
                v-for="(item, index) in process.feedbackList.value" 
                :key="index"
                class="feedback-item"
              >
                <div class="feedback-header">第{{ index + 1 }}次审核意见</div>
                <div class="feedback-content">{{ item }}</div>
              </div>
            </div>
          </el-popover>
          
          <!-- 快捷检测项按钮 (仅在步骤2/3显示) -->
          <button 
            v-if="process.currentStep.value === 2 || process.currentStep.value === 3" 
            class="secondary-btn"
            @click="handleOpenQuickSelector"
            title="快捷检测项"
          >
            <Icon icon="mdi:lightning-bolt" />
            快捷
          </button>
          
          <!-- 拍照按钮下拉菜单 (仅在步骤1/2显示) -->
          <div 
            v-if="process.currentStep.value === 1 || process.currentStep.value === 2" 
            class="photo-dropdown"
          >
            <button 
              class="secondary-btn"
              @click="showPhotoDropdown = !showPhotoDropdown"
            >
              <Icon icon="mdi:camera" />
              拍照
              <Icon icon="mdi:chevron-down" class="dropdown-arrow" />
            </button>
            <Transition name="dropdown">
              <div v-show="showPhotoDropdown" class="photo-dropdown-menu" @click="showPhotoDropdown = false">
                <button class="photo-menu-item" @click="handleOpenCamera('total')">
                  <Icon icon="mdi:image" />
                  拍摄单张
                </button>
                <button class="photo-menu-item" @click="handleOpenMultiPhoto('total')">
                  <Icon icon="mdi:image-multiple" />
                  多张拼图
                </button>
              </div>
            </Transition>
          </div>
        </div>
        
        <div class="bottom-right">
          <template v-if="process.currentStep.value < 4">
            <button 
              class="primary-btn" 
              @click="process.nextStep"
              :disabled="process.currentStep.value === 1 && process.currentArea.value.length === 0"
            >
              下一步
              <Icon icon="mdi:arrow-right" />
            </button>
          </template>
          
          <template v-else>
            <!-- 导出按钮 -->
            <button class="secondary-btn" @click="handleExportProcess">
              <Icon icon="mdi:download-outline" />
              导出
            </button>
            
            <!-- 上传按钮 -->
            <button 
              class="primary-btn success"
              :disabled="process.isUploading.value"
              @click="handleUpload"
            >
              <Icon v-if="process.isUploading.value" icon="mdi:loading" class="spin" />
              <template v-else>
                {{ process.isEdit.value ? '完成修改并上传' : '完成并上传' }}
                <Icon icon="mdi:cloud-upload" />
              </template>
            </button>
          </template>
        </div>
      </template>
    </div>

    <!-- 加载遮罩 -->
    <Transition name="fade">
      <div v-if="process.isLoading.value || process.jsonLoading.value" class="loading-overlay">
        <div class="loading-content">
          <Icon icon="mdi:loading" class="loading-icon spin" />
          <span>{{ process.jsonLoading.value ? '正在加载工艺数据...' : '加载中...' }}</span>
          <div v-if="process.downloadProgress.value > 0" class="progress-wrapper">
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: process.downloadProgress.value + '%' }"></div>
            </div>
            <span class="progress-text">{{ process.downloadProgress.value }}%</span>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 工作抽屉 -->
    <JobDrawer
      v-model:visible="showJobDrawer"
      :my-job-data="process.myJobData.value"
      :temp-process-data="process.tempProcessData.value"
      :process-type="props.processType"
      @submit-process="handleSubmitProcess"
      @edit-process="handleEditProcess"
      @delete-process="handleDeleteProcess"
      @continue-edit="handleContinueEdit"
      @delete-temp="handleDeleteTemp"
    />

    <!-- 快捷检测项选择器 -->
    <QuickStepSelector
      v-model:visible="showQuickSelector"
      :tree-data="process.quickTreeData.value"
      :table-data="process.quickTableData.value"
      :tree-loading="process.quickTreeLoading.value"
      :table-loading="process.quickTableLoading.value"
      :selected-id="process.selectQuickId.value"
      @select-category="handleSelectQuickCategory"
      @add-step="handleAddQuickStep"
    />

    <!-- 拍照对话框 -->
    <CameraDialog
      v-model:visible="showCameraDialog"
      :multi-mode="cameraMultiMode"
      :device-type="cameraDeviceType"
      @photo-taken="handlePhotoTaken"
      @photos-taken="handlePhotosTaken"
    />

    <!-- 多图拼接对话框 -->
    <MultiPhotoDialog
      v-model:visible="showMultiPhotoDialog"
      :device-type="cameraDeviceType"
      @use="handleMultiPhotoUse"
    />

    <!-- 图片编辑器对话框 -->
    <Teleport to="body">
      <Transition name="dialog-fade">
        <div v-if="showImgEditor" class="img-editor-overlay">
          <div class="img-editor-dialog">
            <div class="img-editor-header">
              <span>图片编辑</span>
              <button class="close-btn" @click="showImgEditor = false">
                <Icon icon="mdi:close" />
              </button>
            </div>
            <div class="img-editor-body">
              <ImgEditor
                :img-url="currentEditImageUrl"
                @save="handleImageEditorSave"
              />
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.process-visual-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  color: var(--color-text-primary);
}

/* 页面头部 */
.page-header {
  border: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  background: var(--color-bg-secondary);
  border-radius: 16px;
  margin-bottom: 20px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.header-icon {
  font-size: 36px;
  color: var(--color-accent-purple);
}

.header-text h1 {
  font-size: 22px;
  font-weight: 700;
  margin: 0;
}

.header-text p {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin: 4px 0 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.work-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--color-bg-tertiary);
  border: none;
  border-radius: 10px;
  font-size: 14px;
  color: var(--color-text-primary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.work-btn:hover {
  background: var(--color-bg-hover);
}

.badge {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  background: #ef4444;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  color: white;
}

.mode-toggle {
  display: flex;
  background: var(--color-bg-tertiary);
  border-radius: 10px;
  padding: 4px;
}

.mode-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: transparent;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.mode-btn.active {
  background: var(--color-accent-blue);
  color: white;
}

/* 主内容区 */
.main-content {
  flex: 1;
  overflow: hidden;
}

.select-page,
.edit-page {
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* 步骤内容 */
.step-content {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  
}

/* 步骤1 样式 */
.step-1 {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.cropper-section,
.areas-section {
  border: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  border-radius: 12px;
  padding: 16px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 600;
}

.section-actions {
  display: flex;
  gap: 10px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--color-bg-tertiary);
  border: none;
  border-radius: 8px;
  font-size: 14px;
  color: var(--color-text-primary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-btn:hover {
  background: var(--color-bg-hover);
}

.action-btn.primary {
  background: var(--color-accent-blue);
  color: white;
}

.action-btn.primary:hover {
  opacity: 0.9;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.cropper-area {
  position: relative;
  height: 280px;
  background: var(--color-bg-tertiary);
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cropper-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.crop-box {
  position: absolute;
  border: 2px solid var(--color-accent-blue);
  background: rgba(88, 166, 255, 0.1);
  cursor: move;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.4);
}

.crop-info {
  position: absolute;
  bottom: -24px;
  left: 50%;
  transform: translateX(-50%);
  padding: 2px 8px;
  background: var(--color-accent-blue);
  border-radius: 4px;
  font-size: 11px;
  color: white;
  white-space: nowrap;
}

/* 调整大小手柄 */
.resize-handle {
  position: absolute;
  background: var(--color-accent-blue);
  border: 1px solid white;
  z-index: 10;
}

/* 四边手柄 */
.resize-n, .resize-s {
  left: 50%;
  transform: translateX(-50%);
  width: 24px;
  height: 6px;
  cursor: ns-resize;
}
.resize-n { top: -3px; }
.resize-s { bottom: -3px; }

.resize-e, .resize-w {
  top: 50%;
  transform: translateY(-50%);
  width: 6px;
  height: 24px;
  cursor: ew-resize;
}
.resize-e { right: -3px; }
.resize-w { left: -3px; }

/* 四角手柄 */
.resize-ne, .resize-nw, .resize-se, .resize-sw {
  width: 10px;
  height: 10px;
  border-radius: 2px;
}
.resize-ne { top: -5px; right: -5px; cursor: nesw-resize; }
.resize-nw { top: -5px; left: -5px; cursor: nwse-resize; }
.resize-se { bottom: -5px; right: -5px; cursor: nwse-resize; }
.resize-sw { bottom: -5px; left: -5px; cursor: nesw-resize; }

.cropper-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--color-text-tertiary);
}

.cropper-placeholder .iconify {
  font-size: 48px;
  opacity: 0.5;
}

.areas-list {
  display: flex;
  gap: 16px;
  padding: 8px 0;
  overflow-x: auto;
}

/* 分区拖拽状态 */
.areas-list :deep(.area-card.drag-over) {
  border-color: var(--color-accent-blue) !important;
  box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.3) !important;
}

.empty-areas {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 40px;
  color: var(--color-text-tertiary);
  font-size: 14px;
}

/* 步骤2 样式 */
.step-2 {
  display: flex;
  flex-direction: column;
  gap: 20px;
  flex: 1;
  min-height: 0; /* 允许flex子项缩小 */
  overflow: hidden !important; /* 防止溢出，覆盖 step-content 的 overflow-y */
}

.total-image-section {
  border: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  border-radius: 12px;
  padding: 16px;
  flex-shrink: 0; /* 不压缩，保持固定高度 */
}

.total-image {
  border: 1px solid var(--color-border);
  height: 180px;
  background: var(--color-bg-tertiary);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.total-image img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.no-image {
  font-size: 48px;
  color: var(--color-text-tertiary);
  opacity: 0.5;
}

.flow-settings {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  flex: 1;
  min-height: 0; /* 允许flex子项缩小 */
  overflow: hidden; /* 防止内容溢出 */
  /* 确保网格项填满可用高度 */
  align-items: stretch;
}

.setting-panel {
  border: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden; /* 确保子元素滚动生效 */
  /* 关键：使用 calc 明确高度 */
  height: 100%;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--color-border);
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
  font-weight: 600;
}

.add-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--color-accent-blue);
  border: none;
  border-radius: 8px;
  font-size: 13px;
  color: white;
  cursor: pointer;
  transition: all 0.2s ease;
}

.add-btn:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

.panel-content {
  /* 关键修复：flex-grow + flex-basis: 0 强制启用滚动 */
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 12px;
}

/* 为 panel-content 内的子元素添加间距 */
.panel-content > * + * {
  margin-top: 10px;
}

.empty-list {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 20px;
  color: var(--color-text-tertiary);
  font-size: 14px;
}

.empty-list .iconify {
  font-size: 32px;
  opacity: 0.5;
}

/* 步骤3 样式 */
.step-3 {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.area-editor {
  border: 1px solid var(--color-border);
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-secondary);
  border-radius: 12px;
  overflow: hidden;
}

.area-tabs {
  display: flex;
  gap: 8px;
  padding: 16px;
  border-bottom: 1px solid var(--color-border);
  overflow-x: auto;
}

.area-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--color-bg-tertiary);
  border: none;
  border-radius: 8px;
  font-size: 14px;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.area-tab:hover {
  background: var(--color-bg-hover);
}

.area-tab.active {
  background: var(--color-accent-blue);
  color: white;
}

.tab-num {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
}

.area-content {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.area-image-section {
  margin-bottom: 16px;
}

.area-image {
  border: 1px solid var(--color-border);
  height: 160px;
  background: var(--color-bg-tertiary);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.area-image img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.content-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.content-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: var(--color-bg-tertiary);
  border: none;
  border-radius: 8px;
  font-size: 14px;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.content-tab:hover {
  background: var(--color-bg-hover);
}

.content-tab.active {
  background: var(--color-accent-blue);
  color: white;
}

.general-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.general-content .flow-settings {
  flex: 1;
  min-height: 0;
}

.detail-content {
  border: 1px solid var(--color-border);
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-tertiary);
  border-radius: 10px;
  padding: 16px;
  min-height: 0;
  overflow: hidden;
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  font-size: 15px;
  font-weight: 600;
  flex-shrink: 0;
}

.detail-header .header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.detail-header .header-icon {
  font-size: 20px;
  color: var(--color-accent-purple);
}

.detail-header .count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  background: var(--color-accent-purple);
  color: white;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
}

.detail-list {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  overflow-y: auto;
  min-height: 0;
  align-content: start;
}

.detail-list::-webkit-scrollbar {
  width: 6px;
}

.detail-list::-webkit-scrollbar-track {
  background: transparent;
}

.detail-list::-webkit-scrollbar-thumb {
  background: var(--color-scrollbar);
  border-radius: 3px;
}

.empty-detail {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 60px 20px;
  color: var(--color-text-tertiary);
  text-align: center;
}

.empty-detail .iconify {
  font-size: 48px;
  opacity: 0.5;
}

.empty-detail .hint {
  font-size: 12px;
  opacity: 0.7;
}

.detail-item {
  background: var(--color-bg-secondary);
  border-radius: 8px;
  padding: 12px;
}

.detail-header-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.detail-num {
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

.detail-name-input {
  flex: 1;
  padding: 10px 14px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 14px;
  color: var(--color-text-primary);
}

.detail-name-input:focus {
  outline: none;
  border-color: var(--color-accent-purple);
}

.delete-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: var(--color-text-tertiary);
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 18px;
}

.delete-btn:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

/* 步骤4 样式 */
.step-4 {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
}

.preview-full {
  width: 100%;
  height: 100%;
}

.preview-dual {
  
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  height: 100%;
}

/* 弓曲度检查 */
.step-plane {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
}

.plane-section {
  width: 100%;
  max-width: 500px;
  background: var(--color-bg-secondary);
  border-radius: 12px;
  padding: 24px;
}

.plane-form {
  margin-top: 20px;
}

.form-label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
}

.input-group {
  display: flex;
  align-items: center;
}

.form-input {
  flex: 1;
  padding: 14px 16px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 8px 0 0 8px;
  font-size: 16px;
  color: var(--color-text-primary);
}

.form-input:focus {
  outline: none;
  border-color: var(--color-accent-blue);
}

.input-suffix {
  padding: 14px 20px;
  background: var(--color-accent-blue);
  border-radius: 0 8px 8px 0;
  font-size: 14px;
  font-weight: 600;
  color: white;
}

/* 底部操作栏 */
.bottom-bar {
  border: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background: var(--color-bg-secondary);
  border-radius: 12px;
  margin-top: 20px;
}

.primary-btn,
.secondary-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.primary-btn {
  background: var(--color-accent-blue);
  color: white;
}

.primary-btn:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

.primary-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.primary-btn.success {
  background: #22c55e;
}

.secondary-btn {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

.secondary-btn:hover {
  background: var(--color-bg-hover);
}

.secondary-btn.danger {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.secondary-btn.danger:hover {
  background: rgba(239, 68, 68, 0.25);
}

/* 修改意见列表 */
.feedback-list {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.feedback-item {
  flex: 0 0 300px;
  background: var(--color-bg-secondary);
  border-radius: 8px;
  padding: 12px;
  border: 1px solid var(--color-border);
}

.feedback-header {
  font-weight: 600;
  font-size: 14px;
  color: var(--color-text-primary);
  margin-bottom: 8px;
}

.feedback-content {
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

/* 拍照下拉菜单 */
.photo-dropdown {
  position: relative;
}

.dropdown-arrow {
  font-size: 14px;
  margin-left: 2px;
  transition: transform 0.2s;
}

.photo-dropdown-menu {
  position: absolute;
  bottom: 100%;
  left: 0;
  margin-bottom: 8px;
  min-width: 150px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  z-index: 100;
  overflow: hidden;
}

.photo-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 16px;
  background: transparent;
  border: none;
  color: var(--color-text-primary);
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
  text-align: left;
}

.photo-menu-item:hover {
  background: var(--color-bg-hover);
}

.photo-menu-item :deep(svg) {
  color: var(--color-text-secondary);
  font-size: 18px;
}

/* 下拉菜单动画 */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.2s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

/* 加载遮罩 */
.loading-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 32px 48px;
  background: var(--color-bg-secondary);
  border-radius: 16px;
  color: var(--color-text-primary);
}

.loading-icon {
  font-size: 48px;
  color: var(--color-accent-blue);
}

/* 动画 */
.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 底部操作栏增强 */
.bottom-left,
.bottom-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* 进度条 */
.progress-wrapper {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
}

.progress-bar {
  width: 200px;
  height: 6px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--color-accent-blue);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-accent-blue);
  min-width: 40px;
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

.img-editor-dialog {
  width: 90%;
  max-width: 1200px;
  height: 90%;
  max-height: 900px;
  background: var(--color-bg-secondary);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.img-editor-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.img-editor-header .close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s;
}

.img-editor-header .close-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.img-editor-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* 弹窗动画 */
.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: all 0.3s ease;
}

.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
}

.dialog-fade-enter-from .img-editor-dialog,
.dialog-fade-leave-to .img-editor-dialog {
  transform: scale(0.95);
}
</style>
