<script setup lang="ts">
/**
 * 图片编辑器组件
 * 使用 Fabric.js v5 实现图片标注功能
 * 支持交互式绘制：鼠标拖动绘制形状和箭头
 */
import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { fabric } from 'fabric'
import { Icon } from '@iconify/vue'

// Props
const props = defineProps<{
  imgUrl: string
}>()

// Emits
const emit = defineEmits<{
  save: [dataUrl: string]
}>()

// Canvas 引用
const canvasRef = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)
let fabricCanvas: fabric.Canvas | null = null

// 原图信息
const originalImageInfo = ref<{
  width: number
  height: number
  scale: number
  left: number
  top: number
} | null>(null)

// 背景图片对象引用
let backgroundImageObj: fabric.Image | null = null

// 工具状态 - 默认颜色红色
const currentTool = ref<'select' | 'draw' | 'rect' | 'circle' | 'triangle' | 'text' | 'arrow'>('select')
const strokeColor = ref('#ff0000')
const strokeWidth = ref(3)
const fillColor = ref('transparent')
const fontSize = ref(20)

// 绘制状态
let isDrawing = false
let startX = 0
let startY = 0
let currentShape: fabric.Object | null = null

// 缩放状态
const zoomLevel = ref(1)
const MIN_ZOOM = 0.1
const MAX_ZOOM = 5

// 历史记录
const historyStack = ref<string[]>([])
const historyIndex = ref(-1)
const isHistoryAction = ref(false)

// 保存历史状态
function saveHistory() {
  if (isHistoryAction.value || !fabricCanvas) return
  
  const json = JSON.stringify(fabricCanvas.toJSON())
  if (historyIndex.value < historyStack.value.length - 1) {
    historyStack.value = historyStack.value.slice(0, historyIndex.value + 1)
  }
  historyStack.value.push(json)
  historyIndex.value = historyStack.value.length - 1
  
  if (historyStack.value.length > 50) {
    historyStack.value.shift()
    historyIndex.value--
  }
}

// 撤销
function undo() {
  if (historyIndex.value <= 0 || !fabricCanvas) return
  
  isHistoryAction.value = true
  historyIndex.value--
  fabricCanvas.loadFromJSON(historyStack.value[historyIndex.value], () => {
    fabricCanvas?.renderAll()
    isHistoryAction.value = false
  })
}

// 重做
function redo() {
  if (historyIndex.value >= historyStack.value.length - 1 || !fabricCanvas) return
  
  isHistoryAction.value = true
  historyIndex.value++
  fabricCanvas.loadFromJSON(historyStack.value[historyIndex.value], () => {
    fabricCanvas?.renderAll()
    isHistoryAction.value = false
  })
}

// 初始化 Canvas
function initCanvas() {
  if (!canvasRef.value || !containerRef.value) return
  
  const containerWidth = containerRef.value.clientWidth
  const containerHeight = containerRef.value.clientHeight
  
  fabricCanvas = new fabric.Canvas(canvasRef.value, {
    width: containerWidth,
    height: containerHeight,
    backgroundColor: '#1e1e1e',
    selection: true,
  })
  
  if (props.imgUrl) {
    loadImage(props.imgUrl)
  }
  
  // 事件监听
  fabricCanvas.on('object:modified', saveHistory)
  fabricCanvas.on('mouse:wheel', handleMouseWheel)
  fabricCanvas.on('mouse:down', handleMouseDown)
  fabricCanvas.on('mouse:move', handleMouseMove)
  fabricCanvas.on('mouse:up', handleMouseUp)
  
  saveHistory()
}

// 加载图片
function loadImage(url: string) {
  if (!fabricCanvas || !containerRef.value) return
  
  fabric.Image.fromURL(url, (img) => {
    if (!fabricCanvas || !containerRef.value) return
    
    const containerWidth = containerRef.value.clientWidth
    const containerHeight = containerRef.value.clientHeight
    const imgWidth = img.width || 1
    const imgHeight = img.height || 1
    
    // 计算缩放以适应容器
    const scaleX = (containerWidth - 40) / imgWidth
    const scaleY = (containerHeight - 40) / imgHeight
    const scale = Math.min(scaleX, scaleY, 1)
    
    const left = (containerWidth - imgWidth * scale) / 2
    const top = (containerHeight - imgHeight * scale) / 2
    
    // 保存原图信息
    originalImageInfo.value = { width: imgWidth, height: imgHeight, scale, left, top }
    
    img.set({
      scaleX: scale,
      scaleY: scale,
      left,
      top,
      selectable: false,
      evented: false,
    })
    
    // 移除旧背景
    if (backgroundImageObj) {
      fabricCanvas.remove(backgroundImageObj)
    }
    
    // 添加为第一个对象
    backgroundImageObj = img
    fabricCanvas.add(img)
    img.sendToBack()
    fabricCanvas.renderAll()
    zoomLevel.value = 1
    
    console.log('图片加载成功:', imgWidth, 'x', imgHeight)
  }, { crossOrigin: 'anonymous' })
}

// 鼠标滚轮缩放
function handleMouseWheel(opt: fabric.IEvent<WheelEvent>) {
  if (!fabricCanvas) return
  
  const delta = opt.e.deltaY
  let zoom = fabricCanvas.getZoom()
  zoom *= 0.999 ** delta
  zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom))
  
  const point = new fabric.Point(opt.e.offsetX, opt.e.offsetY)
  fabricCanvas.zoomToPoint(point, zoom)
  zoomLevel.value = zoom
  
  opt.e.preventDefault()
  opt.e.stopPropagation()
}

// 获取鼠标在 canvas 上的坐标（考虑缩放和平移）
function getPointer(e: fabric.IEvent<MouseEvent>): { x: number; y: number } {
  if (!fabricCanvas) return { x: 0, y: 0 }
  const pointer = fabricCanvas.getPointer(e.e)
  return { x: pointer.x, y: pointer.y }
}

// 鼠标按下 - 开始绘制
function handleMouseDown(e: fabric.IEvent<MouseEvent>) {
  if (!fabricCanvas) return
  
  const tool = currentTool.value
  
  // 选择和自由绘制模式不处理
  if (tool === 'select' || tool === 'draw') return
  
  // 如果点击到了已有对象，不开始绘制
  if (e.target && e.target !== backgroundImageObj) return
  
  const pointer = getPointer(e)
  startX = pointer.x
  startY = pointer.y
  isDrawing = true
  
  // 禁用选择
  fabricCanvas.selection = false
  
  // 根据工具类型创建初始形状
  switch (tool) {
    case 'rect':
      currentShape = new fabric.Rect({
        left: startX,
        top: startY,
        width: 0,
        height: 0,
        fill: fillColor.value,
        stroke: strokeColor.value,
        strokeWidth: strokeWidth.value,
        selectable: false,
      })
      break
    case 'circle':
      currentShape = new fabric.Ellipse({
        left: startX,
        top: startY,
        rx: 0,
        ry: 0,
        fill: fillColor.value,
        stroke: strokeColor.value,
        strokeWidth: strokeWidth.value,
        selectable: false,
      })
      break
    case 'triangle':
      currentShape = new fabric.Triangle({
        left: startX,
        top: startY,
        width: 0,
        height: 0,
        fill: fillColor.value,
        stroke: strokeColor.value,
        strokeWidth: strokeWidth.value,
        selectable: false,
      })
      break
    case 'arrow':
      // 箭头使用线条，稍后在 mouseUp 时添加箭头
      currentShape = new fabric.Line([startX, startY, startX, startY], {
        stroke: strokeColor.value,
        strokeWidth: strokeWidth.value,
        selectable: false,
      })
      break
    case 'text':
      // 文字直接在点击位置添加
      isDrawing = false
      const text = new fabric.IText('文字', {
        left: startX,
        top: startY,
        fontSize: fontSize.value,
        fill: strokeColor.value,
        fontFamily: 'Microsoft YaHei, sans-serif',
      })
      fabricCanvas.add(text)
      fabricCanvas.setActiveObject(text)
      text.enterEditing()
      text.selectAll()
      saveHistory()
      setTool('select')
      return
  }
  
  if (currentShape) {
    fabricCanvas.add(currentShape)
    fabricCanvas.renderAll()
  }
}

// 鼠标移动 - 更新形状大小
function handleMouseMove(e: fabric.IEvent<MouseEvent>) {
  if (!isDrawing || !currentShape || !fabricCanvas) return
  
  const pointer = getPointer(e)
  const tool = currentTool.value
  
  switch (tool) {
    case 'rect':
      updateRect(pointer.x, pointer.y)
      break
    case 'circle':
      updateEllipse(pointer.x, pointer.y)
      break
    case 'triangle':
      updateTriangle(pointer.x, pointer.y)
      break
    case 'arrow':
      updateArrowLine(pointer.x, pointer.y)
      break
  }
  
  fabricCanvas.renderAll()
}

// 更新矩形
function updateRect(x: number, y: number) {
  if (!currentShape) return
  const rect = currentShape as fabric.Rect
  
  const width = Math.abs(x - startX)
  const height = Math.abs(y - startY)
  const left = Math.min(startX, x)
  const top = Math.min(startY, y)
  
  rect.set({ left, top, width, height })
}

// 更新椭圆
function updateEllipse(x: number, y: number) {
  if (!currentShape) return
  const ellipse = currentShape as fabric.Ellipse
  
  const rx = Math.abs(x - startX) / 2
  const ry = Math.abs(y - startY) / 2
  const left = Math.min(startX, x)
  const top = Math.min(startY, y)
  
  ellipse.set({ left, top, rx, ry })
}

// 更新三角形
function updateTriangle(x: number, y: number) {
  if (!currentShape) return
  const triangle = currentShape as fabric.Triangle
  
  const width = Math.abs(x - startX)
  const height = Math.abs(y - startY)
  const left = Math.min(startX, x)
  const top = Math.min(startY, y)
  
  triangle.set({ left, top, width, height })
}

// 更新箭头线条
function updateArrowLine(x: number, y: number) {
  if (!currentShape) return
  const line = currentShape as fabric.Line
  line.set({ x2: x, y2: y })
}

// 鼠标释放 - 完成绘制
function handleMouseUp(_e: fabric.IEvent<MouseEvent>) {
  if (!isDrawing || !fabricCanvas) return
  
  isDrawing = false
  fabricCanvas.selection = true
  
  const tool = currentTool.value
  
  if (currentShape) {
    // 箭头需要特殊处理：添加箭头
    if (tool === 'arrow') {
      const line = currentShape as fabric.Line
      const x1 = line.x1 || 0
      const y1 = line.y1 || 0
      const x2 = line.x2 || 0
      const y2 = line.y2 || 0
      
      // 计算箭头角度
      const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI
      
      // 创建箭头头部
      const headLength = 15
      const arrowHead = new fabric.Triangle({
        left: x2,
        top: y2,
        width: headLength,
        height: headLength * 1.5,
        fill: strokeColor.value,
        angle: angle + 90,
        originX: 'center',
        originY: 'center',
        selectable: false,
      })
      
      // 移除临时线条，创建组合
      fabricCanvas.remove(currentShape)
      
      const finalLine = new fabric.Line([x1, y1, x2, y2], {
        stroke: strokeColor.value,
        strokeWidth: strokeWidth.value,
      })
      
      const arrow = new fabric.Group([finalLine, arrowHead], {
        selectable: true,
      })
      
      fabricCanvas.add(arrow)
      fabricCanvas.setActiveObject(arrow)
      currentShape = null
    } else {
      // 其他形状：设置为可选择
      currentShape.set({ selectable: true })
      fabricCanvas.setActiveObject(currentShape)
      currentShape = null
    }
    
    saveHistory()
  }
  
  fabricCanvas.renderAll()
}

// 缩放控制
function zoomIn() {
  if (!fabricCanvas) return
  let zoom = fabricCanvas.getZoom() * 1.2
  zoom = Math.min(MAX_ZOOM, zoom)
  fabricCanvas.setZoom(zoom)
  zoomLevel.value = zoom
}

function zoomOut() {
  if (!fabricCanvas) return
  let zoom = fabricCanvas.getZoom() / 1.2
  zoom = Math.max(MIN_ZOOM, zoom)
  fabricCanvas.setZoom(zoom)
  zoomLevel.value = zoom
}

function resetZoom() {
  if (!fabricCanvas) return
  fabricCanvas.setZoom(1)
  fabricCanvas.setViewportTransform([1, 0, 0, 1, 0, 0])
  zoomLevel.value = 1
}

// 设置工具
function setTool(tool: typeof currentTool.value) {
  currentTool.value = tool
  
  if (!fabricCanvas) return
  
  fabricCanvas.isDrawingMode = false
  fabricCanvas.selection = tool === 'select'
  
  // 设置光标样式
  if (tool === 'select') {
    fabricCanvas.defaultCursor = 'default'
    fabricCanvas.hoverCursor = 'move'
  } else if (tool === 'draw') {
    fabricCanvas.isDrawingMode = true
    fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas)
    fabricCanvas.freeDrawingBrush.color = strokeColor.value
    fabricCanvas.freeDrawingBrush.width = strokeWidth.value
  } else {
    fabricCanvas.defaultCursor = 'crosshair'
    fabricCanvas.hoverCursor = 'crosshair'
  }
  
  // 取消当前选择
  fabricCanvas.discardActiveObject()
  fabricCanvas.renderAll()
}

// 删除选中
function deleteSelected() {
  if (!fabricCanvas) return
  
  const activeObjects = fabricCanvas.getActiveObjects()
  if (activeObjects.length) {
    activeObjects.forEach(obj => fabricCanvas!.remove(obj))
    fabricCanvas.discardActiveObject()
    fabricCanvas.renderAll()
    saveHistory()
  }
}

// 清除全部标注（保留背景图片）
function clearAll() {
  if (!fabricCanvas) return
  
  fabricCanvas.getObjects().forEach(obj => {
    if (obj !== backgroundImageObj) {
      fabricCanvas!.remove(obj)
    }
  })
  fabricCanvas.renderAll()
  saveHistory()
}

// 保存图片 - 输出原图尺寸
function handleSave() {
  if (!fabricCanvas || !originalImageInfo.value || !backgroundImageObj) return
  
  const { width: origWidth, height: origHeight, scale, left, top } = originalImageInfo.value
  
  // 创建临时 canvas
  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = origWidth
  tempCanvas.height = origHeight
  const ctx = tempCanvas.getContext('2d')
  
  if (!ctx) return
  
  // 绘制原始背景图片
  const imgElement = backgroundImageObj.getElement() as HTMLImageElement
  ctx.drawImage(imgElement, 0, 0, origWidth, origHeight)
  
  // 获取标注对象（排除背景）
  const objects = fabricCanvas.getObjects().filter(obj => obj !== backgroundImageObj)
  
  if (objects.length > 0) {
    // 创建离屏 canvas 用于绘制标注
    const offscreenCanvas = document.createElement('canvas')
    offscreenCanvas.width = origWidth
    offscreenCanvas.height = origHeight
    
    const tempFabricCanvas = new fabric.Canvas(offscreenCanvas, {
      width: origWidth,
      height: origHeight,
    })
    
    // 克隆并缩放标注对象
    let cloneCount = 0
    objects.forEach(obj => {
      obj.clone((clonedObj: fabric.Object) => {
        clonedObj.set({
          left: (obj.left! - left) / scale,
          top: (obj.top! - top) / scale,
          scaleX: (obj.scaleX || 1) / scale,
          scaleY: (obj.scaleY || 1) / scale,
        })
        tempFabricCanvas.add(clonedObj)
        cloneCount++
        
        // 所有对象克隆完成后导出
        if (cloneCount === objects.length) {
          tempFabricCanvas.renderAll()
          
          const annotationCanvas = tempFabricCanvas.toCanvasElement()
          ctx.drawImage(annotationCanvas, 0, 0)
          
          const dataUrl = tempCanvas.toDataURL('image/png', 1)
          emit('save', dataUrl)
          
          tempFabricCanvas.dispose()
        }
      })
    })
  } else {
    const dataUrl = tempCanvas.toDataURL('image/png', 1)
    emit('save', dataUrl)
  }
}

// 更新画笔
function updateBrushColor() {
  if (fabricCanvas?.freeDrawingBrush) {
    fabricCanvas.freeDrawingBrush.color = strokeColor.value
  }
}

function updateBrushWidth() {
  if (fabricCanvas?.freeDrawingBrush) {
    fabricCanvas.freeDrawingBrush.width = strokeWidth.value
  }
}

// 键盘快捷键
function handleKeydown(e: KeyboardEvent) {
  if (!fabricCanvas) return
  
  if (e.key === 'Delete' || e.key === 'Backspace') {
    const activeObj = fabricCanvas.getActiveObject()
    if (activeObj?.type === 'i-text' && (activeObj as fabric.IText).isEditing) return
    deleteSelected()
  }
  
  if (e.ctrlKey && e.key === 'z') {
    e.preventDefault()
    undo()
  }
  
  if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
    e.preventDefault()
    redo()
  }
  
  // ESC 取消当前绘制
  if (e.key === 'Escape') {
    if (isDrawing && currentShape) {
      fabricCanvas.remove(currentShape)
      currentShape = null
      isDrawing = false
      fabricCanvas.renderAll()
    }
    setTool('select')
  }
}

// 窗口大小变化
function handleResize() {
  if (!fabricCanvas || !containerRef.value) return
  
  fabricCanvas.setDimensions({
    width: containerRef.value.clientWidth,
    height: containerRef.value.clientHeight,
  })
  fabricCanvas.renderAll()
}

// 监听 imgUrl 变化
watch(() => props.imgUrl, (newUrl) => {
  if (newUrl && fabricCanvas) {
    loadImage(newUrl)
  }
})

onMounted(() => {
  nextTick(() => {
    setTimeout(() => initCanvas(), 100)
  })
  
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', handleResize)
  
  if (fabricCanvas) {
    fabricCanvas.dispose()
    fabricCanvas = null
  }
})
</script>

<template>
  <div class="img-editor">
    <!-- 顶部工具栏 -->
    <div class="toolbar top-toolbar">
      <div class="tool-group">
        <button class="tool-btn" @click="zoomOut" title="缩小">
          <Icon icon="mdi:magnify-minus" />
        </button>
        <span class="zoom-level">{{ Math.round(zoomLevel * 100) }}%</span>
        <button class="tool-btn" @click="zoomIn" title="放大">
          <Icon icon="mdi:magnify-plus" />
        </button>
        <button class="tool-btn" @click="resetZoom" title="重置">
          <Icon icon="mdi:fit-to-screen" />
        </button>
      </div>
      
      <div class="divider" />
      
      <div class="tool-group">
        <button class="tool-btn" @click="undo" :disabled="historyIndex <= 0" title="撤销 (Ctrl+Z)">
          <Icon icon="mdi:undo" />
        </button>
        <button class="tool-btn" @click="redo" :disabled="historyIndex >= historyStack.length - 1" title="重做 (Ctrl+Y)">
          <Icon icon="mdi:redo" />
        </button>
      </div>
      
      <div class="divider" />
      
      <div class="tool-group">
        <button class="tool-btn" @click="deleteSelected" title="删除选中 (Delete)">
          <Icon icon="mdi:delete-outline" />
        </button>
        <button class="tool-btn danger" @click="clearAll" title="清除全部">
          <Icon icon="mdi:delete-sweep" />
        </button>
      </div>
    </div>
    
    <!-- Canvas -->
    <div ref="containerRef" class="canvas-container">
      <canvas ref="canvasRef" />
    </div>
    
    <!-- 底部工具栏 -->
    <div class="toolbar bottom-toolbar">
      <div class="tool-group">
        <button class="tool-btn" :class="{ active: currentTool === 'select' }" @click="setTool('select')" title="选择 (V)">
          <Icon icon="mdi:cursor-default" />
        </button>
        <button class="tool-btn" :class="{ active: currentTool === 'draw' }" @click="setTool('draw')" title="画笔 (B)">
          <Icon icon="mdi:pencil" />
        </button>
      </div>
      
      <div class="divider" />
      
      <div class="tool-group">
        <button class="tool-btn" :class="{ active: currentTool === 'rect' }" @click="setTool('rect')" title="矩形 (R)">
          <Icon icon="mdi:square-outline" />
        </button>
        <button class="tool-btn" :class="{ active: currentTool === 'circle' }" @click="setTool('circle')" title="椭圆 (O)">
          <Icon icon="mdi:circle-outline" />
        </button>
        <button class="tool-btn" :class="{ active: currentTool === 'triangle' }" @click="setTool('triangle')" title="三角形">
          <Icon icon="mdi:triangle-outline" />
        </button>
        <button class="tool-btn" :class="{ active: currentTool === 'arrow' }" @click="setTool('arrow')" title="箭头 (A)">
          <Icon icon="mdi:arrow-top-right" />
        </button>
      </div>
      
      <div class="divider" />
      
      <div class="tool-group">
        <button class="tool-btn" :class="{ active: currentTool === 'text' }" @click="setTool('text')" title="文字 (T)">
          <Icon icon="mdi:format-text" />
        </button>
      </div>
      
      <div class="divider" />
      
      <div class="tool-group settings">
        <label class="color-picker">
          <span>颜色</span>
          <input type="color" v-model="strokeColor" @change="updateBrushColor" />
        </label>
        <label class="stroke-width">
          <span>粗细</span>
          <input type="range" v-model.number="strokeWidth" min="1" max="20" @input="updateBrushWidth" />
          <span class="value">{{ strokeWidth }}</span>
        </label>
      </div>
    </div>
    
    <!-- 保存 -->
    <div class="save-bar">
      <button class="save-btn" @click="handleSave">
        <Icon icon="mdi:content-save" />
        保存
      </button>
    </div>
  </div>
</template>

<style scoped>
.img-editor {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-primary);
  overflow: hidden;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--color-bg-secondary);
  flex-shrink: 0;
}

.top-toolbar {
  border-bottom: 1px solid var(--color-border);
  justify-content: center;
}

.bottom-toolbar {
  border-top: 1px solid var(--color-border);
  justify-content: center;
  flex-wrap: wrap;
}

.tool-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.tool-group.settings {
  gap: 16px;
}

.divider {
  width: 1px;
  height: 24px;
  background: var(--color-border);
  margin: 0 8px;
}

.tool-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 20px;
}

.tool-btn:hover:not(:disabled) {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.tool-btn.active {
  background: var(--color-accent-blue);
  color: white;
}

.tool-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.tool-btn.danger:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.zoom-level {
  min-width: 50px;
  text-align: center;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.color-picker {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.color-picker input[type="color"] {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  padding: 0;
  background: transparent;
}

.color-picker input[type="color"]::-webkit-color-swatch-wrapper {
  padding: 2px;
}

.color-picker input[type="color"]::-webkit-color-swatch {
  border-radius: 4px;
  border: 1px solid var(--color-border);
}

.stroke-width {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.stroke-width input[type="range"] {
  width: 80px;
  height: 4px;
  border-radius: 2px;
  background: var(--color-border);
  outline: none;
  appearance: none;
}

.stroke-width input[type="range"]::-webkit-slider-thumb {
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--color-accent-blue);
  cursor: pointer;
}

.stroke-width .value {
  min-width: 20px;
  text-align: right;
}

.canvas-container {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  position: relative;
  background: #1e1e1e;
}

.save-bar {
  display: flex;
  justify-content: flex-end;
  padding: 12px 16px;
  background: var(--color-bg-secondary);
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
}

.save-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 24px;
  background: var(--color-accent-blue);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.save-btn:hover {
  background: #4c9aed;
  transform: translateY(-1px);
}
</style>
