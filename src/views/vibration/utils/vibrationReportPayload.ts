import type { VibrationTableReportPayload as EquipmentReportPayload } from '@/services/vibration-table-report-api'
import type { VibrationAnalysisSummary, WorkOrder } from '../types'

export interface VibrationReportFilePaths {
  export_dir?: string
  csv_path?: string
  image_path?: string
  doc_path?: string
}

export interface BuildVibrationReportPayloadOptions {
  workOrder: WorkOrder | null
  summary: VibrationAnalysisSummary | null
  tester: string
  clientSubmitId: string
  generatedAt?: Date
  experimentStartedAt?: string | null
  experimentEndedAt?: string | null
  videoFileName?: string
  videoPath?: string
  sampleIntervalSeconds?: number
  reportText?: string
  filePaths?: VibrationReportFilePaths
}

const TEMPLATE_PSD_POINTS = [
  { no: 1, frequency: '10.00 Hz', acceleration_spectral_density: '8.823e-2 g2/Hz' },
  { no: 2, frequency: '18.00 Hz', acceleration_spectral_density: '8.8226 g2/Hz' },
  { no: 3, frequency: '22.00 Hz', acceleration_spectral_density: '0.8823 g2/Hz' },
  { no: 4, frequency: '100.00 Hz', acceleration_spectral_density: '0.8823 g2/Hz' },
]

const TEMPLATE_TOLERANCE = {
  abort_upper_db: '20.00',
  abort_lower_db: '-15.00',
  abort_allowed_width_hz: '0.00',
  warning_upper_db: '6.00',
  warning_lower_db: '-6.00',
  warning_allowed_width_hz: '0.00',
}

const TEMPLATE_INPUT_CONDITION = [
  {
    position: '中间位置',
    channel: '000-Ch1',
    input_type: '电荷输入 (1 mV/pC)',
    sensitivity: '25.730 pC/g',
    polarity: '正',
    category: '未使用',
    average: '[M : 4 , E :8 ( 120 DOF )]',
  },
  {
    position: '边缘位置',
    channel: '000-Ch2',
    input_type: '电荷输入 (1 mV/pC)',
    sensitivity: '28.910 pC/g',
    polarity: '正',
    category: '控制',
    average_weight: '1.0',
    max_control: '不运行',
    min_control: '不运行',
    average: '[M : 4 , E :8 ( 120 DOF )]',
  },
]

const TEMPLATE_CONTROL_CONDITION = {
  control_target: '加速度 (g)',
  frequency_range: '1000.00 Hz',
  analysis_lines: '400 lines',
  delta_f: '2.50 Hz',
  frame_time: '400.00 ms',
  max_reference_frequency: '1000.00 Hz',
  average: 'M:4, E:8 [120 DOF]',
  loop_check: {
    mode: '宽松',
    environmental_noise_upper: '[80.0%]',
    initial_transmissibility_change: '[90.0%]',
    running_transmissibility_change: '[60.0%]',
    overload_detection: '[83.30%]',
  },
  equalization: {
    mode: '标准',
    spectrum_overlap: '[50.0%]',
    initial_eq_increase_limit: '[10.00 dB]',
    initial_eq_decrease_limit: '[15.00 dB]',
    transfer_update_ratio: '[50.0%]',
    error_control_sensitivity: '[50.0%]',
    inherited_control_ratio: '[100.0%]',
    error_control_upper: '[4.00 dB]',
    error_control_lower: '[5.00 dB]',
  },
  initial_output_level: '-20.00 dB',
  level_step: '2.00 dB',
  auto_start: '不运行',
  output_stop_transition_time: '500.0 ms',
  observation_frequency_limit: '仅目标频率范围',
}

function valueOrDash(value: unknown) {
  const text = String(value ?? '').trim()
  return text || '-'
}

function optionalText(value: unknown) {
  const text = String(value ?? '').trim()
  return text || undefined
}

function formatDate(value: unknown, fallback: Date) {
  const text = String(value ?? '').trim()
  if (!text) return fallback.toISOString().slice(0, 10)
  const normalized = text.replace(/\//g, '-')
  return normalized.slice(0, 10)
}

function formatDateTime(value: string | null | undefined, fallback: Date) {
  if (!value) return fallback.toLocaleString()
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function durationText(minutes?: number, summary?: VibrationAnalysisSummary | null) {
  if (minutes && Number.isFinite(minutes)) {
    const total = Math.max(0, Math.round(minutes * 60))
    const hh = Math.floor(total / 3600)
    const mm = Math.floor((total % 3600) / 60)
    const ss = total % 60
    return `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
  }
  if (!summary?.durationSeconds) return '0:30:00'
  const total = Math.max(0, Math.round(summary.durationSeconds))
  const hh = Math.floor(total / 3600)
  const mm = Math.floor((total % 3600) / 60)
  const ss = total % 60
  return `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

function buildAttachments(filePaths?: VibrationReportFilePaths) {
  const files = [
    { type: 'csv', name: '振动测试数据.csv', local_path: filePaths?.csv_path },
    { type: 'image', name: '图像采集结果.png', local_path: filePaths?.image_path },
    { type: 'doc', name: '测试报告.docx', local_path: filePaths?.doc_path },
  ]
  return files.filter((item) => item.local_path)
}

export function buildVibrationReportPayload(options: BuildVibrationReportPayloadOptions): EquipmentReportPayload {
  const { workOrder, summary } = options
  if (!workOrder?.dbId) {
    throw new Error('当前工单缺少数据库 ID，无法提交报告')
  }
  const selectedInstruments = workOrder.selectedInstruments?.length
    ? workOrder.selectedInstruments
    : workOrder.instruments
  if (!selectedInstruments.length) {
    throw new Error('当前工单缺少测试仪器，无法提交报告')
  }

  const generatedAt = options.generatedAt || new Date()
  const orderNo = valueOrDash(workOrder.id || workOrder.taskNumber)
  const taskNumber = valueOrDash(workOrder.taskNumber || workOrder.id)
  const specimen = selectedInstruments
    .map((instrument) => [instrument.name, instrument.sn].filter(Boolean).join(' / '))
    .filter(Boolean)
    .join('、') || valueOrDash(workOrder.device)
  const acceleration = optionalText(workOrder.acceleration || workOrder.level) || '10.081 g rms'
  const frequency = optionalText(workOrder.frequency) || TEMPLATE_CONTROL_CONDITION.frequency_range
  const attachments = buildAttachments(options.filePaths)

  const paperReport = {
    source_template: '10G.doc',
    title: [workOrder.device, workOrder.vibrationDirection, workOrder.level].map(optionalText).filter(Boolean).join(' ') || '振动台测试报告',
    specimen,
    date_of_test_start: formatDateTime(options.experimentStartedAt, generatedAt),
    date_of_test_end: formatDateTime(options.experimentEndedAt, generatedAt),
    state_of_test_completed: '试验完成',
    operator: valueOrDash(options.tester),
    comment: optionalText(workOrder.remark) || '',
    test_condition: {
      acceleration,
      velocity: '58.733 cm/s rms',
      displacement: '5.259 mm rms',
      psd_points: TEMPLATE_PSD_POINTS,
      tolerance: TEMPLATE_TOLERANCE,
      expansion_tolerance: '0件',
    },
    input_condition: TEMPLATE_INPUT_CONDITION,
    control_condition: {
      ...TEMPLATE_CONTROL_CONDITION,
      frequency_range: frequency,
      test_time: durationText(workOrder.duration, summary),
    },
    graph_of_test_result: {
      image_path: options.filePaths?.image_path || '',
      source_video_name: summary?.sourceVideoName || options.videoFileName || '',
    },
  }

  const metrics = {
    vibration_direction: optionalText(workOrder.vibrationDirection) || '-',
    acceleration,
    frequency,
    duration: durationText(workOrder.duration, summary),
    sample_interval_seconds: options.sampleIntervalSeconds,
    record_count: summary?.recordCount,
    screen_detected_count: summary?.screenDetectedCount,
    avg_response: summary?.avgResponse,
    max_drive: summary?.maxDrive,
    last_elapsed_time: summary?.lastElapsedTime,
  }

  return {
    task_number: taskNumber,
    test_date: formatDate(workOrder.testDate || workOrder.planTime, generatedAt),
    tester: valueOrDash(options.tester),
    status: 0,
    overall_result: 'pass',
    order_ids: [workOrder.dbId],
    order_numbers: [orderNo],
    instrument_results: selectedInstruments.map((instrument) => ({
      order_id: workOrder.dbId,
      order_no: orderNo,
      instrument_id: instrument.dbId || instrument.id,
      instrument_name: valueOrDash(instrument.name),
      instrument_sn: valueOrDash(instrument.sn),
      result: 'pass',
      result_text: '合格',
      observation: '振动台实验完成，报告已由客户端自动生成。',
      metrics,
      attachments,
    })),
    report_json: {
      schema_version: 1,
      report_type: 'vibration-table-doc',
      generated_at: generatedAt.toISOString(),
      order: {
        id: workOrder.id,
        db_id: workOrder.dbId,
        task_number: taskNumber,
        device: workOrder.device,
        applicant: workOrder.applicant,
        phone: workOrder.phone,
        purpose: workOrder.purpose || workOrder.testType,
        vibration_direction: workOrder.vibrationDirection,
        acceleration: workOrder.acceleration || workOrder.level,
        slope: workOrder.slope,
        frequency: workOrder.frequency,
        vibration_times: workOrder.vibrationTimes,
        equipment_list: workOrder.equipmentList,
        instrument_combination: workOrder.instrumentCombination,
        test_steps: workOrder.testSteps,
        safety_risks: workOrder.safetyRisks,
      },
      video: {
        file_name: summary?.sourceVideoName || options.videoFileName || '',
        path: options.videoPath || '',
      },
      analysis_summary: summary || {},
      paper_report: paperReport,
      vibration_doc_report: paperReport,
      report_text: options.reportText || '',
    },
    attachments,
    remark: workOrder.remark || '',
    client_submit_id: options.clientSubmitId,
  }
}
