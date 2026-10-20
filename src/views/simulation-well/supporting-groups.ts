import type { SupportingDeviceGroup } from './types'

// 调用方先将模板解析成正式编号；无模板产品独立成组。
export function supportingGroupKey(order: unknown, template: unknown, device: unknown) {
  const code = String(template || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  return JSON.stringify([String(order || ''), code || `device:${device}`])
}

export function groupSupportingDevices<T extends Record<string, any>>(devices: T[]): SupportingDeviceGroup<T>[] {
  const groups = new Map<string, SupportingDeviceGroup<T>>()
  devices.forEach((device, index) => {
    const order = device.orderDbId ?? device.order_db_id ?? device.orderId ?? device.order_id
    const key = supportingGroupKey(order, device.template,
      device.deviceDbId ?? device.device_db_id ?? device.id ?? index)
    const group = groups.get(key)
    if (group) group.members.push(device)
    else groups.set(key, { key, members: [device] })
  })
  return Array.from(groups.values())
}
