import { dbAll } from "@/lib/db/client";
import { getAnalysisReport, listAnalysisReports } from "@/lib/db/reports";
import {
  buildCandidatePool,
  buildCandidatePoolDataBasis,
  buildCandidatePoolWarnings,
  normalizeCandidatePoolMode
} from "@/lib/selection/pool-builders";
import { buildFullAScanCandidates } from "@/lib/selection/scan-pool";
import { eastmoneyAdapter } from "@/lib/eastmoney/adapter";
import type { SelectionStrategyId } from "@/lib/selection/types";
import { buildCompleteness, buildKlineSummary, evaluateFundFlowQuality, inferFundFlow, parseFundFlow, parseTechnical } from "@/lib/strategy/stockDataRules";
import { normalizeStockCode } from "@/lib/strategy/candidateUtils";
import { evaluateStockActivity, evaluateTradability } from "@/lib/strategy/stockSignalRules";
import { rowMap } from "@/lib/strategy/utils";
import { westockAdapter } from "@/lib/westock/adapter";
import type { ParsedCommandResult } from "@/lib/westock/parser";
import { buildCompanyKnowledge, buildShareholderMap, latestRowsByCode, rowsByCode } from "@/lib/strategy/companyKnowledge";
import type { StockCandidate } from "@/lib/types";

export type LatestAnalysisReport = NonNullable<ReturnType<typeof getAnalysisReport>>;

export function latestDisplayableReport() {
  const latest = listAnalysisReports(1, 0, { displayableOnly: true })[0];
  return latest ? getAnalysisReport(latest.id, "none") : null;
}

export async function loadCandidatePool(
  latest: LatestAnalysisReport,
  poolMode: string,
  candidatePoolLimit: number,
  strategyId?: SelectionStrategyId
) {
  const normalizedMode = normalizeCandidatePoolMode(poolMode);
  const latestCandidates = latest.factPackage.candidates;
  if (normalizedMode === "latest_report") {
    const candidates = latestCandidates.slice(0, candidatePoolLimit);
    return {
      candidates,
      warnings: [] as string[],
      dataBasis: buildCandidatePoolDataBasis(
        latest.id,
        {
          latestReportCount: latestCandidates.length,
          recentSnapshotCount: 0,
          fullAScanCount: 0,
          duplicateCount: 0,
          staleSkippedCount: 0,
          parseErrorCount: 0,
          rankedMode: normalizedMode
        },
        candidates.length,
        strategyId
      )
    };
  }

  const rows = dbAll<{ code: string; createdAt: string; rawJson: string }>(
    `select code, createdAt, rawJson
       from stock_signal_snapshots
       order by createdAt desc
       limit ?`,
    [Math.min(Math.max(candidatePoolLimit * 8, 100), 1200)],
    { label: "stock_signal_snapshots.recent_candidate_pool" }
  );

  const cutoff = Date.now() - 21 * 86_400_000;
  const recentCandidates: StockCandidate[] = [];
  let staleCount = 0;
  let parseErrorCount = 0;
  for (const row of rows) {
    const createdAt = new Date(row.createdAt).getTime();
    if (Number.isFinite(createdAt) && createdAt < cutoff) {
      staleCount += 1;
      continue;
    }
    try {
      recentCandidates.push(JSON.parse(row.rawJson) as StockCandidate);
    } catch {
      parseErrorCount += 1;
    }
  }

  const fullAScan = normalizedMode === "full_a_scan" || normalizedMode === "hybrid_full_a"
    ? await buildFullAScanCandidates({
        strategyId,
        limit: Math.min(Math.max(candidatePoolLimit * 2, candidatePoolLimit), 1000),
        scanLimit: Math.min(Math.max(candidatePoolLimit * 8, 800), 5000),
        sectors: latest.factPackage.sectors
      }).catch((error) => ({
        candidates: [],
        warnings: [`全 A 扫描失败：${error instanceof Error ? error.message : String(error)}`],
        fetchedAt: new Date().toISOString(),
        rawCount: 0
      }))
    : { candidates: [] as StockCandidate[], warnings: [] as string[], fetchedAt: "", rawCount: 0 };

  const { candidates, stats } = buildCandidatePool({
    latestCandidates,
    recentCandidates,
    fullACandidates: fullAScan.candidates,
    sectors: latest.factPackage.sectors,
    strategyId,
    poolMode: normalizedMode,
    candidatePoolLimit,
    staleSkippedCount: staleCount,
    parseErrorCount
  });

  return {
    candidates,
    warnings: [...buildCandidatePoolWarnings(stats, strategyId), ...fullAScan.warnings],
    dataBasis: buildCandidatePoolDataBasis(latest.id, stats, candidates.length, strategyId)
  };
}

export async function refreshCandidatePool(candidates: StockCandidate[], refreshLimit: number, warnings: string[]) {
  const refreshCodes = candidates.slice(0, Math.max(0, refreshLimit)).map((candidate) => candidate.code);
  if (!refreshCodes.length) return candidates;

  const [stockQuotes, stockKlines, stockTechnicals, stockFundFlows, westockCompanyKnowledge] = await Promise.all([
    eastmoneyAdapter.getStockQuotes(refreshCodes, { timeoutMs: 30000, retries: 1 }).catch((error) => {
      warnings.push(`选股候选池最新盘口刷新失败：${error instanceof Error ? error.message : String(error)}`);
      return null;
    }),
    westockAdapter.getStockKlines(refreshCodes, 30, { timeoutMs: 120000, retries: 1 }).catch((error) => {
      warnings.push(`选股候选池K线刷新失败：${error instanceof Error ? error.message : String(error)}`);
      return null;
    }),
    westockAdapter.getStockTechnicals(refreshCodes, { timeoutMs: 120000, retries: 1 }).catch((error) => {
      warnings.push(`选股候选池技术指标刷新失败：${error instanceof Error ? error.message : String(error)}`);
      return null;
    }),
    westockAdapter.getStockFundFlows(refreshCodes, { timeoutMs: 120000, retries: 1 }).catch((error) => {
      warnings.push(`选股候选池资金流刷新失败：${error instanceof Error ? error.message : String(error)}`);
      return null;
    }),
    fetchWestockCompanySupplement(refreshCodes, warnings)
  ]);
  const companyProfiles = await mapLimit(refreshCodes, 10, async (code) => {
    const profile = await eastmoneyAdapter.getCompanyProfile(code, { timeoutMs: 30000, retries: 1 }).catch((error) => ({
      data: null,
      warnings: [`选股候选池公司概况刷新失败：${code} ${error instanceof Error ? error.message : String(error)}`]
    }));
    return { code, profile };
  });

  warnings.push(
    `运行前刷新候选池 ${refreshCodes.length} 只：最新盘口 ${stockQuotes?.data?.length ?? 0}/${refreshCodes.length}，K线 ${stockKlines?.status ?? "failed"}，技术 ${stockTechnicals?.status ?? "failed"}，资金 ${stockFundFlows?.status ?? "failed"}。`
  );
  const profileSuccessCount = companyProfiles.filter((item) => item.profile.data).length;
  warnings.push(`运行前补充公司概况 ${profileSuccessCount}/${refreshCodes.length} 只；补不到主营业务的股票仍会保留数据不足或低置信约束。`);
  if (westockCompanyKnowledge) {
    warnings.push(
      `运行前补充财务层数据：profile ${westockCompanyKnowledge.profiles?.status ?? "failed"}，lrb ${westockCompanyKnowledge.income?.status ?? "failed"}，zcfz ${westockCompanyKnowledge.balance?.status ?? "failed"}，xjll ${westockCompanyKnowledge.cashFlow?.status ?? "failed"}，shareholder ${westockCompanyKnowledge.shareholders?.status ?? "failed"}，reserve ${westockCompanyKnowledge.reserves?.status ?? "failed"}。`
    );
  }
  if (candidates.length > refreshCodes.length) {
    warnings.push(`本轮仅使用已刷新前排 ${refreshCodes.length}/${candidates.length} 只参与评分；未刷新股票留在候选沉淀池，不进入本次输出。`);
  }
  warnings.push(
    ...(stockQuotes?.warnings ?? []),
    ...(stockKlines?.warnings ?? []),
    ...(stockTechnicals?.warnings ?? []),
    ...(stockFundFlows?.warnings ?? []),
    ...companyProfiles.flatMap((item) => item.profile.warnings ?? [])
  );

  const quoteRows = new Map((stockQuotes?.data ?? []).map((quote) => [normalizeStockCode(quote.marketCode || quote.code), quote]));
  const klineRows = rowMap(stockKlines, "symbol");
  const technicalRows = rowMap(stockTechnicals);
  const fundRows = rowMap(stockFundFlows);
  const westockProfileRows = rowMap(westockCompanyKnowledge?.profiles);
  const incomeRows = rowsByCode(westockCompanyKnowledge?.income, "SecuCode");
  const balanceRows = rowsByCode(westockCompanyKnowledge?.balance, "SecuCode");
  const cashFlowRows = rowsByCode(westockCompanyKnowledge?.cashFlow, "SecuCode");
  const shareholderRows = buildShareholderMap(westockCompanyKnowledge?.shareholders, refreshCodes);
  const reserveRows = latestRowsByCode(westockCompanyKnowledge?.reserves, "code");
  const profileRows = new Map(companyProfiles
    .filter((item) => item.profile.data)
    .map((item) => [normalizeStockCode(item.code), item.profile.data]));

  return candidates.slice(0, refreshCodes.length).map((candidate) => {
    const quoteRow = quoteRows.get(normalizeStockCode(candidate.code));
    const profileRow = profileRows.get(normalizeStockCode(candidate.code));
    const westockProfile = westockProfileRows.get(candidate.code) ?? westockProfileRows.get(normalizeStockCode(candidate.code));
    const technical = parseTechnical(technicalRows.get(candidate.code)) ?? candidate.technical;
    const fundFlow = parseFundFlow(fundRows.get(candidate.code)) ?? candidate.fundFlow;
    const fundFlowQuality = fundFlow ? evaluateFundFlowQuality(fundFlow) : candidate.fundFlowQuality;
    const fundFlowState = fundFlow ? inferFundFlow(fundFlow, fundFlowQuality) : candidate.fundFlowState;
    const klineSummary = buildKlineSummary(klineRows.get(candidate.code), technical) ?? candidate.klineSummary;
    const latest = quoteRow?.latest ?? klineSummary?.latestClose ?? technical?.closePrice ?? candidate.price ?? candidate.quote?.latest;
    const changePct = quoteRow?.changePct ?? candidate.quote?.changePct;
    const quote = {
      ...candidate.quote,
      latest,
      changePct,
      amount: quoteRow?.amount ?? candidate.quote?.amount,
      volume: quoteRow?.volume ?? candidate.quote?.volume,
      turnoverRate: quoteRow?.turnoverRate ?? candidate.quote?.turnoverRate,
      peTtm: quoteRow?.peDynamic ?? candidate.quote?.peTtm,
      pb: quoteRow?.pb ?? candidate.quote?.pb,
      mainNetInflow: quoteRow?.mainNetInflow ?? fundFlow?.mainNetFlow ?? candidate.quote?.mainNetInflow,
      floatMarketValue: quoteRow?.floatMarketValue ?? candidate.quote?.floatMarketValue
    };
    const tradability = evaluateTradability(changePct);
    const companyKnowledge = buildRefreshedCompanyKnowledge(candidate, westockProfile, profileRow ?? undefined, {
      incomeHistory: incomeRows.get(normalizeStockCode(candidate.code)),
      balanceHistory: balanceRows.get(normalizeStockCode(candidate.code)),
      cashFlowHistory: cashFlowRows.get(normalizeStockCode(candidate.code)),
      shareholder: shareholderRows.get(normalizeStockCode(candidate.code)),
      reserve: reserveRows.get(normalizeStockCode(candidate.code))
    });
    const activity = evaluateStockActivity({
      quote,
      fundFlow,
      fundFlowQuality,
      changePct,
      sectorRank: candidate.activity?.basis.sectorRank,
      maDistance: klineSummary?.maDistance,
      tradability
    });
    const dataCompleteness = buildCompleteness(
      quoteRow ? true : candidate.dataCompleteness.hasHotData,
      Boolean(klineSummary),
      Boolean(technical),
      Boolean(fundFlow),
      candidate.dataCompleteness.hasSectorData || Boolean(profileRow?.industry) || (candidate.sectorName !== "未分类" && candidate.sectorName !== "未知"),
      candidate.dataCompleteness.hasProfileData || Boolean(profileRow?.business || profileRow?.industry),
      companyKnowledge
    );

    return {
      ...candidate,
      price: latest,
      quote,
      technical,
      klineSummary,
      trendState: klineSummary?.trend ?? candidate.trendState,
      fundFlow,
      fundFlowQuality,
      fundFlowState,
      activity,
      tradability,
      dataCompleteness,
      companyKnowledge,
      evidenceRefs: uniqueEvidenceRefs([
        ...candidate.evidenceRefs,
        ...(companyKnowledge.financialSummary ? [`company.${candidate.code}.financial.summary`] : []),
        ...(companyKnowledge.shareholderSummary ? [`company.${candidate.code}.shareholder.summary`] : []),
        ...(companyKnowledge.mainBusiness && companyKnowledge.companyKnowledgeState !== "missing" ? [`company.${candidate.code}.business`] : [])
      ]),
      riskFlags: [
        ...candidate.riskFlags.filter((flag) => !/缺少资金流|缺少K线|缺少技术指标|涨跌幅缺失|盘口/.test(flag)),
        ...(fundFlowQuality?.blockers ?? [])
      ]
    };
  });
}

type CompanyProfileResult = NonNullable<Awaited<ReturnType<typeof eastmoneyAdapter.getCompanyProfile>>["data"]>;

function buildRefreshedCompanyKnowledge(
  candidate: StockCandidate,
  westockProfile: Record<string, unknown> | undefined,
  profile: CompanyProfileResult | undefined,
  supplement: {
    incomeHistory?: Record<string, unknown>[];
    balanceHistory?: Record<string, unknown>[];
    cashFlowHistory?: Record<string, unknown>[];
    shareholder?: ReturnType<typeof buildShareholderMap> extends Map<string, infer T> ? T : never;
    reserve?: Record<string, unknown>;
  }
) {
  const profileRow = westockProfile ?? (profile
    ? {
        code: candidate.code,
        name: profile.name || candidate.name,
        industry: profile.industry,
        business: profile.business || profile.businessScope || profile.orgProfile
      }
    : undefined);
  const hasFinancial = Boolean(supplement.incomeHistory?.length || supplement.balanceHistory?.length || supplement.cashFlowHistory?.length);
  const hasShareholder = Boolean(supplement.shareholder);
  if (profileRow || hasFinancial || hasShareholder || supplement.reserve) {
    const attribution = candidate.mainlineAttribution;
    return buildCompanyKnowledge(candidate.code, candidate.name, profileRow, attribution?.matchedSector ?? candidate.sectorName ?? "unknown", {
      hasSectorMembership: attribution?.status === "direct_constituent",
      hasBusinessMatch: attribution?.status === "business_direct",
      themeMatchType: attribution?.status,
      themeMatchLogic: attribution?.reason,
      ...supplement
    });
  }
  return profile ? mergeCompanyKnowledge(candidate, profile) : candidate.companyKnowledge;
}

function mergeCompanyKnowledge(candidate: StockCandidate, profile: CompanyProfileResult) {
  const business = profile.business || profile.businessScope || profile.orgProfile || candidate.companyKnowledge.mainBusiness;
  const industry = profile.industry || candidate.companyKnowledge.industry;
  const hasBusiness = Boolean(profile.business || profile.businessScope || profile.orgProfile);
  return {
    ...candidate.companyKnowledge,
    code: candidate.code,
    name: profile.name || candidate.name,
    industry: industry || "未知行业",
    mainBusiness: business || "主营业务待补充",
    coreBusiness: profile.business || candidate.companyKnowledge.coreBusiness || business || "核心业务待补充",
    productsOrServices: profile.mainProducts?.length ? profile.mainProducts : candidate.companyKnowledge.productsOrServices,
    oneLineUnderstanding: hasBusiness
      ? `${profile.name || candidate.name}：${business}`
      : candidate.companyKnowledge.oneLineUnderstanding,
    fundamentalRisks: hasBusiness
      ? candidate.companyKnowledge.fundamentalRisks.filter((risk) => !risk.includes("主营") && !risk.includes("公司基础"))
      : candidate.companyKnowledge.fundamentalRisks,
    companyKnowledgeState: hasBusiness ? "sufficient" as const : "partial" as const,
    longTermLogicAllowed: hasBusiness ? candidate.companyKnowledge.longTermLogicAllowed : false,
    missingFields: hasBusiness
      ? candidate.companyKnowledge.missingFields.filter((field) => !["主营业务", "公司概况"].includes(field))
      : Array.from(new Set([...candidate.companyKnowledge.missingFields, "主营业务"]))
  };
}

function uniqueEvidenceRefs(refs: string[]) {
  return Array.from(new Set(refs.filter(Boolean))).slice(0, 20);
}

async function fetchWestockCompanySupplement(codes: string[], warnings: string[]) {
  const codeList = codes.join(",");
  const runSafe = async (label: string, command: Parameters<typeof westockAdapter.run>[0], args: string[]) => {
    const result = await westockAdapter.run(command, args, { timeoutMs: 180000, retries: 1 }).catch((error) => {
      warnings.push(`选股候选池 ${label} 补数失败：${error instanceof Error ? error.message : String(error)}`);
      return null;
    });
    if (result?.warnings?.length) {
      warnings.push(...result.warnings.map((warning) => `${label}: ${warning}`));
    }
    return result;
  };

  const [profiles, income, balance, cashFlow, shareholders, reserves] = await Promise.all([
    runSafe("profile", "profile", [codeList]),
    runSafe("finance/lrb", "finance", [codeList, "--type", "lrb", "--num", "4"]),
    runSafe("finance/zcfz", "finance", [codeList, "--type", "zcfz", "--num", "4"]),
    runSafe("finance/xjll", "finance", [codeList, "--type", "xjll", "--num", "4"]),
    runSafe("shareholder", "shareholder", [codeList]),
    runSafe("reserve", "reserve", [codeList])
  ]);

  return { profiles, income, balance, cashFlow, shareholders, reserves };
}

async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>) {
  const results: R[] = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}
