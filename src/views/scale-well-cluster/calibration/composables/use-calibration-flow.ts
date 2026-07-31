import { computed, onMounted, ref } from "vue"
import { useRouter } from "vue-router"
import { ElMessage } from "element-plus"
import { useAuth } from "@/composables/useAuth"
import { completeCalibrationOrder, getCalibrationHistoryLast } from "@/services/scale-well-api"
import { closeDeviceSession, openDeviceSession, writeCoefficients } from "@/services/calibration-device"
import { useScaleWellSession } from "../../shared/composables/useScaleWellSession"
import { getToolDisplayName, TOOL_PARAMS, TOOL_TYPE_OPTIONS } from "../../shared/constants/tool-params"
import { getOrderQualification } from "../../shared/utils/qualification"
import type { CalibrationWorkOrder } from "../../shared/types"
import { useSamplingPhase } from "./use-sampling-phase"
import type { SamplingPhase } from "./sampling-utils"
import { createEmptyPhaseState, emptyStats } from "./sampling-utils"
import {
  buildSummaryText,
  calcCalibrationResults,
  mapHistoryToCalCoefficients,
  type CalCoefficients
} from "./calibration-results"

export const CAL_STEPS = [
  "通电前检查",
  "系统连接",
  "参数配置",
  "高刻采样",
  "低刻采样",
  "结果校验",
  "写入仪器"
] as const

export const PRE_CHECK_LABELS = [
  "测试设备准备完毕，工作正常",
  "仪器外观无损坏，外形尺寸正常",
  "仪器针脚检查，无弯曲，镀层无脱落",
  "仪器附近没有放射性干扰源"
]

export const CONN_GUIDE = {
  badge: "Step 1",
  title: "连接 TBUS 测试线至仪器端面",
  text: "将 TBUS 测试线的母插针插入 DWPR 母螺纹端公插针；公插针端穿过公提丝后顺时针旋紧；将通讯测试线夹子夹紧公提丝。",
  warn: "旋紧公提丝时注意保护通讯测试线，避免外皮破损。"
}

export const POWER_PARAM_ROWS = (dual: boolean) => [
  ["上电电流参考", dual ? "70 ～ 80 mA" : "250 ～ 700 mA", dual ? "WAGR 伽马短节正常范围" : "DWPR/IDMP 正常工作范围"],
  ["电压设置", "24 V", "直流电源输出电压"],
  ["上电稳定时间", dual ? "约 10 s" : "约 30 s", "等待仪器完成自检后通信"],
  ["过流保护阈值", dual ? "120 mA" : "800 mA", "超过此值应立即断电检查"]
]

export function useCalibrationFlow() {
  const router = useRouter()
  const { getAuthHeaders } = useAuth()
  const { activeWorkOrder, calibrationDraft, finalizeCalibration, setCalibrationSummary, setLastCalibrationCoeffs } =
    useScaleWellSession()
  const step = ref(0)

  const editableOrder = ref<CalibrationWorkOrder | null>(null)
  const lastCal = ref<CalCoefficients | null>(null)

  const loadLastCalibration = async (serialNumber: string) => {
    try {
      const response = await getCalibrationHistoryLast(serialNumber, getAuthHeaders())
      const payload = response.data
      if (response.success && payload?.code === 0) {
        const mapped = mapHistoryToCalCoefficients(payload.data)
        lastCal.value = mapped
        setLastCalibrationCoeffs(mapped)
      }
    } catch {
      lastCal.value = null
      setLastCalibrationCoeffs(null)
    }
  }

  onMounted(() => {
    if (!activeWorkOrder.value) {
      ElMessage.warning("请先从数据看板选择工单")
      router.replace("/scale-well-cluster/data-board")
      return
    }
    editableOrder.value = { ...activeWorkOrder.value }
    if (activeWorkOrder.value.serialNumber) {
      void loadLastCalibration(activeWorkOrder.value.serialNumber)
    }
  })

  const order = computed(() => editableOrder.value ?? activeWorkOrder.value)

  const samplingOrder = computed(() => order.value ?? null)

  const {
    runCommPretest,
    runFormalSampling,
    readSingle,
    toggleChartSeries,
    copyDataToExcel,
    manualCalculate,
    toggleSdDebug,
    initPhaseLabels
  } = useSamplingPhase(calibrationDraft, samplingOrder)

  const toolCfg = computed(() => {
    const t = order.value?.toolType
    return t ? TOOL_PARAMS[t as keyof typeof TOOL_PARAMS] : null
  })

  const qualification = computed(() => (order.value ? getOrderQualification(order.value) : null))

  const isDualSensor = computed(() => qualification.value?.dualSensor ?? false)

  const preCheckCount = computed(() => calibrationDraft.value.preChecks.filter(Boolean).length)

  const preCheckDone = computed(() => preCheckCount.value === PRE_CHECK_LABELS.length)

  const results = computed(() => {
    const o = order.value
    const qual = qualification.value
    if (!o || !qual) return null

    const calculated = calcCalibrationResults(
      calibrationDraft.value,
      o,
      isDualSensor.value,
      qual
    )
    if (calculated) return calculated

    const kc = calibrationDraft.value.hiSampleKc ?? calibrationDraft.value.loSampleKc
    if (kc == null) return null
    const bb = calibrationDraft.value.hiSampleBa ?? -0.8
    const kbOk = kc >= qual.kbMin && kc <= qual.kbMax
    const bbOk = Math.abs(bb) <= qual.bbLimit
    return {
      ka: 0,
      kb: kc,
      kc,
      ba: 0,
      bb,
      bc: bb,
      kaOk: true,
      kbOk,
      kcOk: kbOk,
      baOk: true,
      bbOk,
      bcOk: bbOk,
      bOk: bbOk,
      allOk: kbOk && bbOk,
      hiMean: calibrationDraft.value.hiStats.mean ?? 0,
      loMean: calibrationDraft.value.loStats.mean ?? 0
    }
  })

  const canNext = computed(() => {
    switch (step.value) {
      case 0:
        return preCheckDone.value
      case 1:
        return calibrationDraft.value.connectionDone
      case 2:
        return calibrationDraft.value.fileCreated
      case 3:
        return calibrationDraft.value.hiSamplingDone
      case 4:
        return calibrationDraft.value.loSamplingDone
      case 5:
        return results.value?.allOk ?? false
      case 6:
        return calibrationDraft.value.dataWritten
      default:
        return true
    }
  })

  const togglePreCheck = (index: number) => {
    calibrationDraft.value.preChecks[index] = !calibrationDraft.value.preChecks[index]
  }

  const connNext = () => {
    calibrationDraft.value.connectionDone = true
  }

  const connPrev = () => {
    calibrationDraft.value.connectionDone = false
  }

  const onToolTypeChange = (toolType: string) => {
    if (!editableOrder.value) return
    const cfg = TOOL_PARAMS[toolType as keyof typeof TOOL_PARAMS]
    if (!cfg) return
    editableOrder.value.toolType = toolType
    editableOrder.value.hiWell = cfg.hiWell
    editableOrder.value.loWell = cfg.loWell
    editableOrder.value.hiApi = cfg.hiApi
    editableOrder.value.loApi = cfg.loApi
    calibrationDraft.value.hiHole = cfg.hole
    calibrationDraft.value.loHole = cfg.hole
  }

  const saveParamsAndNext = async () => {
    if (!order.value?.serialNumber.trim() || !order.value.engineer.trim()) {
      ElMessage.warning("仪器编号和测试人员不能为空")
      return
    }
    if (!order.value.dbId) {
      ElMessage.warning("工单 ID 无效")
      return
    }
    try {
      const session = await openDeviceSession(order.value.dbId, getAuthHeaders())
      calibrationDraft.value.deviceSessionId = session.sessionId
      calibrationDraft.value.fileCreated = true
      ElMessage.success("刻度文件已建立，设备会话已开启")
      step.value = 3
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : "开启设备会话失败")
    }
  }

  const initSamplingPhase = (phase: SamplingPhase) => {
    initPhaseLabels(phase)
    const ps = phase === "hi" ? calibrationDraft.value.hiPhase : calibrationDraft.value.loPhase
    ps.sampleButtonLabel = phase === "hi" ? "▶ 启动高刻采样" : "▶ 启动低刻采样"
  }

  const writeToInstrument = async () => {
    const currentResults = results.value
    const sessionId = calibrationDraft.value.deviceSessionId
    if (!currentResults || !sessionId) return
    try {
      await writeCoefficients(
        sessionId,
        {
          ka: currentResults.ka,
          kb: currentResults.kb,
          kc: currentResults.kc,
          ba: currentResults.ba,
          bb: currentResults.bb,
          bc: currentResults.bc
        },
        getAuthHeaders()
      )
      calibrationDraft.value.dataWritten = true
      ElMessage.success("刻度数据已写入仪器")
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : "写入仪器失败")
    }
  }

  const restartSampling = () => {
    calibrationDraft.value.hiPhase = createEmptyPhaseState()
    calibrationDraft.value.loPhase = createEmptyPhaseState()
    calibrationDraft.value.hiSamplingDone = false
    calibrationDraft.value.loSamplingDone = false
    calibrationDraft.value.hiSampleKc = null
    calibrationDraft.value.loSampleKc = null
    calibrationDraft.value.hiSampleBa = null
    calibrationDraft.value.loSampleBa = null
    calibrationDraft.value.hiSampleProgress = 0
    calibrationDraft.value.loSampleProgress = 0
    calibrationDraft.value.hiStats = emptyStats()
    calibrationDraft.value.loStats = emptyStats()
    calibrationDraft.value.dataWritten = false
    step.value = 3
    ElMessage.info("已重置采样数据，请重新进行高刻采样")
  }

  const nextStep = () => {
    if (step.value === 2) {
      saveParamsAndNext()
      return
    }
    if (!canNext.value) {
      ElMessage.warning("请先完成当前步骤")
      return
    }
    if (step.value < CAL_STEPS.length - 1) step.value += 1
  }

  const prevStep = () => {
    if (step.value > 0) step.value -= 1
  }

  const finish = async () => {
    const o = order.value
    const qual = qualification.value
    const currentResults = results.value

    if (!currentResults?.allOk) {
      ElMessage.warning("刻度结果不合格，无法完成流程")
      return
    }
    if (!o?.dbId) {
      ElMessage.error("工单缺少后端 ID，无法提交刻度结果")
      return
    }
    if (!qual) return

    const summary = buildSummaryText(currentResults, isDualSensor.value, qual)
    setCalibrationSummary(summary)

    const response = await completeCalibrationOrder(
      o.dbId,
      {
        kc: currentResults.kc,
        coefficients: {
          ka: currentResults.ka,
          kb: currentResults.kb,
          ba: currentResults.ba,
          bb: currentResults.bb,
          bc: currentResults.bc
        },
        hiMean: currentResults.hiMean,
        loMean: currentResults.loMean,
        calibrationSummary: summary
      },
      getAuthHeaders()
    )

    const payload = response.data
    if (!response.success || payload?.code !== 0) {
      ElMessage.error(payload?.msg || response.error || "刻度完成提交失败")
      return
    }

    if (order.value) {
      activeWorkOrder.value = {
        ...order.value,
        kc: currentResults.kc,
        statusCode: 3,
        statusText: "待审核"
      }
    }
    finalizeCalibration(currentResults)
    const sessionId = calibrationDraft.value.deviceSessionId
    if (sessionId) {
      try {
        await closeDeviceSession(sessionId, getAuthHeaders())
      } catch {
        /* ignore close errors on finish */
      }
      calibrationDraft.value.deviceSessionId = null
    }
    ElMessage.success("刻度流程完成，请填写报告")
    router.push("/scale-well-cluster/report/fill")
  }

  return {
    CAL_STEPS,
    PRE_CHECK_LABELS,
    CONN_GUIDE,
    step,
    order,
    editableOrder,
    calibrationDraft,
    toolCfg,
    qualification,
    isDualSensor,
    preCheckCount,
    preCheckDone,
    results,
    lastCal,
    canNext,
    togglePreCheck,
    connNext,
    connPrev,
    onToolTypeChange,
    saveParamsAndNext,
    initSamplingPhase,
    runCommPretest,
    runFormalSampling,
    readSingle,
    toggleChartSeries,
    copyDataToExcel,
    manualCalculate,
    toggleSdDebug,
    writeToInstrument,
    restartSampling,
    nextStep,
    prevStep,
    finish,
    getToolDisplayName,
    TOOL_TYPE_OPTIONS,
    POWER_PARAM_ROWS
  }
}
