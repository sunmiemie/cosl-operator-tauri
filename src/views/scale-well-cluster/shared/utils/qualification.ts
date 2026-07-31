import type { CalibrationWorkOrder, QualificationThresholds } from "../types"
import { TOOL_PARAMS } from "../constants/tool-params"

export function readDtoNumber(dto: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const val = dto[key]
    if (val != null && val !== "") {
      const n = Number(val)
      if (Number.isFinite(n)) return n
    }
  }
  return null
}

/** 从工单 DTO 映射井级系数合格区间（高刻井 → Ka/Ba，低刻井 → Kb/Bb） */
export function mapQualificationFromDto(dto: Record<string, unknown>): QualificationThresholds | undefined {
  const kbMin = readDtoNumber(dto, "lo_well_kb_min", "loWellKbMin")
  const kbMax = readDtoNumber(dto, "lo_well_kb_max", "loWellKbMax")
  const bbLimit = readDtoNumber(dto, "lo_well_bb_limit", "loWellBbLimit")
  const kaMin = readDtoNumber(dto, "hi_well_ka_min", "hiWellKaMin")
  const kaMax = readDtoNumber(dto, "hi_well_ka_max", "hiWellKaMax")
  const baLimit = readDtoNumber(dto, "hi_well_ba_limit", "hiWellBaLimit")
  const hiRefMin = readDtoNumber(dto, "hi_well_ref_min", "hiWellRefMin")
  const hiRefMax = readDtoNumber(dto, "hi_well_ref_max", "hiWellRefMax")
  const loRefMin = readDtoNumber(dto, "lo_well_ref_min", "loWellRefMin")
  const loRefMax = readDtoNumber(dto, "lo_well_ref_max", "loWellRefMax")
  if ([kbMin, kbMax, bbLimit, kaMin, kaMax, baLimit, hiRefMin, hiRefMax, loRefMin, loRefMax].some((v) => v == null)) {
    return undefined
  }
  const dualRaw = dto.dual_sensor ?? dto.dualSensor
  const dualSensor = dualRaw === true || dualRaw === 1 || dualRaw === "1" || dualRaw === "true"

  if (!dualSensor) {
    return {
      kaMin: 0,
      kaMax: 0,
      baLimit: baLimit!,
      kbMin: kaMin!,
      kbMax: kaMax!,
      bbLimit: baLimit!,
      hiRefMin: hiRefMin!,
      hiRefMax: hiRefMax!,
      loRefMin: loRefMin!,
      loRefMax: loRefMax!,
      dualSensor: false
    }
  }

  return {
    kaMin: kaMin!,
    kaMax: kaMax!,
    baLimit: baLimit!,
    kbMin: kbMin!,
    kbMax: kbMax!,
    bbLimit: bbLimit!,
    hiRefMin: hiRefMin!,
    hiRefMax: hiRefMax!,
    loRefMin: loRefMin!,
    loRefMax: loRefMax!,
    dualSensor: true
  }
}

export function getOrderQualification(order: CalibrationWorkOrder): QualificationThresholds {
  if (order.qualification) return order.qualification
  const cfg = TOOL_PARAMS[order.toolType as keyof typeof TOOL_PARAMS]
  const dualSensor = !!(cfg && "dualSensor" in cfg && cfg.dualSensor)
  const hiRef = cfg?.hiRef ?? [20, 60]
  const loRef = cfg?.loRef ?? [1, 3]
  return {
    kaMin: dualSensor ? (cfg?.kcMin ?? 3.5) : 0,
    kaMax: dualSensor ? (cfg?.kcMax ?? 5.5) : 0,
    baLimit: 4,
    kbMin: cfg?.kcMin ?? 3.5,
    kbMax: cfg?.kcMax ?? 5.5,
    bbLimit: 4,
    hiRefMin: hiRef[0],
    hiRefMax: hiRef[1],
    loRefMin: loRef[0],
    loRefMax: loRef[1],
    dualSensor
  }
}
