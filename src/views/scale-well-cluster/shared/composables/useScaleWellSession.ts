import { computed, ref } from "vue"
import { useAuth } from "@/composables/useAuth"
import { getToolDisplayName, TOOL_PARAMS } from "../constants/tool-params"
import type {
  CalibrationDraft,
  CalibrationWorkOrder,
  ReportDraft,
  ScaleWellRole
} from "../types"

const activeWorkOrder = ref<CalibrationWorkOrder | null>(null)
const roleOverride = ref<ScaleWellRole | null>(null)
const loginTime = ref<number>(Date.now())

const emptyStats = () => ({ mean: null, std: null, max: null, min: null })

export function createEmptyCalibrationDraft(order?: CalibrationWorkOrder | null): CalibrationDraft {
  const cfg = order ? TOOL_PARAMS[order.toolType as keyof typeof TOOL_PARAMS] : null
  return {
    preChecks: [false, false, false, false],
    connectionStep: 0,
    connectionDone: false,
    softVer: "IDEAS v3.2.1",
    qcEngineer: "",
    hiInterval: 20,
    hiCount: 100,
    loInterval: 20,
    loCount: 100,
    hiHole: cfg?.hole ?? 216,
    loHole: cfg?.hole ?? 216,
    hiPretestDone: false,
    loPretestDone: false,
    hiSampleProgress: 0,
    loSampleProgress: 0,
    hiSampleKc: null,
    loSampleKc: null,
    hiSampleBa: null,
    loSampleBa: null,
    hiStats: emptyStats(),
    loStats: emptyStats(),
    hiSamplingDone: false,
    loSamplingDone: false,
    dataWritten: false,
    fileCreated: false
  }
}

const calibrationDraft = ref<CalibrationDraft>(createEmptyCalibrationDraft())

const reportDraft = ref<ReportDraft | null>(null)

function inferRole(roles: readonly string[]): ScaleWellRole {
  if (roles.some((r) => /组长|leader|admin|管理/i.test(r))) {
    return "leader"
  }
  return "tester"
}

function formatToday() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function buildReportDraft(order: CalibrationWorkOrder, cal: CalibrationDraft): ReportDraft {
  const kc = cal.hiSampleKc ?? cal.loSampleKc ?? order.kc
  const bb = cal.hiSampleBa ?? -0.8
  const testDate = formatToday()
  const toolCfg = TOOL_PARAMS[order.toolType as keyof typeof TOOL_PARAMS]

  return {
    workOrderId: order.id,
    toolType: order.toolType,
    appendixA: {
      serialNumber: order.serialNumber,
      testDate,
      engineer: order.engineer,
      softVer: cal.softVer,
      cycleHours: "12",
      location: order.location,
      useWell: order.calibrationDevice.includes("井"),
      useJig: order.calibrationDevice.includes("Jig"),
      beforeData: { ka: 0, kb: kc, kc, ba: 0, bb, bc: bb },
      currentData: { ka: 0, kb: kc, kc, ba: 0, bb, bc: bb },
      remark: order.remark
    },
    appendixB: {
      toolTypeName: getToolDisplayName(order.toolType),
      serialNumber: order.serialNumber,
      engineer: order.engineer,
      testDate,
      qcEngineer: cal.qcEngineer || "质控工程师",
      qcDate: testDate,
      loWell: order.loWell,
      hiWell: order.hiWell,
      loApi: order.loApi,
      hiApi: order.hiApi,
      ka: 0,
      kb: kc,
      kc,
      ba: 0,
      bb,
      bc: bb
    },
    appendixC: {
      recordNo: `REC-${order.id.slice(-3)}`,
      serialNumber: order.serialNumber,
      engineer: order.engineer,
      testDate,
      hiWell: order.hiWell,
      loWell: order.loWell,
      hiApi: order.hiApi,
      loApi: order.loApi,
      remark: toolCfg ? `Kc 范围 [${toolCfg.kcMin}, ${toolCfg.kcMax}]` : ""
    }
  }
}

export function useScaleWellSession() {
  const { userInfo } = useAuth()

  const role = computed<ScaleWellRole>(() => {
    if (roleOverride.value) return roleOverride.value
    return inferRole(userInfo.value?.roles ?? [])
  })

  const setRole = (next: ScaleWellRole) => {
    roleOverride.value = next
  }

  const setActiveWorkOrder = (order: CalibrationWorkOrder | null) => {
    activeWorkOrder.value = order ? { ...order } : null
    if (order) {
      calibrationDraft.value = createEmptyCalibrationDraft(order)
    }
  }

  const resetCalibrationDraft = () => {
    calibrationDraft.value = createEmptyCalibrationDraft(activeWorkOrder.value)
  }

  const finalizeCalibration = () => {
    if (!activeWorkOrder.value) return null
    const draft = buildReportDraft(activeWorkOrder.value, calibrationDraft.value)
    reportDraft.value = draft
    return draft
  }

  const initReportDraftIfEmpty = () => {
    if (reportDraft.value || !activeWorkOrder.value) return
    reportDraft.value = buildReportDraft(activeWorkOrder.value, calibrationDraft.value)
  }

  return {
    activeWorkOrder,
    calibrationDraft,
    reportDraft,
    role,
    loginTime,
    setRole,
    setActiveWorkOrder,
    resetCalibrationDraft,
    finalizeCalibration,
    initReportDraftIfEmpty,
    buildReportDraft
  }
}
