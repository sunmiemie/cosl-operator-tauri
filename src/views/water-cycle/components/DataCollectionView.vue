<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

// 修正路径
import { 
  selectedOrder, 
  roiRegions, 
  realTimeData, 
  ocrConfidence, 
  logs, 
  isPaused, 
  collectionTime, 
  getConfidenceLevel, 
  extractNumber, 
  COLLECTION_CHANNELS 
} from '../composables/useTestStore'

const props = defineProps<{ camera: any; ocr: any }>()
const emit = defineEmits(['finish'])

// 本地状态：控制 ECharts 中勾选显示哪些通道
const activeCollectionChannels = ref(COLLECTION_CHANNELS.reduce((acc, c) => ({ ...acc, [c.id]: true }), {}))

// ECharts 实例引用与配置常量
const chartRef = ref<HTMLDivElement | null>(null)
let chartInst: echarts.ECharts | null = null
const MAX_POINTS = 120 // X 轴保留的最大点数（2分钟）

// 定时器引用：分别控制模拟数据产生和 OCR 轮询调用
let dataTimer: any = null
let ocrTimer: any = null

// 图表数据缓存池，格式 { 'p1': [10.2, 10.5, ...], ... }
const chartBuffers: Record<string, number[]> = {}
const xLabels: string[] = [] // 时间戳标签

// 初始化 ECharts 空实例
function initChart() {
  if (!chartRef.value) return
  chartInst = echarts.init(chartRef.value)
  chartInst.setOption({ 
    tooltip: { trigger: 'axis' }, 
    legend: { data: COLLECTION_CHANNELS.map(c => c.name) }, 
    xAxis: { type: 'category', data: [] }, 
    yAxis: { type: 'value' }, 
    series: [] 
  })
}

// 将缓冲池中的最新数据推送到 ECharts 进行渲染
function updateChart() {
  if (!chartInst) return
  // 仅过滤出用户勾选想要查看的通道
  const series = COLLECTION_CHANNELS
    .filter(c => activeCollectionChannels.value[c.id])
    .map(c => ({ 
      name: c.name, 
      type: 'line', 
      smooth: true, 
      lineStyle: { color: c.color }, 
      data: chartBuffers[c.id] || [] 
    }))
  chartInst.setOption({ xAxis: { data: xLabels }, series })
}

// 模拟采集心跳时钟（每秒触发一次）
function tick() {
  collectionTime.value++
  
  // 更新 X 轴标签
  xLabels.push(new Date().toLocaleTimeString())
  if (xLabels.length > MAX_POINTS) xLabels.shift() // 维持队列长度
  
  // 遍历所有通道，如果全局共享库 realTimeData 中有对应的 OCR 结果，则塞入缓存池画图
  COLLECTION_CHANNELS.forEach(c => {
    chartBuffers[c.id] = chartBuffers[c.id] || []
    if (realTimeData.value[c.id] !== undefined) { 
      chartBuffers[c.id].push(realTimeData.value[c.id])
      if (chartBuffers[c.id].length > MAX_POINTS) chartBuffers[c.id].shift() 
    }
  })
  
  // 每 10 秒打一条模拟日志
  if (collectionTime.value % 10 === 0) logs.value.push({ time: new Date().toLocaleTimeString(), msg: '采集心跳' })
  updateChart()
}

// 启动主时钟循环
function startDataSimulation() {
  logs.value = [{ time: new Date().toLocaleTimeString(), msg: '开始数据采集' }]
  collectionTime.value = 0; xLabels.length = 0
  dataTimer = setInterval(tick, 1000)
  isPaused.value = false
}

// 初始化并启动 OCR 的周期性识别调用
async function startOcrRecognition() {
  const regions = Object.values(roiRegions.value)
  if (regions.length === 0) return
  
  await props.ocr.initialize()
  await props.ocr.setRegions(regions)
  
  // 每 2 秒从视频流截取当前帧，并发送给 OCR 模型分析
  ocrTimer = setInterval(async () => {
    if (!props.camera.currentFrame.value) return
    const result = await props.ocr.recognizeRegions(props.camera.currentFrame.value)
    if (!result) return
    
    // 将识别结果清洗后存入响应式的共享字典，视图层即可自动更新
    for (const r of result.regions) { 
      ocrConfidence.value[r.id] = r.confidence
      const num = extractNumber(r.text)
      if (num !== null) realTimeData.value[r.id] = num 
    }
  }, 2000)
}

// 暂停/继续切换
function togglePause() {
  if (isPaused.value) { 
    dataTimer = setInterval(tick, 1000)
    startOcrRecognition()
    isPaused.value = false 
  } else { 
    clearInterval(dataTimer)
    clearInterval(ocrTimer)
    isPaused.value = true 
  }
}

// 挂载时启动业务
onMounted(() => {
  initChart()
  startDataSimulation()
  
  // 判断如果有配置好的 ROI 则启动模型，否则在日志提示
  if (Object.keys(roiRegions.value).length > 0) {
    startOcrRecognition()
  } else {
    logs.value.push({ time: new Date().toLocaleTimeString(), msg: '未配置 ROI，无 OCR 数据接入' })
  }
  
  // 适配屏幕缩放
  window.addEventListener('resize', () => chartInst?.resize())
})

// 组件销毁时必须清空所有定时器，防止内存和 CPU 泄漏
onUnmounted(() => { 
  clearInterval(dataTimer)
  clearInterval(ocrTimer)
  chartInst?.dispose() 
})
</script>

<template>
  <div class="collection-container">
    <div class="collection-header-row">
      <div class="stat-item">已用时长：<span class="val cyan">{{ Math.floor(collectionTime/60) }}:{{ String(collectionTime%60).padStart(2,'0') }}</span></div>
    </div>
    
    <div class="collection-main">
      <div class="chart-section"><div class="chart-container" ref="chartRef"></div></div>
      <div class="log-section">
        <div class="log-list">
          <div v-for="(log, i) in logs" :key="i" class="log-item">
            <span class="time">{{ log.time }}</span><span class="msg">{{ log.msg }}</span>
          </div>
        </div>
      </div>
    </div>
    
    <div class="data-grid">
      <div v-for="c in COLLECTION_CHANNELS" :key="c.id" v-show="activeCollectionChannels[c.id]" class="data-card">
        <div class="d-name">{{ c.name }} <span class="confidence-dot" :class="getConfidenceLevel(c.id)"></span></div>
        <div class="d-value" :style="{ color: c.color }">{{ realTimeData[c.id] ?? '--' }}</div>
      </div>
    </div>
    
    <div class="collection-footer">
      <button class="btn-pause" @click="togglePause">{{ isPaused ? '继续采集' : '暂停采集' }}</button>
      <button class="btn-stop" @click="emit('finish')">结束测试</button>
    </div>
  </div>
</template>

<style scoped>
.collection-container { display:flex; flex-direction:column; gap:16px; height:100%; }
.collection-header-row { display:flex; gap:20px; background:var(--color-bg-secondary); padding:16px 24px; border-radius:12px; border:1px solid var(--color-border); }
.stat-item { font-size:14px; color:var(--color-text-secondary); font-weight:500; }
.stat-item .val { color:var(--color-text-primary); font-weight:700; margin-left:6px; }
.val.purple { color:#8b5cf6; } .val.cyan { color:#06b6d4; } .val.green { color:#10b981; }
.channel-selector-card { background:var(--color-bg-secondary); border-radius:12px; border:1px solid var(--color-border); padding:16px; }
.card-label { font-size:14px; font-weight:600; color:var(--color-text-secondary); margin-bottom:12px; }
.channel-grid { display:flex; flex-wrap:wrap; gap:16px; }
.channel-checkbox { display:flex; align-items:center; gap:8px; cursor:pointer; }
.channel-checkbox input { display:none; }
.channel-checkbox .box { width:16px; height:16px; border:2px solid var(--color-border); border-radius:4px; display:flex; align-items:center; justify-content:center; color:white; font-size:12px; }
.channel-checkbox .name { font-size:13px; color:var(--color-text-primary); }
.collection-main { display:flex; gap:16px; }
.chart-section { flex:2; background:var(--color-bg-secondary); border:1px solid var(--color-border); border-radius:12px; padding:16px; }
.chart-container { height:240px; background:var(--color-bg-tertiary); border:1px solid var(--color-border); border-radius:8px; }
.log-section { flex:1; background:var(--color-bg-secondary); border:1px solid var(--color-border); border-radius:12px; padding:16px; }
.log-list { height:240px; overflow-y:auto; display:flex; flex-direction:column; gap:8px; }
.log-item { display:flex; gap:12px; font-size:12px; padding:6px; border-radius:4px; background:var(--color-bg-tertiary); }
.log-item .time { color:var(--color-text-tertiary); }
.log-item .msg { color:var(--color-text-primary); }
.data-grid { display:grid; grid-template-columns:repeat(5,1fr); gap:12px; }
.data-card { background:var(--color-bg-secondary); border:1px solid var(--color-border); padding:12px 16px; border-radius:10px; }
.d-name { font-size:12px; color:var(--color-text-secondary); margin-bottom:4px; display:flex; align-items:center; }
.d-value { font-size:18px; font-weight:700; }
.d-value .unit { font-size:12px; color:var(--color-text-tertiary); margin-left:2px; }
.collection-footer { display:flex; justify-content:center; gap:20px; margin-top:10px; }
.btn-pause { background:#f97316; color:white; border:none; padding:12px 60px; border-radius:8px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:8px; }
.btn-stop { background:#0ea5e9; color:white; border:none; padding:12px 60px; border-radius:8px; font-weight:600; cursor:pointer; }
.confidence-dot { display:inline-block; width:8px; height:8px; border-radius:50%; background:var(--color-border); margin-left:4px; vertical-align:middle; }
.confidence-dot.high { background:#22c55e; }
.confidence-dot.medium { background:#f59e0b; }
.confidence-dot.low { background:#ef4444; }
.confidence-dot.none { background:var(--color-border); }
</style>