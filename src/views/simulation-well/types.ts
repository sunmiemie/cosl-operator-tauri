export type SimulationWellView = 'dashboard' | 'downhole-operation'

export interface DeviceItem {
  id: string
  name: string
  sn?: string
  template?: string
}

export interface WorkOrder {
  id: string
  customer: string
  devices: number
  status: string
  createTime: string
  planTime: string
  taskDesc: string
  deviceList: DeviceItem[]
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
