import type { CalibrationDraft, CalibrationWorkOrder, QualificationThresholds } from "../../shared/types"
import { getOrderQualification } from "../../shared/utils/qualification"
import type { CalibrationHistoryDTO } from "@/services/scale-well-api"

export interface CalCoefficients {
  ka: number
  kb: number
  kc: number
  ba: number
  bb: number
  bc: number
}

export interface CalibrationResults extends CalCoefficients {
  kaOk: boolean
  kbOk: boolean
  kcOk: boolean
  baOk: boolean
  bbOk: boolean
  bcOk: boolean
  bOk: boolean
  allOk: boolean
  hiMean: number
  loMean: number
}

export interface CalKpiItem {
  key: string
  value: number
  range: string
  ok: boolean
}

export interface CalCompareRow {
  param: string
  last: number | null
  current: number
  delta: number | null
  deltaStr: string
  ok: boolean
}

function sensorCalib(hiSamples: number[], loSamples: number[], hiApi: number, loApi: number) {
  const hiMean = hiSamples.reduce((a, v) => a + v, 0) / hiSamples.length
  const loMean = loSamples.reduce((a, v) => a + v, 0) / loSamples.length
  const k = (hiApi - loApi) / (hiMean - loMean)
  const b = loApi - k * loMean
  return { k, b, hiMean, loMean }
}

export function mapHistoryToCalCoefficients(dto: CalibrationHistoryDTO | null): CalCoefficients | null {
  if (!dto) return null
  const num = (v: string | number | null | undefined) =>
    v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null
  const ka = num(dto.ka)
  const kb = num(dto.kb)
  const kc = num(dto.kc)
  const ba = num(dto.ba)
  const bb = num(dto.bb)
  const bc = num(dto.bc)
  if ([ka, kb, kc, ba, bb, bc].some((v) => v == null)) return null
  return { ka: ka!, kb: kb!, kc: kc!, ba: ba!, bb: bb!, bc: bc! }
}

function checkKa(ka: number, qual: QualificationThresholds, dualSensor: boolean) {
  if (!dualSensor) return ka === 0
  return ka >= qual.kaMin && ka <= qual.kaMax
}

export function calcCalibrationResults(
  draft: CalibrationDraft,
  order: CalibrationWorkOrder,
  dualSensor: boolean,
  thresholds?: QualificationThresholds
): CalibrationResults | null {
  const qual = thresholds ?? getOrderQualification(order)

  const hiSamples = draft.hiPhase.samples
  const loSamples = draft.loPhase.samples
  if (!hiSamples.length || !loSamples.length) return null

  let ka: number
  let ba: number
  let kb: number
  let bb: number
  let kc: number
  let bc: number
  let hiMean: number
  let loMean: number

  if (dualSensor && draft.hiPhase.samplesA.length && draft.loPhase.samplesA.length) {
    const resB = sensorCalib(hiSamples, loSamples, order.hiApi, order.loApi)
    const resA = sensorCalib(
      draft.hiPhase.samplesA,
      draft.loPhase.samplesA,
      order.hiApi,
      order.loApi
    )
    ka = +resA.k.toFixed(3)
    ba = +resA.b.toFixed(3)
    kb = +resB.k.toFixed(3)
    bb = +resB.b.toFixed(3)
    kc = +((resA.k + resB.k) / 2).toFixed(3)
    bc = +((resA.b + resB.b) / 2).toFixed(3)
    hiMean = +resB.hiMean.toFixed(3)
    loMean = +resB.loMean.toFixed(3)
  } else {
    ka = 0
    ba = 0
    const res = sensorCalib(hiSamples, loSamples, order.hiApi, order.loApi)
    kb = kc = +res.k.toFixed(3)
    bb = bc = +res.b.toFixed(3)
    hiMean = +res.hiMean.toFixed(3)
    loMean = +res.loMean.toFixed(3)
  }

  const kaOk = checkKa(ka, qual, dualSensor)
  const kbOk = kb >= qual.kbMin && kb <= qual.kbMax
  const baOk = Math.abs(ba) <= qual.baLimit
  const bbOk = Math.abs(bb) <= qual.bbLimit
  const kcOk = kaOk && kbOk
  const bcOk = baOk && bbOk
  const bOk = baOk && bbOk

  return {
    ka,
    kb,
    kc,
    ba,
    bb,
    bc,
    kaOk,
    kbOk,
    kcOk,
    baOk,
    bbOk,
    bcOk,
    bOk,
    allOk: kaOk && kbOk && baOk && bbOk,
    hiMean,
    loMean
  }
}

export function buildKpiItems(results: CalibrationResults, dualSensor: boolean, qual: QualificationThresholds): CalKpiItem[] {
  return [
    {
      key: "Ka",
      value: results.ka,
      range: dualSensor ? `[${qual.kaMin}, ${qual.kaMax}]` : "= 0",
      ok: results.kaOk
    },
    {
      key: "Kb",
      value: results.kb,
      range: `[${qual.kbMin}, ${qual.kbMax}]`,
      ok: results.kbOk
    },
    {
      key: "Kc",
      value: results.kc,
      range: "计算值 (Ka+Kb)/2",
      ok: results.kcOk
    },
    {
      key: "Ba",
      value: results.ba,
      range: `±${qual.baLimit}`,
      ok: results.baOk
    },
    {
      key: "Bb",
      value: results.bb,
      range: `±${qual.bbLimit}`,
      ok: results.bbOk
    },
    {
      key: "Bc",
      value: results.bc,
      range: "计算值 (Ba+Bb)/2",
      ok: results.bcOk
    }
  ]
}

export function buildCompareRows(
  results: CalibrationResults,
  lastCal: CalCoefficients | null,
  dualSensor: boolean,
  qual: QualificationThresholds
): CalCompareRow[] {
  const keys = ["Ka", "Kb", "Kc", "Ba", "Bb", "Bc"] as const
  const kpi = buildKpiItems(results, dualSensor, qual)

  return keys.map((key) => {
    const param = key.toLowerCase() as keyof CalCoefficients
    const last = lastCal ? lastCal[param] : null
    const current = results[param]
    const delta = last != null ? +(current - last).toFixed(3) : null
    const deltaStr = delta == null ? "—" : delta > 0 ? `+${delta}` : String(delta)
    const ok = kpi.find((k) => k.key === key)?.ok ?? true
    return { param: key, last, current, delta, deltaStr, ok }
  })
}

export function buildSummaryText(results: CalibrationResults, dualSensor: boolean, qual: QualificationThresholds): string {
  if (results.allOk) {
    const dualNote = dualSensor
      ? `（传感器 B: Kb=${results.kb}/Bb=${results.bb}，最终平均: Kc=${results.kc}/Bc=${results.bc}）`
      : ""
    return `刻度结果合格！Ka/Kb、Ba/Bb 均在井配置区间内，Kc=${results.kc}、Bc=${results.bc} 为自动计算值。可以写入仪器。${dualNote}`
  }
  return "刻度结果超出范围！请检查仪器及测试条件后重新刻度。"
}
