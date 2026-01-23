<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Icon } from '@iconify/vue'
import { http } from '@/services/http'
import { useAuth } from '@/composables/useAuth'
import { useTheme } from '@/composables/useTheme'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { PieChart, BarChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
} from 'echarts/components'

// 注册 ECharts 组件
use([
  CanvasRenderer,
  PieChart,
  BarChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
])

// 用户信息和主题
const { userInfo, getAuthHeaders } = useAuth()
const { isDark } = useTheme()

// 加载状态
const waitLoading = ref(false)
const todayLoading = ref(false)

// 数据
const waitingUnit = ref<TestUnit[]>([])
const continueList = ref<TestUnit[]>([])
const completedUnit = ref<TestUnit[]>([])

// 在线时长（秒）
const runTime = ref(0)
let runTimeInterval: number | null = null

// 当前时间
const currentTime = ref(new Date())
let timeInterval: number | null = null

// 允许的测试类型
const allowedTestTypes = ['功能性测试', '2D留存', '3D检测', '弓曲度测试', 'X-Ray测试']

// 测试单元接口
interface TestUnit {
  testunit_id?: number
  dev_testunit_id?: number
  testunit_starttime?: string
  dev_testunit_starttime?: string
  boardmodel?: string
  serial?: string
  process_type?: string
  testunit_status?: string
  dev_testunit_status?: string
  testunit_type?: number
  version?: string
}

// API 响应接口
interface OrderDataResponse {
  code: number
  msg: string
  data: TestUnit[]
}

// 计算属性
const newOrderCount = computed(() => waitingUnit.value.length - continueList.value.length)
const continueCount = computed(() => continueList.value.length)
const completedCount = computed(() => completedUnit.value.length)

// 格式化在线时长
const formattedRunTime = computed(() => {
  const hours = Math.floor(runTime.value / 3600)
  const minutes = Math.floor((runTime.value % 3600) / 60)
  const seconds = runTime.value % 60
  return { hours, minutes, seconds }
})

// 格式化当前时间
const formattedCurrentTime = computed(() => {
  const date = currentTime.value
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const weekDay = weekDays[date.getDay()]
  return { year, month, day, hours, minutes, weekDay }
})

// 图表主题色
const chartTextColor = computed(() => isDark.value ? '#8b949e' : '#57606a')
const chartBorderColor = computed(() => isDark.value ? '#30363d' : '#d0d7de')

// 测试类型分布饼图配置
const testTypeChartOption = computed(() => {
  const typeCount: Record<string, number> = {}
  waitingUnit.value.forEach(item => {
    const type = item.process_type || '未知'
    typeCount[type] = (typeCount[type] || 0) + 1
  })

  const data = Object.entries(typeCount).map(([name, value]) => ({ name, value }))

  return {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)',
      backgroundColor: isDark.value ? '#161b22' : '#ffffff',
      borderColor: chartBorderColor.value,
      textStyle: { color: chartTextColor.value },
    },
    legend: {
      orient: 'vertical',
      right: 10,
      top: 'center',
      textStyle: { color: chartTextColor.value, fontSize: 11 },
    },
    series: [
      {
        type: 'pie',
        radius: ['40%', '65%'],
        center: ['35%', '50%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 6,
          borderColor: isDark.value ? '#0d1117' : '#ffffff',
          borderWidth: 2,
        },
        label: { show: false },
        emphasis: {
          label: { show: true, fontSize: 13, fontWeight: 'bold' },
        },
        data,
        color: ['#58a6ff', '#3fb950', '#d29922', '#a371f7', '#f85149'],
      },
    ],
  }
})

// 工单状态分布柱状图配置
const statusChartOption = computed(() => {
  const statusCount = { '新工单': 0, '测试中': 0, '待重做': 0, '疑问工单': 0 }

  waitingUnit.value.forEach(item => {
    const status = item.testunit_status || item.dev_testunit_status
    switch (status) {
      case '1': statusCount['新工单']++; break
      case '2': statusCount['测试中']++; break
      case '4': statusCount['待重做']++; break
      case '8': statusCount['疑问工单']++; break
    }
  })

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: isDark.value ? '#161b22' : '#ffffff',
      borderColor: chartBorderColor.value,
      textStyle: { color: chartTextColor.value },
    },
    grid: { left: '3%', right: '4%', bottom: '8%', top: '12%', containLabel: true },
    xAxis: {
      type: 'category',
      data: Object.keys(statusCount),
      axisLine: { lineStyle: { color: chartBorderColor.value } },
      axisLabel: { color: chartTextColor.value, fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisLabel: { color: chartTextColor.value },
      splitLine: { lineStyle: { color: chartBorderColor.value, type: 'dashed' } },
    },
    series: [
      {
        type: 'bar',
        data: Object.values(statusCount),
        barWidth: '45%',
        itemStyle: {
          borderRadius: [6, 6, 0, 0],
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: '#58a6ff' }, { offset: 1, color: '#1f6feb' }],
          },
        },
      },
    ],
  }
})

// 获取状态标签样式
const getStatusClass = (status: string | undefined) => {
  switch (status) {
    case '1': return 'status-new'
    case '2': return 'status-testing'
    case '3': return 'status-pending'
    case '4': return 'status-redo'
    case '5': return 'status-success'
    case '6': return 'status-error'
    case '8': return 'status-question'
    default: return ''
  }
}

// 获取状态文本
const getStatusText = (status: string | undefined) => {
  switch (status) {
    case '1': return '新工单'
    case '2': return '测试中'
    case '3': return '待审核'
    case '4': return '待重做'
    case '5': return '测试正常'
    case '6': return '测试异常'
    case '8': return '疑问工单'
    default: return '未知'
  }
}

// 获取工单类型文本
const getOrderTypeText = (type: number | undefined) => type === 1 ? '临时' : '正式'

// 格式化时间
const formatDateTime = (dateStr: string | undefined) => {
  if (!dateStr) return '-'
  try {
    const date = new Date(dateStr)
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${month}-${day} ${hours}:${minutes}`
  } catch {
    return dateStr
  }
}

// 加载待测试工单数据
const loadWaitData = async () => {
  waitLoading.value = true
  try {
    const response = await http.get<OrderDataResponse>('/test/getoperatororder/', getAuthHeaders())
    if (response.success && response.data) {
      const data = Array.isArray(response.data) ? response.data : (response.data as OrderDataResponse).data || []
      waitingUnit.value = []
      continueList.value = []
      data.forEach((item: TestUnit) => {
        if (allowedTestTypes.includes(item.process_type || '')) {
          waitingUnit.value.push(item)
          if (item.testunit_status === '2' || item.dev_testunit_status === '2') {
            continueList.value.push(item)
          }
        }
      })
    }
  } catch (error) {
    console.error('加载工单数据失败:', error)
  } finally {
    waitLoading.value = false
  }
}

// 加载今日已完成数据
const loadTodayData = async () => {
  todayLoading.value = true
  try {
    const userId = userInfo.value?.id || 0
    const response = await http.get<OrderDataResponse>(
      `/test/testunit/today/completed/?user_id=${userId}`,
      getAuthHeaders()
    )
    if (response.success && response.data) {
      const data = Array.isArray(response.data) ? response.data : (response.data as OrderDataResponse).data || []
      completedUnit.value = data
    }
  } catch (error) {
    console.error('加载今日完成数据失败:', error)
  } finally {
    todayLoading.value = false
  }
}

// 刷新所有数据
const refreshAll = async () => {
  await Promise.all([loadWaitData(), loadTodayData()])
}

// 初始化
onMounted(() => {
  loadWaitData()
  loadTodayData()
  runTimeInterval = setInterval(() => { runTime.value++ }, 1000) as unknown as number
  timeInterval = setInterval(() => { currentTime.value = new Date() }, 1000) as unknown as number
})

// 清理
onUnmounted(() => {
  if (runTimeInterval) clearInterval(runTimeInterval)
  if (timeInterval) clearInterval(timeInterval)
})
</script>

<template>
  <div class="dashboard-page">
    <!-- 顶部区域：头部 + 统计卡片 -->
    <div class="top-section">
      <!-- 页面头部 -->
      <div class="page-header">
        <div class="header-left">
          <h1 class="page-title">
            <Icon icon="mdi:view-dashboard" class="title-icon" />
            仪表盘
          </h1>
          <p class="page-subtitle">实时监控测试台运行状态</p>
        </div>
        <div class="header-right">
          <div class="current-time">
            <div class="time-display">{{ formattedCurrentTime.hours }}:{{ formattedCurrentTime.minutes }}</div>
            <div class="date-display">{{ formattedCurrentTime.year }}-{{ formattedCurrentTime.month }}-{{
              formattedCurrentTime.day }} {{ formattedCurrentTime.weekDay }}</div>
          </div>
          <button class="refresh-btn" @click="refreshAll" :disabled="waitLoading || todayLoading">
            <Icon icon="mdi:refresh" :class="{ spinning: waitLoading || todayLoading }" />
            刷新
          </button>
        </div>
      </div>

      <!-- 统计卡片 -->
      <div class="stats-grid">
        <div class="stat-card new-orders">
          <div class="stat-icon">
            <Icon icon="mdi:clipboard-list-outline" />
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ newOrderCount }}</div>
            <div class="stat-label">待测试新工单</div>
          </div>
          <div class="stat-decoration"></div>
        </div>
        <div class="stat-card continue-orders">
          <div class="stat-icon">
            <Icon icon="mdi:progress-clock" />
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ continueCount }}</div>
            <div class="stat-label">待继续工单</div>
          </div>
          <div class="stat-decoration"></div>
        </div>
        <div class="stat-card completed-orders">
          <div class="stat-icon">
            <Icon icon="mdi:check-circle-outline" />
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ completedCount }}</div>
            <div class="stat-label">今日已完成</div>
          </div>
          <div class="stat-decoration"></div>
        </div>
        <div class="stat-card online-time">
          <div class="stat-icon">
            <Icon icon="mdi:timer-outline" />
          </div>
          <div class="stat-content">
            <div class="stat-value time-value">
              <span class="time-num">{{ formattedRunTime.hours }}</span><span class="time-unit">时</span>
              <span class="time-num">{{ formattedRunTime.minutes }}</span><span class="time-unit">分</span>
              <span class="time-num">{{ formattedRunTime.seconds }}</span><span class="time-unit">秒</span>
            </div>
            <div class="stat-label">在线时长</div>
          </div>
          <div class="stat-decoration"></div>
        </div>
      </div>
    </div>

    <!-- 中间区域：图表 + 表格 -->
    <div class="content-section">
      <!-- 左侧：图表 + 待测试表格 -->
      <div class="left-panel">
        <!-- 图表区域 -->
        <div class="charts-row">
          <div class="chart-card">
            <div class="chart-header">
              <Icon icon="mdi:chart-pie" class="chart-icon" />
              <span>测试类型分布</span>
            </div>
            <div class="chart-body">
              <VChart v-if="waitingUnit.length > 0" :option="testTypeChartOption" autoresize class="chart" />
              <div v-else class="chart-empty">
                <Icon icon="mdi:chart-pie" /><span>暂无数据</span>
              </div>
            </div>
          </div>
          <div class="chart-card">
            <div class="chart-header">
              <Icon icon="mdi:chart-bar" class="chart-icon" />
              <span>工单状态分布</span>
            </div>
            <div class="chart-body">
              <VChart v-if="waitingUnit.length > 0" :option="statusChartOption" autoresize class="chart" />
              <div v-else class="chart-empty">
                <Icon icon="mdi:chart-bar" /><span>暂无数据</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 待测试工单表格 -->
        <div class="table-card flex-table">
          <div class="table-header">
            <div class="table-title">
              <Icon icon="mdi:format-list-bulleted" class="table-icon" />
              <span>当前可测试工单</span>
              <span class="table-count">{{ waitingUnit.length }}</span>
            </div>
            <button class="table-refresh" @click="loadWaitData" :disabled="waitLoading">
              <Icon icon="mdi:refresh" :class="{ spinning: waitLoading }" />
            </button>
          </div>
          <div class="table-content">
            <div v-if="waitLoading" class="table-loading">
              <Icon icon="mdi:loading" class="spinning" /><span>加载中...</span>
            </div>
            <div v-else-if="waitingUnit.length === 0" class="table-empty">
              <Icon icon="mdi:inbox-outline" class="empty-icon" /><span>暂无待测试工单</span>
            </div>
            <table v-else class="data-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>型号</th>
                  <th>序列号</th>
                  <th>测试</th>
                  <th>状态</th>
                  <th>类型</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, index) in waitingUnit" :key="index">
                  <td class="time-cell">{{ formatDateTime(item.testunit_starttime || item.dev_testunit_starttime) }}
                  </td>
                  <td class="ellipsis" :title="item.boardmodel || '无型号'">{{ item.boardmodel || '无型号' }}</td>
                  <td class="mono">{{ item.serial || '-' }}</td>
                  <td><span class="test-type-badge">{{ item.process_type }}</span></td>
                  <td><span class="status-badge"
                      :class="getStatusClass(item.testunit_status || item.dev_testunit_status)">{{
                        getStatusText(item.testunit_status || item.dev_testunit_status) }}</span></td>
                  <td><span class="order-type" :class="item.testunit_type === 1 ? 'temp' : 'prod'">{{
                    getOrderTypeText(item.testunit_type) }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- 右侧：今日完成表格 -->
      <div class="right-panel">
        <div class="table-card full-height">
          <div class="table-header">
            <div class="table-title">
              <Icon icon="mdi:check-all" class="table-icon" />
              <span>今日完成</span>
              <span class="table-count">{{ completedUnit.length }}</span>
            </div>
            <button class="table-refresh" @click="loadTodayData" :disabled="todayLoading">
              <Icon icon="mdi:refresh" :class="{ spinning: todayLoading }" />
            </button>
          </div>
          <div class="table-content">
            <div v-if="todayLoading" class="table-loading">
              <Icon icon="mdi:loading" class="spinning" /><span>加载中...</span>
            </div>
            <div v-else-if="completedUnit.length === 0" class="table-empty">
              <Icon icon="mdi:clipboard-check-outline" class="empty-icon" /><span>今日暂无完成</span>
            </div>
            <table v-else class="data-table">
              <thead>
                <tr>
                  <th>工单号</th>
                  <th>型号</th>
                  <th>序列号</th>
                  <th>测试</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, index) in completedUnit" :key="index">
                  <td class="mono"><span v-if="item.testunit_id">{{ item.testunit_id }}</span><span
                      v-else-if="item.dev_testunit_id">T{{ item.dev_testunit_id }}</span></td>
                  <td class="ellipsis" :title="item.boardmodel || '无型号'">{{ item.boardmodel || '无型号' }}</td>
                  <td class="mono">{{ item.serial || '-' }}</td>
                  <td><span class="test-type-badge">{{ item.process_type }}</span></td>
                  <td><span class="status-badge" :class="getStatusClass(item.testunit_status)">{{
                    getStatusText(item.testunit_status) }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: var(--color-text-primary);
}

/* 顶部区域 */
.top-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex-shrink: 0;
}

/* 页面头部 */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.header-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.page-title {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0;
  font-size: 28px;
  font-weight: 700;
}

.title-icon {
  font-size: 32px;
  color: var(--color-accent-blue);
}

.page-subtitle {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.current-time {
  text-align: right;
}

.time-display {
  font-size: 28px;
  font-weight: 700;
  font-family: var(--font-mono);
  letter-spacing: 2px;
}

.date-display {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.refresh-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  background: var(--color-accent-blue);
  color: white;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}

.refresh-btn:hover:not(:disabled) {
  background: var(--color-accent-purple);
  transform: translateY(-1px);
}

.refresh-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 统计卡片 */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}

.stat-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 14px;
  overflow: hidden;
  transition: all 0.2s;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.1);
}

.stat-icon {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  font-size: 28px;
  flex-shrink: 0;
}

.new-orders .stat-icon {
  background: linear-gradient(135deg, rgba(63, 185, 80, 0.15), rgba(63, 185, 80, 0.05));
  color: var(--color-accent-green);
}

.continue-orders .stat-icon {
  background: linear-gradient(135deg, rgba(88, 166, 255, 0.15), rgba(88, 166, 255, 0.05));
  color: var(--color-accent-blue);
}

.completed-orders .stat-icon {
  background: linear-gradient(135deg, rgba(210, 153, 34, 0.15), rgba(210, 153, 34, 0.05));
  color: var(--color-accent-orange);
}

.online-time .stat-icon {
  background: linear-gradient(135deg, rgba(163, 113, 247, 0.15), rgba(163, 113, 247, 0.05));
  color: var(--color-accent-purple);
}

.stat-content {
  flex: 1;
  min-width: 0;
}

.stat-value {
  font-size: 36px;
  font-weight: 700;
  line-height: 1.2;
}

.stat-value.time-value {
  font-size: 18px;
  display: flex;
  align-items: baseline;
  gap: 2px;
}

.time-num {
  font-size: 28px;
  font-family: var(--font-mono);
  font-weight: 700;
}

.time-unit {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-right: 4px;
}

.stat-label {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin-top: 4px;
}

.stat-decoration {
  position: absolute;
  right: -18px;
  bottom: -30px;
  width: 100px;
  height: 100px;
  border-radius: 50%;
  opacity: 0.15;
  filter: blur(40px);
}

.new-orders .stat-decoration {
  background: var(--color-accent-green);
}

.continue-orders .stat-decoration {
  background: var(--color-accent-blue);
}

.completed-orders .stat-decoration {
  background: var(--color-accent-orange);
}

.online-time .stat-decoration {
  background: var(--color-accent-purple);
}

/* 内容区域 */
.content-section {
  flex: 1;
  display: flex;
  gap: 12px;
  min-height: 0;
}

.left-panel {
  flex: 2;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.right-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* 图表区域 */
.charts-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  flex-shrink: 0;
}

.chart-card {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 14px;
  overflow: hidden;
}

.chart-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 18px;
  font-size: 15px;
  font-weight: 600;
  border-bottom: 1px solid var(--color-border);
}

.chart-icon {
  font-size: 20px;
  color: var(--color-accent-blue);
}

.chart-body {
  height: 180px;
  padding: 10px;
}

.chart {
  width: 100%;
  height: 100%;
}

.chart-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-muted);
  gap: 8px;
  font-size: 14px;
}

.chart-empty svg {
  font-size: 40px;
  opacity: 0.3;
}

/* 表格卡片 */
.table-card {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 14px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.table-card.flex-table {
  flex: 1;
  min-height: 0;
}

.table-card.full-height {
  flex: 1;
}

.table-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 18px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.table-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
}

.table-icon {
  font-size: 20px;
  color: var(--color-accent-blue);
}

.table-count {
  padding: 3px 10px;
  background: var(--color-bg-tertiary);
  border-radius: 10px;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.table-refresh {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: var(--color-text-secondary);
  font-size: 18px;
  transition: all 0.2s;
}

.table-refresh:hover:not(:disabled) {
  background: var(--color-bg-hover);
  color: var(--color-accent-blue);
}

.table-refresh:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.table-content {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.table-empty,
.table-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 140px;
  color: var(--color-text-muted);
  gap: 10px;
  font-size: 14px;
}

.empty-icon {
  font-size: 48px;
  opacity: 0.3;
}

/* 数据表格 */
.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th {
  position: sticky;
  top: 0;
  padding: 12px 16px;
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.data-table td {
  padding: 12px 16px;
  font-size: 13px;
  color: var(--color-text-primary);
  border-bottom: 1px solid var(--color-border-light);
}

.data-table tbody tr {
  transition: background 0.15s;
}

.data-table tbody tr:hover {
  background: var(--color-bg-hover);
}

.data-table tbody tr:last-child td {
  border-bottom: none;
}

.time-cell {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-text-secondary);
}

.mono {
  font-family: var(--font-mono);
  font-size: 12px;
}

.ellipsis {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 状态徽章 */
.status-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 600;
}

.status-new {
  background: rgba(63, 185, 80, 0.15);
  color: var(--color-accent-green);
}

.status-testing {
  background: rgba(88, 166, 255, 0.15);
  color: var(--color-accent-blue);
}

.status-pending {
  background: rgba(210, 153, 34, 0.15);
  color: var(--color-accent-orange);
}

.status-redo {
  background: rgba(248, 81, 73, 0.15);
  color: var(--color-accent-red);
}

.status-success {
  background: rgba(63, 185, 80, 0.15);
  color: var(--color-accent-green);
}

.status-error {
  background: rgba(248, 81, 73, 0.15);
  color: var(--color-accent-red);
}

.status-question {
  background: rgba(210, 153, 34, 0.15);
  color: var(--color-accent-orange);
}

.test-type-badge {
  display: inline-block;
  padding: 3px 8px;
  background: var(--color-bg-tertiary);
  border-radius: 4px;
  font-size: 11px;
  color: var(--color-text-secondary);
}

.order-type {
  font-size: 12px;
  font-weight: 500;
}

.order-type.prod {
  color: var(--color-accent-blue);
}

.order-type.temp {
  color: var(--color-accent-orange);
}

/* 动画 */
.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

/* 滚动条 */
.table-content::-webkit-scrollbar {
  width: 4px;
}

.table-content::-webkit-scrollbar-track {
  background: transparent;
}

.table-content::-webkit-scrollbar-thumb {
  background: var(--color-scrollbar);
  border-radius: 2px;
}

/* 响应式 */
@media (max-width: 1400px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .content-section {
    flex-direction: column;
  }

  .left-panel,
  .right-panel {
    flex: none;
  }
}
</style>
