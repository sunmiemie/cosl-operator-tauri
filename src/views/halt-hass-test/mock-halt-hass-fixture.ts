import type { HaltHassProcessJson } from '@/views/process-halt-hass/types'
import type { HaltHassOrder, ScannedBoard } from './types'

export const MOCK_HALT_HASS_ORDER_ID = -9001

export const MOCK_HALT_HASS_ORDER: HaltHassOrder = {
  id: MOCK_HALT_HASS_ORDER_ID,
  orderNo: 'HH-DEMO-001',
  status: 1,
  boardCount: 2,
  boardGroup: {
    id: 9001,
    name: 'HALT-HASS 演示电路板组',
    boards: [
      { id: 900101, name: '控制主板 A', code: 'HH-A' },
      { id: 900102, name: '采集子板 B', code: 'HH-B' },
    ],
  },
  process: {
    id: -9001,
    name: 'HALT-HASS 演示工艺',
    version: '1.0.0-demo',
  },
  scannedBoards: [],
  feedbackReason: '',
  remark: '用于本地验证排程、扫码、下载工艺、运行流程图和上传报告的模拟工单。',
  createdAt: new Date().toISOString(),
  scheduledStartAt: null,
  scheduledEndAt: null,
}

export const MOCK_HALT_HASS_PROCESS: HaltHassProcessJson = {
  metadata: {
    name: 'HALT-HASS 演示工艺',
    version: '1.0.0-demo',
    boardGroup: [{ id: 9001, name: 'HALT-HASS 演示电路板组' }],
    description: '本工艺用于无后端/无硬件环境下验证 HALT-HASS 测试全流程。',
    createdBy: '系统演示',
  },
  installGuide: {
    steps: [
      {
        id: 1,
        title: '检查样件与线缆',
        content: '确认两块演示电路板序列号已记录，连接线缆无松动，测试夹具固定可靠。',
        images: [],
      },
      {
        id: 2,
        title: '连接测试系统',
        content: '将样件接入 HALT-HASS 测试系统，确认电源、通信和采集链路处于可用状态。',
        images: [],
      },
      {
        id: 3,
        title: '开始演示测试',
        content: '确认安装检查完成后，进入流程图运行阶段并执行模拟节点。',
        images: [],
      },
    ],
  },
  flowchart: {
    nodes: [
      {
        id: 'demo-thermal-ramp',
        type: 'default',
        position: { x: 120, y: 120 },
        data: {
          id: 'demo-thermal-ramp',
          label: '温度阶跃模拟',
          type: 'SIMULATION',
          func: 'demoThermalRamp',
          path: 'mock/halt-hass/demoThermalRamp',
          ctrls: {},
        },
      },
      {
        id: 'demo-vibration-hold',
        type: 'default',
        position: { x: 360, y: 120 },
        data: {
          id: 'demo-vibration-hold',
          label: '振动保持模拟',
          type: 'SIMULATION',
          func: 'demoVibrationHold',
          path: 'mock/halt-hass/demoVibrationHold',
          ctrls: {},
        },
      },
      {
        id: 'demo-result-check',
        type: 'default',
        position: { x: 600, y: 120 },
        data: {
          id: 'demo-result-check',
          label: '结果判定模拟',
          type: 'SIMULATION',
          func: 'demoResultCheck',
          path: 'mock/halt-hass/demoResultCheck',
          ctrls: {},
        },
      },
    ],
    edges: [
      {
        id: 'demo-edge-1',
        source: 'demo-thermal-ramp',
        target: 'demo-vibration-hold',
      },
      {
        id: 'demo-edge-2',
        source: 'demo-vibration-hold',
        target: 'demo-result-check',
      },
    ],
    observeBlocks: ['demo-result-check'],
    runSettings: {
      nodeDelay: 0,
      maximumRuntime: 3000,
      maximumConcurrentWorkers: 1,
    },
  },
}

export function isMockHaltHassOrder(order: HaltHassOrder | null | undefined): boolean {
  return order?.id === MOCK_HALT_HASS_ORDER_ID
}

export function isMockHaltHassOrderId(orderId: number | null | undefined): boolean {
  return orderId === MOCK_HALT_HASS_ORDER_ID
}

export function getMockScannedBoards(_order = MOCK_HALT_HASS_ORDER): ScannedBoard[] {
  return [
    {
      serial: 'HH-A-0001',
      boardModelId: 900101,
      boardModelName: '控制主板 A',
      scannedAt: new Date(),
    },
    {
      serial: 'HH-B-0002',
      boardModelId: 900102,
      boardModelName: '采集子板 B',
      scannedAt: new Date(),
    },
  ]
}
