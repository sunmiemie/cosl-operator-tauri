/**
 * 文件系统操作封装
 * 使用 Tauri 的 fs 和 dialog 插件实现本地文件存储
 */
import {
  exists,
  mkdir,
  readTextFile,
  writeTextFile,
  readDir,
  remove
} from '@tauri-apps/plugin-fs'
import { save } from '@tauri-apps/plugin-dialog'
import { appDataDir, join, downloadDir } from '@tauri-apps/api/path'

// 目录常量
const DOWNLOADS_DIR = 'downloads/processes'
const TEMP_DIR = 'temp/processes'
const QUICK_STEP_DIR = 'quick'

// 工艺类型
export type ProcessType = 'eyes' | 'xray' | 'halt-hass'

// 暂存工艺信息接口
export interface TempProcessInfo {
  fileName: string
  type: ProcessType
  name: string
  version: string
  boardModelId: number
  mode: '编辑' | '修改'
  processId?: number
}

// 暂存工艺数据接口
export interface TempProcessData {
  name: string
  version: string
  boardModelId: number
  feedbackList?: string[]
  json: any
}

/**
 * 文件系统操作 Composable
 */
export function useFileSystem() {
  /**
   * 确保目录存在
   */
  async function ensureDir(dirPath: string): Promise<void> {
    try {
      const appData = await appDataDir()
      const fullPath = await join(appData, dirPath)
      
      const dirExists = await exists(fullPath)
      if (!dirExists) {
        await mkdir(fullPath, { recursive: true })
      }
    } catch (error) {
      console.error('创建目录失败:', error)
      throw error
    }
  }

  /**
   * 初始化所有必要的目录
   */
  async function initDirectories(): Promise<void> {
    await ensureDir(DOWNLOADS_DIR)
    await ensureDir(TEMP_DIR)
    await ensureDir(QUICK_STEP_DIR)
  }

  /**
   * 获取下载缓存的工艺文件路径
   */
  async function getProcessCachePath(processId: number): Promise<string> {
    const appData = await appDataDir()
    return await join(appData, DOWNLOADS_DIR, `${processId}.json`)
  }

  /**
   * 检查工艺是否已缓存
   */
  async function isProcessCached(processId: number): Promise<boolean> {
    try {
      const filePath = await getProcessCachePath(processId)
      return await exists(filePath)
    } catch {
      return false
    }
  }

  /**
   * 读取缓存的工艺
   */
  async function readCachedProcess<T>(processId: number): Promise<T | null> {
    try {
      const filePath = await getProcessCachePath(processId)
      const content = await readTextFile(filePath)
      return JSON.parse(content) as T
    } catch (error) {
      console.error('读取缓存工艺失败:', error)
      return null
    }
  }

  /**
   * 保存工艺到缓存
   */
  async function saveProcessToCache(processId: number, data: any): Promise<boolean> {
    try {
      await ensureDir(DOWNLOADS_DIR)
      const filePath = await getProcessCachePath(processId)
      await writeTextFile(filePath, JSON.stringify(data, null, 2))
      return true
    } catch (error) {
      console.error('保存工艺缓存失败:', error)
      return false
    }
  }

  /**
   * 删除单个工艺缓存
   */
  async function deleteProcessCache(processId: number): Promise<boolean> {
    try {
      const filePath = await getProcessCachePath(processId)
      if (await exists(filePath)) {
        await remove(filePath)
        console.log('已删除工艺缓存:', processId)
      }
      return true
    } catch (error) {
      console.error('删除工艺缓存失败:', error)
      return false
    }
  }

  /**
   * 生成暂存工艺文件名
   * 格式: {type}-{boardModelId}-{name}-{version}-{mode}.json
   * 或: {type}-{boardModelId}-{name}-{version}-修改~{processId}.json
   */
  function generateTempFileName(
    type: ProcessType,
    boardModelId: number,
    name: string,
    version: string,
    isEdit: boolean,
    processId?: number
  ): string {
    const mode = isEdit ? `修改~${processId}` : '编辑'
    return `${type}-${boardModelId}-${name}-${version}-${mode}.json`
  }

  /**
   * 解析暂存工艺文件名
   */
  function parseTempFileName(fileName: string, data?: TempProcessData): TempProcessInfo | null {
    try {
      // 移除 .json 后缀
      const baseName = fileName.replace(/\.json$/, '')

      // 尝试匹配已知的工艺类型前缀（halt-hass 包含 -，需要特殊处理）
      let type: ProcessType
      let rest: string

      if (baseName.startsWith('halt-hass-')) {
        type = 'halt-hass'
        rest = baseName.substring('halt-hass-'.length)
      } else if (baseName.startsWith('eyes-')) {
        type = 'eyes'
        rest = baseName.substring('eyes-'.length)
      } else if (baseName.startsWith('xray-')) {
        type = 'xray'
        rest = baseName.substring('xray-'.length)
      } else {
        return null
      }

      // 板组可能为尚未选择时的 -1，模式始终位于文件名末尾。
      const boardMatch = rest.match(/^(-?\d+)-/)
      const modeMatch = rest.match(/-(编辑|修改~(\d+))$/)
      if (!boardMatch || !modeMatch) return null
      const boardModelId = Number(boardMatch[1])
      if (!Number.isSafeInteger(boardModelId)) return null
      const modeStr = modeMatch[1]
      const middle = rest.slice(boardMatch[0].length, -modeMatch[0].length)
      let name: string
      let version: string
      if (data !== undefined) {
        // 连字符无法区分名称和版本，使用已保存的内容恢复，保留旧文件名。
        if (!data || typeof data !== 'object' || Array.isArray(data)
          || typeof data.name !== 'string' || typeof data.version !== 'string'
          || !Number.isSafeInteger(data.boardModelId) || data.boardModelId !== boardModelId) return null
        name = data.name || (type === 'halt-hass' ? 'unnamed' : '')
        version = data.version
      } else {
        const parts = middle.split('-')
        if (parts.length !== 2) return null
        name = parts[0]
        version = parts[1]
      }

      // 解析模式
      if (modeStr === '编辑') {
        return {
          fileName,
          type,
          name,
          version,
          boardModelId,
          mode: '编辑'
        }
      } else if (modeStr.startsWith('修改~')) {
        const processId = Number(modeMatch[2])
        if (!Number.isSafeInteger(processId)) return null
        return {
          fileName,
          type,
          name,
          version,
          boardModelId,
          mode: '修改',
          processId
        }
      }

      return null
    } catch {
      return null
    }
  }

  /**
   * 获取暂存工艺文件路径
   */
  async function getTempProcessPath(fileName: string): Promise<string> {
    const appData = await appDataDir()
    return await join(appData, TEMP_DIR, fileName)
  }

  /**
   * 保存暂存工艺
   */
  async function saveTempProcess(
    type: ProcessType,
    boardModelId: number,
    name: string,
    version: string,
    isEdit: boolean,
    processId: number | undefined,
    data: TempProcessData
  ): Promise<boolean> {
    try {
      await ensureDir(TEMP_DIR)
      const fileName = generateTempFileName(type, boardModelId, name, version, isEdit, processId)
      const filePath = await getTempProcessPath(fileName)
      await writeTextFile(filePath, JSON.stringify(data, null, 2))
      return true
    } catch (error) {
      console.error('保存暂存工艺失败:', error)
      return false
    }
  }

  /**
   * 获取暂存工艺列表
   */
  async function getTempProcessList(type: ProcessType): Promise<TempProcessInfo[]> {
    try {
      await ensureDir(TEMP_DIR)
      const appData = await appDataDir()
      const dirPath = await join(appData, TEMP_DIR)
      
      const entries = await readDir(dirPath)
      const result: TempProcessInfo[] = []
      
      for (const entry of entries) {
        if (entry.isFile && entry.name?.startsWith(`${type}-`) && entry.name.endsWith('.json')) {
          let info = parseTempFileName(entry.name)
          if (!info) {
            const data = await loadTempProcess(entry.name)
            if (data) info = parseTempFileName(entry.name, data)
          }
          if (info && info.type === type) {
            result.push(info)
          }
        }
      }
      
      return result
    } catch (error) {
      console.error('获取暂存工艺列表失败:', error)
      return []
    }
  }

  /**
   * 加载暂存工艺
   */
  async function loadTempProcess(fileName: string): Promise<TempProcessData | null> {
    try {
      const filePath = await getTempProcessPath(fileName)
      const content = await readTextFile(filePath)
      return JSON.parse(content) as TempProcessData
    } catch (error) {
      console.error('加载暂存工艺失败:', error)
      return null
    }
  }

  /**
   * 删除暂存工艺
   */
  async function deleteTempProcess(fileName: string): Promise<boolean> {
    try {
      const filePath = await getTempProcessPath(fileName)
      const fileExists = await exists(filePath)
      if (fileExists) {
        await remove(filePath)
      }
      return true
    } catch (error) {
      console.error('删除暂存工艺失败:', error)
      return false
    }
  }

  /**
   * 清除所有工艺缓存
   */
  async function clearProcessCache(): Promise<void> {
    try {
      const appData = await appDataDir()
      const dirPath = await join(appData, DOWNLOADS_DIR)
      
      const dirExists = await exists(dirPath)
      if (!dirExists) return
      
      const entries = await readDir(dirPath)
      for (const entry of entries) {
        if (entry.isFile && entry.name?.endsWith('.json')) {
          const filePath = await join(dirPath, entry.name)
          await remove(filePath)
        }
      }
    } catch (error) {
      console.error('清除工艺缓存失败:', error)
    }
  }

  /**
   * 保存快捷检测项到本地
   */
  async function saveQuickSteps(steps: any[]): Promise<boolean> {
    try {
      await ensureDir(QUICK_STEP_DIR)
      const appData = await appDataDir()
      const filePath = await join(appData, QUICK_STEP_DIR, 'quick_step.json')
      await writeTextFile(filePath, JSON.stringify(steps, null, 2))
      return true
    } catch (error) {
      console.error('保存快捷检测项失败:', error)
      return false
    }
  }

  /**
   * 读取本地快捷检测项
   */
  async function readQuickSteps(): Promise<any[]> {
    try {
      const appData = await appDataDir()
      const filePath = await join(appData, QUICK_STEP_DIR, 'quick_step.json')
      
      const fileExists = await exists(filePath)
      if (!fileExists) return []
      
      const content = await readTextFile(filePath)
      return JSON.parse(content)
    } catch (error) {
      console.error('读取快捷检测项失败:', error)
      return []
    }
  }

  /**
   * 导出工艺到用户选择的位置
   * 使用 Tauri dialog 插件打开保存文件对话框
   */
  async function exportProcessToFile(data: any, defaultName: string): Promise<boolean> {
    try {
      // 获取默认下载目录
      const defaultPath = await downloadDir()
      
      // 打开保存文件对话框
      const filePath = await save({
        defaultPath: await join(defaultPath, `${defaultName}.json`),
        filters: [{
          name: '工艺文件',
          extensions: ['json']
        }],
        title: '导出工艺文件'
      })
      
      // 用户取消保存
      if (!filePath) {
        console.log('用户取消保存')
        return false
      }
      
      // 写入文件
      const jsonString = JSON.stringify(data, null, 2)
      await writeTextFile(filePath, jsonString)
      
      console.log('工艺导出成功:', filePath)
      return true
    } catch (error) {
      console.error('导出工艺失败:', error)
      return false
    }
  }

  return {
    // 初始化
    initDirectories,
    
    // 工艺缓存
    isProcessCached,
    readCachedProcess,
    saveProcessToCache,
    deleteProcessCache,
    clearProcessCache,
    
    // 暂存工艺
    saveTempProcess,
    getTempProcessList,
    loadTempProcess,
    deleteTempProcess,
    generateTempFileName,
    parseTempFileName,
    
    // 快捷检测项
    saveQuickSteps,
    readQuickSteps,
    
    // 导出
    exportProcessToFile
  }
}
