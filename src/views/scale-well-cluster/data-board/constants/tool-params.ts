/** 仪器型号参数（与原型 TOOL_PARAMS 对齐，供看板展示使用） */
export const TOOL_PARAMS = {
  "475": { kcMin: 3.5, kcMax: 5.5, displayName: "475DWPR" },
  "675": { kcMin: 5.5, kcMax: 7.5, displayName: "675DWPR" },
  "800": { kcMin: 5.5, kcMax: 7.5, displayName: "800DWPR" },
  WAGR: { kcMin: 3.5, kcMax: 5.5, displayName: "475伽马短节" },
  IDMP475: { kcMin: 3.5, kcMax: 5.5, displayName: "475IDMP2.0" },
  IDMP675: { kcMin: 5.5, kcMax: 7.5, displayName: "675IDMP2.0" },
  IDMP800: { kcMin: 7.5, kcMax: 10.5, displayName: "800IDMP2.0" }
} as const

export type ToolType = keyof typeof TOOL_PARAMS

export function getToolDisplayName(type: string) {
  return TOOL_PARAMS[type as ToolType]?.displayName ?? `DWPR${type}`
}
