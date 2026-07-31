import { computed, onMounted, reactive, ref } from "vue"
import { ElMessage } from "element-plus"
import { useAuth } from "@/composables/useAuth"
import { listCalibrationReports } from "@/services/scale-well-api"
import { REPORT_STATUS_OPTIONS } from "../constants/options"
import type { CalibrationReport, ReportFilter, ReportReviewStatus } from "../types"
import { mapClientStatusToApi, mapDtoToReport } from "../utils/map-report"

export { REPORT_STATUS_OPTIONS }

export function useMyCalibrationReports() {
  const { initAuth, getAuthHeaders, userInfo } = useAuth()
  const loading = ref(false)
  const reports = ref<CalibrationReport[]>([])

  const filter = reactive<ReportFilter>({
    keyword: "",
    status: ""
  })

  const filteredReports = computed(() => reports.value)

  const draftCount = computed(() => reports.value.filter((item) => item.status === "draft").length)
  const pendingCount = computed(() => reports.value.filter((item) => item.status === "pending").length)

  const fetchReports = async () => {
    await initAuth()
    const userId = userInfo.value?.id
    if (!userId) {
      reports.value = []
      return
    }

    loading.value = true
    try {
      const response = await listCalibrationReports(
        {
          page: 1,
          pageSize: 100,
          keyword: filter.keyword.trim() || undefined,
          status: mapClientStatusToApi(filter.status),
          testerId: userId
        },
        getAuthHeaders()
      )
      const payload = response.data
      if (!response.success || payload?.code !== 0) {
        ElMessage.error(payload?.msg || response.error || "加载报告列表失败")
        return
      }
      reports.value = payload.data.list.map(mapDtoToReport)
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    fetchReports()
  })

  const resetFilter = () => {
    filter.keyword = ""
    filter.status = ""
    fetchReports()
  }

  const getStatusLabel = (status: ReportReviewStatus) => {
    const map = {
      draft: "草稿",
      pending: "待审核",
      approved: "已通过",
      rejected: "已驳回"
    } as const
    return map[status]
  }

  const getStatusType = (status: ReportReviewStatus) => {
    const map = {
      draft: "info",
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
    draftCount,
    pendingCount,
    fetchReports,
    resetFilter,
    getStatusLabel,
    getStatusType
  }
}
