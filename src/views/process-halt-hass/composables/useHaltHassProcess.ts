/**
 * HALT-HASS 工艺管理 Composable
 * 参考 useProcess.ts 的组织方式
 * 集成 Flojoy 适配层
 */
import { ref, reactive, computed } from 'vue'
import type { Node, Edge } from '@vue-flow/core'
import { useFileSystem } from '@/composables/useFileSystem'
import {
  HaltHassProcessJson,
  HaltHassMetadata,
  HaltHassTestParams,
  HaltHassEditForm,
  BlockData,
  RunSettings,
  defaultRunSettings,
  createEmptyHaltHassJson,
  createEmptyEditForm,
} from '../types'
import {
  serializeFlowchart,
  deserializeFlowchart,
  resetAllNodeStatus,
} from '@/services/flojoy-adapter'

// 暂存项类型
interface TempItem {
  fileName: string
  name: string
  version: string
  mode: string
  createdAt?: string
}

export function useHaltHassProcess() {
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

  // ========== 计算属性 ==========
  
  // 元信息快捷访问
  const metadata = computed(() => processJson.value.metadata)
  
  // 测试参数快捷访问
  const testParams = computed(() => processJson.value.testParams)
  
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

  // 更新测试参数
  function updateTestParams(updates: Partial<HaltHassTestParams>) {
    processJson.value.testParams = {
      ...processJson.value.testParams,
      ...updates,
    }
    editForm.hasUnsavedChanges = true
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
      if (!data.metadata || !data.testParams || !data.flowchart) {
        throw new Error('无效的工艺文件格式')
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
      
      const success = await fileSystem.saveTempProcess(
        'halt-hass' as any,
        metadata.value.boardModelId,
        metadata.value.name || 'unnamed',
        metadata.value.version,
        editForm.isEdit,
        editForm.processId > 0 ? editForm.processId : undefined,
        {
          name: metadata.value.name,
          version: metadata.value.version,
          boardModelId: metadata.value.boardModelId,
          json: processJson.value,
        },
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

  // TODO: 上传工艺到后端
  async function uploadProcess(): Promise<boolean> {
    console.warn('TODO: uploadProcess - 后端接口待对接')
    errorMessage.value = '上传功能暂未实现，请使用导出功能'
    return false
  }

  // TODO: 从后端拉取工艺
  async function fetchProcess(_processId: number): Promise<boolean> {
    console.warn('TODO: fetchProcess - 后端接口待对接')
    errorMessage.value = '拉取功能暂未实现，请使用导入功能'
    return false
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

  return {
    // 状态
    processJson,
    editForm,
    isLoading,
    isSaving,
    errorMessage,
    tempList,
    
    // 计算属性
    metadata,
    testParams,
    flowchart,
    canSave,
    
    // 基础方法
    resetProcess,
    updateMetadata,
    updateTestParams,
    
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
  }
}
