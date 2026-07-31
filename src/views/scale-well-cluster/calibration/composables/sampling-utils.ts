import type { PhaseSamplingState, PretestCommState, SampleStats } from "../../shared/types"

export function createEmptyPretestComm(): PretestCommState {
  return {
    standbyCur: "—",
    cgrTime: "—",
    firmware: "—",
    flashErase: "—",
    sn: "—",
    sync: "—",
    status: "—",
    count: "—",
    cps: "—",
    gr: "—",
    commOk: null,
    commMessage: "",
    commVisible: false,
    running: false,
    buttonLabel: "▶ 启动常温检查"
  }
}

export function createEmptyPhaseState(): PhaseSamplingState {
  return {
    pretest: createEmptyPretestComm(),
    pretestRows: [],
    pretestProgress: 0,
    pretestLiveCps: null,
    pretestMean: null,
    pretestFilename: "",
    pretestStart: "—",
    pretestEnd: "—",
    pretestResultVisible: false,
    pretestResultOk: false,
    pretestResultMessage: "",
    pretestDone: false,
    samplingUnlocked: false,
    samples: [],
    samplesA: [],
    tableData: [],
    chartCps: [],
    chartCount: [],
    chartSeriesVisible: [true, true],
    liveCps: null,
    liveCpsA: null,
    progress: 0,
    currentPoint: 0,
    done: false,
    samplingRunning: false,
    sampleButtonLabel: "▶ 启动高刻采样",
    logs: [],
    sdLogs: [],
    sdDebug: false,
    tStart: "",
    tEnd: "",
    mainTab: "curve",
    dataSubTab: "cps"
  }
}

export function emptyStats(): SampleStats {
  return { mean: null, std: null, max: null, min: null }
}

export function computeStats(samples: number[]): SampleStats {
  if (!samples.length) return emptyStats()
  const n = samples.length
  const mean = samples.reduce((a, b) => a + b, 0) / n
  const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / n
  return {
    mean: +mean.toFixed(2),
    std: +Math.sqrt(variance).toFixed(3),
    max: +Math.max(...samples).toFixed(2),
    min: +Math.min(...samples).toFixed(2)
  }
}

function formatHm(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatHms(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function nowHm(d = new Date()) {
  return formatHm(d)
}

export function nowHms(d = new Date()) {
  return formatHms(d)
}

export function logTs() {
  return new Date().toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  })
}

export type SamplingPhase = "hi" | "lo"

export function getPositionHintSteps(phase: SamplingPhase, hiWell: string, loWell: string, dualSensor: boolean) {
  const well = phase === "hi" ? hiWell : loWell
  const tag = phase === "hi" ? "高刻" : "低刻"
  if (dualSensor) {
    return {
      title: `${tag} 仪器入井位置提示`,
      steps: [
        `将仪器竖直下放至 ${well} 刻度井。`,
        "伽马探头位置在仪器两个铜环之间三分之一处（靠近钻头方向）。",
        "从探测点位置沿仪器向上量取 1.25 m，用记号笔或高温胶带做标记。",
        `将标记处与 ${well} 井口对齐，停止下放，等待仪器稳定后开始采样。`
      ]
    }
  }
  return {
    title: `${tag} 仪器入井位置提示`,
    steps: [
      `将仪器竖直吊入 ${well} 刻度井。`,
      `当仪器上端（接头处）与 ${well} 井口平齐时，停止下放。`,
      "稳定后开始采样。"
    ]
  }
}

export function getCalImagePath(phase: SamplingPhase, dualSensor: boolean) {
  const cfg = dualSensor
    ? phase === "hi"
      ? "仪器高刻下入刻度井位置参考图_WAGR.jpg"
      : "仪器低刻下入刻度井位置参考图_WAGR.jpg"
    : phase === "hi"
      ? "仪器高刻下入刻度井位置参考图.jpg"
      : "仪器低刻下入刻度井位置参考图.jpg"
  return `/scale-well/${cfg}`
}
