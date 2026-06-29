import { computed, reactive, ref } from "vue"
import { ElMessage } from "element-plus"
import { MOCK_CALIBRATION_REPORTS } from "../constants/mock-data"
import type { CalibrationReport, ReportFilter, ReportReviewStatus } from "../types"

export function useCalibrationReport() {
  const loading = ref(false)
  const reports = ref<CalibrationReport[]>([...MOCK_CALIBRATION_REPORTS])

  const filter = reactive<ReportFilter>({
    keyword: "",
    status: ""
  })

  const filteredReports = computed(() => {
    const keyword = filter.keyword.trim().toLowerCase()
    return reports.value.filter((report) => {
      if (filter.status && report.status !== filter.status) return false
      if (!keyword) return true
      return [report.id, report.workOrderId, report.serialNumber, report.engineer]
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    })
  })

  const pendingCount = computed(() => reports.value.filter((item) => item.status === "pending").length)

  const resetFilter = () => {
    filter.keyword = ""
    filter.status = ""
  }

  const approveReport = (id: string) => {
    const report = reports.value.find((item) => item.id === id)
    if (!report) return
    report.status = "approved"
    ElMessage.success(`报告 ${id} 已审核通过`)
  }

  const rejectReport = (id: string) => {
    const report = reports.value.find((item) => item.id === id)
    if (!report) return
    report.status = "rejected"
    ElMessage.warning(`报告 ${id} 已驳回`)
  }

  const getStatusLabel = (status: ReportReviewStatus) => {
    const map = {
      pending: "待审核",
      approved: "合格",
      rejected: "不合格"
    } as const
    return map[status]
  }

  const getStatusType = (status: ReportReviewStatus) => {
    const map = {
      pending: "warning",
      approved: "success",
      rejected: "danger"
    } as const
    return map[status]
  }

  return {
    loading,
    reports,
    filter,
    filteredReports,
    pendingCount,
    resetFilter,
    approveReport,
    rejectReport,
    getStatusLabel,
    getStatusType
  }
}
