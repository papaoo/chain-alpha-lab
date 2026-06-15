export const ACTIVE_DATABASE_PROVIDER = "sqlite" as const;

export type ConfiguredDatabaseProvider = "sqlite" | "postgres" | string;

export function getConfiguredDatabaseProvider(): ConfiguredDatabaseProvider {
  const raw = process.env.DATABASE_PROVIDER?.trim().toLowerCase();
  return raw || ACTIVE_DATABASE_PROVIDER;
}

export function assertActiveDatabaseProvider() {
  const configuredProvider = getConfiguredDatabaseProvider();
  if (configuredProvider !== ACTIVE_DATABASE_PROVIDER) {
    throw new Error(
      `DATABASE_PROVIDER=${configuredProvider} 已配置，但当前运行时只实现 SQLite。` +
      "请先完成 PostgreSQL client、schema migration 和迁移对账脚本，再切换数据库运行时。"
    );
  }
}
