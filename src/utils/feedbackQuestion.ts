/**
 * 疑问/反馈数据解析工具
 * 
 * 将 FeedbackData.feedback_json / QuestionData.question_json 解析为统一的 TargetItem[] 结构
 * 用于驱动 3D/X-Ray 检测的清单模式重检
 * 
 * 参考旧程序:
 * - FeedbackThreeDTest.vue: generateFeedbackStepList()
 * - QuestionThreeDTest.vue: generateQuestionStepList()
 * - TempFeedbackThreeDTest.vue: feedbackIds 提取逻辑
 */

import type { FeedbackData, QuestionData, ProcessJson, EyesSideData, StepItem } from '@/services/process'
import type { ReportData } from '@/services/report'

// ==================== 类型定义 ====================

/**
 * 目标项位置类型
 * - total: 整体检测 (eyes.total / eyesBak.total / xray.total)
 * - area: 区域检测
 */
export type TargetPosition = 'total' | 'area'

/**
 * 区域位置类型
 * - general: 区域通用检测
 * - detail: 具体点位检测
 */
export type AreaPosition = 'general' | 'detail'

/**
 * 数据类型
 * - eyes: 正面 3D 目检
 * - eyesBak: 背面 3D 目检
 * - xray: X-Ray 检测
 */
export type DataType = 'eyes' | 'eyesBak' | 'xray'

/**
 * 原始反馈/疑问项结构（从后端 JSON 解析）
 * 参考旧程序 feedbackJson / questionJson 的数据结构
 */
export interface RawTargetItem {
  id: number                          // 步骤 ID
  type: DataType                      // 数据类型: eyes / eyesBak / xray
  position: TargetPosition            // 位置类型: total / area
  areaPosition?: AreaPosition         // 区域位置: general / detail (当 position='area' 时)
  areaId?: number                     // 区域 ID (当 position='area' 时)
  detailId?: number                   // 点位 ID (当 areaPosition='detail' 时)
  content?: {                         // 原始内容（包含 pass 状态和 error/question 数据）
    id: number
    name: string
    desc?: string
    pass: number
    error?: { url: string[]; desc: string }
    question?: { url: string[]; desc: string }
    warn?: { url: string[]; desc: string }
  }
}

/**
 * 临时工单原始目标项结构
 * 临时工单的 feedback/question JSON 结构更简单，只包含 id
 */
export interface RawTempTargetItem {
  id: number
}

/**
 * 统一目标项结构
 * 用于清单驱动模式的重检流程
 */
export interface TargetItem {
  // 唯一标识（用于列表 key）
  key: string
  
  // 定位信息
  type: DataType                      // 数据类型
  position: TargetPosition            // 位置类型
  areaPosition?: AreaPosition         // 区域位置
  areaId?: number                     // 区域 ID
  detailId?: number                   // 点位 ID
  stepId: number                      // 步骤 ID
  
  // 步骤信息（从工艺中查找）
  stepName: string                    // 步骤名称
  stepDesc?: string                   // 步骤描述
  referenceUrl?: string               // 参考图 URL
  
  // 当前状态
  pass: number                        // 当前 pass 状态 (0=未检测, 1=合格, 2=缺陷, 3=疑问, 4=缺陷+疑问)
  
  // 错误/疑问/警示数据
  error?: { url: string[]; desc: string }
  question?: { url: string[]; desc: string }
  warn?: { url: string[]; desc: string }
}

// ==================== 解析函数 ====================

/**
 * 生成目标项的唯一 key
 */
function generateTargetKey(item: Omit<TargetItem, 'key' | 'stepName' | 'stepDesc' | 'referenceUrl' | 'pass'>): string {
  const parts: string[] = [item.type, item.position]
  if (item.areaId !== undefined) parts.push(`a${item.areaId}`)
  if (item.areaPosition) parts.push(item.areaPosition)
  if (item.detailId !== undefined) parts.push(`d${item.detailId}`)
  parts.push(`s${item.stepId}`)
  return parts.join('-')
}

/**
 * 从工艺数据中查找步骤信息
 * 参考旧程序 generateFeedbackStepList 的查找逻辑
 */
function findStepInfo(
  processJson: ProcessJson,
  type: DataType,
  position: TargetPosition,
  stepId: number,
  areaId?: number,
  areaPosition?: AreaPosition,
  detailId?: number
): { step?: StepItem; url?: string } {
  let eyesData: EyesSideData | undefined
  
  // 获取对应的目检数据
  if (type === 'eyes') {
    eyesData = processJson.eyes
  } else if (type === 'eyesBak') {
    eyesData = processJson.eyesBak
  } else if (type === 'xray') {
    // X-Ray 使用类似的结构
    eyesData = processJson.xray as unknown as EyesSideData
  }
  
  if (!eyesData) return {}
  
  if (position === 'total') {
    // 整体检测
    const step = eyesData.total?.step?.find(s => s.id === stepId)
    return { step, url: eyesData.total?.url }
  }
  
  if (position === 'area' && areaId !== undefined) {
    const area = eyesData.area?.find(a => a.id === areaId)
    if (!area) return {}
    
    if (areaPosition === 'general') {
      // 区域通用检测
      const step = area.general?.step?.find(s => s.id === stepId)
      return { step, url: area.url }
    }
    
    if (areaPosition === 'detail' && detailId !== undefined) {
      // 具体点位检测
      const detail = area.detail?.find(d => d.id === detailId)
      const step = detail?.step?.find(s => s.id === stepId)
      return { step, url: detail?.url }
    }
  }
  
  return {}
}

/**
 * 从报告数据中查找已有的错误/疑问/警示数据
 * 参考旧程序 generateFeedbackStepList 的报告数据合并逻辑
 */
function findReportData(
  reportData: ReportData | undefined,
  type: DataType,
  position: TargetPosition,
  stepId: number,
  areaId?: number,
  areaPosition?: AreaPosition,
  detailId?: number
): { error?: { url: string[]; desc: string }; question?: { url: string[]; desc: string }; warn?: { url: string[]; desc: string } } {
  if (!reportData?.json) return {}
  
  const threeD = (reportData.json.threeD || {}) as Record<string, unknown>
  const eyesKey = type === 'eyes' ? 'eyes' : type === 'eyesBak' ? 'eyesBak' : 'xray'
  const eyesData = (type === 'xray' ? reportData.json.xray : threeD[eyesKey]) as { total?: Record<string, unknown[]>; area?: Record<string, unknown>[] } | undefined
  
  if (!eyesData) return {}
  
  let target: Record<string, unknown[]> | undefined
  
  if (position === 'total') {
    target = eyesData.total as Record<string, unknown[]>
  } else if (position === 'area' && areaId !== undefined) {
    const area = eyesData.area?.find((a: Record<string, unknown>) => a.id === areaId) as Record<string, unknown> | undefined
    if (!area) return {}
    
    if (areaPosition === 'general') {
      target = area.general as Record<string, unknown[]>
    } else if (areaPosition === 'detail' && detailId !== undefined) {
      const detailArr = area.detail as Record<string, unknown>[] | undefined
      target = detailArr?.find((d: Record<string, unknown>) => d.id === detailId) as Record<string, unknown[]> | undefined
    }
  }
  
  if (!target) return {}
  
  // 查找各类数据列表中的对应项
  const result: { error?: { url: string[]; desc: string }; question?: { url: string[]; desc: string }; warn?: { url: string[]; desc: string } } = {}
  
  const errorList = target.errorList as Array<{ id: number; error: { url: string[]; desc: string } }> | undefined
  const errorItem = errorList?.find(e => e.id === stepId)
  if (errorItem?.error) result.error = errorItem.error
  
  const questionList = target.questionList as Array<{ id: number; question: { url: string[]; desc: string } }> | undefined
  const questionItem = questionList?.find(q => q.id === stepId)
  if (questionItem?.question) result.question = questionItem.question
  
  const warnList = target.warnList as Array<{ id: number; warn: { url: string[]; desc: string } }> | undefined
  const warnItem = warnList?.find(w => w.id === stepId)
  if (warnItem?.warn) result.warn = warnItem.warn
  
  return result
}

/**
 * 解析反馈数据为目标清单
 * 
 * @param feedbackData 从后端下载的反馈数据
 * @param processJson 工艺 JSON（用于查找步骤信息）
 * @param reportData 已有报告数据（用于获取原始错误/疑问数据）
 * @returns 统一的目标项列表
 */
export function parseFeedbackTargets(
  feedbackData: FeedbackData | undefined | null,
  processJson: ProcessJson | undefined | null,
  reportData?: ReportData | null
): TargetItem[] {
  if (!feedbackData?.feedback_json || !Array.isArray(feedbackData.feedback_json)) {
    return []
  }
  
  const rawItems = feedbackData.feedback_json as RawTargetItem[]
  const targets: TargetItem[] = []
  
  for (const raw of rawItems) {
    // 从工艺中查找步骤信息
    const { step, url } = processJson 
      ? findStepInfo(processJson, raw.type, raw.position, raw.id, raw.areaId, raw.areaPosition, raw.detailId)
      : { step: undefined, url: undefined }
    
    // 从报告中查找已有数据
    const existingData = reportData
      ? findReportData(reportData, raw.type, raw.position, raw.id, raw.areaId, raw.areaPosition, raw.detailId)
      : {}
    
    // 合并内容数据和报告数据
    const pass = raw.content?.pass ?? step?.pass ?? 0
    const error = raw.content?.error ?? existingData.error
    const question = raw.content?.question ?? existingData.question
    const warn = raw.content?.warn ?? existingData.warn
    
    const item: TargetItem = {
      key: generateTargetKey({
        type: raw.type,
        position: raw.position,
        areaPosition: raw.areaPosition,
        areaId: raw.areaId,
        detailId: raw.detailId,
        stepId: raw.id
      }),
      type: raw.type,
      position: raw.position,
      areaPosition: raw.areaPosition,
      areaId: raw.areaId,
      detailId: raw.detailId,
      stepId: raw.id,
      stepName: raw.content?.name ?? step?.name ?? `步骤 ${raw.id}`,
      stepDesc: raw.content?.desc ?? step?.desc,
      referenceUrl: url,
      pass,
      error,
      question,
      warn
    }
    
    targets.push(item)
  }
  
  return targets
}

/**
 * 解析疑问数据为目标清单
 * 
 * @param questionData 从后端下载的疑问数据
 * @param processJson 工艺 JSON（用于查找步骤信息）
 * @param reportData 已有报告数据（用于获取原始数据）
 * @returns 统一的目标项列表
 */
export function parseQuestionTargets(
  questionData: QuestionData | undefined | null,
  processJson: ProcessJson | undefined | null,
  reportData?: ReportData | null
): TargetItem[] {
  if (!questionData?.question_json || !Array.isArray(questionData.question_json)) {
    return []
  }
  
  const rawItems = questionData.question_json as RawTargetItem[]
  const targets: TargetItem[] = []
  
  for (const raw of rawItems) {
    // 从工艺中查找步骤信息
    const { step, url } = processJson 
      ? findStepInfo(processJson, raw.type, raw.position, raw.id, raw.areaId, raw.areaPosition, raw.detailId)
      : { step: undefined, url: undefined }
    
    // 从报告中查找已有数据
    const existingData = reportData
      ? findReportData(reportData, raw.type, raw.position, raw.id, raw.areaId, raw.areaPosition, raw.detailId)
      : {}
    
    // 疑问项的内容通常直接包含在 content 中
    const content = raw.content
    const pass = content?.pass ?? step?.pass ?? 3  // 疑问项默认 pass=3
    
    const item: TargetItem = {
      key: generateTargetKey({
        type: raw.type,
        position: raw.position,
        areaPosition: raw.areaPosition,
        areaId: raw.areaId,
        detailId: raw.detailId,
        stepId: raw.id
      }),
      type: raw.type,
      position: raw.position,
      areaPosition: raw.areaPosition,
      areaId: raw.areaId,
      detailId: raw.detailId,
      stepId: raw.id,
      stepName: content?.name ?? step?.name ?? `步骤 ${raw.id}`,
      stepDesc: content?.desc ?? step?.desc,
      referenceUrl: url,
      pass,
      error: content?.error ?? existingData.error,
      question: content?.question ?? existingData.question,
      warn: content?.warn ?? existingData.warn
    }
    
    targets.push(item)
  }
  
  return targets
}

/**
 * 解析临时工单的反馈/疑问数据为目标 ID 列表
 * 临时工单的 feedback/question JSON 结构更简单，只包含 id 列表
 * 
 * 支持多种数据格式:
 * - 直接的数组 [{id: 1}, {id: 2}]（后端直接返回文件内容）
 * - 包装对象 { question_json: [...] } 或 { feedback_json: [...] }
 * - number[] 直接的数字数组 [1, 2, 3]
 * - {id: number}[] 对象数组 [{id: 1}, {id: 2}]
 * - 混合数组 [1, {id: 2}, 3]
 * 
 * @param data 反馈或疑问数据（可能是数组或包装对象）
 * @param mode 模式: 'feedback' | 'question'
 * @returns 目标步骤 ID 列表
 */
export function parseTempTargetIds(
  data: FeedbackData | QuestionData | unknown[] | undefined | null,
  mode: 'feedback' | 'question'
): number[] {
  if (!data) return []
  
  let jsonArray: unknown[]
  
  // 情况1: data 本身就是数组（后端直接返回文件内容）
  if (Array.isArray(data)) {
    jsonArray = data
  } else {
    // 情况2: data 是包装对象，需要从 feedback_json 或 question_json 字段获取
    const wrapped = mode === 'feedback'
      ? (data as FeedbackData).feedback_json
      : (data as QuestionData).question_json
    
    if (!wrapped || !Array.isArray(wrapped)) return []
    jsonArray = wrapped
  }
  
  const result: number[] = []
  const seen = new Set<number>()
  
  for (const item of jsonArray) {
    let idValue: unknown
    if (typeof item === 'number') {
      idValue = item
    } else if (typeof item === 'object' && item !== null && 'id' in item) {
      idValue = (item as { id: unknown }).id
    } else {
      continue
    }

    // 字符串必须完整表示步骤编号，避免把 12abc 或 1.5 错当作另一个步骤。
    if (typeof idValue === 'string') {
      const normalized = idValue.trim()
      if (!/^\d+$/.test(normalized)) continue
      idValue = Number(normalized)
    }
    if (typeof idValue === 'number' && Number.isSafeInteger(idValue) && idValue >= 0 && !seen.has(idValue)) {
      seen.add(idValue)
      result.push(idValue)
    }
  }
  
  return result
}

// ==================== 校验函数 ====================

/**
 * 检查疑问项是否已处理
 * 参考旧程序 QuestionThreeDTest.vue 的 handleNext 校验逻辑
 * 
 * 规则:
 * - pass === 3（疑问）不能提交
 * - pass === 4（缺陷+疑问）不能提交
 * 
 * @param targets 目标清单
 * @returns 未处理的疑问项列表
 */
export function findUnresolvedQuestions(targets: TargetItem[]): TargetItem[] {
  return targets.filter(item => item.pass === 3 || item.pass === 4)
}

/**
 * 检查所有目标项是否已完成检测
 * 
 * @param targets 目标清单
 * @returns 未完成的项列表
 */
export function findIncompleteTargets(targets: TargetItem[]): TargetItem[] {
  return targets.filter(item => {
    // pass === 0 表示未检测
    if (item.pass === 0) return true
    
    // pass === 2（缺陷）需要有错误信息
    if (item.pass === 2) {
      if (!item.error?.url?.length || !item.error?.desc) return true
    }
    
    // pass === 3（疑问）需要有疑问信息
    if (item.pass === 3) {
      if (!item.question?.url?.length || !item.question?.desc) return true
    }
    
    // pass === 4（缺陷+疑问）需要同时有错误和疑问信息
    if (item.pass === 4) {
      if (!item.error?.url?.length || !item.error?.desc) return true
      if (!item.question?.url?.length || !item.question?.desc) return true
    }
    
    // 如果有警示数据，必须完整
    if (item.warn) {
      if (!item.warn.url?.length || !item.warn.desc) return true
    }
    
    return false
  })
}

/**
 * 验证疑问工单是否可以提交
 * 
 * @param targets 目标清单
 * @returns { canSubmit: boolean; reason?: string }
 */
export function validateQuestionSubmit(targets: TargetItem[]): { canSubmit: boolean; reason?: string } {
  // 检查未完成项
  const incomplete = findIncompleteTargets(targets)
  if (incomplete.length > 0) {
    return { 
      canSubmit: false, 
      reason: `请完成所有检测步骤（剩余 ${incomplete.length} 项未完成）` 
    }
  }
  
  // 检查未处理的疑问
  const unresolved = findUnresolvedQuestions(targets)
  if (unresolved.length > 0) {
    return { 
      canSubmit: false, 
      reason: `疑问未处理（剩余 ${unresolved.length} 项疑问需处理）` 
    }
  }
  
  return { canSubmit: true }
}

/**
 * 验证反馈工单是否可以提交
 * 
 * @param targets 目标清单
 * @returns { canSubmit: boolean; reason?: string }
 */
export function validateFeedbackSubmit(targets: TargetItem[]): { canSubmit: boolean; reason?: string } {
  // 检查未完成项
  const incomplete = findIncompleteTargets(targets)
  if (incomplete.length > 0) {
    return { 
      canSubmit: false, 
      reason: `请完成所有重检步骤（剩余 ${incomplete.length} 项未完成）` 
    }
  }
  
  return { canSubmit: true }
}
