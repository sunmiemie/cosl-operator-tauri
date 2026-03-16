export type Stage = 'dashboard' | 'devcheck' | 'start' | 'calibration' | 'testing' | 'report' | 'shutdown'

export interface WorkOrder {
  id: string
  type: '模拟实验' | '正式测试'
  applicant: string
  phone: string
  device: string
  level: string
  duration: number
  purpose: string
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

export type ReportFileId = 'csv' | 'png' | 'doc'

export interface ReportFile {
  id: ReportFileId
  name: string
  status: string
  done: boolean
}
