export type SimulationWellView = 'dashboard' | 'downhole-work' | 'equipment-package' | 'test-report'

export interface DeviceItem {
  id: string
  name: string
  sn?: string
  template?: string
  code?: string
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
  customer: string
  deviceName: string
  sn: string
  template: string
}

export interface ScheduledItem {
  deviceId: string
  orderId: string
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
