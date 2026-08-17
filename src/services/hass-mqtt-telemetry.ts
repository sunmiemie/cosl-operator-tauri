export interface HassMqttEnvelope {
  topic: string
  payload: Record<string, unknown> | string | number | boolean | null
  receivedAt: number
}

export type HassMqttTelemetryUpdate =
  | { kind: 'system-status'; status: string }
  | { kind: 'test-status'; status: string }
  | {
      kind: 'temperature'
      time: number
      actual: number | null
      target: number | null
    }
  | {
      kind: 'vibration'
      time: number
      actual: number | null
      target: number | null
    }
  | { kind: 'unknown' }

function finiteNumber(value: unknown): number | null {
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
  if (
    !message.payload
    || typeof message.payload !== 'object'
    || Array.isArray(message.payload)
  ) {
    return { kind: 'unknown' }
  }

  const payload = message.payload
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
    }
  }

  const time = finiteNumber(payload.TotalTime) ?? message.receivedAt / 1000
  if (message.topic.endsWith('/THV/Test/THStatus')) {
    return {
      kind: 'temperature',
      time,
      actual: finiteNumber(payload.ControlTemperature),
      target: finiteNumber(payload.TargetTemperature),
    }
  }
  if (message.topic.endsWith('/THV/Test/VibStatus')) {
    return {
      kind: 'vibration',
      time,
      actual: finiteNumber(payload.ControlVibration),
      target: finiteNumber(payload.TargetVibration),
    }
  }

  return { kind: 'unknown' }
}
