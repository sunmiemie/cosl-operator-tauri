import { computed, ref } from "vue"
import { useAuth } from "@/composables/useAuth"
import { getToolDisplayName, TOOL_PARAMS } from "../constants/tool-params"
import type {
  CalibrationDraft,
  CalibrationWorkOrder,
  ReportDraft,
  ScaleWellRole
} from "../types"
import type { CalibrationResults, CalCoefficients } from "../../calibration/composables/calibration-results"
import { getOrderQualification } from "../utils/qualification"
import { createEmptyPhaseState, emptyStats } from "../../calibration/composables/sampling-utils"

const EMPTY_COEFFICIENTS: CalCoefficients = {
  ka: 0,
  kb: 0,
  kc: 0,
  ba: 0,
  bb: 0,
  bc: 0
}

const lastCalibrationCoeffs = ref<CalCoefficients | null>(null)

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
    hiPhase: createEmptyPhaseState(),
    loPhase: createEmptyPhaseState(),
    dataWritten: false,
    fileCreated: false,
    deviceSessionId: null
  }
}

const activeWorkOrder = ref<CalibrationWorkOrder | null>(null)
const roleOverride = ref<ScaleWellRole | null>("leader")
const loginTime = ref<number>(Date.now())

const calibrationDraft = ref<CalibrationDraft>(createEmptyCalibrationDraft())

const reportDraft = ref<ReportDraft | null>(null)
const savedReportId = ref<number | null>(null)
const calibrationSummary = ref<string>("")

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

function buildReportDraft(
  order: CalibrationWorkOrder,
  cal: CalibrationDraft,
  results?: CalibrationResults | null
): ReportDraft {
  const lastCal = lastCalibrationCoeffs.value ?? EMPTY_COEFFICIENTS
  const qual = getOrderQualification(order)
  const coeffs: CalCoefficients = results
    ? {
        ka: results.ka,
        kb: results.kb,
        kc: results.kc,
        ba: results.ba,
        bb: results.bb,
        bc: results.bc
      }
    : {
        ka: 0,
        kb: cal.hiSampleKc ?? cal.loSampleKc ?? order.kc ?? 0,
        kc: cal.hiSampleKc ?? cal.loSampleKc ?? order.kc ?? 0,
        ba: 0,
        bb: cal.hiSampleBa ?? -0.8,
        bc: cal.hiSampleBa ?? -0.8
      }

  const kc = coeffs.kc
  const testDate = formatToday()

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
      beforeData: { ...lastCal },
      currentData: { ...coeffs },
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
      ka: coeffs.ka,
      kb: coeffs.kb,
      kc: coeffs.kc,
      ba: coeffs.ba,
      bb: coeffs.bb,
      bc: coeffs.bc
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
      remark: `Kb [${qual.kbMin}, ${qual.kbMax}] · Bb ±${qual.bbLimit}`
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

  const finalizeCalibration = (results?: CalibrationResults | null) => {
    if (!activeWorkOrder.value) return null
    const draft = buildReportDraft(activeWorkOrder.value, calibrationDraft.value, results)
    reportDraft.value = draft
    if (results) {
      activeWorkOrder.value = { ...activeWorkOrder.value, kc: results.kc }
    }
    return draft
  }

  const initReportDraftIfEmpty = (results?: CalibrationResults | null) => {
    if (reportDraft.value || !activeWorkOrder.value) return
    reportDraft.value = buildReportDraft(activeWorkOrder.value, calibrationDraft.value, results)
  }

  const setSavedReportId = (id: number | null) => {
    savedReportId.value = id
  }

  const setCalibrationSummary = (text: string) => {
    calibrationSummary.value = text
  }

  const setLastCalibrationCoeffs = (coeffs: CalCoefficients | null) => {
    lastCalibrationCoeffs.value = coeffs
  }

  return {
    activeWorkOrder,
    calibrationDraft,
    reportDraft,
    savedReportId,
    calibrationSummary,
    role,
    loginTime,
    setRole,
    setActiveWorkOrder,
    resetCalibrationDraft,
    finalizeCalibration,
    initReportDraftIfEmpty,
    buildReportDraft,
    setSavedReportId,
    setCalibrationSummary,
    setLastCalibrationCoeffs
  }
}
