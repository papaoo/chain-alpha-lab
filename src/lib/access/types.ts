export type AccessRoleId = "admin" | "researcher" | "viewer";

export type PermissionKey =
  | "reports:read"
  | "analysis:run"
  | "selection:run"
  | "tracking:manage"
  | "portfolio:manage"
  | "settings:manage"
  | "dataSources:manage"
  | "users:manage"
  | "audit:read";

export interface PermissionDefinition {
  key: PermissionKey;
  label: string;
  description: string;
}

export interface RoleDefinition {
  id: AccessRoleId;
  name: string;
  description: string;
  permissions: PermissionKey[];
}

export interface AccessControlPlan {
  roles: RoleDefinition[];
  permissions: PermissionDefinition[];
  auditEventTypes: Array<{
    key: string;
    label: string;
    description: string;
  }>;
}
