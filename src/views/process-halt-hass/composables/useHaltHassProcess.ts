/**
 * HALT-HASS 工艺编辑 Composable
 * 
 * 负责工艺的创建、加载、保存、导入导出等功能
 */
import { ref, computed, readonly } from 'vue'
import { open } from '@tauri-apps/plugin-dialog'
import { readTextFile } from '@tauri-apps/plugin-fs'
import { useFileSystem } from '@/composables/useFileSystem'
import {
  type HaltHassProcess,
  type HaltHassProcessListItem,
  type FlojoyFlow,
  createHaltHassProcess,
  isValidHaltHassProcess,
  isFlojoyFlow
} from '@/types/haltHassProcess'

/**
 * HALT-HASS 工艺编辑状态
 */
export type ProcessStatus = 'idle' | 'loading' | 'saving' | 'error'

export function useHaltHassProcess() {
  const fileSystem = useFileSystem()
  
  // 当前工艺数据
  const currentProcess = ref<HaltHassProcess | null>(null)
  
  // 当前加载的文件名（本地保存时使用）
  const currentFileName = ref<string | null>(null)
  
  // 操作状态
  const status = ref<ProcessStatus>('idle')
  
  // 错误信息
  const errorMessage = ref<string | null>(null)
  
  // 本地工艺列表
  const localProcessList = ref<HaltHassProcessListItem[]>([])
  
  // 是否有未保存的更改（简单实现，可后续扩展为深度比较）
  const hasUnsavedChanges = ref(false)
  
  // 计算属性：是否已加载工艺
  const hasProcess = computed(() => currentProcess.value !== null)
  
  // 计算属性：工艺摘要
  const processSummary = computed(() => {
    if (!currentProcess.value) return null
    return {
      name: currentProcess.value.name,
      version: currentProcess.value.version,
      boardModelId: currentProcess.value.boardModelId,
      updatedAt: currentProcess.value.meta.updatedAt
    }
  })
  
  /**
   * 创建新工艺
   */
  function createNewProcess(name: string = '未命名工艺', version: string = '1.0.0'): void {
    currentProcess.value = createHaltHassProcess(name, version)
    currentFileName.value = null
    hasUnsavedChanges.value = true
    errorMessage.value = null
  }
  
  /**
   * 更新工艺元数据
   */
  function updateProcessMeta(updates: Partial<Pick<HaltHassProcess, 'name' | 'version' | 'boardModelId'>>): void {
    if (!currentProcess.value) return
    
    if (updates.name !== undefined) {
      currentProcess.value.name = updates.name
    }
    if (updates.version !== undefined) {
      currentProcess.value.version = updates.version
    }
    if (updates.boardModelId !== undefined) {
      currentProcess.value.boardModelId = updates.boardModelId
    }
    
    currentProcess.value.meta.updatedAt = new Date().toISOString()
    hasUnsavedChanges.value = true
  }
  
  /**
   * 更新 Flojoy 流程
   */
  function updateFlojoyFlow(flow: FlojoyFlow): void {
    if (!currentProcess.value) return
    
    currentProcess.value.flojoyFlow = flow
    currentProcess.value.meta.updatedAt = new Date().toISOString()
    hasUnsavedChanges.value = true
  }
  
  /**
   * 更新备注
   */
  function updateNotes(notes: string): void {
    if (!currentProcess.value) return
    
    currentProcess.value.meta.notes = notes
    currentProcess.value.meta.updatedAt = new Date().toISOString()
    hasUnsavedChanges.value = true
  }
  
  /**
   * 保存到本地
   */
  async function saveToLocal(): Promise<boolean> {
    if (!currentProcess.value) {
      errorMessage.value = '没有可保存的工艺'
      return false
    }
    
    status.value = 'saving'
    errorMessage.value = null
    
    try {
      // 更新时间戳
      currentProcess.value.meta.updatedAt = new Date().toISOString()
      
      const result = await fileSystem.saveHaltHassProcess(
        currentProcess.value,
        currentFileName.value || undefined
      )
      
      if (result.success && result.fileName) {
        currentFileName.value = result.fileName
        hasUnsavedChanges.value = false
        status.value = 'idle'
        return true
      } else {
        throw new Error('保存失败')
      }
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '保存失败'
      status.value = 'error'
      return false
    }
  }
  
  /**
   * 从本地文件加载
   */
  async function loadFromLocal(fileName: string): Promise<boolean> {
    status.value = 'loading'
    errorMessage.value = null
    
    try {
      const data = await fileSystem.loadHaltHassProcess<HaltHassProcess>(fileName)
      
      if (!data) {
        throw new Error('文件加载失败')
      }
      
      if (!isValidHaltHassProcess(data)) {
        throw new Error('文件格式无效')
      }
      
      currentProcess.value = data
      currentFileName.value = fileName
      hasUnsavedChanges.value = false
      status.value = 'idle'
      return true
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '加载失败'
      status.value = 'error'
      return false
    }
  }
  
  /**
   * 从外部文件导入
   */
  async function importFromFile(): Promise<boolean> {
    status.value = 'loading'
    errorMessage.value = null
    
    try {
      // 打开文件选择对话框
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'JSON 文件',
          extensions: ['json']
        }],
        title: '选择工艺文件'
      })
      
      if (!selected) {
        status.value = 'idle'
        return false
      }
      
      const filePath = selected as string
      const content = await readTextFile(filePath)
      const data = JSON.parse(content)
      
      // 判断是 HALT-HASS 工艺还是 Flojoy 原生流程
      if (isValidHaltHassProcess(data)) {
        // 完整的 HALT-HASS 工艺
        currentProcess.value = data
      } else if (isFlojoyFlow(data)) {
        // Flojoy 原生流程，包装为 HALT-HASS 工艺
        const now = new Date().toISOString()
        currentProcess.value = {
          name: '导入的工艺',
          version: '1.0.0',
          flojoyFlow: data,
          meta: {
            createdAt: now,
            updatedAt: now,
            notes: '从 Flojoy 流程文件导入'
          }
        }
      } else {
        throw new Error('不支持的文件格式')
      }
      
      currentFileName.value = null // 导入的文件需要重新保存
      hasUnsavedChanges.value = true
      status.value = 'idle'
      return true
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '导入失败'
      status.value = 'error'
      return false
    }
  }
  
  /**
   * 导出到文件
   */
  async function exportToFile(): Promise<boolean> {
    if (!currentProcess.value) {
      errorMessage.value = '没有可导出的工艺'
      return false
    }
    
    status.value = 'saving'
    errorMessage.value = null
    
    try {
      const defaultName = `halt-hass-${currentProcess.value.name}-${currentProcess.value.version}`
      const success = await fileSystem.exportHaltHassProcess(currentProcess.value, defaultName)
      
      status.value = 'idle'
      return success
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '导出失败'
      status.value = 'error'
      return false
    }
  }
  
  /**
   * 刷新本地工艺列表
   */
  async function refreshLocalList(): Promise<void> {
    try {
      const list = await fileSystem.getHaltHassProcessList()
      localProcessList.value = list.map(item => ({
        fileName: item.fileName,
        name: item.name,
        version: item.version,
        updatedAt: item.updatedAt,
        filePath: item.filePath
      }))
    } catch (error) {
      console.error('刷新本地列表失败:', error)
    }
  }
  
  /**
   * 删除本地工艺
   */
  async function deleteLocal(fileName: string): Promise<boolean> {
    try {
      const success = await fileSystem.deleteHaltHassProcess(fileName)
      if (success) {
        await refreshLocalList()
        
        // 如果删除的是当前加载的工艺，清空当前状态
        if (currentFileName.value === fileName) {
          currentProcess.value = null
          currentFileName.value = null
          hasUnsavedChanges.value = false
        }
      }
      return success
    } catch (error) {
      console.error('删除失败:', error)
      return false
    }
  }
  
  /**
   * 清空当前工艺
   */
  function clearCurrentProcess(): void {
    currentProcess.value = null
    currentFileName.value = null
    hasUnsavedChanges.value = false
    errorMessage.value = null
    status.value = 'idle'
  }
  
  // ==================== 后端对接 TODO ====================
  
  /**
   * 上传到后端
   * TODO: 实现后端上传逻辑
   */
  async function uploadToBackend(): Promise<boolean> {
    // TODO: 实现后端上传
    // 1. 构建 FormData
    // 2. 调用后端 API
    // 3. 处理响应
    console.warn('uploadToBackend: TODO - 待实现后端上传')
    errorMessage.value = '后端上传功能尚未实现'
    return false
  }
  
  /**
   * 从后端拉取
   * TODO: 实现后端拉取逻辑
   */
  async function fetchFromBackend(_processId: number): Promise<boolean> {
    // TODO: 实现后端拉取
    // 1. 调用后端 API
    // 2. 解析响应
    // 3. 加载到当前工艺
    console.warn('fetchFromBackend: TODO - 待实现后端拉取')
    errorMessage.value = '后端拉取功能尚未实现'
    return false
  }
  
  /**
   * 获取后端工艺列表
   * TODO: 实现后端列表获取逻辑
   */
  async function fetchBackendList(): Promise<void> {
    // TODO: 实现后端列表获取
    console.warn('fetchBackendList: TODO - 待实现后端列表获取')
  }
  
  return {
    // 状态
    currentProcess: readonly(currentProcess),
    currentFileName: readonly(currentFileName),
    status: readonly(status),
    errorMessage: readonly(errorMessage),
    localProcessList: readonly(localProcessList),
    hasUnsavedChanges: readonly(hasUnsavedChanges),
    
    // 计算属性
    hasProcess,
    processSummary,
    
    // 创建与编辑
    createNewProcess,
    updateProcessMeta,
    updateFlojoyFlow,
    updateNotes,
    clearCurrentProcess,
    
    // 本地文件操作
    saveToLocal,
    loadFromLocal,
    importFromFile,
    exportToFile,
    refreshLocalList,
    deleteLocal,
    
    // 后端操作 (TODO)
    uploadToBackend,
    fetchFromBackend,
    fetchBackendList
  }
}
