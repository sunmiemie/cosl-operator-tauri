/**
 * 报告 JSON 模板工具
 * 
 * 参考旧版前端程序 (cosl-operater/gui/src/components/TestComponents/*.vue) 的报告结构
 * 确保所有测试类型生成的报告 JSON 结构与后端预期一致
 */

// ==================== 类型定义 ====================

/** 总体检测数据结构 */
export interface TotalSection {
  stepList: StepListItem[]
  stepNote: string[]
  picList: PicListItem[]
  picNote: string[]
  errorList?: ErrorItem[]
  questionList?: QuestionItem[]
  warnList?: WarnItem[]
}

/** 区域检测数据结构 */
export interface AreaSection {
  id: number
  general: GeneralSection
  detail: DetailSection[]
}

/** 通用检测数据结构 */
export interface GeneralSection {
  stepList: StepListItem[]
  stepNote: string[]
  picList: PicListItem[]
  picNote: string[]
  errorList?: ErrorItem[]
  questionList?: QuestionItem[]
  warnList?: WarnItem[]
}

/** 点位检测数据结构 */
export interface DetailSection {
  id: number
  name: string
  stepList: StepListItem[]
  stepNote: string[]
  picList: PicListItem[]
  picNote: string[]
  errorList?: ErrorItem[]
  questionList?: QuestionItem[]
  warnList?: WarnItem[]
}

/** 步骤列表项 */
export interface StepListItem {
  id: number
  name: string
  pass: number
}

/** 图片列表项 */
export interface PicListItem {
  id: number
  name: string
  save: string[]
}

/** 异常项 */
export interface ErrorItem {
  id: number
  name: string
  pass: number
  error: {
    url: string | string[]
    desc: string
  }
}

/** 疑问项 */
export interface QuestionItem {
  id: number
  name: string
  pass: number
  question: {
    url: string | string[]
    desc: string
  }
}

/** 警告项 */
export interface WarnItem {
  id: number
  name: string
  pass: number
  warn: {
    url: string | string[]
    desc: string
  }
}

/** 弓曲度检测结构 */
export interface PlaneSection {
  size: string
  leftUrl: string
  rightUrl: string
  leftPass?: number
  rightPass?: number
  errorList?: Array<{ name: string; error: { desc: string; url: string } }>
  noteList?: string[]
}

/** 3D检测结构 */
export interface ThreeDSection {
  eyes: {
    total: TotalSection
    area: AreaSection[]
  }
  eyesBak?: {
    total: TotalSection
    area: AreaSection[]
  }
}

/** X-Ray检测结构 */
export interface XraySection {
  total: TotalSection
  area: AreaSection[]
}

/** 临时工单检测项 */
export interface TempTestItem {
  id: number
  pass: number
  name: string
  desc: string
  save: string[]
  error?: {
    url: string[]
    desc: string
  }
  question?: {
    url: string[]
    desc: string
  }
}

/** 完整报告 JSON 结构 (旧版模板) */
export interface ReportJsonTemplate {
  plane: PlaneSection
  twoD: string
  twoDBak: string
  threeD: ThreeDSection
  xray: XraySection
  tempTest?: TempTestItem[]
}

// ==================== 模板工厂函数 ====================

/**
 * 创建空的总体检测数据
 */
export function createEmptyTotalSection(): TotalSection {
  return {
    stepList: [],
    stepNote: [],
    picList: [],
    picNote: []
  }
}

/**
 * 创建空的通用检测数据
 */
export function createEmptyGeneralSection(): GeneralSection {
  return {
    stepList: [],
    stepNote: [],
    picList: [],
    picNote: []
  }
}

/**
 * 创建完整的报告 JSON 基础模板
 * 与旧版前端程序的 reportJson 初始结构一致
 */
export function createBaseReportJson(): ReportJsonTemplate {
  return {
    plane: {
      size: '',
      leftUrl: '',
      rightUrl: ''
    },
    twoD: '',
    twoDBak: '',
    threeD: {
      eyes: {
        total: createEmptyTotalSection(),
        area: []
      },
      eyesBak: {
        total: createEmptyTotalSection(),
        area: []
      }
    },
    xray: {
      total: createEmptyTotalSection(),
      area: []
    }
  }
}

/**
 * 创建临时工单专用的报告 JSON 模板
 */
export function createTempReportJson(): Partial<ReportJsonTemplate> {
  return {
    plane: {
      size: '',
      leftUrl: '',
      rightUrl: '',
      leftPass: 0,
      rightPass: 0
    },
    twoD: '',
    twoDBak: '',
    tempTest: [
      {
        id: 1,
        pass: 1,
        name: '合格项',
        desc: '',
        save: []
      },
      {
        id: 2,
        pass: 2,
        name: '缺陷项',
        desc: '',
        save: [],
        error: {
          url: [],
          desc: ''
        }
      },
      {
        id: 3,
        pass: 3,
        name: '疑问项',
        desc: '',
        save: [],
        question: {
          url: [],
          desc: ''
        }
      }
    ]
  }
}

// ==================== 报告生成辅助函数 ====================

/**
 * 根据测试类型删除无关字段
 * 
 * @param json - 报告JSON对象
 * @param testType - 测试类型: 'plane' | 'twoD' | 'threeD' | 'xray'
 * @param hasBackSide - (仅3D) 是否有背面检测
 */
export function trimReportJson(
  json: any,
  testType: 'plane' | 'twoD' | 'threeD' | 'xray',
  hasBackSide?: boolean
): void {
  switch (testType) {
    case 'plane':
      // PlaneTest: 删除 xray, threeD.eyes, threeD.eyesBak
      delete json.xray
      if (json.threeD) {
        delete json.threeD.eyes
        delete json.threeD.eyesBak
      }
      break
      
    case 'twoD':
      // TwoDTest: 删除 xray, threeD.eyes, threeD.eyesBak
      delete json.xray
      if (json.threeD) {
        delete json.threeD.eyes
        delete json.threeD.eyesBak
      }
      break
      
    case 'threeD':
      // ThreeDTest: 删除 xray; 如无背面则删除 threeD.eyesBak
      delete json.xray
      if (!hasBackSide && json.threeD) {
        delete json.threeD.eyesBak
      }
      break
      
    case 'xray':
      // XrayTest: 删除 threeD, twoD, plane
      delete json.threeD
      delete json.twoD
      delete json.twoDBak
      delete json.plane
      break
  }
}

/**
 * 从步骤数据中收集 error/question/warn 列表
 * 
 * @param steps - 步骤数组
 * @returns 包含 errorList, questionList, warnList 的对象
 */
export function collectStepLists(steps: any[]): {
  errorList: any[]
  questionList: any[]
  warnList: any[]
} {
  const errorList: any[] = []
  const questionList: any[] = []
  const warnList: any[] = []
  
  steps.forEach(step => {
    if (step.error) {
      errorList.push(step)
    }
    if (step.question) {
      questionList.push(step)
    }
    if (step.warn) {
      warnList.push(step)
    }
  })
  
  return { errorList, questionList, warnList }
}

/**
 * 将步骤数组转换为 stepList 格式
 */
export function stepsToStepList(steps: any[]): StepListItem[] {
  return steps.map(s => ({
    id: s.id,
    name: s.name,
    pass: s.pass
  }))
}

/**
 * 将图片数组转换为 picList 格式
 */
export function picsToPicList(pics: any[]): PicListItem[] {
  return pics.map(p => ({
    id: p.id,
    name: p.name,
    save: p.save || []
  }))
}

/**
 * 构建带有 error/question/warn 汇总的 section 数据
 * 
 * @param data - 原始数据 (包含 step, pic, stepNote, picNote)
 * @returns 格式化后的 section 对象
 */
export function buildSectionData(data: any): any {
  const lists = collectStepLists(data.step || [])
  
  const section: any = {
    stepList: stepsToStepList(data.step || []),
    stepNote: data.stepNote || [],
    picList: picsToPicList(data.pic || []),
    picNote: data.picNote || []
  }
  
  // 只添加非空的列表
  if (lists.errorList.length > 0) {
    section.errorList = lists.errorList
  }
  if (lists.questionList.length > 0) {
    section.questionList = lists.questionList
  }
  if (lists.warnList.length > 0) {
    section.warnList = lists.warnList
  }
  
  return section
}

// ==================== 状态常量 ====================

/** 报告上传状态 - 待审核 (所有报告统一使用此状态) */
export const REPORT_STATUS_PENDING_REVIEW = 3
