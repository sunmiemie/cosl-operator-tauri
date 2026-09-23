export type SimulationWellView = 'dashboard' | 'downhole-work' | 'equipment-package' | 'active-test' | 'test-monitor' | 'test-report'

export interface DeviceItem {
  id: string
  dbId?: number
  name: string
  sn?: string
  template?: string
  code?: string
  scheduledStartAt?: string | null
  scheduledEndAt?: string | null
  scheduleSegments?: Array<{
    scheduledStartAt: string
    scheduledEndAt: string
    useDevice: string
    equipmentId: string
  }>
  instrumentStatus?: number
  isCompleted?: boolean
}

export interface WorkOrder {
  id: string
  dbId?: number
  customer: string
  devices: number
  status: string
  createTime: string
  planTime: string
  taskDesc: string
  wellName?: string
  testPurpose?: string
  testSteps?: string
  safetyRisks?: string
  /** 1：研究院工单；0：非研究院工单。 */
  orderType: 0 | 1
  deviceList: DeviceItem[]
  supportingTools?: DeviceItem[]
}

export interface CalendarDay {
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

export interface DownholeDevice {
  orderId: string
  orderDbId?: number
  deviceDbId?: number
  customer: string
  deviceName: string
  sn: string
  template: string
  /** 1：研究院工单；0：非研究院工单。 */
  orderType: 0 | 1
}

export interface ScheduledItem {
  deviceId: string
  eventId: string
  scheduleOwnerDeviceId: string
  orderId: string
  deviceName?: string
  deviceNumber?: string
  hostDeviceName: string
  equipmentId: string
  dateStr: string
  startTimeKey: string
  startIdx: number
  span: number
  lane: number
  laneCount: number
  cellKey: string
  isTentative: boolean
}

export interface UnscheduledDeviceRow {
  deviceId: string
  orderId: string
  customer: string
  planTime: string
  taskDesc: string
  deviceName: string
  deviceNumber: string
}
