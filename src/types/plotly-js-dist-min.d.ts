declare module 'plotly.js-dist-min' {
  export type Data = Record<string, any>
  export type Layout = Record<string, any>
  export type Config = Record<string, any>

  export type PlotlyHTMLElement = HTMLDivElement & {
    on: (eventName: string, handler: (eventData: unknown) => void) => void
  }

  const Plotly: {
    newPlot: (
      root: HTMLElement,
      data: Data[],
      layout?: Partial<Layout>,
      config?: Partial<Config>
    ) => Promise<PlotlyHTMLElement>
    react: (
      root: HTMLElement,
      data: Data[],
      layout?: Partial<Layout>,
      config?: Partial<Config>
    ) => Promise<PlotlyHTMLElement>
    purge: (root: HTMLElement) => void
    Plots: {
      resize: (root: HTMLElement) => Promise<void>
    }
  }

  export default Plotly
}
