import orderIcon from "@/assets/iconimg/liuchengceshigongdan.svg"
import auditIcon from "@/assets/iconimg/jihuashenheshuliang.svg"
import deviceIcon from "@/assets/iconimg/shebei.svg"
import pendingIcon from "@/assets/iconimg/zhidongxiguzhang.svg"
import type { CalibrationWorkOrder, InstrumentKcConfig, StatSummaryItem } from "../types"

/** 顶部统计卡片（原型管理端数据看板） */
export const STAT_SUMMARY: StatSummaryItem[] = [
  {
    key: "monthly-count",
    label: "本月刻度次数",
    value: 42,
    unit: "次",
    icon: orderIcon,
    trendText: "↑ 较上月 +8",
    trendType: "up"
  },
  {
    key: "pass-rate",
    label: "刻度合格率",
    value: 97.6,
    unit: "%",
    icon: auditIcon,
    trendText: "↑ +0.4%",
    trendType: "up"
  },
  {
    key: "active-instruments",
    label: "在用仪器台数",
    value: 8,
    unit: "台",
    icon: deviceIcon,
    trendText: "475×3 / 675×4 / 800×1",
    trendType: "neutral"
  },
  {
    key: "pending-orders",
    label: "待处理工单",
    value: 3,
    unit: "件",
    icon: pendingIcon,
    trendText: "需尽快处理",
    trendType: "down"
  }
]

/** 本月每日刻度次数（固定演示数据，后续对接 API） */
export const DAILY_CALIBRATION_COUNTS = [
  1, 2, 1, 0, 2, 1, 3, 2, 1, 2, 1, 0, 1, 2, 3, 2, 1, 2, 1, 0, 2, 1, 2, 3, 1, 2, 1, 2, 1, 2
]

/** 刻度工单列表（原型 S.workOrders 精简版） */
export const CALIBRATION_WORK_ORDERS: CalibrationWorkOrder[] = [
  { id: "GR-2026-041", type: "675", engineer: "李工", date: "2026-05-28", status: "completed", kc: 6.52 },
  { id: "GR-2026-042", type: "475", engineer: "王工", date: "2026-05-30", status: "completed", kc: 4.38 },
  { id: "GR-2026-043", type: "IDMP475", engineer: "陈工", date: "2026-06-02", status: "completed", kc: 4.21 },
  { id: "GR-2026-044", type: "IDMP675", engineer: "陈工", date: "2026-06-04", status: "completed", kc: 6.87 },
  { id: "GR-2026-045", type: "IDMP800", engineer: "刘工", date: "2026-06-06", status: "completed", kc: 9.03 },
  { id: "GR-2026-046", type: "675", engineer: "李工", date: "2026-06-09", status: "pending", kc: null },
  { id: "GR-2026-047", type: "800", engineer: "赵工", date: "2026-06-10", status: "pending", kc: null },
  { id: "GR-2026-048", type: "475", engineer: "王工", date: "2026-06-11", status: "pending", kc: null }
]

/** 各型号仪器近 10 次 Kc 值 */
export const INSTRUMENT_KC_CONFIGS: InstrumentKcConfig[] = [
  {
    model: "475",
    title: "475仪器近10次Kc值",
    kcMin: 3.5,
    kcMax: 5.5,
    values: [4.12, 4.28, 4.35, 4.21, 4.44, 4.38, 4.31, 4.26, 4.42, 4.38]
  },
  {
    model: "675",
    title: "675仪器近10次Kc值",
    kcMin: 5.5,
    kcMax: 7.5,
    values: [6.42, 6.58, 6.71, 6.52, 6.65, 6.48, 6.73, 6.61, 6.55, 6.52]
  },
  {
    model: "800",
    title: "800仪器近10次Kc值",
    kcMin: 5.5,
    kcMax: 7.5,
    values: [6.88, 7.02, 6.95, 7.11, 6.84, 7.05, 6.92, 7.08, 6.97, 7.01]
  }
]
