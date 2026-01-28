/**
 * HALT-HASS 工艺管理 Composable
 * 参考 useProcess.ts 的组织方式
 * 集成 Flojoy 适配层
 */
import { ref, reactive, computed } from 'vue'
import type { Node, Edge } from '@vue-flow/core'
import { http } from '@/services/http'
import { useAuth } from '@/composables/useAuth'
import { useFileSystem } from '@/composables/useFileSystem'
import {
  saveHaltHassProcess,
  loadHaltHassProcess,
  getHaltHassProcessList,
  getHaltHassVersionList,
  submitHaltHassToCheck,
  getBoardGroupList,
  createBoardGroup as createBoardGroupApi,
  getHaltHassMyJob,
  deleteHaltHassProcess,
  type HaltHassProcessListItem,
  type HaltHassVersionItem,
} from '@/services/halt-hass-api'
import {
  HaltHassProcessJson,
  HaltHassMetadata,
  HaltHassEditForm,
  BlockData,
  RunSettings,
  InstallationStep,
  InstallationGuide,
  defaultRunSettings,
  createEmptyHaltHassJson,
  createEmptyEditForm,
  BoardGroup,
  HaltHassJob,
  CreateBoardGroupParams,
} from '../types'
import {
  serializeFlowchart,
  resetAllNodeStatus,
} from '@/services/flojoy-adapter'

// 树节点接口
export interface TreeNode {
  id: number
  label: string
  children?: TreeNode[]
}

// 暂存项类型
interface TempItem {
  fileName: string
  name: string
  version: string
  mode: string
  createdAt?: string
}

export function useHaltHassProcess() {
  const { getAuthHeaders } = useAuth()
  const fileSystem = useFileSystem()

  // ========== 状态 ==========

  // 当前工艺 JSON 数据
  const processJson = ref<HaltHassProcessJson>(createEmptyHaltHassJson())

  // 编辑表单状态
  const editForm = reactive<HaltHassEditForm>(createEmptyEditForm())

  // 加载状态
  const isLoading = ref(false)

  // 保存状态
  const isSaving = ref(false)

  // 错误信息
  const errorMessage = ref<string | null>(null)

  // 暂存列表
  const tempList = ref<TempItem[]>([])

  // 电路板型号树数据
  const treeData = ref<TreeNode[]>([])

  // 是否在线模式
  const isOnline = ref(true)

  // 我的待处理工艺列表
  const myJobData = ref<HaltHassJob[]>([])

  // 电路板组列表
  const boardGroups = ref<BoardGroup[]>([])

  // 选中的电路板组（单选）
  const selectedBoardGroup = ref<BoardGroup | null>(null)

  // 基于电路板组的版本列表
  const versionsByBoardGroup = ref<HaltHassVersionItem[]>([])

  // ========== 计算属性 ==========

  // 元信息快捷访问
  const metadata = computed(() => processJson.value.metadata)

  // 安装指导快捷访问
  const installGuide = computed(() => processJson.value.installGuide)

  // 流程图数据快捷访问
  const flowchart = computed(() => processJson.value.flowchart)
  
  // 是否可以保存（只要有名称就可以保存）
  const canSave = computed(() => {
    return metadata.value.name.trim() !== '' && !isSaving.value
  })

  // ========== 方法 ==========
  
  // 重置工艺数据
  function resetProcess() {
    processJson.value = createEmptyHaltHassJson()
    Object.assign(editForm, createEmptyEditForm())
    errorMessage.value = null
  }

  // 更新元信息
  function updateMetadata(updates: Partial<HaltHassMetadata>) {
    processJson.value.metadata = {
      ...processJson.value.metadata,
      ...updates,
    }
    editForm.hasUnsavedChanges = true
  }

  // ========== 安装指导相关方法 ==========

  // 更新整个安装指导
  function updateInstallGuide(guide: InstallationGuide) {
    processJson.value.installGuide = guide
    editForm.hasUnsavedChanges = true
  }

  // 添加安装步骤
  function addInstallStep(step?: Partial<InstallationStep>) {
    const steps = processJson.value.installGuide.steps
    const newId = steps.length > 0 ? Math.max(...steps.map((s) => s.id)) + 1 : 1
    const newStep: InstallationStep = {
      id: newId,
      title: step?.title || '',
      content: step?.content || '',
      images: step?.images || [],
      video: step?.video,
    }
    processJson.value.installGuide.steps.push(newStep)
    editForm.hasUnsavedChanges = true
    return newStep
  }

  // 更新安装步骤
  function updateInstallStep(stepId: number, updates: Partial<InstallationStep>) {
    const steps = processJson.value.installGuide.steps
    const index = steps.findIndex((s) => s.id === stepId)
    if (index !== -1) {
      steps[index] = { ...steps[index], ...updates }
      editForm.hasUnsavedChanges = true
    }
  }

  // 删除安装步骤
  function deleteInstallStep(stepId: number) {
    const steps = processJson.value.installGuide.steps
    const index = steps.findIndex((s) => s.id === stepId)
    if (index !== -1) {
      steps.splice(index, 1)
      editForm.hasUnsavedChanges = true
    }
  }

  // 移动安装步骤（重新排序）
  function moveInstallStep(fromIndex: number, toIndex: number) {
    const steps = processJson.value.installGuide.steps
    if (fromIndex >= 0 && fromIndex < steps.length && toIndex >= 0 && toIndex < steps.length) {
      const [removed] = steps.splice(fromIndex, 1)
      steps.splice(toIndex, 0, removed)
      editForm.hasUnsavedChanges = true
    }
  }

  // 更新流程图数据（使用适配层序列化）
  function updateFlowchart(
    nodes: Node<BlockData>[],
    edges: Edge[],
    observeBlocks?: string[]
  ) {
    const serialized = serializeFlowchart(
      nodes,
      edges,
      observeBlocks,
      processJson.value.flowchart.runSettings
    )
    processJson.value.flowchart = serialized
    editForm.hasUnsavedChanges = true
  }

  // 更新运行设置
  function updateRunSettings(settings: Partial<RunSettings>) {
    processJson.value.flowchart.runSettings = {
      ...processJson.value.flowchart.runSettings,
      ...settings,
    }
    editForm.hasUnsavedChanges = true
  }

  // 更新观察块列表
  function updateObserveBlocks(blockIds: string[]) {
    processJson.value.flowchart.observeBlocks = blockIds
    editForm.hasUnsavedChanges = true
  }

  // 重置所有节点状态（运行前调用）
  function resetNodeStatuses() {
    if (processJson.value.flowchart.nodes.length > 0) {
      processJson.value.flowchart.nodes = resetAllNodeStatus(
        processJson.value.flowchart.nodes
      )
    }
  }

  // 获取运行设置
  function getRunSettings(): RunSettings {
    return processJson.value.flowchart.runSettings || { ...defaultRunSettings }
  }

  // 获取观察块列表
  function getObserveBlocks(): string[] {
    return (
      processJson.value.flowchart.observeBlocks ||
      processJson.value.flowchart.nodes.map((n) => n.id)
    )
  }

  // 从 JSON 文件导入工艺
  async function importFromFile(file: File): Promise<boolean> {
    try {
      isLoading.value = true
      errorMessage.value = null

      const text = await file.text()
      const data = JSON.parse(text) as HaltHassProcessJson

      // 验证基本结构
      if (!data.metadata || !data.flowchart) {
        throw new Error('无效的工艺文件格式')
      }

      // 确保 installGuide 存在（兼容旧格式）
      if (!data.installGuide) {
        data.installGuide = { steps: [] }
      }

      processJson.value = data
      editForm.isEdit = false
      editForm.processId = -1
      editForm.hasUnsavedChanges = true

      return true
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '导入失败'
      console.error('导入工艺失败:', error)
      return false
    } finally {
      isLoading.value = false
    }
  }

  // 导出工艺到文件
  async function exportToFile(): Promise<boolean> {
    try {
      isSaving.value = true
      
      // 更新时间戳
      processJson.value.metadata.updatedAt = new Date().toISOString()
      
      const fileName = `halt-hass-${metadata.value.name || 'unnamed'}-${metadata.value.version}`
      const success = await fileSystem.exportProcessToFile(processJson.value, fileName)
      
      if (success) {
        editForm.hasUnsavedChanges = false
      }
      
      return success
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '导出失败'
      console.error('导出工艺失败:', error)
      return false
    } finally {
      isSaving.value = false
    }
  }

  // 暂存工艺到本地
  async function saveToTemp(): Promise<boolean> {
    try {
      isSaving.value = true

      // 更新时间戳
      processJson.value.metadata.updatedAt = new Date().toISOString()

      // 获取第一个电路板组的 ID（兼容暂存系统）
      const firstBoardId = metadata.value.boardGroup.length > 0
        ? metadata.value.boardGroup[0].id
        : -1

      const success = await fileSystem.saveTempProcess(
        'halt-hass' as any,
        firstBoardId,
        metadata.value.name || 'unnamed',
        metadata.value.version,
        editForm.isEdit,
        editForm.processId > 0 ? editForm.processId : undefined,
        // 使用 any 来适配 HALT-HASS 的多电路板组结构
        {
          name: metadata.value.name,
          version: metadata.value.version,
          boardModelId: firstBoardId,
          boardGroup: metadata.value.boardGroup,
          json: processJson.value,
        } as any,
      )

      if (success) {
        editForm.hasUnsavedChanges = false
      }

      return success
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '暂存失败'
      console.error('暂存工艺失败:', error)
      return false
    } finally {
      isSaving.value = false
    }
  }

  // 上传工艺到后端
  async function uploadProcess(userId?: number): Promise<boolean> {
    try {
      isSaving.value = true
      errorMessage.value = null

      // 更新时间戳
      processJson.value.metadata.updatedAt = new Date().toISOString()

      // 调用保存 API
      const result = await saveHaltHassProcess(
        processJson.value,
        editForm.isEdit && editForm.processId > 0 ? editForm.processId : undefined,
        userId
      )

      if (result.success && result.data) {
        // 更新编辑状态
        editForm.processId = result.data.id
        editForm.isEdit = true
        editForm.hasUnsavedChanges = false
        console.log('工艺上传成功, ID:', result.data.id)
        return true
      } else {
        errorMessage.value = result.error || '上传失败'
        return false
      }
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '上传失败'
      console.error('上传工艺失败:', error)
      return false
    } finally {
      isSaving.value = false
    }
  }

  // 从后端拉取工艺
  async function fetchProcess(processId: number): Promise<boolean> {
    try {
      isLoading.value = true
      errorMessage.value = null

      const result = await loadHaltHassProcess(processId)

      if (result.success && result.data) {
        processJson.value = result.data
        editForm.processId = processId
        editForm.isEdit = true
        editForm.hasUnsavedChanges = false
        console.log('工艺加载成功:', result.data.metadata.name)
        return true
      } else {
        errorMessage.value = result.error || '加载失败'
        return false
      }
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '加载失败'
      console.error('加载工艺失败:', error)
      return false
    } finally {
      isLoading.value = false
    }
  }

  // 提交工艺审核
  async function submitToCheck(): Promise<boolean> {
    if (editForm.processId <= 0) {
      errorMessage.value = '请先保存工艺到服务器'
      return false
    }

    try {
      isSaving.value = true
      const result = await submitHaltHassToCheck(editForm.processId)

      if (result.success && result.data) {
        // 后端返回格式: {code: 0, msg: '成功'} 或 {code: 1, msg: '错误'}
        const responseData = result.data as unknown as { code: number; msg?: string }
        if (responseData.code === 0) {
          console.log('工艺已提交审核')
          return true
        } else {
          errorMessage.value = responseData.msg || '提交审核失败'
          return false
        }
      } else {
        errorMessage.value = result.error || '提交审核失败'
        return false
      }
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '提交审核失败'
      console.error('提交审核失败:', error)
      return false
    } finally {
      isSaving.value = false
    }
  }

  // 获取后端工艺列表
  async function fetchProcessList(params?: {
    currentPage?: number
    pageSize?: number
    name?: string
    status?: string
    boardGroupId?: string
  }): Promise<HaltHassProcessListItem[]> {
    try {
      const result = await getHaltHassProcessList(params || {})
      if (result.success && result.data) {
        // 后端返回格式: {code: 0, data: {list: [...], total: N}}，需要解包嵌套的 data
        const responseData = result.data as unknown as { code: number; data: { list: HaltHassProcessListItem[]; total: number } }
        return responseData.data?.list || []
      }
      return []
    } catch (error) {
      console.error('获取工艺列表失败:', error)
      return []
    }
  }

  // 获取工艺版本列表
  async function fetchVersionList(boardGroupId: string): Promise<HaltHassVersionItem[]> {
    try {
      const result = await getHaltHassVersionList(boardGroupId)
      if (result.success && result.data) {
        // 后端返回格式: {code: 0, data: [...]}，需要解包嵌套的 data
        const responseData = result.data as unknown as { code: number; data: HaltHassVersionItem[] }
        return responseData.data || []
      }
      return []
    } catch (error) {
      console.error('获取版本列表失败:', error)
      return []
    }
  }

  // 加载暂存的工艺（通过文件名）
  async function loadTempProcess(fileName: string): Promise<boolean> {
    try {
      isLoading.value = true
      errorMessage.value = null

      const data = await fileSystem.loadTempProcess(fileName)
      
      if (!data) {
        throw new Error('暂存文件不存在或无法读取')
      }

      // 处理暂存数据格式
      if (data.json) {
        // 新格式：包含 json 字段
        processJson.value = data.json as HaltHassProcessJson
      } else if ((data as any).metadata) {
        // 旧格式：直接是工艺数据
        processJson.value = data as unknown as HaltHassProcessJson
      } else {
        throw new Error('无效的暂存文件格式')
      }
      
      // 解析文件名获取编辑信息
      const info = fileSystem.parseTempFileName(fileName)
      if (info) {
        editForm.isEdit = info.mode === '修改'
        editForm.processId = info.processId ?? -1
      }
      
      editForm.hasUnsavedChanges = false

      return true
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '加载失败'
      console.error('加载暂存工艺失败:', error)
      return false
    } finally {
      isLoading.value = false
    }
  }

  // 别名：从暂存加载（兼容旧 API）
  async function loadFromTemp(fileName: string): Promise<boolean> {
    return loadTempProcess(fileName)
  }

  // 获取暂存列表
  async function fetchTempList(): Promise<void> {
    try {
      const files = await fileSystem.getTempProcessList('halt-hass' as any)
      tempList.value = files.map((file) => ({
        fileName: file.fileName,
        name: file.name || '未命名',
        version: file.version || '',
        mode: file.mode || '编辑',
      }))
    } catch (error) {
      console.error('获取暂存列表失败:', error)
      tempList.value = []
    }
  }

  // 获取电路板型号树数据
  async function fetchTreeData(): Promise<void> {
    try {
      const response = await http.get<{ data: { list: TreeNode[] } }>(
        '/equipment/instrument/list',
        getAuthHeaders(),
        { currentPage: '1', size: '999999', isTree: 'true' }
      )
      if (response.success && response.data?.data) {
        treeData.value = response.data.data.list
        isOnline.value = true
      }
    } catch (error) {
      console.error('获取电路板型号树失败:', error)
      isOnline.value = false
    }
  }

  // ========== 我的待处理相关方法 ==========

  // 获取我的待处理工艺列表
  async function fetchMyJobData(): Promise<void> {
    try {
      const result = await getHaltHassMyJob()
      if (result.success && result.data) {
        // 后端返回格式: {code: 0, data: [...]}，需要解包嵌套的 data
        const responseData = result.data as unknown as { code: number; data: HaltHassJob[] }
        myJobData.value = responseData.data || []
      } else {
        myJobData.value = []
      }
    } catch (error) {
      console.error('获取我的待处理列表失败:', error)
      myJobData.value = []
    }
  }

  // 删除工艺
  async function deleteProcess(processId: number): Promise<boolean> {
    try {
      const result = await deleteHaltHassProcess(processId)
      if (result.success && result.data) {
        // 后端返回格式: {code: 0, msg: '成功'} 或 {code: 1, msg: '错误'}
        const responseData = result.data as unknown as { code: number; msg?: string }
        if (responseData.code === 0) {
          // 从列表中移除
          myJobData.value = myJobData.value.filter(item => item.id !== processId)
          return true
        }
      }
      return false
    } catch (error) {
      console.error('删除工艺失败:', error)
      return false
    }
  }

  // ========== 电路板组相关方法 ==========

  // 获取电路板组列表
  async function fetchBoardGroups(): Promise<void> {
    try {
      const result = await getBoardGroupList({ pageSize: 999 })
      if (result.success && result.data) {
        // 后端返回格式: {code: 0, data: {list: [...], total: N}}，需要解包嵌套的 data
        const responseData = result.data as unknown as { code: number; data: { list: BoardGroup[]; total: number } }
        boardGroups.value = responseData.data?.list || []
      } else {
        boardGroups.value = []
      }
    } catch (error) {
      console.error('获取电路板组列表失败:', error)
      boardGroups.value = []
    }
  }

  // 创建电路板组
  async function createBoardGroup(data: CreateBoardGroupParams): Promise<{ success: boolean; id?: number; error?: string }> {
    try {
      const result = await createBoardGroupApi(data)
      if (result.success && result.data) {
        // 后端返回格式: {code: 0, data: {id: N}}，需要解包嵌套的 data
        const responseData = result.data as unknown as { code: number; data: { id: number } }
        // 刷新列表
        await fetchBoardGroups()
        return { success: true, id: responseData.data?.id }
      }
      return { success: false, error: result.error || '创建失败' }
    } catch (error) {
      console.error('创建电路板组失败:', error)
      return { success: false, error: error instanceof Error ? error.message : '创建失败' }
    }
  }

  // 选择电路板组
  function selectBoardGroup(group: BoardGroup | null) {
    selectedBoardGroup.value = group
    if (group) {
      // 更新 metadata 中的 boardGroup
      processJson.value.metadata.boardGroup = [{
        id: group.id,
        name: group.name,
      }]
      editForm.hasUnsavedChanges = true
    } else {
      processJson.value.metadata.boardGroup = []
    }
  }

  // 按电路板组获取已有版本列表
  async function fetchVersionsByBoardGroup(groupId: number): Promise<void> {
    try {
      const result = await getHaltHassVersionList(String(groupId))
      if (result.success && result.data) {
        // 后端返回格式: {code: 0, data: [...]}，需要解包嵌套的 data
        const responseData = result.data as unknown as { code: number; data: HaltHassVersionItem[] }
        versionsByBoardGroup.value = responseData.data || []
      } else {
        versionsByBoardGroup.value = []
      }
    } catch (error) {
      console.error('获取版本列表失败:', error)
      versionsByBoardGroup.value = []
    }
  }

  // 加载指定版本的工艺数据（用于基于版本迭代）
  async function loadVersionForIteration(processId: number): Promise<boolean> {
    const success = await fetchProcess(processId)
    if (success) {
      // 重置编辑状态，因为这是基于已有版本创建新版本
      editForm.isEdit = false
      editForm.processId = -1
      editForm.hasUnsavedChanges = true
      // 清空版本号，让用户输入新版本
      processJson.value.metadata.baseVersion = {
        processId,
        version: processJson.value.metadata.version,
      }
      processJson.value.metadata.version = ''
    }
    return success
  }

  return {
    // 状态
    processJson,
    editForm,
    isLoading,
    isSaving,
    errorMessage,
    tempList,
    treeData,
    isOnline,
    myJobData,
    boardGroups,
    selectedBoardGroup,
    versionsByBoardGroup,

    // 计算属性
    metadata,
    installGuide,
    flowchart,
    canSave,

    // 基础方法
    resetProcess,
    updateMetadata,

    // 安装指导方法
    updateInstallGuide,
    addInstallStep,
    updateInstallStep,
    deleteInstallStep,
    moveInstallStep,

    // 流程图方法
    updateFlowchart,
    updateRunSettings,
    updateObserveBlocks,
    resetNodeStatuses,
    getRunSettings,
    getObserveBlocks,

    // 文件操作
    importFromFile,
    exportToFile,
    saveToTemp,
    uploadProcess,
    fetchProcess,
    loadTempProcess,
    loadFromTemp,
    fetchTempList,
    fetchTreeData,

    // 后端 API 操作
    submitToCheck,
    fetchProcessList,
    fetchVersionList,

    // 我的待处理
    fetchMyJobData,
    deleteProcess,

    // 电路板组管理
    fetchBoardGroups,
    createBoardGroup,
    selectBoardGroup,
    fetchVersionsByBoardGroup,
    loadVersionForIteration,
  }
}
