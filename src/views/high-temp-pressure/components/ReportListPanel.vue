<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessage } from 'element-plus'
import { useAuth } from '@/composables/useAuth'
import {
  downloadHighTempPressureReportPdf,
  getHighTempPressureReportDetail,
  listHighTempPressureReports,
  type HighTempPressureReportItem,
} from '@/services/high-temp-pressure-report-api'
import type { HighTempPressurePendingReport } from '../utils/pendingReport'

const props = defineProps<{
  pendingReports: HighTempPressurePendingReport[]
  initialTab?: 'pending' | 'server'
}>()

const emit = defineEmits<{
  (event: 'open-pending', report: HighTempPressurePendingReport): void
  (event: 'remove-pending', report: HighTempPressurePendingReport): void
  (event: 'back'): void
}>()

const { initAuth, getAuthHeaders } = useAuth()
const activeTab = ref<'pending' | 'server'>(props.initialTab || 'pending')
const serverReports = ref<HighTempPressureReportItem[]>([])
const serverLoading = ref(false)
const serverKeyword = ref('')
const detailLoading = ref(false)
const detailReport = ref<HighTempPressureReportItem | null>(null)
const detailPdfUrl = ref('')
const detailPdfBuffer = ref<ArrayBuffer | null>(null)

const filteredServerReports = computed(() => {
  const keyword = serverKeyword.value.trim().toLowerCase()
  if (!keyword) return serverReports.value
  return serverReports.value.filter((report) => [
    report.report_no,
    report.task_number,
    report.instrument_name,
    report.instrument_sn,
    report.tester,
    report.equipment_id,
  ].some((value) => String(value || '').toLowerCase().includes(keyword)))
})

function uniqueText(values: unknown[]) {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean))).join('、') || '-'
}

function pendingOrderNos(report: HighTempPressurePendingReport) {
  return uniqueText(report.selections.map((selection) => selection.order.no))
}

function pendingInstrumentNames(report: HighTempPressurePendingReport) {
  return uniqueText(report.selections.map((selection) => selection.instrument.label))
}

function pendingInstrumentSns(report: HighTempPressurePendingReport) {
  return uniqueText(report.selections.map((selection) => selection.instrument.sn))
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-'
  return String(value).replace('T', ' ').slice(0, 19)
}

function formatRuntime(seconds: number) {
  const total = Math.max(0, Math.round(Number(seconds) || 0))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function statusMeta(report: HighTempPressureReportItem) {
  if (!report.is_current) return { label: '历史报告', className: 'status-history' }
  if (report.status === 1) return { label: report.status_text || '审核通过', className: 'status-pass' }
  if (report.status === 2) return { label: report.status_text || '审核未通过', className: 'status-reject' }
  return { label: report.status_text || '待审核', className: 'status-pending' }
}

function resultText(value: string | undefined) {
  if (value === 'pass') return '合格'
  if (value === 'fail') return '不合格'
  return '待确认'
}

function clearDetailPdf() {
  if (detailPdfUrl.value) URL.revokeObjectURL(detailPdfUrl.value)
  detailPdfUrl.value = ''
  detailPdfBuffer.value = null
}

async function fetchServerReports() {
  serverLoading.value = true
  try {
    const authOk = await initAuth()
    if (!authOk) throw new Error('登录已失效，请重新登录后查看报告')
    const response = await listHighTempPressureReports(
      { page: 1, pageSize: 500 },
      getAuthHeaders()
    )
    if (!response.success || response.data?.code !== 0) {
      throw new Error(response.data?.msg || response.error || '获取服务端报告失败')
    }
    serverReports.value = response.data.data?.list || []
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '获取服务端报告失败')
  } finally {
    serverLoading.value = false
  }
}

async function switchTab(tab: 'pending' | 'server') {
  activeTab.value = tab
  if (tab === 'server') await fetchServerReports()
}

function savePdfBuffer(buffer: ArrayBuffer, fileName: string) {
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/pdf' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function downloadReport(report: HighTempPressureReportItem) {
  try {
    const authOk = await initAuth()
    if (!authOk) throw new Error('登录已失效，请重新登录后下载')
    const response = await downloadHighTempPressureReportPdf(report.id, getAuthHeaders())
    if (!response.success || !response.data) throw new Error(response.error || '下载报告失败')
    savePdfBuffer(response.data, `${report.report_no || `高温高压报告-${report.id}`}.pdf`)
    ElMessage.success('报告 PDF 已下载')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '下载报告失败')
  }
}

async function openReportDetail(report: HighTempPressureReportItem) {
  detailLoading.value = true
  detailReport.value = report
  clearDetailPdf()
  try {
    const authOk = await initAuth()
    if (!authOk) throw new Error('登录已失效，请重新登录后查看详情')
    const headers = getAuthHeaders()
    const [detailResponse, pdfResponse] = await Promise.all([
      getHighTempPressureReportDetail(report.id, headers),
      downloadHighTempPressureReportPdf(report.id, headers),
    ])
    if (!detailResponse.success || detailResponse.data?.code !== 0) {
      throw new Error(detailResponse.data?.msg || detailResponse.error || '获取报告详情失败')
    }
    detailReport.value = detailResponse.data.data
    if (pdfResponse.success && pdfResponse.data) {
      detailPdfBuffer.value = pdfResponse.data
      detailPdfUrl.value = URL.createObjectURL(new Blob([pdfResponse.data], { type: 'application/pdf' }))
    } else {
      ElMessage.warning(pdfResponse.error || '报告详情已加载，但 PDF 暂时无法预览')
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '获取报告详情失败')
  } finally {
    detailLoading.value = false
  }
}

function closeDetail() {
  clearDetailPdf()
  detailReport.value = null
}

function downloadDetailPdf() {
  if (!detailReport.value) return
  if (detailPdfBuffer.value) {
    savePdfBuffer(
      detailPdfBuffer.value,
      `${detailReport.value.report_no || `高温高压报告-${detailReport.value.id}`}.pdf`
    )
    return
  }
  void downloadReport(detailReport.value)
}

onMounted(() => {
  if (activeTab.value === 'server' || props.pendingReports.length === 0) void switchTab('server')
})

onBeforeUnmount(clearDetailPdf)
</script>

<template>
  <div class="report-center panel">
    <div class="report-tabs">
      <button :class="['report-tab', { active: activeTab === 'pending' }]" @click="switchTab('pending')">
        <Icon icon="mdi:file-document-edit-outline" />
        待填写报告
        <span class="tab-count">{{ pendingReports.length }}</span>
      </button>
      <button :class="['report-tab', { active: activeTab === 'server' }]" @click="switchTab('server')">
        <Icon icon="mdi:server-outline" />
        服务端报告
        <span class="tab-count">{{ serverReports.length }}</span>
      </button>
    </div>

    <section v-if="activeTab === 'pending'" class="report-card">
      <div class="section-heading">
        <div>
          <div class="section-title"><Icon icon="mdi:laptop" /><h3>本机待填写报告</h3></div>
          <p>采集数据和填写草稿保存在本机，提交成功后自动从此列表移除。</p>
        </div>
        <span class="section-count">共 {{ pendingReports.length }} 份</span>
      </div>
      <div v-if="pendingReports.length === 0" class="empty-state">
        <Icon icon="mdi:file-check-outline" />
        <strong>暂无待填写报告</strong>
        <span>完成测试后，报告任务会出现在这里。</span>
      </div>
      <div v-else class="table-wrapper">
        <table class="data-table report-list-table pending-report-table">
          <colgroup>
            <col class="col-pending-order" />
            <col class="col-pending-device" />
            <col class="col-pending-capture" />
            <col class="col-pending-time" />
            <col class="col-pending-status" />
            <col class="col-pending-actions" />
          </colgroup>
          <thead>
            <tr>
              <th>工单编号</th>
              <th>测试设备</th>
              <th>采集数据</th>
              <th>保存时间</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="report in pendingReports" :key="report.clientSubmitId">
              <td><div class="cell-primary wrap-id">{{ pendingOrderNos(report) }}</div></td>
              <td>
                <div class="cell-primary clamp-two" :title="pendingInstrumentNames(report)">{{ pendingInstrumentNames(report) }}</div>
                <div class="cell-secondary" :title="pendingInstrumentSns(report)">{{ pendingInstrumentSns(report) }}</div>
              </td>
              <td>
                <div class="capture-summary">
                  <span><Icon icon="mdi:chart-line" /> {{ report.csvCount }} 条</span>
                  <span><Icon icon="mdi:timer-outline" /> {{ formatRuntime(report.runtimeSeconds) }}</span>
                </div>
                <div class="cell-secondary path-cell" :title="report.exportedCaptureDir">{{ report.exportedCaptureDir }}</div>
              </td>
              <td>
                <div class="cell-primary date-cell">{{ formatDateTime(report.savedAt).slice(0, 10) }}</div>
                <div class="cell-secondary">{{ formatDateTime(report.savedAt).slice(11) }}</div>
              </td>
              <td>
                <span :class="['status-badge', report.phase === 'report' ? 'pending' : 'warning']">
                  {{ report.phase === 'report' ? '待填写' : '待确认' }}
                </span>
              </td>
              <td class="actions-cell">
                <div class="action-buttons">
                  <button class="action-btn action-btn-edit" @click="emit('open-pending', report)">
                    <Icon icon="mdi:pencil-outline" /> 填写
                  </button>
                  <button class="action-btn action-btn-danger" @click="emit('remove-pending', report)">
                    <Icon icon="mdi:trash-can-outline" /> 移除
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-else class="report-card">
      <div class="section-heading server-heading">
        <div>
          <div class="section-title"><Icon icon="mdi:server-outline" /><h3>服务端高温高压报告</h3></div>
          <p>查看已提交报告、审核状态，并预览或下载设备级正式 PDF。</p>
        </div>
        <div class="server-tools">
          <label class="search-box inline report-search">
            <Icon icon="mdi:magnify" class="search-icon" />
            <input v-model="serverKeyword" placeholder="搜索报告号 / 工单 / 设备" />
          </label>
          <button class="week-cal-nav refresh-button" :disabled="serverLoading" @click="fetchServerReports">
            <Icon icon="mdi:refresh" /> {{ serverLoading ? '刷新中' : '刷新' }}
          </button>
        </div>
      </div>
      <div v-if="serverLoading" class="empty-state"><Icon icon="mdi:loading" class="spin" /><strong>正在加载报告</strong></div>
      <div v-else-if="filteredServerReports.length === 0" class="empty-state">
        <Icon icon="mdi:file-search-outline" />
        <strong>暂无服务端报告</strong>
      </div>
      <div v-else class="table-wrapper">
        <table class="data-table report-list-table server-report-table">
          <colgroup>
            <col class="col-report-no" />
            <col class="col-task-no" />
            <col class="col-device" />
            <col class="col-bench" />
            <col class="col-tester" />
            <col class="col-status" />
            <col class="col-submit-time" />
            <col class="col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th>报告编号</th>
              <th>工单编号</th>
              <th>测试设备</th>
              <th>测试台</th>
              <th>测试人员</th>
              <th>状态</th>
              <th>提交时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="report in filteredServerReports" :key="report.id">
              <td><div class="cell-primary wrap-id">{{ report.report_no }}</div></td>
              <td><div class="cell-primary wrap-id">{{ report.task_number || uniqueText(report.order_numbers || []) }}</div></td>
              <td>
                <div class="cell-primary clamp-two">{{ report.instrument_name || '-' }}</div>
                <div class="cell-secondary">{{ report.instrument_sn || '-' }}</div>
              </td>
              <td><div class="cell-primary compact-text">{{ report.equipment_id || '-' }}</div></td>
              <td><div class="cell-primary compact-text">{{ report.tester || '-' }}</div></td>
              <td><span :class="['status-badge', statusMeta(report).className]">{{ statusMeta(report).label }}</span></td>
              <td>
                <div class="cell-primary date-cell">{{ formatDateTime(report.submit_time).slice(0, 10) }}</div>
                <div class="cell-secondary">{{ formatDateTime(report.submit_time).slice(11) }}</div>
              </td>
              <td class="actions-cell">
                <div class="action-buttons">
                  <button class="action-btn action-btn-view" @click="openReportDetail(report)"><Icon icon="mdi:eye-outline" /> 查看</button>
                  <button class="action-btn action-btn-download" @click="downloadReport(report)"><Icon icon="mdi:download" /> PDF</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <Teleport to="body">
      <div v-if="detailReport" class="detail-mask" @click.self="closeDetail">
        <div class="detail-dialog">
          <div class="detail-header">
            <div>
              <span class="detail-kicker">高温高压井测试报告</span>
              <h3>{{ detailReport.report_no }}</h3>
            </div>
            <div class="detail-actions">
              <button class="primary-btn compact" :disabled="detailLoading" @click="downloadDetailPdf">
                <Icon icon="mdi:download" /> 单独下载 PDF
              </button>
              <button class="detail-close" @click="closeDetail">×</button>
            </div>
          </div>
          <div class="detail-body">
            <div class="detail-info">
              <div><span>工单编号</span><strong>{{ detailReport.task_number || uniqueText(detailReport.order_numbers || []) }}</strong></div>
              <div><span>测试设备</span><strong>{{ detailReport.instrument_name || '-' }}</strong></div>
              <div><span>设备 SN</span><strong>{{ detailReport.instrument_sn || '-' }}</strong></div>
              <div><span>测试台 psi_id</span><strong>{{ detailReport.equipment_id || '-' }}</strong></div>
              <div><span>测试人员</span><strong>{{ detailReport.tester || '-' }}</strong></div>
              <div><span>测试结论</span><strong>{{ resultText(detailReport.overall_result) }}</strong></div>
              <div><span>测试轮次</span><strong>第 {{ detailReport.attempt_no || 1 }} 次</strong></div>
              <div><span>提交时间</span><strong>{{ formatDateTime(detailReport.submit_time) }}</strong></div>
            </div>
            <div class="pdf-preview">
              <div v-if="detailLoading" class="pdf-placeholder"><Icon icon="mdi:loading" class="spin" /> 正在生成预览</div>
              <iframe v-else-if="detailPdfUrl" :src="detailPdfUrl" title="高温高压报告 PDF 预览"></iframe>
              <div v-else class="pdf-placeholder"><Icon icon="mdi:file-alert-outline" /> PDF 暂时无法预览，可尝试单独下载</div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped src="./high-temp-pressure.shared.css"></style>
<style scoped>
.report-center { min-height: 0; overflow: hidden; gap: 12px; }
.report-tabs { flex: 0 0 48px; display: flex; align-items: stretch; gap: 4px; padding: 0 14px; border: 1px solid var(--color-border); border-radius: 12px; background: var(--color-bg-secondary); }
.report-tab { position: relative; display: inline-flex; align-items: center; gap: 7px; padding: 0 14px; border: 0; background: transparent; color: var(--color-text-secondary); cursor: pointer; font-size: 13px; font-weight: 600; }
.report-tab:hover { color: var(--color-text-primary); }
.report-tab.active { color: var(--color-accent-blue); }
.report-tab.active::after { content: ''; position: absolute; right: 10px; bottom: -1px; left: 10px; height: 3px; border-radius: 3px 3px 0 0; background: var(--color-accent-blue); }
.tab-count { min-width: 20px; padding: 1px 6px; border-radius: 999px; background: var(--color-bg-tertiary); color: var(--color-text-secondary); text-align: center; font-size: 11px; line-height: 18px; }
.report-tab.active .tab-count { background: rgba(59,130,246,.12); color: var(--color-accent-blue); }
.report-card { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--color-border); border-radius: 12px; background: var(--color-bg-secondary); }
.section-heading { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 14px 16px; border-bottom: 1px solid var(--color-border); }
.section-title { display: flex; align-items: center; gap: 8px; }
.section-title > svg { color: var(--color-text-secondary); font-size: 17px; }
.section-heading h3 { margin: 0; font-size: 15px; font-weight: 600; }
.section-heading p { margin: 4px 0 0 25px; color: var(--color-text-secondary); font-size: 12px; }
.section-count { padding: 3px 9px; border-radius: 999px; background: var(--color-bg-tertiary); color: var(--color-text-secondary); font-size: 12px; white-space: nowrap; }
.empty-state { flex: 1; min-height: 220px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 9px; color: var(--color-text-secondary); }
.empty-state > svg { font-size: 36px; color: var(--color-text-tertiary); }
.server-heading { align-items: center; }
.server-tools { display: flex; gap: 8px; align-items: center; }
.search-box.inline.report-search { width: 320px; gap: 8px; padding: 0; border: 0; background: transparent; }
.search-box.inline.report-search input { height: 36px; margin: 0; padding: 0 12px; border: 1px solid var(--color-border); border-radius: 10px; background: var(--color-bg-primary); }
.search-box.inline.report-search .search-icon { flex: 0 0 auto; color: var(--color-text-secondary); font-size: 18px; }
.refresh-button { height: 36px; display: inline-flex; align-items: center; gap: 5px; padding: 0 13px; border-radius: 10px; }
.table-wrapper { flex: 1; min-height: 0; overflow: auto; }
.report-list-table { width: 100%; table-layout: fixed; }
.report-list-table th { position: sticky; top: 0; z-index: 2; padding: 11px 12px; background: var(--color-bg-tertiary); font-size: 12px; }
.report-list-table td { height: 66px; padding: 10px 12px; vertical-align: middle; }
.report-list-table tbody tr { cursor: default; }
.pending-report-table { min-width: 980px; }
.pending-report-table .col-pending-order { width: 17%; }
.pending-report-table .col-pending-device { width: 21%; }
.pending-report-table .col-pending-capture { width: 24%; }
.pending-report-table .col-pending-time { width: 14%; }
.pending-report-table .col-pending-status { width: 9%; }
.pending-report-table .col-pending-actions { width: 15%; }
.server-report-table { min-width: 1120px; }
.server-report-table .col-report-no { width: 14%; }
.server-report-table .col-task-no { width: 14%; }
.server-report-table .col-device { width: 16%; }
.server-report-table .col-bench { width: 9%; }
.server-report-table .col-tester { width: 8%; }
.server-report-table .col-status { width: 9%; }
.server-report-table .col-submit-time { width: 13%; }
.server-report-table .col-actions { width: 17%; }
.cell-primary { min-width: 0; color: var(--color-text-primary); font-weight: 500; line-height: 1.45; word-break: break-word; }
.cell-secondary { margin-top: 4px; overflow: hidden; color: var(--color-text-secondary); font-size: 12px; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
.wrap-id { overflow-wrap: anywhere; }
.clamp-two { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.compact-text, .date-cell { white-space: nowrap; }
.capture-summary { display: flex; align-items: center; gap: 14px; color: var(--color-text-primary); font-size: 12px; }
.capture-summary span { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
.path-cell { max-width: 100%; }
.actions-cell { vertical-align: middle !important; }
.action-buttons { display: flex; align-items: center; gap: 7px; flex-wrap: nowrap; }
.action-btn { display: inline-flex; align-items: center; justify-content: center; gap: 4px; min-width: 58px; height: 30px; padding: 0 9px; border: 1px solid rgba(59,130,246,.25); border-radius: 9px; background: rgba(59,130,246,.12); color: var(--color-accent-blue); cursor: pointer; font-size: 12px; font-weight: 600; white-space: nowrap; }
.action-btn-edit { border-color: rgba(16,185,129,.25); background: rgba(16,185,129,.12); color: #059669; }
.action-btn-download { border-color: rgba(16,185,129,.25); background: rgba(16,185,129,.12); color: #059669; }
.action-btn-danger { border-color: rgba(239,68,68,.25); background: rgba(239,68,68,.1); color: var(--color-error); }
.action-btn:hover { filter: brightness(.96); }
.primary-btn.compact { height: 36px; justify-content: center; padding: 0 13px; border-radius: 10px; font-size: 13px; }
.status-badge { display: inline-flex; align-items: center; padding: 3px 9px; border-radius: 999px; font-size: 11px; font-weight: 600; white-space: nowrap; }
.status-badge.pending, .status-pending { background: rgba(245,158,11,.12); color: #d97706; }
.status-badge.warning { background: rgba(239,68,68,.1); color: var(--color-error); }
.status-pass { background: rgba(16,185,129,.12); color: #059669; }
.status-reject { background: rgba(239,68,68,.1); color: var(--color-error); }
.status-history { background: var(--color-bg-tertiary); color: var(--color-text-tertiary); }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.detail-mask { position: fixed; inset: 0; z-index: 1500; display: grid; place-items: center; padding: 24px; background: rgba(15,23,42,.62); backdrop-filter: blur(4px); }
.detail-dialog { width: min(1180px, 96vw); height: min(860px, 92vh); display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--color-border); border-radius: 12px; background: var(--color-bg-secondary); box-shadow: 0 24px 70px rgba(0,0,0,.3); color: var(--color-text-primary); }
.detail-header { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 16px 20px; border-bottom: 1px solid var(--color-border); }
.detail-kicker { color: var(--color-text-secondary); font-size: 12px; }
.detail-header h3 { margin: 3px 0 0; font-size: 18px; }
.detail-actions { display: flex; align-items: center; gap: 10px; }
.detail-close { width: 34px; height: 34px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-bg-tertiary); color: var(--color-text-primary); cursor: pointer; font-size: 22px; }
.detail-body { flex: 1; min-height: 0; display: grid; grid-template-columns: 260px minmax(0,1fr); }
.detail-info { overflow: auto; padding: 15px; border-right: 1px solid var(--color-border); background: var(--color-bg-primary); }
.detail-info > div { display: grid; gap: 4px; padding: 10px; border-bottom: 1px solid var(--color-border); }
.detail-info span { color: var(--color-text-tertiary); font-size: 11px; }
.detail-info strong { overflow-wrap: anywhere; font-size: 13px; }
.pdf-preview { min-width: 0; min-height: 0; padding: 10px; background: #525659; }
.pdf-preview iframe { width: 100%; height: 100%; border: 0; background: white; }
.pdf-placeholder { height: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; color: white; }
@media (max-width: 800px) {
  .section-heading, .server-heading { align-items: stretch; flex-direction: column; }
  .server-tools, .search-box.inline.report-search { width: 100%; }
  .detail-body { grid-template-columns: 1fr; }
  .detail-info { display: grid; grid-template-columns: repeat(2,1fr); max-height: 220px; border-right: 0; border-bottom: 1px solid var(--color-border); }
}
</style>
