import { computed, onMounted, ref } from "vue"
import { useRouter } from "vue-router"
import { ElMessage } from "element-plus"
import { useScaleWellSession } from "../../shared/composables/useScaleWellSession"
import { getToolDisplayName, TOOL_PARAMS, TOOL_TYPE_OPTIONS } from "../../shared/constants/tool-params"
import type { CalibrationWorkOrder, SampleStats } from "../../shared/types"

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

function mockStats(base: number): SampleStats {
  return {
    mean: +(base * 0.98).toFixed(2),
    std: +(base * 0.02).toFixed(3),
    max: +(base * 1.01).toFixed(2),
    min: +(base * 0.95).toFixed(2)
  }
}

export function useCalibrationFlow() {
  const router = useRouter()
  const { activeWorkOrder, calibrationDraft, finalizeCalibration } = useScaleWellSession()
  const step = ref(0)

  const editableOrder = ref<CalibrationWorkOrder | null>(null)

  onMounted(() => {
    if (!activeWorkOrder.value) {
      ElMessage.warning("请先从数据看板选择工单")
      router.replace("/scale-well-cluster/data-board")
      return
    }
    editableOrder.value = { ...activeWorkOrder.value }
  })

  const order = computed(() => editableOrder.value ?? activeWorkOrder.value)

  const toolCfg = computed(() => {
    const t = order.value?.toolType
    return t ? TOOL_PARAMS[t as keyof typeof TOOL_PARAMS] : null
  })

  const isDualSensor = computed(() => !!(toolCfg.value as { dualSensor?: boolean })?.dualSensor)

  const preCheckCount = computed(() => calibrationDraft.value.preChecks.filter(Boolean).length)

  const preCheckDone = computed(() => preCheckCount.value === PRE_CHECK_LABELS.length)

  const results = computed(() => {
    const kc = calibrationDraft.value.hiSampleKc ?? calibrationDraft.value.loSampleKc
    const bb = calibrationDraft.value.hiSampleBa ?? -0.8
    const cfg = toolCfg.value
    if (kc == null || !cfg) return null
    const kcOk = kc >= cfg.kcMin && kc <= cfg.kcMax
    const bOk = Math.abs(bb) <= 4
    return { ka: 0, kb: kc, kc, ba: 0, bb, bc: bb, kcOk, bOk, allOk: kcOk && bOk }
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

  const saveParamsAndNext = () => {
    if (!order.value?.serialNumber.trim() || !order.value.engineer.trim()) {
      ElMessage.warning("仪器编号和测试人员不能为空")
      return
    }
    calibrationDraft.value.fileCreated = true
    ElMessage.success("刻度文件已建立")
    step.value = 3
  }

  const runPretest = (phase: "hi" | "lo") => {
    if (phase === "hi") calibrationDraft.value.hiPretestDone = true
    else calibrationDraft.value.loPretestDone = true
    ElMessage.success("常温通信验证通过")
  }

  const runSampling = (phase: "hi" | "lo") => {
    const cfg = toolCfg.value
    if (!cfg) return
    const kc = +(cfg.kcMin + (cfg.kcMax - cfg.kcMin) * (phase === "hi" ? 0.62 : 0.48)).toFixed(2)
    const ba = -0.8
    const count = phase === "hi" ? calibrationDraft.value.hiCount : calibrationDraft.value.loCount
    const progressKey = phase === "hi" ? "hiSampleProgress" : "loSampleProgress"

    calibrationDraft.value[progressKey] = 0
    let tick = 0
    const progressStep = Math.max(10, Math.floor(1000 / count))
    const timer = window.setInterval(() => {
      tick += progressStep
      calibrationDraft.value[progressKey] = Math.min(tick, 100)
      if (tick >= 100) {
        window.clearInterval(timer)
        if (phase === "hi") {
          calibrationDraft.value.hiSampleKc = kc
          calibrationDraft.value.hiSampleBa = ba
          calibrationDraft.value.hiStats = mockStats(kc)
          calibrationDraft.value.hiSamplingDone = true
          ElMessage.success("高刻采样完成")
        } else {
          calibrationDraft.value.loSampleKc = kc
          calibrationDraft.value.loSampleBa = ba
          calibrationDraft.value.loStats = mockStats(kc)
          calibrationDraft.value.loSamplingDone = true
          ElMessage.success("低刻采样完成")
        }
      }
    }, 80)
  }

  const writeToInstrument = () => {
    calibrationDraft.value.dataWritten = true
    ElMessage.success("刻度数据已写入仪器")
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

  const finish = () => {
    if (order.value) activeWorkOrder.value = { ...order.value }
    finalizeCalibration()
    ElMessage.success("刻度流程完成，请填写报告")
    router.push("/scale-well-cluster/report")
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
    isDualSensor,
    preCheckCount,
    preCheckDone,
    results,
    canNext,
    togglePreCheck,
    connNext,
    connPrev,
    onToolTypeChange,
    saveParamsAndNext,
    runPretest,
    runSampling,
    writeToInstrument,
    nextStep,
    prevStep,
    finish,
    getToolDisplayName,
    TOOL_TYPE_OPTIONS,
    POWER_PARAM_ROWS
  }
}
