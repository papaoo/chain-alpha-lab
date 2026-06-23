import { dbAll } from "@/lib/db/client";
import { getAnalysisReport, listAnalysisReports } from "@/lib/db/reports";
import {
  buildCandidatePool,
  buildCandidatePoolDataBasis,
  buildCandidatePoolWarnings,
  normalizeCandidatePoolMode
} from "@/lib/selection/pool-builders";
import { buildFullAScanCandidates } from "@/lib/selection/scan-pool";
import { candidateDataHydrator, type CandidateCompanyProfileResult } from "@/lib/data/candidateDataHydrator";
import type { StockRealtimeSnapshot } from "@/lib/data/stockSnapshotGateway";
import type { SelectionStrategyId } from "@/lib/selection/types";
import { buildCompleteness, buildKlineSummary, evaluateFundFlowQuality, inferFundFlow, parseFundFlow, parseTechnical } from "@/lib/strategy/stockDataRules";
import { normalizeStockCode } from "@/lib/strategy/candidateUtils";
import { evaluateStockActivity, evaluateTradability } from "@/lib/strategy/stockSignalRules";
import { distancePct } from "@/lib/strategy/utils";
import { buildCompanyKnowledge, buildShareholderMap } from "@/lib/strategy/companyKnowledge";
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

  const hydration = await candidateDataHydrator.hydrateRuntime(refreshCodes, warnings);
  warnings.push(...hydration.notes);
  if (candidates.length > refreshCodes.length) {
    warnings.push(`本轮仅使用已刷新前排 ${refreshCodes.length}/${candidates.length} 只参与评分；未刷新股票留在候选沉淀池，不进入本次输出。`);
  }
  const {
    refreshedAt,
    realtimeSnapshots,
    maps: {
      quoteRows,
      klineRows,
      technicalRows,
      fundRows,
      westockProfileRows,
      incomeRows,
      balanceRows,
      cashFlowRows,
      shareholderRows,
      reserveRows,
      profileRows
    }
  } = hydration;

  return candidates.slice(0, refreshCodes.length).map((candidate) => {
    const normalizedCode = normalizeStockCode(candidate.code);
    const snapshot = realtimeSnapshots[normalizedCode];
    const quoteRow = quoteRows.get(normalizedCode);
    const profileRow = profileRows.get(normalizeStockCode(candidate.code));
    const westockProfile = westockProfileRows.get(candidate.code) ?? westockProfileRows.get(normalizeStockCode(candidate.code));
    const technical = snapshot?.technical ?? parseTechnical(technicalRows.get(candidate.code)) ?? candidate.technical;
    const fundFlow = snapshot?.fundFlow ?? parseFundFlow(fundRows.get(candidate.code)) ?? candidate.fundFlow;
    const fundFlowQuality = fundFlow ? evaluateFundFlowQuality(fundFlow) : candidate.fundFlowQuality;
    const fundFlowState = snapshot?.fundFlowState ?? (fundFlow ? inferFundFlow(fundFlow, fundFlowQuality) : candidate.fundFlowState);
    const klineSummary = buildKlineSummaryFromSnapshot(snapshot, candidate)
      ?? buildKlineSummary(klineRows.get(candidate.code), technical)
      ?? candidate.klineSummary;
    const latest = snapshot?.latestPrice ?? quoteRow?.latest ?? klineSummary?.latestClose ?? technical?.closePrice ?? candidate.price ?? candidate.quote?.latest;
    const changePct = snapshot?.changePct ?? quoteRow?.changePct ?? candidate.quote?.changePct;
    const quote = {
      ...candidate.quote,
      latest,
      changePct,
      amount: snapshot?.amount ?? quoteRow?.amount ?? candidate.quote?.amount,
      volume: quoteRow?.volume ?? candidate.quote?.volume,
      turnoverRate: snapshot?.turnoverRate ?? quoteRow?.turnoverRate ?? candidate.quote?.turnoverRate,
      peTtm: quoteRow?.peDynamic ?? candidate.quote?.peTtm,
      pb: quoteRow?.pb ?? candidate.quote?.pb,
      mainNetInflow: snapshot?.mainNetInflow ?? quoteRow?.mainNetInflow ?? fundFlow?.mainNetFlow ?? candidate.quote?.mainNetInflow,
      floatMarketValue: quoteRow?.floatMarketValue ?? candidate.quote?.floatMarketValue,
      fetchedAt: snapshot?.fetchedAt ?? (quoteRow ? refreshedAt : candidate.quote?.fetchedAt),
      quoteUpdatedAt: snapshot?.quoteUpdatedAt ?? snapshot?.raw?.quoteUpdatedAt ?? candidate.quote?.quoteUpdatedAt,
      source: snapshot ? `unified-stock-snapshot:${snapshot.source}` : quoteRow ? "eastmoney.runtime_quote" : candidate.quote?.source
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
      snapshot?.coverage.quote || quoteRow ? true : candidate.dataCompleteness.hasHotData,
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
      sourceTraces: buildSelectionRefreshTraces(candidate, {
        refreshedAt,
        snapshot,
        quote: Boolean(snapshot?.coverage.quote || quoteRow),
        kline: Boolean(snapshot?.coverage.kline || (klineSummary && klineSummary !== candidate.klineSummary)),
        technical: Boolean(snapshot?.coverage.technical || (technical && technical !== candidate.technical)),
        fundFlow: Boolean(snapshot?.coverage.fundFlow || (fundFlow && fundFlow !== candidate.fundFlow)),
        company: Boolean(profileRow || westockProfile || companyKnowledge.financialSummary || companyKnowledge.shareholderSummary)
      }),
      riskFlags: [
        ...candidate.riskFlags.filter((flag) => !/缺少资金流|缺少K线|缺少技术指标|涨跌幅缺失|盘口/.test(flag)),
        ...(fundFlowQuality?.blockers ?? [])
      ]
    };
  });
}

function buildRefreshedCompanyKnowledge(
  candidate: StockCandidate,
  westockProfile: Record<string, unknown> | undefined,
  profile: CandidateCompanyProfileResult | undefined,
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

function mergeCompanyKnowledge(candidate: StockCandidate, profile: CandidateCompanyProfileResult) {
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

function buildKlineSummaryFromSnapshot(snapshot: StockRealtimeSnapshot | undefined, candidate: StockCandidate): StockCandidate["klineSummary"] | undefined {
  if (!snapshot?.technical && !snapshot?.latestPrice) return undefined;
  const technical = snapshot.technical;
  return {
    period: "day",
    limit: 80,
    latestClose: snapshot.latestPrice ?? technical?.closePrice,
    maDistance: technical?.closePrice
      ? {
          ma5: distancePct(technical.closePrice, technical.ma5),
          ma10: distancePct(technical.closePrice, technical.ma10),
          ma20: distancePct(technical.closePrice, technical.ma20),
          ma60: distancePct(technical.closePrice, technical.ma60)
        }
      : candidate.klineSummary?.maDistance,
    trend: snapshot.trendState ?? candidate.klineSummary?.trend ?? candidate.trendState,
    volumePrice: `统一快照：成交额 ${snapshot.amount ?? "缺失"}，换手 ${snapshot.turnoverRate ?? "缺失"}，质量 ${snapshot.qualityLabel}`
  };
}

function buildSelectionRefreshTraces(
  candidate: StockCandidate,
  refreshed: {
    refreshedAt: string;
    snapshot?: StockRealtimeSnapshot;
    quote: boolean;
    kline: boolean;
    technical: boolean;
    fundFlow: boolean;
    company: boolean;
  }
) {
  return [
    ...(candidate.sourceTraces ?? []),
    {
      id: `selection.runtime.unifiedSnapshot.${candidate.code}`,
      scope: "stock" as const,
      subjectCode: candidate.code,
      subjectName: candidate.name,
      field: "selection.runtime.unifiedSnapshot",
      provider: "eastmoney_public" as const,
      providerName: "统一个股快照（东方财富报价 + westock/Tushare 兜底）",
      accessPath: "fetchStockRealtimeSnapshots",
      sourceLabel: "运行前统一快照刷新",
      fetchedAt: refreshed.snapshot?.fetchedAt,
      quality: refreshed.snapshot && refreshed.snapshot.quality !== "missing" ? "primary" as const : "missing" as const,
      freshness: refreshed.snapshot?.quoteUpdatedAt ? "delayed" as const : "unknown" as const,
      metadata: refreshed.snapshot
        ? {
            latestKlineDate: refreshed.snapshot.raw?.latestKlineDate,
            expectedKlineDate: refreshed.snapshot.raw?.expectedKlineDate,
            klineFreshnessStatus: refreshed.snapshot.raw?.klineFreshnessStatus,
            klineClose: refreshed.snapshot.technical?.closePrice,
            quoteUpdatedAt: refreshed.snapshot.quoteUpdatedAt ?? refreshed.snapshot.raw?.quoteUpdatedAt
          }
        : undefined,
      warning: refreshed.snapshot
        ? refreshed.snapshot.warnings.slice(0, 2).join("；") || undefined
        : "本次选股运行前未取得统一行情快照，保留旧链路补数结果。"
    },
    {
      id: `selection.runtime.quote.${candidate.code}`,
      scope: "stock" as const,
      subjectCode: candidate.code,
      subjectName: candidate.name,
      field: "selection.runtime.quote",
      provider: "eastmoney_public" as const,
      providerName: "东方财富公开行情",
      accessPath: "eastmoneyAdapter.getStockQuotes",
      sourceLabel: "运行前盘口刷新",
      fetchedAt: refreshed.quote ? refreshed.refreshedAt : undefined,
      quality: refreshed.quote ? "primary" as const : "missing" as const,
      freshness: refreshed.quote ? "delayed" as const : "unknown" as const,
      warning: refreshed.quote ? undefined : "本次选股运行前未取得最新盘口，保留报告快照。"
    },
    {
      id: `selection.runtime.kline.${candidate.code}`,
      scope: "stock" as const,
      subjectCode: candidate.code,
      subjectName: candidate.name,
      field: "selection.runtime.kline",
      provider: "tencent_zixuangu" as const,
      providerName: "腾讯自选股行情数据接口",
      accessPath: "westockAdapter.getStockKlines",
      sourceLabel: "运行前K线刷新",
      fetchedAt: refreshed.kline ? refreshed.refreshedAt : undefined,
      quality: refreshed.kline ? "primary" as const : "missing" as const,
      freshness: refreshed.kline ? "delayed" as const : "unknown" as const,
      metadata: refreshed.snapshot
        ? {
            latestKlineDate: refreshed.snapshot.raw?.latestKlineDate,
            expectedKlineDate: refreshed.snapshot.raw?.expectedKlineDate,
            klineFreshnessStatus: refreshed.snapshot.raw?.klineFreshnessStatus,
            klineClose: refreshed.snapshot.technical?.closePrice
          }
        : undefined,
      warning: refreshed.kline ? undefined : "本次选股运行前未取得最新K线，保留报告快照。"
    },
    {
      id: `selection.runtime.technical.${candidate.code}`,
      scope: "stock" as const,
      subjectCode: candidate.code,
      subjectName: candidate.name,
      field: "selection.runtime.technical",
      provider: "tencent_zixuangu" as const,
      providerName: "腾讯自选股行情数据接口",
      accessPath: "westockAdapter.getStockTechnicals",
      sourceLabel: "运行前技术指标刷新",
      fetchedAt: refreshed.technical ? refreshed.refreshedAt : undefined,
      quality: refreshed.technical ? "primary" as const : "missing" as const,
      freshness: refreshed.technical ? "delayed" as const : "unknown" as const,
      warning: refreshed.technical ? undefined : "本次选股运行前未取得最新技术指标，保留报告快照。"
    },
    {
      id: `selection.runtime.fundFlow.${candidate.code}`,
      scope: "stock" as const,
      subjectCode: candidate.code,
      subjectName: candidate.name,
      field: "selection.runtime.fundFlow",
      provider: "tencent_zixuangu" as const,
      providerName: "腾讯自选股行情数据接口",
      accessPath: "westockAdapter.getStockFundFlows",
      sourceLabel: "运行前资金流刷新",
      fetchedAt: refreshed.fundFlow ? refreshed.refreshedAt : undefined,
      quality: refreshed.fundFlow ? "primary" as const : "missing" as const,
      freshness: refreshed.fundFlow ? "delayed" as const : "unknown" as const,
      warning: refreshed.fundFlow ? undefined : "本次选股运行前未取得最新资金流，保留报告快照。"
    },
    {
      id: `selection.runtime.company.${candidate.code}`,
      scope: "company" as const,
      subjectCode: candidate.code,
      subjectName: candidate.name,
      field: "selection.runtime.company",
      provider: "eastmoney_public" as const,
      providerName: "东方财富公开资料 + 腾讯自选股财务",
      accessPath: "eastmoneyAdapter.getCompanyProfile/westockAdapter.finance",
      sourceLabel: "运行前公司与财务补数",
      fetchedAt: refreshed.company ? refreshed.refreshedAt : undefined,
      quality: refreshed.company ? "primary" as const : "missing" as const,
      freshness: refreshed.company ? "delayed" as const : "unknown" as const,
      warning: refreshed.company ? undefined : "本次选股运行前未补齐公司/财务层数据。"
    }
  ];
}
