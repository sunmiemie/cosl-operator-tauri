import { ref, reactive, computed, onMounted } from 'vue'
import { api } from '@/services/api'
import { useAuth } from '@/composables/useAuth'
import { useFileSystem, type TempProcessInfo } from '@/composables/useFileSystem'
import { ElMessageBox } from 'element-plus'

// 工艺步骤接口
export interface ProcessStep {
  id: number
  name: string
  desc: string
  pass: number
}

// 留存项接口
export interface ProcessPic {
  id: number
  url: string
  name: string
  desc: string
  save: string[]
}

// 具体检测点位接口
export interface DetailItem {
  id: number
  name: string
  url: string
  step: ProcessStep[]
  pic: ProcessPic[]
}

// 分区接口
export interface AreaItem {
  id: number
  url: string
  general: {
    step: ProcessStep[]
    pic: ProcessPic[]
  }
  detail: DetailItem[]
}

// 工艺总览接口
export interface ProcessTotal {
  url: string
  step: ProcessStep[]
  pic: ProcessPic[]
}

// 工艺JSON结构
export interface ProcessJson {
  eyes: {
    plane: { size: string }
    total: ProcessTotal
    area: AreaItem[]
  }
  eyesBak: {
    total: ProcessTotal
    area: AreaItem[]
  }
  xray: {
    total: ProcessTotal
    area: AreaItem[]
  }
}

// 工艺表单接口
export interface EditForm {
  boardModelId: number
  boardModel: string
  name: string
  version: string
  processId: number
}

// 树节点接口
export interface TreeNode {
  id: number
  label: string
  children?: TreeNode[]
}

// 创建空的工艺JSON
function createEmptyProcessJson(): ProcessJson {
  return {
    eyes: {
      plane: { size: '' },
      total: { url: '', step: [], pic: [] },
      area: []
    },
    eyesBak: {
      total: { url: '', step: [], pic: [] },
      area: []
    },
    xray: {
      total: { url: '', step: [], pic: [] },
      area: []
    }
  }
}

// 创建空的编辑表单
function createEmptyEditForm(): EditForm {
  return {
    boardModelId: -1,
    boardModel: '待选择',
    name: '',
    version: '',
    processId: -1
  }
}

export function useProcess(processType: 'eyes' | 'xray' = 'eyes') {
  const { userInfo, getAuthHeaders } = useAuth()
  const fileSystem = useFileSystem()

  // 当前步骤 (-1: 选择页, 1-4: 编辑步骤)
  const currentStep = ref(-1)
  // 步骤激活状态
  const stepsActivate = ref(0)
  // 当前工艺类型 (eyes/eyesBak/xray)
  const currentProcess = ref<'eyes' | 'eyesBak' | 'xray'>(processType)
  // 是否编辑模式
  const isEdit = ref(false)
  // 是否显示弓曲度检查
  const showPlane = ref(false)
  // 是否在线模式
  const isOnlineMode = ref(true)
  // JSON加载状态
  const jsonLoading = ref(false)
  // 下载进度
  const downloadProgress = ref(0)

  // 加载状态
  const isLoading = ref(false)
  const isUploading = ref(false)

  // 工艺数据
  const processJson = ref<ProcessJson>(createEmptyProcessJson())
  // 编辑表单
  const editForm = reactive<EditForm>(createEmptyEditForm())

  // 树形数据
  const treeData = ref<TreeNode[]>([])
  // 当前版本列表
  const presentProcess = ref<Array<{ id: number; name: string; version: string }>>([])
  // 当前选中的工艺
  const currentSelectProcess = ref<{ id: number; name: string; version: string } | null>(null)

  // 我的待处理工艺
  const myJobData = ref<any[]>([])
  // 暂存工艺
  const tempProcessData = ref<TempProcessInfo[]>([])

  // 反馈列表
  const feedbackList = ref<string[]>([])
  const showFeedback = ref(false)

  // 快捷检测项
  const quickTreeData = ref<any[]>([])
  const quickTableData = ref<any[]>([])
  const quickTreeLoading = ref(false)
  const quickTableLoading = ref(false)
  const selectQuickId = ref<number | undefined>(undefined)

  // 计算当前工艺的 total 和 area（带安全检查）
  const currentTotal = computed(() => {
    const pj = processJson.value
    if (currentProcess.value === 'eyes') {
      return pj.eyes?.total || { url: '', step: [], pic: [] }
    } else if (currentProcess.value === 'eyesBak') {
      return pj.eyesBak?.total || { url: '', step: [], pic: [] }
    } else {
      return pj.xray?.total || { url: '', step: [], pic: [] }
    }
  })

  const currentArea = computed(() => {
    const pj = processJson.value
    if (currentProcess.value === 'eyes') {
      return pj.eyes?.area || []
    } else if (currentProcess.value === 'eyesBak') {
      return pj.eyesBak?.area || []
    } else {
      return pj.xray?.area || []
    }
  })

  // 获取树形数据（仪表/电路板型号树）
  async function fetchTreeData() {
    try {
      // 实际 API: /equipment/instrument/list?currentPage=1&size=999999&isTree=True
      const response = await api.get<{ data: { list: TreeNode[] } }>(
        '/equipment/instrument/list',
        getAuthHeaders(),
        { currentPage: '1', size: '999999', isTree: 'true' }
      )
      if (response.success && response.data?.data) {
        treeData.value = response.data.data.list
      }
    } catch (error) {
      console.error('获取树形数据失败:', error)
    }
  }

  // 根据电路板型号获取工艺
  async function fetchProcessByBoardModel(boardModelId: number, label: string) {
    try {
      // 先清空当前版本列表，避免显示旧数据
      presentProcess.value = []
      currentSelectProcess.value = null
      
      // 实际 API: /test/addprocess/list/?boardModel_id=xxx
      const response = await api.get<{ data: any[] }>(
        '/test/addprocess/list/',
        getAuthHeaders(),
        { boardModel_id: String(boardModelId) }
      )
      if (response.success && response.data?.data) {
        const data = response.data.data
        const testType = processType === 'eyes' ? '目检测试' : 'X-Ray测试'
        let found = false
        for (const item of data) {
          if (item.type === testType) {
            presentProcess.value = (item.versionList || []).map((v: any) => ({
              ...v,
              name: label
            }))
            found = true
            break
          }
        }
        // 如果没有找到匹配的工艺类型，确保列表为空
        if (!found) {
          presentProcess.value = []
        }
      }
    } catch (error) {
      console.error('获取工艺数据失败:', error)
      presentProcess.value = []
    }
  }

  // 获取我的待处理工艺
  async function fetchMyJobData() {
    try {
      // 确保 user_id 是有效数字，如果无效则跳过请求
      const userId = userInfo.value?.id
      if (!userId || typeof userId !== 'number') {
        console.warn('用户未登录或用户ID无效，跳过获取待处理工艺')
        myJobData.value = []
        return
      }
      
      const testtypeId = processType === 'eyes' ? 2 : 5
      // 实际 API: /test/process/myjob/?user_id=xxx&testtype_id=xxx
      const response = await api.get<{ data: any[] }>(
        '/test/process/myjob/',
        getAuthHeaders(),
        { user_id: String(userId), testtype_id: String(testtypeId) }
      )
      if (response.success && response.data?.data) {
        myJobData.value = response.data.data
      }
    } catch (error) {
      console.error('获取待处理工艺失败:', error)
    }
  }

  // 获取暂存工艺列表（本地文件系统）
  async function fetchTempProcessData() {
    try {
      const list = await fileSystem.getTempProcessList(processType)
      tempProcessData.value = list
    } catch (error) {
      console.error('获取暂存工艺列表失败:', error)
      tempProcessData.value = []
    }
  }

  // 下载工艺（带本地缓存）
  async function downloadProcess(processId: number): Promise<boolean> {
    try {
      isLoading.value = true
      jsonLoading.value = true
      downloadProgress.value = 0

      // 检查本地是否有缓存（首次运行时可能报错，忽略）
      try {
        const isCached = await fileSystem.isProcessCached(processId)
        if (isCached) {
          const cached = await fileSystem.readCachedProcess<ProcessJson>(processId)
          if (cached) {
            console.log('使用本地缓存工艺:', processId)
            console.log('缓存数据结构:', Object.keys(cached))
            console.log('缓存数据.eyes:', !!cached.eyes)
            console.log('缓存数据.xray:', !!cached.xray)
            if (cached.eyes?.total?.url) {
              console.log('缓存 eyes.total.url 长度:', cached.eyes.total.url.length)
            }
            processJson.value = cached
            downloadProgress.value = 100
            return true
          }
        }
      } catch (cacheError) {
        console.warn('检查缓存失败，将从服务器下载:', cacheError)
      }

      // 从服务器下载（后端返回的是文件流，需要直接下载）
      downloadProgress.value = 0
      const authHeaders = getAuthHeaders()
      const baseUrl = api.getBaseUrl()
      const downloadUrl = `${baseUrl}/test/addprocess/download/?id=${processId}`
      
      console.log('下载工艺, URL:', downloadUrl)
      
      const response = await fetch(downloadUrl, {
        method: 'GET',
        headers: {
          ...authHeaders,
          'Accept': 'application/octet-stream, application/json'
        }
      })

      if (!response.ok) {
        console.error('下载工艺失败, HTTP状态:', response.status, await response.text())
        return false
      }

      // 获取总大小用于计算进度
      const contentLength = response.headers.get('Content-Length')
      const total = contentLength ? parseInt(contentLength, 10) : 0
      
      // 使用 ReadableStream 读取响应并跟踪进度
      let receivedLength = 0
      const chunks: Uint8Array[] = []
      const reader = response.body?.getReader()
      
      if (!reader) {
        console.error('无法获取响应流')
        return false
      }
      
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        
        chunks.push(value)
        receivedLength += value.length
        
        // 更新下载进度
        if (total > 0) {
          downloadProgress.value = Math.round((receivedLength / total) * 70) // 下载占70%
        } else {
          // 如果没有 Content-Length，显示已下载大小
          downloadProgress.value = Math.min(70, Math.round(receivedLength / 1000000 * 10))
        }
      }
      
      // 合并所有块
      const allChunks = new Uint8Array(receivedLength)
      let position = 0
      for (const chunk of chunks) {
        allChunks.set(chunk, position)
        position += chunk.length
      }
      
      // 转换为文本
      const text = new TextDecoder('utf-8').decode(allChunks)
      downloadProgress.value = 75
      
      console.log('下载工艺响应长度:', text.length)
      
      let rawData: any
      try {
        rawData = JSON.parse(text)
      } catch (e) {
        console.error('解析工艺JSON失败:', e, '原始响应:', text.substring(0, 500))
        return false
      }
      
      console.log('下载工艺原始数据结构:', Object.keys(rawData))
      console.log('rawData.json 存在:', !!rawData.json)
      if (rawData.json) {
        console.log('rawData.json 结构:', Object.keys(rawData.json))
      }
      
      downloadProgress.value = 85

      // 判断数据结构：可能是 { name, version, boardModelId, json } 或直接是 ProcessJson
      let processData: ProcessJson
      if (rawData.json && typeof rawData.json === 'object') {
        // 包装结构: { name, version, boardModelId, json: ProcessJson }
        // 检查 json 是否包含 eyes 或 xray
        if (rawData.json.eyes || rawData.json.xray) {
          console.log('使用包装结构 rawData.json')
          processData = rawData.json
        } else {
          // json 本身可能就是数据，不是嵌套的 ProcessJson
          console.log('rawData.json 不包含 eyes/xray，尝试作为 ProcessJson 使用')
          processData = rawData.json
        }
        // 同时更新表单信息
        if (rawData.name) editForm.name = rawData.name
        if (rawData.version) editForm.version = rawData.version
        if (rawData.boardModelId) editForm.boardModelId = rawData.boardModelId
      } else if (rawData.eyes || rawData.xray) {
        // 直接是 ProcessJson
        console.log('使用直接结构 rawData')
        processData = rawData
      } else {
        console.error('未知的工艺数据结构:', Object.keys(rawData))
        console.error('rawData 示例:', JSON.stringify(rawData).substring(0, 1000))
        return false
      }
      
      console.log('最终 processData 结构:', Object.keys(processData))
      console.log('processData.eyes 存在:', !!processData.eyes)
      console.log('processData.xray 存在:', !!processData.xray)

      downloadProgress.value = 90
      
      // 保存到本地缓存（忽略保存失败）
      try {
        await fileSystem.saveProcessToCache(processId, processData)
      } catch (saveError) {
        console.warn('保存工艺缓存失败:', saveError)
      }
      downloadProgress.value = 95
      
      // 加载工艺数据
      processJson.value = processData
      downloadProgress.value = 100
      console.log('下载工艺成功:', processId)
      return true
    } catch (error) {
      console.error('下载工艺失败:', error)
      return false
    } finally {
      isLoading.value = false
      jsonLoading.value = false
    }
  }

  // 加载暂存工艺
  async function loadTempProcess(fileName: string): Promise<boolean> {
    try {
      jsonLoading.value = true
      const data = await fileSystem.loadTempProcess(fileName)
      if (data) {
        editForm.boardModelId = data.boardModelId
        editForm.name = data.name
        editForm.version = data.version
        processJson.value = data.json
        
        if (data.feedbackList && data.feedbackList.length > 0) {
          showFeedback.value = true
          feedbackList.value = data.feedbackList
        }
        
        // 设置当前工艺类型的数据
        if (processType === 'eyes') {
          currentTotal.value.url = processJson.value.eyes.total.url
        } else {
          currentTotal.value.url = processJson.value.xray.total.url
        }
        
        return true
      }
      return false
    } catch (error) {
      console.error('加载暂存工艺失败:', error)
      return false
    } finally {
      jsonLoading.value = false
    }
  }

  // 删除暂存工艺
  async function deleteTempProcess(fileName: string): Promise<boolean> {
    try {
      const success = await fileSystem.deleteTempProcess(fileName)
      if (success) {
        // 刷新列表
        await fetchTempProcessData()
      }
      return success
    } catch (error) {
      console.error('删除暂存工艺失败:', error)
      return false
    }
  }

  // 上传工艺（目检测试）
  async function uploadProcess(): Promise<boolean> {
    try {
      isUploading.value = true
      // 实际 API: /test/addprocess/eyestest/ 或 /test/addprocess/xraytest/
      const endpoint = processType === 'eyes' 
        ? '/test/addprocess/eyestest/' 
        : '/test/addprocess/xraytest/'
      
      const testtypeId = processType === 'eyes' ? 2 : 5
      
      const response = await api.post<{ msg: string }>(endpoint, {
        name: editForm.name,
        board_model_id: editForm.boardModelId,
        version: editForm.version,
        testtype: testtypeId,
        userId: userInfo.value?.id,
        file: {
          name: editForm.name,
          version: editForm.version,
          boardModelId: editForm.boardModelId,
          json: processJson.value
        }
      })
      return response.success && response.data?.msg === 'success'
    } catch (error) {
      console.error('上传工艺失败:', error)
      return false
    } finally {
      isUploading.value = false
    }
  }

  // 更新工艺
  async function updateProcess(): Promise<boolean> {
    try {
      isUploading.value = true
      // 实际 API: /test/addprocess/eyesupdate/ 或 /test/addprocess/xrayupdate/
      const endpoint = processType === 'eyes' 
        ? '/test/addprocess/eyesupdate/' 
        : '/test/addprocess/xrayupdate/'
      
      const response = await api.post<{ msg: string }>(endpoint, {
        id: editForm.processId,
        name: editForm.name,
        version: editForm.version,
        file: {
          name: editForm.name,
          version: editForm.version,
          boardModelId: editForm.boardModelId,
          json: processJson.value
        }
      })
      return response.success && response.data?.msg === 'success'
    } catch (error) {
      console.error('更新工艺失败:', error)
      return false
    } finally {
      isUploading.value = false
    }
  }

  // 提交审核
  async function submitProcess(processId: number): Promise<boolean> {
    try {
      // 实际 API: /test/addprocess/submitcheck/
      const response = await api.post<{ msg: string }>('/test/addprocess/submitcheck/', {
        id: processId
      })
      return response.success && response.data?.msg === 'success'
    } catch (error) {
      console.error('提交审核失败:', error)
      return false
    }
  }

  // 删除工艺
  async function deleteProcess(processId: number): Promise<boolean> {
    try {
      // 实际 API: /test/process/delete/{id}/
      const response = await api.delete<{ code: number }>(`/test/process/delete/${processId}/`)
      return response.success && response.data?.code === 0
    } catch (error) {
      console.error('删除工艺失败:', error)
      return false
    }
  }

  // 保存暂存工艺（本地文件系统）
  async function saveTempProcess(): Promise<boolean> {
    try {
      const success = await fileSystem.saveTempProcess(
        processType,
        editForm.boardModelId,
        editForm.name,
        editForm.version,
        isEdit.value,
        isEdit.value ? editForm.processId : undefined,
        {
          name: editForm.name,
          version: editForm.version,
          boardModelId: editForm.boardModelId,
          feedbackList: feedbackList.value,
          json: processJson.value
        }
      )
      if (success) {
        // 刷新暂存列表
        await fetchTempProcessData()
      }
      return success
    } catch (error) {
      console.error('保存暂存工艺失败:', error)
      return false
    }
  }

  // 导出工艺到文件
  async function exportProcessToFile(): Promise<boolean> {
    const fileName = `${processType}-${editForm.boardModelId}-${editForm.name}-${editForm.version}`
    return await fileSystem.exportProcessToFile(
      {
        name: editForm.name,
        version: editForm.version,
        boardModelId: editForm.boardModelId,
        json: processJson.value
      },
      fileName
    )
  }

  // 读取离线JSON文件
  async function readOfflineJson(file: File): Promise<boolean> {
    try {
      jsonLoading.value = true
      
      return new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = (e) => {
          try {
            const content = e.target?.result as string
            const data = JSON.parse(content)
            
            if (data.json) {
              processJson.value = data.json
              if (data.name) editForm.name = data.name
              if (data.version) editForm.version = data.version
              if (data.boardModelId) editForm.boardModelId = data.boardModelId
            } else {
              // 直接是 ProcessJson 格式
              processJson.value = data
            }
            
            // 设置当前工艺类型的数据
            if (processType === 'eyes') {
              currentTotal.value.url = processJson.value.eyes.total.url
            } else {
              currentTotal.value.url = processJson.value.xray.total.url
            }
            
            resolve(true)
          } catch (error) {
            console.error('解析JSON失败:', error)
            resolve(false)
          } finally {
            jsonLoading.value = false
          }
        }
        reader.onerror = () => {
          console.error('读取文件失败')
          jsonLoading.value = false
          resolve(false)
        }
        reader.readAsText(file)
      })
    } catch (error) {
      console.error('读取离线JSON失败:', error)
      jsonLoading.value = false
      return false
    }
  }

  // 添加整体检测项
  function addTotalStep() {
    const total = currentTotal.value
    total.step.push({
      id: total.step.length + 1,
      name: '',
      desc: '',
      pass: 0
    })
  }

  // 添加整体留存项
  function addTotalPic() {
    const total = currentTotal.value
    total.pic.push({
      id: total.pic.length + 1,
      url: '',
      name: '',
      desc: '',
      save: []
    })
  }

  // 删除整体检测项
  function deleteTotalStep(id: number) {
    const total = currentTotal.value
    const index = total.step.findIndex(item => item.id === id)
    if (index !== -1) {
      total.step.splice(index, 1)
      total.step.forEach((item, i) => (item.id = i + 1))
    }
  }

  // 删除整体留存项
  function deleteTotalPic(id: number) {
    const total = currentTotal.value
    const index = total.pic.findIndex(item => item.id === id)
    if (index !== -1) {
      total.pic.splice(index, 1)
      total.pic.forEach((item, i) => (item.id = i + 1))
    }
  }

  // 添加分区
  function addArea(url: string) {
    const area = currentArea.value
    area.push({
      id: area.length + 1,
      url,
      general: {
        step: [{ id: 1, name: '', desc: '', pass: 0 }],
        pic: []
      },
      detail: [
        {
          id: 1,
          name: '',
          url: '',
          step: [{ id: 1, name: '', desc: '', pass: 0 }],
          pic: []
        }
      ]
    })
  }

  // 添加分区检测项
  function addAreaStep(areaId: number) {
    const area = currentArea.value.find(a => a.id === areaId)
    if (area) {
      area.general.step.push({
        id: area.general.step.length + 1,
        name: '',
        desc: '',
        pass: 0
      })
    }
  }

  // 添加分区留存项
  function addAreaPic(areaId: number) {
    const area = currentArea.value.find(a => a.id === areaId)
    if (area) {
      area.general.pic.push({
        id: area.general.pic.length + 1,
        url: '',
        name: '',
        desc: '',
        save: []
      })
    }
  }

  // 添加具体点位
  function addAreaDetail(areaId: number) {
    const area = currentArea.value.find(a => a.id === areaId)
    if (area) {
      area.detail.push({
        id: area.detail.length + 1,
        name: '',
        url: '',
        step: [{ id: 1, name: '', desc: '', pass: 0 }],
        pic: []
      })
    }
  }

  // 删除分区检测项
  function deleteAreaStep(areaId: number, stepId: number) {
    const area = currentArea.value.find(a => a.id === areaId)
    if (area) {
      const index = area.general.step.findIndex(s => s.id === stepId)
      if (index !== -1) {
        area.general.step.splice(index, 1)
        area.general.step.forEach((item, i) => (item.id = i + 1))
      }
    }
  }

  // 删除分区留存项
  function deleteAreaPic(areaId: number, picId: number) {
    const area = currentArea.value.find(a => a.id === areaId)
    if (area) {
      const index = area.general.pic.findIndex(p => p.id === picId)
      if (index !== -1) {
        area.general.pic.splice(index, 1)
        area.general.pic.forEach((item, i) => (item.id = i + 1))
      }
    }
  }

  // 删除具体点位
  function deleteAreaDetail(areaId: number, detailId: number) {
    const area = currentArea.value.find(a => a.id === areaId)
    if (area) {
      const index = area.detail.findIndex(d => d.id === detailId)
      if (index !== -1) {
        area.detail.splice(index, 1)
        area.detail.forEach((item, i) => (item.id = i + 1))
      }
    }
  }

  // 重置工艺数据
  function resetProcess() {
    currentStep.value = -1
    stepsActivate.value = 0
    isEdit.value = false
    showPlane.value = false
    showFeedback.value = false
    feedbackList.value = []
    processJson.value = createEmptyProcessJson()
    Object.assign(editForm, createEmptyEditForm())
    currentProcess.value = processType
    currentSelectProcess.value = null
    presentProcess.value = []
  }

  // 开始编辑
  function startEdit() {
    currentStep.value = 1
    // 确保工艺数据结构正确初始化
    const pj = processJson.value
    console.log('startEdit - 完整 processJson:', JSON.stringify(pj).substring(0, 500))
    if (currentProcess.value === 'eyes' && pj.eyes) {
      // 数据已就绪，无需额外操作
      const url = pj.eyes.total?.url
      console.log('开始编辑目检工艺, 当前URL长度:', url?.length || 0)
      console.log('开始编辑目检工艺, 当前URL前100字符:', url?.substring(0, 100))
      console.log('目检分区数量:', pj.eyes.area?.length || 0)
    } else if (currentProcess.value === 'xray' && pj.xray) {
      const url = pj.xray.total?.url
      console.log('开始编辑X-Ray工艺, 当前URL长度:', url?.length || 0)
      console.log('X-Ray分区数量:', pj.xray.area?.length || 0)
    } else {
      console.warn('startEdit - 没有找到对应的工艺数据！当前类型:', currentProcess.value)
      console.warn('pj.eyes:', !!pj.eyes, ', pj.xray:', !!pj.xray)
    }
  }

  // 下一步
  function nextStep() {
    if (currentProcess.value === 'eyes') {
      // 目检正面流程步骤 (stepsActivate = 0):
      // Step 1 (showPlane=false): 图片分区
      // Step 1 (showPlane=true): 弓曲度检查
      // Step 2: 整体流程
      // Step 3: 分区流程
      // 完成 Step 3 后，询问是否创建背面检测
      if (currentStep.value === 1 && !showPlane.value) {
        showPlane.value = true
        return
      }
      if (currentStep.value < 3) {
        currentStep.value++
      } else if (currentStep.value === 3) {
        // 完成正面流程，询问是否创建背面检测
        ElMessageBox.confirm(
          '是否创建背面检测？',
          '背面检测',
          {
            distinguishCancelAndClose: true,
            confirmButtonText: '创建',
            cancelButtonText: '跳过',
          }
        )
          .then(() => {
            // 创建背面流程 - 切换到 eyesBak，重置步骤
            currentProcess.value = 'eyesBak'
            stepsActivate.value = 1 // 背面流程指示器
            currentStep.value = 1
            showPlane.value = false
          })
          .catch((action) => {
            if (action === 'cancel') {
              // 跳过背面，清空背面数据，直接进入导出
              processJson.value.eyesBak = {
                total: { url: '', step: [], pic: [] },
                area: []
              }
              currentStep.value = 4
              stepsActivate.value = 2 // 导出流程指示器
            }
          })
      }
    } else if (currentProcess.value === 'eyesBak') {
      // 目检背面流程步骤 (stepsActivate = 1):
      // Step 1: 图片分区（背面无弓曲度检查）
      // Step 2: 整体流程
      // Step 3: 分区流程
      // Step 4: 导出预览
      if (currentStep.value < 4) {
        currentStep.value++
        if (currentStep.value === 4) {
          stepsActivate.value = 2 // 导出流程指示器
        }
      }
    } else {
      // X-Ray流程步骤：
      // Step 1: 图片分区 -> stepsActivate 0 (整体流程)
      // Step 2: 整体流程 -> stepsActivate 0 (整体流程)
      // Step 3: 分区流程 -> stepsActivate 1 (分区流程)
      // Step 4: 导出预览 -> stepsActivate 2 (导出流程)
      if (currentStep.value < 4) {
        currentStep.value++
        if (currentStep.value === 3) {
          stepsActivate.value = 1
        } else if (currentStep.value === 4) {
          stepsActivate.value = 2
        }
      }
    }
  }

  // 上一步
  function prevStep() {
    if (currentProcess.value === 'eyes') {
      // 目检正面流程上一步逻辑
      if (currentStep.value === 1 && showPlane.value) {
        // 从弓曲度检查返回到图片分区
        showPlane.value = false
        return
      }
      if (currentStep.value > 1) {
        currentStep.value--
        // 返回到步骤1时显示弓曲度检查
        if (currentStep.value === 1) {
          showPlane.value = true
        }
      }
      // 正面流程始终 stepsActivate = 0
      stepsActivate.value = 0
    } else if (currentProcess.value === 'eyesBak') {
      // 目检背面流程上一步逻辑
      if (currentStep.value > 1) {
        currentStep.value--
        // 背面流程始终 stepsActivate = 1
        stepsActivate.value = 1
      } else {
        // 从背面流程返回正面流程（Step 3）
        currentProcess.value = 'eyes'
        currentStep.value = 3
        stepsActivate.value = 0
      }
    } else {
      // X-Ray上一步逻辑
      if (currentStep.value > 1) {
        currentStep.value--
        // 更新步骤指示器
        if (currentStep.value === 1 || currentStep.value === 2) {
          stepsActivate.value = 0
        } else if (currentStep.value === 3) {
          stepsActivate.value = 1
        }
      }
    }
  }

  // 设置整体图片
  function setTotalImage(url: string) {
    if (currentProcess.value === 'eyes') {
      processJson.value.eyes.total.url = url
    } else if (currentProcess.value === 'eyesBak') {
      processJson.value.eyesBak.total.url = url
    } else {
      processJson.value.xray.total.url = url
    }
  }

  // 设置分区图片
  function setAreaImage(areaId: number, url: string) {
    const area = currentArea.value.find(a => a.id === areaId)
    if (area) {
      area.url = url
    }
  }

  // 删除分区
  function deleteArea(id: number) {
    const index = currentArea.value.findIndex(a => a.id === id)
    if (index !== -1) {
      currentArea.value.splice(index, 1)
      // 重新编号
      currentArea.value.forEach((area, i) => {
        area.id = i + 1
      })
    }
  }

  // 分区排序
  function reorderAreas(fromIndex: number, toIndex: number) {
    const areas = currentArea.value
    const [item] = areas.splice(fromIndex, 1)
    areas.splice(toIndex, 0, item)
    // 重新编号
    areas.forEach((area, i) => {
      area.id = i + 1
    })
  }

  // 获取快捷检测项树
  async function fetchQuickTestTree() {
    try {
      quickTreeLoading.value = true
      // API: /data/check-item-directory/list
      const response = await api.get<{ data: any[] }>(
        '/data/check-item-directory/list',
        getAuthHeaders()
      )
      if (response.success && response.data?.data) {
        quickTreeData.value = response.data.data
      }
    } catch (error) {
      console.error('获取快捷检测项树失败:', error)
    } finally {
      quickTreeLoading.value = false
    }
  }

  // 获取快捷检测项数据
  async function fetchQuickTestData(directoryId: number) {
    try {
      quickTableLoading.value = true
      selectQuickId.value = directoryId
      // API: /data/check-item/list?secondLevelDirectoryId=xxx&size=999999
      const response = await api.get<{ data: { list: any[] } }>(
        '/data/check-item/list',
        getAuthHeaders(),
        { secondLevelDirectoryId: String(directoryId), size: '999999' }
      )
      if (response.success && response.data?.data) {
        quickTableData.value = response.data.data.list || []
      }
    } catch (error) {
      console.error('获取快捷检测项数据失败:', error)
    } finally {
      quickTableLoading.value = false
    }
  }

  // 添加快捷整体检测项
  function addQuickTotalStep(name: string, desc: string) {
    const total = currentTotal.value
    total.step.push({
      id: total.step.length + 1,
      name,
      desc,
      pass: 0
    })
  }

  // 添加快捷分区检测项
  function addQuickAreaStep(areaId: number, name: string, desc: string) {
    const area = currentArea.value.find(a => a.id === areaId)
    if (area) {
      area.general.step.push({
        id: area.general.step.length + 1,
        name,
        desc,
        pass: 0
      })
    }
  }

  // 保存检测项到快捷列表
  async function saveToQuickStep(name: string, desc: string): Promise<boolean> {
    try {
      // API: 保存到服务器（可选）或本地
      // 这里先实现本地保存
      const steps = await fileSystem.readQuickSteps()
      steps.push({ name, desc })
      return await fileSystem.saveQuickSteps(steps)
    } catch (error) {
      console.error('保存快捷检测项失败:', error)
      return false
    }
  }

  // 初始化文件系统目录
  async function initFileSystem() {
    try {
      await fileSystem.initDirectories()
    } catch (error) {
      console.error('初始化文件系统失败:', error)
    }
  }

  // 组件挂载时初始化
  onMounted(() => {
    initFileSystem()
  })

  return {
    // 状态
    currentStep,
    stepsActivate,
    currentProcess,
    isEdit,
    showPlane,
    isOnlineMode,
    isLoading,
    isUploading,
    jsonLoading,
    downloadProgress,
    processJson,
    editForm,
    treeData,
    presentProcess,
    currentSelectProcess,
    myJobData,
    tempProcessData,
    feedbackList,
    showFeedback,
    processType,

    // 快捷检测项
    quickTreeData,
    quickTableData,
    quickTreeLoading,
    quickTableLoading,
    selectQuickId,

    // 计算属性
    currentTotal,
    currentArea,

    // 数据获取方法
    fetchTreeData,
    fetchProcessByBoardModel,
    fetchMyJobData,
    fetchTempProcessData,
    downloadProcess,
    uploadProcess,
    updateProcess,
    submitProcess,
    deleteProcess,
    saveTempProcess,
    loadTempProcess,
    deleteTempProcess,
    exportProcessToFile,
    readOfflineJson,

    // 快捷检测项方法
    fetchQuickTestTree,
    fetchQuickTestData,
    addQuickTotalStep,
    addQuickAreaStep,
    saveToQuickStep,

    // 编辑方法
    addTotalStep,
    addTotalPic,
    deleteTotalStep,
    deleteTotalPic,
    addArea,
    addAreaStep,
    addAreaPic,
    addAreaDetail,
    deleteAreaStep,
    deleteAreaPic,
    deleteAreaDetail,
    deleteArea,
    reorderAreas,

    // 流程控制
    resetProcess,
    startEdit,
    nextStep,
    prevStep,
    setTotalImage,
    setAreaImage,
    initFileSystem
  }
}
