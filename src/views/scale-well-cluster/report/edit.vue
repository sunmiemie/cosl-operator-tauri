<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import { ElMessage, ElMessageBox } from "element-plus"
import { useAuth } from "@/composables/useAuth"
import {
  createCalibrationReport,
  getCalibrationOrderDetail,
  getCalibrationReportByOrder,
  getCalibrationReportDetail,
  submitCalibrationReport,
  updateCalibrationReport,
  type CalibrationReportDTO,
  type CalibrationWorkOrderDTO
} from "@/services/scale-well-api"
import ReportFillHeader from "./components/ReportFillHeader.vue"
import ReportAppendixAForm from "./components/ReportAppendixAForm.vue"
import ReportAppendixBForm from "./components/ReportAppendixBForm.vue"
import ReportAppendixCForm from "./components/ReportAppendixCForm.vue"
import ReportAppendixA from "./components/ReportAppendixA.vue"
import ReportAppendixB from "./components/ReportAppendixB.vue"
import ReportAppendixC from "./components/ReportAppendixC.vue"
import { useScaleWellSession } from "../shared/composables/useScaleWellSession"
import type { CalibrationWorkOrder } from "../shared/types"
import type { CalibrationReport, ReportAppendixTab } from "./types"
import { isReportEditable } from "./types"
import { mapDtoToDraft, mapDtoToReport } from "./utils/map-report"

const route = useRoute()
const router = useRouter()
const { getAuthHeaders } = useAuth()
const {
  reportDraft,
  initReportDraftIfEmpty,
  activeWorkOrder,
  savedReportId,
  setSavedReportId,
  calibrationSummary,
  setCalibrationSummary,
  setActiveWorkOrder
} = useScaleWellSession()

const isFillRoute = computed(() => route.name === "ScaleWellReportFill")
const reportDbId = computed(() => {
  if (isFillRoute.value) return null
  const raw = route.params.id
  const id = Number(raw)
  return Number.isFinite(id) ? id : null
})

const activeTab = ref<ReportAppendixTab>("appA")
const saving = ref(false)
const submitting = ref(false)
const loading = ref(false)
const reportStatus = ref<number>(0)
const orderDbId = ref<number | null>(null)
const viewReport = ref<CalibrationReport | null>(null)

const readOnly = computed(() => !isReportEditable(reportStatus.value))
const pageTitle = computed(() => {
  if (readOnly.value) return "查看刻度报告"
  if (isFillRoute.value) return "填写刻度报告"
  return "编辑刻度报告"
})

function inferToolType(modelName: string) {
  const text = modelName.toUpperCase()
  if (text.includes("WAGR") || text.includes("伽马")) return "WAGR"
  if (text.includes("IDMP")) return "IDMP475"
  if (text.includes("800")) return "800"
  if (text.includes("675")) return "675"
  if (text.includes("475")) return "475"
  return modelName
}

function mapOrderDtoToWorkOrder(dto: CalibrationWorkOrderDTO): CalibrationWorkOrder {
  const modelName = dto.instrument_model_name || ""
  return {
    id: dto.task_number,
    dbId: dto.id,
    toolType: inferToolType(modelName),
    modelName,
    serialNumber: dto.serial_number,
    engineer: dto.tester_name,
    location: dto.location,
    calibrationDevice: dto.calibration_device,
    hiWell: dto.hi_well_no,
    loWell: dto.lo_well_no,
    hiApi: Number(dto.hi_well_api || 0) || 0,
    loApi: Number(dto.lo_well_api || 0) || 0,
    remark: dto.remark || "",
    planDate: dto.plan_date || "",
    status: dto.status === 2 ? "in_progress" : dto.status >= 5 ? "completed" : "pending",
    statusCode: dto.status,
    statusText: dto.status_text,
    kc: dto.kc != null && dto.kc !== "" ? Number(dto.kc) : null
  }
}

async function loadOrderContext(orderId: number) {
  const response = await getCalibrationOrderDetail(orderId, getAuthHeaders())
  const payload = response.data
  if (response.success && payload?.code === 0 && payload.data) {
    setActiveWorkOrder(mapOrderDtoToWorkOrder(payload.data))
  }
}

function applyReportDto(dto: CalibrationReportDTO) {
  const toolType = activeWorkOrder.value?.toolType || inferToolType(dto.report_json?.appendixB?.toolTypeName as string || "")
  reportDraft.value = mapDtoToDraft(dto, toolType)
  viewReport.value = mapDtoToReport(dto)
  setSavedReportId(dto.id)
  orderDbId.value = dto.order_id
  reportStatus.value = dto.status
  const summary = dto.report_json?.calibrationSummary
  if (typeof summary === "string") setCalibrationSummary(summary)
}

function buildReportJson() {
  const draft = reportDraft.value
  if (!draft) return {}
  return {
    appendixA: draft.appendixA,
    appendixB: draft.appendixB,
    appendixC: draft.appendixC,
    ...(calibrationSummary.value ? { calibrationSummary: calibrationSummary.value } : {})
  }
}

async function loadReportById(id: number) {
  const response = await getCalibrationReportDetail(id, getAuthHeaders())
  const payload = response.data
  if (!response.success || payload?.code !== 0 || !payload.data) {
    ElMessage.error(payload?.msg || response.error || "报告不存在")
    router.replace("/scale-well-cluster/report")
    return
  }
  applyReportDto(payload.data)
  await loadOrderContext(payload.data.order_id)
}

async function loadFillContext() {
  if (!activeWorkOrder.value && !reportDraft.value) {
    ElMessage.info("请先从数据看板开始刻度流程")
    router.replace("/scale-well-cluster/data-board")
    return
  }
  initReportDraftIfEmpty()
  orderDbId.value = activeWorkOrder.value?.dbId ?? null
  if (!orderDbId.value) return

  const response = await getCalibrationReportByOrder(orderDbId.value, getAuthHeaders())
  const payload = response.data
  if (response.success && payload?.code === 0 && payload.data) {
    applyReportDto(payload.data)
  }
}

onMounted(async () => {
  loading.value = true
  try {
    if (reportDbId.value) {
      await loadReportById(reportDbId.value)
      return
    }
    await loadFillContext()
  } finally {
    loading.value = false
  }
})

const goBack = () => {
  router.push("/scale-well-cluster/report")
}

const saveDraft = async () => {
  const draft = reportDraft.value
  const orderId = orderDbId.value ?? activeWorkOrder.value?.dbId
  if (!draft || !orderId) {
    ElMessage.warning("缺少工单或报告数据")
    return
  }
  if (readOnly.value) return

  saving.value = true
  try {
    const body = {
      orderId,
      reportJson: buildReportJson(),
      kc: draft.appendixB.kc,
      testDate: draft.appendixA.testDate,
      testerName: draft.appendixA.engineer,
      serialNumber: draft.appendixA.serialNumber
    }

    const response = savedReportId.value
      ? await updateCalibrationReport(savedReportId.value, body, getAuthHeaders())
      : await createCalibrationReport(body, getAuthHeaders())

    const payload = response.data
    if (!response.success || payload?.code !== 0 || !payload.data) {
      ElMessage.error(payload?.msg || response.error || "保存草稿失败")
      return
    }

    applyReportDto(payload.data)
    ElMessage.success("报告草稿已保存")
  } finally {
    saving.value = false
  }
}

const submitForReview = async () => {
  const draft = reportDraft.value
  if (!draft || readOnly.value) return

  if (!draft.appendixA.serialNumber || draft.appendixB.kc == null) {
    ElMessage.warning("请完善附录 A/B 必填项后再提交")
    activeTab.value = "appA"
    return
  }

  try {
    await ElMessageBox.confirm("确认提交报告进入审核？", "提交审核", {
      type: "warning",
      confirmButtonText: "提交",
      cancelButtonText: "取消"
    })
  } catch {
    return
  }

  submitting.value = true
  try {
    if (!savedReportId.value) {
      await saveDraft()
    }
    if (!savedReportId.value) return

    const response = await submitCalibrationReport(savedReportId.value, {}, getAuthHeaders())
    const payload = response.data
    if (!response.success || payload?.code !== 0) {
      ElMessage.error(payload?.msg || response.error || "提交审核失败")
      return
    }

    if (payload.data) applyReportDto(payload.data)
    ElMessage.success("报告已提交审核")
    router.replace("/scale-well-cluster/report")
  } finally {
    submitting.value = false
  }
}

const exportPlaceholder = () => {
  ElMessage.info("导出 Word/PDF 功能待对接")
}
</script>

<template>
  <div v-loading="loading" class="scale-well-page">
    <header class="report-edit-header">
      <div>
        <el-button link type="primary" @click="goBack">← 返回我的报告</el-button>
        <h2>{{ pageTitle }}</h2>
        <p v-if="reportDraft" class="report-edit-header__meta">
          {{ reportDraft.workOrderId }}
          <template v-if="viewReport?.id"> · {{ viewReport.id }}</template>
        </p>
      </div>
      <el-tag v-if="viewReport" :type="viewReport.status === 'draft' ? 'info' : viewReport.status === 'pending' ? 'warning' : viewReport.status === 'approved' ? 'success' : 'danger'">
        {{ viewReport.statusText || (viewReport.status === 'draft' ? '草稿' : viewReport.status === 'pending' ? '待审核' : viewReport.status === 'approved' ? '已通过' : '已驳回') }}
      </el-tag>
    </header>

    <el-alert
      v-if="viewReport?.status === 'rejected' && viewReport.reviewRemark"
      type="error"
      :closable="false"
      show-icon
      style="margin-bottom: 12px"
      :title="`驳回原因：${viewReport.reviewRemark}`"
    />

    <div v-if="reportDraft" class="sw-content-panel report-panel">
      <el-tabs v-model="activeTab" class="report-tabs">
        <el-tab-pane label="附录A · 伽马刻度工单" name="appA">
          <ReportAppendixAForm v-if="!readOnly" :draft="reportDraft" />
          <ReportAppendixA v-else-if="viewReport" :report="viewReport" />
        </el-tab-pane>
        <el-tab-pane label="附录B · 测试记录表" name="appB">
          <ReportAppendixBForm v-if="!readOnly" :draft="reportDraft" />
          <ReportAppendixB v-else-if="viewReport" :report="viewReport" />
        </el-tab-pane>
        <el-tab-pane label="附录C · 刻度井记录表" name="appC">
          <ReportAppendixCForm v-if="!readOnly" :draft="reportDraft" />
          <ReportAppendixC v-else-if="viewReport" :report="viewReport" />
        </el-tab-pane>
      </el-tabs>

      <div class="report-actions">
        <el-button @click="exportPlaceholder">导出 Word</el-button>
        <el-button @click="exportPlaceholder">导出 PDF</el-button>
        <template v-if="!readOnly">
          <el-button type="primary" plain :loading="saving" @click="saveDraft">保存草稿</el-button>
          <el-button type="primary" :loading="submitting" :disabled="reportStatus === 1" @click="submitForReview">
            {{ reportStatus === 1 ? "已提交审核" : "提交审核" }}
          </el-button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@import "../shared/styles/scale-well-theme.scss";
@import "./styles/report.scss";

.report-edit-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 12px;

  h2 {
    margin: 4px 0 0;
    font-size: 20px;
    color: var(--color-text-primary);
  }

  &__meta {
    margin: 4px 0 0;
    color: var(--color-text-secondary);
    font-size: 13px;
  }
}

.report-panel {
  padding: 16px 18px 18px;
  overflow: auto;
}

.report-tabs {
  :deep(.el-tabs__content) {
    overflow: visible;
  }
}

.report-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border);
}
</style>
