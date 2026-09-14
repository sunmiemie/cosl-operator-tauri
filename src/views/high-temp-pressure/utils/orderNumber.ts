import type { WorkOrder } from '../types'

/** 页面展示使用测试单号，旧工单继续显示原编号；不得用于关联、上传或文件生成。 */
export function displayOrderNumber(order?: Pick<WorkOrder, 'no' | 'testNumber'> | null): string {
  return order?.testNumber?.trim() || order?.no || '-'
}
