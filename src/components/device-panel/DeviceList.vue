<script setup lang="ts">
/**
 * Device List Component
 * Displays a collapsible list of devices for a specific category
 */
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import type { DeviceCategory } from '@/types'

const props = defineProps<{
  category: DeviceCategory
  devices: Array<{ name: string; id?: string | number; [key: string]: unknown }>
  defaultOpen?: boolean
}>()

const isOpen = defineModel<boolean>('open', { default: false })

const categoryInfo = computed(() => {
  const info: Record<DeviceCategory, { icon: string; label: string; color: string }> = {
    camera: { icon: 'mdi:camera', label: '摄像头', color: 'bg-blue-500' },
    serial: { icon: 'mdi:usb', label: '串口设备', color: 'bg-green-500' },
    visa: { icon: 'mdi:chip', label: 'VISA 仪器', color: 'bg-purple-500' },
    nidaqmx: { icon: 'mdi:pulse', label: 'NI DAQmx', color: 'bg-orange-500' },
    nidmm: { icon: 'mdi:gauge', label: 'NI DMM', color: 'bg-red-500' },
  }
  return info[props.category]
})

function getDeviceDisplayName(device: { name: string; [key: string]: unknown }): string {
  return device.name || String(device.id) || '未知设备'
}

function getDeviceSubtext(device: Record<string, unknown>): string | null {
  if (props.category === 'serial' && device.port) {
    return String(device.port)
  }
  if ((props.category === 'visa' || props.category === 'nidaqmx' || props.category === 'nidmm') && device.address) {
    return String(device.address)
  }
  return null
}

function toggle() {
  isOpen.value = !isOpen.value
}
</script>

<template>
  <div class="device-list">
    <button class="list-header" @click="toggle">
      <div class="header-left">
        <div :class="['icon-box', categoryInfo.color]">
          <Icon :icon="categoryInfo.icon" class="category-icon" />
        </div>
        <span class="category-label">{{ categoryInfo.label }}</span>
      </div>
      <div class="header-right">
        <span class="device-count">{{ devices.length }}</span>
        <Icon
          icon="mdi:chevron-right"
          class="chevron"
          :class="{ rotated: isOpen }"
        />
      </div>
    </button>

    <div v-if="isOpen" class="list-content">
      <div v-if="devices.length === 0" class="empty-message">
        未发现设备
      </div>
      <div v-else class="device-items">
        <div
          v-for="(device, index) in devices"
          :key="index"
          class="device-item"
        >
          <div class="device-info">
            <div class="device-name">
              {{ getDeviceDisplayName(device) }}
            </div>
            <div v-if="getDeviceSubtext(device)" class="device-subtext">
              {{ getDeviceSubtext(device) }}
            </div>
          </div>
          <span class="device-badge">
            {{ category === 'camera' ? `ID: ${device.id}` : '已连接' }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.device-list {
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: background 0.2s;
}

.list-header:hover {
  background: var(--muted-background, rgba(0, 0, 0, 0.03));
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.icon-box {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.bg-blue-500 { background: #3b82f6; }
.bg-green-500 { background: #22c55e; }
.bg-purple-500 { background: #a855f7; }
.bg-orange-500 { background: #f97316; }
.bg-red-500 { background: #ef4444; }

.category-icon {
  width: 16px;
  height: 16px;
  color: white;
}

.category-label {
  font-weight: 500;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.device-count {
  padding: 2px 8px;
  font-size: 12px;
  background: var(--muted, #f1f5f9);
  color: var(--muted-foreground);
  border-radius: 9999px;
}

.chevron {
  width: 16px;
  height: 16px;
  color: var(--muted-foreground);
  transition: transform 0.2s;
}

.chevron.rotated {
  transform: rotate(90deg);
}

.list-content {
  border-top: 1px solid var(--border);
}

.empty-message {
  padding: 12px;
  font-size: 13px;
  color: var(--muted-foreground);
  text-align: center;
}

.device-items {
  /* No border-collapse needed with divs */
}

.device-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border-bottom: 1px solid var(--border);
  transition: background 0.2s;
}

.device-item:last-child {
  border-bottom: none;
}

.device-item:hover {
  background: var(--muted-background, rgba(0, 0, 0, 0.02));
}

.device-info {
  flex: 1;
  min-width: 0;
}

.device-name {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.device-subtext {
  font-size: 12px;
  color: var(--muted-foreground);
}

.device-badge {
  padding: 2px 8px;
  font-size: 11px;
  border: 1px solid var(--border);
  border-radius: 9999px;
  color: var(--muted-foreground);
  flex-shrink: 0;
  margin-left: 8px;
}
</style>
