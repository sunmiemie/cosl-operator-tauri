/**
 * ECharts 统一注册入口。
 *
 * 项目内禁止混用 `echarts` 完整包与 `echarts/core` 按需包，否则在 Vite
 * 的懒加载场景中可能重复注册同一图表组件。
 */
import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart, ScatterChart  } from 'echarts/charts'
import {
  DataZoomComponent,
  GraphicComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  CanvasRenderer,
  LineChart,
  BarChart,
  PieChart,
  ScatterChart,
  DataZoomComponent,
  GraphicComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TitleComponent,
  TooltipComponent,
])

export { echarts }
