const SECONDS_PER_HOUR = 3600
const MS_PER_SECOND = 1000

export function normalizeRuntimeSeconds(totalSeconds: number) {
  const numeric = Number(totalSeconds)
  if (!Number.isFinite(numeric) || numeric <= 0) return 0
  return Math.floor(numeric)
}

export function getElapsedRuntimeSeconds(startAtMs: number | null, nowMs = Date.now()) {
  if (startAtMs === null || !Number.isFinite(startAtMs)) return 0
  return normalizeRuntimeSeconds((nowMs - startAtMs) / MS_PER_SECOND)
}

export function formatRuntimeTimer(totalSeconds: number) {
  const seconds = normalizeRuntimeSeconds(totalSeconds)
  const h = Math.floor(seconds / SECONDS_PER_HOUR)
  const m = Math.floor((seconds % SECONDS_PER_HOUR) / 60)
  const s = seconds % 60
  return `${h}时${m}分${s}秒`
}

export function formatRuntimeHours(totalSeconds: number) {
  const seconds = normalizeRuntimeSeconds(totalSeconds)
  if (!seconds) return '0.00'
  const hours = seconds / SECONDS_PER_HOUR
  return hours > 0 && hours < 0.01 ? '0.01' : hours.toFixed(2)
}
