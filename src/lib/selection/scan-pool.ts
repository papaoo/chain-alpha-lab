import { eastmoneyAdapter, type EastmoneyQuote } from "@/lib/eastmoney/adapter";
import { buildCompleteness } from "@/lib/strategy/stockDataRules";
import { evaluateStockActivity } from "@/lib/strategy/stockActivityRules";
import { evaluateTradability } from "@/lib/strategy/stockTradabilityRules";
import { normalizeStockCode } from "@/lib/strategy/candidateUtils";
import { sameSectorName } from "@/lib/sector/normalization";
import type { CompanyKnowledgeCard, SectorRuleResult, StockCandidate } from "@/lib/types";
import type { SelectionStrategyId } from "@/lib/selection/types";

export interface FullAScanResult {
  candidates: StockCandidate[];
  warnings: string[];
  sourceUrl?: string;
  fetchedAt: string;
  rawCount: number;
}

interface SectorMembershipEvidence {
  sector: SectorRuleResult;
  boardType: "industry" | "concept";
  boardCode?: string;
  sourceUrl?: string;
}

export async function buildFullAScanCandidates(input: {
  strategyId?: SelectionStrategyId;
  limit: number;
  scanLimit?: number;
  sectors?: SectorRuleResult[];
}): Promise<FullAScanResult> {
  const fetchedAt = new Date().toISOString();
  const scanLimit = Math.min(Math.max(input.scanLimit ?? Math.max(input.limit * 5, 500), 100), 5000);
  const [response, membership] = await Promise.all([
    eastmoneyAdapter.getAllAQuotes(scanLimit, { timeoutMs: 45000, retries: 1 }),
    buildSectorMembershipMap(input.sectors ?? [])
  ]);
  const quotes = response.data ?? [];
  const candidates = quotes
    .filter(isTradableQuote)
    .map((quote) => quoteToCandidate(quote, response.sourceUrl, fetchedAt, input.sectors ?? [], membership.byCode, input.strategyId))
    .map((candidate) => ({ candidate, score: candidate.signalScore ?? 0 }))
    .sort((left, right) => right.score - left.score)
    .slice(0, input.limit)
    .map((entry) => entry.candidate);

  return {
    candidates,
    warnings: [
      ...response.warnings,
      ...membership.warnings,
      `全 A 扫描读取东方财富最新行情 ${quotes.length}/${scanLimit} 条，过滤 ST/停牌/极低流动性后入池 ${candidates.length} 只；该阶段只做盘口初筛，不替代正式策略评分。`
    ],
    sourceUrl: response.sourceUrl,
    fetchedAt,
    rawCount: quotes.length
  };
}

function isTradableQuote(quote: EastmoneyQuote) {
  const name = quote.name ?? "";
  if (!quote.marketCode || !quote.code || !name) return false;
  if (/ST|退|退市|N |C /i.test(name)) return false;
  if (!quote.latest || quote.latest <= 0) return false;
  if (quote.changePct !== undefined && quote.changePct <= -9.7) return false;
  if ((quote.amount ?? 0) < 50_000_000) return false;
  return true;
}

function quoteToCandidate(
  quote: EastmoneyQuote,
  sourceUrl: string | undefined,
  fetchedAt: string,
  sectors: SectorRuleResult[],
  membershipByCode: Map<string, SectorMembershipEvidence>,
  strategyId?: SelectionStrategyId
): StockCandidate {
  const code = normalizeStockCode(quote.marketCode || quote.code);
  const membership = membershipByCode.get(code);
  const matchedSector = membership?.sector ?? findMatchingSector(quote.industry, sectors);
  const sectorName = matchedSector?.name || quote.industry || "未分类";
  const companyKnowledge = buildScanCompanyKnowledge(code, quote.name, quote.industry, matchedSector, Boolean(membership));
  const tradability = evaluateTradability(quote.changePct);
  const stockQuote = {
    latest: quote.latest,
    changePct: quote.changePct,
    amount: quote.amount,
    volume: quote.volume,
    turnoverRate: quote.turnoverRate,
    peTtm: quote.peDynamic,
    pb: quote.pb,
    mainNetInflow: quote.mainNetInflow,
    floatMarketValue: quote.floatMarketValue
  };
  const fundFlowState: StockCandidate["fundFlowState"] =
    quote.mainNetInflow === undefined ? "unknown" : quote.mainNetInflow > 0 ? "inflow" : quote.mainNetInflow < 0 ? "outflow" : "mixed";
  const activity = evaluateStockActivity({
    quote: stockQuote,
    changePct: quote.changePct,
    tradability
  });
  const dataCompleteness = buildCompleteness(
    true,
    false,
    false,
    quote.mainNetInflow !== undefined,
    Boolean(quote.industry),
    Boolean(quote.industry),
    companyKnowledge
  );

  const candidate: StockCandidate = {
    code,
    name: quote.name,
    price: quote.latest,
    quote: stockQuote,
    sectorName,
    role: "unknown",
    trendState: "unknown",
    fundFlowState,
    buyPointType: "unknown",
    action: "数据不足",
    positionLimitPct: 0,
    invalidCondition: "全 A 初扫仅有盘口证据，需补齐K线、技术、资金流和公司概况后再判断",
    riskFlags: dataCompleteness.blockingReasons,
    dataCompleteness,
    companyKnowledge,
    activity,
    tradability,
    evidenceRefs: [`selection.full_a.${code}.quote`],
    sourceTraces: [
      {
        id: `selection.full_a.${code}.quote`,
        scope: "stock",
        subjectCode: code,
        subjectName: quote.name,
        field: "latest_quote",
        provider: "eastmoney_public",
        providerName: "东方财富公开行情",
        accessPath: "push2delay.eastmoney.com/api/qt/clist/get",
        sourceLabel: "东方财富全 A 最新行情",
        sourceUrl,
        fetchedAt,
        quality: "primary",
        freshness: "delayed"
      },
      ...(matchedSector
        ? [{
            id: `selection.full_a.${code}.sector_match`,
            scope: "stock" as const,
            subjectCode: code,
            subjectName: quote.name,
            field: "sector_attribution",
            provider: "rule_engine" as const,
            providerName: "规则引擎",
            accessPath: "selection/scan-pool industry-sector normalization",
            sourceLabel: membership ? "东方财富板块成分股直接匹配" : "全 A 行业与当前主线归一化匹配",
            sourceUrl: membership?.sourceUrl,
            fetchedAt,
            quality: membership ? "primary" as const : "derived" as const,
            freshness: "realtime" as const
          }]
        : [])
    ]
  };

  if (matchedSector) {
    const matchEvidence = membership
      ? `东方财富${membership.boardType === "concept" ? "概念" : "行业"}板块 ${matchedSector.name} 成分股包含 ${quote.name}。`
      : `东方财富全 A 行情行业为 ${quote.industry}，与当前板块 ${matchedSector.name} 归一化匹配。`;
    candidate.mainlineAttribution = {
      status: membership ? "direct_constituent" : "theme_indirect",
      matchedSector: matchedSector.name,
      membershipSector: quote.industry,
      normalizedMembershipSector: matchedSector.normalizedName || matchedSector.name,
      businessKeywords: [],
      sectorKeywords: [matchedSector.name, ...(matchedSector.sourceNames ?? [])],
      evidence: [matchEvidence],
      blockers: [],
      evidenceChain: {
        constituentEvidence: membership ? [matchEvidence] : [],
        businessEvidence: [],
        industryChainEvidence: membership ? [] : [matchEvidence],
        negativeEvidence: [],
        sourceQuality: membership ? "direct" : "inferred",
        reviewRequired: !membership,
        reviewReason: membership ? undefined : "仅行业字段归一化匹配，尚未取得板块成分股直接证据"
      },
      confidence: "中",
      shouldExclude: false,
      reason: membership
        ? `取得当前主线/板块 ${matchedSector.name} 的成分股直接证据，允许进入策略候选；仍需补充主营业务和技术资金证据。`
        : `全 A 扫描行业字段与当前主线/板块 ${matchedSector.name} 匹配，允许低置信进入策略候选；仍需补充成分股、主营业务和技术资金证据。`
    };
    candidate.evidenceRefs.push(`selection.full_a.${code}.sector_match`);
  }

  const scanSignal = scoreFullAQuoteCandidate(candidate, strategyId);
  candidate.signalScore = scanSignal.score;
  candidate.signalTier = tierFromScanScore(scanSignal.score);
  candidate.signalLabel = labelFromScanScore(scanSignal.score);
  candidate.signalReasons = scanSignal.reasons;

  return candidate;
}

function buildScanCompanyKnowledge(code: string, name: string, industry?: string, matchedSector?: SectorRuleResult, hasConstituentEvidence = false): CompanyKnowledgeCard {
  const missingFields = industry ? ["主营业务", "产业链位置", "财务摘要"] : ["行业", "主营业务", "产业链位置", "财务摘要"];
  return {
    code,
    name,
    industry: industry || "未知行业",
    mainBusiness: "全 A 初扫阶段尚未补充主营业务",
    coreBusiness: "待 F10/财务数据补充",
    productsOrServices: [],
    industryChainPosition: "unknown",
    themeMatchType: hasConstituentEvidence ? "direct_constituent" : matchedSector ? "theme_indirect" : "unknown",
    themeMatch: hasConstituentEvidence ? "strong" : matchedSector ? "medium" : "unknown",
    themeMatchLogic: matchedSector
      ? hasConstituentEvidence
        ? `东方财富板块成分股包含该股票，与当前主线/板块 ${matchedSector.name} 形成直接候选证据。`
        : `行业字段 ${industry} 与当前主线/板块 ${matchedSector.name} 匹配，但主营业务仍需补充。`
      : "全 A 扫描只用于发现盘口候选，不直接判断主线归属。",
    oneLineUnderstanding: industry ? `${name} 属于 ${industry}，主营业务待补充。` : `${name} 行业和主营业务待补充。`,
    currentMoveDriver: "unknown",
    financialTrend: "数据不足",
    fundamentalHighlights: [],
    fundamentalRisks: ["全 A 初扫阶段未接入公司主营、财务和公告原文，不能生成长期持有理由。"],
    longTermWatchItems: ["补充公司概况、主营业务、财务质量和股东结构后再判断。"],
    logicInvalidConditions: ["无法补齐公司基础信息或主营业务与策略逻辑不匹配。"],
    companyKnowledgeState: industry ? "partial" : "missing",
    longTermLogicAllowed: false,
    sourceType: "dataSourceFact",
    missingFields
  };
}

function findMatchingSector(industry: string | undefined, sectors: SectorRuleResult[]) {
  if (!industry) return undefined;
  return sectors.find((sector) =>
    sameSectorName(industry, sector.name) ||
    Boolean(sector.normalizedName && sameSectorName(industry, sector.normalizedName)) ||
    Boolean(sector.sourceNames?.some((name) => sameSectorName(industry, name)))
  );
}

async function buildSectorMembershipMap(sectors: SectorRuleResult[]) {
  const byCode = new Map<string, SectorMembershipEvidence>();
  const warnings: string[] = [];
  const targetSectors = sectors
    .filter((sector) => sector.stage !== "退潮")
    .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
    .slice(0, 8);

  await mapLimit(targetSectors, 3, async (sector) => {
    const boardTypes: Array<"industry" | "concept"> = ["industry", "concept"];
    const failedWarnings: string[] = [];
    for (const boardType of boardTypes) {
      const response = await eastmoneyAdapter.getSectorConstituents(sector.name, boardType, { timeoutMs: 30000, retries: 1 }).catch((error) => ({
        data: null,
        warnings: [`东方财富${boardType === "concept" ? "概念" : "行业"}板块成分获取失败：${sector.name} ${error instanceof Error ? error.message : String(error)}`],
        sourceUrl: undefined
      }));
      const stocks = response.data?.stocks ?? [];
      if (!stocks.length) {
        failedWarnings.push(...response.warnings);
        continue;
      }
      warnings.push(...response.warnings);
      for (const stock of stocks) {
        const code = normalizeStockCode(stock.marketCode || stock.code);
        if (!byCode.has(code)) {
          byCode.set(code, {
            sector,
            boardType,
            boardCode: response.data?.boardCode,
            sourceUrl: response.sourceUrl
          });
        }
      }
      break;
    }
    if (failedWarnings.length && !Array.from(byCode.values()).some((item) => item.sector.name === sector.name)) {
      warnings.push(...failedWarnings);
    }
  });

  if (targetSectors.length) {
    warnings.push(`全 A 扫描已尝试补充当前主线成分股映射：板块 ${targetSectors.length} 个，成分股去重 ${byCode.size} 只。`);
  }
  return { byCode, warnings };
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

function scoreFullAQuoteCandidate(candidate: StockCandidate, strategyId?: SelectionStrategyId) {
  let score = 0;
  const reasons: string[] = [];
  const quote = candidate.quote ?? {};
  const changePct = quote.changePct ?? 0;
  const amount = quote.amount ?? 0;
  const turnover = quote.turnoverRate ?? 0;
  const mainNetInflow = quote.mainNetInflow ?? 0;
  const floatMarketValueYi = (quote.floatMarketValue ?? 0) / 100_000_000;

  if (amount >= 500_000_000) {
    score += 12;
    reasons.push("成交额超过5亿，具备基础流动性。");
  } else if (amount >= 200_000_000) {
    score += 8;
    reasons.push("成交额超过2亿，流动性可进入初筛。");
  } else if (amount >= 100_000_000) {
    score += 4;
    reasons.push("成交额超过1亿，保留低权重观察。");
  }
  if (turnover >= 2 && turnover <= 15) {
    score += 10;
    reasons.push("换手率处于2%-15%的活跃区间。");
  } else if (turnover > 0 && turnover < 2) {
    score += 3;
    reasons.push("换手率偏低，只给少量流动性分。");
  }
  if (mainNetInflow > 0) {
    score += 10;
    reasons.push("当日主力净流入为正。");
  }
  if (changePct > 0 && changePct <= 6) {
    score += 8;
    reasons.push("红盘但未明显追高。");
  }
  if (changePct > 8) {
    score -= 10;
    reasons.push("涨幅超过8%，初筛降权，避免追高。");
  }
  if (candidate.tradability?.status === "涨停不可达") {
    score -= 18;
    reasons.push("涨停不可达，只保留次日观察，不作为当日买点。");
  }
  if (candidate.sectorName !== "未分类") {
    score += 4;
    reasons.push("取得行业/板块字段。");
  }
  if (candidate.mainlineAttribution?.status === "direct_constituent") {
    score += 10;
    reasons.push("命中当前主线/板块成分股直接证据。");
  } else if (candidate.mainlineAttribution?.status === "theme_indirect") {
    score += 4;
    reasons.push("行业字段与当前主线归一化匹配，低置信加分。");
  }

  if (strategyId === "main_force_accumulation") {
    if (mainNetInflow > 0 && changePct <= 5) {
      score += 16;
      reasons.push("主力吸筹偏好：资金为正且当日涨幅未透支。");
    }
    if (turnover >= 1.5 && turnover <= 8) {
      score += 10;
      reasons.push("主力吸筹偏好：温和换手，避免极端短炒。");
    }
    if (floatMarketValueYi >= 30 && floatMarketValueYi <= 1200) {
      score += 8;
      reasons.push("主力吸筹偏好：流通市值处于可承接区间。");
    }
    if (changePct > 6) {
      score -= 18;
      reasons.push("主力吸筹不追日内大涨。");
    }
  } else if (strategyId === "short_term_breakout") {
    if (changePct >= 2 && changePct <= 8) {
      score += 16;
      reasons.push("短期突破偏好：涨幅有动能但未到不可达区。");
    }
    if (amount >= 300_000_000) {
      score += 10;
      reasons.push("短期突破偏好：成交额足够承接。");
    }
    if (turnover >= 3 && turnover <= 20) {
      score += 10;
      reasons.push("短期突破偏好：换手活跃。");
    }
  } else if (strategyId === "sector_rotation") {
    if (candidate.mainlineAttribution?.status === "direct_constituent") {
      score += 18;
      reasons.push("板块轮动偏好：当前主线成分股直接命中。");
    }
    if (amount >= 300_000_000 && changePct > 0) {
      score += 10;
      reasons.push("板块轮动偏好：放量红盘承接。");
    }
  } else if (strategyId === "value_stable" || strategyId === "low_risk_return") {
    if ((quote.peTtm ?? 999) > 0 && (quote.peTtm ?? 999) <= 35) {
      score += strategyId === "value_stable" ? 14 : 10;
      reasons.push("稳健策略偏好：PE处于可解释区间。");
    }
    if ((quote.pb ?? 999) > 0 && (quote.pb ?? 999) <= 4) {
      score += strategyId === "value_stable" ? 14 : 10;
      reasons.push("稳健策略偏好：PB未明显透支。");
    }
    if (changePct <= 4) {
      score += 8;
      reasons.push("稳健策略偏好：当日涨幅不高。");
    }
    if (turnover > 18 || changePct > 7) {
      score -= 16;
      reasons.push("稳健策略降权：高换手或大涨不符合低波动偏好。");
    }
  } else if (strategyId === "growth_potential") {
    if (amount >= 300_000_000 && changePct > 0 && changePct <= 7) {
      score += 14;
      reasons.push("成长潜力偏好：资金活跃且价格未极端透支。");
    }
    if ((quote.peTtm ?? 0) > 0 && (quote.peTtm ?? 0) <= 120) {
      score += 6;
      reasons.push("成长潜力偏好：估值仍处于可解释范围，后续需财务增长验证。");
    }
    if (candidate.mainlineAttribution?.status) {
      score += 6;
      reasons.push("成长潜力偏好：存在主题/主线归属线索。");
    }
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons: Array.from(new Set(reasons)).slice(0, 10)
  };
}

function tierFromScanScore(score: number): StockCandidate["signalTier"] {
  if (score >= 80) return "S";
  if (score >= 68) return "A";
  if (score >= 55) return "B";
  if (score >= 42) return "C";
  return "D";
}

function labelFromScanScore(score: number): StockCandidate["signalLabel"] {
  if (score >= 80) return "核心试错";
  if (score >= 68) return "重点观察";
  if (score >= 55) return "条件等待";
  if (score >= 42) return "风险压制";
  return "剔除/低质";
}
