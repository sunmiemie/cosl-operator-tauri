/**
 * Block data types for flowchart nodes
 */
import type { NodeProps as VueFlowNodeProps } from '@vue-flow/core'
import type { BlockDefinition, BlockParameterValue } from './manifest'
import type { EdgeVariant } from './edge'
import type { Nullish } from './util'
import { z } from 'zod'

// ========== Control Data ==========

/**
 * Control data for block parameters
 * Maps parameter names to their current values and metadata
 */
export type CtrlData = Record<
  string,
  {
    functionName: string
    param: string
    value: BlockParameterValue
    type?: string
    default?: BlockParameterValue
    options?: (string | number)[]
    desc?: string | null
  }
>

// ========== Block Data ==========

/**
 * Block node data for flowchart
 */
export type BlockData = {
  /** Unique block instance ID */
  id: string
  /** Display label */
  label: string
  /** Block type (DATA, HARDWARE, etc.) */
  type: string
  /** Function key (e.g., LINSPACE, SINE) */
  func: string
  /** Path to block in manifest */
  path: string
  /** Whether the block is currently running */
  running?: boolean
  /** Whether the block has failed */
  failed?: boolean
  /** Block parameter controls */
  ctrls: CtrlData
  /** Initialization parameter controls */
  initCtrls?: CtrlData
  /** Block inputs definition */
  inputs?: BlockDefinition['inputs']
  /** Block outputs definition */
  outputs?: BlockDefinition['outputs']
  /** Required pip dependencies */
  pip_dependencies?: {
    name: string
    v: Nullish<string>
  }[]
  /** Whether the block configuration is invalid */
  invalid?: boolean
}

/**
 * Vue Flow node props for block nodes
 */
export type BlockProps = VueFlowNodeProps<BlockData>

// ========== Text Node Data ==========

/**
 * Text annotation node data
 */
export type TextData = {
  text: string
  fontSize?: number
  fontWeight?: 'normal' | 'bold'
  color?: string
}

/**
 * Vue Flow node props for text nodes
 */
export type TextProps = VueFlowNodeProps<TextData>

// ========== Edge Data ==========

/**
 * Edge data for flowchart connections
 */
export type EdgeData = {
  outputType: EdgeVariant
}

// ========== Position Schema ==========

/**
 * Position schema for node coordinates
 */
export const positionSchema = z.object({
  x: z.number(),
  y: z.number(),
})

export type Position = z.infer<typeof positionSchema>

// ========== Node Run State ==========

/**
 * Node execution state
 */
export type NodeRunState = 'idle' | 'pending' | 'running' | 'success' | 'error'

/**
 * Node with run state
 */
export type NodeWithState = BlockData & {
  runState: NodeRunState
  errorMessage?: string
}

// ========== Helper Functions ==========

/**
 * Create initial ctrl data from block definition
 */
export function createCtrlDataFromDefinition(
  definition: BlockDefinition
): CtrlData {
  const ctrls: CtrlData = {}

  if (definition.parameters) {
    for (const [paramName, param] of Object.entries(definition.parameters)) {
      ctrls[paramName] = {
        functionName: definition.key,
        param: paramName,
        value: param.default,
        type: param.type,
        default: param.default,
        options: param.options,
        desc: param.desc,
      }
    }
  }

  return ctrls
}

/**
 * Create block data from block definition
 */
export function createBlockDataFromDefinition(
  id: string,
  definition: BlockDefinition
): BlockData {
  return {
    id,
    label: definition.name,
    type: definition.type,
    func: definition.key,
    path: definition.key,
    ctrls: createCtrlDataFromDefinition(definition),
    initCtrls: definition.init_parameters
      ? createInitCtrlDataFromDefinition(definition)
      : undefined,
    inputs: definition.inputs,
    outputs: definition.outputs,
    pip_dependencies: definition.pip_dependencies,
    running: false,
    failed: false,
    invalid: false,
  }
}

/**
 * Create init ctrl data from block definition
 */
export function createInitCtrlDataFromDefinition(
  definition: BlockDefinition
): CtrlData {
  const ctrls: CtrlData = {}

  if (definition.init_parameters) {
    for (const [paramName, param] of Object.entries(definition.init_parameters)) {
      ctrls[paramName] = {
        functionName: definition.key,
        param: paramName,
        value: param.default,
        type: param.type,
        default: param.default,
        options: param.options,
        desc: param.desc,
      }
    }
  }

  return ctrls
}

/**
 * Get parameter value from ctrl data
 */
export function getParamValue(
  ctrls: CtrlData,
  paramName: string
): BlockParameterValue {
  return ctrls[paramName]?.value
}

/**
 * Update parameter value in ctrl data
 */
export function updateParamValue(
  ctrls: CtrlData,
  paramName: string,
  value: BlockParameterValue
): CtrlData {
  if (!ctrls[paramName]) return ctrls

  return {
    ...ctrls,
    [paramName]: {
      ...ctrls[paramName],
      value,
    },
  }
}
