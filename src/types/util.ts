/**
 * Utility types and helper functions
 */
import { z } from 'zod'

/**
 * Nullable/undefined type helper
 */
export type Nullish<T> = T | null | undefined

/**
 * Get typed entries from an object
 */
type Entries<T> = {
  [K in keyof T]: [K, T[K]]
}[keyof T][]

export const getEntries = <T extends object>(obj: T) =>
  Object.entries(obj) as Entries<T>

/**
 * Get typed keys from an object
 */
export const typedObjectKeys = <T extends object>(object: T) => {
  return Object.keys(object) as (keyof typeof object)[]
}

/**
 * Create typed object from entries
 */
export const typedObjectFromEntries = <
  const T extends ReadonlyArray<readonly [PropertyKey, unknown]>,
>(
  entries: T
): { [K in T[number] as K[0]]: K[1] } => {
  return Object.fromEntries(entries) as { [K in T[number] as K[0]]: K[1] }
}

/**
 * Create Zod enum from object keys
 */
export function getZodEnumFromObjectKeys<
  TI extends Record<string, unknown>,
  R extends string = TI extends Record<infer R, unknown> ? R : never,
>(input: TI): z.ZodEnum<[R, ...R[]]> {
  const [firstKey, ...otherKeys] = Object.keys(input) as [R, ...R[]]
  return z.enum([firstKey, ...otherKeys])
}

/**
 * Deep mutable type
 */
export type DeepMutable<T> = {
  -readonly [P in keyof T]: DeepMutable<T[P]>
}

/**
 * Filter out never keys
 */
export type FilteredKeys<T> = {
  [K in keyof T]: T[K] extends never ? never : K
}[keyof T]

/**
 * Remove never values from object type
 */
export type RemoveNever<T> = {
  [K in FilteredKeys<T>]: T[K]
}

/**
 * Get values type from object
 */
export type ValuesOf<T> = T[keyof T]
