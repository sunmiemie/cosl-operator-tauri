/**
 * Plotly theme utilities
 * Handles theme detection and application
 */

export type PlotlyTheme = 'light' | 'dark'

/**
 * Color palette for different themes
 */
export const THEME_COLORS = {
  light: {
    accent: '#7b61ff',
    background: '#fafafa',
    paper: 'rgba(0,0,0,0)',
    grid: '#e5e5e5',
    zeroline: '#cccccc',
    text: '#333333',
    headerFill: '#ffffff',
    matrixFont: '#111111',
  },
  dark: {
    accent: '#99f5ff',
    background: '#171717',
    paper: 'rgba(0,0,0,0)',
    grid: '#333333',
    zeroline: '#444444',
    text: '#f8f9fa',
    headerFill: '#191919',
    matrixFont: '#f8f9fa',
  },
} as const

/**
 * Get colors for a specific theme
 */
export function getThemeColors(theme: PlotlyTheme) {
  return THEME_COLORS[theme]
}

/**
 * Detect system theme preference
 */
export function detectSystemTheme(): PlotlyTheme {
  if (typeof window === 'undefined') return 'light'

  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

/**
 * Create a theme change listener
 */
export function onThemeChange(callback: (theme: PlotlyTheme) => void): () => void {
  if (typeof window === 'undefined') {
    return () => {}
  }

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = (e: MediaQueryListEvent) => {
    callback(e.matches ? 'dark' : 'light')
  }

  mediaQuery.addEventListener('change', handler)
  return () => mediaQuery.removeEventListener('change', handler)
}

/**
 * Color scales for heatmaps
 */
export const COLOR_SCALES = {
  viridis: 'Viridis',
  plasma: 'Plasma',
  inferno: 'Inferno',
  magma: 'Magma',
  cividis: 'Cividis',
  blues: 'Blues',
  reds: 'Reds',
  greens: 'Greens',
} as const

export type ColorScale = keyof typeof COLOR_SCALES
