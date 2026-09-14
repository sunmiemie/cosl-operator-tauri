<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import VChart from 'vue-echarts'
import type { PendingHaltHassBoardReport } from '../utils/pendingReports'
import type { HaltHassPassResult, HaltHassReportJson, HaltHassPeriodicRecord } from '../types'
import { TEST_RESULT } from '../types'
import '@/utils/echarts'

type ReportStage = 'editing' | 'review'
type RecordField = 'interfaceBoard' | 'controlBoard' | 'storageBoard' | 'pulserSummary'
type RecordStatus = '正常' | '异常'

const props = defineProps<{
  report: HaltHassReportJson | null
  reportJobs: PendingHaltHassBoardReport[]
  activeReportIndex: number
  reportStage: ReportStage
  reviewConfirmed: boolean
  completedReportCount: number
  allReportsCompleted: boolean
  testResult: number
}>()

const emit = defineEmits<{
  'select-report': [index: number]
  'update-result': [result: number]
  'update-record-status': [recordIndex: number, field: RecordField, status: RecordStatus]
  'update-rectifier-record-status': [stageIndex: number, voltageStepIndex: number, loadStage: 'halfLoad' | 'fullLoad', output: '48v' | '90v', status: HaltHassPassResult]
  'update-board-conclusion': [boardIndex: number, status: HaltHassPassResult]
  'complete-report': []
  'enter-review': []
  'edit-report': [index: number]
  'update-review-confirmed': [confirmed: boolean]
}>()

const duration = computed(() => {
  const seconds = Math.max(0, props.report?.duration || 0)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
})
const boardSummary = computed(() => props.report?.scannedBoardSummary || {
  scannedBoardCount: props.report?.boards.length || 0,
  testedTargetBoardCount: props.report?.boards.filter(board => board.role === 'target').length || 0,
  nonTargetBoardCount: props.report?.boards.filter(board => board.role !== 'target').length || 0,
  boards: props.report?.boards || [],
})
const hasOtherUnreviewedReport = computed(() => props.reportJobs.some((job, index) => (
  index !== props.activeReportIndex && !job.testerReviewed
)))
const isRectifierReport = computed(() => props.report?.reportType === 'rectifier_regulator')
const rectifierRows = computed(() => (props.report?.rectifierReport?.stages || []).flatMap((stage, stageIndex) => (
  stage.voltageSteps.flatMap((step, voltageStepIndex) => ([
    { stage, stageIndex, step, voltageStepIndex, loadStage: 'halfLoad' as const, load: step.halfLoad },
    { stage, stageIndex, step, voltageStepIndex, loadStage: 'fullLoad' as const, load: step.fullLoad },
  ]))
)))

function dualOption(
  title: string,
  unit: string,
  points: Array<{ time: number; actual: number | null; target: number | null }>,
  actualColor: string,
) {
  return {
    animation: false,
    title: { text: title, left: 14, top: 10, textStyle: { fontSize: 13, color: '#344054' } },
    tooltip: { trigger: 'axis' },
    legend: { top: 10, right: 12, textStyle: { fontSize: 10 } },
    grid: { left: 48, right: 18, top: 48, bottom: 38 },
    xAxis: { type: 'value', name: '秒' },
    yAxis: { type: 'value', name: unit },
    series: [
      { name: '实际', type: 'line', showSymbol: false, data: points.map(point => [point.time, point.actual]), lineStyle: { color: actualColor, width: 1.5 } },
      { name: '目标', type: 'line', showSymbol: false, data: points.map(point => [point.time, point.target]), lineStyle: { color: '#f59e0b', width: 1.2, type: 'dashed' } },
    ],
  }
}

const chartOptions = computed(() => {
  const chart = props.report?.chartSummary
  if (!chart) return []
  return [
    dualOption('脉冲器波形', 'mA', chart.pulser, '#0f766e'),
    dualOption('温度', '℃', chart.temperature, '#dc2626'),
    dualOption('振动', 'g', chart.vibration, '#2563eb'),
    {
      animation: false,
      title: { text: '工作电流', left: 14, top: 10, textStyle: { fontSize: 13, color: '#344054' } },
      tooltip: { trigger: 'axis' },
      legend: { top: 10, right: 12 },
      grid: { left: 48, right: 18, top: 48, bottom: 38 },
      xAxis: { type: 'value', name: '秒' },
      yAxis: { type: 'value', name: props.report?.currentUnit || 'mA' },
      series: [
        { name: '48V', type: 'line', showSymbol: false, data: chart.current48v.map(point => [point.time, point.value]), lineStyle: { color: '#0f766e' } },
        { name: '90V', type: 'line', showSymbol: false, data: chart.current90v.map(point => [point.time, point.value]), lineStyle: { color: '#c2410c' } },
      ],
    },
  ]
})

function resultText(result: number): string {
  return result === TEST_RESULT.ABNORMAL ? '异常' : '正常'
}

function reportAbnormalCount(job: PendingHaltHassBoardReport): number {
  if (job.reportJson.reportType === 'rectifier_regulator') {
    return (job.reportJson.rectifierReport?.stages || []).reduce((count, stage) => (
      count + stage.voltageSteps.reduce((stepCount, step) => (
        stepCount
        + (step.halfLoad.output48Result.result === '不合格' ? 1 : 0)
        + (step.halfLoad.output90Result.result === '不合格' ? 1 : 0)
        + (step.fullLoad.output48Result.result === '不合格' ? 1 : 0)
        + (step.fullLoad.output90Result.result === '不合格' ? 1 : 0)
      ), 0)
    ), 0)
  }
  return (job.reportJson.periodicRecords || []).reduce((count, record) => {
    const communicationCount = Object.values(record.communications).filter(value => value === '异常').length
    return count + communicationCount + (record.pulserSummary === '异常' ? 1 : 0)
  }, 0)
}

function updateRectifierRecordStatus(
  event: Event,
  stageIndex: number,
  voltageStepIndex: number,
  loadStage: 'halfLoad' | 'fullLoad',
  output: '48v' | '90v',
) {
  const status = (event.target as HTMLSelectElement).value
  if (status === '合格' || status === '不合格') {
    emit('update-rectifier-record-status', stageIndex, voltageStepIndex, loadStage, output, status)
  }
}

function boardConclusionIndex(serial: string): number {
  return props.report?.rectifierReport?.boardConclusions.findIndex(item => item.serial === serial) ?? -1
}

function updateBoardConclusion(event: Event, serial: string) {
  const status = (event.target as HTMLSelectElement).value
  const index = boardConclusionIndex(serial)
  if (index >= 0 && (status === '合格' || status === '不合格')) {
    emit('update-board-conclusion', index, status)
  }
}

function recordValue(record: HaltHassPeriodicRecord, field: RecordField): string {
  return field === 'pulserSummary' ? record.pulserSummary : record.communications[field]
}

function updateRecordStatus(event: Event, recordIndex: number, field: RecordField) {
  const status = (event.target as HTMLSelectElement).value
  if (status === '正常' || status === '异常') {
    emit('update-record-status', recordIndex, field, status)
  }
}
</script>

<template>
  <section class="test-result-panel" aria-labelledby="test-result-title">
    <header class="panel-header">
      <Icon icon="mdi:clipboard-check-outline" class="header-icon" />
      <div>
        <h3 id="test-result-title">测试报告填写与审核</h3>
        <p v-if="report">工单 {{ report.orderNo }} · 目标板 {{ report.targetSerial || '--' }}</p>
      </div>
      <span class="review-progress">已复核 {{ completedReportCount }} / {{ reportJobs.length }} 份</span>
    </header>

    <template v-if="report && reportStage === 'editing'">
      <nav v-if="reportJobs.length > 1" class="report-tabs" aria-label="逐板报告">
        <button
          v-for="(job, index) in reportJobs"
          :key="job.clientSubmitId"
          type="button"
          class="report-tab"
          :class="{ active: index === activeReportIndex, completed: job.testerReviewed }"
          @click="emit('select-report', index)"
        >
          <span>{{ job.testerReviewed ? '✓' : index + 1 }}</span>
          {{ job.reportJson.targetSerial || `第 ${index + 1} 份` }}
        </button>
      </nav>

      <div class="overview-cards">
        <div class="overview-card"><span>测试时长</span><strong>{{ duration }}</strong></div>
        <div class="overview-card"><span>实际扫码</span><strong>{{ boardSummary.scannedBoardCount }} 块</strong></div>
        <div class="overview-card"><span>目标板</span><strong>{{ boardSummary.testedTargetBoardCount }} 块</strong></div>
        <div class="overview-card"><span>{{ isRectifierReport ? '整流稳压采点' : '三分钟记录' }}</span><strong>{{ isRectifierReport ? rectifierRows.length : (report.periodicRecords?.length || 0) }} 条</strong></div>
      </div>

      <div class="section-heading"><span>最终测试结论</span><small>测试人员可根据本次记录复核并修正</small></div>
      <div class="result-editor" role="radiogroup" aria-label="最终测试结论">
        <button type="button" class="result-choice normal" :class="{ selected: testResult === TEST_RESULT.NORMAL }" :aria-pressed="testResult === TEST_RESULT.NORMAL" @click="emit('update-result', TEST_RESULT.NORMAL)">
          <Icon icon="mdi:check-circle-outline" />正常
        </button>
        <button type="button" class="result-choice abnormal" :class="{ selected: testResult === TEST_RESULT.ABNORMAL }" :aria-pressed="testResult === TEST_RESULT.ABNORMAL" @click="emit('update-result', TEST_RESULT.ABNORMAL)">
          <Icon icon="mdi:alert-circle-outline" />异常
        </button>
        <span class="program-result">{{ report.remark || '程序未提供初始判断说明' }}</span>
      </div>

      <template v-if="isRectifierReport">
        <div class="section-heading"><span>整流稳压测试记录</span><small>采集值只读，每个负载阶段的合格判断允许修改</small></div>
        <div class="table-scroll">
          <table class="record-table rectifier-record-table">
            <thead>
              <tr><th>温度阶段</th><th>目标/实际温度</th><th>目标/实际振动</th><th>输入电压</th><th>负载阶段</th><th>48V 负载</th><th>48V 输出</th><th>48V 电流（A）</th><th>48V 判定</th><th>90V 负载</th><th>90V 输出</th><th>90V 电流（A）</th><th>90V 判定</th></tr>
            </thead>
            <tbody>
              <tr v-for="row in rectifierRows" :key="`${row.stageIndex}-${row.voltageStepIndex}-${row.loadStage}`">
                <td>{{ row.stage.stageIdentity || `阶段 ${row.stage.stageIndex}` }}</td>
                <td>{{ row.stage.targetTemperature ?? '--' }} / {{ row.stage.actualTemperature ?? '--' }} ℃</td>
                <td>{{ row.stage.targetVibration ?? '--' }} / {{ row.stage.actualVibration ?? '--' }} g</td>
                <td>{{ row.step.inputVoltage }} V</td>
                <td>{{ row.loadStage === 'halfLoad' ? '半载' : '满载' }}</td>
                <td>{{ row.load.load48Ohm }} Ω</td>
                <td>{{ row.load.output48Voltage ?? '--' }} V</td>
                <td>{{ row.load.output48CurrentA ?? '--' }}</td>
                <td>
                  <select class="status-select" :class="row.load.output48Result.result === '不合格' ? 'abnormal' : 'normal'" :value="row.load.output48Result.result" @change="updateRectifierRecordStatus($event, row.stageIndex, row.voltageStepIndex, row.loadStage, '48v')">
                    <option value="合格">合格</option><option value="不合格">不合格</option>
                  </select>
                </td>
                <td>{{ row.load.load90Ohm }} Ω</td>
                <td>{{ row.load.output90Voltage ?? '--' }} V</td>
                <td>{{ row.load.output90CurrentA ?? '--' }}</td>
                <td>
                  <select class="status-select" :class="row.load.output90Result.result === '不合格' ? 'abnormal' : 'normal'" :value="row.load.output90Result.result" @change="updateRectifierRecordStatus($event, row.stageIndex, row.voltageStepIndex, row.loadStage, '90v')">
                    <option value="合格">合格</option><option value="不合格">不合格</option>
                  </select>
                </td>
              </tr>
              <tr v-if="!rectifierRows.length"><td colspan="13" class="empty-cell">暂无整流稳压阶段记录</td></tr>
            </tbody>
          </table>
        </div>
      </template>

      <template v-else>
        <div class="section-heading"><span>三分钟测试记录</span><small>采集值只读，通信与脉冲器判断可修改</small></div>
        <div class="table-scroll">
        <table class="record-table">
          <thead><tr><th>序号</th><th>运行时间</th><th>温度</th><th>振动</th><th>48V电流（mA）</th><th>90V电流（mA）</th><th>接口板</th><th>控制板</th><th>存储板</th><th>脉冲器</th></tr></thead>
          <tbody>
            <tr v-for="(record, recordIndex) in report.periodicRecords || []" :key="record.intervalIndex">
              <td>{{ record.intervalIndex }}</td>
              <td>{{ Math.round(record.elapsedSeconds / 60) }} 分钟{{ record.isPartialInterval ? '（结束补录）' : '' }}</td>
              <td>{{ record.temperature ?? '--' }}</td><td>{{ record.vibration ?? '--' }}</td><td>{{ record.current48v ?? '--' }}</td><td>{{ record.current90v ?? '--' }}</td>
              <td v-for="field in (['interfaceBoard', 'controlBoard', 'storageBoard', 'pulserSummary'] as RecordField[])" :key="field">
                <span v-if="recordValue(record, field) === '不适用'" class="not-applicable">不适用</span>
                <select v-else class="status-select" :class="recordValue(record, field) === '异常' ? 'abnormal' : 'normal'" :value="recordValue(record, field)" :aria-label="`第 ${record.intervalIndex} 条${field}判断`" @change="updateRecordStatus($event, recordIndex, field)">
                  <option value="正常">正常</option><option value="异常">异常</option>
                </select>
              </td>
            </tr>
            <tr v-if="!report.periodicRecords?.length"><td colspan="10" class="empty-cell">暂无记录</td></tr>
          </tbody>
        </table>
        </div>
      </template>

      <div class="section-heading"><span>曲线预览</span><small>曲线及原始采集数据不可修改</small></div>
      <div v-if="chartOptions.length" class="chart-grid"><VChart v-for="(option, index) in chartOptions" :key="index" :option="option" autoresize class="report-chart" /></div>
      <div v-else class="empty-inline">暂无曲线数据</div>

      <div class="section-heading"><span>本次扫码板卡</span><small>SN、型号和板卡身份不可修改</small></div>
      <div class="boards-list">
        <div v-for="(board, index) in boardSummary.boards" :key="board.serial" class="board-item">
          <span class="board-index">{{ index + 1 }}</span><code>{{ board.serial }}</code><span>{{ board.boardModelName || '--' }}</span>
          <span class="role-tag" :class="board.role === 'target' ? 'target' : 'companion'">{{ board.role === 'target' ? '目标板' : '陪测/非目标板' }}</span>
          <select
            v-if="isRectifierReport && boardConclusionIndex(board.serial) >= 0"
            class="status-select"
            :class="report.rectifierReport?.boardConclusions[boardConclusionIndex(board.serial)]?.result === '不合格' ? 'abnormal' : 'normal'"
            :value="report.rectifierReport?.boardConclusions[boardConclusionIndex(board.serial)]?.result"
            :aria-label="`${board.serial} 电路板结论`"
            @change="updateBoardConclusion($event, board.serial)"
          >
            <option value="合格">合格</option><option value="不合格">不合格</option>
          </select>
        </div>
      </div>

      <footer class="report-actions">
        <button v-if="allReportsCompleted" type="button" class="btn-secondary" @click="emit('enter-review')">查看审核汇总</button>
        <button type="button" class="btn-primary" @click="emit('complete-report')"><Icon icon="mdi:content-save-check-outline" />{{ hasOtherUnreviewedReport ? '保存本份并继续下一份' : '完成填写并进入审核' }}</button>
      </footer>
    </template>

    <template v-else-if="report && reportStage === 'review'">
      <div class="review-heading"><div><h4>报告提交前审核</h4><p>逐份确认最终结论和采点判断，确认后才能上传。</p></div><strong>{{ completedReportCount }} / {{ reportJobs.length }}</strong></div>
      <div class="review-list">
        <article v-for="(job, index) in reportJobs" :key="job.clientSubmitId" class="review-item">
          <span class="review-index">{{ index + 1 }}</span>
          <div class="review-main"><strong>{{ job.reportJson.targetSerial || `目标板 ${job.targetBoardId}` }}</strong><div class="review-meta"><span>工单：{{ job.reportJson.orderNo }}</span><span>结论：<b :class="job.result === TEST_RESULT.ABNORMAL ? 'text-error' : 'text-success'">{{ resultText(job.result) }}</b></span><span>异常判断：{{ reportAbnormalCount(job) }} 项</span></div></div>
          <span class="completed-label"><Icon icon="mdi:check-circle" />已复核</span>
          <button type="button" class="btn-secondary" @click="emit('edit-report', index)">修改</button>
        </article>
      </div>
      <label class="review-confirm"><input type="checkbox" :checked="reviewConfirmed" @change="emit('update-review-confirmed', ($event.target as HTMLInputElement).checked)" /><span>我已逐份审核以上报告，确认最终结论和每个采点的状态判断无误</span></label>
      <footer class="report-actions"><button type="button" class="btn-secondary" @click="emit('edit-report', 0)">返回修改</button><span class="upload-hint" :class="{ ready: reviewConfirmed }">{{ reviewConfirmed ? '审核已确认，可以上传报告' : '请勾选审核确认后再上传' }}</span></footer>
    </template>

    <div v-else class="empty-state"><Icon icon="mdi:clipboard-text-off-outline" /><p>暂无测试结果</p></div>
  </section>
</template>

<style scoped>
.test-result-panel { padding: 20px; overflow: auto; background: #fff; border: 1px solid #e4e7ec; border-radius: 14px; color: #1d2939; }
.panel-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }.panel-header h3, .panel-header p, .review-heading h4, .review-heading p { margin: 0; }.panel-header h3 { font-size: 16px; }.panel-header p { margin-top: 3px; color: #667085; font-size: 12px; }.header-icon { color: #2563eb; font-size: 26px; }
.review-progress { margin-left: auto; padding: 6px 10px; border-radius: 999px; background: #eff6ff; color: #175cd3; font-size: 12px; font-weight: 600; }
.report-tabs { display: flex; gap: 8px; margin-bottom: 14px; overflow-x: auto; }.report-tab { display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 7px 12px; border: 1px solid #d0d5dd; border-radius: 8px; background: #fff; color: #475467; cursor: pointer; white-space: nowrap; }.report-tab span { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: #f2f4f7; font-size: 11px; }.report-tab.active { border-color: #2563eb; background: #eff6ff; color: #175cd3; }.report-tab.completed span { background: #dcfae6; color: #067647; }
.overview-cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }.overview-card { display: flex; flex-direction: column; gap: 5px; padding: 12px; border: 1px solid #e4e7ec; border-radius: 10px; background: #f9fafb; }.overview-card span { color: #667085; font-size: 12px; }.overview-card strong { font-size: 18px; }
.section-heading { display: flex; align-items: baseline; gap: 10px; margin: 20px 0 8px; font-size: 14px; font-weight: 600; }.section-heading small { color: #667085; font-weight: 400; }
.result-editor { display: flex; align-items: center; gap: 10px; padding: 12px; border: 1px solid #e4e7ec; border-radius: 10px; background: #f9fafb; }.result-choice { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 18px; border: 1px solid #d0d5dd; border-radius: 8px; background: #fff; color: #475467; cursor: pointer; font-weight: 600; }.result-choice.normal.selected { border-color: #12b76a; background: #ecfdf3; color: #067647; }.result-choice.abnormal.selected { border-color: #f04438; background: #fef3f2; color: #b42318; }.program-result { margin-left: auto; max-width: 58%; color: #667085; font-size: 12px; line-height: 1.5; }
.chart-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }.report-chart { height: 230px; border: 1px solid #e4e7ec; border-radius: 10px; }
.table-scroll { overflow: auto; border: 1px solid #e4e7ec; border-radius: 10px; }.record-table { width: max-content; min-width: 100%; border-collapse: collapse; font-size: 12px; }.record-table th, .record-table td { padding: 8px 10px; border-bottom: 1px solid #eaecf0; text-align: center; white-space: nowrap; }.record-table th { background: #f9fafb; color: #475467; }
.status-select { min-width: 76px; height: 34px; padding: 0 26px 0 9px; border: 1px solid #abefc6; border-radius: 7px; background: #ecfdf3; color: #067647; font: inherit; }.status-select.abnormal { border-color: #fecdca; background: #fef3f2; color: #b42318; }.not-applicable { display: inline-flex; min-height: 34px; align-items: center; padding: 0 10px; border-radius: 7px; background: #f2f4f7; color: #667085; }
.empty-cell, .empty-inline { padding: 22px; color: #98a2b3; text-align: center; }.boards-list { display: grid; max-height: 190px; gap: 7px; overflow: auto; }.board-item { display: grid; grid-template-columns: 28px minmax(160px, 1fr) minmax(100px, .7fr) auto auto; align-items: center; gap: 10px; padding: 9px 10px; border: 1px solid #eaecf0; border-radius: 8px; }.board-index { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: #eff6ff; color: #2563eb; font-size: 12px; }.role-tag { padding: 3px 8px; border-radius: 999px; font-size: 11px; }.role-tag.target { background: #eff8ff; color: #175cd3; }.role-tag.companion { background: #f2f4f7; color: #475467; }
.rectifier-record-table { min-width: 1320px; }
.report-actions { display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-top: 18px; padding-top: 14px; border-top: 1px solid #eaecf0; }.btn-primary, .btn-secondary { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; gap: 7px; padding: 0 16px; border-radius: 8px; cursor: pointer; font-weight: 600; }.btn-primary { border: 1px solid #2563eb; background: #2563eb; color: #fff; }.btn-secondary { border: 1px solid #d0d5dd; background: #fff; color: #344054; }
.review-heading { display: flex; align-items: center; justify-content: space-between; padding: 14px; border-radius: 10px; background: #eff6ff; }.review-heading h4 { font-size: 15px; }.review-heading p { margin-top: 4px; color: #475467; font-size: 12px; }.review-heading strong { color: #175cd3; font-size: 20px; }.review-list { display: grid; gap: 9px; margin-top: 14px; }.review-item { display: grid; grid-template-columns: 32px minmax(0, 1fr) auto auto; align-items: center; gap: 12px; padding: 12px; border: 1px solid #e4e7ec; border-radius: 10px; }.review-index { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: #f2f4f7; color: #475467; font-weight: 600; }.review-meta { display: flex; flex-wrap: wrap; gap: 5px 14px; margin-top: 5px; color: #667085; font-size: 12px; }.text-success { color: #067647; }.text-error { color: #b42318; }.completed-label { display: inline-flex; align-items: center; gap: 5px; color: #067647; font-size: 12px; }
.review-confirm { display: flex; align-items: flex-start; gap: 10px; margin-top: 16px; padding: 14px; border: 1px solid #abefc6; border-radius: 10px; background: #ecfdf3; color: #05603a; line-height: 1.5; cursor: pointer; }.review-confirm input { width: 18px; height: 18px; margin-top: 1px; }.upload-hint { margin-right: auto; color: #b54708; font-size: 12px; }.upload-hint.ready { color: #067647; }
.empty-state { display: grid; place-items: center; padding: 50px; color: #98a2b3; }.empty-state svg { font-size: 42px; }
@media (max-width: 1100px) { .chart-grid, .overview-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }.result-editor { align-items: stretch; flex-wrap: wrap; }.program-result { width: 100%; max-width: none; margin-left: 0; } }
</style>
