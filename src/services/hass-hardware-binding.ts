import type { SerialDevice } from '@/types'

export type HassHardwareRole =
  | 'pulser'
  | 'itech6723'
  | 'itech3123'
  | 'ifbox'
  | 'storage'

interface BindableFlowchartNode {
  id: string
  data: Record<string, unknown>
}

interface HardwareDefinition {
  displayName: string
  resourceType: 'serial' | 'visa'
  matches: (device: SerialDevice) => boolean
}

export interface ResolvedHassHardwareBinding {
  role: HassHardwareRole
  displayName: string
  port: string
  resource: string
  hwid: string
  baudrate?: number
}

const HARDWARE_CONTROL_TYPES = new Set([
  'SerialDevice',
  'SerialConnection',
  'VisaDevice',
  'VisaConnection',
])

const IFBOX_FUNCTIONS = new Set([
  'OPEN_IFB',
  'CLOSE_IFB',
  'READ_COMM',
  'READ_MAST',
  'READ_STATUS',
  'SHAKE_HANDS',
])

const PULSER_FUNCTIONS = new Set([
  'READ_ZERO_POSITION',
  'SET_ZERO_POSITION',
  'SET_STARTEND_ANGLES',
  'CLOSE_SERIAL',
  'READ_PULSER_WAVEFORM',
  'WAVEFORM_SHOW2',
])

function normalizeIdentity(value: string): string {
  return value.toUpperCase().replace(/\s+/g, ' ')
}

function matchesUsbIdentity(
  device: SerialDevice,
  vid: string,
  pid: string,
  serial?: string
): boolean {
  const hwid = normalizeIdentity(device.hwid)
  if (!hwid.includes(`VID:PID=${vid}:${pid}`)) return false
  return serial ? hwid.includes(`SER=${serial}`) : true
}

function matchesTbusPort(device: SerialDevice): boolean {
  return (
    matchesUsbIdentity(device, '2E3C', '7543')
    && normalizeIdentity(device.description).includes('TBUS PORT')
  )
}

function matchesExtPort(device: SerialDevice): boolean {
  return (
    matchesUsbIdentity(device, '2E3C', '7543')
    && normalizeIdentity(device.description).includes('EXT PORT')
  )
}

const HARDWARE_DEFINITIONS: Record<HassHardwareRole, HardwareDefinition> = {
  pulser: {
    displayName: '脉冲器',
    resourceType: 'serial',
    matches: (device) => matchesUsbIdentity(device, '0403', '6001', 'B003PLDPA'),
  },
  itech6723: {
    displayName: 'ITECH 6723',
    resourceType: 'visa',
    // CH340 没有硬件序列号；现场设备以独有 VID/PID 识别。
    // 如果以后接入多个相同 CH340，匹配会因候选不唯一而明确失败。
    matches: (device) => matchesUsbIdentity(device, '1A86', '7523'),
  },
  itech3123: {
    displayName: 'ITECH 3123（工艺节点名为 3124）',
    resourceType: 'visa',
    matches: (device) => matchesUsbIdentity(device, '2EC7', '0666'),
  },
  ifbox: {
    displayName: 'IFBOX',
    resourceType: 'serial',
    // 新 IFBOX 是包含 TBus/HS/EXT 三个串口的复合设备，三个接口具有相同
    // VID/PID，必须同时按接口描述锁定 TBus Port，不能只按 USB 身份匹配。
    matches: matchesTbusPort,
  },
  storage: {
    displayName: '存储板',
    resourceType: 'serial',
    // 存储板通过同一复合设备的 EXT Port 通信，不能误绑定到 TBus Port。
    matches: matchesExtPort,
  },
}

function stringField(data: Record<string, unknown>, key: string): string {
  return typeof data[key] === 'string' ? data[key] : ''
}

function inferHardwareRole(node: BindableFlowchartNode): HassHardwareRole | null {
  const func = stringField(node.data, 'func').toUpperCase()
  const label = stringField(node.data, 'label').toUpperCase()
  const path = stringField(node.data, 'path').toUpperCase()

  if (func.includes('ITECH6723G')) return 'itech6723'
  if (func.includes('ITECH3124') || func.includes('ITECH3123')) return 'itech3123'

  if (
    func === 'READ_MEMORY_ADDRESS'
    || path.includes('/MEMORY/')
    || path.includes('\\MEMORY\\')
    || label.includes('存储板')
  ) {
    return 'storage'
  }

  if (
    IFBOX_FUNCTIONS.has(func)
    || path.includes('/IFBOX/')
    || path.includes('\\IFBOX\\')
    || label.includes('IFBOX')
  ) {
    return 'ifbox'
  }

  if (
    PULSER_FUNCTIONS.has(func)
    || path.includes('/PULSER/')
    || path.includes('\\PULSER\\')
    || label === '打开脉冲器串口'
    || label === 'OPEN SERIAL'
  ) {
    return 'pulser'
  }

  return null
}

function toVisaResource(port: string): string {
  const windowsPort = /^COM(\d+)$/i.exec(port)
  return windowsPort
    ? `ASRL${windowsPort[1]}::INSTR`
    : `ASRL${port}::INSTR`
}

export function getRequiredHassHardwareRoles(
  nodes: BindableFlowchartNode[]
): HassHardwareRole[] {
  const roles = new Set<HassHardwareRole>()
  for (const node of nodes) {
    const role = inferHardwareRole(node)
    if (role) roles.add(role)
  }
  return [...roles]
}

function getControlNumber(
  node: BindableFlowchartNode,
  controlName: string
): number | undefined {
  const ctrls = node.data.ctrls
  if (!ctrls || typeof ctrls !== 'object' || Array.isArray(ctrls)) {
    return undefined
  }

  const control = (ctrls as Record<string, unknown>)[controlName]
  if (!control || typeof control !== 'object' || Array.isArray(control)) {
    return undefined
  }

  const value = (control as Record<string, unknown>).value
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function getRoleBaudrate(
  nodes: BindableFlowchartNode[],
  role: HassHardwareRole
): number | undefined {
  if (role !== 'ifbox' && role !== 'pulser' && role !== 'storage') {
    return undefined
  }

  const serialNode = nodes.find((node) => {
    const func = stringField(node.data, 'func').toUpperCase()
    return func === 'OPEN_SERIAL' && inferHardwareRole(node) === role
  })
  const configuredBaudrate = serialNode
    ? getControlNumber(serialNode, 'baudrate')
    : undefined

  if (configuredBaudrate) return configuredBaudrate
  return role === 'ifbox' ? 115200 : 9600
}

/**
 * 上电前只绑定 6723G。脉冲器和 IFBOX 都依赖其 48 V 输出，不能在
 * 上电前因为串口尚未枚举而阻断预检。
 */
export function resolveHassPreflightPowerBinding(
  serialDevices: SerialDevice[]
): ResolvedHassHardwareBinding {
  return resolveHassHardwareBindings(['itech6723'], serialDevices)[0]
}

/**
 * 工单预检固定覆盖整套 HALT-HASS 台架，而不仅是当前流程中碰巧出现的节点。
 * 6723G 在上电阶段单独检测，其余角色在稳定等待后重新枚举。
 */
export function getHassPreflightRequiredRoles(
  nodes: BindableFlowchartNode[]
): HassHardwareRole[] {
  const requiredRoles = new Set<HassHardwareRole>([
    'pulser',
    'ifbox',
    'itech3123',
    'storage',
    ...getRequiredHassHardwareRoles(nodes),
  ])
  requiredRoles.delete('itech6723')
  return [...requiredRoles]
}

export function getHassPreflightBaudrates(
  nodes: BindableFlowchartNode[]
): Partial<Record<HassHardwareRole, number>> {
  return {
    pulser: getRoleBaudrate(nodes, 'pulser') ?? 9600,
    ifbox: getRoleBaudrate(nodes, 'ifbox') ?? 115200,
    storage: getRoleBaudrate(nodes, 'storage') ?? 9600,
  }
}

export function resolveHassHardwareBindings(
  requiredRoles: HassHardwareRole[],
  serialDevices: SerialDevice[]
): ResolvedHassHardwareBinding[] {
  return requiredRoles.map((role) => {
    const definition = HARDWARE_DEFINITIONS[role]
    const candidates = serialDevices.filter(definition.matches)

    if (candidates.length === 0) {
      throw new Error(`未检测到 ${definition.displayName}，请检查 USB 连接`)
    }
    if (candidates.length > 1) {
      const ports = candidates.map((device) => device.port).join('、')
      throw new Error(
        `${definition.displayName} 匹配到多个设备（${ports}），无法进行唯一绑定`
      )
    }

    const device = candidates[0]
    return {
      role,
      displayName: definition.displayName,
      port: device.port,
      resource: definition.resourceType === 'visa'
        ? toVisaResource(device.port)
        : device.port,
      hwid: device.hwid,
    }
  })
}

export function applyHassHardwareBindings<T extends BindableFlowchartNode>(
  nodes: T[],
  bindings: ResolvedHassHardwareBinding[]
): T[] {
  const bindingByRole = new Map(bindings.map((binding) => [binding.role, binding]))

  return nodes.map((node) => {
    const role = inferHardwareRole(node)
    if (!role) return node

    const binding = bindingByRole.get(role)
    if (!binding) return node

    const rawCtrls = node.data.ctrls
    if (!rawCtrls || typeof rawCtrls !== 'object' || Array.isArray(rawCtrls)) {
      return node
    }

    let changed = false
    const ctrls = Object.fromEntries(
      Object.entries(rawCtrls).map(([key, rawControl]) => {
        if (
          !rawControl
          || typeof rawControl !== 'object'
          || Array.isArray(rawControl)
        ) {
          return [key, rawControl]
        }

        const control = rawControl as Record<string, unknown>
        if (
          typeof control.type !== 'string'
          || !HARDWARE_CONTROL_TYPES.has(control.type)
        ) {
          return [key, rawControl]
        }

        changed = true
        return [key, { ...control, value: binding.resource }]
      })
    )

    if (!changed) return node

    return {
      ...node,
      data: {
        ...node.data,
        ctrls,
      },
    }
  })
}
