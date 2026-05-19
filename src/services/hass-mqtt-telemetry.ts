export interface HassMqttEnvelope {
  topic: string
  payload: unknown
  receivedAt: number
}

export type HassMqttTelemetryUpdate =
  | { kind: 'system-status'; status: string }
  | { kind: 'test-status'; status: string; name: string }
  | {
      kind: 'test-list'
      tests: Array<{ name: string; type: string; createdTime: string }>
    }
  | {
      kind: 'temperature'
      time: number
      remainingTime: number | null
      actual: number | null
      target: number | null
    }
  | {
      kind: 'vibration'
      time: number
      remainingTime: number | null
      actual: number | null
      target: number | null
    }
  | { kind: 'unknown' }

function finiteNumber(value: unknown): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

/**
 * 解析 HALT-HASS 工作台 EDM MQTT 报文。
 * STK 文件不进入此链路；目标值和实测值都以工作台实时上报为准。
 */
export function parseHassMqttTelemetry(
  message: HassMqttEnvelope
): HassMqttTelemetryUpdate {
  if (message.topic.endsWith('/App/Test/List')) {
    if (!Array.isArray(message.payload)) return { kind: 'test-list', tests: [] }
    return {
      kind: 'test-list',
      tests: message.payload
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
        .map(item => ({
          name: String(item.Name ?? '').trim(),
          type: String(item.Type ?? '').trim(),
          createdTime: String(item.CreatedTime ?? '').trim(),
        }))
        .filter(item => item.name.length > 0),
    }
  }

  if (
    !message.payload
    || typeof message.payload !== 'object'
    || Array.isArray(message.payload)
  ) {
    return { kind: 'unknown' }
  }

  const payload = message.payload as Record<string, unknown>
  if (message.topic.endsWith('/App/System/Status')) {
    return {
      kind: 'system-status',
      status: String(payload.Status ?? ''),
    }
  }
  if (message.topic.endsWith('/App/Test/Status')) {
    return {
      kind: 'test-status',
      status: String(payload.Status ?? ''),
      name: String(payload.Name ?? ''),
    }
  }

  const time = finiteNumber(payload.TotalTime) ?? message.receivedAt / 1000
  const remainingTime = finiteNumber(payload.RemainTime)
  if (message.topic.endsWith('/THV/Test/THStatus')) {
    return {
      kind: 'temperature',
      time,
      remainingTime,
      actual: finiteNumber(payload.ControlTemperature),
      target: finiteNumber(payload.TargetTemperature),
    }
  }
  if (message.topic.endsWith('/THV/Test/VibStatus')) {
    return {
      kind: 'vibration',
      time,
      remainingTime,
      actual: finiteNumber(payload.ControlVibration),
      target: finiteNumber(payload.TargetVibration),
    }
  }

  return { kind: 'unknown' }
}
