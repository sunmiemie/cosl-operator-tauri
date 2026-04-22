<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import EquipmentPackage from './equipment-package.vue'
import { useAuth } from '@/composables/useAuth'
import {
  createSimulatedWellDownholeWork,
  deleteSimulatedWellDownholeWork,
  listSimulatedWellDownholeWorks,
  type SimulatedWellDownholeWorkItem
} from '@/services/simulated-well-downhole-api'

const props = defineProps<{
  todayScheduledOrders: any[]
  downholeDevices: any[]
}>()

const emit = defineEmits<{
  back: []
}>()

const { initAuth, getAuthHeaders } = useAuth()
const loading = ref(false)
const list = ref<SimulatedWellDownholeWorkItem[]>([])
const keyword = ref('')
const createMode = ref(false)

const formatTestEnv = (env: Record<string, any>) => {
  const text = env?.text ?? env?.env_text
  if (text !== undefined && text !== null && `${text}`.trim() !== '') return String(text).trim()
  const depth = env?.wellDepth ?? env?.depth
  const temp = env?.wellTemperature ?? env?.temperature
  const pressure = env?.wellPressure ?? env?.pressure
  const parts: string[] = []
  if (depth !== undefined && depth !== null && `${depth}`.trim() !== '') parts.push(`井深${depth}`)
  if (temp !== undefined && temp !== null && `${temp}`.trim() !== '') parts.push(`井温${temp}`)
  if (pressure !== undefined && pressure !== null && `${pressure}`.trim() !== '') parts.push(`井压${pressure}`)
  return parts.length ? parts.join(' / ') : '-'
}

const formatInterval = (interval: Record<string, any>) => {
  const text = interval?.text ?? interval?.interval_text
  if (text !== undefined && text !== null && `${text}`.trim() !== '') return String(text).trim()
  const mainFrom = interval?.mainFrom
  const mainTo = interval?.mainTo
  const repeatFrom = interval?.repeatFrom
  const repeatTo = interval?.repeatTo
  const main = mainFrom || mainTo ? `${mainFrom || '-'}~${mainTo || '-'}` : ''
  const repeat = repeatFrom || repeatTo ? `${repeatFrom || '-'}~${repeatTo || '-'}` : ''
  if (main && repeat) return `${main} / ${repeat}`
  if (main) return main
  if (repeat) return repeat
  return '-'
}

const fetchList = async () => {
  loading.value = true
  try {
    await initAuth()
    const res = await listSimulatedWellDownholeWorks(
      { page: 1, pageSize: 2000, keyword: keyword.value.trim() || undefined },
      getAuthHeaders()
    )
    if (!res.success) {
      ElMessage.error(res.message || '获取下井作业失败')
      return
    }
    if (res.data?.code !== 0) {
      ElMessage.error(res.data?.msg || '获取下井作业失败')
      return
    }
    list.value = res.data.data?.list || []
  } finally {
    loading.value = false
  }
}

const canCreate = computed(() => (props.downholeDevices || []).length > 0)

const openCreate = () => {
  if (!canCreate.value) {
    ElMessage.warning('请先在日历中选择要开始试验的测试产品')
    return
  }
  createMode.value = true
}

const handleSave = async (payload: any) => {
  try {
    await initAuth()
    const body = {
      well_name: payload?.wellName || '',
      test_environment: payload?.testEnvironment || {},
      test_interval: payload?.testInterval || {},
      order_ids: payload?.orderIds || [],
      devices: payload?.devices || [],
      status: 0,
      report_count: Number(payload?.reportCount ?? payload?.report_count ?? 0) || 0
    }
    const res = await createSimulatedWellDownholeWork(body, getAuthHeaders())
    if (!res.success) {
      ElMessage.error(res.message || '新增下井作业失败')
      return
    }
    if (res.data?.code !== 0) {
      ElMessage.error(res.data?.msg || '新增下井作业失败')
      return
    }
    ElMessage.success('已新增下井作业')
    createMode.value = false
    await fetchList()
  } catch (e) {
    ElMessage.error('新增下井作业失败')
    throw e
  }
}

const handleDelete = async (row: SimulatedWellDownholeWorkItem) => {
  await ElMessageBox.confirm(`确认删除作业「${row.work_no}」吗？`, '确认删除', { type: 'warning' })
  await initAuth()
  const res = await deleteSimulatedWellDownholeWork(row.id, getAuthHeaders())
  if (!res.success) {
    ElMessage.error(res.message || '删除失败')
    return
  }
  if (res.data?.code !== 0) {
    ElMessage.error(res.data?.msg || '删除失败')
    return
  }
  ElMessage.success('已删除')
  await fetchList()
}

const getStatusLabel = (row: SimulatedWellDownholeWorkItem) => {
  return row.status_text || (row.status === 2 ? '已完成' : row.status === 1 ? '进行中' : '已创建')
}

const getStatusClass = (row: SimulatedWellDownholeWorkItem) => {
  if (row.status === 2) return 'status-pill done'
  if (row.status === 1) return 'status-pill running'
  return 'status-pill created'
}

const formatReportCount = (n: any) => {
  const v = typeof n === 'number' ? n : Number(n || 0)
  if (!Number.isFinite(v)) return '0份报告'
  return `${v}份报告`
}

const canDelete = (row: SimulatedWellDownholeWorkItem) => {
  const n = row.report_count ?? 0
  return Number(n || 0) <= 0
}

const handleView = (row: SimulatedWellDownholeWorkItem) => {
  ElMessage.info(`查看作业：${row.work_no}`)
}

const handleEdit = (row: SimulatedWellDownholeWorkItem) => {
  ElMessage.info(`编辑作业：${row.work_no}`)
}

onMounted(() => {
  fetchList()
})
</script>

<template>
  <EquipmentPackage
    v-if="createMode"
    :today-scheduled-orders="todayScheduledOrders"
    :downhole-devices="downholeDevices"
    @back="createMode = false"
    @save="handleSave"
  />

  <div v-else class="downhole-view">
    <div class="page-header">
      <div class="header-left">
        <div class="header-icon"><Icon icon="mdi:oil" /></div>
        <div>
          <h1 class="header-title">下井作业</h1>
          <p class="header-subtitle">下井作业记录列表</p>
        </div>
      </div>
      <div class="header-right">
        <button class="week-cal-nav" @click="emit('back')">返回</button>
      </div>
    </div>

    <div class="downhole-content">
      <div class="downhole-card">
        <div class="section-header-row">
          <div class="search-box inline" style="max-width: 420px">
            <Icon icon="mdi:magnify" class="search-icon" />
            <input
              :value="keyword"
              placeholder="搜索作业ID/井名称"
              @input="keyword = ($event.target as HTMLInputElement).value"
            />
            <button class="week-cal-nav" @click="fetchList">查询</button>
          </div>
        </div>

        <div v-if="loading" class="empty-state"><p>加载中...</p></div>
        <div v-else class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>作业ID</th>
                <th>井名称</th>
                <th>测试环境</th>
                <th>测试井段</th>
                <th>设备数量</th>
                <th>状态</th>
                <th>报告数量</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!list.length">
                <td colspan="8">
                  <div class="empty-state"><p>暂无下井作业</p></div>
                </td>
              </tr>
              <tr v-for="row in list" :key="row.id">
                <td class="cell-id">{{ row.work_no }}</td>
                <td>{{ row.well_name || '-' }}</td>
                <td>{{ formatTestEnv(row.test_environment) }}</td>
                <td>{{ formatInterval(row.test_interval) }}</td>
                <td style="text-align: center">{{ row.device_count || 0 }}</td>
                <td style="text-align: center">
                  <span :class="getStatusClass(row)">{{ getStatusLabel(row) }}</span>
                </td>
                <td style="text-align: center">{{ formatReportCount(row.report_count) }}</td>
                <td style="text-align: center">
                  <button class="op-btn view" @click="handleView(row)">查看</button>
                  <button class="op-btn edit" @click="handleEdit(row)">编辑</button>
                  <button class="op-btn delete" :disabled="!canDelete(row)" @click="handleDelete(row)">删除</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="./components/simulation-well.shared.css"></style>
