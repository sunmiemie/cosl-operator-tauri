<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { downloadProcessData, getOrderDetail } from '@/services/halt-hass-order'
import type { HaltHassOrder } from '@/views/halt-hass-test/types'
import type { HaltHassProcessJson } from '@/views/process-halt-hass/types'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const order = ref<HaltHassOrder | null>(null)
const processJson = ref<HaltHassProcessJson | null>(null)
const loadError = ref('')

const orderId = computed(() => Number(route.query.orderId || 0))
const processId = computed(() => Number(route.query.processId || 0))
const processSummary = computed(() => {
  const metadata = processJson.value?.metadata
  if (!metadata) return '-'
  return `${metadata.name || order.value?.process?.name || '-'} · ${metadata.version || order.value?.process?.version || '-'}`
})

async function loadBoundOrderAndProcess() {
  if (!Number.isInteger(orderId.value) || orderId.value <= 0) {
    loadError.value = '缺少有效的工单 ID'
    return
  }
  if (!Number.isInteger(processId.value) || processId.value <= 0) {
    loadError.value = '缺少客户端本次选择的工艺版本'
    return
  }

  loading.value = true
  loadError.value = ''
  try {
    const orderResult = await getOrderDetail(orderId.value)
    if (!orderResult.success || !orderResult.data) {
      throw new Error(orderResult.error || '读取工单失败')
    }
    if (orderResult.data.clientTestType !== 2) {
      throw new Error('该工单不是 SDS 测试类型，已阻止进入错误的执行页面')
    }
    order.value = orderResult.data
    const processResult = await downloadProcessData(processId.value)
    if (!processResult.success || !processResult.data) {
      throw new Error(processResult.error || '下载绑定工艺失败')
    }
    processJson.value = processResult.data
    order.value.process = {
      id: processId.value,
      name: processResult.data.metadata.name || '',
      version: processResult.data.metadata.version || '',
    }
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '加载 SDS 工单失败'
    ElMessage.error(loadError.value)
  } finally {
    loading.value = false
  }
}

onMounted(loadBoundOrderAndProcess)
</script>

<template>
  <div class="sds-page" v-loading="loading">
    <header class="page-header">
      <div>
        <p class="eyebrow">HALT-HASS / SDS</p>
        <h1>SDS 测试</h1>
        <p>客户端按工单产品与测试类型进入 SDS 页面，并加载本次选择的工艺版本。</p>
      </div>
      <el-button @click="router.push('/halt-hass-test')">返回工单排程</el-button>
    </header>

    <el-alert v-if="loadError" :title="loadError" type="error" show-icon :closable="false" />

    <el-card v-if="order && processJson" shadow="never" class="summary-card">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="工单号">{{ order.orderNo }}</el-descriptions-item>
        <el-descriptions-item label="产品型号">{{ order.productModel?.name || '-' }}</el-descriptions-item>
        <el-descriptions-item label="客户端测试类型">{{ order.clientTestTypeName }}</el-descriptions-item>
        <el-descriptions-item label="本次工艺">{{ processSummary }}</el-descriptions-item>
        <el-descriptions-item label="电路板组">{{ order.boardGroup.name }}</el-descriptions-item>
        <el-descriptions-item label="目标板数量">{{ order.boardCount }} 块</el-descriptions-item>
      </el-descriptions>

      <el-alert
        class="executor-alert"
        title="SDS 原执行模块尚未纳入当前客户端仓库"
        description="已完成类型路由和客户端选版加载；在 SDS 通信与执行模块接入前，客户端不会使用高速率流程替代执行。"
        type="warning"
        show-icon
        :closable="false"
      />
      <el-button type="primary" disabled>启动 SDS 测试</el-button>
    </el-card>
  </div>
</template>

<style scoped>
.sds-page {
  min-height: 100%;
  padding: 24px;
  background: #f5f7fa;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 20px;
}

.page-header h1 {
  margin: 4px 0 8px;
  font-size: 28px;
}

.page-header p {
  margin: 0;
  color: #667085;
}

.eyebrow {
  color: #409eff !important;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.summary-card {
  max-width: 980px;
}

.executor-alert {
  margin: 20px 0;
}
</style>
