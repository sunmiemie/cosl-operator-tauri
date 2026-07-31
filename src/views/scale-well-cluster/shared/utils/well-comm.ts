import type { WellCommConfigDto } from '@/services/scale-well-api'
import type { WellCommConfig } from '../types'

export function mapWellCommFromDto(raw: WellCommConfigDto): WellCommConfig {
  const role = (raw.device_role ?? 'instrument') as WellCommConfig['deviceRole']
  if (role === 'power_supply') {
    return {
      deviceRole: role,
      transport: raw.transport ?? 'lan',
      host: raw.host ?? '',
      port: raw.port ?? 30000,
    }
  }
  return {
    deviceRole: role,
    vid: raw.vid ?? '',
    pid: raw.pid ?? '',
    adapterSerial: raw.adapter_serial ?? '',
    baudRate: Number(raw.baud_rate ?? 115200) || 115200,
  }
}

export function mapWellCommsFromDto(list?: WellCommConfigDto[] | null): WellCommConfig[] {
  return (list ?? []).map(mapWellCommFromDto)
}
