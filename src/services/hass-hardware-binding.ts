export type HassHardwareRole =
  | 'pulser'
  | 'itech3123_48v'
  | 'itech3123'
  | 'itech3123_input'
  | 'itech8513_48v_load'
  | 'itech8513_90v_load'
  | 'ifbox'
  | 'storage'

interface BindableFlowchartNode {
  id: string
  data?: object
}

interface BindableFlowchartEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
}

export interface ResolvedHassHardwareBinding {
  role: HassHardwareRole
  displayName: string
  port: string
  resource: string
  hwid: string
  baudrate?: number
  persistentPort?: string
  vid?: number
  pid?: number
  serialNumber?: string
  interfaceName?: string
  instrumentIdentity?: string
  instrumentSerial?: string
}

export type HassHardwareResourceType = 'serial' | 'visa'

export interface HassHardwareMatcher {
  preferredPort?: string
  vid?: number
  pid?: number
  serialNumber?: string
  interfaceMarker?: string
  instrumentSerial?: string
}

export interface HassHardwareProfile {
  role: HassHardwareRole
  displayName: string
  resourceType: HassHardwareResourceType
  baudrate?: number
  matcher: HassHardwareMatcher
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

const CLIENT_MANAGED_WORKBENCH_FUNCTIONS = new Set(['START_EDM', 'STOP_EDM'])

// 已发布的高速率工艺中，该节点负责在脉冲器初始化完成后以 115200
// 重新打开同一脉冲器串口。旧工单可能仍持有未写入 hardwareRole 的
// 进程内工艺快照，因此用稳定节点 ID 做窄范围兼容，不能按相邻节点猜测。
const LEGACY_PULSER_OPEN_SERIAL_NODE_IDS = new Set([
  'OPEN_SERIAL-f4a0e8b1-3f7e-4748-8cc6-0aaf02630688',
])

function stringField(data: Record<string, unknown>, key: string): string {
  return typeof data[key] === 'string' ? data[key] : ''
}

function nodeData(node: BindableFlowchartNode): Record<string, unknown> {
  return node.data && typeof node.data === 'object'
    ? node.data as Record<string, unknown>
    : {}
}

export function inferHassHardwareRole(node: BindableFlowchartNode): HassHardwareRole | null {
  const data = nodeData(node)
  const configuredRole = stringField(data, 'hardwareRole') as HassHardwareRole
  if (
    configuredRole === 'pulser'
    || configuredRole === 'itech3123_48v'
    || configuredRole === 'itech3123'
    || configuredRole === 'itech3123_input'
    || configuredRole === 'itech8513_48v_load'
    || configuredRole === 'itech8513_90v_load'
    || configuredRole === 'ifbox'
    || configuredRole === 'storage'
  ) {
    return configuredRole
  }

  const func = stringField(data, 'func').toUpperCase()
  const label = stringField(data, 'label').toUpperCase()
  const path = stringField(data, 'path').toUpperCase()

  if (func.includes('ITECH3123_48V')) return 'itech3123_48v'
  if (func.includes('ITECH3123')) return 'itech3123'

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
    || (func === 'OPEN_SERIAL' && label.includes('脉冲器'))
    || (func === 'OPEN_SERIAL' && LEGACY_PULSER_OPEN_SERIAL_NODE_IDS.has(node.id))
  ) {
    return 'pulser'
  }

  return null
}

export function getRequiredHassHardwareRoles(
  nodes: BindableFlowchartNode[]
): HassHardwareRole[] {
  const roles = new Set<HassHardwareRole>()
  for (const node of nodes) {
    const role = inferHassHardwareRole(node)
    if (role) roles.add(role)
  }
  return [...roles]
}

function getControlNumber(
  node: BindableFlowchartNode,
  controlName: string
): number | undefined {
  const ctrls = nodeData(node).ctrls
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
    const func = stringField(nodeData(node), 'func').toUpperCase()
    return func === 'OPEN_SERIAL' && inferHassHardwareRole(node) === role
  })
  const configuredBaudrate = serialNode
    ? getControlNumber(serialNode, 'baudrate')
    : undefined

  if (configuredBaudrate) return configuredBaudrate
  return role === 'ifbox' ? 115200 : 9600
}

/**
 * 工单预检固定包含高速率台架核心设备，并补充当前工艺实际使用的可选设备。
 * 48 V 3123 在上电阶段单独检测，存储板等可选角色按工艺节点决定。
 */
export function getHassPreflightRequiredRoles(
  nodes: BindableFlowchartNode[],
  reportType: 'drive_control' | 'rectifier_regulator' = 'drive_control',
): HassHardwareRole[] {
  if (reportType === 'rectifier_regulator') {
    return [
      'itech3123_input',
      'itech8513_48v_load',
      'itech8513_90v_load',
    ]
  }
  const requiredRoles = new Set<HassHardwareRole>([
    'pulser',
    'ifbox',
    'itech3123',
    ...getRequiredHassHardwareRoles(nodes),
  ])
  requiredRoles.delete('itech3123_48v')
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

export function applyHassHardwareBindings<T extends BindableFlowchartNode>(
  nodes: T[],
  bindings: ResolvedHassHardwareBinding[]
): T[] {
  const bindingByRole = new Map(bindings.map((binding) => [binding.role, binding]))

  return nodes.map((node) => {
    const role = inferHassHardwareRole(node)
    if (!role) return node

    const binding = bindingByRole.get(role)
    if (!binding) return node

    const data = nodeData(node)
    const rawCtrls = data.ctrls
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
        ...data,
        ctrls,
      },
    } as T
  })
}

/**
 * 工艺只保存设备角色和协议参数，不保存某台客户端上的 COM 口、VISA 地址。
 * 运行时 applyHassHardwareBindings 会在流程内存副本中注入本机实际资源。
 */
export function normalizeHassHardwareNodes<T extends BindableFlowchartNode>(
  nodes: T[],
): T[] {
  return nodes.map((node) => {
    const role = inferHassHardwareRole(node)
    if (!role) return node

    const data = nodeData(node)
    const rawCtrls = data.ctrls
    if (!rawCtrls || typeof rawCtrls !== 'object' || Array.isArray(rawCtrls)) {
      return {
        ...node,
        data: { ...data, hardwareRole: role },
      } as T
    }

    let changed = false
    const ctrls = Object.fromEntries(
      Object.entries(rawCtrls).map(([key, rawControl]) => {
        if (!rawControl || typeof rawControl !== 'object' || Array.isArray(rawControl)) {
          return [key, rawControl]
        }
        const control = rawControl as Record<string, unknown>
        if (typeof control.type !== 'string' || !HARDWARE_CONTROL_TYPES.has(control.type)) {
          return [key, rawControl]
        }
        if (control.value !== '') changed = true
        return [key, { ...control, value: '' }]
      }),
    )

    if (!changed && data.hardwareRole === role) return node
    return {
      ...node,
      data: {
        ...data,
        hardwareRole: role,
        ctrls,
      },
    } as T
  })
}

/**
 * MQTT 工作台启停属于客户端生命周期，不再交给 Flojoy 工艺节点执行。
 * 对旧工艺中的 START_EDM / STOP_EDM 做内存级旁路，保留前后节点顺序。
 */
export function externalizeHassRuntimeGraph<
  TNode extends BindableFlowchartNode,
  TEdge extends BindableFlowchartEdge,
>(nodes: TNode[], edges: TEdge[]): { nodes: TNode[]; edges: TEdge[] } {
  const externalNodeIds = new Set(
    nodes
      .filter(node => CLIENT_MANAGED_WORKBENCH_FUNCTIONS.has(
        stringField(nodeData(node), 'func').toUpperCase(),
      ))
      .map(node => node.id),
  )
  if (!externalNodeIds.size) {
    return {
      nodes: normalizeHassHardwareNodes(nodes),
      edges: edges.slice(),
    }
  }

  let runtimeEdges = edges.slice()
  for (const externalNodeId of externalNodeIds) {
    const incoming = runtimeEdges.filter(edge => edge.target === externalNodeId)
    const outgoing = runtimeEdges.filter(edge => edge.source === externalNodeId)
    runtimeEdges = runtimeEdges.filter(
      edge => edge.source !== externalNodeId && edge.target !== externalNodeId,
    )

    for (const sourceEdge of incoming) {
      for (const targetEdge of outgoing) {
        if (
          sourceEdge.source === externalNodeId
          || targetEdge.target === externalNodeId
          || sourceEdge.source === targetEdge.target
        ) {
          continue
        }
        const duplicate = runtimeEdges.some(edge => (
          edge.source === sourceEdge.source
          && edge.target === targetEdge.target
          && edge.sourceHandle === sourceEdge.sourceHandle
          && edge.targetHandle === targetEdge.targetHandle
        ))
        if (duplicate) continue
        runtimeEdges.push({
          ...sourceEdge,
          id: `client-managed-bypass-${externalNodeId}-${sourceEdge.source}-${targetEdge.target}-${runtimeEdges.length}`,
          source: sourceEdge.source,
          target: targetEdge.target,
          sourceHandle: sourceEdge.sourceHandle,
          targetHandle: targetEdge.targetHandle,
        } as TEdge)
      }
    }
  }

  const runtimeNodes = nodes.filter(node => !externalNodeIds.has(node.id))
  return {
    nodes: normalizeHassHardwareNodes(runtimeNodes),
    edges: runtimeEdges,
  }
}
