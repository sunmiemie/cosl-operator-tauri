/**
 * Plotly data formatting utilities
 * Handles data transformation for different chart types
 */
import type { OverridePlotData } from '@/types'

const NUM_OF_COLUMNS = 4
const NUM_OF_ROWS = 20
const MATRIX_COLUMNS = 4

/**
 * Format plotly data with theme-aware styling
 */
export function formatPlotlyData(
  data: OverridePlotData,
  theme: 'light' | 'dark',
  isThumbnail?: boolean
): OverridePlotData {
  const headerFillColor = theme === 'light' ? '#ffffff' : '#191919'
  const cellFillColor = 'transparent'
  const matrixFontColor = theme === 'dark' ? '#f8f9fa' : '#111111'
  const accentColor = theme === 'dark' ? '#99f5ff' : '#7b61ff'

  return data.map((d, dIndex) => {
    // Handle table type
    if (d.type === 'table') {
      return {
        ...d,
        header: {
          ...d.header,
          align: 'center',
          values: isThumbnail
            ? d.header?.values?.filter(
                (_: unknown, i: number) => i < NUM_OF_COLUMNS
              )
            : d.header?.values,
          fill: {
            color: d.header?.values?.length ? headerFillColor : 'transparent',
          },
        },
        cells: {
          ...d.cells,
          align: 'center',
          values: isThumbnail
            ? (d.cells?.values as unknown[][])
                ?.filter(
                  (_: unknown, i: number) =>
                    i < (d.header?.values?.length ? NUM_OF_COLUMNS : MATRIX_COLUMNS)
                )
                .map((row) =>
                  (row as unknown[])?.filter(
                    (_: unknown, index: number) =>
                      index < (d.header?.values?.length ? NUM_OF_ROWS : MATRIX_COLUMNS)
                  )
                )
            : d.cells?.values,
          fill: {
            color: cellFillColor,
          },
          ...(!d.header?.values?.length && {
            font: { color: matrixFontColor },
          }),
          ...(isThumbnail && {
            height: 40,
          }),
        },
      }
    }

    // Apply accent color to first trace
    if (dIndex === 0) {
      return {
        ...d,
        marker: {
          ...d.marker,
          color: d.marker?.color ?? accentColor,
        },
        line: {
          ...d.line,
          color: d.line?.color ?? accentColor,
        },
      }
    }

    return d
  })
}

/**
 * Check if data represents a matrix (table without headers)
 */
export function isMatrixData(data: OverridePlotData): boolean {
  return data[0]?.type === 'table' && !data[0]?.header?.values?.length
}

/**
 * Check if data is a 3D plot
 */
export function is3DPlot(data: OverridePlotData): boolean {
  const types = new Set(['surface', 'scatter3d', 'mesh3d', 'cone', 'streamtube', 'isosurface', 'volume'])
  return data.some(trace => types.has(String(trace?.type)))
}

/**
 * Get the primary plot type
 */
export function getPlotType(data: OverridePlotData): string | undefined {
  return data[0]?.type as string | undefined
}

/**
 * Check if data contains any traces
 */
export function hasData(data: OverridePlotData): boolean {
  return Array.isArray(data) && data.length > 0
}
