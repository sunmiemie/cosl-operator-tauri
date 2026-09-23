export type HighTempPressureExportContext = {
  orderNumbers: string[]
  completedAtMs: number
}

export function buildHighTempPressureExportFolderName(context: HighTempPressureExportContext) {
  if (!Number.isFinite(context.completedAtMs)) {
    throw new Error('测试结束时间无效，无法创建本地测试目录')
  }
  const completedAt = new Date(context.completedAtMs)
  const pad = (value: number) => String(value).padStart(2, '0')
  const timestamp = [
    completedAt.getFullYear(),
    pad(completedAt.getMonth() + 1),
    pad(completedAt.getDate()),
  ].join('') + `-${pad(completedAt.getHours())}${pad(completedAt.getMinutes())}${pad(completedAt.getSeconds())}`
  const orderNumbers = Array.from(new Set(
    context.orderNumbers.map((value) => String(value || '').trim()).filter(Boolean)
  ))
  const firstOrderNumber = orderNumbers[0] || '未标明工单'
  const orderPart = orderNumbers.length > 1
    ? `${firstOrderNumber}_等${orderNumbers.length}个工单`
    : firstOrderNumber
  return `${timestamp}_${orderPart}_高温高压井测试数据`
}
