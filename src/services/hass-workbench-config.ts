import type { HaltHassMqttConfig } from '@/composables/useHaltHassMqtt'
import type {
  HassHardwareProfile,
  HassHardwareRole,
  ResolvedHassHardwareBinding,
} from './hass-hardware-binding'

const WORKBENCH_CONFIG_KEY = 'halt-hass-workbench-config-v1'
const LEGACY_MQTT_CONFIG_KEY = 'halt-hass-mqtt-config'

export interface HassWorkbenchConfig {
  version: 1
  mqtt: HaltHassMqttConfig
  hardwareProfiles: HassHardwareProfile[]
}

export const HASS_HARDWARE_ROLE_ORDER: HassHardwareRole[] = [
  'itech3123_48v',
  'itech3123',
  'itech3123_input',
  'itech8513_48v_load',
  'itech8513_90v_load',
  'pulser',
  'ifbox',
  'storage',
]

const DEFAULT_CONFIG: HassWorkbenchConfig = {
  version: 1,
  mqtt: {
    broker: '192.168.1.54',
    port: 1883,
    topicPrefix: 'EDM',
    username: 'Admin',
    password: '123456',
  },
  hardwareProfiles: [
    {
      role: 'itech3123_48v',
      displayName: 'ITECH 3123（48 V）',
      resourceType: 'visa',
      matcher: {
        vid: 0x2ec7,
        pid: 0x0666,
      },
    },
    {
      role: 'itech3123',
      displayName: 'ITECH 3123（90 V）',
      resourceType: 'visa',
      matcher: {
        vid: 0x2ec7,
        pid: 0x0666,
      },
    },
    {
      role: 'itech3123_input',
      displayName: 'ITECH 3123（整流稳压输入源）',
      resourceType: 'visa',
      matcher: {},
    },
    {
      role: 'itech8513_48v_load',
      displayName: 'ITECH 8513（48 V 负载）',
      resourceType: 'visa',
      matcher: {},
    },
    {
      role: 'itech8513_90v_load',
      displayName: 'ITECH 8513（90 V 负载）',
      resourceType: 'visa',
      matcher: {},
    },
    {
      role: 'pulser',
      displayName: '脉冲器',
      resourceType: 'serial',
      baudrate: 9600,
      matcher: {
        vid: 0x0403,
        pid: 0x6001,
      },
    },
    {
      role: 'ifbox',
      displayName: 'IFBOX',
      resourceType: 'serial',
      baudrate: 115200,
      matcher: {
        vid: 0x2e3c,
        pid: 0x7543,
        interfaceMarker: 'TBUS PORT',
      },
    },
    {
      role: 'storage',
      displayName: '存储板',
      resourceType: 'serial',
      baudrate: 9600,
      matcher: {
        vid: 0x2e3c,
        pid: 0x7543,
        interfaceMarker: 'EXT PORT',
      },
    },
  ],
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function normalizedMqttConfig(value: Partial<HaltHassMqttConfig> | undefined): HaltHassMqttConfig {
  const defaults = DEFAULT_CONFIG.mqtt
  const port = Number(value?.port)
  return {
    broker: typeof value?.broker === 'string' && value.broker.trim()
      ? value.broker.trim()
      : defaults.broker,
    port: (typeof value?.port === 'number' || typeof value?.port === 'string') &&
      Number.isInteger(port) && port > 0 && port <= 65535 ? port : defaults.port,
    topicPrefix: typeof value?.topicPrefix === 'string' && value.topicPrefix.trim()
      ? value.topicPrefix.trim().replace(/^\/+|\/+$/g, '') || defaults.topicPrefix
      : defaults.topicPrefix,
    username: typeof value?.username === 'string' ? value.username : defaults.username,
    password: typeof value?.password === 'string' ? value.password : defaults.password,
  }
}

function normalizedHardwareProfiles(value: unknown): HassHardwareProfile[] {
  const stored = Array.isArray(value)
    ? new Map(
        value
          .filter((item): item is Partial<HassHardwareProfile> & { role: HassHardwareRole } => (
            Boolean(item)
            && typeof item === 'object'
            && HASS_HARDWARE_ROLE_ORDER.includes((item as { role?: HassHardwareRole }).role as HassHardwareRole)
          ))
          .map(item => [item.role, item]),
      )
    : new Map<HassHardwareRole, Partial<HassHardwareProfile>>()

  return DEFAULT_CONFIG.hardwareProfiles.map((fallback) => {
    const saved = stored.get(fallback.role)
    return {
      ...clone(fallback),
      ...saved,
      role: fallback.role,
      displayName: typeof saved?.displayName === 'string' && saved.displayName.trim()
        ? saved.displayName.trim()
        : fallback.displayName,
      resourceType: saved?.resourceType === 'visa' || saved?.resourceType === 'serial'
        ? saved.resourceType
        : fallback.resourceType,
      baudrate: (typeof saved?.baudrate === 'number' || typeof saved?.baudrate === 'string') &&
        Number.isSafeInteger(Number(saved.baudrate)) && Number(saved.baudrate) > 0
        ? Number(saved.baudrate) : fallback.baudrate,
      matcher: {
        ...fallback.matcher,
        ...(saved?.matcher || {}),
      },
    }
  })
}

function loadLegacyMqttConfig(): Partial<HaltHassMqttConfig> | undefined {
  try {
    const raw = localStorage.getItem(LEGACY_MQTT_CONFIG_KEY)
    return raw ? JSON.parse(raw) as Partial<HaltHassMqttConfig> : undefined
  } catch {
    return undefined
  }
}

export function loadHassWorkbenchConfig(): HassWorkbenchConfig {
  try {
    const raw = localStorage.getItem(WORKBENCH_CONFIG_KEY)
    const saved = raw ? JSON.parse(raw) as Partial<HassWorkbenchConfig> : undefined
    return {
      version: 1,
      mqtt: normalizedMqttConfig(saved?.mqtt || loadLegacyMqttConfig()),
      hardwareProfiles: normalizedHardwareProfiles(saved?.hardwareProfiles),
    }
  } catch {
    return clone(DEFAULT_CONFIG)
  }
}

export function createDefaultHassWorkbenchConfig(): HassWorkbenchConfig {
  return clone(DEFAULT_CONFIG)
}

export function saveHassWorkbenchConfig(config: HassWorkbenchConfig): HassWorkbenchConfig {
  const normalized: HassWorkbenchConfig = {
    version: 1,
    mqtt: normalizedMqttConfig(config.mqtt),
    hardwareProfiles: normalizedHardwareProfiles(config.hardwareProfiles),
  }
  localStorage.setItem(WORKBENCH_CONFIG_KEY, JSON.stringify(normalized))
  // 保留旧键，便于尚未切换到统一配置的页面读取同一 MQTT 地址。
  localStorage.setItem(LEGACY_MQTT_CONFIG_KEY, JSON.stringify(normalized.mqtt))
  return clone(normalized)
}

export function getHassHardwareProfiles(
  roles?: HassHardwareRole[],
): HassHardwareProfile[] {
  const profiles = loadHassWorkbenchConfig().hardwareProfiles
  if (!roles?.length) return profiles
  const required = new Set(roles)
  return profiles.filter(profile => required.has(profile.role))
}

export function extractInstrumentSerialFromIdentity(identity: string): string | undefined {
  const normalized = identity.trim()
  if (!normalized) return undefined
  // 标准 SCPI *IDN? 回执为“厂家,型号,序列号,版本”，序列号允许字母、短横线和短位数。
  const idnParts = normalized.split(',').map(part => part.trim())
  if (idnParts.length >= 3 && idnParts[2]) return idnParts[2]
  const labeled = normalized.match(/(?:serial(?:\s*number)?|s\/?n|sn)\s*[:=]\s*([\w.-]+)/i)?.[1]
  if (labeled) return labeled
  return normalized.match(/\b\d{6,}\b/)?.[0]
}

export function learnHardwareProfilesFromBindings(
  profiles: HassHardwareProfile[],
  bindings: ResolvedHassHardwareBinding[],
): HassHardwareProfile[] {
  const bindingByRole = new Map(bindings.map(binding => [binding.role, binding]))
  return profiles.map((profile) => {
    const binding = bindingByRole.get(profile.role)
    if (!binding) return profile
    const matcher = {
      ...profile.matcher,
      preferredPort: binding.persistentPort || binding.port,
      vid: binding.vid ?? profile.matcher.vid,
      pid: binding.pid ?? profile.matcher.pid,
      serialNumber: binding.serialNumber || profile.matcher.serialNumber,
    }
    if (binding.interfaceName && !matcher.interfaceMarker) {
      matcher.interfaceMarker = binding.interfaceName
    }
    if (binding.instrumentIdentity && profile.resourceType === 'visa') {
      const serial = extractInstrumentSerialFromIdentity(binding.instrumentIdentity)
      if (serial) matcher.instrumentSerial = serial
    }
    return { ...profile, matcher }
  })
}

export function resetHassWorkbenchConfig(): HassWorkbenchConfig {
  const value = clone(DEFAULT_CONFIG)
  saveHassWorkbenchConfig(value)
  return value
}
