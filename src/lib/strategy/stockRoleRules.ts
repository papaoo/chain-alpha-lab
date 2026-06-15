import type { SectorRuleResult, StockCandidate } from "@/lib/types";
import { ZH } from "@/lib/strategy/support";
import { numberValue } from "@/lib/strategy/utils";
import { normalizeStockCode } from "@/lib/strategy/candidateUtils";

export function inferCandidateRole(
  code: string,
  row: Record<string, unknown>,
  sector: SectorRuleResult | undefined,
  fallbackIndex: number
): StockCandidate["role"] {
  const normalizedCode = normalizeStockCode(code);
  const core = sector?.coreStocks.find((stock) => normalizeStockCode(stock.marketCode || stock.code) === normalizedCode);
  if (core?.role) return core.role;

  const source = String(row.source ?? "");
  const sectorRank = numberValue(row.sectorRank);
  if (source === "sector_constituent" && sectorRank !== undefined) {
    if (sectorRank === 0) return ZH.core;
    if (sectorRank <= 2) return ZH.core;
    if (sector?.stage === ZH.accelerating || sector?.stage === ZH.confirmed) return ZH.catchUp;
    return ZH.dipWatch;
  }

  if (source === "hot_stock_mainline_member") {
    if (fallbackIndex <= 1) return ZH.core;
    return sector?.stage === ZH.accelerating ? ZH.catchUp : ZH.dipWatch;
  }

  if (!sector) return "unknown";
  if (sector.stage === ZH.accelerating && fallbackIndex <= 4) return ZH.catchUp;
  return ZH.dipWatch;
}

export function buildRoleReason(code: string, row: Record<string, unknown>, sector: SectorRuleResult | undefined, fallbackIndex: number) {
  const normalizedCode = normalizeStockCode(code);
  const core = sector?.coreStocks.find((stock) => normalizeStockCode(stock.marketCode || stock.code) === normalizedCode);
  if (core) {
    return `命中主线 ${sector?.name ?? "未知"} 核心股列表，核心角色为${core.role}，核心评分${core.score}/100。`;
  }
  const source = String(row.source ?? "");
  const sectorRank = numberValue(row.sectorRank);
  if (source === "sector_constituent" && sectorRank !== undefined) {
    return `来自主线 ${String(row.sectorName ?? sector?.name ?? "未知")} 成分股涨幅/成交额前排，板块内排名第${sectorRank + 1}。`;
  }
  if (source === "hot_stock_mainline_member") {
    return "来自热门股且同时具备当前主线成分股证据，但未命中核心股列表，按前排观察定位。";
  }
  if (source === "hot_stock") {
    return "来自热门股，依赖主营业务直接匹配主线，未命中成分前排或核心股列表，默认低吸观察。";
  }
  return `未命中核心股列表，按候选序号${fallbackIndex + 1}和主线阶段保守定位。`;
}
