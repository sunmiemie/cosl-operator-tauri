import type { CalibrationReport } from "../types"

function buildReport(partial: Omit<CalibrationReport, "appendixA" | "appendixB" | "appendixC"> & {
  appendixA?: Partial<CalibrationReport["appendixA"]>
  appendixB?: Partial<CalibrationReport["appendixB"]>
  appendixC?: Partial<CalibrationReport["appendixC"]>
}): CalibrationReport {
  const {
    appendixA: appendixAPartial,
    appendixB: appendixBPartial,
    appendixC: appendixCPartial,
    ...base
  } = partial

  return {
    ...base,
    appendixA: {
      serialNumber: base.serialNumber,
      testDate: base.testDate,
      engineer: base.engineer,
      softVer: base.softVer,
      cycleHours: "12",
      location: base.location,
      useWell: true,
      useJig: false,
      beforeData: { ka: 0, kb: 6.52, kc: 6.52, ba: 0, bb: -0.8, bc: -0.8 },
      currentData: {
        ka: 0,
        kb: base.kc,
        kc: base.kc,
        ba: 0,
        bb: -0.8,
        bc: -0.8
      },
      remark: "",
      ...appendixAPartial
    },
    appendixB: {
      toolTypeName: base.toolType,
      serialNumber: base.serialNumber,
      engineer: base.engineer,
      testDate: base.testDate,
      qcEngineer: "质控工程师",
      qcDate: base.testDate,
      loWell: base.loWell,
      hiWell: base.hiWell,
      loApi: base.loApi,
      hiApi: base.hiApi,
      ka: 0,
      kb: base.kc,
      kc: base.kc,
      ba: 0,
      bb: -0.8,
      bc: -0.8,
      ...appendixBPartial
    },
    appendixC: {
      recordNo: `REC-${base.workOrderId.slice(-3)}`,
      serialNumber: base.serialNumber,
      engineer: base.engineer,
      testDate: base.testDate,
      hiWell: base.hiWell,
      loWell: base.loWell,
      hiApi: base.hiApi,
      loApi: base.loApi,
      remark: "刻度过程正常，数据已写入仪器。",
      ...appendixCPartial
    }
  }
}

/** 演示报告数据（源自原型已完成工单） */
export const MOCK_CALIBRATION_REPORTS: CalibrationReport[] = [
  buildReport({
    id: "RPT-GR-2026-041",
    workOrderId: "GR-2026-041",
    toolType: "675",
    serialNumber: "DWPR675A-0001",
    engineer: "李工",
    testDate: "2026-05-28",
    location: "YJ基地",
    kc: 6.52,
    hiWell: "F5",
    loWell: "K5",
    hiApi: 242.3,
    loApi: 13.3,
    softVer: "IDEAS v3.2.1",
    status: "approved",
    submittedAt: "2026-05-28 16:30"
  }),
  buildReport({
    id: "RPT-GR-2026-042",
    workOrderId: "GR-2026-042",
    toolType: "475",
    serialNumber: "DWPR475A-0003",
    engineer: "王工",
    testDate: "2026-05-30",
    location: "YJ基地",
    kc: 4.38,
    hiWell: "F1",
    loWell: "K1",
    hiApi: 264.5,
    loApi: 11.8,
    softVer: "IDEAS v3.2.1",
    status: "approved",
    submittedAt: "2026-05-30 11:20"
  }),
  buildReport({
    id: "RPT-GR-2026-043",
    workOrderId: "GR-2026-043",
    toolType: "IDMP475",
    serialNumber: "IDMP475-0001",
    engineer: "陈工",
    testDate: "2026-06-02",
    location: "YJ基地",
    kc: 4.21,
    hiWell: "F1",
    loWell: "K1",
    hiApi: 264.5,
    loApi: 11.8,
    softVer: "IDEAS v3.2.1",
    status: "approved",
    submittedAt: "2026-06-02 15:45"
  }),
  buildReport({
    id: "RPT-GR-2026-044",
    workOrderId: "GR-2026-044",
    toolType: "IDMP675",
    serialNumber: "IDMP675-0001",
    engineer: "陈工",
    testDate: "2026-06-04",
    location: "YJ基地",
    kc: 6.87,
    hiWell: "F5",
    loWell: "K5",
    hiApi: 242.3,
    loApi: 13.3,
    softVer: "IDEAS v3.2.1",
    status: "pending",
    submittedAt: "2026-06-04 17:10"
  }),
  buildReport({
    id: "RPT-GR-2026-045",
    workOrderId: "GR-2026-045",
    toolType: "IDMP800",
    serialNumber: "IDMP800-0001",
    engineer: "刘工",
    testDate: "2026-06-06",
    location: "YJ基地",
    kc: 9.03,
    hiWell: "F7",
    loWell: "K7",
    hiApi: 213.4,
    loApi: 13.0,
    softVer: "IDEAS v3.2.1",
    status: "pending",
    submittedAt: "2026-06-06 09:55"
  }),
  buildReport({
    id: "RPT-GR-2026-046",
    workOrderId: "GR-2026-046",
    toolType: "675",
    serialNumber: "DWPR675A-0002",
    engineer: "李工",
    testDate: "2026-06-09",
    location: "YJ基地",
    kc: 6.48,
    hiWell: "F5",
    loWell: "K5",
    hiApi: 242.3,
    loApi: 13.3,
    softVer: "IDEAS v3.2.1",
    status: "rejected",
    submittedAt: "2026-06-09 14:20",
    appendixA: { remark: "低刻采样点数不足，需复测。" }
  })
]

export const REPORT_STATUS_OPTIONS = [
  { label: "待审核", value: "pending" },
  { label: "合格", value: "approved" },
  { label: "不合格", value: "rejected" }
] as const

export const APPENDIX_TABS = [
  { key: "appA", label: "附录A · 伽马刻度工单" },
  { key: "appB", label: "附录B · 测试记录表" },
  { key: "appC", label: "刻度井记录表" }
] as const
