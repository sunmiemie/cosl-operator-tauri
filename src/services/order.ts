/**
 * 工单服务 - 工单相关 API
 */
import { http, type ApiResponse } from './http'

// 工单接口定义
export interface TestUnit {
  testunit_id?: number
  dev_testunit_id?: number
  testunit_starttime?: string
  dev_testunit_starttime?: string
  boardmodel?: string
  serial?: string
  process_type?: string
  process_id?: number
  testunit_status?: number
  dev_testunit_status?: number
  testunit_type?: number
  version?: string
  board_id?: number            // 生产工单的电路板 ID
  prod_board_id?: number       // 临时工单关联的生产电路板 ID
  temp_board_id?: number       // 临时工单关联的临时电路板 ID
  feedback_reason?: string     // 打回理由（反馈工单时有值）
}

// 工单状态枚举 (与后端保持一致，使用字符串)
export const OrderStatus = {
  New: '1',           // 新工单
  Testing: '2',       // 测试中/待继续
  Feedback: '4',      // 待重做
  Question: '8',      // 疑问工单
} as const

export type OrderStatusType = typeof OrderStatus[keyof typeof OrderStatus]

// 工单类型枚举
export enum OrderType {
  Production = 0,    // 生产工单
  Temporary = 1,     // 临时工单
}

// 工单列表响应
interface OrderListResponse {
  code: number
  msg: string
  data: TestUnit[]
}

/**
 * 工单服务
 */
export const orderApi = {
  /**
   * 获取待测工单列表
   * 对应后端 /test/getoperatororder/ 接口
   */
  async getOrderData(headers?: Record<string, string>): Promise<ApiResponse<TestUnit[]>> {
    const response = await http.get<OrderListResponse>('/test/getoperatororder/', headers)
    if (response.success && response.data) {
      return {
        success: true,
        data: response.data.data || [],
      }
    }
    return { success: false, error: response.error, data: [] }
  },

  /**
   * 根据序列号查询工单
   * 对应后端 /test/getavailableorder/ 接口
   */
  async getOrderBySerial(
    serial: string, 
    headers?: Record<string, string>
  ): Promise<ApiResponse<TestUnit[]>> {
    const response = await http.get<OrderListResponse>(
      `/test/getavailableorder/`,
      headers,
      { serial }
    )
    if (response.success && response.data) {
      return {
        success: true,
        data: response.data.data || [],
      }
    }
    return { success: false, error: response.error, data: [] }
  },

  /**
   * 更新工单状态（开始测试）
   * 对应后端 /test/testunit/start/ 接口
   * @param unitId 工单ID
   * @param unitType 工单类型 (0=生产, 1=临时)
   */
  async changeStatus(
    unitId: number,
    unitType: number,
    _status?: number,
    headers?: Record<string, string>
  ): Promise<ApiResponse<unknown>> {
    // mode: 0=生产工单, 1=临时工单
    return http.post('/test/testunit/start/', { id: unitId, mode: unitType }, headers)
  },

  /**
   * 获取今日已完成工单
   */
  async getTodayCompleted(
    userId: number,
    headers?: Record<string, string>
  ): Promise<ApiResponse<TestUnit[]>> {
    const response = await http.get<OrderListResponse>(
      `/test/testunit/today/completed/`,
      headers,
      { user_id: String(userId) }
    )
    if (response.success && response.data) {
      return {
        success: true,
        data: response.data.data || [],
      }
    }
    return { success: false, error: response.error, data: [] }
  },

  /**
   * 获取待继续工单
   */
  async getContinueList(
    userId: number,
    headers?: Record<string, string>
  ): Promise<ApiResponse<TestUnit[]>> {
    const response = await http.get<OrderListResponse>(
      `/test/testunit/continue/`,
      headers,
      { user_id: String(userId) }
    )
    if (response.success && response.data) {
      return {
        success: true,
        data: response.data.data || [],
      }
    }
    return { success: false, error: response.error, data: [] }
  },
}
