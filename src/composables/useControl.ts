/**
 * Control panel state management composable
 * Handles widget values and synchronization with block parameters
 */
import { ref, computed, readonly, watch } from 'vue'
import type { BlockParameterValue } from '@/types'

// Store for widget values keyed by blockId:paramName
const widgetValues = ref<Map<string, BlockParameterValue>>(new Map())

// Store for widget configs
const widgetConfigs = ref<Map<string, unknown>>(new Map())

// Subscribers for value changes
const valueSubscribers = ref<Map<string, Set<(value: BlockParameterValue) => void>>>(new Map())

/**
 * Generate key for widget value store
 */
function makeKey(blockId: string, paramName: string): string {
  return `${blockId}:${paramName}`
}

/**
 * Get widget value
 */
function getValue(blockId: string, paramName: string): BlockParameterValue {
  const key = makeKey(blockId, paramName)
  return widgetValues.value.get(key)
}

/**
 * Set widget value
 */
function setValue(blockId: string, paramName: string, value: BlockParameterValue): void {
  const key = makeKey(blockId, paramName)
  widgetValues.value.set(key, value)

  // Notify subscribers
  const subscribers = valueSubscribers.value.get(key)
  if (subscribers) {
    subscribers.forEach((callback) => callback(value))
  }
}

/**
 * Subscribe to value changes
 */
function subscribe(
  blockId: string,
  paramName: string,
  callback: (value: BlockParameterValue) => void
): () => void {
  const key = makeKey(blockId, paramName)

  if (!valueSubscribers.value.has(key)) {
    valueSubscribers.value.set(key, new Set())
  }

  valueSubscribers.value.get(key)!.add(callback)

  // Return unsubscribe function
  return () => {
    valueSubscribers.value.get(key)?.delete(callback)
  }
}

/**
 * Get widget config
 */
function getConfig<T>(blockId: string, paramName: string): T | undefined {
  const key = makeKey(blockId, paramName)
  return widgetConfigs.value.get(key) as T | undefined
}

/**
 * Set widget config
 */
function setConfig(blockId: string, paramName: string, config: unknown): void {
  const key = makeKey(blockId, paramName)
  widgetConfigs.value.set(key, config)
}

/**
 * Clear all widget values for a block
 */
function clearBlockValues(blockId: string): void {
  const prefix = `${blockId}:`
  for (const key of widgetValues.value.keys()) {
    if (key.startsWith(prefix)) {
      widgetValues.value.delete(key)
    }
  }
  for (const key of widgetConfigs.value.keys()) {
    if (key.startsWith(prefix)) {
      widgetConfigs.value.delete(key)
    }
  }
}

/**
 * Clear all widget state
 */
function clearAll(): void {
  widgetValues.value.clear()
  widgetConfigs.value.clear()
  valueSubscribers.value.clear()
}

/**
 * Get all values for a block
 */
function getBlockValues(blockId: string): Record<string, BlockParameterValue> {
  const prefix = `${blockId}:`
  const result: Record<string, BlockParameterValue> = {}

  for (const [key, value] of widgetValues.value.entries()) {
    if (key.startsWith(prefix)) {
      const paramName = key.slice(prefix.length)
      result[paramName] = value
    }
  }

  return result
}

/**
 * Batch update values for a block
 */
function setBlockValues(blockId: string, values: Record<string, BlockParameterValue>): void {
  for (const [paramName, value] of Object.entries(values)) {
    setValue(blockId, paramName, value)
  }
}

/**
 * Control panel composable
 */
export function useControl() {
  // Count of active widgets
  const widgetCount = computed(() => widgetValues.value.size)

  return {
    // State
    widgetCount,

    // Methods
    getValue,
    setValue,
    subscribe,
    getConfig,
    setConfig,
    clearBlockValues,
    clearAll,
    getBlockValues,
    setBlockValues,
  }
}

/**
 * Hook for individual widget
 */
export function useWidgetValue(blockId: string, paramName: string, defaultValue?: BlockParameterValue) {
  const value = ref<BlockParameterValue>(getValue(blockId, paramName) ?? defaultValue)

  // Sync with store
  watch(
    value,
    (newValue) => {
      setValue(blockId, paramName, newValue)
    },
    { immediate: true }
  )

  // Subscribe to external updates
  const unsubscribe = subscribe(blockId, paramName, (newValue) => {
    value.value = newValue
  })

  return {
    value,
    unsubscribe,
  }
}
