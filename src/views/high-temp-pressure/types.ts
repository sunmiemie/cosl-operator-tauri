export type HighTempPressurePanel = 'dashboard' | 'start' | 'testing' | 'reports' | 'report'

export type HighTempPressureModal = 'confirm-start' | 'end-test' | 'stop-test' | null

export interface InstrumentItem {
  id: string
  dbId?: number
  label: string
  sn: string
  testType?: string
  quantity?: number
  instrumentLength?: string
  maxDiameter?: string
  scheduledStartAt?: string | null
  scheduledEndAt?: string | null
  scheduleSegments?: InstrumentScheduleSegment[]
  useDevice?: string
  equipmentId?: string
  status?: number
  completed?: boolean
}

export interface InstrumentScheduleSegment {
  scheduledStartAt: string
  scheduledEndAt: string
  useDevice?: string
  equipmentId?: string
}

export interface WorkOrder {
  id: string
  dbId?: number
  no: string
  tableNo?: string
  entrustNo: string
  applicant: string
  applicantPhone?: string
  applicantUnit: string
  applicantUnitManager?: string
  applyDate: string
  applicationDate?: string
  researchNumber?: string
  projectBudgetNumber?: string
  projectName?: string
  client?: string
  plannedTime?: string
  receivingNo: string
  useDevice?: string
  vesselType: string
  type: string
  targetTemp: string
  targetPressure: string
  keepCondition: string
  maxDiameter?: string
  testType?: string
  projectMembers?: string
  equipmentList?: string
  instrumentCombination?: string
  testSteps?: string
  safetyRisks?: string
  remark?: string
  status: string
  statusCode?: number
  createdAt?: string
  updatedAt?: string
  expanded: boolean
  items: InstrumentItem[]
  adminSignatureUrl?: string
  sanxinConfirmDate?: string
  sanxinTesterItem1?: 'yes' | 'no' | null
  sanxinTesterItem2?: 'yes' | 'no' | null
  sanxinIsSanxin?: boolean
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
  useDevice?: string
  equipmentId?: string
}

export interface StartupCheckItem {
  id: number
  text: string
  checked: boolean
}
