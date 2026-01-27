/**
 * Edge type variants for flowchart connections
 * Different data types that can flow between nodes
 */

export type EdgeVariant =
  | 'dataframe'
  | 'boolean'
  | 'scalar'
  | 'text'
  | 'vector'
  | 'matrix'
  | 'orderedpair'
  | 'orderedtriple'
  | 'string'
  | 'any'

/**
 * Edge data attached to flowchart edges
 */
export type EdgeData = {
  outputType: EdgeVariant
}

/**
 * Get edge color based on variant type
 */
export function getEdgeColor(variant: EdgeVariant): string {
  const colors: Record<EdgeVariant, string> = {
    dataframe: '#3b82f6',    // blue
    boolean: '#ef4444',      // red
    scalar: '#22c55e',       // green
    text: '#f59e0b',         // amber
    vector: '#8b5cf6',       // violet
    matrix: '#ec4899',       // pink
    orderedpair: '#06b6d4',  // cyan
    orderedtriple: '#14b8a6', // teal
    string: '#f97316',       // orange
    any: '#6b7280',          // gray
  }
  return colors[variant] || colors.any
}
