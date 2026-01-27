/**
 * Block manifest and definition types
 * Defines the structure of Flojoy blocks
 */
import { z } from 'zod'

// ========== Block IO Types ==========

/**
 * Base IO schema for inputs/outputs
 */
export const blockIoSchema = z.object({
  name: z.string(),
  id: z.string(),
  type: z.string(),
  desc: z.string().nullable(),
})

/**
 * Block input schema (extends base with multiple flag)
 */
export const blockInputSchema = blockIoSchema.extend({
  multiple: z.boolean(),
})

/**
 * Block output schema
 */
export const blockOutputSchema = blockIoSchema

export type BlockIO = z.infer<typeof blockIoSchema>
export type BlockInput = z.infer<typeof blockInputSchema>
export type BlockOutput = z.infer<typeof blockOutputSchema>

// ========== Block Parameter Types ==========

/**
 * Block parameter value union
 */
export const blockParameterValue = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.undefined(),
])

export type BlockParameterValue = z.infer<typeof blockParameterValue>

/**
 * Block parameter definition schema
 */
export const blockParameterSchema = z.object({
  type: z.string(),
  default: blockParameterValue,
  options: z.union([z.string(), z.number()]).array().optional(),
  desc: z.string().nullable(),
  overload: z.record(z.string(), z.array(z.string())).nullable(),
})

export type ParamDefinition = z.infer<typeof blockParameterSchema>

// ========== Pip Dependency ==========

export const pipDependencySchema = z.object({
  name: z.string(),
  v: z.string().nullable(),
})

export type PipDependency = z.infer<typeof pipDependencySchema>

// ========== Block Definition (Leaf Node) ==========

/**
 * Block definition schema - represents a single block
 */
export const blockDefinitionSchema = z.object({
  name: z.string(),
  key: z.string(),
  type: z.string(),
  inputs: z.array(blockInputSchema).optional(),
  outputs: z.array(blockOutputSchema).optional(),
  parameters: z.record(z.string(), blockParameterSchema).optional(),
  init_parameters: z.record(z.string(), blockParameterSchema).optional(),
  pip_dependencies: z.array(pipDependencySchema).optional(),
  children: z.null(),
})

export type BlockDefinition = z.infer<typeof blockDefinitionSchema>
export type Leaf = BlockDefinition

// ========== Block Section (Parent Node) ==========

/**
 * Block section type - category/folder in manifest tree
 */
type BlockSectionType = {
  name: string
  key?: string
  children: (BlockSectionType | BlockDefinition)[]
}

export const blockSectionSchema: z.ZodType<BlockSectionType> = z.object({
  name: z.string(),
  key: z.string().optional(),
  children: z
    .union([z.lazy(() => blockSectionSchema), blockDefinitionSchema])
    .array(),
})

export type BlockSection = z.infer<typeof blockSectionSchema>
export type ParentNode = BlockSection

// ========== Block Manifest (Root) ==========

/**
 * Block manifest schema - root of the manifest tree
 */
export const blockManifestSchema = z.object({
  name: z.literal('ROOT'),
  children: z.union([blockSectionSchema, blockDefinitionSchema]).array(),
})

export type BlockManifest = z.infer<typeof blockManifestSchema>
export type RootNode = BlockManifest

// ========== Tree Node Types ==========

export interface LeafParentNode extends ParentNode {
  children: Leaf[]
}

export type RootChild = BlockManifest['children'][number]

export type TreeNode =
  | Leaf
  | ParentNode
  | LeafParentNode
  | RootNode
  | RootChild

// ========== Block Metadata (Flat Structure) ==========

/**
 * Block metadata schema - flat key-value map
 */
export const blockMetadataSchema = z.record(
  z.string(),
  z.object({
    metadata: z.string(),
    path: z.string(),
    full_path: z.string(),
  })
)

export type BlockMetadata = z.infer<typeof blockMetadataSchema>

// ========== Helper Functions ==========

/**
 * Check if a tree node is a leaf (block definition)
 */
export function isLeafNode(node: TreeNode): node is Leaf {
  return 'children' in node && node.children === null
}

/**
 * Check if a tree node is a section (parent node)
 */
export function isSectionNode(node: TreeNode): node is ParentNode {
  return 'children' in node && Array.isArray(node.children)
}

/**
 * Get all leaf nodes from a tree
 */
export function getAllLeafNodes(node: TreeNode): Leaf[] {
  if (isLeafNode(node)) {
    return [node]
  }
  if (isSectionNode(node)) {
    return node.children.flatMap(child => getAllLeafNodes(child as TreeNode))
  }
  return []
}

/**
 * Find a block by key in the manifest tree
 */
export function findBlockByKey(manifest: BlockManifest, key: string): BlockDefinition | null {
  const search = (nodes: TreeNode[]): BlockDefinition | null => {
    for (const node of nodes) {
      if (isLeafNode(node) && node.key === key) {
        return node
      }
      if (isSectionNode(node)) {
        const found = search(node.children as TreeNode[])
        if (found) return found
      }
    }
    return null
  }
  return search(manifest.children as TreeNode[])
}
