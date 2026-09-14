<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, nextTick } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessage } from 'element-plus'
import { echarts } from '@/utils/echarts'
import { useAuth } from '@/composables/useAuth'
import {
  loadCurrentUserReportSignature,
  type CurrentUserReportSignature,
} from '@/services/signature-api'
import {
  createSensorlessOvenReportWithFiles,
  type EquipmentReportPayload,
  type EquipmentReportUploadFile,
} from '@/services/sensorless-oven-report-api'
import type { SensorlessOvenContext } from '../composables/useSensorlessOven'

const props = defineProps<{ ctx: SensorlessOvenContext }>()
const emit = defineEmits<{ (e: 'submitted'): void; (e: 'back'): void }>()

const { getAuthHeaders, userInfo } = useAuth()

const currentWorkOrder = computed(() => props.ctx.currentWorkOrder.value)
const tempHistory = computed(() => props.ctx.tempHistory.value)
const summary = computed(() => props.ctx.chartSummary.value)

const instrumentRows = reactive(
  (currentWorkOrder.value?.selectedInstruments || currentWorkOrder.value?.instruments || []).map(
    (item) => ({
      id: String(item.id),
      name: item.name,
      sn: item.sn,
      result: 'pass' as 'pass' | 'fail',
    })
  )
)

const testerName = ref(
  String((userInfo.value?.nickName || userInfo.value?.username || '') as string).trim()
)
const conclusion = ref('')

const overallResult = computed<'pass' | 'fail'>(() =>
  instrumentRows.some((row) => row.result === 'fail') ? 'fail' : 'pass'
)

const todayText = computed(() => {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
})

const targetTempText = computed(() => {
  const target = Number(currentWorkOrder.value?.targetTemp || 0)
  return target > 0 ? `${target.toFixed(1)} °C` : '--'
})

// ---- 电子签名 ----
const signature = ref<CurrentUserReportSignature | null>(null)
const signaturePreviewUrl = ref<string | null>(null)
const signatureLoading = ref(false)
const signatureError = ref<string | null>(null)

async function loadSignature() {
  signatureLoading.value = true
  signatureError.value = null
  try {
    const result = await loadCurrentUserReportSignature(getAuthHeaders())
    signature.value = result
    if (signaturePreviewUrl.value) URL.revokeObjectURL(signaturePreviewUrl.value)
    signaturePreviewUrl.value = URL.createObjectURL(result.previewBlob)
  } catch (error) {
    signature.value = null
    signatureError.value = error instanceof Error ? error.message : String(error || '读取签名失败')
  } finally {
    signatureLoading.value = false
  }
}

// ---- 曲线图 ----
const chartRef = ref<HTMLElement | null>(null)
let chartInstance: echarts.ECharts | null = null

function buildChartOption() {
  const leftData = tempHistory.value.map((p) => [p.timestampMs, p.left] as [number, number | null])
  const rightData = tempHistory.value.map((p) => [p.timestampMs, p.right] as [number, number | null])
  return {
    backgroundColor: '#ffffff',
    grid: { top: 40, right: 24, bottom: 48, left: 56 },
    tooltip: { trigger: 'axis' },
    legend: { data: ['左侧温度', '右侧温度'], top: 8 },
    xAxis: {
      type: 'time',
      axisLabel: { color: '#7a8190', fontSize: 11 },
      axisLine: { lineStyle: { color: '#d5dbe5' } },
    },
    yAxis: {
      type: 'value',
      name: '°C',
      min: 0,
      max: 300,
      interval: 50,
      axisLabel: { color: '#7a8190', fontSize: 11 },
      splitLine: { lineStyle: { color: '#edf1f7' } },
    },
    series: [
      {
        name: '左侧温度',
        type: 'line',
        showSymbol: false,
        smooth: true,
        connectNulls: true,
        lineStyle: { width: 2, color: '#2f6bff' },
        itemStyle: { color: '#2f6bff' },
        data: leftData,
      },
      {
        name: '右侧温度',
        type: 'line',
        showSymbol: false,
        smooth: true,
        connectNulls: true,
        lineStyle: { width: 2, color: '#f2760c' },
        itemStyle: { color: '#f2760c' },
        data: rightData,
      },
    ],
  }
}

function initChart() {
  if (!chartRef.value) return
  chartInstance = echarts.init(chartRef.value)
  chartInstance.setOption(buildChartOption())
}

function handleResize() {
  chartInstance?.resize()
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(',')
  const mime = /data:(.*?);/.exec(head)?.[1] || 'image/png'
  const binary = atob(body)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

function exportCurveFile(): EquipmentReportUploadFile | null {
  if (!chartInstance || !tempHistory.value.length) return null
  const dataUrl = chartInstance.getDataURL({
    type: 'png',
    pixelRatio: 2,
    backgroundColor: '#ffffff',
  })
  return {
    fieldName: 'testing_curve',
    fileName: `无感烘箱测试曲线-${currentWorkOrder.value?.taskNumber || 'report'}.png`,
    blob: dataUrlToBlob(dataUrl),
  }
}

// ---- 提交 ----
const submitting = ref(false)
const clientSubmitId = `soven-${(crypto as any)?.randomUUID?.() || Date.now().toString(36)}`

const canSubmit = computed(
  () => !submitting.value && !!signature.value && tempHistory.value.length > 0 && !!testerName.value.trim()
)

async function submitReport() {
  const order = currentWorkOrder.value
  if (!order) {
    ElMessage.error('缺少当前工单信息，无法提交')
    return
  }
  if (!signature.value) {
    ElMessage.error('请先读取测试人电子签名')
    return
  }
  if (!testerName.value.trim()) {
    ElMessage.error('请填写测试人')
    return
  }
  if (!tempHistory.value.length) {
    ElMessage.error('没有采集到温度曲线数据，无法生成报告')
    return
  }

  submitting.value = true
  try {
    const curveFile = exportCurveFile()
    const files: EquipmentReportUploadFile[] = []
    if (curveFile) files.push(curveFile)
    files.push(signature.value.file)

    const instrumentResults = instrumentRows.map((row) => ({
      order_id: order.dbId,
      order_no: order.taskNumber,
      instrument_name: row.name,
      instrument_sn: row.sn,
      result: row.result,
      result_text: row.result === 'pass' ? '合格' : '不合格',
    }))

    const reportJson: Record<string, unknown> = {
      module: 'sensorless-oven',
      source: 'operator-client',
      basic_info: {
        task_number: order.taskNumber,
        applicant: order.applicant,
        device_name: order.deviceName,
        target_temp: order.targetTemp,
        test_platform: order.testPlatform,
        test_date: todayText.value,
        tester: testerName.value.trim(),
      },
      summary: {
        max_temp: summary.value.maxTemp,
        min_temp: summary.value.minTemp,
        latest_left: summary.value.latestLeft,
        latest_right: summary.value.latestRight,
        point_count: summary.value.count,
      },
      instruments: instrumentResults,
      overall_result: overallResult.value,
      overall_result_text: overallResult.value === 'pass' ? '合格' : '不合格',
      conclusion: conclusion.value.trim(),
      tester_signature: {
        user_id: signature.value.info.userId,
        signature_id: signature.value.info.signatureId,
        sha256: signature.value.info.sha256 || '',
      },
      curve: { field: 'testing_curve', y_min: 0, y_max: 300 },
    }

    const payload: EquipmentReportPayload = {
      task_number: order.taskNumber,
      test_date: todayText.value,
      tester: testerName.value.trim(),
      status: 0,
      overall_result: overallResult.value,
      order_ids: [order.dbId],
      order_numbers: [order.taskNumber],
      instrument_results: instrumentResults,
      report_json: reportJson,
      remark: conclusion.value.trim(),
      client_submit_id: clientSubmitId,
    }

    const res = await createSensorlessOvenReportWithFiles(payload, files, getAuthHeaders())
    if (res.success && res.data?.code === 0) {
      ElMessage.success('报告已提交，等待审核')
      emit('submitted')
    } else {
      ElMessage.error(res.data?.msg || res.error || '报告提交失败')
    }
  } catch (error) {
    ElMessage.error('报告提交失败：' + (error instanceof Error ? error.message : String(error)))
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  await nextTick()
  initChart()
  window.addEventListener('resize', handleResize)
  loadSignature()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  if (signaturePreviewUrl.value) URL.revokeObjectURL(signaturePreviewUrl.value)
  chartInstance?.dispose()
  chartInstance = null
})
</script>

<template>
  <div class="report-scroll-region">
    <div class="report-card">
      <header class="report-head">
        <div class="report-head-title">
          <Icon icon="mdi:file-document-edit-outline" />
          <div>
            <h2>无感烘箱测试报告</h2>
            <p>请核对信息、选择设备结论并完成签名后提交，曲线图片将随报告上传至服务端。</p>
          </div>
        </div>
        <button class="report-back-btn" :disabled="submitting" @click="emit('back')">
          <Icon icon="mdi:arrow-left" /> 返回主页
        </button>
      </header>

      <!-- 基本信息 -->
      <section class="report-block">
        <div class="report-block-title">基本信息</div>
        <div class="report-info-grid">
          <div class="info-cell"><span>工单编号</span><strong>{{ currentWorkOrder?.taskNumber || '-' }}</strong></div>
          <div class="info-cell"><span>申请人</span><strong>{{ currentWorkOrder?.applicant || '-' }}</strong></div>
          <div class="info-cell"><span>设备名称</span><strong>{{ currentWorkOrder?.deviceName || '无感烘箱' }}</strong></div>
          <div class="info-cell"><span>目标温度</span><strong>{{ targetTempText }}</strong></div>
          <div class="info-cell"><span>测试平台</span><strong>{{ currentWorkOrder?.testPlatform || '无感烘箱' }}</strong></div>
          <div class="info-cell"><span>测试日期</span><strong>{{ todayText }}</strong></div>
          <div class="info-cell info-cell-input">
            <span>测试人</span>
            <input v-model="testerName" type="text" placeholder="请输入测试人" />
          </div>
          <div class="info-cell">
            <span>整体结论</span>
            <strong :class="overallResult === 'pass' ? 'result-pass' : 'result-fail'">
              {{ overallResult === 'pass' ? '合格' : '不合格' }}
            </strong>
          </div>
        </div>
      </section>

      <!-- 设备信息 / 结论 -->
      <section class="report-block">
        <div class="report-block-title">设备信息与结论</div>
        <table class="report-table">
          <thead>
            <tr>
              <th style="width: 44px">序号</th>
              <th>仪器名称</th>
              <th>编号 (SN)</th>
              <th style="width: 160px">结论</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in instrumentRows" :key="row.id">
              <td>{{ index + 1 }}</td>
              <td>{{ row.name }}</td>
              <td>{{ row.sn }}</td>
              <td>
                <select v-model="row.result" class="result-select" :class="row.result">
                  <option value="pass">合格</option>
                  <option value="fail">不合格</option>
                </select>
              </td>
            </tr>
            <tr v-if="!instrumentRows.length">
              <td colspan="4" class="report-empty">当前工单没有可填写的仪器信息</td>
            </tr>
          </tbody>
        </table>
        <div class="report-remark">
          <span>备注 / 结论说明</span>
          <textarea v-model="conclusion" rows="2" placeholder="可填写外观检查、异常说明等（选填）"></textarea>
        </div>
      </section>

      <!-- 签名 -->
      <section class="report-block">
        <div class="report-block-title">测试人电子签名</div>
        <div class="signature-zone">
          <div class="signature-preview">
            <img v-if="signaturePreviewUrl" :src="signaturePreviewUrl" alt="测试人签名" />
            <div v-else class="signature-placeholder">
              <span v-if="signatureLoading">正在读取签名...</span>
              <span v-else-if="signatureError" class="signature-error">{{ signatureError }}</span>
              <span v-else>未读取到签名</span>
            </div>
          </div>
          <div class="signature-info">
            <div v-if="signature">
              <div class="signature-name">{{ signature.info.nickname || signature.info.username }}</div>
              <div class="signature-meta">签名将随报告上传</div>
            </div>
            <button class="signature-reload" :disabled="signatureLoading" @click="loadSignature">
              <Icon icon="mdi:refresh" /> {{ signature ? '重新读取' : '读取当前测试人签名' }}
            </button>
          </div>
        </div>
      </section>

      <!-- 曲线图 -->
      <section class="report-block">
        <div class="report-block-title">本次测试曲线</div>
        <div class="report-chart-body">
          <div ref="chartRef" class="report-chart"></div>
          <div v-if="!tempHistory.length" class="report-chart-empty">本次没有采集到温度数据</div>
        </div>
      </section>

      <footer class="report-footer">
        <button class="submit-btn" :disabled="!canSubmit" @click="submitReport">
          <Icon icon="mdi:cloud-upload-outline" />
          {{ submitting ? '正在提交...' : '提交报告' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.report-scroll-region {
  height: 100%;
  overflow-y: auto;
  padding: 12px;
  box-sizing: border-box;
}
.report-card {
  background: #fff;
  border: 1px solid var(--color-border, #e5e9f0);
  border-radius: 14px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.report-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
.report-head-title {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.report-head-title svg {
  font-size: 26px;
  color: #2f6bff;
  margin-top: 2px;
}
.report-head-title h2 {
  margin: 0;
  font-size: 17px;
}
.report-head-title p {
  margin: 3px 0 0;
  font-size: 12px;
  color: #7a8190;
}
.report-back-btn {
  background: transparent;
  border: 1px solid var(--color-border, #e5e9f0);
  border-radius: 8px;
  padding: 6px 12px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #5a6172;
  white-space: nowrap;
}
.report-back-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.report-block {
  border: 1px solid #eef1f6;
  border-radius: 12px;
  padding: 12px 14px;
}
.report-block-title {
  font-size: 14px;
  font-weight: 600;
  color: #2b3242;
  margin-bottom: 10px;
}
.report-info-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.info-cell {
  display: flex;
  flex-direction: column;
  gap: 3px;
  background: #f7f9fc;
  border-radius: 9px;
  padding: 8px 10px;
}
.info-cell > span { font-size: 11px; color: #8a91a0; }
.info-cell > strong { font-size: 14px; color: #2b3242; }
.info-cell-input input {
  border: 1px solid #d5dbe5;
  border-radius: 7px;
  padding: 4px 8px;
  font-size: 14px;
  outline: none;
}
.info-cell-input input:focus { border-color: #2f6bff; }
.result-pass { color: #16a34a !important; }
.result-fail { color: #dc2626 !important; }
.report-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.report-table th,
.report-table td {
  border: 1px solid #eef1f6;
  padding: 7px 10px;
  text-align: left;
}
.report-table th {
  background: #f7f9fc;
  color: #5a6172;
  font-weight: 600;
}
.report-empty { text-align: center; color: #9aa1b0; }
.result-select {
  width: 100%;
  border: 1px solid #d5dbe5;
  border-radius: 7px;
  padding: 4px 8px;
  font-size: 13px;
  outline: none;
}
.result-select.pass { color: #16a34a; }
.result-select.fail { color: #dc2626; }
.report-remark {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.report-remark > span { font-size: 12px; color: #8a91a0; }
.report-remark textarea {
  border: 1px solid #d5dbe5;
  border-radius: 8px;
  padding: 7px 9px;
  font-size: 13px;
  resize: vertical;
  outline: none;
}
.report-remark textarea:focus { border-color: #2f6bff; }
.signature-zone {
  display: flex;
  gap: 16px;
  align-items: center;
}
.signature-preview {
  width: 220px;
  height: 96px;
  border: 1px dashed #c9d1de;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fafbfe;
  overflow: hidden;
}
.signature-preview img { max-width: 100%; max-height: 100%; object-fit: contain; }
.signature-placeholder { font-size: 12px; color: #9aa1b0; text-align: center; padding: 0 8px; }
.signature-error { color: #dc2626; }
.signature-info { display: flex; flex-direction: column; gap: 8px; }
.signature-name { font-size: 14px; font-weight: 600; color: #2b3242; }
.signature-meta { font-size: 12px; color: #8a91a0; }
.signature-reload {
  align-self: flex-start;
  border: 1px solid #2f6bff;
  color: #2f6bff;
  background: #fff;
  border-radius: 8px;
  padding: 5px 12px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
}
.signature-reload:disabled { opacity: 0.5; cursor: not-allowed; }
.report-chart-body { position: relative; height: 320px; }
.report-chart { width: 100%; height: 100%; }
.report-chart-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9aa1b0;
  font-size: 13px;
}
.report-footer { display: flex; justify-content: flex-end; }
.submit-btn {
  background: #2f6bff;
  color: #fff;
  border: none;
  border-radius: 10px;
  padding: 10px 22px;
  font-size: 15px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.submit-btn:disabled { background: #b7c4de; cursor: not-allowed; }

@media (max-width: 900px) {
  .report-info-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
