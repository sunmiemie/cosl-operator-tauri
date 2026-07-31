/** 报告状态筛选项（客户端） */
export const REPORT_STATUS_OPTIONS = [
  { label: "草稿", value: "draft" },
  { label: "待审核", value: "pending" },
  { label: "已通过", value: "approved" },
  { label: "已驳回", value: "rejected" }
] as const

export const APPENDIX_TABS = [
  { key: "appA", label: "附录A · 伽马刻度工单" },
  { key: "appB", label: "附录B · 测试记录表" },
  { key: "appC", label: "附录C · 刻度井记录表" }
] as const
