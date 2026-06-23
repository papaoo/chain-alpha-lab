import { getRuntimeSettings } from "../db/settings";
import type { DeepSeekReport, FactPackage, LlmCallMetrics, LlmStatus, ModelAuditFeedback } from "../types";
import { buildModelAuditPrompt, buildRepairPrompt, buildReportPrompt, SYSTEM_PROMPT } from "./prompts";
import { parseAndValidateDeepSeekOutput, parseAndValidateModelAuditOutput } from "./validator";

interface LlmResult {
  status: LlmStatus;
  report: DeepSeekReport | null;
  errors: string[];
  metrics?: LlmCallMetrics;
}

const DEFAULT_MAX_REPAIR_PROMPT_CHARS = 40_000;
const APPROX_CHARS_PER_TOKEN = 2.2;

export async function generateDeepSeekReport(factPackage: FactPackage): Promise<LlmResult> {
  const settings = getRuntimeSettings();
  if (!settings.enabled || !settings.apiKey) {
    return { status: "disabled", report: null, errors: ["Model provider disabled or API key missing"], metrics: disabledMetrics(settings) };
  }

  const startedAt = Date.now();
  const compactPackage = compactFactPackageForLlm(factPackage);
  const reportPrompt = buildReportPrompt(compactPackage);
  let requestCount = 1;
  const first = await callModelProvider(reportPrompt);
  if (first.ok) {
    const validation = parseAndValidateDeepSeekOutput(first.text, compactPackage);
    if (validation.ok && validation.report) {
      return { status: "success", report: validation.report, errors: [], metrics: buildMetrics(settings, "success", startedAt, reportPrompt.length, undefined, false, requestCount, 0) };
    }

    const repairPrompt = buildRepairPrompt(compactPackage, validation.errors);
    const maxRepairPromptChars = repairPromptBudgetChars();
    if (repairPrompt.length > maxRepairPromptChars) {
      const skippedRepairReason = `修复上下文 ${repairPrompt.length} 字符超过 ${maxRepairPromptChars} 字符预算，已跳过二次模型调用，避免重复消耗 token。`;
      return {
        status: "rejected",
        report: null,
        errors: [...validation.errors, skippedRepairReason],
        metrics: buildMetrics(settings, "rejected", startedAt, reportPrompt.length, repairPrompt.length, false, requestCount, validation.errors.length, validation.errors, skippedRepairReason)
      };
    }
    requestCount += 1;
    const repaired = await callModelProvider(repairPrompt);
    if (repaired.ok) {
      const repairedValidation = parseAndValidateDeepSeekOutput(repaired.text, compactPackage);
      if (repairedValidation.ok && repairedValidation.report) {
        return { status: "success", report: repairedValidation.report, errors: [], metrics: buildMetrics(settings, "success", startedAt, reportPrompt.length, repairPrompt.length, true, requestCount, validation.errors.length, validation.errors) };
      }
      return { status: "rejected", report: null, errors: repairedValidation.errors, metrics: buildMetrics(settings, "rejected", startedAt, reportPrompt.length, repairPrompt.length, true, requestCount, repairedValidation.errors.length, repairedValidation.errors) };
    }
    return { status: "rejected", report: null, errors: [...validation.errors, repaired.error], metrics: buildMetrics(settings, "rejected", startedAt, reportPrompt.length, repairPrompt.length, true, requestCount, validation.errors.length + 1, [...validation.errors, repaired.error]) };
  }

  return {
    status: "failed",
    report: null,
    errors: [first.error],
    metrics: buildMetrics(settings, "failed", startedAt, reportPrompt.length, undefined, false, requestCount, 1, [first.error])
  };
}

function buildMetrics(
  settings: ReturnType<typeof getRuntimeSettings>,
  status: LlmStatus,
  startedAt: number,
  reportPromptChars: number,
  repairPromptChars: number | undefined,
  repairAttempted: boolean,
  requestCount: number,
  errorCount: number,
  errors: string[] = [],
  skippedRepairReason?: string
): LlmCallMetrics {
  const totalInputChars = reportPromptChars + (repairPromptChars && repairAttempted ? repairPromptChars : 0);
  return {
    provider: settings.providerName || settings.provider,
    model: settings.model,
    reportPromptChars,
    repairPromptChars,
    estimatedInputTokens: Math.ceil(totalInputChars / APPROX_CHARS_PER_TOKEN),
    elapsedMs: Date.now() - startedAt,
    repairAttempted,
    requestCount,
    status,
    errorCount,
    errors: errors.slice(0, 8).map((error) => truncate(error, 500)),
    skippedRepairReason,
    maxTokens: settings.maxTokens,
    temperature: settings.temperature
  };
}

function disabledMetrics(settings: ReturnType<typeof getRuntimeSettings>): LlmCallMetrics {
  return {
    provider: settings.providerName || settings.provider,
    model: settings.model,
    reportPromptChars: 0,
    elapsedMs: 0,
    repairAttempted: false,
    requestCount: 0,
    status: "disabled",
    errorCount: 1,
    maxTokens: settings.maxTokens,
    temperature: settings.temperature
  };
}

function repairPromptBudgetChars() {
  const raw = process.env.LLM_REPAIR_PROMPT_MAX_CHARS;
  const parsed = raw ? Number(raw) : DEFAULT_MAX_REPAIR_PROMPT_CHARS;
  return Number.isFinite(parsed) && parsed >= 10_000 ? Math.trunc(parsed) : DEFAULT_MAX_REPAIR_PROMPT_CHARS;
}

export async function generateModelAuditFeedback(input: {
  factPackage: FactPackage;
  report: DeepSeekReport | null;
  llmStatus: LlmStatus;
  llmErrors: string[];
  summary: string;
}): Promise<{ status: LlmStatus; feedback: ModelAuditFeedback | null; errors: string[] }> {
  const settings = getRuntimeSettings();
  if (!settings.enabled || !settings.apiKey) {
    return { status: "disabled", feedback: null, errors: ["Model provider disabled or API key missing"] };
  }

  const compactPackage = withModelAuditFacts(compactFactPackageForLlm(input.factPackage), input.report, input.llmErrors);
  const auditContext = {
    factPackage: compactPackage,
    reportSummary: input.summary,
    llmStatus: input.llmStatus,
    llmErrors: input.llmErrors,
    llmReport: input.report
      ? {
          summary: input.report.summary,
          marketJudgement: input.report.marketJudgement,
          mainLines: input.report.mainLines,
          stockPlans: input.report.stockPlans,
          marketStructureInsight: input.report.marketStructureInsight,
          marketStateFlipConditions: input.report.marketStateFlipConditions,
          mainlineCompetition: input.report.mainlineCompetition,
          mainlineStageForecasts: input.report.mainlineStageForecasts,
          coreStructureHealth: input.report.coreStructureHealth,
          intradayWatchlist: input.report.intradayWatchlist
        }
      : null
  };
  const first = await callModelProvider(buildModelAuditPrompt(auditContext));
  if (!first.ok) return { status: "failed", feedback: null, errors: [first.error] };
  const validation = parseAndValidateModelAuditOutput(first.text, compactPackage);
  if (validation.ok && validation.feedback) return { status: "success", feedback: validation.feedback, errors: [] };
  return { status: "rejected", feedback: null, errors: validation.errors };
}

function withModelAuditFacts(factPackage: FactPackage, report: DeepSeekReport | null, llmErrors: string[]): FactPackage {
  const facts = [...factPackage.facts];
  const addFact = (factId: string, text: string, value?: string | number | boolean | null) => {
    if (facts.some((fact) => fact.factId === factId)) return;
    facts.push({ factId, sourceType: "ruleComputed", text, value });
  };
  if (factPackage.dataSource.warnings.length) {
    addFact("audit.dataSource.warnings", `数据源警告：${factPackage.dataSource.warnings.join("；")}`, factPackage.dataSource.warnings.length);
  } else {
    addFact("audit.dataSource.status", `数据源状态：${factPackage.dataSource.status}，来源 ${factPackage.dataSource.via}`, factPackage.dataSource.status);
  }
  addFact(
    "audit.constraints",
    `系统风控约束：允许候选池 ${factPackage.constraints.allowedCodes.join("、")}；单票上限${factPackage.constraints.maxSingleStockPositionPct}%；单主线上限${factPackage.constraints.maxThemePositionPct}%；最低现金${factPackage.constraints.minCashPct}%`,
    factPackage.constraints.maxSingleStockPositionPct
  );
  for (const sector of factPackage.sectors.slice(0, 5)) {
    addFact(
      `audit.sector.${sector.name}.diagnostics`,
      `${sector.name} 主线诊断：${sector.diagnostics.map((item) => `${item.label}${item.score}/${item.max}(${item.status})`).join("，")}；风险：${sector.riskFlags.join("；") || "无"}`,
      sector.score
    );
  }
  for (const candidate of factPackage.candidates.slice(0, 8)) {
    addFact(
      `audit.candidate.${candidate.code}.ruleState`,
      `${candidate.name} 动作为${candidate.action}，主线${candidate.sectorName}，定位${candidate.role}，强度${candidate.strengthScore ?? "缺失"}，信号${candidate.signalTier ?? "缺失"}/${candidate.signalLabel ?? "缺失"}，排序分${candidate.signalScore ?? "缺失"}，买点${candidate.buyPointType}，仓位上限${candidate.positionLimitPct}%`,
      candidate.action
    );
    if (candidate.signalTier || candidate.signalScore !== undefined) {
      addFact(
        `audit.candidate.${candidate.code}.signalQuality`,
        `${candidate.name} 信号质量分层：${candidate.signalTier ?? "缺失"}/${candidate.signalLabel ?? "缺失"}，排序分${candidate.signalScore ?? "缺失"}/100；依据：${candidate.signalReasons?.join("；") || "缺失"}`,
        candidate.signalScore ?? null
      );
    }
    addFact(
      `audit.candidate.${candidate.code}.diagnostics`,
      `${candidate.name} 强股诊断：${(candidate.diagnostics ?? []).map((item) => `${item.label}${item.score}/${item.max}(${item.status})`).join("，") || "缺失"}；风险：${candidate.riskFlags.join("；") || "无"}`,
      candidate.strengthScore ?? null
    );
    if (candidate.buyPointEvaluation) {
      addFact(
        `audit.candidate.${candidate.code}.buyPoint`,
        `${candidate.name} 买点评估：${candidate.buyPointEvaluation.status}/${candidate.buyPointEvaluation.type}，评分${candidate.buyPointEvaluation.score}/20；满足${candidate.buyPointEvaluation.satisfied.join("；") || "无"}；阻断${candidate.buyPointEvaluation.blockers.join("；") || "无"}；时段${candidate.buyPointEvaluation.sessionNote}；触发${candidate.buyPointEvaluation.triggerCondition}；失效${candidate.buyPointEvaluation.invalidCondition}`,
        candidate.buyPointEvaluation.score
      );
    }
    if (candidate.technical) {
      addFact(
        `audit.candidate.${candidate.code}.technical`,
        `${candidate.name} 技术快照：收盘${candidate.technical.closePrice ?? "缺失"}，MA5 ${candidate.technical.ma5 ?? "缺失"}，MA10 ${candidate.technical.ma10 ?? "缺失"}，MA20 ${candidate.technical.ma20 ?? "缺失"}，MA60 ${candidate.technical.ma60 ?? "缺失"}，MACD ${candidate.technical.macd ?? "缺失"}，DIF ${candidate.technical.macdDif ?? "缺失"}，DEA ${candidate.technical.macdDea ?? "缺失"}`,
        candidate.technical.closePrice ?? null
      );
      addFact(
        `stock.${candidate.code}.technical.macd`,
        `${candidate.name} MACD ${candidate.technical.macd ?? "缺失"}，DIF ${candidate.technical.macdDif ?? "缺失"}，DEA ${candidate.technical.macdDea ?? "缺失"}`,
        candidate.technical.macd ?? null
      );
    }
    addFact(
      `audit.candidate.${candidate.code}.companyMatch`,
      `${candidate.name} 公司认知：主线匹配${candidate.companyKnowledge.themeMatch}，认知状态${candidate.companyKnowledge.companyKnowledgeState}，逻辑：${candidate.companyKnowledge.themeMatchLogic}`,
      candidate.companyKnowledge.themeMatch
    );
    addFact(
      `audit.candidate.${candidate.code}.companyKnowledge`,
      [
        `${candidate.name} 公司认知卡片：产业链位置${candidate.companyKnowledge.industryChainPosition}`,
        `匹配类型${candidate.companyKnowledge.themeMatchType}`,
        `财务趋势${candidate.companyKnowledge.financialTrend}`,
        `长期逻辑${candidate.companyKnowledge.longTermLogicAllowed ? "允许" : "禁止"}`,
        candidate.companyKnowledge.financialSummary?.trendBasis?.length
          ? `趋势依据：${candidate.companyKnowledge.financialSummary.trendBasis.join("；")}`
          : "趋势依据缺失",
        candidate.companyKnowledge.logicInvalidConditions.length
          ? `失效条件：${candidate.companyKnowledge.logicInvalidConditions.join("；")}`
          : "失效条件缺失"
      ].join("；"),
      candidate.companyKnowledge.financialTrend
    );
  }
  if (report) {
    addFact("audit.llm.marketJudgement", `模型大盘研判：${report.marketJudgement.logic}；风险：${report.marketJudgement.risk}`, report.marketJudgement.level);
    if (report.marketStateFlipConditions?.length) {
      addFact("audit.llm.marketStateFlipConditions", `模型状态翻转条件：${report.marketStateFlipConditions.map((item) => `${item.targetState}:${item.condition}`).join("；")}`, report.marketStateFlipConditions.length);
    }
    report.stockPlans.slice(0, 8).forEach((plan) => {
      addFact(
        `audit.llm.stockPlan.${plan.code}`,
        `${plan.name} 模型计划：动作${plan.action}，买入条件${plan.buyCondition}，卖出条件${plan.sellCondition}，失效${plan.invalidCondition}，仓位${plan.positionSuggestion}`,
        plan.action
      );
    });
  }
  if (llmErrors.length) addFact("audit.llm.errors", `模型报告错误：${llmErrors.join("；")}`, llmErrors.length);
  return { ...factPackage, facts };
}

export function compactFactPackageForLlm(factPackage: FactPackage): FactPackage {
  const selectedCandidates = selectCandidatesForLlm(factPackage.candidates);
  const candidates = selectedCandidates.map(compactCandidateForLlm);
  const allowedRefs = new Set<string>([
    "session.market.phase",
    "premarket.risk.overlay",
    "audit.constraints",
    "audit.dataSource.warnings",
    "audit.dataSource.status",
    "audit.llm.errors",
    ...factPackage.market.facts.map((fact) => fact.factId),
    ...factPackage.market.indices.flatMap((index) => index.facts.map((fact) => fact.factId)),
    ...factPackage.sectors.flatMap((sector) => sector.facts.map((fact) => fact.factId)),
    ...candidates.flatMap((candidate) => candidate.evidenceRefs),
    ...(factPackage.marketContext?.facts.map((fact) => fact.factId) ?? []),
    ...factPackage.facts.filter((fact) => fact.factId.startsWith("audit.")).map((fact) => fact.factId),
    ...factPackage.facts.filter((fact) => fact.factId.startsWith("premarket.")).map((fact) => fact.factId),
    ...factPackage.facts
      .filter((fact) => fact.factId.startsWith("memory.stock."))
      .filter((fact) => candidates.some((candidate) => fact.factId.includes(`.${candidate.code.toLowerCase()}.`)))
      .map((fact) => fact.factId)
  ]);
  const facts = factPackage.facts
    .filter((fact) => allowedRefs.has(fact.factId))
    .slice(0, 60)
    .map((fact) => ({ ...fact, text: truncate(fact.text, 120) }));
  return {
    ...factPackage,
    dataSource: {
      ...factPackage.dataSource,
      warnings: factPackage.dataSource.warnings.slice(0, 12).map((warning) => truncate(warning, 160)),
      traces: factPackage.dataSource.traces?.slice(0, 12).map(compactTrace)
    },
    premarket: factPackage.premarket
      ? {
          ...factPackage.premarket,
          summary: truncate(factPackage.premarket.summary, 180),
          markets: factPackage.premarket.markets.slice(0, 8),
          calendarEvents: factPackage.premarket.calendarEvents.slice(0, 4).map((event) => ({
            ...event,
            content: truncate(event.content, 100)
          })),
          buckets: factPackage.premarket.buckets.slice(0, 5).map((bucket) => ({
            ...bucket,
            note: truncate(bucket.note, 100),
            evidence: bucket.evidence.slice(0, 3)
          })),
          riskFlags: factPackage.premarket.riskFlags.slice(0, 6).map((flag) => truncate(flag, 120)),
          watchItems: factPackage.premarket.watchItems.slice(0, 6).map((item) => truncate(item, 120)),
          sourceTraces: [],
          warnings: factPackage.premarket.warnings.slice(0, 4).map((warning) => truncate(warning, 120))
        }
      : undefined,
    facts,
    sectors: factPackage.sectors.slice(0, 4).map((sector) => ({
      ...sector,
      coreStocks: sector.coreStocks.slice(0, 3),
      diagnostics: sector.diagnostics.slice(0, 4),
      scoreBreakdown: undefined,
      sourceTraces: undefined,
      facts: sector.facts.slice(0, 2)
    })),
    candidates,
    candidateReviews: factPackage.candidateReviews?.slice(0, 3).map((item) => ({
      ...item,
      reason: truncate(item.reason, 180),
      missingEvidence: item.missingEvidence.slice(0, 5),
      blockers: item.blockers.slice(0, 5).map((blocker) => truncate(blocker, 140)),
      evidence: item.evidence.slice(0, 4).map((evidence) => truncate(evidence, 140)),
      evidenceChain: item.evidenceChain
        ? {
            ...item.evidenceChain,
            constituentEvidence: item.evidenceChain.constituentEvidence.slice(0, 3).map((evidence) => truncate(evidence, 140)),
            businessEvidence: item.evidenceChain.businessEvidence.slice(0, 3).map((evidence) => truncate(evidence, 140)),
            industryChainEvidence: item.evidenceChain.industryChainEvidence.slice(0, 3).map((evidence) => truncate(evidence, 140)),
            negativeEvidence: item.evidenceChain.negativeEvidence.slice(0, 4).map((evidence) => truncate(evidence, 140)),
            reviewReason: item.evidenceChain.reviewReason ? truncate(item.evidenceChain.reviewReason, 140) : undefined
          }
        : undefined
    })),
    stockMemories: factPackage.stockMemories
      ?.filter((memory) => candidates.some((candidate) => candidate.code.toLowerCase() === memory.code.toLowerCase()))
      .map((memory) => ({
        ...memory,
        lastSummary: truncate(memory.lastSummary, 180),
        recentSnapshots: memory.recentSnapshots.slice(0, 3).map((snapshot) => ({
          ...snapshot,
          summary: truncate(snapshot.summary, 180)
        }))
      })),
    marketContext: factPackage.marketContext
      ? {
          ...factPackage.marketContext,
          timeline: factPackage.marketContext.timeline.slice(-3),
          mainlines: factPackage.marketContext.mainlines.slice(0, 3).map((line) => ({
            ...line,
            stagePath: line.stagePath.slice(-3)
          })),
          facts: factPackage.marketContext.facts.map((fact) => ({ ...fact, text: truncate(fact.text, 180) }))
            .slice(0, 6)
        }
      : undefined,
    constraints: {
      ...factPackage.constraints,
      allowedCodes: candidates.map((candidate) => candidate.code)
    },
    ruleResult: {
      ...factPackage.ruleResult,
      market: {
        ...factPackage.ruleResult.market,
        diagnostics: factPackage.ruleResult.market.diagnostics.slice(0, 6),
        scoreBreakdown: factPackage.ruleResult.market.scoreBreakdown?.slice(0, 5),
        riskFlags: factPackage.ruleResult.market.riskFlags.slice(0, 8),
        facts: factPackage.ruleResult.market.facts.slice(0, 6)
      },
      sectors: [],
      candidates: []
    }
  };
}

function compactCandidateForLlm(candidate: FactPackage["candidates"][number]): FactPackage["candidates"][number] {
  return {
    code: candidate.code,
    name: candidate.name,
    price: candidate.price,
    quote: candidate.quote
      ? {
          latest: candidate.quote.latest,
          changePct: candidate.quote.changePct,
          amount: candidate.quote.amount,
          turnoverRate: candidate.quote.turnoverRate,
          mainNetInflow: candidate.quote.mainNetInflow,
          floatMarketValue: candidate.quote.floatMarketValue
        }
      : undefined,
    sectorName: candidate.sectorName,
    role: candidate.role,
    strengthScore: candidate.strengthScore,
    signalScore: candidate.signalScore,
    signalTier: candidate.signalTier,
    signalLabel: candidate.signalLabel,
    signalReasons: candidate.signalReasons?.slice(0, 4).map((item) => truncate(item, 120)),
    diagnostics: candidate.diagnostics?.slice(0, 4),
    trendState: candidate.trendState,
    fundFlowState: candidate.fundFlowState,
    buyPointType: candidate.buyPointType,
    buyPointEvaluation: candidate.buyPointEvaluation
      ? {
          ...candidate.buyPointEvaluation,
          satisfied: candidate.buyPointEvaluation.satisfied.slice(0, 4),
          blockers: candidate.buyPointEvaluation.blockers.slice(0, 4),
          triggerCondition: truncate(candidate.buyPointEvaluation.triggerCondition, 160),
          invalidCondition: truncate(candidate.buyPointEvaluation.invalidCondition, 160),
          sessionNote: truncate(candidate.buyPointEvaluation.sessionNote, 100)
        }
      : undefined,
    action: candidate.action,
    positionLimitPct: candidate.positionLimitPct,
    invalidCondition: truncate(candidate.invalidCondition, 160),
    riskFlags: candidate.riskFlags.slice(0, 6).map((item) => truncate(item, 120)),
    dataCompleteness: candidate.dataCompleteness,
    companyKnowledge: {
      ...candidate.companyKnowledge,
      mainBusiness: truncate(candidate.companyKnowledge.mainBusiness, 120),
      coreBusiness: truncate(candidate.companyKnowledge.coreBusiness, 140),
      productsOrServices: candidate.companyKnowledge.productsOrServices.slice(0, 2).map((item) => truncate(item, 80)),
      themeMatchLogic: truncate(candidate.companyKnowledge.themeMatchLogic, 140),
      oneLineUnderstanding: truncate(candidate.companyKnowledge.oneLineUnderstanding, 100),
      fundamentalRisks: candidate.companyKnowledge.fundamentalRisks.slice(0, 2).map((item) => truncate(item, 100)),
      longTermWatchItems: candidate.companyKnowledge.longTermWatchItems.slice(0, 1).map((item) => truncate(item, 100)),
      fundamentalHighlights: candidate.companyKnowledge.fundamentalHighlights.slice(0, 1).map((item) => truncate(item, 100)),
      logicInvalidConditions: candidate.companyKnowledge.logicInvalidConditions.slice(0, 3).map((item) => truncate(item, 100)),
      missingFields: candidate.companyKnowledge.missingFields.slice(0, 4),
      financialSummary: candidate.companyKnowledge.financialSummary
        ? {
            reportDate: candidate.companyKnowledge.financialSummary.reportDate,
            revenueChangePct: candidate.companyKnowledge.financialSummary.revenueChangePct,
            netProfitChangePct: candidate.companyKnowledge.financialSummary.netProfitChangePct,
            roePct: candidate.companyKnowledge.financialSummary.roePct,
            debtRatioPct: candidate.companyKnowledge.financialSummary.debtRatioPct,
            trendBasis: candidate.companyKnowledge.financialSummary.trendBasis?.slice(0, 2).map((item) => truncate(item, 100))
          }
        : undefined,
      shareholderSummary: candidate.companyKnowledge.shareholderSummary
        ? {
            reportDate: candidate.companyKnowledge.shareholderSummary.reportDate,
            holderCount: candidate.companyKnowledge.shareholderSummary.holderCount,
            holderCountChangePct: candidate.companyKnowledge.shareholderSummary.holderCountChangePct,
            topHolder: candidate.companyKnowledge.shareholderSummary.topHolder,
            topHolderPct: candidate.companyKnowledge.shareholderSummary.topHolderPct
          }
        : undefined
    },
    mainlineAttribution: candidate.mainlineAttribution
      ? {
          ...candidate.mainlineAttribution,
          evidence: candidate.mainlineAttribution.evidence.slice(0, 3).map((item) => truncate(item, 120)),
          blockers: candidate.mainlineAttribution.blockers.slice(0, 3).map((item) => truncate(item, 120)),
          businessKeywords: candidate.mainlineAttribution.businessKeywords.slice(0, 6),
          sectorKeywords: candidate.mainlineAttribution.sectorKeywords.slice(0, 6),
          evidenceChain: candidate.mainlineAttribution.evidenceChain
            ? {
                ...candidate.mainlineAttribution.evidenceChain,
                constituentEvidence: candidate.mainlineAttribution.evidenceChain.constituentEvidence.slice(0, 2).map((item) => truncate(item, 120)),
                businessEvidence: candidate.mainlineAttribution.evidenceChain.businessEvidence.slice(0, 2).map((item) => truncate(item, 120)),
                industryChainEvidence: candidate.mainlineAttribution.evidenceChain.industryChainEvidence.slice(0, 2).map((item) => truncate(item, 120)),
                negativeEvidence: candidate.mainlineAttribution.evidenceChain.negativeEvidence.slice(0, 3).map((item) => truncate(item, 120)),
                reviewReason: candidate.mainlineAttribution.evidenceChain.reviewReason ? truncate(candidate.mainlineAttribution.evidenceChain.reviewReason, 120) : undefined
              }
            : undefined,
          reason: truncate(candidate.mainlineAttribution.reason, 140)
        }
      : undefined,
    klineSummary: candidate.klineSummary,
    technical: candidate.technical,
    fundFlow: candidate.fundFlow,
    fundFlowQuality: candidate.fundFlowQuality
      ? {
          ...candidate.fundFlowQuality,
          evidence: candidate.fundFlowQuality.evidence.slice(0, 3).map((item) => truncate(item, 100)),
          blockers: candidate.fundFlowQuality.blockers.slice(0, 3).map((item) => truncate(item, 100))
        }
      : undefined,
    activity: candidate.activity
      ? {
          score: candidate.activity.score,
          status: candidate.activity.status,
          reasons: candidate.activity.reasons.slice(0, 2).map((item) => truncate(item, 100)),
          blockers: candidate.activity.blockers.slice(0, 2).map((item) => truncate(item, 100)),
          basis: candidate.activity.basis
        }
      : undefined,
    tradability: candidate.tradability,
    evidenceRefs: candidate.evidenceRefs.slice(0, 10)
  };
}

function selectCandidatesForLlm(candidates: FactPackage["candidates"]) {
  const selected: FactPackage["candidates"] = [];
  const seen = new Set<string>();
  const push = (candidate: FactPackage["candidates"][number]) => {
    const key = candidate.code.toLowerCase();
    if (seen.has(key)) return;
    selected.push(candidate);
    seen.add(key);
  };

  candidates.slice(0, 3).forEach(push);
  candidates
    .filter((candidate) =>
      candidate.signalTier === "S" ||
      candidate.signalTier === "A" ||
      candidate.action === "小仓试错" ||
      candidate.action === "等待回踩"
    )
    .forEach(push);

  return selected.slice(0, 4);
}

function compactTrace(trace: NonNullable<FactPackage["dataSource"]["traces"]>[number]) {
  return {
    id: trace.id,
    scope: trace.scope,
    subjectCode: trace.subjectCode,
    subjectName: trace.subjectName,
    field: trace.field,
    provider: trace.provider,
    providerName: trace.providerName,
    accessPath: trace.accessPath,
    sourceLabel: trace.sourceLabel,
    quality: trace.quality,
    freshness: trace.freshness,
    warning: trace.warning ? truncate(trace.warning, 120) : undefined
  };
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

async function callModelProvider(userPrompt: string): Promise<{ ok: true; text: string } | { ok: false; error: string; text?: string }> {
  const settings = getRuntimeSettings();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.timeoutMs);
  try {
    const requestBody: Record<string, unknown> = {
      model: settings.model,
      temperature: settings.temperature,
      max_tokens: Math.max(1200, settings.maxTokens),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ]
    };
    if (settings.provider === "deepseek") {
      requestBody.thinking = { type: "disabled" };
    }
    const response = await fetch(buildChatCompletionsUrl(settings.baseUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
    const responseText = await response.text();
    let json: any = null;
    try {
      json = responseText ? JSON.parse(responseText) : null;
    } catch {
      json = null;
    }
    if (!response.ok) {
      return { ok: false, error: json?.error?.message || `Model provider HTTP ${response.status}: ${responseText.slice(0, 800)}` };
    }
    const text = json?.choices?.[0]?.message?.content;
    if (!text) {
      return {
        ok: false,
        error: `Model provider response missing final content: status=${response.status}; body=${responseText.slice(0, 800)}`
      };
    }
    return { ok: true, text };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

function buildChatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  if (trimmed.endsWith("/v1")) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
}
