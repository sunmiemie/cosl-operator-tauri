import { computed, ref } from 'vue'
import type { StartupCheckItem } from '../types'

const manualCheckTexts = [
  '查阅前次设备运转记录确认设备处于正常状态',
  '确认设备外观无异常，包括各处固定联接螺栓、软管及接头无松动',
  '排空液压缸内存水',
  '确认高压泵水箱浮漂及冷却水泵水位正常',
  '确认并检查各压力表无异常',
  '仪器尺寸及重量检查：直径＜φ240mm，长度＜9m，重量＜4吨',
  '确认试验仪器更换专用试压护帽',
  '确认试压介质的液面高度正常',
  '检查上试压头密封面及O圈确认状态良好，并确保密封复置',
  '各控制台上电检查，确保工作正常',
]

export function useHighTempPressureStartupCheck() {
  const showStartupCheck = ref(false)
  const checkItems = ref<StartupCheckItem[]>(
    manualCheckTexts.map((text, idx) => ({ id: idx + 1, text, checked: false }))
  )

  const allChecked = computed(() => checkItems.value.every(i => i.checked))

  function toggleCheck(id: number) {
    const item = checkItems.value.find(i => i.id === id)
    if (item) item.checked = !item.checked
  }

  function resetChecks() {
    checkItems.value.forEach(i => { i.checked = false })
  }

  function openStartupCheck() {
    resetChecks()
    showStartupCheck.value = true
  }

  return {
    showStartupCheck,
    checkItems,
    allChecked,
    toggleCheck,
    resetChecks,
    openStartupCheck,
  }
}
