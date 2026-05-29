import type { VibrationInstrument, WorkOrder } from '../types'

export type InstrumentRuntimeState = Record<string, true>

export function getInstrumentRuntimeKeys(orderId: string, instrument: VibrationInstrument) {
  return Array.from(new Set([
    instrument.id,
    `${orderId}::${instrument.id}`,
    instrument.dbId !== undefined && instrument.dbId !== null ? `${orderId}::db:${instrument.dbId}` : '',
    instrument.sn ? `${orderId}::sn:${instrument.sn}` : '',
    instrument.name ? `${orderId}::name:${instrument.name}` : '',
  ].filter(Boolean)))
}

export function isInstrumentCompletedByServer(instrument: VibrationInstrument) {
  return (
    instrument.completed === true ||
    instrument.status === 2 ||
    instrument.status === 5
  )
}

export function reconcileInstrumentRuntimeState(
  orders: WorkOrder[],
  runningInstrumentIds: InstrumentRuntimeState
) {
  const nextRunning: InstrumentRuntimeState = {}
  const nextCompleted: InstrumentRuntimeState = {}

  orders.forEach((order) => {
    order.instruments.forEach((instrument) => {
      const keys = getInstrumentRuntimeKeys(order.id, instrument)
      const isCompleted = isInstrumentCompletedByServer(instrument)

      if (isCompleted) {
        keys.forEach((key) => {
          nextCompleted[key] = true
        })
        return
      }

      const hasExplicitInstrumentStatus = instrument.status !== undefined && instrument.status !== null
      const hasLocalRunningState = keys.some((key) => runningInstrumentIds[key])
      const shouldKeepRunning =
        instrument.status === 1 ||
        (!hasExplicitInstrumentStatus && order.status === 2 && hasLocalRunningState)

      if (shouldKeepRunning) {
        keys.forEach((key) => {
          nextRunning[key] = true
        })
      }
    })
  })

  return {
    runningInstrumentIds: nextRunning,
    completedInstrumentIds: nextCompleted,
  }
}
