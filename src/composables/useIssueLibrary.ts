/**
 * useIssueLibrary - 缺陷库/疑问库 API 封装
 *
 * 提供统一的接口用于获取和保存缺陷/疑问库条目
 * 
 * API 端点:
 * - 缺陷库:
 *   - /data/defect-item-directory/list (树结构)
 *   - /data/defect-item-first-level-directory/list (一级目录)
 *   - /data/defect-item-second-level-directory/list (二级目录)
 *   - /data/defect-item/list (条目列表)
 *   - /data/defect-item/add (添加条目)
 * - 疑问库:
 *   - /data/question-item-directory/list (树结构)
 *   - /data/question-item-first-level-directory/list (一级目录)
 *   - /data/question-item-second-level-directory/list (二级目录)
 *   - /data/question-item/list (条目列表)
 *   - /data/question-item/add (添加条目)
 */
import { ref } from 'vue'
import { http } from '@/services/http'
import { useAuth } from '@/composables/useAuth'

// ==================== 类型定义 ====================

/** 库类型 */
export type IssueLibraryType = 'defect' | 'question'

/** 一级目录 */
export interface FirstLevelDirectory {
  id: number
  name: string
}

/** 二级目录 */
export interface SecondLevelDirectory {
  id: number
  name: string
  firstLevelDirectoryId: number
}

/** 树节点 (嵌套结构) - 后端返回的字段是 label */
export interface DirectoryTreeNode {
  id: number
  label: string  // 后端返回 label 而不是 name
  children?: SecondLevelDirectoryNode[]
}

/** 二级目录树节点 */
export interface SecondLevelDirectoryNode {
  id: number
  label: string  // 后端返回 label 而不是 name
}

/** 库条目 */
export interface IssueItem {
  id: number
  name: string
  secondLevelDirectoryId?: number
  // 缺陷项描述（缺陷库）
  problem_desc?: string
  // 疑问项描述（疑问库）
  question_desc?: string
}

/** 后端通用响应结构 */
interface BackendResponse<T> {
  code: number
  msg?: string
  data?: T
}

/** 列表响应 */
interface ListResponse<T> {
  list: T[]
  total?: number
}

// ==================== Composable ====================

export function useIssueLibrary() {
  const { getAuthHeaders } = useAuth()

  // 加载状态
  const isTreeLoading = ref(false)
  const isItemsLoading = ref(false)
  const isSaving = ref(false)

  // 树形数据
  const defectTree = ref<DirectoryTreeNode[]>([])
  const questionTree = ref<DirectoryTreeNode[]>([])

  // 当前选中的二级目录 ID
  const selectedDirectoryId = ref<number | null>(null)

  // 条目列表
  const currentItems = ref<IssueItem[]>([])

  // 一级目录列表 (用于保存弹窗)
  const firstLevelDirs = ref<FirstLevelDirectory[]>([])
  const secondLevelDirs = ref<SecondLevelDirectory[]>([])

  /**
   * 获取 API 路径前缀
   */
  function getApiPrefix(type: IssueLibraryType): string {
    return type === 'defect' ? '/data/defect-item' : '/data/question-item'
  }

  /**
   * 获取目录树
   * @param type 库类型
   */
  async function fetchDirectoryTree(type: IssueLibraryType): Promise<DirectoryTreeNode[]> {
    const prefix = getApiPrefix(type)
    isTreeLoading.value = true

    try {
      // 后端返回格式: { code: 0, data: { list: [...] } }
      const response = await http.get<BackendResponse<ListResponse<DirectoryTreeNode>>>(
        `${prefix}-directory/list`,
        getAuthHeaders()
      )

      if (response.success && response.data?.code === 0 && response.data?.data?.list) {
        const tree = response.data.data.list
        if (type === 'defect') {
          defectTree.value = tree
        } else {
          questionTree.value = tree
        }
        return tree
      }
      return []
    } catch (error) {
      console.error(`获取${type === 'defect' ? '缺陷' : '疑问'}库目录树失败:`, error)
      return []
    } finally {
      isTreeLoading.value = false
    }
  }

  /**
   * 获取一级目录列表
   * @param type 库类型
   */
  async function fetchFirstLevelDirectories(type: IssueLibraryType): Promise<FirstLevelDirectory[]> {
    const prefix = getApiPrefix(type)

    try {
      const response = await http.get<BackendResponse<ListResponse<FirstLevelDirectory>>>(
        `${prefix}-first-level-directory/list`,
        getAuthHeaders()
      )

      if (response.success && response.data?.code === 0 && response.data?.data?.list) {
        firstLevelDirs.value = response.data.data.list
        return response.data.data.list
      }
      return []
    } catch (error) {
      console.error('获取一级目录失败:', error)
      return []
    }
  }

  /**
   * 获取二级目录列表
   * @param type 库类型
   * @param firstLevelId 一级目录 ID
   */
  async function fetchSecondLevelDirectories(
    type: IssueLibraryType,
    firstLevelId: number
  ): Promise<SecondLevelDirectory[]> {
    const prefix = getApiPrefix(type)

    try {
      // 后端参数是 id，返回格式是 { code: 0, data: [...] } 直接是数组
      const response = await http.get<BackendResponse<SecondLevelDirectory[]>>(
        `${prefix}-second-level-directory/list`,
        getAuthHeaders(),
        { id: String(firstLevelId) }
      )

      if (response.success && response.data?.code === 0 && response.data?.data) {
        secondLevelDirs.value = response.data.data
        return response.data.data
      }
      return []
    } catch (error) {
      console.error('获取二级目录失败:', error)
      return []
    }
  }

  /**
   * 获取条目列表
   * @param type 库类型
   * @param secondLevelDirectoryId 二级目录 ID
   */
  async function fetchItems(
    type: IssueLibraryType,
    secondLevelDirectoryId: number
  ): Promise<IssueItem[]> {
    const prefix = getApiPrefix(type)
    isItemsLoading.value = true
    selectedDirectoryId.value = secondLevelDirectoryId

    try {
      const response = await http.get<BackendResponse<ListResponse<IssueItem>>>(
        `${prefix}/list`,
        getAuthHeaders(),
        { secondLevelDirectoryId: String(secondLevelDirectoryId), size: '999999' }
      )

      if (response.success && response.data?.code === 0 && response.data?.data?.list) {
        currentItems.value = response.data.data.list
        return response.data.data.list
      }
      currentItems.value = []
      return []
    } catch (error) {
      console.error(`获取${type === 'defect' ? '缺陷' : '疑问'}库条目失败:`, error)
      currentItems.value = []
      return []
    } finally {
      isItemsLoading.value = false
    }
  }

  /**
   * 添加新条目到库
   * @param type 库类型
   * @param name 条目名称
   * @param secondLevelDirectoryId 二级目录 ID
   */
  async function addItem(
    type: IssueLibraryType,
    name: string,
    secondLevelDirectoryId: number
  ): Promise<boolean> {
    const prefix = getApiPrefix(type)
    isSaving.value = true

    try {
      const response = await http.post<BackendResponse<unknown>>(
        `${prefix}/add`,
        { name, secondLevelDirectoryId },
        getAuthHeaders()
      )

      if (response.success && response.data?.code === 0) {
        // 刷新当前条目列表
        if (selectedDirectoryId.value === secondLevelDirectoryId) {
          await fetchItems(type, secondLevelDirectoryId)
        }
        return true
      }
      return false
    } catch (error) {
      console.error(`添加${type === 'defect' ? '缺陷' : '疑问'}库条目失败:`, error)
      return false
    } finally {
      isSaving.value = false
    }
  }

  /**
   * 清空当前状态
   */
  function resetState() {
    selectedDirectoryId.value = null
    currentItems.value = []
    firstLevelDirs.value = []
    secondLevelDirs.value = []
  }

  return {
    // 状态
    isTreeLoading,
    isItemsLoading,
    isSaving,
    defectTree,
    questionTree,
    currentItems,
    selectedDirectoryId,
    firstLevelDirs,
    secondLevelDirs,

    // 方法
    fetchDirectoryTree,
    fetchFirstLevelDirectories,
    fetchSecondLevelDirectories,
    fetchItems,
    addItem,
    resetState,
  }
}
