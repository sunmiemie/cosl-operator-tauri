export type HighTempPressureExportContext = {
  orderNumbers: string[]
  completedAtMs: number
}

export function buildHighTempPressureExportFolderName(context: HighTempPressureExportContext) {
  if (!Number.isFinite(context.completedAtMs)) {
    throw new Error('测试结束时间无效，无法创建本地测试目录')
  }
  const completedAt = new Date(context.completedAtMs)
  if (!Number.isFinite(completedAt.getTime())) {
    throw new Error('测试结束时间无效，无法创建本地测试目录')
  }
  const pad = (value: number) => String(value).padStart(2, '0')
  const timestamp = [
    completedAt.getFullYear(),
    pad(completedAt.getMonth() + 1),
    pad(completedAt.getDate()),
  ].join('') + `-${pad(completedAt.getHours())}${pad(completedAt.getMinutes())}${pad(completedAt.getSeconds())}`
  const orderNumbers = Array.from(new Set(
    context.orderNumbers.map((value) => String(value || '').trim()).filter(Boolean)
  ))
  // 工单号只用于目录标签，替换 Windows 路径字符并限制长度，原始编号仍保留在报告中。
  const safeOrderNumber = (orderNumbers[0] || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/^[.\s-]+|[.\s-]+$/g, '')
  const firstOrderNumber = Array.from(safeOrderNumber).slice(0, 80).join('') || '未标明工单'
  const orderPart = orderNumbers.length > 1
    ? `${firstOrderNumber}_等${orderNumbers.length}个工单`
    : firstOrderNumber
  return `${timestamp}_${orderPart}_高温高压井测试数据`
}
