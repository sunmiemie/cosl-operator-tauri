/**
 * Hardware device management composable
 * Handles device discovery, refresh, and state management
 */
import { ref, readonly, computed } from 'vue'
import { getDeviceInfo as fetchDeviceInfo } from '@/services/flojoy-api'
import {
  type DeviceInfo,
  type CameraDevice,
  type SerialDevice,
  type VISADevice,
  type NIDAQmxDevice,
  type NIDMMDevice,
  type DeviceCategory,
  convertLegacyDeviceInfo,
  getTotalDeviceCount,
  hasAnyDevices,
} from '@/types'

// Global state
const devices = ref<DeviceInfo>({
  cameras: [],
  serialDevices: [],
  visaDevices: [],
  nidaqmxDevices: [],
  nidmmDevices: [],
})

const isLoading = ref(false)
const lastRefreshTime = ref<number | null>(null)
const error = ref<string | null>(null)

// Discovery options
const discoverNIDAQmx = ref(false)
const discoverNIDMM = ref(false)

// Refresh interval (30 seconds)
const REFRESH_INTERVAL = 30 * 1000

/**
 * Refresh device list from backend
 */
async function refreshDevices(): Promise<DeviceInfo> {
  if (isLoading.value) {
    return devices.value
  }

  isLoading.value = true
  error.value = null

  try {
    const legacyInfo = await fetchDeviceInfo(
      discoverNIDAQmx.value,
      discoverNIDMM.value
    )
    devices.value = convertLegacyDeviceInfo(legacyInfo)
    lastRefreshTime.value = Date.now()
    return devices.value
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Failed to fetch devices'
    error.value = errorMessage
    console.error('Device discovery error:', e)
    return devices.value
  } finally {
    isLoading.value = false
  }
}

/**
 * Set NI DAQmx discovery option
 */
function setDiscoverNIDAQmx(enabled: boolean): void {
  discoverNIDAQmx.value = enabled
}

/**
 * Set NI DMM discovery option
 */
function setDiscoverNIDMM(enabled: boolean): void {
  discoverNIDMM.value = enabled
}

/**
 * Get devices by category
 */
function getDevicesByCategory(
  category: DeviceCategory
): CameraDevice[] | SerialDevice[] | VISADevice[] | NIDAQmxDevice[] | NIDMMDevice[] {
  switch (category) {
    case 'camera':
      return devices.value.cameras
    case 'serial':
      return devices.value.serialDevices
    case 'visa':
      return devices.value.visaDevices
    case 'nidaqmx':
      return devices.value.nidaqmxDevices
    case 'nidmm':
      return devices.value.nidmmDevices
  }
}

/**
 * Get count by category
 */
function getDeviceCountByCategory(category: DeviceCategory): number {
  return getDevicesByCategory(category).length
}

/**
 * Clear all devices
 */
function clearDevices(): void {
  devices.value = {
    cameras: [],
    serialDevices: [],
    visaDevices: [],
    nidaqmxDevices: [],
    nidmmDevices: [],
  }
  lastRefreshTime.value = null
  error.value = null
}

/**
 * Hardware management composable
 */
export function useHardware() {
  // Computed properties
  const totalCount = computed(() => getTotalDeviceCount(devices.value))
  const hasDevices = computed(() => hasAnyDevices(devices.value))

  const cameraCount = computed(() => devices.value.cameras.length)
  const serialCount = computed(() => devices.value.serialDevices.length)
  const visaCount = computed(() => devices.value.visaDevices.length)
  const nidaqmxCount = computed(() => devices.value.nidaqmxDevices.length)
  const nidmmCount = computed(() => devices.value.nidmmDevices.length)

  const needsRefresh = computed(() => {
    if (!lastRefreshTime.value) return true
    return Date.now() - lastRefreshTime.value > REFRESH_INTERVAL
  })

  return {
    // State
    devices: readonly(devices),
    isLoading: readonly(isLoading),
    error: readonly(error),
    lastRefreshTime: readonly(lastRefreshTime),

    // Discovery options
    discoverNIDAQmx: readonly(discoverNIDAQmx),
    discoverNIDMM: readonly(discoverNIDMM),

    // Computed
    totalCount,
    hasDevices,
    cameraCount,
    serialCount,
    visaCount,
    nidaqmxCount,
    nidmmCount,
    needsRefresh,

    // Methods
    refreshDevices,
    setDiscoverNIDAQmx,
    setDiscoverNIDMM,
    getDevicesByCategory,
    getDeviceCountByCategory,
    clearDevices,
  }
}
