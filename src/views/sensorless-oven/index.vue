<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Icon } from '@iconify/vue'
import DeviceCheckOverlay from '@/components/visual-test/DeviceCheckOverlay.vue'
import { useConfig } from '@/composables/useConfig'
import { isSensorlessOvenPortPresent, listSensorlessOvenPorts } from '@/services/sensorless-oven-monitor-api'
import SensorlessOvenDashboard from './components/SensorlessOvenDashboard.vue'
import SensorlessOvenTestFlow from './components/SensorlessOvenTestFlow.vue'
import { useSensorlessOven } from './composables/useSensorlessOven'

const ctx = useSensorlessOven()
const { currentView } = ctx
const { initConfig, getConfigItem } = useConfig()

type DeviceCheckStatus = 'checking' | 'success' | 'error'
const devicePhase = ref<'detect' | 'ready'>('detect')
const deviceCheckStatus = ref<DeviceCheckStatus>('checking')
const deviceErrorMsg = ref('')
const leftDeviceOk = ref(false)
const rightDeviceOk = ref(false)

const showDeviceOverlay = computed(() => devicePhase.value === 'detect')
const deviceCheckItems = computed(() => [
  { label: '左侧设备', ok: leftDeviceOk.value },
  { label: '右侧设备', ok: rightDeviceOk.value },
])

async function checkDevices() {
  deviceCheckStatus.value = 'checking'
  deviceErrorMsg.value = ''
  leftDeviceOk.value = false
  rightDeviceOk.value = false

  try {
    await initConfig()
    const leftPort = String(getConfigItem('sensorlessOvenLeftPort') || '').trim()
    const rightPort = String(getConfigItem('sensorlessOvenRightPort') || '').trim()
    const ports = await listSensorlessOvenPorts()
    leftDeviceOk.value = isSensorlessOvenPortPresent(ports, leftPort)
    rightDeviceOk.value = isSensorlessOvenPortPresent(ports, rightPort)

    if (leftDeviceOk.value && rightDeviceOk.value) {
      deviceCheckStatus.value = 'success'
      return
    }

    const errors: string[] = []
    if (!leftPort) errors.push('未配置左侧设备')
    else if (!leftDeviceOk.value) errors.push('左侧设备未连接')
    if (!rightPort) errors.push('未配置右侧设备')
    else if (!rightDeviceOk.value) errors.push('右侧设备未连接')
    deviceCheckStatus.value = 'error'
    deviceErrorMsg.value = errors.join('，') || '设备检测异常'
  } catch (error) {
    deviceCheckStatus.value = 'error'
    deviceErrorMsg.value = error instanceof Error ? error.message : String(error || '设备检测失败')
  }
}

function enterMainInterface() {
  devicePhase.value = 'ready'
}

onMounted(() => {
  void checkDevices()
})
</script>

<template>
  <div class="high-temp-box-page">
    <DeviceCheckOverlay
      :visible="showDeviceOverlay"
      :status="deviceCheckStatus"
      :items="deviceCheckItems"
      :error-msg="deviceErrorMsg"
      accent-color="orange"
      @enter="enterMainInterface"
      @recheck="checkDevices"
      @skip="enterMainInterface"
    />

    <div v-if="currentView === 'dashboard'" class="page-header">
      <div class="header-left">
        <div class="header-icon">
          <Icon icon="mdi:heat-wave" />
        </div>
        <div>
          <h1 class="header-title">无感烘箱</h1>
          <p class="header-subtitle">无感烘箱测试系统</p>
        </div>
      </div>
      <div class="header-right"></div>
    </div>
    <SensorlessOvenDashboard v-if="currentView === 'dashboard'" :ctx="ctx" />
    <SensorlessOvenTestFlow v-else-if="currentView === 'pre-check' || currentView === 'monitoring'" :ctx="ctx" />

  </div>
</template>

<style scoped>
.high-temp-box-page {
  position: relative;
  height: 100%;
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 页面头部 */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}

.page-header .header-icon {
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
  font-size: 1.05rem;
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(220, 38, 38, 0.15));
  color:  var(--color-accent-red);
}

.header-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
}

.header-subtitle {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  margin-top: 0;
  margin-bottom: 0;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
</style>
