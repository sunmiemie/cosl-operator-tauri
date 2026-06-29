import { computed, onMounted, onUnmounted, ref } from "vue"
import { useRouter } from "vue-router"
import { ElMessage } from "element-plus"
import { useScaleWellSession } from "../../shared/composables/useScaleWellSession"
import { useWorkOrdersStore } from "../../shared/composables/useWorkOrdersStore"
import { getToolDisplayName } from "../../shared/constants/tool-params"
import type { CalibrationWorkOrder, ScheduleEntry } from "../../shared/types"

const TIME_SLOTS = ["08:00", "10:00", "13:00", "15:00", "17:00"]

function formatDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function startOfWeek(d: Date) {
  const copy = new Date(d)
  const day = copy.getDay() || 7
  copy.setDate(copy.getDate() - day + 1)
  copy.setHours(0, 0, 0, 0)
  return copy
}

export function useTestDashboard() {
  const router = useRouter()
  const { orders } = useWorkOrdersStore()
  const { role, loginTime, setActiveWorkOrder } = useScaleWellSession()

  const weekBase = ref(startOfWeek(new Date()))
  const selectedOrderIds = ref<string[]>([])
  const selectedSchedule = ref<ScheduleEntry | null>(null)
  const schedules = ref<ScheduleEntry[]>([])
  const onlineMinutes = ref(0)
  let onlineTimer: ReturnType<typeof setInterval> | null = null

  const weekDays = computed(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekBase.value)
      d.setDate(d.getDate() + i)
      return formatDate(d)
    })
  })

  const weekLabel = computed(() => {
    const start = weekDays.value[0]
    const end = weekDays.value[6]
    return `${start} ~ ${end}`
  })

  const pendingOrders = computed(() => orders.value.filter((o) => o.status === "pending"))
  const inProgressOrders = computed(() => orders.value.filter((o) => o.status === "in_progress"))
  const todayCompleted = computed(() => {
    const today = formatDate(new Date())
    return orders.value.filter((o) => o.status === "completed" && o.planDate === today).length
  })

  const onlineLabel = computed(() => {
    const h = Math.floor(onlineMinutes.value / 60)
    const m = onlineMinutes.value % 60
    return `${h}时${m}分`
  })

  const subtitle = computed(() =>
    role.value === "leader" ? "工单排程与刻度任务管理" : "可用工单 · 一键领取开始测试"
  )

  const toggleOrderSelection = (id: string) => {
    const idx = selectedOrderIds.value.indexOf(id)
    if (idx >= 0) selectedOrderIds.value.splice(idx, 1)
    else selectedOrderIds.value.push(id)
  }

  const selectScheduleCell = (date: string, timeSlot: string) => {
    selectedSchedule.value = { orderId: selectedOrderIds.value[0] ?? "", date, timeSlot }
  }

  const isCellSelected = (date: string, timeSlot: string) =>
    selectedSchedule.value?.date === date && selectedSchedule.value?.timeSlot === timeSlot

  const prevWeek = () => {
    weekBase.value = new Date(weekBase.value.getTime() - 7 * 86400000)
  }

  const nextWeek = () => {
    weekBase.value = new Date(weekBase.value.getTime() + 7 * 86400000)
  }

  const loadThisWeek = () => {
    weekBase.value = startOfWeek(new Date())
    ElMessage.success("已读取本周排程")
  }

  const goToDate = (value: string) => {
    if (!value) return
    weekBase.value = startOfWeek(new Date(value))
  }

  const enterCalibration = (order: CalibrationWorkOrder) => {
    setActiveWorkOrder(order)
    const idx = orders.value.findIndex((o) => o.id === order.id)
    if (idx >= 0 && order.status === "pending") {
      orders.value[idx] = { ...order, status: "in_progress" }
    }
    router.push("/scale-well-cluster/calibration")
  }

  const startScheduledTask = () => {
    if (!selectedOrderIds.value.length) {
      ElMessage.warning("请先勾选工单")
      return
    }
    if (!selectedSchedule.value) {
      ElMessage.warning("请在右侧排程日历中选择时间段")
      return
    }
    const order = orders.value.find((o) => o.id === selectedOrderIds.value[0])
    if (!order) return
    schedules.value.push({
      orderId: order.id,
      date: selectedSchedule.value.date,
      timeSlot: selectedSchedule.value.timeSlot
    })
    enterCalibration(order)
  }

  const claimAndStart = (orderId: string) => {
    const order = orders.value.find((o) => o.id === orderId)
    if (!order) return
    enterCalibration(order)
  }

  onMounted(() => {
    const tick = () => {
      onlineMinutes.value = Math.floor((Date.now() - loginTime.value) / 60000)
    }
    tick()
    onlineTimer = setInterval(tick, 30000)
  })

  onUnmounted(() => {
    if (onlineTimer) clearInterval(onlineTimer)
  })

  return {
    role,
    orders,
    pendingOrders,
    inProgressOrders,
    todayCompleted,
    onlineLabel,
    subtitle,
    weekDays,
    weekLabel,
    timeSlots: TIME_SLOTS,
    selectedOrderIds,
    selectedSchedule,
    toggleOrderSelection,
    selectScheduleCell,
    isCellSelected,
    prevWeek,
    nextWeek,
    loadThisWeek,
    goToDate,
    startScheduledTask,
    claimAndStart,
    getToolDisplayName
  }
}
