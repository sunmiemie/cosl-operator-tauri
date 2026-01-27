/**
 * Hardware device types
 * Defines structures for discovered hardware devices
 */
import { z } from 'zod'

// ========== Camera Device ==========

export const CameraDeviceSchema = z.object({
  name: z.string(),
  id: z.union([z.string(), z.number()]),
})

export type CameraDevice = z.infer<typeof CameraDeviceSchema>

// ========== Serial Device ==========

export const SerialDeviceSchema = z.object({
  description: z.string(),
  hwid: z.string(),
  port: z.string(),
  manufacturer: z.nullable(z.string()),
})

export type SerialDevice = z.infer<typeof SerialDeviceSchema>

// ========== VISA Device ==========

export const VISADeviceSchema = z.object({
  name: z.string(),
  address: z.string(),
  description: z.string(),
})

export type VISADevice = z.infer<typeof VISADeviceSchema>

// ========== NI DAQmx Device ==========

export const NIDAQmxDeviceSchema = z.object({
  name: z.string(),
  address: z.string(),
  description: z.string(),
})

export type NIDAQmxDevice = z.infer<typeof NIDAQmxDeviceSchema>

// ========== NI DMM Device ==========

export const NIDMMDeviceSchema = z.object({
  name: z.string(),
  address: z.string(),
  description: z.string(),
})

export type NIDMMDevice = z.infer<typeof NIDMMDeviceSchema>

// ========== Combined Device Info ==========

/**
 * Device info schema containing all device types
 */
export const DeviceInfoSchema = z.object({
  cameras: z.array(CameraDeviceSchema),
  serialDevices: z.array(SerialDeviceSchema),
  visaDevices: z.array(VISADeviceSchema),
  nidaqmxDevices: z.array(NIDAQmxDeviceSchema),
  nidmmDevices: z.array(NIDMMDeviceSchema),
})

export type DeviceInfo = z.infer<typeof DeviceInfoSchema>

/**
 * Legacy device info schema (string arrays from backend)
 */
export const LegacyDeviceInfoSchema = z.object({
  serial_devices: z.array(z.string()).optional(),
  visa_devices: z.array(z.string()).optional(),
  cameras: z.array(z.string()).optional(),
  nidaqmx_devices: z.array(z.string()).optional(),
  nidmm_devices: z.array(z.string()).optional(),
})

export type LegacyDeviceInfo = z.infer<typeof LegacyDeviceInfoSchema>

// ========== Device Category ==========

export type DeviceCategory = 'camera' | 'serial' | 'visa' | 'nidaqmx' | 'nidmm'

export const DEVICE_CATEGORIES: DeviceCategory[] = [
  'camera',
  'serial',
  'visa',
  'nidaqmx',
  'nidmm',
]

/**
 * Get display name for device category
 */
export function getDeviceCategoryName(category: DeviceCategory): string {
  const names: Record<DeviceCategory, string> = {
    camera: 'Cameras',
    serial: 'Serial Ports',
    visa: 'VISA Instruments',
    nidaqmx: 'NI DAQmx Devices',
    nidmm: 'NI DMM Devices',
  }
  return names[category]
}

/**
 * Get icon name for device category
 */
export function getDeviceCategoryIcon(category: DeviceCategory): string {
  const icons: Record<DeviceCategory, string> = {
    camera: 'camera',
    serial: 'usb',
    visa: 'cpu',
    nidaqmx: 'activity',
    nidmm: 'gauge',
  }
  return icons[category]
}

// ========== Helper Functions ==========

/**
 * Convert legacy device info to structured format
 */
export function convertLegacyDeviceInfo(legacy: LegacyDeviceInfo): DeviceInfo {
  return {
    cameras: (legacy.cameras || []).map((name, index) => ({
      name,
      id: index,
    })),
    serialDevices: (legacy.serial_devices || []).map(port => ({
      description: port,
      hwid: '',
      port,
      manufacturer: null,
    })),
    visaDevices: (legacy.visa_devices || []).map(address => ({
      name: address,
      address,
      description: '',
    })),
    nidaqmxDevices: (legacy.nidaqmx_devices || []).map(name => ({
      name,
      address: name,
      description: '',
    })),
    nidmmDevices: (legacy.nidmm_devices || []).map(name => ({
      name,
      address: name,
      description: '',
    })),
  }
}

/**
 * Get total device count
 */
export function getTotalDeviceCount(devices: DeviceInfo): number {
  return (
    devices.cameras.length +
    devices.serialDevices.length +
    devices.visaDevices.length +
    devices.nidaqmxDevices.length +
    devices.nidmmDevices.length
  )
}

/**
 * Check if any devices are available
 */
export function hasAnyDevices(devices: DeviceInfo): boolean {
  return getTotalDeviceCount(devices) > 0
}
