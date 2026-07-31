/** 仪器型号参数（与原型 TOOL_PARAMS 对齐） */
export const TOOL_PARAMS = {
  "475": {
    displayName: "475DWPR",
    hole: 152,
    hiWell: "F1",
    loWell: "K1",
    hiApi: 264.5,
    loApi: 11.8,
    kcMin: 3.5,
    kcMax: 5.5,
    loRef: [1, 3] as const,
    hiRef: [20, 60] as const
  },
  "675": {
    displayName: "675DWPR",
    hole: 216,
    hiWell: "F5",
    loWell: "K5",
    hiApi: 242.3,
    loApi: 13.3,
    kcMin: 5.5,
    kcMax: 7.5,
    loRef: [1, 3] as const,
    hiRef: [20, 50] as const
  },
  "800": {
    displayName: "800DWPR",
    hole: 216,
    hiWell: "F5",
    loWell: "K5",
    hiApi: 242.3,
    loApi: 13.3,
    kcMin: 5.5,
    kcMax: 7.5,
    loRef: [1, 3] as const,
    hiRef: [20, 50] as const
  },
  WAGR: {
    displayName: "475伽马短节",
    hole: 152,
    dualSensor: true,
    hiWell: "F1",
    loWell: "K1",
    hiApi: 264.5,
    loApi: 11.8,
    kcMin: 3.5,
    kcMax: 5.5,
    loRef: [1, 3] as const,
    hiRef: [30, 50] as const
  },
  IDMP475: {
    displayName: "475IDMP2.0",
    hole: 152,
    hiWell: "F1",
    loWell: "K1",
    hiApi: 264.5,
    loApi: 11.8,
    kcMin: 3.5,
    kcMax: 5.5,
    loRef: [1, 3] as const,
    hiRef: [20, 60] as const
  },
  IDMP675: {
    displayName: "675IDMP2.0",
    hole: 216,
    hiWell: "F5",
    loWell: "K5",
    hiApi: 242.3,
    loApi: 13.3,
    kcMin: 5.5,
    kcMax: 7.5,
    loRef: [1, 3] as const,
    hiRef: [20, 50] as const
  },
  IDMP800: {
    displayName: "800IDMP2.0",
    hole: 311,
    hiWell: "F7",
    loWell: "K7",
    hiApi: 213.4,
    loApi: 13.0,
    kcMin: 7.5,
    kcMax: 10.5,
    loRef: [1, 3] as const,
    hiRef: [15, 40] as const
  }
} as const

export type ToolType = keyof typeof TOOL_PARAMS

export const TOOL_TYPE_OPTIONS = Object.entries(TOOL_PARAMS).map(([value, cfg]) => ({
  value,
  label: cfg.displayName
}))

export function getToolDisplayName(type: string) {
  return TOOL_PARAMS[type as ToolType]?.displayName ?? type
}

export function getToolDefaults(type: string) {
  const cfg = TOOL_PARAMS[type as ToolType]
  if (!cfg) {
    return { hiWell: "", loWell: "", hiApi: null, loApi: null }
  }
  return {
    hiWell: cfg.hiWell,
    loWell: cfg.loWell,
    hiApi: cfg.hiApi,
    loApi: cfg.loApi
  }
}

export function formatRefRange(ref: readonly [number, number]) {
  return `${ref[0]} to ${ref[1]}`
}
