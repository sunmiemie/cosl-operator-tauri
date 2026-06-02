import type {
  HaltHassChartSummary,
  HaltHassPeriodicRecord,
  HaltHassReportJson,
} from '../types'

function toMilliamps(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null
  const converted = value * 1000
  return Number.isFinite(converted) ? Number(converted.toFixed(6)) : null
}

function normalizeRecords(records?: HaltHassPeriodicRecord[]): HaltHassPeriodicRecord[] | undefined {
  return Array.isArray(records) ? records.filter(record => record && typeof record === 'object').map(record => ({
    ...record,
    current48v: toMilliamps(record.current48v),
    current90v: toMilliamps(record.current90v),
  })) : undefined
}

function normalizeSummary(summary?: HaltHassChartSummary): HaltHassChartSummary | undefined {
  if (!summary) return undefined
  return {
    ...summary,
    current48v: (Array.isArray(summary.current48v) ? summary.current48v : [])
      .filter(point => point && typeof point === 'object').map(point => ({ ...point, value: toMilliamps(point.value) })),
    current90v: (Array.isArray(summary.current90v) ? summary.current90v : [])
      .filter(point => point && typeof point === 'object').map(point => ({ ...point, value: toMilliamps(point.value) })),
  }
}

export function normalizeHaltHassReportCurrentsToMa(report: HaltHassReportJson): HaltHassReportJson {
  if (report.reportType === 'rectifier_regulator') {
    return {
      ...report,
      currentUnit: 'A',
      rectifierReport: report.rectifierReport
        ? { ...report.rectifierReport, currentUnit: 'A' }
        : report.rectifierReport,
    }
  }
  if (report.currentUnit === 'mA') return report

  const testData = report.testData ? { ...report.testData } : undefined
  if (testData) {
    if (Array.isArray(testData.periodicRecords)) {
      testData.periodicRecords = normalizeRecords(testData.periodicRecords as HaltHassPeriodicRecord[])
    }
    if (testData.chartSummary && typeof testData.chartSummary === 'object') {
      testData.chartSummary = normalizeSummary(testData.chartSummary as HaltHassChartSummary)
    }
  }

  return {
    ...report,
    currentUnit: 'mA',
    testData,
    periodicRecords: normalizeRecords(report.periodicRecords),
    chartSummary: normalizeSummary(report.chartSummary),
  }
}
