<script setup lang="ts">
import { ref } from 'vue'
import { Icon } from '@iconify/vue'
import type {
  DevCheckItem,
  ReportFile,
  ShutdownCheckItem,
  Stage,
  VibrationAnalysisSummary,
  VibrationCaptureRecord,
  WorkOrder,
} from '../types'

const props = defineProps<{
  stage: Stage
  stepList: ReadonlyArray<{ id: Stage; label: string }>
  devCheckItems: DevCheckItem[]
  devCheckDoneCount: number
  devCheckProgressPct: number
  devCheckAllAnswered: boolean
  devCheckInvalidNoRemark: boolean
  currentWorkOrder: WorkOrder | null
  calStep: 'amp' | 'dur'
  liveLevel: string
  liveFreq: string
  vibDataCount: number
  formattedDuration: string
  isRunning: boolean
  isPaused: boolean
  isFinalizing: boolean
  liveFileName: string
  liveAx: string
  liveAy: string
  liveAz: string
  testMode: 'formal' | 'pre'
  videoReady: boolean
  backendProcessingRequired: boolean
  videoFileName: string
  videoUrl: string
  videoDurationText: string
  sampleIntervalSeconds: number
  captureStatusText: string
  captureProgressPct: number
  latestCaptureUrl: string
  analysisCompleted: boolean
  sessionStarted: boolean
  analysisSummary: VibrationAnalysisSummary | null
  analysisPreviewRecords: VibrationCaptureRecord[]
  reportProgress: number
  reportFiles: ReportFile[]
  fileGenRunning: boolean
  allFilesDone: boolean
  shutdownChecks: ShutdownCheckItem[]
}>()

const emit = defineEmits<{
  'back-to-dashboard': []
  'set-dev-check-answer': [id: number, answer: 'yes' | 'no']
  'submit-dev-check': []
  'reset-dev-check': []
  'go-prev-stage': []
  'go-next-stage': []
  'set-cal-step': [step: 'amp' | 'dur']
  'select-video': []
  'import-video-path': [path: string]
  'clear-video': []
  'start-vib-test': []
  'pause-vib-test': []
  'resume-vib-test': []
  'open-abort-warning': []
  'end-vib-test': []
  'convert-to-formal': []
  'set-stage-testing': []
  'set-stage-shutdown': []
  'start-file-gen': []
  'toggle-shutdown-check': [id: number]
  'finish-shutdown': []
}>()

const uploadDragging = ref(false)
const woDetailOpen = ref(false)

const currentTestInstruments = () =>
  props.currentWorkOrder?.selectedInstruments?.length
    ? props.currentWorkOrder.selectedInstruments
    : props.currentWorkOrder?.instruments || []

const displayValue = (value: unknown) => {
  if (value === undefined || value === null || value === '') return '-'
  return String(value)
}

const maskPhone = (phone?: string) => {
  if (!phone) return '-'
  return phone.length >= 7 ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : phone
}

const durationText = (duration?: number) => duration ? `${duration} 分钟` : '-'

const openWODetail = () => {
  if (!props.currentWorkOrder) return
  woDetailOpen.value = true
}

const closeWODetail = () => {
  woDetailOpen.value = false
}

function handleUploadDragOver(event: DragEvent) {
  event.preventDefault()
  uploadDragging.value = true
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
}

function handleUploadDragLeave(event: DragEvent) {
  event.preventDefault()
  uploadDragging.value = false
}

function handleUploadDrop(event: DragEvent) {
  event.preventDefault()
  uploadDragging.value = false
  const file = event.dataTransfer?.files?.[0] as File & { path?: string }
  const droppedPath = String(file?.path || '').trim()
  if (droppedPath) {
    emit('import-video-path', droppedPath)
    return
  }
  emit('select-video')
}
</script>

<template>
  <div class="vibration-flow">
    <div class="stepbar">
      <span
        v-for="s in stepList"
        :key="s.id"
        class="step-chip"
        :class="{ active: stage === s.id }"
      >
        {{ s.label }}
      </span>
    </div>

    <div class="flow-container">
      <div v-if="stage === 'devcheck'" class="panel-card">
        <div class="modal-overlay open">
          <div class="startup-check-modal">
            <h2 class="modal-title">开机检查</h2>
            <div class="check-list-container">
              <div class="check-list">
                <label v-for="item in devCheckItems" :key="item.id" class="check-item" :class="{ 'is-checked': item.answer === 'yes' }">
                  <div class="checkbox-wrapper">
                    <input type="checkbox" :checked="item.answer === 'yes'" @change="emit('set-dev-check-answer', item.id, ($event.target as HTMLInputElement).checked ? 'yes' : 'no')" />
                    <div class="custom-checkbox">
                      <Icon v-if="item.answer === 'yes'" icon="mdi:check" />
                    </div>
                  </div>
                  <span class="check-text">{{ item.text }}</span>
                </label>
              </div>
            </div>
            <div class="modal-actions">
              <button class="cancel-btn" @click="emit('back-to-dashboard')">取消</button>
              <button class="next-btn" @click="emit('submit-dev-check')">下一步</button>
            </div>
          </div>
        </div>
        <div class="panel-header">
          <span class="panel-title">设备运转前检查（{{ devCheckDoneCount }} / {{ devCheckItems.length }}）</span>
          <span class="badge">{{ devCheckProgressPct }}%</span>
        </div>

        <div class="progress-wrap">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: `${devCheckProgressPct}%` }"></div>
          </div>
          <div class="progress-tip">检查完成进度: {{ devCheckDoneCount }}/{{ devCheckItems.length }}</div>
        </div>

        <div class="check-list">
          <div
            v-for="item in devCheckItems"
            :key="item.id"
            class="check-item"
            :class="{ ok: item.answer === 'yes', bad: item.answer === 'no' }"
          >
            <div class="check-row">
              <div class="check-num">{{ item.id }}</div>
              <div class="check-text">{{ item.text }}</div>
              <div class="check-actions">
                <button class="mini-btn" :class="{ active: item.answer === 'yes' }" @click="emit('set-dev-check-answer', item.id, 'yes')">是</button>
                <button class="mini-btn danger" :class="{ active: item.answer === 'no' }" @click="emit('set-dev-check-answer', item.id, 'no')">否</button>
              </div>
            </div>
            <div v-if="item.answer === 'no'" class="remark">
              <input v-model="item.remark" class="remark-input" type="text" placeholder="请填写备注（必填）" />
            </div>
          </div>
        </div>

        <div class="panel-footer">
          <button class="btn btn-secondary" @click="emit('reset-dev-check')">重置</button>
          <button class="btn btn-primary" :disabled="!devCheckAllAnswered || devCheckInvalidNoRemark" @click="emit('submit-dev-check')">
            确认完成检查，进入下一步
          </button>
        </div>
      </div>

      <div v-else-if="stage === 'start'" class="modal-overlay">
        <div class="startup-check-modal">
          <h2 class="modal-title">重要安全提示</h2>
          <div class="content-pad two-col-modal">
            <div class="left-col">
              <div class="alert warning">
                <Icon icon="mdi:alert" class="alert-icon" />
                <div class="alert-text">
                  <div class="alert-title">启动前确认</div>
                  <ul class="alert-list">
                    <li>请确认已完成设备运转前检查</li>
                    <li>确认试件安装牢固，工具已清理</li>
                    <li>确认工作区域无人员</li>
                    <li>确认振动传感器安装牢固</li>
                    <li>启动后请勿随意中断测试程序</li>
                  </ul>
                </div>
              </div>
            </div>
            <div class="right-col">
              <div class="card-block">
                <div class="block-title">当前工单详情</div>
                <div class="kv">
                  <div class="k">工单号</div><div class="v">{{ currentWorkOrder?.id }}</div>
                  <div class="k">设备名称</div><div class="v">{{ currentWorkOrder?.device }}</div>
                  <div class="k">振动量级</div><div class="v">{{ currentWorkOrder?.level }}</div>
                  <div class="k">测试时长</div><div class="v">{{ currentWorkOrder?.duration }} 分钟</div>
                  <div class="k">测试类型</div><div class="v">{{ currentWorkOrder?.type }}</div>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-actions">
            <button class="cancel-btn" @click="emit('go-prev-stage')">返回</button>
            <button class="next-btn" @click="emit('go-next-stage')">确认启动振动台</button>
          </div>
        </div>
      </div>

      <div v-else-if="stage === 'calibration'" class="panel-card test-panel-full">
        <div v-if="calStep === 'amp'" class="cal-layout">
          <div class="cal-main">
            <div class="cal-title">振级校验</div>
            <div class="video-upload-card">
              <div v-if="videoReady" class="video-upload-toolbar">
                <button class="btn btn-secondary" type="button" @click="emit('clear-video')">清空视频</button>
              </div>
              <div v-if="videoReady" class="video-preview-shell">
                <div v-if="backendProcessingRequired" class="upload-empty-state">
                  <Icon icon="mdi:cog-transfer-outline" class="upload-empty-icon" />
                  <div class="upload-empty-title">当前 `.wmv` 将由 Python 脚本实时处理</div>
                  <div class="upload-empty-text">该文件无法在页面内直接预览，但点击开始图像采集后会自动切换为项目内 Python 脚本实时抽帧模式。</div>
                </div>
                <video v-else :src="videoUrl" class="video-preview" controls preload="metadata"></video>
                <div class="video-meta-grid">
                  <div class="meta-card">
                    <span class="meta-label">视频文件</span>
                    <span class="meta-value">{{ videoFileName }}</span>
                  </div>
                  <div class="meta-card">
                    <span class="meta-label">视频时长</span>
                    <span class="meta-value">{{ videoDurationText }}</span>
                  </div>
                  <div class="meta-card">
                    <span class="meta-label">采样间隔</span>
                    <span class="meta-value">{{ sampleIntervalSeconds }} 秒</span>
                  </div>
                </div>
              </div>
              <div
                v-else
                class="upload-empty-state upload-dropzone"
                :class="{ 'is-dragging': uploadDragging }"
                @click="emit('select-video')"
                @dragover="handleUploadDragOver"
                @dragleave="handleUploadDragLeave"
                @drop="handleUploadDrop"
              >
                <Icon icon="mdi:file-video-outline" class="upload-empty-icon" />
                <div class="upload-empty-title">点击或拖动上传振动台 `.wmv` 试验视频</div>
                <div class="upload-empty-text">开始试验后通过 `.wmv` 录屏进行图像采集，系统会在测试阶段按固定时间间隔抽帧并输出实验数据。</div>
              </div>
            </div>
            <div class="alert info mt-4">
              <Icon icon="mdi:information" class="alert-icon blue" />
              <div class="alert-text">请上传本次振动试验 `.wmv` 录屏视频，并确认视频中包含振动台主控界面。进入测试阶段后系统会按固定间隔完成图像采集。</div>
            </div>
            <div class="alert warning mt-2">
              <Icon icon="mdi:alert" class="alert-icon" />
              <div class="alert-text"><strong>重要：</strong>仅支持 `.wmv` 视频，且需完整覆盖试验过程并包含主要参数显示区域，否则会影响后续实验数据输出。</div>
            </div>
            <div class="btn-row mt-4">
              <button class="cancel-btn" @click="emit('go-prev-stage')">上一步</button>
              <button class="next-btn" :disabled="!videoReady" style="margin-top:auto; align-self:flex-end" @click="emit('set-cal-step', 'dur')">下一步：时长校验</button>
            </div>
          </div>
          <div class="cal-side">
            <div class="card">
              <div class="card-header"><h3 class="card-title">工单详细信息</h3></div>
              <div class="info-body">
                <div class="info-sec-title">基本信息</div>
                <div class="kv-row"><span class="k">工单编号</span><span class="v">{{ currentWorkOrder?.id }}</span></div>
                <div class="kv-row"><span class="k">申请人</span><span class="v">{{ currentWorkOrder?.applicant }}</span></div>
                <div class="kv-row"><span class="k">联系电话</span><span class="v">{{ currentWorkOrder?.phone }}</span></div>
                <div class="info-sec-title mt-4">测试参数</div>
                <div class="kv-row"><span class="k">振动量级</span><span class="v highlight">{{ currentWorkOrder?.level }}</span></div>
                <div class="kv-row"><span class="k">振动时长</span><span class="v highlight">{{ currentWorkOrder?.duration }} 分钟</span></div>
                <div class="kv-row"><span class="k">测试类型</span><span class="v">{{ currentWorkOrder?.type }}</span></div>
                <div class="kv-row"><span class="k">振动方向</span><span class="v">Z轴</span></div>
                <div class="kv-row"><span class="k">频率范围</span><span class="v">5~2000Hz</span></div>
                <div class="info-sec-title mt-4">设备信息</div>
                <div class="kv-row"><span class="k">设备名称</span><span class="v">{{ currentWorkOrder?.device }}</span></div>
                <div class="kv-row"><span class="k">数量</span><span class="v">1 台</span></div>
                <div class="alert warning small mt-4">
                  <Icon icon="mdi:alert" class="alert-icon small" />
                  <span>请核对振级参数设置</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="calStep === 'dur'" class="cal-layout">
          <div class="cal-main">
            <div class="cal-title">振动时长校验</div>
            <div class="video-upload-card compact">
              <div class="video-status-row">
                <span class="status-pill" :class="videoReady ? 'done' : 'pending'">{{ videoReady ? '视频已就绪' : '未上传视频' }}</span>
                <span class="video-status-text">{{ videoReady ? `${videoFileName} · ${videoDurationText}` : '请返回上一步上传 `.wmv` 试验视频' }}</span>
              </div>
              <div class="alert info no-margin">
                <Icon icon="mdi:movie-open-play" class="alert-icon blue" />
                <div class="alert-text">测试阶段将基于该视频进行图像抽帧，并输出采样记录、图像采集结果和实验汇总数据。</div>
              </div>
            </div>
            <div class="alert info mt-4">
              <Icon icon="mdi:information" class="alert-icon blue" />
              <div class="alert-text">请确认视频试验时长与工单要求一致，完成校验后进入测试阶段开始图像采集。</div>
            </div>
            <div class="alert warning mt-2">
              <Icon icon="mdi:alert" class="alert-icon" />
              <div class="alert-text">时长设置不正确将导致测试时间不准确，影响测试结果的有效性。</div>
            </div>
            <div class="btn-row mt-4">
              <button class="cancel-btn" @click="emit('set-cal-step', 'amp')">上一步</button>
              <button class="next-btn" :disabled="!videoReady" @click="emit('go-next-stage')">完成校验，进入振动测试</button>
            </div>
          </div>
          <div class="cal-side">
            <div class="card">
              <div class="card-header"><h3 class="card-title">时长校验</h3></div>
              <div class="info-body">
                <div class="dur-box">
                  <div class="dur-label">工单要求时长</div>
                  <div class="dur-val">{{ currentWorkOrder?.duration }}</div>
                  <div class="dur-unit">分钟</div>
                </div>
                <div class="alert warning small">
                  <Icon icon="mdi:alert" class="alert-icon small" />
                  <span>请核对时长设置</span>
                </div>
                <div class="info-sec-title mt-4">其他参数参考</div>
                <div class="kv-row"><span class="k">振动量级</span><span class="v">{{ currentWorkOrder?.level }}</span></div>
                <div class="kv-row"><span class="k">振动方向</span><span class="v">Z轴</span></div>
                <div class="kv-row"><span class="k">设备名称</span><span class="v">{{ currentWorkOrder?.device }}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="stage === 'testing'" class="panel-card test-panel-full testing-panel">
        <div class="status-grid">
          <div class="status-box">
            <div class="status-header">试验状态</div>
            <div class="status-row"><span class="label">响应</span><span class="value orange">{{ liveLevel }}</span></div>
            <div class="status-row mt-1"><span class="label">目标</span><span class="value cyan">{{ liveFreq }}</span></div>
          </div>
          <div class="status-box">
            <div class="status-header">图像采集</div>
            <div class="status-row"><span class="label">已采集</span><span class="value green">{{ vibDataCount }} 条</span></div>
            <div class="status-row mt-1"><span class="label">历经时间</span><span class="value white">{{ formattedDuration }}</span></div>
          </div>
          <div class="status-box">
            <div class="status-header">数据输出</div>
            <div class="status-row"><span class="label">采集状态</span><span class="badge" :class="isRunning ? 'badge-green' : 'badge-gray'">{{ isRunning ? '● 采集中' : analysisCompleted ? '● 已完成' : '● 未开始' }}</span></div>
            <div class="file-info">{{ liveFileName }}</div>
          </div>
        </div>

        <div class="test-layout">
          <div class="card chart-card">
            <div class="card-header">
              <h3 class="card-title">视频图像采集预览</h3>
              <div class="chart-legend"><span class="cyan">{{ captureStatusText }}</span></div>
            </div>
            <div class="chart-body capture-preview-body">
              <img v-if="latestCaptureUrl" :src="latestCaptureUrl" class="capture-preview-image" alt="图像采集预览" />
              <div v-else-if="videoReady && backendProcessingRequired" class="capture-empty-state">
                <Icon icon="mdi:cog-transfer-outline" class="upload-empty-icon" />
                <div>当前 `.wmv` 由 Python 脚本读取，开始采集后实时显示结果图</div>
              </div>
              <video v-else-if="videoReady" :src="videoUrl" class="capture-preview-image" controls preload="metadata"></video>
              <div v-else class="capture-empty-state">
                <Icon icon="mdi:file-video-outline" class="upload-empty-icon" />
                <div>请先上传 `.wmv` 试验视频</div>
              </div>
              <div class="camera-label">图像采集进度 {{ captureProgressPct }}%</div>
            </div>
          </div>

          <div class="side-info">
            <div class="card current-wo-card">
              <div class="card-header compact-wo-header">
                <h3 class="card-title"><span class="wo-mini-icon">▣</span>当前工单</h3>
              </div>
              <div class="info-body current-wo-body">
                <div v-if="currentWorkOrder" class="wo-compact-stack">
                  <div class="wo-compact-title">{{ currentWorkOrder.id }}</div>
                  <div class="wo-compact-grid">
                    <div class="wo-compact-cell">
                      <span>申请人</span>
                      <strong>{{ displayValue(currentWorkOrder.applicant) }}</strong>
                    </div>
                    <div class="wo-compact-cell">
                      <span>联系电话</span>
                      <strong>{{ maskPhone(currentWorkOrder.phone) }}</strong>
                    </div>
                    <div class="wo-compact-cell full">
                      <span>使用设备</span>
                      <strong>{{ displayValue(currentWorkOrder.device) }}</strong>
                    </div>
                    <div class="wo-compact-cell">
                      <span>振动量级</span>
                      <strong class="danger-text">{{ displayValue(currentWorkOrder.level) }}</strong>
                    </div>
                    <div class="wo-compact-cell">
                      <span>测试时长</span>
                      <strong>{{ durationText(currentWorkOrder.duration) }}</strong>
                    </div>
                    <div class="wo-compact-cell">
                      <span>测试类型</span>
                      <strong>{{ displayValue(currentWorkOrder.type) }}</strong>
                    </div>
                    <div class="wo-compact-cell">
                      <span>设备编号</span>
                      <strong>{{ displayValue(currentWorkOrder.deviceNumber) }}</strong>
                    </div>
                  </div>
                  <div class="wo-compact-section-title">本次测试仪器</div>
                  <div class="wo-compact-instrument-list">
                    <div
                      v-for="instrument in currentTestInstruments()"
                      :key="instrument.id"
                      class="wo-compact-instrument"
                    >
                      <strong>{{ instrument.name }}</strong>
                      <span>{{ displayValue(instrument.sn) }}</span>
                    </div>
                  </div>
                  <button class="wo-detail-action" type="button" @click="openWODetail">
                    查看完整测试详情 →
                  </button>
                </div>
                <div v-else class="text-muted">未选择工单</div>
              </div>
            </div>
            <div class="card" v-if="analysisSummary || analysisPreviewRecords.length">
              <div class="card-header"><h3 class="card-title">实验数据预览</h3></div>
              <div class="info-body">
                <div v-if="analysisSummary" class="video-info-stack summary-stack">
                  <div class="info-line"><span>采样记录</span><strong>{{ analysisSummary.recordCount }} 条</strong></div>
                  <div class="info-line"><span>有效图像</span><strong>{{ analysisSummary.screenDetectedCount }} 张</strong></div>
                  <div class="info-line"><span>平均响应</span><strong>{{ analysisSummary.avgResponse }}</strong></div>
                  <div class="info-line"><span>最大驱动</span><strong>{{ analysisSummary.maxDrive }}</strong></div>
                </div>
                <div class="preview-record-list" v-if="analysisPreviewRecords.length">
                  <div v-for="record in analysisPreviewRecords" :key="record.timeSec" class="preview-record-item">
                    <span>{{ record.values.elapsedTime.raw }}</span>
                    <strong>{{ record.values.response.raw }} {{ record.values.response.unit }}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="test-controls">
          <button class="test-btn start" v-if="!sessionStarted" :disabled="!videoReady || isFinalizing" @click="emit('start-vib-test')">开始图像采集</button>
          <button class="test-btn pause" v-else-if="isRunning" :disabled="isFinalizing" @click="emit('pause-vib-test')">暂停采集</button>
          <button class="test-btn pause" v-else-if="isPaused" :disabled="isFinalizing" @click="emit('resume-vib-test')">继续采集</button>
          <button class="test-btn pause" v-else :disabled="isFinalizing" @click="emit('resume-vib-test')">{{ analysisCompleted ? '重新采集' : '开始图像采集' }}</button>
          <button class="test-btn stop" :disabled="isFinalizing" @click="emit('open-abort-warning')">⏹ 测试中止</button>
          <button class="test-btn secondary" v-if="sessionStarted && !isRunning" :disabled="isFinalizing" @click="emit('select-video')">重新上传视频</button>
          <button class="test-btn end" :disabled="!vibDataCount || isFinalizing" @click="emit('end-vib-test')">{{ isFinalizing ? '正在处理...' : testMode === 'pre' ? '预试验结束' : '测试结束' }}</button>
          <button class="test-btn end" v-if="testMode === 'pre'" :disabled="isFinalizing" @click="emit('convert-to-formal')">转入正式工单</button>
        </div>
      </div>

      <div v-else-if="stage === 'report'" class="modal-overlay">
        <div class="startup-check-modal" style="max-width: 700px; width: 95vw;">
          <div class="modal-header-simple">
            <h3>报告处理（{{ reportProgress }}%）</h3>
            <button class="modal-close-simple" @click="emit('set-stage-testing')">×</button>
          </div>
          <div class="content-pad">
            <div class="alert info" style="margin-bottom:12px">
              <Icon icon="mdi:information" class="alert-icon blue" />
              <div class="alert-text">点击“生成文件”后将依次输出实验数据 CSV、图像采集结果 PNG 和测试报告 DOC，完成后自动进入关机检查。</div>
            </div>
            <div v-if="analysisSummary" class="report-summary-grid">
              <div class="meta-card"><span class="meta-label">采样记录</span><span class="meta-value">{{ analysisSummary.recordCount }} 条</span></div>
              <div class="meta-card"><span class="meta-label">有效图像</span><span class="meta-value">{{ analysisSummary.screenDetectedCount }} 张</span></div>
              <div class="meta-card"><span class="meta-label">平均响应</span><span class="meta-value">{{ analysisSummary.avgResponse }}</span></div>
              <div class="meta-card"><span class="meta-label">最大驱动</span><span class="meta-value">{{ analysisSummary.maxDrive }}</span></div>
            </div>
            <div class="kv" style="margin-top:8px">
              <div class="k">{{ reportFiles[0].name }}</div><div class="v">{{ reportFiles[0].status }}</div>
              <div class="k">{{ reportFiles[1].name }}</div><div class="v">{{ reportFiles[1].status }}</div>
              <div class="k">{{ reportFiles[2].name }}</div><div class="v">{{ reportFiles[2].status }}</div>
            </div>
          </div>
          <div class="modal-actions">
            <button class="cancel-btn" @click="emit('set-stage-testing')">返回测试</button>
            <button class="next-btn" :disabled="fileGenRunning" @click="emit('start-file-gen')">生成文件</button>
          </div>
        </div>
      </div>

      <div v-else class="modal-overlay">
        <div class="startup-check-modal" style="max-width: 700px; width: 95vw;">
          <h2 class="modal-title">关机检查</h2>
          <div class="check-list-container">
            <div class="check-list">
              <label
                v-for="item in shutdownChecks"
                :key="item.id"
                class="check-item"
                :class="{ 'is-checked': item.checked }"
              >
                <div class="checkbox-wrapper">
                  <input type="checkbox" :checked="item.checked" @change="emit('toggle-shutdown-check', item.id)" />
                  <div class="custom-checkbox">
                    <Icon v-if="item.checked" icon="mdi:check" />
                  </div>
                </div>
                <span class="check-text">{{ item.text }}</span>
              </label>
            </div>
          </div>
          <div class="modal-actions">
            <button class="cancel-btn" @click="emit('go-prev-stage')">上一步</button>
            <button class="next-btn" :disabled="!shutdownChecks.every(i => i.checked)" @click="emit('finish-shutdown')">完成并返回看板</button>
          </div>
        </div>
      </div>

      <div
        v-if="currentWorkOrder"
        class="wo-detail-overlay"
        :class="{ open: woDetailOpen }"
        @click="closeWODetail"
      ></div>
      <aside
        v-if="currentWorkOrder"
        class="wo-detail-drawer"
        :class="{ open: woDetailOpen }"
      >
        <div class="wo-detail-drawer-header">
          <div>
            <div class="drawer-eyebrow">完整测试详情</div>
            <h3>{{ currentWorkOrder.id }}</h3>
          </div>
          <button class="drawer-close" type="button" @click="closeWODetail">×</button>
        </div>
        <div class="wo-detail-drawer-body">
          <div class="detail-report-head">
            <div>
              <p>报告类型</p>
              <h4>Report of Vibration Test Operation</h4>
            </div>
            <span class="detail-status-chip">{{ testMode === 'pre' ? '预实验' : '正式测试' }}</span>
          </div>

          <section class="detail-section">
            <div class="detail-section-title">
              <Icon icon="mdi:file-document-outline" />
              <span>基本信息 Basic Information</span>
            </div>
            <div class="detail-table-card">
              <div class="detail-table-cell">
                <span>标题 Title</span>
                <strong>{{ displayValue(currentWorkOrder.purpose || currentWorkOrder.testType) }}</strong>
              </div>
              <div class="detail-table-cell">
                <span>试件 Specimen</span>
                <strong>{{ displayValue(currentWorkOrder.device) }}</strong>
              </div>
              <div class="detail-table-cell">
                <span>操作员 Operator</span>
                <strong>{{ displayValue(currentWorkOrder.applicant) }}</strong>
              </div>
              <div class="detail-table-cell">
                <span>联系电话 Phone</span>
                <strong>{{ maskPhone(currentWorkOrder.phone) }}</strong>
              </div>
              <div class="detail-table-cell">
                <span>试验开始 Date of Test Start</span>
                <strong>{{ displayValue(currentWorkOrder.planTime || currentWorkOrder.testDate) }}</strong>
              </div>
              <div class="detail-table-cell">
                <span>完成状态 State</span>
                <strong>{{ analysisCompleted ? '测试完成' : sessionStarted ? '测试进行中' : '待开始' }}</strong>
              </div>
              <div class="detail-table-cell">
                <span>设备编号 Device No.</span>
                <strong>{{ displayValue(currentWorkOrder.deviceNumber) }}</strong>
              </div>
              <div class="detail-table-cell">
                <span>备注 Comment</span>
                <strong>{{ displayValue(currentWorkOrder.remark) }}</strong>
              </div>
            </div>
          </section>

          <section class="detail-section">
            <div class="detail-section-title">
              <Icon icon="mdi:pulse" />
              <span>测试条件 TEST CONDITION</span>
            </div>
            <div class="detail-condition-card">
              <div class="detail-metric-grid">
                <div class="detail-metric">
                  <span>加速度</span>
                  <strong>10.081 <em>g rms</em></strong>
                </div>
                <div class="detail-metric">
                  <span>速度</span>
                  <strong>58.733 <em>cm/s rms</em></strong>
                </div>
                <div class="detail-metric">
                  <span>位移</span>
                  <strong>5.259 <em>mm rms</em></strong>
                </div>
              </div>

              <div class="detail-subtitle">交越点 PSD</div>
              <div class="detail-data-table">
                <table>
                  <thead>
                    <tr>
                      <th>No.</th>
                      <th>频率 (Hz)</th>
                      <th>量级 (g²/Hz)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td>1</td><td>10.00</td><td>8.823e-2</td></tr>
                    <tr><td>2</td><td>18.00</td><td>8.8226</td></tr>
                    <tr><td>3</td><td>22.00</td><td>0.8823</td></tr>
                    <tr><td>4</td><td>100.00</td><td>0.8823</td></tr>
                  </tbody>
                </table>
              </div>

              <div class="detail-subtitle">容差设置</div>
              <div class="detail-data-table tolerance-table">
                <table>
                  <thead>
                    <tr>
                      <th>类型</th>
                      <th>上限 (dB)</th>
                      <th>下限 (dB)</th>
                      <th>允许宽度 (Hz)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr class="danger-row"><td>中断</td><td>+20.00</td><td>-15.00</td><td>0.00</td></tr>
                    <tr class="warning-row"><td>警告</td><td>+6.00</td><td>-6.00</td><td>0.00</td></tr>
                  </tbody>
                </table>
              </div>
              <div class="detail-muted-strip">
                <Icon icon="mdi:circle-off-outline" />
                <span>扩张容差 0 件</span>
              </div>
            </div>
          </section>

          <section class="detail-section">
            <div class="detail-section-title">
              <Icon icon="mdi:input" />
              <span>输入条件 INPUT CONDITION</span>
            </div>
            <div class="detail-channel-card">
              <div class="channel-head">
                <span>Ch1</span>
                <strong>中间位置</strong>
                <em>000-Ch1</em>
              </div>
              <div class="channel-row"><span>输入类型</span><strong>电荷输入 (1 mV/pC)</strong></div>
              <div class="channel-row"><span>输入灵敏度</span><strong>25.730 pC/g</strong></div>
              <div class="channel-row"><span>极性</span><strong>正</strong></div>
              <div class="channel-row"><span>输入通道类别</span><strong>未使用</strong></div>
              <div class="channel-row"><span>平均化参数</span><strong>[M : 4 , E : 8 ( 120 DOF )]</strong></div>
            </div>
            <div class="detail-channel-card">
              <div class="channel-head">
                <span>Ch2</span>
                <strong>边缘位置</strong>
                <em>000-Ch2</em>
              </div>
              <div class="channel-row"><span>输入类型</span><strong>电荷输入 (1 mV/pC)</strong></div>
              <div class="channel-row"><span>输入灵敏度</span><strong>28.910 pC/g</strong></div>
              <div class="channel-row"><span>极性</span><strong>正</strong></div>
              <div class="channel-row"><span>输入通道类别</span><strong>未使用</strong></div>
              <div class="channel-row"><span>平均化参数</span><strong>[M : 4 , E : 8 ( 120 DOF )]</strong></div>
            </div>
          </section>

          <section class="detail-section">
            <div class="detail-section-title">
              <Icon icon="mdi:tune-variant" />
              <span>控制条件 CONTROL CONDITION</span>
            </div>
            <div class="detail-condition-card">
              <div class="detail-metric-grid control-grid">
                <div class="detail-metric"><span>控制对象</span><strong>加速度 (g)</strong></div>
                <div class="detail-metric"><span>频率范围</span><strong>1000.00 Hz</strong></div>
                <div class="detail-metric"><span>分析谱线</span><strong>400 lines</strong></div>
                <div class="detail-metric"><span>Δf / 帧时间</span><strong>2.50 Hz / 400.00 ms</strong></div>
                <div class="detail-metric"><span>最高参考频率</span><strong>1000.00 Hz</strong></div>
                <div class="detail-metric"><span>平均化参数</span><strong>M:4, E:8 [120 DOF]</strong></div>
              </div>

              <div class="detail-subtitle">环检 <span>宽松</span></div>
              <div class="detail-param-box">
                <div><span>环境噪声的上限值</span><strong>[ 80.0% ]</strong></div>
                <div><span>初始试验中的传递率变化检测值</span><strong>[ 90.0% ]</strong></div>
                <div><span>试验运行中的传递率变化检测值</span><strong>[ 60.0% ]</strong></div>
                <div><span>超载检测值</span><strong>[ 83.30% ]（对满量程rms比率）</strong></div>
              </div>

              <div class="detail-subtitle">均衡化模式 <span>标准</span></div>
              <div class="detail-param-box">
                <div><span>频谱的重合分析</span><strong>[ 50.0% ]</strong></div>
                <div><span>初始EQ量级增加侧限制值</span><strong>[ 10.00 dB ]</strong></div>
                <div><span>初始EQ量级减少侧限制值</span><strong>[ 15.00 dB ]</strong></div>
                <div><span>传递特性更新比率</span><strong>[ 50.0% ]</strong></div>
                <div><span>源于错误的控制对象敏感度</span><strong>[ 50.0% ]</strong></div>
                <div><span>过去的控制量级的继承比率</span><strong>[ 100.0% ]</strong></div>
                <div><span>根据错误的控制上限（增加侧）</span><strong>[ 4.00 dB ]</strong></div>
                <div><span>根据错误的控制下限（减少侧）</span><strong>[ 5.00 dB ]</strong></div>
              </div>

              <div class="detail-subtitle">输出参数</div>
              <div class="detail-param-box">
                <div><span>试验时间</span><strong>01:00:00</strong></div>
                <div><span>初始输出量级</span><strong>-20.00 dB</strong></div>
                <div><span>量级增减值</span><strong>2.00 dB</strong></div>
                <div><span>自动开始</span><strong>不运行</strong></div>
                <div><span>输出停止过滤时间</span><strong>500.0 ms</strong></div>
                <div><span>观测频率的限制</span><strong>仅目标频率范围</strong></div>
              </div>
            </div>
          </section>

          <section class="detail-section">
            <div class="detail-section-title">
              <Icon icon="mdi:tools" />
              <span>本次测试仪器 Instruments</span>
            </div>
            <div class="detail-instrument-list">
              <div
                v-for="instrument in currentTestInstruments()"
                :key="instrument.id"
                class="detail-instrument-item"
              >
                <div>
                  <strong>{{ instrument.name }}</strong>
                  <span>{{ displayValue(instrument.sn) }}</span>
                </div>
                <em>{{ displayValue(instrument.model || instrument.maxDiameter || instrument.weight) }}</em>
              </div>
            </div>
          </section>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped src="./vibration.shared.css"></style>
