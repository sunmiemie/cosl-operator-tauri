<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { readFile } from '@tauri-apps/plugin-fs'
import type { ScheduledSelection } from '../types'
import { formatRuntimeHours } from '../utils/runtime'
import { useAuth } from '@/composables/useAuth'
import {
  createHighTempPressureReport,
  createHighTempPressureReportWithFiles,
  type HighTempPressureReportResult,
} from '@/services/high-temp-pressure-report-api'

const props = defineProps<{
  currentSelected: ScheduledSelection | null
  selectedScheduledOrders: ScheduledSelection[]
  csvCount: number
  exportedCaptureDir: string
  curveChartImagePath: string
  curvePointCount: number
  runtimeSeconds?: number
  ensureCurveChartImage?: () => Promise<string>
}>()
const emit = defineEmits<{
  'shutdown-complete': []
}>()

type FileStatus = 'pending' | 'generating' | 'done'
type FileKey = 'csv' | 'chart' | 'report'
type InstrumentResultState = {
  result: HighTempPressureReportResult
  observation: string
}

const { initAuth, getAuthHeaders } = useAuth()

const fileStatuses = ref<Record<FileKey, FileStatus>>({
  csv: 'pending',
  chart: 'pending',
  report: 'pending',
})
const instrumentResultMap = ref<Record<string, InstrumentResultState>>({})
const observation = ref('')
const operatorName = ref('')
const reviewerName = ref('')
const confirmChecks = ref([false, false, false, false])
const paperReportChecks = ref({
  onlineTest: false,
  otherRequirements: '无',
  testingProtectiveCapProvider: 'applicant' as 'applicant' | 'tester',
  testingPlugProvider: 'applicant' as 'applicant' | 'tester',
  noDistorted: true,
  noLeakage: true,
  curveStatus: 'normal' as 'normal' | 'abnormal',
  otherDescriptions: '无',
  testingCurveCopies: 2,
  otherCopies: 5,
})
const showFileSaveModal = ref(false)
const uploadCompleted = ref(false)
const uploadSubmitting = ref(false)
const submittedReportNo = ref('')
const clientSubmitId = ref('')
const shutdownChecks = ref([false, false, false, false, false])
const shiftHours = ref('')
const runtimeHours = computed(() => formatRuntimeHours(props.runtimeSeconds ?? 0))
const totalHours = computed(() => runtimeHours.value)
const taskSummary = ref('')
const generatedCurveChartImagePath = ref('')
const activeCurveChartImagePath = computed(() => props.curveChartImagePath || generatedCurveChartImagePath.value)

const reportSelections = computed(() => {
  return props.selectedScheduledOrders.length ? props.selectedScheduledOrders : props.currentSelected ? [props.currentSelected] : []
})

const primaryOrder = computed(() => reportSelections.value[0]?.order ?? null)
const selectionSignature = computed(() => reportSelections.value.map((item) => `${item.order.dbId ?? item.order.id}:${item.instrument.id}:${item.instrument.sn}`).join('|'))
const orderNos = computed(() => Array.from(new Set(reportSelections.value.map((item) => item.order.no))).join(' / ') || '-')
const applicantNames = computed(() => Array.from(new Set(reportSelections.value.map((item) => item.order.applicant).filter(Boolean))).join(' / ') || '-')
const instruments = computed(() => reportSelections.value.map((item) => `${item.instrument.label} ${item.instrument.sn}`).join(', ') || '-')
const allFilesDone = computed(() => Object.values(fileStatuses.value).every((status) => status === 'done'))
const savePath = computed(() => props.exportedCaptureDir || '未获取到保存目录，请先完成视频识别结果保存')
const savedFiles = [
  { icon: '📊', name: '高温高压监控数据.csv' },
  { icon: '📈', name: '高温高压测试结果曲线.png' },
  { icon: '📄', name: '高温高压测试报告.doc' },
  { icon: '🗂', name: 'JSON 配置文件' },
]
const shutdownItems = [
  '确定配电柜总电源开关关闭',
  '确保卸压阀处于开启状态',
  '确认高压管线及接头无泄漏、无异常',
  '确认测试台及周边环境已清理完毕',
  '填写并保存本次设备运转结束记录',
]
const shutdownReady = computed(() => shutdownChecks.value.every(Boolean) && !!shiftHours.value && !!taskSummary.value.trim())
const instrumentRows = computed(() => reportSelections.value.map((selection) => {
  const key = getInstrumentKey(selection)
  const state = instrumentResultMap.value[key] || { result: 'pass' as HighTempPressureReportResult, observation: '' }
  return { key, selection, state }
}))
const overallResult = computed<HighTempPressureReportResult>(() => {
  const results = instrumentRows.value.map((row) => row.state.result)
  if (results.includes('fail')) return 'fail'
  if (!results.length || results.includes('pending')) return 'pending'
  return 'pass'
})

const statusText = (status: FileStatus) => {
  if (status === 'done') return '✓ 已生成'
  if (status === 'generating') return '⟳ 生成中...'
  return '待生成'
}

const resultText = (result: HighTempPressureReportResult) => {
  if (result === 'pass') return '合格'
  if (result === 'fail') return '不合格'
  return '待定'
}

const todayText = () => {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const normalizeCopyCount = (value: number, fallback: number, min: number) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(min, Math.floor(numeric))
}

const createClientSubmitId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `htp-${crypto.randomUUID()}`
  }
  return `htp-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

async function buildCurveChartUploadFile() {
  const bytes = await readFile(activeCurveChartImagePath.value)
  return {
    fieldName: 'testing_curve',
    fileName: '高温高压测试结果曲线.png',
    blob: new Blob([bytes], { type: 'image/png' }),
  }
}

function getInstrumentKey(selection: ScheduledSelection) {
  return `${selection.order.dbId ?? selection.order.id}:${selection.instrument.id}:${selection.instrument.sn}`
}

function resetReportStateForSelections() {
  clientSubmitId.value = createClientSubmitId()
  submittedReportNo.value = ''
  uploadCompleted.value = false
  const next: Record<string, InstrumentResultState> = {}
  reportSelections.value.forEach((selection) => {
    const key = getInstrumentKey(selection)
    next[key] = instrumentResultMap.value[key] || { result: 'pass', observation: '' }
  })
  instrumentResultMap.value = next
}

onMounted(() => {
  resetReportStateForSelections()
  const steps: Array<[FileKey, number]> = [
    ['csv', 250],
    ['chart', 1300],
    ['report', 2400],
  ]
  steps.forEach(([key, delay], index) => {
    window.setTimeout(() => {
      fileStatuses.value[key] = 'generating'
    }, delay)
    window.setTimeout(() => {
      fileStatuses.value[key] = 'done'
      if (index === steps.length - 1) ElMessage.success('所有文件生成完成，请填写报告信息')
    }, delay + 850)
  })
})

watch(selectionSignature, () => {
  if (!uploadCompleted.value) resetReportStateForSelections()
})
watch(runtimeHours, (value) => {
  shiftHours.value = value
}, { immediate: true })

const submitReport = async () => {
  if (!reportSelections.value.length) {
    ElMessage.warning('未找到本次测试的仪器')
    return
  }
  if (!instrumentRows.value.every((row) => !!row.state.result)) {
    ElMessage.warning('请选择每台仪器的试验结论')
    return
  }
  if (!observation.value.trim()) {
    ElMessage.warning('请填写试验观察记录')
    return
  }
  if (!operatorName.value.trim() || !reviewerName.value.trim()) {
    ElMessage.warning('请填写操作员和复核人姓名')
    return
  }
  if (!confirmChecks.value.every(Boolean)) {
    ElMessage.warning('请勾选所有确认项')
    return
  }
  if (!activeCurveChartImagePath.value) {
    if (!props.ensureCurveChartImage) {
      ElMessage.warning('未生成温度/压力测试曲线图，不能上传报告')
      return
    }
    try {
      generatedCurveChartImagePath.value = await props.ensureCurveChartImage()
      ElMessage.success('已生成温度/压力测试曲线图')
    } catch (error) {
      ElMessage.warning(error instanceof Error ? error.message : '未生成温度/压力测试曲线图，不能上传报告')
      return
    }
  }
  const curveCopies = normalizeCopyCount(paperReportChecks.value.testingCurveCopies, 2, 1)
  const otherCopies = normalizeCopyCount(paperReportChecks.value.otherCopies, 5, 0)
  if (curveCopies !== paperReportChecks.value.testingCurveCopies) {
    paperReportChecks.value.testingCurveCopies = curveCopies
  }
  if (otherCopies !== paperReportChecks.value.otherCopies) {
    paperReportChecks.value.otherCopies = otherCopies
  }
  ElMessage.success('测试报告已生成，请确认保存并上传')
  showFileSaveModal.value = true
}

const finishReportUpload = async () => {
  if (uploadSubmitting.value) return
  const authOk = await initAuth()
  if (!authOk) {
    ElMessage.error('未登录或登录已失效，无法上传报告')
    return
  }
  const orderIds = Array.from(new Set(reportSelections.value.map((item) => item.order.dbId).filter((id): id is number => typeof id === 'number')))
  if (!orderIds.length) {
    ElMessage.error('未找到工单ID，无法上传报告')
    return
  }
  const testingCurveCopies = normalizeCopyCount(paperReportChecks.value.testingCurveCopies, 2, 1)
  const otherCopies = normalizeCopyCount(paperReportChecks.value.otherCopies, 5, 0)
  uploadSubmitting.value = true
  try {
    const payload = {
      task_number: orderNos.value,
      test_date: todayText(),
      tester: operatorName.value.trim(),
      status: 0,
      overall_result: overallResult.value,
      order_ids: orderIds,
      order_numbers: Array.from(new Set(reportSelections.value.map((item) => item.order.no).filter(Boolean))),
      instrument_results: instrumentRows.value.map(({ selection, state }) => ({
        order_id: selection.order.dbId,
        order_no: selection.order.no,
        instrument_id: selection.instrument.dbId ?? selection.instrument.id,
        instrument_name: selection.instrument.label,
        instrument_sn: selection.instrument.sn,
        result: state.result,
        result_text: resultText(state.result),
        observation: state.observation || observation.value,
        metrics: {
          target_temp: selection.order.targetTemp,
          target_pressure: selection.order.targetPressure,
          keep_condition: selection.order.keepCondition,
        },
        attachments: [],
      })),
      report_json: {
        source: 'cosl-operator-tauri',
        module: 'high-temp-pressure',
        capture_dir: props.exportedCaptureDir,
        csv_count: props.csvCount,
        curve_chart_path: activeCurveChartImagePath.value,
        curve_point_count: props.curvePointCount,
        curve_phases: ['升温升压', '保温保压', '降温降压'],
        operator_name: operatorName.value.trim(),
        reviewer_name: reviewerName.value.trim(),
        observation: observation.value.trim(),
        confirm_checks: confirmChecks.value,
        paper_report: {
          ref_no: 'WT3-TCZZ-21-R01',
          title: 'High Temperature & High Pressure Testing Report',
          testing_organization: 'COSL',
          testing_item_information: {
            name: instruments.value,
            quantity: reportSelections.value.length,
            no: orderNos.value,
          },
          testing_requirements: {
            testing_pressure: primaryOrder.value?.targetPressure || '',
            testing_temperature: primaryOrder.value?.targetTemp || '',
            hold_time: primaryOrder.value?.keepCondition || '',
            online_test: paperReportChecks.value.onlineTest,
            other_requirements: paperReportChecks.value.otherRequirements,
          },
          fittings_provided: {
            testing_protective_cap: paperReportChecks.value.testingProtectiveCapProvider,
            testing_plug: paperReportChecks.value.testingPlugProvider,
          },
          testing_result: {
            appearance_inspection: {
              no_distorted: paperReportChecks.value.noDistorted,
              no_obvious_leakage: paperReportChecks.value.noLeakage,
            },
            testing_curve: paperReportChecks.value.curveStatus,
            other_descriptions: paperReportChecks.value.otherDescriptions,
          },
          attachments: {
            testing_curve: {
              copies: testingCurveCopies,
              local_path: activeCurveChartImagePath.value,
            },
            others: {
              copies: otherCopies,
            },
          },
        },
        submitted_at: new Date().toISOString(),
      },
      attachments: [
        { type: 'capture_dir', name: '视频识别结果目录', local_path: props.exportedCaptureDir },
      ].filter((item) => item.local_path),
      remark: observation.value.trim(),
      client_submit_id: clientSubmitId.value,
    }
    let res
    try {
      const curveFile = await buildCurveChartUploadFile()
      res = await createHighTempPressureReportWithFiles(payload, [curveFile], getAuthHeaders())
    } catch (error) {
      ElMessage.warning('测试曲线文件读取失败，已改为提交本地路径附件')
      res = await createHighTempPressureReport(
        {
          ...payload,
          attachments: [
            ...(payload.attachments || []),
            { type: 'testing_curve', name: '高温高压测试结果曲线.png', local_path: activeCurveChartImagePath.value, copies: testingCurveCopies },
          ],
        },
        getAuthHeaders()
      )
    }
    if (!res.success || !res.data || res.data.code !== 0) {
      throw new Error(res.data?.msg || res.error || '报告上传失败')
    }
    submittedReportNo.value = res.data.data?.report_no || ''
    showFileSaveModal.value = false
    uploadCompleted.value = true
    ElMessage.success(`报告已提交管理端${submittedReportNo.value ? `：${submittedReportNo.value}` : ''}，等待审核`)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '报告上传失败，请稍后重试')
  } finally {
    uploadSubmitting.value = false
  }
}

const finishShutdown = () => {
  if (!shiftHours.value) {
    ElMessage.warning('请填写本班运转时间')
    return
  }
  if (!taskSummary.value.trim()) {
    ElMessage.warning('请填写主要完成任务')
    return
  }
  if (!shutdownChecks.value.every(Boolean)) {
    ElMessage.warning('请完成全部关机检查项')
    return
  }
  ElMessage.success('设备关机检查完成，本次测试任务全部结束')
  emit('shutdown-complete')
}
</script>

<template>
  <div class="panel report-panel">
    <div class="step-indicator">
      <div class="step done"><div class="step-circle">✓</div><span class="step-label">数据看板</span></div>
      <div class="step-line done"></div>
      <div class="step done"><div class="step-circle">✓</div><span class="step-label">设备检测</span></div>
      <div class="step-line done"></div>
      <div class="step done"><div class="step-circle">✓</div><span class="step-label">启动</span></div>
      <div class="step-line done"></div>
      <div class="step done"><div class="step-circle">✓</div><span class="step-label">正式测试</span></div>
      <div class="step-line done"></div>
      <div class="step" :class="uploadCompleted ? 'done' : 'active'"><div class="step-circle">{{ uploadCompleted ? '✓' : '5' }}</div><span class="step-label">报告生成</span></div>
      <div class="step-line" :class="{ done: uploadCompleted }"></div>
      <div class="step" :class="{ active: uploadCompleted }"><div class="step-circle">6</div><span class="step-label">关机检查</span></div>
    </div>

    <div v-if="!uploadCompleted" class="two-col report-layout">
      <div class="card">
        <div class="card-header"><div class="card-title">📁 测试文件生成进度</div></div>
        <div class="file-gen-list">
          <div class="file-gen-item">
            <div class="file-gen-icon csv">📊</div>
            <div class="file-gen-info"><div class="file-gen-name">高温高压监控数据.csv</div><div class="file-gen-desc">测试数据记录文件 · {{ csvCount }} 条</div></div>
            <div class="file-gen-status" :class="fileStatuses.csv">{{ statusText(fileStatuses.csv) }}</div>
          </div>
          <div class="file-gen-item">
            <div class="file-gen-icon png">📈</div>
            <div class="file-gen-info"><div class="file-gen-name">高温高压测试结果曲线.png</div><div class="file-gen-desc">测试曲线图表文件</div></div>
            <div class="file-gen-status" :class="fileStatuses.chart">{{ statusText(fileStatuses.chart) }}</div>
          </div>
          <div class="file-gen-item">
            <div class="file-gen-icon doc">📄</div>
            <div class="file-gen-info"><div class="file-gen-name">高温高压测试报告.doc</div><div class="file-gen-desc">正式测试报告文档</div></div>
            <div class="file-gen-status" :class="fileStatuses.report">{{ statusText(fileStatuses.report) }}</div>
          </div>
        </div>
        <div v-if="exportedCaptureDir" class="report-save-path">视频识别结果：{{ exportedCaptureDir }}</div>
      </div>

      <div class="card report-form-card">
        <div class="card-header">
          <div class="card-title">✍ 填写测试报告信息 <span>工单编号: {{ orderNos }}</span></div>
        </div>
        <div class="card-body report-form-body">
          <div class="report-section">
            <div class="report-section-title">基本信息（自动填写）</div>
            <div class="form-row">
              <div class="form-group"><div class="form-label">工单编号</div><input class="form-control report-readonly" :value="orderNos" readonly /></div>
              <div class="form-group"><div class="form-label">测试申请人</div><input class="form-control report-readonly" :value="applicantNames" readonly /></div>
            </div>
            <div class="form-row">
              <div class="form-group"><div class="form-label">试验温度</div><input class="form-control report-readonly" :value="primaryOrder?.targetTemp || '-'" readonly /></div>
              <div class="form-group"><div class="form-label">试验压力</div><input class="form-control report-readonly" :value="primaryOrder?.targetPressure || '-'" readonly /></div>
            </div>
            <div class="form-group"><div class="form-label">保温保压时间</div><input class="form-control report-readonly" :value="primaryOrder?.keepCondition || '-'" readonly /></div>
            <div class="form-group"><div class="form-label">试件信息</div><input class="form-control report-readonly" :value="instruments" readonly /></div>
          </div>

          <div class="report-section">
            <div class="report-section-title">试验结果 <span>*</span></div>
            <div class="instrument-result-table">
              <div class="instrument-result-head">
                <span>工单</span>
                <span>仪器</span>
                <span>SN</span>
                <span>结论</span>
                <span>单台观察记录</span>
              </div>
              <div v-for="row in instrumentRows" :key="row.key" class="instrument-result-row">
                <span>{{ row.selection.order.no }}</span>
                <span>{{ row.selection.instrument.label }}</span>
                <span>{{ row.selection.instrument.sn || '-' }}</span>
                <select v-model="row.state.result" class="form-control result-select">
                  <option value="pass">合格</option>
                  <option value="fail">不合格</option>
                  <option value="pending">待定</option>
                </select>
                <input
                  v-model="row.state.observation"
                  class="form-control"
                  placeholder="可填写该仪器异常或补充说明"
                />
              </div>
            </div>
            <div class="overall-result">
              总体结论：<b :class="`result-${overallResult}`">{{ resultText(overallResult) }}</b>
            </div>
            <div class="form-group">
              <div class="form-label">试验观察记录 <span class="req">*</span></div>
              <textarea
                v-model="observation"
                class="form-control"
              rows="4"
                placeholder="详细记录测试过程中的观察情况，包括升温升压过程、保温保压阶段、降温降压过程、仪器外观变化、异常情况说明..."
              ></textarea>
            </div>
          </div>

          <div class="report-section">
            <div class="report-section-title">图纸要求检查项 <span>*</span></div>
            <div class="paper-report-grid">
              <label class="paper-check">
                <input v-model="paperReportChecks.onlineTest" type="checkbox" />
                <span>在线测试 Online Test</span>
              </label>
              <label class="paper-check">
                <input v-model="paperReportChecks.noDistorted" type="checkbox" />
                <span>外观检查：未变形 No Distorted</span>
              </label>
              <label class="paper-check">
                <input v-model="paperReportChecks.noLeakage" type="checkbox" />
                <span>外观检查：无明显泄漏 No Obvious Leakage</span>
              </label>
              <div class="paper-field">
                <div class="form-label">试压护帽提供方</div>
                <select v-model="paperReportChecks.testingProtectiveCapProvider" class="form-control">
                  <option value="applicant">委托方提供 Provided by Applicant</option>
                  <option value="tester">检测方提供 Provided by Tester</option>
                </select>
              </div>
              <div class="paper-field">
                <div class="form-label">试压堵头提供方</div>
                <select v-model="paperReportChecks.testingPlugProvider" class="form-control">
                  <option value="applicant">委托方提供 Provided by Applicant</option>
                  <option value="tester">检测方提供 Provided by Tester</option>
                </select>
              </div>
              <div class="paper-field">
                <div class="form-label">测试曲线判断</div>
                <select v-model="paperReportChecks.curveStatus" class="form-control">
                  <option value="normal">测试曲线正常 Testing Curve Normal</option>
                  <option value="abnormal">测试曲线异常 Testing Curve Abnormal</option>
                </select>
              </div>
              <div class="paper-field">
                <div class="form-label">测试曲线附件份数</div>
                <input v-model.number="paperReportChecks.testingCurveCopies" class="form-control" type="number" min="1" />
              </div>
              <div class="paper-field">
                <div class="form-label">其他附件份数</div>
                <input v-model.number="paperReportChecks.otherCopies" class="form-control" type="number" min="0" />
              </div>
              <div class="paper-field is-wide">
                <div class="form-label">其他要求</div>
                <input v-model="paperReportChecks.otherRequirements" class="form-control" placeholder="无" />
              </div>
              <div class="paper-field is-wide">
                <div class="form-label">其他描述</div>
                <input v-model="paperReportChecks.otherDescriptions" class="form-control" placeholder="无" />
              </div>
            </div>
            <div class="curve-file-hint" :class="{ ok: activeCurveChartImagePath }">
              温度/压力曲线图：{{ activeCurveChartImagePath || '未生成' }}（采样点 {{ curvePointCount }} 个）
            </div>
          </div>

          <div class="report-section">
            <div class="report-section-title">操作人员信息 <span>*</span></div>
            <div class="form-row">
              <div class="form-group"><div class="form-label">操作员姓名 <span class="req">*</span></div><input v-model="operatorName" class="form-control" placeholder="请输入操作员姓名" /></div>
              <div class="form-group"><div class="form-label">复核人姓名 <span class="req">*</span></div><input v-model="reviewerName" class="form-control" placeholder="请输入复核人姓名" /></div>
            </div>
          </div>

          <div class="report-section">
            <div class="report-section-title">其他确认项 <span>*</span></div>
            <div class="confirm-checks">
              <label v-for="(label, index) in ['确认测试数据已完整记录', '确认测试仪器已按规范操作', '确认所有安全规程已遵守', '确认测试环境符合要求']" :key="label" class="conf-item">
                <input v-model="confirmChecks[index]" type="checkbox" />
                {{ label }}
              </label>
            </div>
          </div>
        </div>
        <div class="report-actions">
          <button class="btn btn-success" :disabled="!allFilesDone || uploadSubmitting" @click="submitReport">✓ 确认生成报告</button>
        </div>
      </div>
    </div>

    <div v-else class="card shutdown-card">
      <div class="card-header">
        <div>
          <div class="card-title">🔌 设备运转结束后检查</div>
          <div class="shutdown-subtitle">报告文件已保存并上传，请完成以下检查后结束本次任务。</div>
        </div>
        <span class="shutdown-progress">{{ shutdownChecks.filter(Boolean).length }}/{{ shutdownChecks.length }}</span>
      </div>
      <div class="card-body shutdown-scroll-body">
        <div class="shutdown-success">✅ 报告已提交管理端待审核，请确认设备处于正常关闭状态。</div>
        <div class="shutdown-meta">
          <span>报告编号: {{ submittedReportNo || '-' }}</span>
          <span>检查日期: {{ new Date().toLocaleDateString() }}</span>
          <span>操作者: {{ operatorName || '-' }}</span>
          <span>复核人: {{ reviewerName || '-' }}</span>
        </div>
        <div class="shutdown-check-list">
          <label v-for="(item, index) in shutdownItems" :key="item" class="shutdown-check-item" :class="{ checked: shutdownChecks[index] }">
            <input v-model="shutdownChecks[index]" type="checkbox" />
            <span class="shutdown-check-num">{{ index + 1 }}</span>
            <span>{{ item }}</span>
          </label>
        </div>
        <div class="shutdown-form-grid">
          <div class="form-group">
            <div class="form-label">本班运转时间（小时）<span class="req">*</span></div>
            <input v-model="shiftHours" class="form-control report-readonly" type="number" min="0" step="0.01" readonly />
          </div>
          <div class="form-group">
            <div class="form-label">设备总运转时间（小时）</div>
            <input class="form-control report-readonly" :value="totalHours" readonly />
          </div>
        </div>
        <div class="form-group">
          <div class="form-label">主要完成任务 <span class="req">*</span></div>
          <textarea v-model="taskSummary" class="form-control" rows="3" placeholder="填写本次测试完成情况、设备状态、异常说明等"></textarea>
        </div>
      </div>
      <div class="report-actions">
        <button class="btn btn-success" :disabled="!shutdownReady" @click="finishShutdown">完成关机检查</button>
      </div>
    </div>

    <div v-if="showFileSaveModal" class="modal-overlay report-modal-overlay" @click.self="showFileSaveModal = false">
      <div class="modal report-save-modal">
        <div class="modal-header modal-header-row">
          <span>📁 保存测试报告文件</span>
          <button class="modal-close-btn" @click="showFileSaveModal = false">×</button>
        </div>
        <div class="modal-body">
          <div class="save-alert">报告文件已生成完毕，保存目录沿用前一步选择的文件夹，请确认文件清单后上传。</div>
          <div class="form-group">
          <div class="form-label">文件保存路径</div>
            <input class="form-control report-readonly" :value="savePath" readonly />
          </div>
          <div class="save-file-title">包含文件</div>
          <div class="save-file-list">
            <div v-for="file in savedFiles" :key="file.name" class="save-file-row">
              <span class="save-file-icon">{{ file.icon }}</span>
              <span>{{ file.name }}</span>
              <span class="save-file-badge">已生成</span>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" @click="showFileSaveModal = false">稍后保存</button>
          <button class="btn btn-success" :disabled="uploadSubmitting" @click="finishReportUpload">
            {{ uploadSubmitting ? '上传中...' : '确认保存并上传' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="./high-temp-pressure.shared.css"></style>
<style scoped>
.report-panel {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow: hidden;
}

.report-layout {
  align-items: flex-start;
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding-right: 4px;
}

.step-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-bg-secondary);
  flex-shrink: 0;
}

.step {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--color-text-tertiary);
  font-size: 12px;
  white-space: nowrap;
}

.step-circle {
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--color-bg-tertiary);
  color: var(--color-text-tertiary);
  font-size: 12px;
  font-weight: 700;
}

.step.done,
.step.active {
  color: var(--color-text-primary);
}

.step.done .step-circle {
  background: rgba(16, 185, 129, 0.14);
  color: var(--green-bright);
}

.step.active .step-circle {
  background: var(--color-accent-blue);
  color: #fff;
}

.step-line {
  flex: 1;
  min-width: 16px;
  height: 1px;
  background: var(--color-border);
}

.step-line.done {
  background: rgba(16, 185, 129, 0.35);
}

.file-gen-list {
  display: flex;
  flex-direction: column;
}

.file-gen-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--color-border);
}

.file-gen-item:last-child {
  border-bottom: 0;
}

.file-gen-icon {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  background: var(--color-bg-tertiary);
}

.file-gen-info {
  flex: 1;
  min-width: 0;
}

.file-gen-name {
  color: var(--color-text-primary);
  font-size: 13px;
  font-weight: 600;
}

.file-gen-desc {
  margin-top: 2px;
  color: var(--color-text-tertiary);
  font-size: 11px;
}

.file-gen-status {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
}

.file-gen-status.pending {
  color: var(--color-text-tertiary);
}

.file-gen-status.generating {
  color: var(--orange);
}

.file-gen-status.done {
  color: var(--color-accent-blue);
}

.report-save-path {
  padding: 10px 16px 14px;
  color: var(--color-accent-blue);
  font-size: 12px;
  word-break: break-all;
}

.report-form-card .card-title span {
  margin-left: 8px;
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 400;
}

.report-form-body {
  max-height: 520px;
  overflow-y: auto;
}

.report-section {
  padding-bottom: 14px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--color-border);
}

.report-section:last-child {
  margin-bottom: 0;
  border-bottom: 0;
}

.report-section-title {
  margin-bottom: 10px;
  color: var(--color-text-primary);
  font-size: 13px;
  font-weight: 700;
}

.report-section-title span,
.req {
  color: var(--red);
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.form-group {
  margin-bottom: 12px;
}

.form-label {
  margin-bottom: 5px;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 500;
}

.form-control {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  font-size: 12px;
}

.report-readonly {
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
}

.instrument-result-table {
  display: grid;
  gap: 6px;
  margin-bottom: 12px;
}

.instrument-result-head,
.instrument-result-row {
  display: grid;
  grid-template-columns: 1.1fr 1fr 1fr 96px 1.6fr;
  gap: 8px;
  align-items: center;
}

.instrument-result-head {
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.instrument-result-row {
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text-primary);
  font-size: 12px;
}

.result-select {
  min-width: 86px;
}

.overall-result {
  margin-bottom: 12px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.overall-result b {
  margin-left: 4px;
}

.paper-report-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 12px;
}

.paper-check,
.paper-field {
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-primary);
}

.paper-check {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 12px;
  line-height: 1.5;
}

.paper-check input {
  flex-shrink: 0;
}

.paper-check:has(input:checked) {
  border-color: rgba(16, 185, 129, 0.35);
  background: rgba(16, 185, 129, 0.07);
  color: var(--color-text-primary);
}

.paper-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.paper-field.is-wide {
  grid-column: 1 / -1;
}

.paper-field .form-label {
  margin-bottom: 0;
}

.curve-file-hint {
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px dashed rgba(245, 127, 23, 0.42);
  border-radius: 8px;
  background: rgba(245, 127, 23, 0.08);
  color: var(--orange);
  font-size: 12px;
  line-height: 1.5;
  word-break: break-all;
}

.curve-file-hint.ok {
  border-color: rgba(16, 185, 129, 0.36);
  background: rgba(16, 185, 129, 0.08);
  color: var(--green-bright);
}

.result-pass {
  color: var(--green-bright);
}

.result-fail {
  color: var(--red);
}

.result-pending {
  color: var(--orange);
}

.radio-group {
  display: flex;
  gap: 8px;
}

.radio-option {
  border: 1px solid var(--color-border);
  border-radius: 20px;
  background: var(--color-bg-primary);
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: 6px 16px;
  font-size: 12px;
}

.radio-option.selected-pass {
  background: rgba(46, 125, 50, 0.1);
  border-color: var(--green-bright);
  color: var(--green-bright);
}

.radio-option.selected-fail {
  background: rgba(198, 40, 40, 0.1);
  border-color: var(--red);
  color: var(--red);
}

.radio-option.selected-pending {
  background: rgba(245, 127, 23, 0.1);
  border-color: var(--orange);
  color: var(--orange);
}

.confirm-checks {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.conf-item {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.report-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  flex-shrink: 0;
}

.report-actions .btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.report-modal-overlay {
  position: fixed;
  z-index: 2000;
}

.report-save-modal {
  width: 460px;
  max-width: calc(100vw - 32px);
}

.modal-close-btn {
  width: 28px;
  height: 28px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-primary);
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
}

.modal-close-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.save-alert {
  padding: 10px 12px;
  margin-bottom: 14px;
  border: 1px solid rgba(88, 166, 255, 0.2);
  border-radius: 8px;
  background: rgba(88, 166, 255, 0.08);
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.save-file-title {
  margin: 12px 0 8px;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.save-file-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.save-file-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  font-size: 12px;
}

.save-file-icon {
  width: 20px;
  text-align: center;
}

.save-file-badge {
  margin-left: auto;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(88, 166, 255, 0.12);
  color: var(--color-accent-blue);
  font-size: 11px;
  font-weight: 700;
}

.shutdown-card {
  margin-top: 14px;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.shutdown-scroll-body {
  min-height: 0;
  overflow-y: auto;
  padding-right: 18px;
  scrollbar-gutter: stable;
}

.shutdown-scroll-body::-webkit-scrollbar,
.report-layout::-webkit-scrollbar,
.report-form-body::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.shutdown-scroll-body::-webkit-scrollbar-track,
.report-layout::-webkit-scrollbar-track,
.report-form-body::-webkit-scrollbar-track {
  background: transparent;
}

.shutdown-scroll-body::-webkit-scrollbar-thumb,
.report-layout::-webkit-scrollbar-thumb,
.report-form-body::-webkit-scrollbar-thumb {
  background: var(--color-scrollbar);
  border-radius: 999px;
}

.shutdown-subtitle {
  margin-top: 3px;
  color: var(--color-text-tertiary);
  font-size: 12px;
  font-weight: 400;
}

.shutdown-progress {
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.shutdown-success {
  padding: 10px 12px;
  margin-bottom: 12px;
  border: 1px solid rgba(88, 166, 255, 0.18);
  border-radius: 8px;
  background: rgba(88, 166, 255, 0.08);
  color: var(--color-accent-blue);
  font-size: 12px;
  font-weight: 600;
}

.shutdown-meta {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 12px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.shutdown-check-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 14px;
}

.shutdown-check-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg-primary);
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 13px;
}

.shutdown-check-item:hover {
  background: var(--color-bg-hover);
}

.shutdown-check-item.checked {
  border-color: rgba(88, 166, 255, 0.28);
  background: rgba(88, 166, 255, 0.06);
  color: var(--color-text-primary);
}

.shutdown-check-num {
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--color-bg-tertiary);
  color: var(--color-text-tertiary);
  font-size: 11px;
  font-weight: 700;
}

.shutdown-check-item.checked .shutdown-check-num {
  background: rgba(88, 166, 255, 0.15);
  color: var(--color-accent-blue);
}

.shutdown-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.shutdown-card .report-actions {
  box-shadow: 0 -8px 18px rgba(15, 23, 42, 0.04);
}

@media (max-width: 900px) {
  .paper-report-grid,
  .shutdown-meta,
  .shutdown-form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
