import type { AccessControlPlan, PermissionDefinition, RoleDefinition } from "@/lib/access/types";

export const PERMISSIONS: PermissionDefinition[] = [
  { key: "reports:read", label: "查看研报", description: "查看主线报告、策略选股结果和历史记录。" },
  { key: "analysis:run", label: "运行分析", description: "手动触发今日分析、主线研判和规则计算。" },
  { key: "selection:run", label: "运行选股", description: "运行多策略选股任务并保存结果。" },
  { key: "tracking:manage", label: "管理追踪", description: "创建、调整和关闭个股追踪任务。" },
  { key: "portfolio:manage", label: "管理模拟持仓", description: "记录模拟买入、卖出、仓位变化和复盘结果。" },
  { key: "settings:manage", label: "管理配置", description: "维护模型、通知、定时任务和系统开关。" },
  { key: "dataSources:manage", label: "管理数据源", description: "维护 Tushare、东方财富、westock 等数据源配置。" },
  { key: "users:manage", label: "管理用户", description: "管理用户、角色、风险偏好和权限分配。" },
  { key: "audit:read", label: "查看审计", description: "查看模型反馈、配置变更和关键操作留痕。" }
];

export const ROLES: RoleDefinition[] = [
  {
    id: "admin",
    name: "管理员",
    description: "负责系统配置、数据源、用户权限和所有报告查看。适合系统拥有者。",
    permissions: PERMISSIONS.map((permission) => permission.key)
  },
  {
    id: "researcher",
    name: "投研用户",
    description: "可以运行分析、策略选股、个股追踪和模拟持仓，但不能管理用户和系统级密钥。",
    permissions: ["reports:read", "analysis:run", "selection:run", "tracking:manage", "portfolio:manage", "audit:read"]
  },
  {
    id: "viewer",
    name: "只读观察者",
    description: "只能查看报告和审计摘要，不能触发分析、修改配置或创建追踪。",
    permissions: ["reports:read", "audit:read"]
  }
];

export function getAccessControlPlan(): AccessControlPlan {
  return {
    roles: ROLES,
    permissions: PERMISSIONS,
    auditEventTypes: [
      { key: "analysis.run", label: "运行分析", description: "记录触发人、时间、参数、数据源状态和报告 ID。" },
      { key: "selection.run", label: "运行选股", description: "记录策略、参数、候选池数量、最终精选和模型消耗。" },
      { key: "tracking.create", label: "创建追踪", description: "记录来源报告、股票、入场条件、失效条件和仓位上限。" },
      { key: "settings.update", label: "修改配置", description: "记录配置项、修改人、修改时间，密钥字段只记录脱敏状态。" },
      { key: "role.update", label: "调整权限", description: "记录用户角色变化和权限差异。" }
    ]
  };
}
