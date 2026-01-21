/**
 * 视觉测试公共组件统一导出
 */
export { default as DeviceCheckOverlay } from './DeviceCheckOverlay.vue'
export { default as OrderTable } from './OrderTable.vue'
export { default as ScanDisplay } from './ScanDisplay.vue'
export { default as CountdownDialog } from './CountdownDialog.vue'
export { default as HistoryReportPanel } from './HistoryReportPanel.vue'
export { default as DownloadProgress } from './DownloadProgress.vue'
export { default as TestStepDisplay } from './TestStepDisplay.vue'
export { default as ResultSelector } from './ResultSelector.vue'
export { default as ReportPreview } from './ReportPreview.vue'
export { default as StepProcess } from './StepProcess.vue'
export { default as PicProcess } from './PicProcess.vue'
export { default as TempTestProcess } from './TempTestProcess.vue'
export { default as ReportPreviewDialog } from './ReportPreviewDialog.vue'

// 导出类型
export type { StepItem } from './StepProcess.vue'
export type { PicItem } from './PicProcess.vue'
export type { TempTestItem, TempReportJson } from './TempTestProcess.vue'
