import { echarts } from '@/utils/echarts'
import type {
  HaltHassChartImage,
  HaltHassChartSummary,
  HaltHassChartUpload,
  HaltHassReportJson,
} from '../types'

const RENDERER_VERSION = 'halt-hass-report-chart/1.1'

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, payload] = dataUrl.split(',', 2)
  const mimeType = header.match(/data:([^;]+)/)?.[1] || 'image/png'
  const binary = atob(payload)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type: mimeType })
}

async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest))
    .map(value => value.toString(16).padStart(2, '0'))
    .join('')
}

function fileSafe(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 80) || 'board'
}

function secondsLabel(value: number): string {
  const seconds = Math.max(0, Math.round(value))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

async function renderChart(
  report: HaltHassReportJson,
  chartType: HaltHassChartImage['chartType'],
  title: string,
  unit: string,
  series: Array<{
    name: string
    color: string
    data: Array<[number, number | null]>
    dashed?: boolean
  }>,
): Promise<HaltHassChartUpload> {
  const host = document.createElement('div')
  host.style.cssText = [
    'position:fixed',
    'left:-10000px',
    'top:0',
    'width:1600px',
    'height:900px',
    'background:#fff',
    'pointer-events:none',
  ].join(';')
  document.body.appendChild(host)
  const chart = echarts.init(host, undefined, { renderer: 'canvas', width: 1600, height: 900 })
  try {
    chart.setOption({
      animation: false,
      backgroundColor: '#ffffff',
      title: {
        text: title,
        subtext: `目标板：${report.targetSerial || '-'}    测试时段：${report.startTime} 至 ${report.endTime}`,
        left: 54,
        top: 28,
        textStyle: { color: '#172033', fontSize: 26, fontWeight: 600 },
        subtextStyle: { color: '#667085', fontSize: 14, lineHeight: 28 },
      },
      legend: { top: 96, right: 60 },
      tooltip: { trigger: 'axis' },
      grid: { left: 86, right: 60, top: 150, bottom: 92 },
      xAxis: {
        type: 'value',
        name: '测试时间',
        min: 0,
        max: Math.max(report.duration, 1),
        axisLabel: { formatter: secondsLabel },
      },
      yAxis: { type: 'value', name: unit },
      graphic: series.every(item => item.data.length === 0)
        ? [{
            type: 'text',
            left: 'center',
            top: 'middle',
            style: { text: '本次测试未采集到有效数据', fill: '#98a2b3', fontSize: 24 },
          }]
        : [],
      series: series.map(item => ({
        name: item.name,
        type: 'line',
        data: item.data,
        showSymbol: false,
        connectNulls: false,
        sampling: 'lttb',
        lineStyle: {
          width: item.dashed ? 2 : 2.5,
          type: item.dashed ? 'dashed' : 'solid',
          color: item.color,
        },
        itemStyle: { color: item.color },
      })),
    })
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    const blob = dataUrlToBlob(chart.getDataURL({
      type: 'png',
      pixelRatio: 1,
      backgroundColor: '#ffffff',
    }))
    const checksum = await sha256(blob)
    const metadata: HaltHassChartImage = {
      chartType,
      title,
      fileName: `${fileSafe(report.targetSerial || String(report.targetBoardId || 'board'))}-${chartType}.png`,
      mimeType: 'image/png',
      startAt: report.startTime,
      endAt: report.endTime,
      checksum,
      rendererVersion: RENDERER_VERSION,
      size: blob.size,
    }
    return { metadata, blob }
  } finally {
    chart.dispose()
    host.remove()
  }
}

function withTimeGaps(
  data: Array<[number, number | null]>,
  maximumGapSeconds: number,
): Array<[number, number | null]> {
  const output: Array<[number, number | null]> = []
  let previousTime: number | null = null
  for (const point of data) {
    if (previousTime !== null && point[0] - previousTime > maximumGapSeconds) {
      output.push([(previousTime + point[0]) / 2, null])
    }
    output.push(point)
    previousTime = point[0]
  }
  return output
}

function actual(
  summary: HaltHassChartSummary['temperature'],
  maximumGapSeconds: number,
): Array<[number, number | null]> {
  return withTimeGaps(
    summary.map(point => [point.time, point.actual]),
    maximumGapSeconds,
  )
}

function target(
  summary: HaltHassChartSummary['temperature'],
  maximumGapSeconds: number,
): Array<[number, number | null]> {
  return withTimeGaps(
    summary.map(point => [point.time, point.target]),
    maximumGapSeconds,
  )
}

export async function generateHaltHassReportCharts(
  report: HaltHassReportJson,
): Promise<HaltHassChartUpload[]> {
  const summary = report.chartSummary || {
    pulser: [],
    temperature: [],
    vibration: [],
    current48v: [],
    current90v: [],
  }
  return Promise.all([
    renderChart(report, 'pulser', '脉冲器电流波形', 'mA', [
      { name: '实际值', color: '#0f766e', data: actual(summary.pulser, 0.25) },
      { name: '目标值', color: '#e87917', data: target(summary.pulser, 0.25), dashed: true },
    ]),
    renderChart(report, 'temperature', '温度曲线', '℃', [
      { name: '实际温度', color: '#dc2626', data: actual(summary.temperature, 10) },
      { name: '目标温度', color: '#f59e0b', data: target(summary.temperature, 10), dashed: true },
    ]),
    renderChart(report, 'vibration', '振动曲线', 'g', [
      { name: '实际振动', color: '#2563eb', data: actual(summary.vibration, 10) },
      { name: '目标振动', color: '#7c3aed', data: target(summary.vibration, 10), dashed: true },
    ]),
    renderChart(report, 'current', '工作电流曲线', 'mA', [
      { name: '48V 电流', color: '#0f766e', data: withTimeGaps(summary.current48v.map(point => [point.time, point.value]), 30) },
      { name: '90V 电流', color: '#c2410c', data: withTimeGaps(summary.current90v.map(point => [point.time, point.value]), 30) },
    ]),
  ])
}
