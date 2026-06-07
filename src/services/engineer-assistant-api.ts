import { http, type ApiResponse } from './http'

export type EngineerAssistantBaseResponse<T> = {
  code: number
  msg?: string
  data: T
}

export type EngineerAssistantListData<T> = {
  list: T[]
  total: number
  source: 'engineer_assistant'
}

export type EngineerAssistantUser = {
  id: string
  userId: string
  name: string
  userName: string
  departmentId?: string
  departmentName?: string
  raw?: unknown
}

export type EngineerAssistantTestType = {
  id: string
  number?: string
  typeId: string
  name: string
  typeName: string
  raw?: unknown
}

export type ResolveEngineerAssistantTestTypeResult = {
  typeId: string | null
  matchedName?: string
  source: 'remote' | 'fallback' | 'none'
  error?: string
  candidates: EngineerAssistantTestType[]
}

export type EngineerAssistantTestStatus = {
  value: string
  label: string
  lable?: string
  raw?: unknown
}

export type EngineerAssistantApplicationForm = {
  testId: string
  testType: string
  testTypeName?: string
  status?: string
  zt?: string
  baseInfo?: unknown
  instruments?: unknown[]
  devices?: unknown[]
  users?: unknown[]
  raw?: unknown
}

export type GetEngineerAssistantUsersResponse = EngineerAssistantBaseResponse<EngineerAssistantListData<EngineerAssistantUser>>
export type GetEngineerAssistantTestTypesResponse = EngineerAssistantBaseResponse<EngineerAssistantListData<EngineerAssistantTestType>>
export type GetEngineerAssistantTestStatusesResponse = EngineerAssistantBaseResponse<EngineerAssistantListData<EngineerAssistantTestStatus>>
export type GetEngineerAssistantApplicationFormsResponse = EngineerAssistantBaseResponse<EngineerAssistantListData<EngineerAssistantApplicationForm>>
export type GetEngineerAssistantApplicationFormDetailResponse = EngineerAssistantBaseResponse<EngineerAssistantApplicationForm>

export async function getEngineerAssistantUsers(
  headers?: Record<string, string>
): Promise<ApiResponse<GetEngineerAssistantUsersResponse>> {
  return http.get<GetEngineerAssistantUsersResponse>('/external/assistant/users/', headers)
}

export async function getEngineerAssistantTestTypes(
  headers?: Record<string, string>
): Promise<ApiResponse<GetEngineerAssistantTestTypesResponse>> {
  return http.get<GetEngineerAssistantTestTypesResponse>('/external/assistant/test-types/', headers)
}

const HIGH_TEMP_PRESSURE_TYPE_FALLBACK = {
  typeId: '3',
  typeName: '高温高压井测试',
}

function normalizeTestTypeText(value?: string | number | null): string {
  return String(value ?? '').toLowerCase().replace(/[\s\-_/&＆]/g, '')
}

function getTestTypeAliases(keyword: string): string[] {
  const aliases = [keyword]
  if (keyword.includes('高温高压')) {
    aliases.push('高温高压井', '高温高压井测试', '高温高压')
  }
  return Array.from(new Set(aliases.map(normalizeTestTypeText).filter(Boolean)))
}

function findTestTypeByKeyword(list: EngineerAssistantTestType[], keyword: string): EngineerAssistantTestType | undefined {
  const aliases = getTestTypeAliases(keyword)
  return list.find((item) => {
    const values = [item.typeName, item.name, item.typeId, item.number, item.id].map(normalizeTestTypeText).filter(Boolean)
    return values.some((value) => aliases.some((alias) => value.includes(alias) || alias.includes(value)))
  })
}

function resolveTestTypeFallback(keyword: string, error?: string): ResolveEngineerAssistantTestTypeResult {
  if (getTestTypeAliases(keyword).includes(normalizeTestTypeText('高温高压井'))) {
    return {
      typeId: HIGH_TEMP_PRESSURE_TYPE_FALLBACK.typeId,
      matchedName: HIGH_TEMP_PRESSURE_TYPE_FALLBACK.typeName,
      source: 'fallback',
      error,
      candidates: [],
    }
  }
  return {
    typeId: null,
    source: 'none',
    error,
    candidates: [],
  }
}

export async function resolveEngineerAssistantTestType(
  keyword: string,
  headers?: Record<string, string>
): Promise<ResolveEngineerAssistantTestTypeResult> {
  const resp = await getEngineerAssistantTestTypes(headers)
  if (!resp.success) return resolveTestTypeFallback(keyword, resp.error || '获取第三方测试类型失败')
  if (!resp.data) return resolveTestTypeFallback(keyword, '第三方测试类型接口无响应数据')
  if (resp.data.code !== 0) return resolveTestTypeFallback(keyword, resp.data.msg || '第三方测试类型接口返回失败')

  const list = resp.data.data?.list || []
  const found = findTestTypeByKeyword(list, keyword)
  if (found?.typeId) {
    return {
      typeId: found.typeId,
      matchedName: found.typeName || found.name,
      source: 'remote',
      candidates: list,
    }
  }

  const fallback = resolveTestTypeFallback(keyword, '第三方测试类型列表未包含匹配项')
  return {
    ...fallback,
    candidates: list,
  }
}

export async function resolveEngineerAssistantTestTypeId(
  keyword: string,
  headers?: Record<string, string>
): Promise<string | null> {
  const result = await resolveEngineerAssistantTestType(keyword, headers)
  return result.typeId
}

export async function getEngineerAssistantTestStatuses(
  headers?: Record<string, string>
): Promise<ApiResponse<GetEngineerAssistantTestStatusesResponse>> {
  return http.get<GetEngineerAssistantTestStatusesResponse>('/external/assistant/test-statuses/', headers)
}

export async function getEngineerAssistantApplicationForms(
  headers?: Record<string, string>
): Promise<ApiResponse<GetEngineerAssistantApplicationFormsResponse>> {
  return http.get<GetEngineerAssistantApplicationFormsResponse>('/external/assistant/application-forms/', headers)
}

export async function getEngineerAssistantApplicationFormDetail(
  testId: string,
  testType?: string,
  headers?: Record<string, string>
): Promise<ApiResponse<GetEngineerAssistantApplicationFormDetailResponse>> {
  const queryParams = testType ? { testType } : undefined
  return http.get<GetEngineerAssistantApplicationFormDetailResponse>(
    `/external/assistant/application-forms/${encodeURIComponent(testId)}/`,
    headers,
    queryParams
  )
}

export type PushEngineerAssistantProcessesBody = {
  processDtoList: Array<{
    testTypeId: string
    testTypeName: string
    list: Array<{
      processId: string
      processName: string
      processDescription: string
    }>
  }>
}

export type PushEngineerAssistantEquipmentBody = {
  testEquipmentDtoList: Array<{
    testTypeId: string
    equipmentId: string
    equipmentName: string
  }>
}

export type EngineerAssistantScheduleInfo = {
  testId: string
  testType: string
  equipmentId: string
  startTime: string
  endTime: string
}

export type PushEngineerAssistantSchedulesBody = {
  schedulesInfo: EngineerAssistantScheduleInfo[]
}

export type ChangeEngineerAssistantStatusBody = {
  testType: string
  id: string
  status: string
  description: string
}

export type PushEngineerAssistantReportsBody = {
  testReportList: Array<{
    id: string
    testType: string
    status: string
    data: Array<{
      filename: string
      equipmentId: string
      fileContent: string
      description: string
      status: string
    }>
  }>
}

export type EngineerAssistantWriteOk = {
  code: number
  msg?: string
  data?: unknown
  detail?: {
    error?: string
    text?: string
    payload?: {
      code?: number
      msg?: string
      message?: string
      error?: string
    }
  }
  upstreamStatus?: number | null
  proxyStatus?: number
}

export async function pushEngineerAssistantProcesses(
  data: PushEngineerAssistantProcessesBody,
  headers?: Record<string, string>
): Promise<ApiResponse<EngineerAssistantWriteOk>> {
  return http.post<EngineerAssistantWriteOk>('/external/assistant/push-processes/', data, headers)
}

export async function pushEngineerAssistantEquipment(
  data: PushEngineerAssistantEquipmentBody,
  headers?: Record<string, string>
): Promise<ApiResponse<EngineerAssistantWriteOk>> {
  return http.post<EngineerAssistantWriteOk>('/external/assistant/push-equipment/', data, headers)
}

export async function pushEngineerAssistantSchedules(
  data: PushEngineerAssistantSchedulesBody,
  headers?: Record<string, string>
): Promise<ApiResponse<EngineerAssistantWriteOk>> {
  return http.post<EngineerAssistantWriteOk>('/external/assistant/push-schedules/', data, headers)
}

export async function changeEngineerAssistantStatus(
  data: ChangeEngineerAssistantStatusBody,
  headers?: Record<string, string>
): Promise<ApiResponse<EngineerAssistantWriteOk>> {
  return http.post<EngineerAssistantWriteOk>('/external/assistant/change-status/', data, headers)
}

export async function pushEngineerAssistantReports(
  data: PushEngineerAssistantReportsBody,
  headers?: Record<string, string>
): Promise<ApiResponse<EngineerAssistantWriteOk>> {
  return http.post<EngineerAssistantWriteOk>('/external/assistant/push-reports/', data, headers)
}

export type EngineerAssistantTimeRange = {
  startAtHour: string
  endAtHour: string
}

export async function pushHighTempBoxScheduleToEngineerAssistant(
  args: { testId: string; testType: string; equipmentId: string; timeRange: EngineerAssistantTimeRange },
  headers?: Record<string, string>
): Promise<ApiResponse<EngineerAssistantWriteOk>> {
  return pushEngineerAssistantSchedules(
    {
      schedulesInfo: [
        {
          testId: args.testId,
          testType: args.testType,
          equipmentId: args.equipmentId,
          startTime: args.timeRange.startAtHour,
          endTime: args.timeRange.endAtHour,
        },
      ],
    },
    headers
  )
}

export async function pushHighTempPressureScheduleToEngineerAssistant(
  args: { testId: string; testType: string; equipmentId: string; timeRange: EngineerAssistantTimeRange },
  headers?: Record<string, string>
): Promise<ApiResponse<EngineerAssistantWriteOk>> {
  return pushEngineerAssistantSchedules(
    {
      schedulesInfo: [
        {
          testId: args.testId,
          testType: args.testType,
          equipmentId: args.equipmentId,
          startTime: args.timeRange.startAtHour,
          endTime: args.timeRange.endAtHour,
        },
      ],
    },
    headers
  )
}

export async function pushVibrationScheduleToEngineerAssistant(
  args: { testId: string; testType: string; equipmentId: string; timeRange: EngineerAssistantTimeRange },
  headers?: Record<string, string>
): Promise<ApiResponse<EngineerAssistantWriteOk>> {
  return pushEngineerAssistantSchedules(
    {
      schedulesInfo: [
        {
          testId: args.testId,
          testType: args.testType,
          equipmentId: args.equipmentId,
          startTime: args.timeRange.startAtHour,
          endTime: args.timeRange.endAtHour,
        },
      ],
    },
    headers
  )
}
