/**
 * Plotly layout configuration
 * Provides theme-aware default layouts for charts
 */
import type { Layout } from 'plotly.js-dist-min'

/**
 * Default margin configuration
 */
export const DEFAULT_MARGIN = {
  l: 32,
  b: 32,
  r: 32,
  t: 32,
}

/**
 * Matrix plot size for thumbnails
 */
export const MATRIX_SIZE = {
  width: 240,
  height: 260,
}

/**
 * Get accent color for theme
 */
export function getAccentColor(theme: 'dark' | 'light'): string {
  return theme === 'dark' ? '#99f5ff' : '#7b61ff'
}

/**
 * Get plot background color for theme
 */
export function getPlotBackgroundColor(theme: 'dark' | 'light'): string {
  return theme === 'light' ? '#fafafa' : '#171717'
}

/**
 * Create default plot layout for theme
 */
export function createPlotLayout(theme: 'dark' | 'light'): Partial<Layout> {
  const accentColor = getAccentColor(theme)
  const plotBackgroundColor = getPlotBackgroundColor(theme)

  return {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: plotBackgroundColor,
    autosize: true,
    font: { color: accentColor },
    margin: DEFAULT_MARGIN,
    xaxis: {
      gridcolor: theme === 'dark' ? '#333333' : '#e5e5e5',
      zerolinecolor: theme === 'dark' ? '#444444' : '#cccccc',
    },
    yaxis: {
      gridcolor: theme === 'dark' ? '#333333' : '#e5e5e5',
      zerolinecolor: theme === 'dark' ? '#444444' : '#cccccc',
    },
  }
}

/**
 * Create thumbnail-optimized layout
 */
export function createThumbnailLayout(theme: 'dark' | 'light'): Partial<Layout> {
  const baseLayout = createPlotLayout(theme)

  return {
    ...baseLayout,
    showlegend: false,
    margin: { l: 0, b: 0, r: 0, t: 30 },
    xaxis: {
      ...baseLayout.xaxis,
      visible: false,
    },
    yaxis: {
      ...baseLayout.yaxis,
      visible: false,
    },
  }
}

/**
 * Merge layouts with proper deep merge for axes
 */
export function mergeLayouts(
  base: Partial<Layout>,
  override: Partial<Layout> | undefined
): Partial<Layout> {
  if (!override) return base

  return {
    ...base,
    ...override,
    margin: {
      ...base.margin,
      ...override.margin,
    },
    xaxis: {
      ...base.xaxis,
      ...override.xaxis,
    },
    yaxis: {
      ...base.yaxis,
      ...override.yaxis,
    },
  }
}
