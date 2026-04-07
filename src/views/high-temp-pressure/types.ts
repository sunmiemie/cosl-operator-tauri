export type HighTempPressurePanel = 'dashboard' | 'start' | 'testing' | 'report'

export type HighTempPressureModal = 'confirm-start' | 'end-test' | 'stop-test' | null

export interface InstrumentItem {
  id: string
  label: string
  sn: string
}

export interface WorkOrder {
  id: string
  dbId?: number
  no: string
  entrustNo: string
  applicant: string
  applicantUnit: string
  applyDate: string
  receivingNo: string
  vesselType: string
  type: string
  targetTemp: string
  targetPressure: string
  keepCondition: string
  status: string
  statusCode?: number
  expanded: boolean
  items: InstrumentItem[]
}

export interface WeekDayItem {
  dateStr: string
  dayName: string
  dayNum: number
  month: number
  isToday: boolean
  isWeekend: boolean
  isPast: boolean
}

export interface TimeSlotItem {
  key: string
  label: string
  isHalf: boolean
}

export interface ScheduledSelection {
  instrument: InstrumentItem
  order: WorkOrder
}

export interface StartupCheckItem {
  id: number
  text: string
  checked: boolean
}
