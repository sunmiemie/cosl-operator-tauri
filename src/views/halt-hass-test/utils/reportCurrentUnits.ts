import type {
  HaltHassChartSummary,
  HaltHassPeriodicRecord,
  HaltHassReportJson,
} from '../types'

function toMilliamps(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null
  return Number((value * 1000).toFixed(6))
}

function normalizeRecords(records?: HaltHassPeriodicRecord[]): HaltHassPeriodicRecord[] | undefined {
  return records?.map(record => ({
    ...record,
    current48v: toMilliamps(record.current48v),
    current90v: toMilliamps(record.current90v),
  }))
}

function normalizeSummary(summary?: HaltHassChartSummary): HaltHassChartSummary | undefined {
  if (!summary) return undefined
  return {
    ...summary,
    current48v: summary.current48v.map(point => ({ ...point, value: toMilliamps(point.value) })),
    current90v: summary.current90v.map(point => ({ ...point, value: toMilliamps(point.value) })),
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
