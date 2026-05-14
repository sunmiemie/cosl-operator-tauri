<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { ref } from 'vue'

import { useAuth } from '@/composables/useAuth'
import { useCamera } from '@/composables/useCamera'
import { useOcr } from '@/composables/useOcr'
import { updateWaterCycleOrder } from '@/services/water-cycle-api'

import { currentView, markReportSaved, resetTestState } from './composables/useTestStore'
import { selectedOrder } from './composables/useTestStore'

import DashboardView from './components/DashboardView.vue'
import TestingView from './components/TestingView.vue'
import DataCollectionView from './components/DataCollectionView.vue'
import ReportPreviewView from './components/ReportPreviewView.vue'
import ShutdownCheckModal from './components/ShutdownCheckModal.vue'

const camera = useCamera()
const ocr = useOcr()
const { initAuth, getAuthHeaders } = useAuth()
const orderStatusMutating = ref(false)
const showShutdownCheck = ref(false)

async function handleBack() {
  if (orderStatusMutating.value) return
  try {
    await camera.stopCamera()
  } catch {}

  const order = selectedOrder.value
  const orderId = typeof order?.dbId === 'number' ? order.dbId : undefined
  if (orderId !== undefined) {
    orderStatusMutating.value = true
    try {
      await initAuth()
      const resp = await updateWaterCycleOrder(orderId, { status: 1 }, getAuthHeaders())
      if (!resp.success || !resp.data || resp.data.code !== 0) {
        const ok = confirm('工单状态更新失败，是否仍取消返回？')
        if (!ok) return
      }
    } finally {
      orderStatusMutating.value = false
    }
  }

  resetTestState()
}

function handleConfirmSync() {
  currentView.value = 'data_collection'
}

async function handleFinish() {
  try {
    await camera.stopCamera()
  } catch {}
  currentView.value = 'report_preview'
}

function handleBackToCollection() {
  currentView.value = 'data_collection'
}

function handleSaveReport() {
  markReportSaved()
  showShutdownCheck.value = true
}

async function handleShutdownComplete() {
  showShutdownCheck.value = false

  const order = selectedOrder.value
  const orderId = typeof order?.dbId === 'number' ? order.dbId : undefined
  if (orderId !== undefined) {
    await initAuth()
    const resp = await updateWaterCycleOrder(orderId, { status: 3 }, getAuthHeaders())
    if (!resp.success || !resp.data || resp.data.code !== 0) {
      const ok = confirm('工单状态更新失败，是否仍完成测试流程？')
      if (!ok) return
    }
  }

  alert('测试已完成，报告已保存。')
  resetTestState()
}
</script>

<template>
  <div class="water-cycle-page">
    <div class="page-header">
      <div class="header-left">
        <div class="header-icon"><Icon icon="mdi:water-sync" /></div>
        <div><h1 class="header-title">水循环</h1><p class="header-subtitle">水循环测试系统</p></div>
      </div>
    </div>

    <DashboardView v-if="currentView === 'dashboard'" />
    
    <TestingView 
      v-else-if="currentView === 'testing'" 
      :camera="camera" 
      :ocr="ocr" 
      :status-mutating="orderStatusMutating"
      @confirm-sync="handleConfirmSync" 
      @back="handleBack" 
    />
    
    <DataCollectionView 
      v-else-if="currentView === 'data_collection'" 
      :camera="camera" 
      :ocr="ocr" 
      @finish="handleFinish" 
    />

    <ReportPreviewView
      v-else-if="currentView === 'report_preview'"
      @back="handleBackToCollection"
      @save="handleSaveReport"
    />

    <ShutdownCheckModal
      v-if="showShutdownCheck"
      @cancel="showShutdownCheck = false"
      @complete="handleShutdownComplete"
    />
  </div>
</template>

<style scoped>
.water-cycle-page { height:100%; background:var(--color-bg-primary); color:var(--color-text-primary); overflow:hidden; display:flex; flex-direction:column; gap:16px; }
.page-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:1rem; flex-shrink:0; }
.header-left { display:flex; align-items:center; gap:.75rem; }
.header-icon { width:2.5rem; height:2.5rem; display:flex; align-items:center; justify-content:center; border-radius:.625rem; font-size:1.25rem; background:linear-gradient(135deg, rgba(168,85,247,.2), rgba(147,51,234,.15)); color:rgba(168,85,247,1); }
.header-title { font-size:1.125rem; font-weight:600; margin:0; }
.header-subtitle { font-size:.8125rem; color:var(--color-text-secondary); margin-top:.125rem; margin-bottom:0; }
</style>
