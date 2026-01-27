/**
 * Plotly visualization types
 * Adapted for Vue + plotly.js integration
 */
import type { Data as PlotData, Layout, Config } from 'plotly.js-dist-min'

/**
 * Extended plot data with table support
 */
export type OverridePlotData = Array<
  Partial<PlotData> & {
    header?: {
      values?: unknown[]
      fill: {
        color: string
      }
    }
    cells?: {
      values?: unknown[]
      fill: { color: string }
    }
  }
>

/**
 * Plotly figure data structure (from Python backend)
 */
export type PlotlyFigure = {
  data: OverridePlotData
  layout?: Partial<Layout>
}

/**
 * Props for PlotlyChart component
 */
export type PlotProps = {
  data: OverridePlotData
  layout?: Partial<Layout>
  config?: Partial<Config>
  isThumbnail?: boolean
  theme?: 'light' | 'dark'
  id?: string
  class?: string
  style?: Record<string, string>
}

/**
 * Default Plotly configuration
 */
export const defaultPlotlyConfig: Partial<Config> = {
  responsive: true,
  displayModeBar: true,
  modeBarButtonsToRemove: ['lasso2d', 'select2d'],
  displaylogo: false,
}

/**
 * Get Plotly layout for theme
 */
export function getThemedLayout(
  theme: 'light' | 'dark',
  baseLayout?: Partial<Layout>
): Partial<Layout> {
  const isDark = theme === 'dark'

  const themeLayout: Partial<Layout> = {
    paper_bgcolor: isDark ? '#1f2937' : '#ffffff',
    plot_bgcolor: isDark ? '#374151' : '#f9fafb',
    font: {
      color: isDark ? '#f3f4f6' : '#1f2937',
    },
    xaxis: {
      gridcolor: isDark ? '#4b5563' : '#e5e7eb',
      zerolinecolor: isDark ? '#6b7280' : '#d1d5db',
    },
    yaxis: {
      gridcolor: isDark ? '#4b5563' : '#e5e7eb',
      zerolinecolor: isDark ? '#6b7280' : '#d1d5db',
    },
  }

  return {
    ...themeLayout,
    ...baseLayout,
    xaxis: { ...themeLayout.xaxis, ...baseLayout?.xaxis },
    yaxis: { ...themeLayout.yaxis, ...baseLayout?.yaxis },
  }
}

/**
 * Default layout for thumbnail plots
 */
export const thumbnailLayout: Partial<Layout> = {
  margin: { l: 20, r: 20, t: 20, b: 20 },
  showlegend: false,
  xaxis: { visible: false },
  yaxis: { visible: false },
}
