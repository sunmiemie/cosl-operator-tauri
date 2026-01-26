/**
 * Block Manifest 缓存 composable
 * 用于在应用中共享 blocks 的 manifest 数据
 * 编辑节点参数时可从这里获取最新的 options
 */
import { ref, readonly, computed } from 'vue'
import {
  getManifestTree,
  type BlockManifestTree,
  type BlockDefinition,
  type BlockSection,
} from '@/services/flojoy-api'

// 全局缓存 manifest
const manifest = ref<BlockManifestTree | null>(null)
const isLoading = ref(false)
const lastLoadTime = ref<number | null>(null)

// 缓存有效期（5分钟）
const CACHE_TTL = 5 * 60 * 1000

/**
 * 判断是否为叶子节点（Block 定义）
 */
function isLeaf(node: unknown): node is BlockDefinition {
  return (
    node !== null &&
    typeof node === 'object' &&
    'children' in node &&
    (node as BlockDefinition).children === null
  )
}

/**
 * 递归收集所有 BlockDefinition
 */
function collectAllBlocks(
  node: BlockManifestTree | BlockSection | BlockDefinition
): BlockDefinition[] {
  if (isLeaf(node)) {
    return [node]
  }
  if (!node.children) return []
  return node.children.flatMap((child) => collectAllBlocks(child))
}

/**
 * 根据 key 查找 block 定义
 */
function findBlockByKey(key: string): BlockDefinition | null {
  if (!manifest.value) return null
  const allBlocks = collectAllBlocks(manifest.value)
  return allBlocks.find((block) => block.key === key) || null
}

/**
 * 根据 func (函数名/key) 获取参数定义
 */
function getBlockParameters(
  func: string
): Record<string, { type: string; default: unknown; options?: unknown[]; desc?: string | null }> | null {
  const block = findBlockByKey(func)
  if (!block) return null
  return block.parameters || null
}

/**
 * 根据 func (函数名/key) 获取初始化参数定义
 */
function getBlockInitParameters(
  func: string
): Record<string, { type: string; default: unknown; options?: unknown[]; desc?: string | null }> | null {
  const block = findBlockByKey(func)
  if (!block) return null
  return block.init_parameters || null
}

/**
 * 获取参数的 options（优先从 manifest 获取最新的）
 * @param func 节点的函数名/key
 * @param paramName 参数名
 * @param fallbackOptions 如果 manifest 中没有，使用的回退 options
 * @param isInit 是否为初始化参数
 */
function getParamOptions(
  func: string | undefined,
  paramName: string,
  fallbackOptions?: unknown[],
  isInit = false
): unknown[] | undefined {
  if (!func) return fallbackOptions

  const params = isInit ? getBlockInitParameters(func) : getBlockParameters(func)
  if (!params || !params[paramName]) {
    return fallbackOptions
  }

  const freshOptions = params[paramName].options
  // 优先返回 manifest 中的 options
  if (freshOptions && Array.isArray(freshOptions) && freshOptions.length > 0) {
    return freshOptions
  }

  return fallbackOptions
}

/**
 * 加载 manifest（带缓存）
 */
async function loadManifest(forceRefresh = false): Promise<BlockManifestTree | null> {
  // 检查缓存是否有效
  const now = Date.now()
  if (
    !forceRefresh &&
    manifest.value &&
    lastLoadTime.value &&
    now - lastLoadTime.value < CACHE_TTL
  ) {
    return manifest.value
  }

  if (isLoading.value) {
    // 等待正在进行的加载
    return new Promise((resolve) => {
      const interval = setInterval(() => {
        if (!isLoading.value) {
          clearInterval(interval)
          resolve(manifest.value)
        }
      }, 100)
    })
  }

  isLoading.value = true
  try {
    manifest.value = await getManifestTree()
    lastLoadTime.value = now
    return manifest.value
  } catch (e) {
    console.error('Failed to load manifest:', e)
    return null
  } finally {
    isLoading.value = false
  }
}

/**
 * 清除缓存
 */
function clearCache() {
  manifest.value = null
  lastLoadTime.value = null
}

/**
 * Block Manifest composable
 */
export function useBlockManifest() {
  // 所有 blocks 列表
  const allBlocks = computed(() => {
    if (!manifest.value) return []
    return collectAllBlocks(manifest.value)
  })

  return {
    // 状态
    manifest: readonly(manifest),
    isLoading: readonly(isLoading),
    allBlocks,

    // 方法
    loadManifest,
    clearCache,
    findBlockByKey,
    getBlockParameters,
    getBlockInitParameters,
    getParamOptions,
  }
}
