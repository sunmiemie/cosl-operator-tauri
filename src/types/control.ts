/**
 * Control widget types for interactive parameter editing
 * Adapted from studio-main for Vue components
 */
import { z } from 'zod'
import type { Component } from 'vue'
import type { NodeProps as VueFlowNodeProps } from '@vue-flow/core'
import type { ValuesOf } from './util'

// ========== Python Types ==========

/**
 * Python parameter types
 */
export const PYTHON_TYPES = ['int', 'float', 'bool', 'select', 'File'] as const
export const PythonType = z.enum(PYTHON_TYPES)
export type PythonType = z.infer<typeof PythonType>

// ========== Widget Configurations ==========

/**
 * Slider widget configuration
 */
export const SliderConfig = z.object({
  type: z.literal('slider'),
  min: z.number(),
  max: z.number(),
  step: z.number().positive(),
  floating: z.boolean().optional(),
})
export type SliderConfig = z.infer<typeof SliderConfig>

/**
 * Knob widget configuration
 */
export const KnobConfig = z.object({
  type: z.literal('knob'),
  min: z.number(),
  max: z.number(),
  step: z.number().positive(),
  floating: z.boolean().optional(),
})
export type KnobConfig = z.infer<typeof KnobConfig>

/**
 * File filter validation
 */
const isValidFileFilter = (filter: string) => {
  if (filter === '') return true
  const extensionPattern = /^\.[a-zA-Z0-9]+$/
  const patternPattern = /^[a-zA-Z0-9]+\/.*$/
  return extensionPattern.test(filter) || patternPattern.test(filter)
}

/**
 * File upload widget configuration
 */
export const FileUploadConfig = z.object({
  type: z.literal('file upload'),
  allowedExtensions: z.array(
    z.object({
      ext: z
        .string()
        .transform((s) => s.trim())
        .refine(isValidFileFilter, {
          message: 'Invalid file filter. Must be in the form ".ext" or "type/*"',
        }),
    })
  ),
})
export type FileUploadConfig = z.infer<typeof FileUploadConfig>

/**
 * Number input widget configuration
 */
export const NumberInputConfig = z.object({
  type: z.literal('number input'),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
})
export type NumberInputConfig = z.infer<typeof NumberInputConfig>

// ========== Widget Entry Type ==========

/**
 * Widget entry structure
 */
export type WidgetEntry = {
  /** Vue component for the widget */
  component: Component
  /** Allowed Python types for this widget */
  allowedTypes: PythonType[]
  /** Icon name (mdi icon string for @iconify/vue) */
  icon: string
  /** Display label */
  label: string
}

// ========== Widget Registry ==========

/**
 * Widget type names
 */
export const WIDGET_TYPES = [
  'slider',
  'number input',
  'file upload',
  'checkbox',
  'switch',
  'combobox',
  'radio group',
  'knob',
] as const

export type WidgetType = (typeof WIDGET_TYPES)[number]

/**
 * Check if a value is a valid widget type
 */
export function isWidgetType(value: string): value is WidgetType {
  return WIDGET_TYPES.includes(value as WidgetType)
}

/**
 * Widget configurations map
 */
export const WIDGET_CONFIGS = {
  slider: {
    schema: SliderConfig,
    defaultValues: {
      type: 'slider' as const,
      min: 0,
      max: 100,
      step: 1,
    },
  },
  knob: {
    schema: KnobConfig,
    defaultValues: {
      type: 'knob' as const,
      min: 0,
      max: 100,
      step: 1,
    },
  },
  'file upload': {
    schema: FileUploadConfig,
    defaultValues: {
      type: 'file upload' as const,
      allowedExtensions: [{ ext: '' }],
    },
  },
  'number input': {
    schema: NumberInputConfig,
    defaultValues: {
      type: 'number input' as const,
      min: undefined,
      max: undefined,
      step: 1,
    },
  },
} as const

export type Configurable = keyof typeof WIDGET_CONFIGS

/**
 * Check if widget type is configurable
 */
export function isConfigurable(widgetType: WidgetType): widgetType is Configurable {
  return widgetType in WIDGET_CONFIGS
}

/**
 * Get config schema for widget type
 */
type GetConfigSchemas<T> = {
  [K in keyof T]: T[K] extends { schema: infer S }
    ? S extends z.ZodType
      ? z.infer<S>
      : never
    : never
}
export type ConfigMap = GetConfigSchemas<typeof WIDGET_CONFIGS>
export type WidgetConfig = ValuesOf<ConfigMap>

// ========== Widget Block Info ==========

/**
 * Widget block info schema
 */
export const WidgetBlockInfo = z.object({
  blockId: z.string(),
  blockParameter: z.string(),
  widgetType: z.enum(WIDGET_TYPES),
})
export type WidgetBlockInfo = z.infer<typeof WidgetBlockInfo>

// ========== Widget Data ==========

/**
 * Widget node data
 */
export type WidgetData<T extends WidgetConfig | undefined = WidgetConfig | undefined> = {
  /** ID of the connected block */
  blockId: string
  /** Parameter name in the block */
  blockParameter: string
  /** Display label */
  label?: string
  /** Widget-specific configuration */
  config: T
}

/**
 * Widget node props
 */
export type WidgetProps<T extends WidgetConfig | undefined = WidgetConfig | undefined> =
  VueFlowNodeProps<WidgetData<T>>

// ========== Visualization Types ==========

/**
 * Flojoy output types
 */
export const FLOJOY_TYPES = ['Scalar', 'Plotly'] as const
export const FlojoyType = z.enum(FLOJOY_TYPES)
export type FlojoyType = z.infer<typeof FlojoyType>

/**
 * Visualization entry structure
 */
export type VisualizationEntry = {
  /** Vue component for the visualization */
  component: Component
  /** Allowed Flojoy types */
  allowedTypes: FlojoyType[]
  /** Icon name */
  icon: string
  /** Display label */
  label: string
}

/**
 * Visualization type names
 */
export const VISUALIZATION_TYPES = ['seven segment display', 'mirror'] as const
export type VisualizationType = (typeof VISUALIZATION_TYPES)[number]

/**
 * Visualization node data
 */
export type VisualizationData = {
  /** ID of the connected block */
  blockId: string
  /** Output name in the block */
  blockOutput: string
  /** Display label */
  label?: string
  /** Visualization type */
  visualizationType: VisualizationType
}

/**
 * Visualization node props
 */
export type VisualizationProps = VueFlowNodeProps<VisualizationData>

// ========== Control Text Node ==========

/**
 * Control panel text label node data
 */
export type ControlTextData = {
  text: string
  fontSize?: number
  color?: string
}

/**
 * Control text node props
 */
export type ControlTextProps = VueFlowNodeProps<ControlTextData>

// ========== Helper Functions ==========

/**
 * Get default widget type for Python type
 */
export function getDefaultWidgetForType(pythonType: PythonType): WidgetType {
  const defaults: Record<PythonType, WidgetType> = {
    int: 'number input',
    float: 'slider',
    bool: 'checkbox',
    select: 'combobox',
    File: 'file upload',
  }
  return defaults[pythonType]
}

/**
 * Get allowed widget types for Python type
 */
export function getAllowedWidgetsForType(pythonType: PythonType): WidgetType[] {
  const allowedMap: Record<PythonType, WidgetType[]> = {
    int: ['slider', 'number input', 'knob'],
    float: ['slider', 'number input', 'knob'],
    bool: ['checkbox', 'switch'],
    select: ['combobox', 'radio group'],
    File: ['file upload'],
  }
  return allowedMap[pythonType]
}
