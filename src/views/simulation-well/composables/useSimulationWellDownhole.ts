import { computed } from 'vue'
import type { DownholeDevice, WorkOrder } from '../types'

export function useSimulationWellDownhole(todayScheduledOrders: Readonly<{ value: WorkOrder[] }>) {
  const downholeDevices = computed<DownholeDevice[]>(() => {
    const devices: DownholeDevice[] = []
    todayScheduledOrders.value.forEach(order => {
      ;(order.deviceList || []).forEach((device, idx) => {
        devices.push({
          orderId: order.id,
          customer: order.customer,
          deviceName: device.name,
          sn: device.sn || `SN-${order.id}-${String(idx + 1).padStart(3, '0')}`,
          template: device.template || 'DEFAULT_DOWNHOLE_REPORT',
        })
      })
    })
    return devices
  })

  return { downholeDevices }
}
