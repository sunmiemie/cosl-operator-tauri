export type Stage = 'dashboard' | 'devcheck' | 'start' | 'calibration' | 'testing' | 'report' | 'shutdown'

export interface WorkOrder {
  id: string
  dbId?: number
  status?: number
  statusText?: string
  scheduledStartAt?: string | null
  scheduledEndAt?: string | null
  scheduleSegments?: WorkOrderScheduleSegment[]
  planTime?: string | null
  deviceNumber?: string
  orderType?: string
  applicationUnit?: string
  applicationUnitManager?: string
  applicationDate?: string | null
  researchNumber?: string
  projectBudgetNumber?: string
  projectName?: string
  client?: string
  taskNumber?: string | null
  tableNo?: string | null
  testType?: string
  testDate?: string | null
  vibrationDirection?: string
  acceleration?: string
  slope?: string
  frequency?: string
  vibrationTimes?: number
  projectMembers?: string
  equipmentList?: string
  instrumentCombination?: string
  testSteps?: string
  safetyRisks?: string
  createdAt?: string
  updatedAt?: string
  remark?: string
  type: string
  applicant: string
  phone: string
  device: string
  level: string
  duration: number
  purpose: string
  instruments: VibrationInstrument[]
  selectedInstruments?: VibrationInstrument[]
}

export interface WorkOrderScheduleSegment {
  scheduledStartAt: string
  scheduledEndAt: string
}

export interface VibrationInstrument {
  id: string
  dbId?: number | string
  name: string
  sn: string
  model?: string
  remark?: string
  quantity?: number
  weight?: string
  length?: string
  maxDiameter?: string
  status?: number
  statusText?: string
  completed?: boolean
}

export interface DevCheckItem {
  id: number
  text: string
  answer: 'yes' | 'no' | null
  remark: string
}

export interface StartupCheckItem {
  id: number
  text: string
  checked: boolean
}

export interface ShutdownCheckItem {
  id: number
  text: string
  checked: boolean
}

export interface WeekDay {
  dateStr: string
  dayName: string
  dayNum: number
  month: number
  isToday: boolean
  isWeekend: boolean
  isPast: boolean
}

export interface TimeSlot {
  key: string
  label: string
  isHalf: boolean
}

export type ReportFileId = 'csv' | 'png' | 'doc' | 'db'

export interface ReportFile {
  id: ReportFileId
  name: string
  status: string
  done: boolean
}

export interface VibrationCaptureFieldValue {
  raw: string
  value: number | null
  unit: string
}

export interface VibrationCaptureRecord {
  timeSec: number
  screenDetected: boolean
  chartScreenshotUrl: string
  values: {
    target: VibrationCaptureFieldValue
    level: VibrationCaptureFieldValue
    response: VibrationCaptureFieldValue
    drive: VibrationCaptureFieldValue
    elapsedTime: VibrationCaptureFieldValue
    remainingTime: VibrationCaptureFieldValue
  }
}

export interface VibrationAnalysisSummary {
  sourceVideoName: string
  sampleIntervalSeconds: number
  durationSeconds: number
  recordCount: number
  screenDetectedCount: number
  avgResponse: number
  maxDrive: number
  lastElapsedTime: string
}
