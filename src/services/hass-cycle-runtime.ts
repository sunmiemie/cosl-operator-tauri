import type { RunSettings } from '@/services/flojoy-api'

export const HALT_HASS_DURATION_LOOP_FUNCTION = 'HALT_HASS_DURATION_LOOP'

interface RuntimeFlowchartNode {
  id: string
  data: Record<string, unknown>
}

export interface HaltHassRuntimeSnapshot {
  requiredRuntimeSeconds: number
  elapsedRuntimeSeconds: number
  remainingRuntimeSeconds: number
  currentRunStartedAt?: string | null
}

function finiteNumber(value: unknown, fallback = 0): number {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : fallback
}

function nodeFunction(node: RuntimeFlowchartNode): string {
  return typeof node.data.func === 'string' ? node.data.func.toUpperCase() : ''
}

export function hasHassDurationLoop(
  nodes: RuntimeFlowchartNode[]
): boolean {
  return nodes.some(
    (node) => nodeFunction(node) === HALT_HASS_DURATION_LOOP_FUNCTION
  )
}

/**
 * 工单开始/恢复接口会把 currentRunStartedAt 重置为响应时刻，
 * 因此可用它把接口快照中的剩余秒数推进到真正提交循环流的时刻。
 */
export function resolveRemainingRuntimeSeconds(
  runtime: HaltHassRuntimeSnapshot,
  nowMs = Date.now()
): number {
  const required = Math.max(0, finiteNumber(runtime.requiredRuntimeSeconds))
  const elapsed = Math.max(0, finiteNumber(runtime.elapsedRuntimeSeconds))
  let remaining = finiteNumber(
    runtime.remainingRuntimeSeconds,
    Math.max(required - elapsed, 0)
  )

  if (runtime.currentRunStartedAt) {
    const startedAtMs = Date.parse(runtime.currentRunStartedAt)
    if (Number.isFinite(startedAtMs)) {
      remaining -= Math.max(0, Math.floor((nowMs - startedAtMs) / 1000))
    }
  }

  return Math.max(0, Math.ceil(remaining))
}

export function applyHassCycleDuration<T extends RuntimeFlowchartNode>(
  nodes: T[],
  remainingDurationSeconds: number
): T[] {
  const duration = finiteNumber(remainingDurationSeconds, -1)
  if (duration < 0) {
    throw new Error('HALT-HASS 循环流剩余时长无效')
  }

  return nodes.map((node) => {
    if (nodeFunction(node) !== HALT_HASS_DURATION_LOOP_FUNCTION) {
      return node
    }

    const rawCtrls = node.data.ctrls
    if (!rawCtrls || typeof rawCtrls !== 'object' || Array.isArray(rawCtrls)) {
      throw new Error('HALT_HASS_DURATION_LOOP 缺少 ctrls')
    }
    const ctrls = rawCtrls as Record<string, unknown>
    const rawDurationControl = ctrls.duration_seconds
    if (
      !rawDurationControl
      || typeof rawDurationControl !== 'object'
      || Array.isArray(rawDurationControl)
    ) {
      throw new Error('HALT_HASS_DURATION_LOOP 缺少 duration_seconds 参数')
    }

    return {
      ...node,
      data: {
        ...node.data,
        ctrls: {
          ...ctrls,
          duration_seconds: {
            ...(rawDurationControl as Record<string, unknown>),
            value: duration,
          },
        },
      },
    } as T
  })
}

export function buildHassCycleRunSettings(
  settings: RunSettings | undefined,
  remainingDurationSeconds: number
): Required<RunSettings> {
  const cleanupAllowanceSeconds = 60
  const requiredMaximumRuntime = Math.ceil(remainingDurationSeconds)
    + cleanupAllowanceSeconds

  return {
    ...settings,
    nodeDelay: settings?.nodeDelay ?? 0,
    maximumRuntime: Math.max(
      finiteNumber(settings?.maximumRuntime),
      requiredMaximumRuntime
    ),
    // 串口和 VISA 使用同一 DeviceManager，循环采集必须串行执行。
    maximumConcurrentWorkers: 1,
  }
}
