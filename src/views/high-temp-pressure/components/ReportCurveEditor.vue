<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import type { EquipmentReportUploadFile } from '@/services/equipment-report-api'
import { echarts } from '@/utils/echarts'
import type { HighTempPressureCurveRangeDraftData } from '../utils/pendingReport'

type CurvePoint = {
  timestamp: number
  upperTemp: number | null
  lowerTemp: number | null
  pressure: number | null
}

type CurveSeriesStatistics = {
  first: number | null
  last: number | null
  min: number | null
  max: number | null
  unit: string
}

type CurveSeriesKey = 'upperTemp' | 'lowerTemp' | 'pressure'

const ALL_CURVE_SERIES: CurveSeriesKey[] = ['upperTemp', 'lowerTemp', 'pressure']
const CURVE_SERIES_DEFINITIONS: Array<{
  key: CurveSeriesKey
  name: string
  unit: string
  color: string
  yAxisIndex: number
}> = [
  { key: 'upperTemp', name: '上部水温', unit: '°C', color: '#c62828', yAxisIndex: 0 },
  { key: 'lowerTemp', name: '下部水温', unit: '°C', color: '#e57c00', yAxisIndex: 0 },
  { key: 'pressure', name: '容器压力', unit: 'MPa', color: '#1558a5', yAxisIndex: 1 },
]

export type HighTempPressureCurveExport = {
  file: EquipmentReportUploadFile
  localPath: string
  range: {
    id: string
    title: string
    index: number
    start_ms: number
    end_ms: number
    start_at: string
    end_at: string
    point_count: number
    visible_series: CurveSeriesKey[]
    statistics: Record<string, CurveSeriesStatistics>
  }
}

export type HighTempPressureCurveRangeDraft = HighTempPressureCurveRangeDraftData

export type HighTempPressureCurveExportContext = {
  testNumber: string
  instrument: string
  fieldName: string
  fileNameSuffix: string
  ranges: HighTempPressureCurveRangeDraft[]
}

const props = defineProps<{
  exportDir: string
  orderNumbers: string
  displayOrderNumbers?: string
  instruments: string
  operatorName: string
  testType?: string
  initialRanges?: HighTempPressureCurveRangeDraft[]
  initialStartMs?: number | null
  initialEndMs?: number | null
}>()

const emit = defineEmits<{
  ready: [ready: boolean]
  'range-change': [range: { startMs: number | null; endMs: number | null }]
  'ranges-change': [ranges: HighTempPressureCurveRangeDraft[]]
}>()

const chartEl = ref<HTMLElement | null>(null)
const loading = ref(false)
const errorText = ref('')
const points = ref<CurvePoint[]>([])
const selectedStartMs = ref<number | null>(null)
const selectedEndMs = ref<number | null>(null)
const curveRanges = ref<HighTempPressureCurveRangeDraft[]>([])
const activeRangeIndex = ref(0)
let chart: echarts.ECharts | null = null
let applyingZoom = false
let chartResizeObserver: ResizeObserver | null = null

const fullStartMs = computed(() => points.value[0]?.timestamp ?? null)
const fullEndMs = computed(() => points.value[points.value.length - 1]?.timestamp ?? null)
const selectedPoints = computed(() => {
  const start = selectedStartMs.value
  const end = selectedEndMs.value
  if (start === null || end === null) return []
  return points.value.filter((point) => point.timestamp >= start && point.timestamp <= end)
})

function numericValue(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function parseRecordValues(record: any) {
  const compactKeys = ['upper_temp', 'lower_temp', 'pressure']
  if (compactKeys.some((key) => Object.prototype.hasOwnProperty.call(record || {}, key))) {
    return {
      upperTemp: numericValue(record?.upper_temp),
      lowerTemp: numericValue(record?.lower_temp),
      pressure: numericValue(record?.pressure),
    }
  }
  const values: Record<string, number> = {}
  const measurements = Array.isArray(record?.measurements) ? record.measurements : []
  measurements.forEach((item: any) => {
    const id = String(item?.id || '').trim()
    const value = numericValue(item?.value)
    if (id && value !== null) values[id] = value
  })
  return {
    upperTemp: values.vessel_250_upper_water_temp ?? values.vessel_480_upper_water_temp ?? null,
    lowerTemp: values.vessel_250_lower_water_temp ?? values.vessel_480_lower_water_temp ?? null,
    pressure: values.vessel_250_pressure ?? values.cylinder_pressure ?? values.high_pressure_pump_outlet_pressure ?? null,
  }
}

function parseCurveRecords(records: any[]) {
  const parsed = records.map((record) => ({
    record,
    timeSec: numericValue(record?.time_sec) ?? 0,
    capturedAt: Date.parse(String(record?.captured_at || '')),
  }))
  const firstTimestamped = parsed.find((item) => Number.isFinite(item.capturedAt))
  const lastTimeSec = parsed[parsed.length - 1]?.timeSec ?? 0
  const fallbackBase = firstTimestamped
    ? firstTimestamped.capturedAt - firstTimestamped.timeSec * 1000
    : Date.now() - lastTimeSec * 1000
  let lastUpper: number | null = null
  let lastLower: number | null = null
  let lastPressure: number | null = null

  return parsed.map(({ record, timeSec, capturedAt }) => {
    const values = parseRecordValues(record)
    if (values.upperTemp !== null) lastUpper = values.upperTemp
    if (values.lowerTemp !== null) lastLower = values.lowerTemp
    if (values.pressure !== null) lastPressure = values.pressure
    return {
      timestamp: Number.isFinite(capturedAt) ? capturedAt : fallbackBase + timeSec * 1000,
      upperTemp: lastUpper,
      lowerTemp: lastLower,
      pressure: lastPressure,
    }
  }).filter((point) => Number.isFinite(point.timestamp))
}

function formatAxisTime(value: number) {
  return new Date(value).toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatPrintAxisTime(value: number) {
  const date = new Date(value)
  const pad = (number: number) => String(number).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}\n${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`
}

function formatDateTime(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '-'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function formatPrintDateTime(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '-'
  const date = new Date(value)
  const pad = (number: number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function formatPrintDate(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '-'
  const date = new Date(value)
  return `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`
}

function formatInputDateTime(value: number | null) {
  if (value === null || !Number.isFinite(value)) return ''
  const date = new Date(value)
  const pad = (number: number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function clampRange(start: number, end: number) {
  const fullStart = fullStartMs.value
  const fullEnd = fullEndMs.value
  if (fullStart === null || fullEnd === null) return null
  const safeStart = Math.max(fullStart, Math.min(start, fullEnd))
  const safeEnd = Math.max(safeStart, Math.min(end, fullEnd))
  return { start: safeStart, end: safeEnd }
}

function createRangeId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `curve-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function normalizeVisibleSeries(value: unknown): CurveSeriesKey[] {
  const defaultSeries: CurveSeriesKey[] = String(props.testType || '').trim() === '高压测试'
    ? ['pressure']
    : ALL_CURVE_SERIES.slice()
  if (!Array.isArray(value)) return defaultSeries
  const selected = ALL_CURVE_SERIES.filter((key) => value.includes(key))
  return selected.length ? selected : defaultSeries
}

function cloneRanges() {
  return curveRanges.value.map((range) => ({
    ...range,
    visibleSeries: normalizeVisibleSeries(range.visibleSeries),
  }))
}

function emitRanges() {
  emit('ranges-change', cloneRanges())
}

function setSelectedRange(start: number, end: number, render = true) {
  const range = clampRange(start, end)
  if (!range) return
  selectedStartMs.value = range.start
  selectedEndMs.value = range.end
  const activeRange = curveRanges.value[activeRangeIndex.value]
  if (activeRange) {
    activeRange.startMs = range.start
    activeRange.endMs = range.end
    curveRanges.value = curveRanges.value.slice()
    emitRanges()
  }
  emit('range-change', { startMs: range.start, endMs: range.end })
  if (render) renderChart()
}

function selectCurveRange(index: number) {
  const range = curveRanges.value[index]
  if (!range || range.startMs === null || range.endMs === null) return
  activeRangeIndex.value = index
  selectedStartMs.value = range.startMs
  selectedEndMs.value = range.endMs
  emit('range-change', { startMs: range.startMs, endMs: range.endMs })
  renderChart()
}

function addCurveRange() {
  const start = selectedStartMs.value ?? fullStartMs.value
  const end = selectedEndMs.value ?? fullEndMs.value
  if (start === null || end === null) return
  const nextIndex = curveRanges.value.length
  curveRanges.value = [
    ...curveRanges.value,
    {
      id: createRangeId(),
      title: nextIndex === 1 ? '稳定段曲线' : `曲线${nextIndex + 1}`,
      startMs: start,
      endMs: end,
      visibleSeries: normalizeVisibleSeries(curveRanges.value[activeRangeIndex.value]?.visibleSeries),
    },
  ]
  activeRangeIndex.value = nextIndex
  emitRanges()
  selectCurveRange(nextIndex)
}

function removeCurveRange(index: number) {
  if (curveRanges.value.length <= 1) return
  curveRanges.value = curveRanges.value.filter((_, rangeIndex) => rangeIndex !== index)
  activeRangeIndex.value = Math.min(activeRangeIndex.value, curveRanges.value.length - 1)
  emitRanges()
  selectCurveRange(activeRangeIndex.value)
}

function updateActiveRangeTitle(event: Event) {
  const activeRange = curveRanges.value[activeRangeIndex.value]
  if (!activeRange) return
  activeRange.title = (event.target as HTMLInputElement).value.trimStart()
  curveRanges.value = curveRanges.value.slice()
  emitRanges()
}

function isCurveSeriesVisible(key: CurveSeriesKey) {
  return normalizeVisibleSeries(curveRanges.value[activeRangeIndex.value]?.visibleSeries).includes(key)
}

function toggleCurveSeries(key: CurveSeriesKey) {
  const activeRange = curveRanges.value[activeRangeIndex.value]
  if (!activeRange) return
  const selected = normalizeVisibleSeries(activeRange.visibleSeries)
  if (selected.includes(key)) {
    if (selected.length === 1) return
    activeRange.visibleSeries = selected.filter((item) => item !== key)
  } else {
    activeRange.visibleSeries = ALL_CURVE_SERIES.filter((item) => selected.includes(item) || item === key)
  }
  curveRanges.value = curveRanges.value.slice()
  emitRanges()
  renderChart()
}

function applyPreset(minutes: number | null) {
  const start = fullStartMs.value
  const end = fullEndMs.value
  if (start === null || end === null) return
  if (minutes === null) {
    setSelectedRange(start, end)
    return
  }
  setSelectedRange(Math.max(start, end - minutes * 60 * 1000), end)
}

function handleStartInput(event: Event) {
  const value = Date.parse((event.target as HTMLInputElement).value)
  if (!Number.isFinite(value) || selectedEndMs.value === null) return
  setSelectedRange(value, selectedEndMs.value)
}

function handleEndInput(event: Event) {
  const value = Date.parse((event.target as HTMLInputElement).value)
  if (!Number.isFinite(value) || selectedStartMs.value === null) return
  setSelectedRange(selectedStartMs.value, value)
}

function seriesData(key: CurveSeriesKey, source = points.value) {
  return source.map((point) => [point.timestamp, point[key]])
}

function pointsInRange(startMs: number, endMs: number) {
  return points.value.filter((point) => point.timestamp >= startMs && point.timestamp <= endMs)
}

function formatPrintValue(value: number | null, key: CurveSeriesKey) {
  if (value === null || !Number.isFinite(value)) return '-'
  return value.toFixed(key === 'pressure' ? 3 : 1)
}

function buildPrintGraphics(
  source: CurvePoint[],
  range?: HighTempPressureCurveRangeDraft,
  exportContext?: HighTempPressureCurveExportContext
) {
  const tableLeft = 82
  const tableTop = 660
  const headerHeight = 30
  const rowHeight = 32
  const columnWidths = [70, 436, 210, 105, 210, 105, 110, 110, 80]
  const headers = ['图例', '变量名称', '左时间', '左数值', '右时间', '右数值', '最小值', '最大值', '单位']
  const visibleSeries = normalizeVisibleSeries(range?.visibleSeries)
  const visibleDefinitions = CURVE_SERIES_DEFINITIONS.filter((definition) => visibleSeries.includes(definition.key))
  const testNumber = exportContext?.testNumber || props.displayOrderNumbers || props.orderNumbers || '-'
  const instrument = exportContext?.instrument || props.instruments || '-'
  const graphics: any[] = []
  let x = tableLeft

  const appendCell = (
    left: number,
    top: number,
    width: number,
    height: number,
    text: string,
    fill = '#ffffff',
    font = '13px Microsoft YaHei, sans-serif',
    align: 'left' | 'center' = 'center'
  ) => {
    graphics.push({
      type: 'rect',
      silent: true,
      shape: { x: left, y: top, width, height },
      style: { fill, stroke: '#5f6849', lineWidth: 1 },
    })
    graphics.push({
      type: 'text',
      silent: true,
      style: {
        x: align === 'center' ? left + width / 2 : left + 7,
        y: top + height / 2,
        text,
        fill: '#111827',
        font,
        align,
        verticalAlign: 'middle',
        width: width - 12,
        overflow: 'truncate',
      },
    })
  }

  headers.forEach((header, index) => {
    appendCell(x, tableTop, columnWidths[index], headerHeight, header, '#e8ecd3', 'bold 13px Microsoft YaHei, sans-serif')
    x += columnWidths[index]
  })

  visibleDefinitions.forEach((definition, rowIndex) => {
    const statistics = calculateSeriesStatistics(definition.key, definition.unit, source)
    const rowTop = tableTop + headerHeight + rowIndex * rowHeight
    const row = [
      '',
      definition.name,
      formatPrintDateTime(source[0]?.timestamp ?? null),
      formatPrintValue(statistics.first, definition.key),
      formatPrintDateTime(source[source.length - 1]?.timestamp ?? null),
      formatPrintValue(statistics.last, definition.key),
      formatPrintValue(statistics.min, definition.key),
      formatPrintValue(statistics.max, definition.key),
      definition.unit,
    ]
    x = tableLeft
    row.forEach((text, columnIndex) => {
      appendCell(x, rowTop, columnWidths[columnIndex], rowHeight, text)
      if (columnIndex === 0) {
        graphics.push({
          type: 'line',
          silent: true,
          shape: { x1: x + 16, y1: rowTop + rowHeight / 2, x2: x + columnWidths[columnIndex] - 16, y2: rowTop + rowHeight / 2 },
          style: { stroke: definition.color, lineWidth: 3 },
        })
      }
      x += columnWidths[columnIndex]
    })
  })

  const businessTop = tableTop + headerHeight + visibleDefinitions.length * rowHeight + 18
  const businessFont = 'bold 16px Microsoft YaHei, sans-serif'
  graphics.push(
    {
      type: 'text', silent: true,
      style: { x: tableLeft, y: businessTop, text: `测试单号：${testNumber}`, fill: '#111827', font: businessFont },
    },
    {
      type: 'text', silent: true,
      style: { x: 760, y: businessTop, text: `仪器型号：${instrument}`, fill: '#111827', font: businessFont, width: 750, overflow: 'truncate' },
    },
    {
      type: 'text', silent: true,
      style: { x: tableLeft, y: businessTop + 34, text: `操作者：${props.operatorName || '-'}`, fill: '#111827', font: businessFont },
    },
    {
      type: 'text', silent: true,
      style: { x: 760, y: businessTop + 34, text: `测试日期：${formatPrintDate(source[0]?.timestamp ?? null)}`, fill: '#111827', font: businessFont },
    }
  )
  return graphics
}

function buildChartOption(
  exporting = false,
  exportRange?: HighTempPressureCurveRangeDraft,
  exportContext?: HighTempPressureCurveExportContext
): echarts.EChartsCoreOption {
  const exportStart = exportRange?.startMs ?? selectedStartMs.value
  const exportEnd = exportRange?.endMs ?? selectedEndMs.value
  const source = exporting && exportStart !== null && exportEnd !== null
    ? pointsInRange(exportStart, exportEnd)
    : points.value
  const visibleSeries = normalizeVisibleSeries(exportRange?.visibleSeries ?? curveRanges.value[activeRangeIndex.value]?.visibleSeries)
  const start = exporting ? exportStart : fullStartMs.value
  const end = exporting ? exportEnd : fullEndMs.value
  return {
    animation: false,
    backgroundColor: '#ffffff',
    color: CURVE_SERIES_DEFINITIONS.map((item) => item.color),
    title: exporting ? {
      text: '中海油服高温超高压试验装置\n温度压力历史曲线',
      left: 'center',
      top: 8,
      textStyle: { color: '#111827', fontSize: 24, lineHeight: 32, fontWeight: 500 },
    } : undefined,
    legend: {
      show: !exporting,
      top: 8,
      left: 'center',
      selectedMode: false,
      data: CURVE_SERIES_DEFINITIONS.filter((item) => visibleSeries.includes(item.key)).map((item) => item.name),
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      formatter: (params: any) => {
        const rows = Array.isArray(params) ? params : [params]
        const timestamp = Number(rows[0]?.value?.[0] ?? rows[0]?.data?.[0])
        return [formatDateTime(timestamp), ...rows.map((row: any) => {
          const value = Number(row?.value?.[1] ?? row?.data?.[1])
          const unit = row?.seriesName === '容器压力' ? 'MPa' : '°C'
          return `${row?.marker || ''}${row?.seriesName || ''}：${Number.isFinite(value) ? value.toFixed(unit === 'MPa' ? 3 : 1) : '-'} ${unit}`
        })].join('<br/>')
      },
    },
    grid: {
      left: exporting ? 82 : 62,
      right: exporting ? 88 : 62,
      top: exporting ? 82 : 48,
      bottom: exporting ? 280 : 82,
      containLabel: false,
    },
    xAxis: {
      type: 'time',
      min: start ?? undefined,
      max: end ?? undefined,
      splitNumber: 10,
      axisLabel: { color: '#475569', hideOverlap: true, formatter: exporting ? formatPrintAxisTime : formatAxisTime },
      axisLine: { lineStyle: { color: '#6b7280' } },
      splitLine: { show: true, lineStyle: { color: '#d5d9df', type: 'dashed' } },
      minorTick: { show: true },
      minorSplitLine: { show: true, lineStyle: { color: '#eef0f3', type: 'dotted' } },
    },
    yAxis: [
      {
        type: 'value',
        name: exporting ? '' : '温度 (°C)',
        min: 0,
        max: 300,
        interval: 50,
        axisLabel: { color: '#475569' },
        splitLine: { show: true, lineStyle: { color: '#d5d9df', type: 'dashed' } },
        minorTick: { show: true },
        minorSplitLine: { show: true, lineStyle: { color: '#eef0f3', type: 'dotted' } },
      },
      {
        type: 'value',
        name: exporting ? '' : '压力 (MPa)',
        min: 0,
        max: 300,
        interval: 50,
        axisLabel: { color: '#475569' },
        splitLine: { show: false },
      },
    ],
    dataZoom: exporting ? [] : [
      { type: 'inside', startValue: selectedStartMs.value ?? undefined, endValue: selectedEndMs.value ?? undefined },
      {
        type: 'slider',
        height: 28,
        bottom: 24,
        startValue: selectedStartMs.value ?? undefined,
        endValue: selectedEndMs.value ?? undefined,
        borderColor: '#cbd5e1',
        fillerColor: 'rgba(21, 88, 165, 0.16)',
      },
    ],
    graphic: exporting ? buildPrintGraphics(source, exportRange, exportContext) : [],
    series: CURVE_SERIES_DEFINITIONS
      .filter((item) => visibleSeries.includes(item.key))
      .map((item) => ({
        name: item.name,
        type: 'line',
        yAxisIndex: item.yAxisIndex,
        data: seriesData(item.key, source),
        showSymbol: false,
        smooth: false,
        connectNulls: false,
        sampling: 'lttb',
        lineStyle: {
          width: item.key === 'pressure' ? 1.8 : item.key === 'upperTemp' ? 1.6 : 1.4,
          color: item.color,
        },
        itemStyle: { color: item.color },
      })),
  }
}

function renderChart() {
  if (!chart || !points.value.length) return
  applyingZoom = true
  chart.setOption(buildChartOption(false), true)
  queueMicrotask(() => {
    applyingZoom = false
  })
}

function initChart() {
  if (!chartEl.value) return
  chartResizeObserver?.disconnect()
  chart?.dispose()
  chart = echarts.init(chartEl.value)
  chart.on('datazoom', () => {
    if (applyingZoom || !chart) return
    const option = chart.getOption() as any
    const zoom = Array.isArray(option?.dataZoom) ? option.dataZoom[0] : null
    const start = Number(zoom?.startValue)
    const end = Number(zoom?.endValue)
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      setSelectedRange(start, end, false)
    }
  })
  renderChart()
  chartResizeObserver = new ResizeObserver(() => {
    chart?.resize()
  })
  chartResizeObserver.observe(chartEl.value)
  requestAnimationFrame(() => chart?.resize())
}

async function loadCurveRecords() {
  const exportDir = props.exportDir.trim()
  if (!exportDir) {
    errorText.value = '未找到 OCR 识别结果目录'
    emit('ready', false)
    return
  }
  loading.value = true
  errorText.value = ''
  try {
    const result = await invoke<any>('read_high_temp_pressure_curve_records', { exportDir })
    const parsed = parseCurveRecords(Array.isArray(result?.records) ? result.records : [])
    if (parsed.length < 2) throw new Error('有效曲线数据不足2条')
    points.value = parsed
    const fullStart = parsed[0].timestamp
    const fullEnd = parsed[parsed.length - 1].timestamp
    const restoredRanges = Array.isArray(props.initialRanges) && props.initialRanges.length
      ? props.initialRanges
      : [{
          id: createRangeId(),
          title: '全程曲线',
          startMs: Number(props.initialStartMs),
          endMs: Number(props.initialEndMs),
        }]
    curveRanges.value = restoredRanges.map((item, index) => {
      const start = item.startMs === null || item.startMs === undefined ? Number.NaN : Number(item.startMs)
      const end = item.endMs === null || item.endMs === undefined ? Number.NaN : Number(item.endMs)
      const clamped = clampRange(
        Number.isFinite(start) ? start : fullStart,
        Number.isFinite(end) ? end : fullEnd
      ) || { start: fullStart, end: fullEnd }
      return {
        id: String(item.id || createRangeId()),
        title: String(item.title || (index === 0 ? '全程曲线' : `曲线${index + 1}`)),
        startMs: clamped.start,
        endMs: clamped.end,
        visibleSeries: normalizeVisibleSeries(item.visibleSeries),
      }
    })
    activeRangeIndex.value = 0
    selectedStartMs.value = curveRanges.value[0].startMs
    selectedEndMs.value = curveRanges.value[0].endMs
    emitRanges()
    emit('range-change', { startMs: selectedStartMs.value, endMs: selectedEndMs.value })
    // loading 状态下曲线容器不会渲染，必须先恢复内容区再初始化 ECharts。
    loading.value = false
    await nextTick()
    initChart()
    emit('ready', true)
  } catch (error) {
    points.value = []
    errorText.value = error instanceof Error ? error.message : String(error || '曲线数据读取失败')
    emit('ready', false)
  } finally {
    loading.value = false
  }
}

function calculateSeriesStatistics(
  key: 'upperTemp' | 'lowerTemp' | 'pressure',
  unit: string,
  source = selectedPoints.value
): CurveSeriesStatistics {
  const values = source.map((point) => point[key]).filter((value): value is number => value !== null && Number.isFinite(value))
  return {
    first: values[0] ?? null,
    last: values[values.length - 1] ?? null,
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
    unit,
  }
}

const statistics = computed(() => ({
  upper_temperature: calculateSeriesStatistics('upperTemp', '°C'),
  lower_temperature: calculateSeriesStatistics('lowerTemp', '°C'),
  pressure: calculateSeriesStatistics('pressure', 'MPa'),
}))

function displayStat(value: number | null, unit: string) {
  if (value === null || !Number.isFinite(value)) return '-'
  return `${value.toFixed(unit === 'MPa' ? 3 : 1)} ${unit}`
}

function dataUrlToBytes(dataUrl: string) {
  const binary = atob(dataUrl.split(',')[1] || '')
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

async function exportCurveFiles(exportContext: HighTempPressureCurveExportContext): Promise<HighTempPressureCurveExport[]> {
  const exportRanges = exportContext.ranges.length ? exportContext.ranges : curveRanges.value
  const invalidRangeIndex = exportRanges.findIndex((range) => {
    if (range.startMs === null || range.endMs === null) return true
    return pointsInRange(range.startMs, range.endMs).length < 2
  })
  if (invalidRangeIndex >= 0) {
    throw new Error(`第 ${invalidRangeIndex + 1} 张曲线请选择包含至少2条数据的范围`)
  }

  const exports: HighTempPressureCurveExport[] = []
  for (let index = 0; index < exportRanges.length; index += 1) {
    const range = exportRanges[index]
    const startMs = range.startMs as number
    const endMs = range.endMs as number
    const source = pointsInRange(startMs, endMs)
    const element = document.createElement('div')
    element.style.cssText = 'position:fixed;left:-99999px;top:-99999px;width:1600px;height:900px;background:#fff;'
    document.body.appendChild(element)
    const exportChart = echarts.init(element, undefined, { renderer: 'canvas', width: 1600, height: 900 })
    try {
      exportChart.setOption(buildChartOption(true, range, exportContext), true)
      const dataUrl = exportChart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' })
      const bytes = dataUrlToBytes(dataUrl)
      const fileName = `高温高压测试结果曲线-${exportContext.fileNameSuffix}-${String(index + 1).padStart(2, '0')}.png`
      const result = await invoke<any>('write_high_temp_pressure_curve_chart', {
        exportDir: props.exportDir,
        imageBytes: Array.from(bytes),
        fileName,
      })
      exports.push({
        file: {
          fieldName: exportContext.fieldName,
          fileName,
          blob: new Blob([bytes], { type: 'image/png' }),
        },
        localPath: String(result?.image_path || ''),
        range: {
          id: range.id,
          title: range.title.trim() || `曲线${index + 1}`,
          index: index + 1,
          start_ms: startMs,
          end_ms: endMs,
          start_at: new Date(startMs).toISOString(),
          end_at: new Date(endMs).toISOString(),
          point_count: source.length,
          visible_series: normalizeVisibleSeries(range.visibleSeries),
          statistics: {
            upper_temperature: calculateSeriesStatistics('upperTemp', '°C', source),
            lower_temperature: calculateSeriesStatistics('lowerTemp', '°C', source),
            pressure: calculateSeriesStatistics('pressure', 'MPa', source),
          },
        },
      })
    } finally {
      exportChart.dispose()
      element.remove()
    }
  }
  return exports
}

defineExpose({ exportCurveFiles })

watch(() => props.exportDir, loadCurveRecords)
onMounted(loadCurveRecords)
onBeforeUnmount(() => {
  chartResizeObserver?.disconnect()
  chart?.dispose()
})
</script>

<template>
  <div class="report-curve-editor">
    <div class="curve-editor-head">
      <div>
        <div class="curve-editor-title">测试曲线范围与预览</div>
        <div class="curve-editor-subtitle">选择最终业务报告中需要绘制的温度、压力历史区间</div>
      </div>
      <div class="curve-editor-count">{{ selectedPoints.length }} / {{ points.length }} 条</div>
    </div>

    <div v-if="loading" class="curve-editor-state">正在读取 OCR 曲线数据...</div>
    <div v-else-if="errorText" class="curve-editor-state is-error">{{ errorText }}</div>
    <template v-else>
      <div class="curve-sheet-toolbar">
        <button
          v-for="(range, index) in curveRanges"
          :key="range.id"
          type="button"
          class="curve-sheet-tab"
          :class="{ active: index === activeRangeIndex }"
          @click="selectCurveRange(index)"
        >
          <span>图{{ index + 1 }}</span>
          {{ range.title || `曲线${index + 1}` }}
          <b v-if="curveRanges.length > 1" title="删除本张曲线" @click.stop="removeCurveRange(index)">×</b>
        </button>
        <button type="button" class="curve-sheet-add" @click="addCurveRange">＋ 添加曲线</button>
      </div>
      <div class="curve-title-input">
        <label>
          <span>曲线名称</span>
          <input
            :value="curveRanges[activeRangeIndex]?.title || ''"
            placeholder="例如：全程曲线、稳定段曲线"
            @input="updateActiveRangeTitle"
          />
        </label>
        <strong>当前共 {{ curveRanges.length }} 张，上传后作为 {{ curveRanges.length }} 份独立打印附件</strong>
      </div>
      <div class="curve-range-toolbar">
        <button type="button" @click="applyPreset(null)">全程</button>
        <button type="button" @click="applyPreset(30)">最近30分钟</button>
        <button type="button" @click="applyPreset(60)">最近1小时</button>
        <button type="button" @click="applyPreset(120)">最近2小时</button>
        <button type="button" @click="applyPreset(240)">最近4小时</button>
      </div>
      <div class="curve-series-picker">
        <span>显示曲线</span>
        <label v-for="item in CURVE_SERIES_DEFINITIONS" :key="item.key">
          <input
            type="checkbox"
            :checked="isCurveSeriesVisible(item.key)"
            :disabled="isCurveSeriesVisible(item.key) && normalizeVisibleSeries(curveRanges[activeRangeIndex]?.visibleSeries).length === 1"
            @change="toggleCurveSeries(item.key)"
          />
          <i :style="{ backgroundColor: item.color }"></i>
          {{ item.name }}
        </label>
        <em>每张图片至少保留一项</em>
      </div>
      <div class="curve-range-inputs">
        <label>
          <span>开始时间</span>
          <input type="datetime-local" step="1" :value="formatInputDateTime(selectedStartMs)" @change="handleStartInput" />
        </label>
        <span class="curve-range-separator">至</span>
        <label>
          <span>结束时间</span>
          <input type="datetime-local" step="1" :value="formatInputDateTime(selectedEndMs)" @change="handleEndInput" />
        </label>
      </div>
      <div ref="chartEl" class="report-curve-chart"></div>
      <div class="curve-range-caption">
        图{{ activeRangeIndex + 1 }}范围：{{ formatDateTime(selectedStartMs) }} — {{ formatDateTime(selectedEndMs) }}
      </div>
      <div class="curve-stat-table">
        <div class="curve-stat-head"><span>曲线</span><span>起始值</span><span>结束值</span><span>最小值</span><span>最大值</span></div>
        <div v-for="(item, key) in statistics" :key="key" class="curve-stat-row">
          <span>{{ key === 'upper_temperature' ? '上部水温' : key === 'lower_temperature' ? '下部水温' : '容器压力' }}</span>
          <span>{{ displayStat(item.first, item.unit) }}</span>
          <span>{{ displayStat(item.last, item.unit) }}</span>
          <span>{{ displayStat(item.min, item.unit) }}</span>
          <span>{{ displayStat(item.max, item.unit) }}</span>
        </div>
      </div>
      <div class="curve-business-meta">测试单号：{{ displayOrderNumbers || orderNumbers || '-' }} · 试件：{{ instruments || '-' }} · 操作员：{{ operatorName || '待填写' }}</div>
    </template>
  </div>
</template>

<style scoped>
.report-curve-editor{border:1px solid #d9e2ef;border-radius:12px;background:#fbfdff;padding:14px}.curve-editor-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.curve-editor-title{font-weight:700;color:#172033}.curve-editor-subtitle{margin-top:3px;font-size:12px;color:#7a8496}.curve-editor-count{font-size:12px;color:#315fa9;background:#eaf2ff;border-radius:999px;padding:5px 10px;white-space:nowrap}.curve-editor-state{min-height:220px;display:flex;align-items:center;justify-content:center;color:#64748b}.curve-editor-state.is-error{color:#c2413b}.curve-range-toolbar{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}.curve-range-toolbar button{border:1px solid #cfd9e8;background:#fff;color:#42526a;border-radius:6px;padding:5px 10px;cursor:pointer}.curve-range-toolbar button:hover{border-color:#5c83c7;color:#285cae}.curve-range-inputs{display:flex;align-items:end;gap:10px;margin-bottom:8px}.curve-range-inputs label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:#64748b}.curve-range-inputs input{border:1px solid #d3dce9;border-radius:6px;background:#fff;padding:6px 9px;color:#263247}.curve-range-separator{padding-bottom:7px;color:#8792a5}.report-curve-chart{height:360px;background:#fff;border:1px solid #e2e8f0;border-radius:8px}.curve-range-caption{margin:8px 0;font-size:12px;color:#526174}.curve-stat-table{border:1px solid #dbe3ee;border-radius:8px;overflow:hidden;font-size:12px}.curve-stat-head,.curve-stat-row{display:grid;grid-template-columns:1.15fr repeat(4,1fr);align-items:center}.curve-stat-head{background:#eef3f9;color:#4a586b;font-weight:700}.curve-stat-head span,.curve-stat-row span{padding:7px 8px;border-right:1px solid #e1e7ef}.curve-stat-head span:last-child,.curve-stat-row span:last-child{border-right:0}.curve-stat-row{background:#fff;border-top:1px solid #e1e7ef;color:#334155}.curve-business-meta{margin-top:8px;color:#778397;font-size:12px}@media(max-width:900px){.curve-range-inputs{align-items:stretch;flex-direction:column}.curve-range-separator{display:none}.report-curve-chart{height:300px}}
</style>

<style scoped>
.curve-sheet-toolbar{display:flex;align-items:center;gap:7px;margin-bottom:10px;padding-bottom:9px;border-bottom:1px solid #e2e8f0;overflow-x:auto}.curve-sheet-tab,.curve-sheet-add{display:inline-flex;align-items:center;gap:6px;min-height:34px;border:1px solid #cfd9e8;border-radius:7px;background:#fff;color:#42526a;padding:6px 10px;cursor:pointer;white-space:nowrap}.curve-sheet-tab span{display:grid;place-items:center;min-width:27px;height:20px;border-radius:999px;background:#eef3f9;color:#315fa9;font-size:11px;font-weight:700}.curve-sheet-tab b{display:grid;place-items:center;width:18px;height:18px;border-radius:50%;color:#94a3b8;font-size:16px;font-weight:400}.curve-sheet-tab b:hover{background:#fee2e2;color:#dc2626}.curve-sheet-tab.active{border-color:#4f7cc4;background:#edf4ff;color:#1f5aaa}.curve-sheet-tab.active span{background:#2563eb;color:#fff}.curve-sheet-add{border-style:dashed;color:#2563eb}.curve-title-input{display:flex;align-items:end;justify-content:space-between;gap:12px;margin-bottom:10px}.curve-title-input label{display:flex;flex-direction:column;gap:4px;min-width:280px;color:#64748b;font-size:12px}.curve-title-input input{border:1px solid #d3dce9;border-radius:6px;background:#fff;padding:6px 9px;color:#263247}.curve-title-input strong{padding-bottom:7px;color:#2563eb;font-size:12px;font-weight:600}@media(max-width:900px){.curve-title-input{align-items:stretch;flex-direction:column}.curve-title-input label{min-width:0}.curve-title-input strong{padding-bottom:0}}
.curve-series-picker{display:flex;align-items:center;flex-wrap:wrap;gap:12px;margin:0 0 10px;padding:8px 10px;border:1px solid #dbe3ee;border-radius:7px;background:#fff;color:#475569;font-size:12px}.curve-series-picker>span{font-weight:700;color:#334155}.curve-series-picker label{display:inline-flex;align-items:center;gap:5px;cursor:pointer}.curve-series-picker input{margin:0}.curve-series-picker i{display:inline-block;width:18px;height:3px;border-radius:2px}.curve-series-picker em{margin-left:auto;color:#94a3b8;font-style:normal}
</style>
