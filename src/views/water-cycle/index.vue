<script setup lang="ts">
import { Icon } from '@iconify/vue'

import { useCamera } from '@/composables/useCamera'
import { useOcr } from '@/composables/useOcr'

import { currentView, resetTestState } from './composables/useTestStore'

import DashboardView from './components/DashboardView.vue'
import TestingView from './components/TestingView.vue'
import DataCollectionView from './components/DataCollectionView.vue'

const camera = useCamera()
const ocr = useOcr()

async function handleBack() {
  try {
    await camera.stopCamera()
  } catch {}

  currentView.value = 'dashboard'
}

function handleConfirmSync() {
  currentView.value = 'data_collection'
}

async function handleFinish() {
  try {
    await camera.stopCamera()
  } catch {}

  resetTestState()
  currentView.value = 'dashboard'
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
      @confirm-sync="handleConfirmSync" 
      @back="handleBack" 
    />
    
    <DataCollectionView 
      v-else-if="currentView === 'data_collection'" 
      :camera="camera" 
      :ocr="ocr" 
      @finish="handleFinish" 
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