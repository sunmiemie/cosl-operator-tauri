import type { RunSettings } from '@/services/flojoy-api'

export const HALT_HASS_DURATION_LOOP_FUNCTION = 'HALT_HASS_DURATION_LOOP'

interface RuntimeFlowchartNode {
  id: string
  data: Record<string, unknown>
}

function nodeFunction(node: RuntimeFlowchartNode): string {
  return typeof node.data.func === 'string' ? node.data.func.toUpperCase() : ''
}

export function hasHassDurationLoop(
  nodes: RuntimeFlowchartNode[]
): boolean {
  return nodes.some(
    (node) => nodeFunction(node) === HALT_HASS_DURATION_LOOP_FUNCTION
  )
}

export function buildWorkbenchControlledCycleRunSettings(
  settings: RunSettings | undefined,
): Required<RunSettings> {
  return {
    ...settings,
    nodeDelay: settings?.nodeDelay ?? 0,
    maximumRuntime: 0,
    maximumConcurrentWorkers: 1,
  }
}
