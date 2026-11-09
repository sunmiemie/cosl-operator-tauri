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
  HaltHassFlowType,
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
  haltHassTestType?: 1 | 2 | null
  haltHassTestTypeName?: string
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

  // 曲线文件上传状态

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
  const testFlow = computed(() => processJson.value.testFlow)
  const cycleFlow = computed(() => processJson.value.cycleFlow)
  
  function getRuntimeConfigError(): string | null {
    if (!metadata.value.boardGroup?.length) {
      return '请选择电路板组'
    }
    if (!metadata.value.productModel?.id) {
      return '请选择产品大类'
    }
    if (!['halt', 'hass'].includes(metadata.value.experimentMode)) {
      return '请选择 HALT 或 HASS 实验模式'
    }
    if (!metadata.value.applicableBoardModels?.length) {
      return '请至少选择一种适用电路板型号'
    }
    const assemblyRule = metadata.value.assemblyRule
    if (!assemblyRule || assemblyRule.slotCount <= 0 || assemblyRule.slots.length !== assemblyRule.slotCount) {
      return '请完整配置台架装配规则'
    }
    const applicableIds = new Set(metadata.value.applicableBoardModels.map(item => item.id))
    if (assemblyRule.minimumTargetBoards <= 0 || assemblyRule.minimumTargetBoards > assemblyRule.slotCount) {
      return '最少目标板数量必须在 1 到板位总数之间'
    }
    if (assemblyRule.slots.some(slot => (
      !slot.allowedBoardModelIds.length
      || slot.allowedBoardModelIds.some(id => !applicableIds.has(id))
    ))) {
      return '每个板位都必须配置工艺适用范围内的允许型号'
    }
    if (!['drive_control', 'rectifier_regulator'].includes(metadata.value.reportType)) {
      return '请选择报告类型'
    }
    if (metadata.value.reportType === 'rectifier_regulator') {
      const config = metadata.value.rectifierConfig
      if (!config) {
        return '请配置整流稳压工艺参数'
      }
      if (
        config.inputVoltageSteps.length !== 6
        || config.inputVoltageSteps.some(value => !Number.isFinite(value) || value <= 0)
        || new Set(config.inputVoltageSteps).size !== config.inputVoltageSteps.length
      ) {
        return '整流稳压固定报告要求配置 6 个不重复的正数输入电压档位'
      }
      if (
        !Number.isFinite(config.sourceCurrentLimitA)
        || config.sourceCurrentLimitA <= 0
        || !Number.isFinite(config.temperatureToleranceC)
        || config.temperatureToleranceC <= 0
        || !Number.isFinite(config.temperatureStableSeconds)
        || config.temperatureStableSeconds <= 0
        || !Number.isFinite(config.voltageSettleSeconds)
        || config.voltageSettleSeconds <= 0
        || !Number.isFinite(config.halfLoadSettleSeconds)
        || config.halfLoadSettleSeconds <= 0
        || !Number.isFinite(config.fullLoadSettleSeconds)
        || config.fullLoadSettleSeconds <= 0
      ) {
        return '整流稳压限流值、温度到位参数和等待时间必须大于 0'
      }
      if (
        Object.values(config.halfLoad).some(value => !Number.isFinite(value) || value <= 0)
        || Object.values(config.fullLoad).some(value => !Number.isFinite(value) || value <= 0)
      ) {
        return '整流稳压半载和满载电阻必须大于 0'
      }
      if (
        config.output48VoltageRange.min >= config.output48VoltageRange.max
        || config.output90VoltageRange.min >= config.output90VoltageRange.max
      ) {
        return '整流稳压参考电压范围下限必须小于上限'
      }
      if (config.currentUnit !== 'A') {
        return '整流稳压电流单位必须为 A'
      }
    }
    const productId = metadata.value.productModel.id
    const selectedProduct = treeData.value.find(item => item.id === productId)
    if (selectedProduct?.haltHassTestType === 2) {
      const config = metadata.value.sdsConfig
      if (!config || config.method !== 'full_hydraulic') {
        return '请配置 SDS 全套液压工艺参数'
      }
      if (config.power.voltage <= 0 || config.power.currentLimit <= 0) {
        return 'SDS 供电电压和限流值必须大于 0'
      }
      if (config.serial.baudRate <= 0 || config.serial.responseTimeoutSeconds <= 0) {
        return 'SDS 串口波特率和响应超时必须大于 0'
      }
      const trigger = config.temperatureTrigger
      if (
        trigger.toleranceC < 0
        || trigger.stableDurationSeconds <= 0
        || trigger.mqttTimeoutSeconds <= 0
      ) {
        return '请完整配置 SDS 温度触发参数'
      }
      if (config.communicationChecks.length !== 7) {
        return 'SDS 工艺必须保留 7 个通信角色'
      }
    }
    return null
  }

  const isRuntimeConfigComplete = computed(() => getRuntimeConfigError() === null)

  // 是否可以保存
  const canSave = computed(() => {
    return metadata.value.name.trim() !== ''
      && isRuntimeConfigComplete.value
      && !isSaving.value
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
    flowType: HaltHassFlowType,
    nodes: Node<BlockData>[],
    edges: Edge[],
    observeBlocks?: string[]
  ) {
    const currentFlow = getFlowchart(flowType)
    const serialized = serializeFlowchart(
      nodes,
      edges,
      observeBlocks,
      currentFlow.runSettings
    )
    processJson.value[flowType === 'test' ? 'testFlow' : 'cycleFlow'] = serialized
    editForm.hasUnsavedChanges = true
  }

  function getFlowchart(flowType: HaltHassFlowType) {
    return flowType === 'test'
      ? processJson.value.testFlow
      : processJson.value.cycleFlow
  }

  // 更新运行设置
  function updateRunSettings(flowType: HaltHassFlowType, settings: Partial<RunSettings>) {
    const flowchart = getFlowchart(flowType)
    flowchart.runSettings = {
      ...flowchart.runSettings,
      ...settings,
    }
    editForm.hasUnsavedChanges = true
  }

  // 更新观察块列表
  function updateObserveBlocks(flowType: HaltHassFlowType, blockIds: string[]) {
    getFlowchart(flowType).observeBlocks = blockIds
    editForm.hasUnsavedChanges = true
  }

  // 重置所有节点状态（运行前调用）
  function resetNodeStatuses(flowType: HaltHassFlowType) {
    const flowchart = getFlowchart(flowType)
    if (flowchart.nodes.length > 0) {
      flowchart.nodes = resetAllNodeStatus(
        flowchart.nodes
      )
    }
  }

  // 获取运行设置
  function getRunSettings(flowType: HaltHassFlowType): RunSettings {
    return getFlowchart(flowType).runSettings || { ...defaultRunSettings }
  }

  // 获取观察块列表
  function getObserveBlocks(flowType: HaltHassFlowType): string[] {
    const flowchart = getFlowchart(flowType)
    return (
      flowchart.observeBlocks ||
      flowchart.nodes.map((n) => n.id)
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
      if (
        data.schemaVersion !== 2
        || !data.metadata
        || !data.installGuide
        || !data.testFlow
        || !data.cycleFlow
      ) {
        throw new Error('无效的 HALT-HASS 双流程工艺文件')
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
        'halt-hass',
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
      if (!data.json) {
        throw new Error('无效的暂存文件格式')
      }
      const savedProcess = data.json as HaltHassProcessJson
      if (
        savedProcess.schemaVersion !== 2
        || !savedProcess.testFlow
        || !savedProcess.cycleFlow
      ) {
        throw new Error('暂存文件不是 HALT-HASS 双流程工艺')
      }
      // 使用已加载内容解析含连字符的旧文件名，失败时不沿用上次编辑目标。
      const info = fileSystem.parseTempFileName(fileName, data)
      if (!info) {
        throw new Error('暂存文件名与工艺信息不匹配')
      }
      processJson.value = savedProcess
      editForm.isEdit = info.mode === '修改'
      editForm.processId = info.processId ?? -1
      
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
      const files = await fileSystem.getTempProcessList('halt-hass')
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

  // 删除暂存工艺
  async function deleteTempProcess(fileName: string): Promise<boolean> {
    try {
      const success = await fileSystem.deleteTempProcess(fileName)
      if (success) {
        await fetchTempList()
      }
      return success
    } catch (error) {
      console.error('删除暂存工艺失败:', error)
      return false
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
    const previousGroupId = processJson.value.metadata.boardGroup?.[0]?.id
    const previousApplicableModels = Array.isArray(processJson.value.metadata.applicableBoardModels)
      ? processJson.value.metadata.applicableBoardModels
      : []
    selectedBoardGroup.value = group
    if (group) {
      // 更新 metadata 中的 boardGroup
      processJson.value.metadata.boardGroup = [{
        id: group.id,
        name: group.name,
      }]
      const previousById = new Map(previousApplicableModels.map(item => [item.id, item]))
      const keepPreviousSelection = previousGroupId === group.id && previousApplicableModels.length > 0
      processJson.value.metadata.applicableBoardModels = group.boards
        .filter(board => !keepPreviousSelection || previousById.has(board.id))
        .map((board) => ({
          id: board.id,
          name: board.name,
          code: board.code,
        }))
      const applicableIds = processJson.value.metadata.applicableBoardModels.map(item => item.id)
      const previousRule = processJson.value.metadata.assemblyRule
      const slotCount = Math.max(1, Math.min(32, Number(previousRule?.slotCount) || 5))
      processJson.value.metadata.assemblyRule = {
        slotCount,
        minimumTargetBoards: Math.max(
          1,
          Math.min(slotCount, Number(previousRule?.minimumTargetBoards) || 1),
        ),
        allowCompanionBoards: previousRule?.allowCompanionBoards ?? true,
        allowEmptySlots: previousRule?.allowEmptySlots ?? false,
        slots: Array.from({ length: slotCount }, (_, index) => {
          const previousSlot = previousRule?.slots?.find(item => item.slotNo === index + 1)
          const allowedBoardModelIds = (previousSlot?.allowedBoardModelIds || [])
            .filter(id => applicableIds.includes(id))
          return {
            slotNo: index + 1,
            name: previousSlot?.name || `板位 ${index + 1}`,
            required: previousRule?.allowEmptySlots ? (previousSlot?.required ?? true) : true,
            allowCompanion: (previousRule?.allowCompanionBoards ?? true)
              && (previousSlot?.allowCompanion ?? true),
            allowedBoardModelIds: allowedBoardModelIds.length
              ? allowedBoardModelIds
              : [...applicableIds],
          }
        }),
      }
      editForm.hasUnsavedChanges = true
    } else {
      processJson.value.metadata.boardGroup = []
      processJson.value.metadata.applicableBoardModels = []
      processJson.value.metadata.assemblyRule.slots = processJson.value.metadata.assemblyRule.slots
        .map(slot => ({ ...slot, allowedBoardModelIds: [] }))
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
    testFlow,
    cycleFlow,
    canSave,
    isRuntimeConfigComplete,

    // 基础方法
    resetProcess,
    updateMetadata,
    getRuntimeConfigError,

    // 安装指导方法
    updateInstallGuide,
    addInstallStep,
    updateInstallStep,
    deleteInstallStep,
    moveInstallStep,

    // 流程图方法
    updateFlowchart,
    getFlowchart,
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
    deleteTempProcess,
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
