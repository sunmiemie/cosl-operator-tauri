/**
 * Data container types for block results
 */

/**
 * All supported data container types
 */
export const ALL_DC_TYPE = [
  'grayscale',
  'matrix',
  'dataframe',
  'image',
  'ordered_pair',
  'ordered_triple',
  'scalar',
  'plotly',
  'vector',
  'string',
  'boolean',
] as const

export type DataContainerType = (typeof ALL_DC_TYPE)[number]

/**
 * Scalar data container
 */
export type Scalar = {
  type: 'scalar'
  c: number
}

/**
 * Vector data container
 */
export type Vector = {
  type: 'vector'
  v: number[]
}

/**
 * Matrix data container
 */
export type Matrix = {
  type: 'matrix'
  m: number[][]
}

/**
 * DataFrame data container
 */
export type DataFrame = {
  type: 'dataframe'
  columns: string[]
  data: unknown[][]
}

/**
 * Image data container
 */
export type Image = {
  type: 'image'
  r: number[][]
  g: number[][]
  b: number[][]
  a?: number[][]
}

/**
 * Grayscale image data container
 */
export type Grayscale = {
  type: 'grayscale'
  m: number[][]
}

/**
 * Ordered pair data container
 */
export type OrderedPair = {
  type: 'ordered_pair'
  x: number[]
  y: number[]
}

/**
 * Ordered triple data container
 */
export type OrderedTriple = {
  type: 'ordered_triple'
  x: number[]
  y: number[]
  z: number[]
}

/**
 * String data container
 */
export type StringDC = {
  type: 'string'
  s: string
}

/**
 * Boolean data container
 */
export type BooleanDC = {
  type: 'boolean'
  b: boolean
}

/**
 * Union of all data container types
 */
export type DataContainer =
  | Scalar
  | Vector
  | Matrix
  | DataFrame
  | Image
  | Grayscale
  | OrderedPair
  | OrderedTriple
  | StringDC
  | BooleanDC

/**
 * Check if value is a valid data container type
 */
export function isDataContainerType(value: string): value is DataContainerType {
  return ALL_DC_TYPE.includes(value as DataContainerType)
}

/**
 * Get display name for data container type
 */
export function getDataContainerDisplayName(type: DataContainerType): string {
  const names: Record<DataContainerType, string> = {
    grayscale: 'Grayscale Image',
    matrix: 'Matrix',
    dataframe: 'DataFrame',
    image: 'Image',
    ordered_pair: 'Ordered Pair',
    ordered_triple: 'Ordered Triple',
    scalar: 'Scalar',
    plotly: 'Plotly Figure',
    vector: 'Vector',
    string: 'String',
    boolean: 'Boolean',
  }
  return names[type] || type
}
