import type { EquipmentReportAttachment, EquipmentReportItem } from '@/services/equipment-report-api'

export type HighTempPressureCurveAttachment = {
  fileUrl: string
  index: number
  title: string
  rangeStart: string
  rangeEnd: string
  contentType: string
  uploadedName: string
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function text(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

function positiveIndex(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function isTestingCurveAttachment(attachment: EquipmentReportAttachment) {
  const field = text(attachment.field || attachment.type).toLowerCase()
  return field === 'testing_curve' || field.startsWith('testing_curve__')
}

function normalizeCurve(
  source: Record<string, unknown>,
  fallbackIndex: number
): HighTempPressureCurveAttachment | null {
  const fileUrl = text(source.file_url || source.fileUrl)
  if (!fileUrl) return null
  const range = asRecord(source.curve_range || source.range)
  const index = positiveIndex(source.curve_index || source.index, fallbackIndex)
  return {
    fileUrl,
    index,
    title: text(source.curve_title || source.title) || `曲线${index}`,
    rangeStart: text(source.range_start || source.start_at || range.start_at || range.range_start),
    rangeEnd: text(source.range_end || source.end_at || range.end_at || range.range_end),
    contentType: text(source.content_type || source.contentType) || 'image/png',
    uploadedName: text(source.name || source.uploaded_name || source.file_name),
  }
}

export function extractHighTempPressureCurveAttachments(
  report: Pick<EquipmentReportItem, 'attachments' | 'report_json'> | null | undefined
) {
  const curves: HighTempPressureCurveAttachment[] = []
  const seenUrls = new Set<string>()
  const append = (value: unknown) => {
    const curve = normalizeCurve(asRecord(value), curves.length + 1)
    if (!curve || seenUrls.has(curve.fileUrl)) return
    seenUrls.add(curve.fileUrl)
    curves.push(curve)
  }

  const attachments = Array.isArray(report?.attachments) ? report.attachments : []
  attachments.filter(isTestingCurveAttachment).forEach(append)

  const reportJson = asRecord(report?.report_json)
  const paperReport = asRecord(reportJson.paper_report)
  const paperAttachments = asRecord(paperReport.attachments)
  const testingCurve = asRecord(paperAttachments.testing_curve)
  const curveItems = Array.isArray(testingCurve.items) ? testingCurve.items : []
  curveItems.forEach(append)
  append(testingCurve)
  append({
    file_url: reportJson.curve_chart_url,
    curve_title: '测试曲线',
    curve_index: 1,
  })

  return curves.sort((left, right) => left.index - right.index)
}

export function resolveBackendAttachmentEndpoint(fileUrl: string, backendBaseUrl: string) {
  const raw = String(fileUrl || '').trim().replace(/\\/g, '/')
  if (!raw) return ''
  if (!/^https?:\/\//i.test(raw)) return raw.startsWith('/') ? raw : `/${raw}`

  try {
    const attachmentUrl = new URL(raw)
    const backendUrl = new URL(backendBaseUrl)
    if (attachmentUrl.origin !== backendUrl.origin) return ''
    return `${attachmentUrl.pathname}${attachmentUrl.search}`
  } catch {
    return ''
  }
}
