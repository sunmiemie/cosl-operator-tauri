import type { EChartsOption } from "echarts"
import type { InstrumentKcConfig } from "../types"

/** 读取 Element Plus CSS 变量，保证图表配色与系统主题一致 */
function cssVar(name: string, fallback: string) {
  if (typeof document === "undefined") return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

function chartColors() {
  return {
    primary: cssVar("--el-color-primary", "#00bb99"),
    success: cssVar("--el-color-success", "#67c23a"),
    danger: cssVar("--el-color-danger", "#f56c6c"),
    grid: cssVar("--el-border-color-lighter", "#ebeef5"),
    axis: cssVar("--el-text-color-secondary", "#909399"),
    rangeFill: cssVar("--el-color-success-light-9", "rgba(103, 194, 58, 0.1)")
  }
}

/** 构建「本月每日刻度次数」柱状图配置 */
export function buildDailyCalibrationOption(counts: number[]): EChartsOption {
  const colors = chartColors()
  const labels = counts.map((_, index) => String(index + 1))

  return {
    color: [colors.primary],
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params) => {
        const item = Array.isArray(params) ? params[0] : params
        return `第 ${item.name} 日<br/>刻度次数：${item.value} 次`
      }
    },
    grid: { left: 40, right: 20, top: 28, bottom: 28, containLabel: true },
    xAxis: {
      type: "category",
      data: labels,
      axisLine: { lineStyle: { color: colors.grid } },
      axisTick: { show: false },
      axisLabel: {
        color: colors.axis,
        fontSize: 11,
        interval: (index: number) => index % 5 === 0 || index === labels.length - 1
      }
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      splitLine: { lineStyle: { color: colors.grid, type: "dashed" } },
      axisLabel: { color: colors.axis, fontSize: 11 }
    },
    series: [
      {
        name: "刻度次数",
        type: "bar",
        barWidth: "52%",
        itemStyle: { borderRadius: [4, 4, 0, 0] },
        data: counts
      }
    ]
  }
}

/** 构建仪器 Kc 折线图配置（含合格区间背景带） */
export function buildInstrumentKcOption(config: InstrumentKcConfig): EChartsOption {
  const colors = chartColors()
  const labels = config.values.map((_, index) => `#${index + 1}`)
  const yPadding = 0.8

  return {
    color: [colors.primary],
    tooltip: {
      trigger: "axis",
      formatter: (params) => {
        const item = Array.isArray(params) ? params[0] : params
        const value = Number(item.value)
        const inRange = value >= config.kcMin && value <= config.kcMax
        return `${item.name}<br/>Kc：${value.toFixed(2)}<br/>合格区间：[${config.kcMin}, ${config.kcMax}]<br/>状态：${inRange ? "合格" : "异常"}`
      }
    },
    grid: { left: 44, right: 16, top: 32, bottom: 24, containLabel: false },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: labels,
      axisLine: { lineStyle: { color: colors.grid } },
      axisTick: { show: false },
      axisLabel: { color: colors.axis, fontSize: 11 }
    },
    yAxis: {
      type: "value",
      min: config.kcMin - yPadding,
      max: config.kcMax + yPadding,
      splitLine: { lineStyle: { color: colors.grid, type: "dashed" } },
      axisLabel: { color: colors.axis, fontSize: 11 }
    },
    series: [
      {
        name: "Kc",
        type: "line",
        smooth: true,
        symbol: "circle",
        symbolSize: 6,
        lineStyle: { width: 2 },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: `${colors.primary}33` },
              { offset: 1, color: `${colors.primary}05` }
            ]
          }
        },
        markArea: {
          silent: true,
          itemStyle: { color: colors.rangeFill },
          data: [[{ yAxis: config.kcMin }, { yAxis: config.kcMax }]]
        },
        data: config.values.map((value) => ({
          value,
          itemStyle: {
            color: value >= config.kcMin && value <= config.kcMax ? colors.success : colors.danger
          }
        }))
      }
    ]
  }
}
