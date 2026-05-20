/**
 * Block execution result types
 */
import type { PlotlyFigure } from './plotly'
import type { DataContainer } from './data-container'

/**
 * Block execution result
 * Contains the output data from running a block
 */
export type BlockResult = {
  /** Plotly figure output */
  plotly_fig?: PlotlyFigure
  /** Text output */
  text_blob?: string
  /** Structured data output */
  data?: DataContainer
  /** Additional metadata */
  extra?: Record<string, unknown>
}

/**
 * Node result entry in results map
 */
export type NodeResult = {
  nodeId: string
  result: BlockResult
  timestamp: number
  error?: string
}

/**
 * Check if result has plotly figure
 */
export function hasPlotlyFigure(result: BlockResult): boolean {
  return !!result.plotly_fig?.data?.length
}

/**
 * Check if result has text blob
 */
export function hasTextBlob(result: BlockResult): boolean {
  return !!result.text_blob
}

/**
 * Check if result has data container
 */
export function hasDataContainer(result: BlockResult): boolean {
  return !!result.data
}

/**
 * Get primary result type
 */
export function getResultType(result: BlockResult): 'plotly' | 'text' | 'data' | 'empty' {
  if (hasPlotlyFigure(result)) return 'plotly'
  if (hasTextBlob(result)) return 'text'
  if (hasDataContainer(result)) return 'data'
  return 'empty'
}

/**
 * Format result for display
 */
export function formatResultPreview(result: BlockResult): string {
  if (result.text_blob) {
    return result.text_blob.slice(0, 100) + (result.text_blob.length > 100 ? '...' : '')
  }
  if (result.data) {
    return `${result.data.type} data`
  }
  if (result.plotly_fig) {
    return 'Plotly figure'
  }
  return 'No result'
}
