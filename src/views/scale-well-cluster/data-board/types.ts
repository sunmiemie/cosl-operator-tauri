/** 统计卡片趋势类型 */
export type StatTrendType = "up" | "down" | "neutral"

/** 工单状态 */
export type WorkOrderStatus = "completed" | "pending"

/** 顶部统计卡片 */
export interface StatSummaryItem {
  key: string
  label: string
  value: number
  unit: string
  icon: string
  trendText: string
  trendType: StatTrendType
}

/** 刻度工单 */
export interface CalibrationWorkOrder {
  id: string
  type: string
  engineer: string
  date: string
  status: WorkOrderStatus
  kc: number | null
}

/** 仪器 Kc 图表配置 */
export interface InstrumentKcConfig {
  model: "475" | "675" | "800"
  title: string
  kcMin: number
  kcMax: number
  values: number[]
}
