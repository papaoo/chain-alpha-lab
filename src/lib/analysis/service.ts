import { buildMarketMemoryContext, getAnalysisReport, getRecentMarketTimelinePoints, saveAnalysisReport } from "@/lib/db/reports";
import { persistIncrementalAnalysis } from "@/lib/db/incremental";
import { saveModelAuditFeedback } from "@/lib/db/modelAudit";
import { getRuntimeSettings } from "@/lib/db/settings";
import { getStockMemories, persistStockMemories } from "@/lib/db/stockMemory";
import { attachAnalysisSourceTraces } from "@/lib/data/sourceTrace";
import { generateModelAuditFeedback, generateModelReport } from "@/lib/llm/modelProvider";
import { effectiveTradeDateForSession, inferMarketSessionContext } from "@/lib/market/session";
import { sendAnalysisNotification } from "@/lib/notifications/service";
import { buildPremarketSnapshot } from "@/lib/premarket/service";
import { buildFactPackage } from "@/lib/strategy/rules";
import { westockAdapter } from "@/lib/westock/adapter";
import { buildTradingCalendarVerificationWarnings, buildTushareTradingCalendarWarnings, extractCandidateStockCodes, fetchSupplementalMarketData, fetchTushareCandidateMetrics, latestReportPeriod, supplementHotStocksWithEastmoney, supplementHotStocksWithTushare, supplementSectorConstituentsWithTushare, supplementStockFinancialIndicatorsWithTushare, supplementStockFundFlowsWithEastmoney, supplementStockFundFlowsWithTushare, supplementStockKlinesWithEastmoney, supplementStockProfilesWithEastmoney, supplementStockShareholdersWithTushare, supplementStockTechnicalsFromKlines, westockErrorToResult } from "@/lib/analysis/dataPipeline";
import type { AnalysisReport, Fact, FactPackage, StockCandidate, StockMemoryContext } from "@/lib/types";
import type { ParsedCommandResult } from "@/lib/westock/parser";

const TEXT = {
  title: "\u4eca\u65e5\u5e02\u573a\u5206\u6790",
  ruleOnlyLogic: "\u89c4\u5219\u5f15\u64ce\u57fa\u7840\u5224\u65ad\uff0c\u672a\u4f7f\u7528\u5927\u6a21\u578b\u603b\u7ed3\u3002",
  riskFallback: "\u8bf7\u7ed3\u5408\u4ed3\u4f4d\u7ea6\u675f\u6267\u884c\u3002",
  score: "\u89c4\u5219\u8bc4\u5206",
  waitPullback: "\u7b49\u5f85\u56de\u8e29",
  buyCondition: "\u7b49\u5f85\u56de\u8e29\u5173\u952e\u5747\u7ebf\u4e14\u4e3b\u7ebf\u672a\u9000\u6f6e\u3002",
  noBuyCondition: "\u5f53\u524d\u4e0d\u6ee1\u8db3\u660e\u786e\u4e70\u5165\u6761\u4ef6\u3002",
  sellCondition: "\u8dcc\u7834\u4e70\u5165\u903b\u8f91\u6216\u4e3b\u7ebf\u9000\u6f6e\u3002",
  noPosition: "\u4e0d\u5efa\u8bae\u5f00\u4ed3",
  noChase: "\u9ad8\u4f4d\u8ffd\u6da8\u4e0d\u4e70\u3002",
  volatility: "\u6ce8\u610f\u5e02\u573a\u6ce2\u52a8\u3002",
  tradable: "\u53ef\u4ea4\u6613",
  cautious: "\u8c28\u614e\u4ea4\u6613",
  defensive: "\u9632\u5b88\u89c2\u671b"
} as const;

export interface AnalyzeOptions {
  useLLM?: boolean;
  pushNotification?: boolean;
}

export async function runFullAnalysis(options: AnalyzeOptions = {}) {
  const settings = getRuntimeSettings();
  const timestamp = new Date().toISOString();
  const session = inferMarketSessionContext(timestamp);
  const tradeDate = effectiveTradeDateForSession(timestamp, session);

  const marketIndexCodes = ["sh000001", "sz399001", "sz399006", "sh000688"];
  const [marketKlines, marketTechnicals, boardOverview, hotBoards, rawHotStocks] = await Promise.all([
    Promise.all(marketIndexCodes.map((code) => westockAdapter.kline(code, 90))),
    westockAdapter.getStockTechnicals(marketIndexCodes),
    westockAdapter.getBoardOverview(),
    westockAdapter.getHotBoards(20),
    westockAdapter.getHotStocks(50)
  ]);
  const supplemental = await fetchSupplementalMarketData(boardOverview, timestamp, session, marketKlines);
  supplemental.warnings.push(...await buildTushareTradingCalendarWarnings(timestamp, session));
  supplemental.warnings.push(...buildTradingCalendarVerificationWarnings({
    timestamp,
    session,
    marketKlines
  }));
  const premarketSnapshot = await buildPremarketSnapshot().catch((error) => {
    supplemental.warnings.push(`盘前侦察数据获取失败：${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  });
  const hotStocks = await supplementHotStocksWithEastmoney(rawHotStocks, supplemental.warnings);

  const candidateCodes = extractCandidateStockCodes(hotStocks, supplemental.sectorConstituents).slice(0, 80);
  const tushareMetrics = await fetchTushareCandidateMetrics(candidateCodes, tradeDate, supplemental.warnings);
  const enrichedHotStocks = supplementHotStocksWithTushare(hotStocks, tushareMetrics, tradeDate);
  const enrichedSectorConstituents = supplementSectorConstituentsWithTushare(supplemental.sectorConstituents, tushareMetrics);
  const [rawStockKlines, stockTechnicals, rawStockFundFlows, rawStockProfiles, rawStockIncomeStatements, stockBalanceSheets, stockCashFlows, rawStockShareholders, stockReserves] = candidateCodes.length
    ? await Promise.all([
        westockAdapter.getStockKlines(candidateCodes, 30),
        westockAdapter.getStockTechnicals(candidateCodes),
        westockAdapter.getStockFundFlows(candidateCodes),
        westockAdapter.getStockProfiles(candidateCodes),
        westockAdapter.run("finance", [candidateCodes.join(","), "--type", "lrb", "--num", "4"]).catch((error) => westockErrorToResult("finance:lrb", candidateCodes, error)),
        westockAdapter.run("finance", [candidateCodes.join(","), "--type", "zcfz", "--num", "4"]).catch((error) => westockErrorToResult("finance:zcfz", candidateCodes, error)),
        westockAdapter.run("finance", [candidateCodes.join(","), "--type", "xjll", "--num", "4"]).catch((error) => westockErrorToResult("finance:xjll", candidateCodes, error)),
        westockAdapter.run("shareholder", [candidateCodes.join(",")]).catch((error) => westockErrorToResult("shareholder", candidateCodes, error)),
        westockAdapter.run("reserve", [candidateCodes.join(",")]).catch((error) => westockErrorToResult("reserve", candidateCodes, error))
      ])
    : [null, null, null, null, null, null, null, null, null];
  const stockKlines = await supplementStockKlinesWithEastmoney(rawStockKlines, candidateCodes, supplemental.warnings);
  const enrichedStockTechnicals = supplementStockTechnicalsFromKlines(stockTechnicals, stockKlines, candidateCodes, supplemental.warnings);
  const stockFundFlowsWithEastmoney = await supplementStockFundFlowsWithEastmoney(rawStockFundFlows, candidateCodes, supplemental.warnings);
  const stockFundFlows = await supplementStockFundFlowsWithTushare(stockFundFlowsWithEastmoney, candidateCodes, tradeDate, supplemental.warnings);
  const stockProfiles = await supplementStockProfilesWithEastmoney(rawStockProfiles, candidateCodes, supplemental.warnings);
  const stockIncomeStatements = await supplementStockFinancialIndicatorsWithTushare(rawStockIncomeStatements, candidateCodes, latestReportPeriod(tradeDate), supplemental.warnings);
  const stockShareholders = await supplementStockShareholdersWithTushare(rawStockShareholders, candidateCodes, tradeDate, supplemental.warnings);

  const marketTimeline = getRecentMarketTimelinePoints(10);
  const factPackage = buildFactPackage({
    timestamp,
    packageVersion: settings.westockPackageVersion,
    marketKlines,
    marketTechnicals,
    boardOverview,
    hotBoards,
    hotStocks: enrichedHotStocks,
    stockKlines,
    stockTechnicals: enrichedStockTechnicals,
    stockFundFlows,
    stockProfiles,
    stockIncomeStatements,
    stockBalanceSheets,
    stockCashFlows,
    stockShareholders,
    stockReserves,
    marketBreadth: supplemental.marketBreadth,
    limitPools: supplemental.limitPools,
    sectorConstituents: enrichedSectorConstituents,
    supplementalWarnings: supplemental.warnings,
    marketTimeline,
    session,
    premarket: premarketSnapshot
  });
  if (hotStocksContainsTushare(enrichedHotStocks)) {
    factPackage.dataSource.provider = "腾讯自选股行情数据接口 + 东方财富公开行情接口 + Tushare Pro";
    factPackage.dataSource.via = "westock-data-skillhub + eastmoney + tushare";
  }
  attachAnalysisSourceTraces(factPackage, {
    timestamp,
    packageVersion: settings.westockPackageVersion,
    marketKlines,
    marketTechnicals,
    boardOverview,
    hotBoards,
    hotStocks: enrichedHotStocks,
    stockKlines,
    stockTechnicals: enrichedStockTechnicals,
    stockFundFlows,
    stockProfiles,
    sectorConstituents: enrichedSectorConstituents,
    warnings: supplemental.warnings
  });
  attachMarketContext(factPackage);
  attachStockMemories(factPackage);
  assertFactPackageQuality(factPackage);

  const llm = options.useLLM === false
    ? { status: "disabled" as const, report: null, errors: [], metrics: undefined }
    : await generateModelReport(factPackage);
  const summary = llm.report?.summary || buildRuleOnlySummary(factPackage);
  const report: Omit<AnalysisReport, "id"> = {
    schemaVersion: factPackage.schemaVersion,
    reportType: "full",
    title: `${session.phaseLabel} ${new Date(timestamp).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`,
    summary,
    dataSourceStatus: factPackage.dataSource,
    ruleResult: factPackage.ruleResult,
    factPackage,
    llmResult: llm.report,
    llmStatus: llm.status,
    llmMetrics: llm.metrics,
    reportStatus: llm.report ? "llmEnhanced" : "ruleOnly",
    createdAt: timestamp
  };
  const reportId = saveAnalysisReport(report);
  const incrementalEvents = persistIncrementalAnalysis({ ...report, id: reportId });
  persistStockMemories({
    reportId,
    createdAt: report.createdAt,
    candidates: factPackage.candidates,
    llmResult: llm.report
  });
  const audit = options.useLLM === false || !settings.modelAuditEnabled
    ? { status: "disabled" as const, feedback: null, errors: [] }
    : await generateModelAuditFeedback({
        factPackage,
        report: llm.report,
        llmStatus: llm.status,
        llmErrors: llm.errors,
        summary
      });
  const modelAuditFeedbackId = audit.feedback
    ? saveModelAuditFeedback({ reportId, feedback: audit.feedback, createdAt: report.createdAt })
    : null;
  const notificationResults = options.pushNotification
    ? await sendAnalysisNotification({ ...report, id: reportId })
    : [];

  return {
    reportId,
    summary,
    dataSourceStatus: factPackage.dataSource,
    ruleResult: factPackage.ruleResult,
    factPackage,
    marketJudgement: llm.report?.marketJudgement ?? {
      level: `${stateLabel(factPackage.market.marketState)}（${factPackage.ruleResult.market.marketStateReason}）`,
      evidenceRefs: factPackage.market.facts.map((fact) => fact.factId),
      logic: `${TEXT.ruleOnlyLogic} 大盘状态原因：${factPackage.ruleResult.market.marketStateReason}。`,
      risk: factPackage.ruleResult.market.riskFlags.join("; ") || TEXT.riskFallback
    },
    mainLines: llm.report?.mainLines ?? factPackage.sectors.map((sector) => ({
      name: sector.name,
      stage: sector.stage,
      evidenceRefs: sector.facts.map((fact) => fact.factId),
      logic: `${TEXT.score} ${sector.score.toFixed(0)}.`
    })),
    stockPlans: llm.report?.stockPlans ?? factPackage.candidates.map(toRuleOnlyStockPlan),
    companyCards: factPackage.candidates.map((candidate) => candidate.companyKnowledge),
    llmErrors: llm.errors,
    llmMetrics: llm.metrics,
    incrementalEvents,
    modelAuditFeedbackId,
    modelAuditStatus: audit.status,
    modelAuditErrors: audit.errors,
    notificationResults
  };
}

function hotStocksContainsTushare(hotStocks: ParsedCommandResult) {
  return hotStocks.sections.some((section) =>
    section.type === "markdownTable" &&
    section.rows.some((row) => String(row.source ?? "").includes("tushare"))
  );
}

export async function runModelAnalysisFromReport(reportId: string, options: Pick<AnalyzeOptions, "pushNotification"> = {}) {
  const base = getAnalysisReport(reportId, "asOf");
  if (!base) throw new Error(`基础报告不存在，无法生成模型增强报告：${reportId}`);
  assertFactPackageQuality(base.factPackage);

  const llm = await generateModelReport(base.factPackage);
  const summary = llm.report?.summary || base.summary;
  const report: Omit<AnalysisReport, "id"> = {
    schemaVersion: base.factPackage.schemaVersion,
    reportType: base.reportType,
    title: `${base.title} · 模型研判`,
    summary,
    dataSourceStatus: base.factPackage.dataSource,
    ruleResult: base.ruleResult,
    factPackage: base.factPackage,
    llmResult: llm.report,
    llmStatus: llm.status,
    llmMetrics: llm.metrics,
    reportStatus: llm.report ? "llmEnhanced" : "ruleOnly",
    createdAt: new Date().toISOString()
  };
  const enhancedReportId = saveAnalysisReport(report);
  const notificationResults = options.pushNotification
    ? await sendAnalysisNotification({ ...report, id: enhancedReportId })
    : [];
  return {
    reportId: enhancedReportId,
    sourceReportId: reportId,
    summary,
    llmStatus: llm.status,
    llmErrors: llm.errors,
    llmMetrics: llm.metrics,
    notificationResults
  };
}

function attachStockMemories(factPackage: FactPackage) {
  const memories = getStockMemories(factPackage.candidates.map((candidate) => candidate.code));
  factPackage.stockMemories = memories;
  if (memories.length === 0) return;

  const memoryFacts = memories.flatMap(buildMemoryFacts);
  factPackage.facts.push(...memoryFacts);
}

function attachMarketContext(factPackage: FactPackage) {
  const context = buildMarketMemoryContext(factPackage, 10);
  factPackage.marketContext = context;
  factPackage.facts.push(...context.facts);
}

function assertFactPackageQuality(factPackage: FactPackage) {
  if (isLowQualityFactPackage(factPackage)) {
    const warningText = factPackage.dataSource.warnings
      .slice(0, 4)
      .map((warning) => warning.replace(/\s+/g, " ").trim().slice(0, 160))
      .join("；");
    throw new Error(`数据源不足，本次分析未生成有效报告：主线和候选股均为空。原因：${warningText}`);
  }
}

export function isLowQualityFactPackage(factPackage: Pick<FactPackage, "sectors" | "candidates" | "dataSource">) {
  const noMainline = factPackage.sectors.length === 0;
  const noCandidates = factPackage.candidates.length === 0;
  const hasDataSourceFailure = factPackage.dataSource.warnings.some((warning) =>
    /失败|failed|fetch failed|未找到数据|网络|超时|timeout|error/i.test(warning)
  );
  return noMainline && noCandidates && hasDataSourceFailure;
}

function buildMemoryFacts(memory: StockMemoryContext): Fact[] {
  const normalizedCode = memory.code.toLowerCase();
  const facts: Fact[] = [
    {
      factId: `memory.stock.${normalizedCode}.last_action`,
      sourceType: "ruleComputed",
      text: `${memory.name} 上次进入候选池时间为 ${formatCnDateTime(memory.lastSeenAt)}，上次动作是 ${memory.lastAction}，累计跟踪 ${memory.seenCount} 次。`,
      value: memory.lastAction
    },
    {
      factId: `memory.stock.${normalizedCode}.last_summary`,
      sourceType: "ruleComputed",
      text: `${memory.name} 上次跟踪摘要：${memory.lastSummary}`,
      value: memory.lastSummary
    }
  ];

  for (const [index, snapshot] of memory.recentSnapshots.slice(0, 3).entries()) {
    facts.push({
      factId: `memory.stock.${normalizedCode}.snapshot.${index + 1}`,
      sourceType: "ruleComputed",
      text: `${memory.name} 历史快照 ${index + 1}：${formatCnDateTime(snapshot.createdAt)}，动作 ${snapshot.action}，主线 ${snapshot.sectorName}，趋势 ${snapshot.trendState}，资金 ${snapshot.fundFlowState}，仓位上限 ${snapshot.positionLimitPct}%，失效条件：${snapshot.invalidCondition}。`,
      value: snapshot.action
    });
  }

  const pendingSnapshots = memory.recentSnapshots.filter((snapshot) => snapshot.action === "数据不足" || snapshot.sectorName === "主线关联待确认");
  if (pendingSnapshots.length >= 2) {
    facts.push({
      factId: `memory.stock.${normalizedCode}.data_gap_tracking`,
      sourceType: "ruleComputed",
      text: `${memory.name} 最近${memory.recentSnapshots.length}次快照中有${pendingSnapshots.length}次处于数据不足或主线关联待确认，应优先补充成分股归属、主营业务匹配和资金/技术证据；若连续多期无法补证，建议从候选池移入人工审核。`,
      value: pendingSnapshots.length
    });
  }

  return facts;
}

function formatCnDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
}

function toRuleOnlyStockPlan(candidate: StockCandidate) {
  return {
    code: candidate.code,
    name: candidate.name,
    action: candidate.action,
    companySummary: candidate.companyKnowledge.coreBusiness,
    companySourceNote: "mixed" as const,
    evidenceRefs: candidate.evidenceRefs,
    buyCondition: candidate.action === TEXT.waitPullback ? TEXT.buyCondition : TEXT.noBuyCondition,
    sellCondition: TEXT.sellCondition,
    positionSuggestion: candidate.positionLimitPct ? `<= ${candidate.positionLimitPct}%` : TEXT.noPosition,
    invalidCondition: candidate.invalidCondition,
    doNotBuyCondition: candidate.riskFlags.join("; ") || TEXT.noChase,
    risk: candidate.riskFlags.join("; ") || TEXT.volatility
  };
}

function buildRuleOnlySummary(factPackage: FactPackage) {
  const mainLine = factPackage.sectors[0]?.name ?? "暂无";
  return `${factPackage.session.phaseLabel}：大盘状态 ${stateLabel(factPackage.market.marketState)}（${factPackage.ruleResult.market.marketStateReason}）；主线板块：${mainLine}；候选股数量：${factPackage.candidates.length}。`;
}

function stateLabel(state: string) {
  if (state === "tradable") return TEXT.tradable;
  if (state === "cautious") return TEXT.cautious;
  return TEXT.defensive;
}
