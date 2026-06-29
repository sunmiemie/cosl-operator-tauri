import { ref } from "vue"
import { INITIAL_MOCK_WORK_ORDERS } from "../constants/mock-work-orders"
import type { CalibrationWorkOrder } from "../types"

const orders = ref<CalibrationWorkOrder[]>([...INITIAL_MOCK_WORK_ORDERS])

export function useWorkOrdersStore() {
  return { orders }
}
