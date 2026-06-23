import { DISCLAIMER } from "@/lib/config";
import {
  SCHEMA_VERSION,
  type CompanyKnowledgeCard,
  type DataCompleteness,
  type Fact,
  type FactPackage,
  type LimitPoolSnapshot,
  type MarketBreadthSnapshot,
  type MarketIndexSnapshot,
  type MarketRuleResult,
  type MarketSessionContext,
  type MarketTimelinePoint,
  type RiskConstraints,
  type SectorCoreStockSnapshot,
  type SectorConstituentSnapshot,
  type SectorRuleResult,
  type SectorSnapshot,
  type CandidateReviewRecord,
  type StockCandidate,
  type StockActivitySnapshot,
  type StockFundFlowSnapshot,
  type StockFundFlowQuality,
  type StockTechnicalSnapshot
} from "@/lib/types";
import type { ParsedCommandResult } from "@/lib/westock/parser";
import {
  buildDataSourceWarningDetails,
  BUY_POINT_STRETCH_LIMIT,
  TREND_STRETCH_LIMIT,
  ZH,
  type BuildRuleInput
} from "@/lib/strategy/support";
import { allTableRows, average, diagnosticsToScoreBreakdown, distancePct, firstRow, firstTableRows, maxDefined, numberValue, pushFact, rowDateKey, rowMap, scoreStatus } from "@/lib/strategy/utils";
import { buildIndexSnapshots } from "@/lib/strategy/marketIndexRules";
import { evaluateMarket } from "@/lib/strategy/marketRules";
import { parseSectors } from "@/lib/strategy/sectorParserRules";
import { evaluateSectors } from "@/lib/strategy/sectorRules";
import { buildCandidates, buildConstraints } from "@/lib/strategy/candidateRules";
import { effectiveTradeDateForSession, inferMarketSessionContext } from "@/lib/market/session";
import { normalizeSectorName, sameSectorName, sectorDisplayName } from "@/lib/sector/normalization";

export function buildFactPackage(input: BuildRuleInput): FactPackage {
  const facts: Fact[] = [];
  const session = input.session ?? inferMarketSessionContext(input.timestamp);
  pushFact(
    facts,
    "session.market.phase",
    "ruleComputed",
    `当前分析时段：${session.phaseLabel}；分析模式：${session.analysisMode}；数据基准：${session.expectedDataBasis}；${session.dataFreshnessHint}`,
    session.phase
  );
  const indices = buildIndexSnapshots(input.marketKlines, facts, input.marketTechnicals ?? null);
  const sectorSnapshots = parseSectors(input.boardOverview, facts, input.sectorConstituents ?? [], input.limitPools ?? []);
  const sectors = evaluateSectors(sectorSnapshots, facts, input.marketTimeline ?? []).slice(0, 5);
  const market = evaluateMarket(indices, sectorSnapshots, sectors, input.hotStocks, input.marketBreadth ?? null, input.limitPools ?? [], facts, session, input.premarket);
  const candidateBuild = buildCandidates(input, session, sectors, market, facts);
  const candidates = candidateBuild.candidates;
  const constraints = buildConstraints(market, candidates);
  const dataSourceWarnings = [...(input.marketTechnicals?.warnings ?? []), ...input.boardOverview.warnings, ...input.hotBoards.warnings, ...input.hotStocks.warnings, ...(input.supplementalWarnings ?? [])];

  return {
    schemaVersion: SCHEMA_VERSION,
    timestamp: input.timestamp,
    tradeDate: effectiveTradeDateForSession(input.timestamp, session),
    session,
    facts,
    dataSource: {
      provider: input.marketBreadth || input.sectorConstituents?.length || input.limitPools?.length ? "腾讯自选股行情数据接口 + 东方财富公开行情接口" : ZH.provider,
      via: input.marketBreadth || input.sectorConstituents?.length || input.limitPools?.length ? "westock-data-skillhub + eastmoney" : "westock-data-skillhub",
      packageVersion: input.packageVersion,
      status: input.boardOverview.status === "failed" || input.marketTechnicals?.status === "failed" || input.supplementalWarnings?.length ? "partial" : "success",
      warnings: dataSourceWarnings,
      warningDetails: buildDataSourceWarningDetails(dataSourceWarnings)
    },
    market: {
      indices,
      breadth: input.marketBreadth ?? undefined,
      marketState: market.marketState,
      ruleScore: market.score,
      facts: market.facts
    },
    premarket: input.premarket,
    sectors,
    candidates,
    candidateReviews: candidateBuild.reviews,
    constraints,
    ruleResult: {
      status: "success",
      market,
      sectors,
      candidates
    },
    disclaimer: DISCLAIMER
  };
}
