import { nextTick, type Ref } from "vue"
import { ElMessage, ElMessageBox } from "element-plus"
import { useAuth } from "@/composables/useAuth"
import {
  readPretestReading,
  streamFormalSampling,
  streamPretest100,
  streamPretestRead
} from "@/services/calibration-device"
import { TOOL_PARAMS } from "../../shared/constants/tool-params"
import { getOrderQualification } from "../../shared/utils/qualification"
import type { CalibrationDraft, CalibrationWorkOrder, PhaseSamplingState, SampleLogLine } from "../../shared/types"
import {
  computeStats,
  getPositionHintSteps,
  logTs,
  nowHm,
  nowHms,
  type SamplingPhase
} from "./sampling-utils"

type ToolCfg = (typeof TOOL_PARAMS)[keyof typeof TOOL_PARAMS]

function getPhaseState(draft: CalibrationDraft, phase: SamplingPhase): PhaseSamplingState {
  return phase === "hi" ? draft.hiPhase : draft.loPhase
}

function addLog(phaseState: PhaseSamplingState, msg: string, type: SampleLogLine["type"] = "info") {
  phaseState.logs.push({ ts: logTs(), msg, type })
}

function addSdLog(phaseState: PhaseSamplingState, msg: string) {
  phaseState.sdLogs.push(msg)
}

function applyPretestProgress(
  pretest: PhaseSamplingState["pretest"],
  step: string,
  value: unknown
) {
  const text = value == null ? "—" : String(value)
  if (step === "sn") pretest.sn = text
  if (step === "firmware") pretest.firmware = text
  if (step === "count") pretest.count = String(Math.round(Number(value)))
  if (step === "cps") pretest.cps = text
  if (step === "gr") pretest.gr = text
  if (step === "standby_cur") pretest.standbyCur = text
  if (step === "sync") pretest.sync = text
  if (step === "status") pretest.status = text
}

/** 让出渲染帧，避免 SSE 事件在同一 tick 内批量处理导致 UI 只在结束时刷新 */
async function flushUi() {
  await nextTick()
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

export function useSamplingPhase(
  draft: Ref<CalibrationDraft>,
  order: Ref<CalibrationWorkOrder | null>
) {
  const { getAuthHeaders } = useAuth()

  const requireSessionId = () => {
    const sid = draft.value.deviceSessionId
    if (!sid) throw new Error("设备会话未开启，请先完成参数配置")
    return sid
  }

  const getCfg = () => {
    const t = order.value?.toolType
    return t ? TOOL_PARAMS[t as keyof typeof TOOL_PARAMS] : null
  }

  const isDual = (cfg: ToolCfg | null, o: CalibrationWorkOrder | null) =>
    o ? getOrderQualification(o).dualSensor : !!(cfg && "dualSensor" in cfg && cfg.dualSensor)

  const resetPhaseButtonLabels = (phase: SamplingPhase) => {
    const ps = getPhaseState(draft.value, phase)
    ps.sampleButtonLabel = phase === "hi" ? "▶ 启动高刻采样" : "▶ 启动低刻采样"
    ps.pretest.buttonLabel = "▶ 启动常温检查"
  }

  const runCommPretest = (phase: SamplingPhase) => {
    const cfg = getCfg()
    const o = order.value
    if (!cfg || !o) return

    const phaseState = getPhaseState(draft.value, phase)
    const isHi = phase === "hi"
    const pretest = phaseState.pretest

    if (pretest.running) return
    pretest.running = true
    pretest.buttonLabel = "测试进行中..."
    pretest.commVisible = false
    phaseState.pretestResultVisible = false
    phaseState.pretestRows = []
    phaseState.pretestProgress = 0
    phaseState.pretestLiveCps = null

    const now = new Date()
    const dual = isDual(cfg, o)
    const qual = getOrderQualification(o)
    pretest.standbyCur = dual
      ? `${(0.07 + Math.random() * 0.01).toFixed(3)} A`
      : `${(0.2 + Math.random() * 0.03).toFixed(3)} A`
    pretest.cgrTime = nowHm()
    pretest.firmware = "AGR 1.14.15"
    pretest.flashErase = nowHm(new Date(now.getTime() + 110000))

    void (async () => {
      try {
        const sessionId = requireSessionId()
        const headers = getAuthHeaders()

        pretest.sn = o.serialNumber || "—"

        let commOk = false
        await streamPretestRead(sessionId, async (event, data) => {
          if (event === "progress") {
            applyPretestProgress(pretest, String(data.step), data.value)
            await flushUi()
            return
          }
          if (event === "comm_result") {
            commOk = Boolean(data.comm_ok)
            pretest.commOk = commOk
            pretest.commVisible = true
            pretest.commMessage = commOk
              ? `通信验证通过：CPS=${pretest.cps}（<50 ✓），GR=${pretest.gr}（<200 ✓），仪器通信正常。`
              : "通信异常：请检查仪器连接及周围环境干扰。"
            await flushUi()
            return
          }
          if (event === "done") {
            const payload = (data.data ?? data) as Record<string, unknown>
            if (payload.sn) pretest.sn = String(payload.sn)
            if (payload.firmware) pretest.firmware = String(payload.firmware)
            if (payload.count != null) pretest.count = String(Math.round(Number(payload.count)))
            if (payload.cps != null) pretest.cps = String(payload.cps)
            if (payload.gr != null) pretest.gr = String(payload.gr)
            if (payload.standby_cur) pretest.standbyCur = String(payload.standby_cur)
            if (payload.sync) pretest.sync = String(payload.sync)
            if (payload.status) pretest.status = String(payload.status)
            if (payload.comm_ok != null) {
              commOk = Boolean(payload.comm_ok)
              pretest.commOk = commOk
            }
            await flushUi()
          }
          if (event === "error") {
            throw new Error(String(data.msg || "通信预检失败"))
          }
        }, headers)

        if (!commOk) {
          pretest.running = false
          pretest.buttonLabel = "▶ 重新检查"
          return
        }

        const tStart = new Date()
        phaseState.pretestStart = nowHms(tStart)
        phaseState.pretestFilename = `GR_${o.serialNumber}_${tStart.toISOString().slice(0, 10).replace(/-/g, "")}.dat`

        const total = isHi ? draft.value.hiCount : draft.value.loCount
        const ref = isHi
          ? ([qual.hiRefMin, qual.hiRefMax] as const)
          : ([qual.loRefMin, qual.loRefMax] as const)

        let meanB = 0
        let okB = false
        await streamPretest100(
          sessionId,
          {
            phase,
            refMin: ref[0],
            refMax: ref[1],
            total: 100,
            dualSensor: dual
          },
          async (event, data) => {
            if (event === "row") {
              phaseState.pretestRows.push({
                index: Number(data.index),
                cpsA: data.cps_a != null ? Number(data.cps_a) : undefined,
                cpsB: Number(data.cps_b),
                ok: Boolean(data.ok)
              })
              if (phaseState.pretestRows.length <= total) {
                phaseState.pretestProgress = Number(data.progress ?? 0)
                phaseState.pretestLiveCps = Number(data.cps_b)
              }
              await flushUi()
              return
            }
            if (event === "done") {
              meanB = Number(data.mean_b ?? 0)
              okB = Boolean(data.ok)
            }
            if (event === "error") {
              throw new Error(String(data.msg || "常温检查失败"))
            }
          },
          headers
        )

        phaseState.pretestEnd = nowHms(new Date())
        phaseState.pretestMean = meanB
        phaseState.pretestResultVisible = true
        phaseState.pretestResultOk = okB
        phaseState.pretestResultMessage = okB
          ? `常温检查通过！${isHi ? "高" : "低"}刻井均值 CPS=${meanB}（参考范围内），可以开始正式${isHi ? "高" : "低"}刻采样。`
          : "常温检查存在异常！请检查仪器连接、放置位置及周围干扰源后重新检查。"

        phaseState.pretestDone = okB
        phaseState.samplingUnlocked = okB
        draft.value[isHi ? "hiPretestDone" : "loPretestDone"] = okB

        pretest.running = false
        pretest.buttonLabel = okB ? "✓ 检查完成" : "▶ 重新检查"

        if (okB) {
          ElMessage.success("常温检查通过，采样区已解锁")
          showPositionHint(phase, o.hiWell, o.loWell, dual)
        } else {
          ElMessage.warning("常温检查未通过，请重新检查")
        }
      } catch (error) {
        pretest.running = false
        pretest.buttonLabel = "▶ 重新检查"
        ElMessage.error(error instanceof Error ? error.message : "通信预检失败")
      }
    })()
  }

  const runFormalSampling = async (phase: SamplingPhase) => {
    const cfg = getCfg()
    const o = order.value
    if (!cfg || !o) return

    const phaseState = getPhaseState(draft.value, phase)
    if (!phaseState.samplingUnlocked || phaseState.samplingRunning || phaseState.done) return

    const isHi = phase === "hi"
    const dual = isDual(cfg, o)
    const interval = isHi ? draft.value.hiInterval : draft.value.loInterval
    const target = isHi ? draft.value.hiCount : draft.value.loCount
    const progressKey = isHi ? "hiSampleProgress" : "loSampleProgress"
    const qual = getOrderQualification(o)
    const ref = isHi
      ? ([qual.hiRefMin, qual.hiRefMax] as const)
      : ([qual.loRefMin, qual.loRefMax] as const)
    const inst = (isHi ? o.hiWellCommConfigs : o.loWellCommConfigs)?.find((c) => c.deviceRole === "instrument")
    const portLabel = inst ? `${inst.vid}:${inst.pid}/${inst.adapterSerial}` : "服务端"

    phaseState.samplingRunning = true
    phaseState.sampleButtonLabel = "采样中..."
    phaseState.samples = []
    phaseState.samplesA = []
    phaseState.tableData = []
    phaseState.chartCps = []
    phaseState.chartCount = []
    phaseState.logs = []
    phaseState.currentPoint = 0
    phaseState.progress = 0
    draft.value[progressKey] = 0

    addLog(phaseState, `设备已连接 (${portLabel})`, "info")

    try {
      const sessionId = requireSessionId()
      const headers = getAuthHeaders()

      await streamFormalSampling(
        sessionId,
        {
          phase,
          hiApi: o.hiApi,
          loApi: o.loApi,
          refMin: ref[0],
          refMax: ref[1],
          count: target,
          dualSensor: dual,
          kcMin: qual.kbMin,
          kcMax: qual.kbMax
        },
        async (event, data) => {
          if (event === "power") {
            const mA = Math.round(Number(data.current_ma ?? 0))
            addLog(phaseState, `上电电流: ${mA}mA ✓`, "success")
            await flushUi()
            return
          }
          if (event === "power_start") {
            addLog(phaseState, "仪器上电 24V，电流检测中...", "info")
            await flushUi()
            return
          }
          if (event === "started") {
            addLog(phaseState, `时间同步完成，开始${isHi ? "高" : "低"}刻采样`, "success")
            const well = isHi ? cfg.hiWell : cfg.loWell
            const api = isHi ? o.hiApi : o.loApi
            addLog(phaseState, `目标井: ${well} (API=${api})`, "info")
            phaseState.tStart = logTs()
            await flushUi()
            return
          }
          if (event === "sample") {
            const count = Number(data.index)
            const cpsB = Number(data.cps_b)
            phaseState.samples.push(cpsB)
            const cB_H = Math.round(cpsB * interval)
            const cpsAVal = data.cps_a != null ? Number(data.cps_a) : null
            const cA_H = cpsAVal != null
              ? Math.round(cpsAVal * interval)
              : Math.round(cpsB * interval)
            phaseState.tableData.push({
              countA: cA_H,
              countB: cB_H,
              cpsA: +(cA_H / interval).toFixed(3),
              cpsB: +(cB_H / interval).toFixed(3)
            })
            if (dual && cpsAVal != null) {
              phaseState.samplesA.push(cpsAVal)
              phaseState.liveCpsA = cpsAVal
            }
            phaseState.chartCps.push(cpsB)
            phaseState.chartCount.push(cB_H)
            phaseState.liveCps = cpsB
            phaseState.currentPoint = count
            phaseState.progress = Number(data.progress ?? Math.round((count / target) * 100))
            draft.value[progressKey] = phaseState.progress

            const liveStats = computeStats(phaseState.samples)
            if (isHi) draft.value.hiStats = liveStats
            else draft.value.loStats = liveStats

            if (count % 20 === 0) {
              addLog(phaseState, `采样进度 ${count}/${target}，CPSB: ${cpsB.toFixed(2)}`, "info")
            }
            await flushUi()
            return
          }
          if (event === "done") {
            phaseState.done = true
            phaseState.samplingRunning = false
            phaseState.sampleButtonLabel = "采样已完成 ✓"
            phaseState.tEnd = logTs()
            phaseState.progress = 100
            draft.value[progressKey] = 100

            const stats = computeStats(phaseState.samples)
            if (isHi) {
              draft.value.hiStats = stats
              draft.value.hiSamplingDone = true
            } else {
              draft.value.loStats = stats
              draft.value.loSamplingDone = true
            }

            addLog(phaseState, "High Source Calibration Finish", "success")
            addLog(phaseState, `${isHi ? "高" : "低"}刻采样完成，共 ${target} 点`, "success")

            if (isHi) {
              ElMessageBox.alert(`共 ${target} 点数据已记录`, "高刻采样完成", { type: "success" })
            } else {
              ElMessage.success("低刻采样完成")
            }
            return
          }
          if (event === "error") {
            throw new Error(String(data.msg || "正式采样失败"))
          }
        },
        headers
      )
    } catch (error) {
      phaseState.samplingRunning = false
      phaseState.sampleButtonLabel = phase === "hi" ? "▶ 启动高刻采样" : "▶ 启动低刻采样"
      ElMessage.error(error instanceof Error ? error.message : "正式采样失败")
    }
  }

  const readSingle = (phase: SamplingPhase, field: "count" | "cps" | "gr") => {
    void (async () => {
      try {
        const sessionId = requireSessionId()
        const phaseState = getPhaseState(draft.value, phase)
        const reading = await readPretestReading(sessionId, getAuthHeaders())
        if (field === "count") phaseState.pretest.count = String(Math.round(reading.count))
        if (field === "cps") phaseState.pretest.cps = String(reading.cps)
        if (field === "gr") phaseState.pretest.gr = String(reading.gr)
      } catch (error) {
        ElMessage.error(error instanceof Error ? error.message : "读数失败")
      }
    })()
  }

  const toggleChartSeries = (phase: SamplingPhase, idx: 0 | 1) => {
    const phaseState = getPhaseState(draft.value, phase)
    phaseState.chartSeriesVisible[idx] = !phaseState.chartSeriesVisible[idx]
  }

  const copyDataToExcel = (phase: SamplingPhase) => {
    const hi = draft.value.hiPhase.tableData
    const lo = draft.value.loPhase.tableData
    const maxLen = Math.max(hi.length, lo.length)
    const header = ["", "CountA_H", "CountB_H", "CPSA_H", "CPSB_H", "CountA_L", "CountB_L", "CPSA_L", "CPSB_L"]
    const rows = [header.join("\t")]
    for (let i = 0; i < maxLen; i++) {
      const h = hi[i]
      const l = lo[i]
      rows.push(
        [
          i + 1,
          h?.countA ?? "",
          h?.countB ?? "",
          h?.cpsA ?? "",
          h?.cpsB ?? "",
          l?.countA ?? "",
          l?.countB ?? "",
          l?.cpsA ?? "",
          l?.cpsB ?? ""
        ].join("\t")
      )
    }
    navigator.clipboard
      .writeText(rows.join("\n"))
      .then(() => {
        ElMessage.success("数据已复制，可直接粘贴到 Excel")
        const ps = getPhaseState(draft.value, phase)
        addSdLog(ps, `已复制 ${maxLen} 行 H+L 合并数据到剪贴板`)
      })
      .catch(() => ElMessage.warning("复制失败，请检查剪贴板权限"))
  }

  const manualCalculate = (phase: SamplingPhase) => {
    const ps = getPhaseState(draft.value, phase)
    if (!draft.value.hiSamplingDone || !draft.value.loSamplingDone) {
      addSdLog(ps, "⚠ 高刻或低刻采样未完成，无法手动计算")
      ElMessage.warning("高刻与低刻均需采样完成后才能手动计算")
      return
    }
    const kc = draft.value.hiSampleKc ?? draft.value.loSampleKc
    addSdLog(ps, `Manual Calc: Kc=${kc}, Kb=${kc?.toFixed(3)}`)
    ElMessage.success(`手动计算完成：Kc=${kc}`)
  }

  const toggleSdDebug = (phase: SamplingPhase, on: boolean) => {
    draft.value.hiPhase.sdDebug = on
    draft.value.loPhase.sdDebug = on
    const ps = getPhaseState(draft.value, phase)
    addSdLog(ps, on ? "Debug mode ON" : "Debug mode OFF")
  }

  const initPhaseLabels = (phase: SamplingPhase) => {
    resetPhaseButtonLabels(phase)
  }

  const showPositionHint = (
    phase: SamplingPhase,
    hiWell: string,
    loWell: string,
    dualSensor: boolean
  ) => {
    const hint = getPositionHintSteps(phase, hiWell, loWell, dualSensor)
    ElMessageBox.alert(
      `<ol style="margin:0;padding-left:18px;line-height:2">${hint.steps.map((s) => `<li>${s}</li>`).join("")}</ol>`,
      hint.title,
      { dangerouslyUseHTMLString: true, confirmButtonText: "知道了" }
    )
  }

  return {
    runCommPretest,
    runFormalSampling,
    readSingle,
    toggleChartSeries,
    copyDataToExcel,
    manualCalculate,
    toggleSdDebug,
    initPhaseLabels,
    getCfg,
    isDual
  }
}
