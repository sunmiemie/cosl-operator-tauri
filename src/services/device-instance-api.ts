import { http, type ApiResponse } from './http'

export interface DeviceInstanceDTO {
  id?: number | string
  psi_id?: number | string
  deviceId?: number | string
  device_id?: number | string
  psimodel_id?: number | string
  psimodelId?: number | string
  model_id?: number | string
  modelId?: number | string
  serialNumber?: string
  serial_number?: string
  psi_serialnumber?: string
  deviceName?: string
  device_name?: string
  psi_name?: string
  model?: string
  modelName?: string
  model_name?: string
  psimodel_name?: string
  host_model_name?: string
  hostModelName?: string
}

export interface DeviceInstanceListResponse {
  code: number
  msg?: string
  message?: string
  data?: DeviceInstanceDTO[] | {
    list?: DeviceInstanceDTO[]
    records?: DeviceInstanceDTO[]
    results?: DeviceInstanceDTO[]
    items?: DeviceInstanceDTO[]
    total?: number
  }
}

export interface ListDeviceInstancesParams {
  currentPage?: number
  size?: number
  serialNumber?: string
  deviceName?: string
  status?: string
}

export async function listDeviceInstances(
  params: ListDeviceInstancesParams = {},
  headers?: Record<string, string>
): Promise<ApiResponse<DeviceInstanceListResponse>> {
  const query: Record<string, string> = {}
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query[key] = String(value)
  })

  return http.get<DeviceInstanceListResponse>(
    '/equipment/device-instance/list',
    headers,
    query
  )
}
