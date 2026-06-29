import { getToolDefaults } from "./tool-params"
import type { CalibrationWorkOrder } from "../types"

function buildOrder(
  partial: Omit<CalibrationWorkOrder, "hiWell" | "loWell" | "hiApi" | "loApi"> & { toolType: string }
): CalibrationWorkOrder {
  const defaults = getToolDefaults(partial.toolType)
  return {
    ...partial,
    hiWell: defaults.hiWell,
    loWell: defaults.loWell,
    hiApi: defaults.hiApi ?? 0,
    loApi: defaults.loApi ?? 0
  }
}

/** 演示工单数据（源自原型 S.workOrders） */
export const INITIAL_MOCK_WORK_ORDERS: CalibrationWorkOrder[] = [
  buildOrder({
    id: "GR-2026-041",
    toolType: "675",
    serialNumber: "DWPR675A-0001",
    engineer: "李工",
    location: "YJ基地",
    calibrationDevice: "Gal Jig",
    remark: "",
    planDate: "2026-05-28",
    status: "completed",
    kc: 6.52
  }),
  buildOrder({
    id: "GR-2026-042",
    toolType: "475",
    serialNumber: "DWPR475A-0003",
    engineer: "王工",
    location: "YJ基地",
    calibrationDevice: "Gal Jig",
    remark: "",
    planDate: "2026-05-30",
    status: "completed",
    kc: 4.38
  }),
  buildOrder({
    id: "GR-2026-043",
    toolType: "IDMP475",
    serialNumber: "IDMP475-0001",
    engineer: "陈工",
    location: "YJ基地",
    calibrationDevice: "Gal Jig",
    remark: "IDMP2.0 首批测试",
    planDate: "2026-06-02",
    status: "completed",
    kc: 4.21
  }),
  buildOrder({
    id: "GR-2026-046",
    toolType: "675",
    serialNumber: "DWPR675A-0002",
    engineer: "李工",
    location: "YJ基地",
    calibrationDevice: "刻度井",
    remark: "待安排测试",
    planDate: "2026-06-09",
    status: "pending",
    kc: null
  }),
  buildOrder({
    id: "GR-2026-047",
    toolType: "800",
    serialNumber: "DWPR800A-0001",
    engineer: "赵工",
    location: "YJ基地",
    calibrationDevice: "刻度井",
    remark: "",
    planDate: "2026-06-10",
    status: "in_progress",
    kc: null
  }),
  buildOrder({
    id: "GR-2026-048",
    toolType: "475",
    serialNumber: "DWPR475A-0002",
    engineer: "王工",
    location: "YJ基地",
    calibrationDevice: "刻度井",
    remark: "优先处理",
    planDate: "2026-06-11",
    status: "pending",
    kc: null
  }),
  buildOrder({
    id: "GR-2026-049",
    toolType: "WAGR",
    serialNumber: "WAGR475A-0001",
    engineer: "张工",
    location: "YJ基地",
    calibrationDevice: "Gal Jig",
    remark: "双传感器仪器",
    planDate: "2026-06-12",
    status: "pending",
    kc: null
  })
]
