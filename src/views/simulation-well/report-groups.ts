import type { ResolvedReportDevice, ReportGroup } from './types'

// 仅将有效模板按工单分组；无模板研究院资料和失效模板始终逐台保留。
export function groupReportDevices(devices: ResolvedReportDevice[]): ReportGroup[] {
  const groups = new Map<string, ReportGroup>()
  devices.forEach((device, index) => {
    const key = device.orderDbId && device.templateId && device.templateId > 0 && !device.templateError
      ? `${device.orderDbId}:${device.templateId}` : `device:${device.orderDbId || device.orderId}:${device.deviceDbId || device.id}:${index}`
    const group = groups.get(key)
    if (group) group.members.push(device)
    else groups.set(key, { ...device, id: key, members: [device] })
  })
  return Array.from(groups.values()).map((group) => ({
    ...group,
    deviceName: group.members.map((device) => device.deviceName).join('、'),
    sn: group.members.map((device) => device.sn).join('、'),
  }))
}
