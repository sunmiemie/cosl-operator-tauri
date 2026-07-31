import type { CalibrationReportDTO } from "@/services/scale-well-api"
import type { CalibrationReport, ReportReviewStatus } from "../types"

const STATUS_MAP: Record<number, ReportReviewStatus> = {
  0: "draft",
  1: "pending",
  2: "approved",
  3: "rejected"
}

export function mapApiStatusToClient(status: number): ReportReviewStatus {
  return STATUS_MAP[status] ?? "draft"
}

export function mapClientStatusToApi(status: ReportReviewStatus | ""): number | undefined {
  if (status === "draft") return 0
  if (status === "pending") return 1
  if (status === "approved") return 2
  if (status === "rejected") return 3
  return undefined
}

export function mapDtoToReport(dto: CalibrationReportDTO): CalibrationReport {
  const json = dto.report_json || {}
  const appendixA = (json.appendixA || {}) as CalibrationReport["appendixA"]
  const appendixB = (json.appendixB || {}) as CalibrationReport["appendixB"]
  const appendixC = (json.appendixC || {}) as CalibrationReport["appendixC"]

  return {
    id: dto.report_no || String(dto.id),
    dbId: dto.id,
    orderDbId: dto.order_id,
    workOrderId: dto.task_number,
    toolType: appendixB?.toolTypeName || "",
    serialNumber: dto.serial_number || appendixA?.serialNumber || "",
    engineer: dto.tester_name || appendixA?.engineer || "",
    testDate: dto.test_date || appendixA?.testDate || "",
    location: appendixA?.location || "",
    kc: dto.kc != null && dto.kc !== "" ? Number(dto.kc) : appendixB?.kc ?? null,
    hiWell: appendixB?.hiWell || appendixC?.hiWell || "",
    loWell: appendixB?.loWell || appendixC?.loWell || "",
    hiApi: appendixB?.hiApi ?? appendixC?.hiApi ?? 0,
    loApi: appendixB?.loApi ?? appendixC?.loApi ?? 0,
    softVer: appendixA?.softVer || "",
    status: mapApiStatusToClient(dto.status),
    statusCode: dto.status,
    statusText: dto.status_text,
    submittedAt: dto.submit_time || dto.created_at || "",
    reviewRemark: dto.review_remark || "",
    appendixA,
    appendixB,
    appendixC
  }
}

export function mapDtoToDraft(dto: CalibrationReportDTO, toolType = "") {
  const report = mapDtoToReport(dto)
  return {
    workOrderId: report.workOrderId,
    toolType,
    appendixA: report.appendixA,
    appendixB: report.appendixB,
    appendixC: report.appendixC
  }
}

export function mapReportToDraft(report: CalibrationReport) {
  return {
    workOrderId: report.workOrderId,
    toolType: report.toolType,
    appendixA: report.appendixA,
    appendixB: report.appendixB,
    appendixC: report.appendixC
  }
}
