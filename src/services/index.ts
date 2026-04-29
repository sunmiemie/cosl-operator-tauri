/**
 * 服务模块导出
 * 统一管理所有 API 服务
 */

// HTTP 客户端（基础请求）
export { http } from './http'
export type { ApiResponse } from './http'

// 工单服务
export { orderApi, OrderStatus, OrderType } from './order'
export type { TestUnit } from './order'

// 工艺服务
export { processApi } from './process'
export type { 
  ProcessData, 
  ProcessStep, 
  ProcessJson,
  ProcessArea,
  ProcessPoint,
  TempOrderData, 
  TempTestItem,
  FeedbackData, 
  QuestionData,
  ProgressCallback,
} from './process'

// 报告服务
export { reportApi } from './report'
export type { 
  TestReport, 
  ReportData,
  ReportJson,
  ReportSection,
  ReportArea,
  ReportPoint,
  ReportUploadParams,
  TempReportUploadParams,
  HistoryReportParams, 
} from './report'

export {
  getEngineerAssistantUsers,
  getEngineerAssistantTestTypes,
  getEngineerAssistantTestStatuses,
  getEngineerAssistantApplicationForms,
  getEngineerAssistantApplicationFormDetail,
  pushEngineerAssistantProcesses,
  pushEngineerAssistantEquipment,
  pushEngineerAssistantSchedules,
  changeEngineerAssistantStatus,
  pushEngineerAssistantReports,
  resolveEngineerAssistantTestTypeId,
  pushHighTempBoxScheduleToEngineerAssistant,
  pushHighTempPressureScheduleToEngineerAssistant,
  pushVibrationScheduleToEngineerAssistant,
} from './engineer-assistant-api'

export type {
  EngineerAssistantUser,
  EngineerAssistantTestType,
  EngineerAssistantTestStatus,
  EngineerAssistantApplicationForm,
  EngineerAssistantScheduleInfo,
  EngineerAssistantTimeRange,
  PushEngineerAssistantProcessesBody,
  PushEngineerAssistantEquipmentBody,
  PushEngineerAssistantSchedulesBody,
  ChangeEngineerAssistantStatusBody,
  PushEngineerAssistantReportsBody,
} from './engineer-assistant-api'

// 工时统计服务
export { 
  worktimeApi, 
  startWorktime, 
  stopWorktime, 
  getWorktimeState, 
  getElapsedSeconds, 
  isTracking 
} from './worktime'

