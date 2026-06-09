import { computed, ref } from 'vue'
import type { DevCheckItem, ShutdownCheckItem, StartupCheckItem } from '../types'

const preChecks = [
  '查阅前次设备运转记录确认设备处于正常状态',
  '确认设备外观无异常，包括各处固定联接螺栓、软管及接头无松动',
  '确认冷却水箱的水位',
  '确认冷却系统阀门开启位置',
  '确认试验件安装牢固，并及时清理工具及杂物，确保安全无飞溅',
  '确认振动传感器安装牢固',
  '试验台气压检查：5吨振动台气压0.6~0.9MPa；40吨振动台气压0.4~0.6MPa',
  '检查减震器基础充气状态，确认上下气囊的位置标识相匹配',
  '确认工作区域无人',
  '启动外循环冷却系统，确认工作正常',
]

const shutdownPostChecks = [
  '确认各处电源，关闭电源总开关',
  '设备外观检查并整理试验现场',
]

export function useVibrationChecks() {
  const showStartupCheck = ref(false)
  const checkItems = ref<StartupCheckItem[]>(preChecks.map((text, idx) => ({ id: idx + 1, text, checked: false })))
  const allChecked = computed(() => checkItems.value.every(item => item.checked))

  const devCheckItems = ref<DevCheckItem[]>(
    preChecks.map((text, idx) => ({ id: idx + 1, text, answer: 'yes', remark: '' }))
  )

  const shutdownChecks = ref<ShutdownCheckItem[]>(
    shutdownPostChecks.map((text, idx) => ({ id: idx + 1, text, checked: false }))
  )

  const showSafetyWarning = ref(false)

  const devCheckDoneCount = computed(() => devCheckItems.value.filter(i => i.answer !== null).length)
  const devCheckAllAnswered = computed(() => devCheckDoneCount.value === devCheckItems.value.length)
  const devCheckHasNo = computed(() => devCheckItems.value.some(i => i.answer === 'no'))
  const devCheckInvalidNoRemark = computed(() => devCheckItems.value.some(i => i.answer === 'no' && i.remark.trim() === ''))

  const devCheckProgressPct = computed(() => {
    if (!devCheckItems.value.length) return 0
    return Math.round((devCheckDoneCount.value / devCheckItems.value.length) * 100)
  })

  function toggleCheck(id: number) {
    const item = checkItems.value.find(i => i.id === id)
    if (item) item.checked = !item.checked
  }

  function resetStartupChecks() {
    checkItems.value.forEach(item => (item.checked = false))
  }

  function setDevCheckAnswer(id: number, answer: 'yes' | 'no') {
    const item = devCheckItems.value.find(i => i.id === id)
    if (!item) return
    item.answer = item.answer === answer ? null : answer
    if (item.answer !== 'no') item.remark = ''
  }

  function resetDevCheck() {
    devCheckItems.value.forEach(i => {
      i.answer = null
      i.remark = ''
    })
  }

  function resetShutdownChecks() {
    shutdownChecks.value.forEach(i => (i.checked = false))
  }

  function passDevCheck() {
    if (!devCheckAllAnswered.value) return { ok: false as const, reason: 'unanswered' as const }
    if (devCheckInvalidNoRemark.value) return { ok: false as const, reason: 'invalid-no-remark' as const }
    if (devCheckHasNo.value) return { ok: false as const, reason: 'has-no' as const }
    return { ok: true as const }
  }

  return {
    showStartupCheck,
    checkItems,
    allChecked,
    devCheckItems,
    shutdownChecks,
    showSafetyWarning,
    devCheckDoneCount,
    devCheckAllAnswered,
    devCheckHasNo,
    devCheckInvalidNoRemark,
    devCheckProgressPct,
    toggleCheck,
    resetStartupChecks,
    setDevCheckAnswer,
    resetDevCheck,
    resetShutdownChecks,
    passDevCheck,
  }
}
