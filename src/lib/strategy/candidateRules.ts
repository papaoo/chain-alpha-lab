import type { CandidateReviewRecord, Fact, MarketRuleResult, MarketSessionContext, SectorRuleResult, StockCandidate } from "@/lib/types";
import { type BuildRuleInput } from "@/lib/strategy/support";
import { pushFact, rowMapByNormalizedCode } from "@/lib/strategy/utils";
import { compareCandidateSignalQuality } from "@/lib/strategy/candidateSignalQuality";
import { buildCandidateSourceRows, buildSectorMembershipIndex } from "@/lib/strategy/candidateSources";
import { buildShareholderMap, latestRowsByCode, rowsByCode } from "@/lib/strategy/companyKnowledge";
import { buildCandidateReviewRecord } from "@/lib/strategy/candidateReviewRules";
import { evaluateCandidateRow } from "@/lib/strategy/candidateEvaluationRules";

export function buildCandidates(input: BuildRuleInput, session: MarketSessionContext, sectors: SectorRuleResult[], market: MarketRuleResult, facts: Fact[]): { candidates: StockCandidate[]; reviews: CandidateReviewRecord[] } {
  const candidateRows = buildCandidateSourceRows(input.hotStocks, input.sectorConstituents ?? [], sectors, facts).slice(0, 40);
  const technicalRows = rowMapByNormalizedCode(input.stockTechnicals, ["code"]);
  const fundRows = rowMapByNormalizedCode(input.stockFundFlows, ["code", "SecuCode"]);
  const profileRows = rowMapByNormalizedCode(input.stockProfiles, ["code", "symbol"]);
  const klineRows = rowMapByNormalizedCode(input.stockKlines, ["symbol", "code"]);
  const incomeRows = rowsByCode(input.stockIncomeStatements, "symbol");
  const balanceRows = rowsByCode(input.stockBalanceSheets, "symbol");
  const cashFlowRows = rowsByCode(input.stockCashFlows, "symbol");
  const shareholderRows = buildShareholderMap(input.stockShareholders, candidateRows.map((row) => String(row.code ?? "")));
  const reserveRows = latestRowsByCode(input.stockReserves, "code");
  const sectorMembership = buildSectorMembershipIndex(input.sectorConstituents ?? [], sectors, facts);

  const evaluatedCandidates = candidateRows
    .filter((row) => String(row.stock_type ?? "").includes("GP-A"))
    .filter((row) => !String(row.name ?? "").includes("ST"))
    .map((row, index) => evaluateCandidateRow(row, index, {
      session,
      sectors,
      market,
      facts,
      technicalRows,
      fundRows,
      profileRows,
      klineRows,
      incomeRows,
      balanceRows,
      cashFlowRows,
      shareholderRows,
      reserveRows,
      sectorMembership
    }));

  const reviews = evaluatedCandidates
    .filter((candidate) => !candidate.dataCompleteness.hasSectorData)
    .map((candidate) => {
      pushFact(
        facts,
        `rule.stock.${candidate.code}.candidate_excluded`,
        "ruleComputed",
        `${candidate.name} 未进入候选股信号表：${candidate.mainlineAttribution?.reason ?? "缺少当前主线成分股或主营业务匹配证据"}。证据：${candidate.mainlineAttribution?.evidence.join("；") || "无"}；阻断：${candidate.mainlineAttribution?.blockers.join("；") || "无"}。`,
        false
      );
      return buildCandidateReviewRecord(candidate);
    });

  const candidates = evaluatedCandidates
    .filter((candidate) => candidate.dataCompleteness.hasSectorData)
    .sort(compareCandidateSignalQuality);

  return { candidates, reviews };
}

export { buildConstraints } from "@/lib/strategy/candidateReviewRules";
