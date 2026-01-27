/**
 * Widget Registry
 * Central registry for all control panel widgets and visualizations
 */
import { markRaw, type Component } from 'vue'
import type {
  WidgetType,
  WidgetEntry,
  VisualizationType,
  VisualizationEntry,
  PythonType,
  FlojoyType,
} from '@/types'

// Widget components
import SliderWidget from './widgets/SliderWidget.vue'
import NumberInputWidget from './widgets/NumberInputWidget.vue'
import FileUploadWidget from './widgets/FileUploadWidget.vue'
import CheckboxWidget from './widgets/CheckboxWidget.vue'
import SwitchWidget from './widgets/SwitchWidget.vue'
import ComboboxWidget from './widgets/ComboboxWidget.vue'
import RadioGroupWidget from './widgets/RadioGroupWidget.vue'
import KnobWidget from './widgets/KnobWidget.vue'

// Visualization components
import SevenSegmentDisplay from './visualization/SevenSegmentDisplay.vue'
import MirrorViewer from './visualization/MirrorViewer.vue'

/**
 * Widget registry with component references
 */
export const WIDGETS: Record<WidgetType, WidgetEntry> = {
  slider: {
    component: markRaw(SliderWidget),
    allowedTypes: ['int', 'float'],
    icon: 'sliders-horizontal',
    label: '滑块',
  },
  'number input': {
    component: markRaw(NumberInputWidget),
    allowedTypes: ['int', 'float'],
    icon: 'text-cursor-input',
    label: '数字输入',
  },
  'file upload': {
    component: markRaw(FileUploadWidget),
    allowedTypes: ['File'],
    icon: 'file',
    label: '文件上传',
  },
  checkbox: {
    component: markRaw(CheckboxWidget),
    allowedTypes: ['bool'],
    icon: 'square-check',
    label: '复选框',
  },
  switch: {
    component: markRaw(SwitchWidget),
    allowedTypes: ['bool'],
    icon: 'toggle-right',
    label: '开关',
  },
  combobox: {
    component: markRaw(ComboboxWidget),
    allowedTypes: ['select'],
    icon: 'chevrons-up-down',
    label: '下拉选择',
  },
  'radio group': {
    component: markRaw(RadioGroupWidget),
    allowedTypes: ['select'],
    icon: 'circle-dot',
    label: '单选组',
  },
  knob: {
    component: markRaw(KnobWidget),
    allowedTypes: ['int', 'float'],
    icon: 'gauge',
    label: '旋钮',
  },
}

/**
 * Visualization registry with component references
 */
export const VISUALIZATIONS: Record<VisualizationType, VisualizationEntry> = {
  'seven segment display': {
    component: markRaw(SevenSegmentDisplay),
    allowedTypes: ['Scalar'],
    icon: 'square',
    label: '数码管',
  },
  mirror: {
    component: markRaw(MirrorViewer),
    allowedTypes: ['Plotly'],
    icon: 'scatter-chart',
    label: '图表镜像',
  },
}

/**
 * Get widget component by type
 */
export function getWidgetComponent(widgetType: WidgetType): Component | undefined {
  return WIDGETS[widgetType]?.component
}

/**
 * Get visualization component by type
 */
export function getVisualizationComponent(vizType: VisualizationType): Component | undefined {
  return VISUALIZATIONS[vizType]?.component
}

/**
 * Get available widgets for a Python type
 */
export function getWidgetsForPythonType(pythonType: PythonType): WidgetType[] {
  return (Object.entries(WIDGETS) as [WidgetType, WidgetEntry][])
    .filter(([, entry]) => entry.allowedTypes.includes(pythonType))
    .map(([type]) => type)
}

/**
 * Get available visualizations for a Flojoy type
 */
export function getVisualizationsForFlojoyType(flojoyType: FlojoyType): VisualizationType[] {
  return (Object.entries(VISUALIZATIONS) as [VisualizationType, VisualizationEntry][])
    .filter(([, entry]) => entry.allowedTypes.includes(flojoyType))
    .map(([type]) => type)
}

/**
 * Get all widget types
 */
export function getAllWidgetTypes(): WidgetType[] {
  return Object.keys(WIDGETS) as WidgetType[]
}

/**
 * Get all visualization types
 */
export function getAllVisualizationTypes(): VisualizationType[] {
  return Object.keys(VISUALIZATIONS) as VisualizationType[]
}

/**
 * Check if a widget type exists
 */
export function isValidWidgetType(type: string): type is WidgetType {
  return type in WIDGETS
}

/**
 * Check if a visualization type exists
 */
export function isValidVisualizationType(type: string): type is VisualizationType {
  return type in VISUALIZATIONS
}
