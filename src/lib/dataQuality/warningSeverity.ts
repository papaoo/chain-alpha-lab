import type { DataSourceWarningDetail } from "@/lib/types";

export function normalizeDataSourceWarningDetail(detail: DataSourceWarningDetail): DataSourceWarningDetail {
  if (detail.severity !== "risk") return detail;
  if (!isTransientSourceFailure(detail.message)) return detail;
  return {
    ...detail,
    severity: "warning",
    impact: "中影响：上游接口出现瞬时失败；若核心字段已由主源或备用源补齐，结论可用但需留痕。",
    action: "检查数据源稳定性和代理状态；若候选股/大盘核心字段完整，不因单次瞬断废弃整份报告。"
  };
}

export function normalizeDataSourceWarningDetails(details: DataSourceWarningDetail[] = []) {
  return details.map(normalizeDataSourceWarningDetail);
}

export function isTransientSourceFailure(message: string) {
  return /接口请求失败|fetch failed|timeout|超时|网络|解析错误|HTTP/i.test(message)
    && !isCriticalDecisionDatasetFailure(message)
    && !/未取得|未返回|空数据|缺失|未找到/i.test(message);
}

export function isCriticalDecisionDatasetFailure(message: string) {
  return /涨跌停池|涨停池|跌停池|炸板池|全A宽度|市场宽度|指数技术指标|大盘核心指数/i.test(message)
    && /失败|failed|fetch failed|timeout|超时|网络|接口请求失败|未取得|未返回|空数据|缺失/i.test(message);
}
