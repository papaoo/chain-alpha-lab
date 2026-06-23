import { serenityEvidenceProvider, type SerenityFundFlowEvidenceData, type SerenityProfileEvidenceData, type SerenityQuoteEvidenceData } from "@/lib/serenity/evidenceProvider";
import type { TushareFinancialIndicator, TushareForecast, TushareHolderNumber } from "@/lib/tushare/adapter";
import { normalizeStockCode } from "@/lib/strategy/candidateUtils";
import { buildSerenityEvidenceNeeds } from "@/lib/serenity/evidenceNeeds";
import type {
  SerenityCandidateInput,
  SerenityEvidence,
  SerenityEvidenceCoverage,
  SerenityResearchBoundaryLevel,
  SerenityEvidenceStrength,
  SerenityPreviewCandidate
} from "@/lib/serenity/types";

type EvidenceCollectOptions = {
  theme: string;
  limit?: number;
};

type EvidenceCollectResult = {
  candidates: SerenityPreviewCandidate[];
  warnings: string[];
};

export async function enrichSerenityCandidatesWithEvidence(
  candidates: SerenityPreviewCandidate[],
  options: EvidenceCollectOptions
): Promise<EvidenceCollectResult> {
  const limited = candidates.slice(0, Math.min(Math.max(options.limit ?? candidates.length, 1), candidates.length));
  const codes = limited.map((candidate) => candidate.code).filter((code): code is string => Boolean(code));
  const evidenceBundle = await serenityEvidenceProvider.collect(codes);

  return {
    warnings: normalizeEvidenceWarnings(candidates, evidenceBundle.warnings),
    candidates: candidates.map((candidate) => {
      const code = candidate.code ? normalizeStockCode(candidate.code) : undefined;
      const quote = code ? evidenceBundle.quoteMap.get(code) : undefined;
      const profile = code ? evidenceBundle.profileMap.get(code) : undefined;
      const fund = code ? evidenceBundle.fundFlowMap.get(code) : undefined;
      const financial = code ? evidenceBundle.financialMap.get(code) : undefined;
      const holder = code ? evidenceBundle.holderMap.get(code) : undefined;
      const forecast = code ? evidenceBundle.forecastMap.get(code) : undefined;
      return enrichOne(candidate, {
        theme: options.theme,
        quote,
        profile,
        fund,
        financial,
        holder,
        forecast
      });
    })
  };
}

export function serenityPreviewToCandidateInput(candidate: SerenityPreviewCandidate): SerenityCandidateInput {
  const factorBase = factorsFromPreview(candidate);
  return {
    code: candidate.code,
    name: candidate.name,
    market: "A-share",
    chainPosition: candidate.chainPosition,
    constrains: inferConstraint(candidate),
    factors: factorBase,
    penalties: {
      hypeRisk: candidate.evidenceStrength === "weak" ? 2 : candidate.evidenceStrength === "needs_checking" ? 3 : 1,
      liquidity: candidate.amount !== undefined && candidate.amount < 200_000_000 ? 1.5 : 0,
      accountingQuality: candidate.evidenceStrength === "needs_checking" ? 1.5 : 0
    },
    evidence: candidate.evidence ?? buildBaseEvidence(candidate),
    missingProof: candidate.missingProof,
    weakenConditions: buildWeakenConditions(candidate)
  };
}

function enrichOne(
  candidate: SerenityPreviewCandidate,
  input: {
    theme: string;
    quote?: SerenityQuoteEvidenceData;
    profile?: SerenityProfileEvidenceData;
    fund?: SerenityFundFlowEvidenceData;
    financial?: TushareFinancialIndicator;
    holder?: TushareHolderNumber;
    forecast?: TushareForecast;
  }
): SerenityPreviewCandidate {
  const evidence = [...buildBaseEvidence(candidate)];
  const quote = input.quote;
  const profile = input.profile;
  const latestFund = input.fund?.at(-1);
  const businessText = profile ? profile.business ?? profile.businessScope ?? profile.orgProfile ?? "" : "";
  const businessMatch = profile ? evaluateBusinessEvidence(profile, {
    layer: candidate.chainPosition,
    sectorName: candidate.sectorName,
    theme: input.theme
  }) : null;

  if (profile?.business || profile?.industry) {
    evidence.push({
      claim: `${candidate.name} 东方财富 F10 显示行业为${profile.industry ?? "未知"}，主营/产品线索：${truncate(businessText, 120)}${businessMatch?.matchedItems.length ? `；命中主营构成：${formatCompositionMatches(businessMatch.matchedItems)}` : ""}`,
      sourceType: "company_profile",
      sourceLabel: "东方财富 F10 公司概况/主营构成",
      fetchedAt: new Date().toISOString(),
      strength: businessMatch?.strength ?? "weak"
    });
  }

  if (quote) {
    evidence.push({
      claim: `${candidate.name} 最新行情：涨跌幅${formatPct(quote.changePct)}，换手${formatPct(quote.turnoverRate)}，成交额${formatMoney(quote.amount)}，东方财富行业 ${quote.industry ?? "缺失"}。`,
      sourceType: "quote",
      sourceLabel: "东方财富个股实时/延迟行情",
      fetchedAt: quote.updatedAt ?? new Date().toISOString(),
      strength: "weak"
    });
  }

  if (latestFund?.mainNetFlow !== undefined) {
    evidence.push({
      claim: `${candidate.name} 最近资金流：${latestFund.date} 主力净流入${formatMoney(latestFund.mainNetFlow)}，仅作为短线资金证据，不等同产业链证明。`,
      sourceType: "fund_flow",
      sourceLabel: "东方财富个股资金流",
      fetchedAt: latestFund.date,
      strength: "weak"
    });
  }

  if (input.financial) {
    evidence.push({
      claim: `${candidate.name} Tushare 财务指标：ROE ${formatPct(input.financial.roePct)}，营收同比${formatPct(input.financial.revenueChangePct)}，归母净利同比${formatPct(input.financial.netProfitChangePct)}，毛利率${formatPct(input.financial.grossMarginPct)}，资产负债率${formatPct(input.financial.debtRatioPct)}。这是基本面承接证据，不直接证明瓶颈控制力。`,
      sourceType: "financial_indicator",
      sourceLabel: "Tushare fina_indicator",
      fetchedAt: input.financial.endDate,
      strength: financialEvidenceStrength(input.financial)
    });
  }

  if (input.forecast) {
    evidence.push({
      claim: `${candidate.name} Tushare 业绩预告：${input.forecast.type ?? "未标注"}，利润增速区间 ${formatRangePct(input.forecast.pChangeMin, input.forecast.pChangeMax)}，摘要：${truncate(input.forecast.summary ?? "", 80)}；原因：${truncate(input.forecast.changeReason ?? "", 150)}`,
      sourceType: "forecast",
      sourceLabel: "Tushare forecast",
      fetchedAt: compactDateToIso(input.forecast.annDate),
      strength: forecastEvidenceStrength(input.forecast, input.theme)
    });
  }

  if (input.holder?.holderCount !== undefined) {
    const changePct = input.holder.previousHolderCount
      ? ((input.holder.holderCount - input.holder.previousHolderCount) / input.holder.previousHolderCount) * 100
      : undefined;
    evidence.push({
      claim: `${candidate.name} Tushare 股东户数：${input.holder.endDate ?? "未知日期"} 为 ${input.holder.holderCount} 户${changePct !== undefined ? `，较上一期${formatPct(changePct)}` : ""}。这是筹码变化线索，不直接证明产业链瓶颈。`,
      sourceType: "shareholder_count",
      sourceLabel: "Tushare stk_holdernumber",
      fetchedAt: input.holder.endDate,
      strength: changePct !== undefined && changePct <= -3 ? "medium" : "weak"
    });
  }

  const strength = maxEvidenceStrength(candidate.evidenceStrength, inferEvidenceStrength(evidence));
  const missingProof = buildMissingProof(candidate, {
    hasBusiness: Boolean(businessText),
    hasMatchedBusiness: Boolean(businessMatch?.matched),
    hasComposition: Boolean(profile?.businessComposition?.length),
    hasCompositionRatio: Boolean(businessMatch?.matchedItems.some((item) => item.ratio !== undefined))
  });
  const evidenceCoverage = summarizeEvidence(evidence);
  const evidenceNeeds = buildSerenityEvidenceNeeds({ missingProof, evidence, evidenceCoverage });
  const researchBoundary = buildResearchBoundary(strength, evidenceCoverage, missingProof);
  const score = applyEvidenceScoreCap(candidate.score + evidenceBonus(strength, businessText), strength, evidenceCoverage);

  return {
    ...candidate,
    latest: quote?.latest ?? candidate.latest,
    changePct: quote?.changePct ?? candidate.changePct,
    amount: quote?.amount ?? candidate.amount,
    turnoverRate: quote?.turnoverRate ?? candidate.turnoverRate,
    mainNetInflow: quote?.mainNetInflow ?? candidate.mainNetInflow,
    industry: profile?.industry ?? quote?.industry ?? candidate.industry,
    business: businessText || candidate.business,
    evidence,
    evidenceStrength: strength,
    missingProof,
    evidenceSummary: {
      sourceCount: evidenceCoverage.sourceCount,
      strongCount: evidenceCoverage.strongCount,
      mediumCount: evidenceCoverage.mediumCount,
      weakCount: evidenceCoverage.weakCount,
      needsCheckingCount: evidenceCoverage.needsCheckingCount
    },
    evidenceCoverage,
    evidenceNeeds,
    researchBoundary,
    nextResearchChecks: buildNextResearchChecks(candidate, evidenceCoverage, missingProof),
    fetchedAt: new Date().toISOString(),
    score
  };
}

function buildBaseEvidence(candidate: SerenityPreviewCandidate): SerenityEvidence[] {
  const strength: SerenityEvidenceStrength = candidate.source === "latest_mainline" ? "medium" : candidate.evidenceStrength;
  return [
    {
      claim: candidate.matchReason,
      sourceType: candidate.source,
      sourceLabel: candidate.sourceLabel,
      sourceUrl: candidate.sourceUrl,
      fetchedAt: candidate.fetchedAt,
      strength
    }
  ];
}

function factorsFromPreview(candidate: SerenityPreviewCandidate): SerenityCandidateInput["factors"] {
  const evidenceRating = evidenceRatingValue(candidate.evidenceStrength);
  const sourceBoost = candidate.source === "latest_mainline" ? 0.8 : 0;
  const liquidity = candidate.amount !== undefined && candidate.amount > 800_000_000 ? 0.4 : 0;
  const fund = candidate.mainNetInflow !== undefined && candidate.mainNetInflow > 0 ? 0.4 : 0;
  const base = Math.max(1.5, Math.min(4.5, candidate.score / 22));
  return {
    demandInflection: clamp(base + sourceBoost),
    architectureCoupling: clamp(chainSpecificity(candidate.chainPosition)),
    chokepointSeverity: clamp(chainSpecificity(candidate.chainPosition) + 0.3),
    supplierConcentration: clamp(2.7 + sourceBoost / 2),
    expansionDifficulty: clamp(2.8 + (/(认证|材料|设备|封装|测试|高纯|良率)/.test(candidate.chainPosition) ? 0.8 : 0)),
    evidenceQuality: evidenceRating,
    valuationDisconnect: clamp(2.4 + liquidity),
    catalystTiming: clamp(2.5 + sourceBoost + fund)
  };
}

function chainSpecificity(value: string) {
  if (/(材料|设备|特气|封装|测试|光芯片|覆铜板|执行器|认证|良率)/.test(value)) return 3.8;
  if (/(PCB|光模块|电机|芯片)/i.test(value)) return 3.2;
  return 2.5;
}

function evidenceRatingValue(strength: SerenityEvidenceStrength) {
  if (strength === "strong") return 4.5;
  if (strength === "medium") return 3.4;
  if (strength === "weak") return 2.1;
  return 1.2;
}

function inferConstraint(candidate: SerenityPreviewCandidate) {
  if (candidate.business && /(气体|材料|化学|设备|封装|测试|光芯片|PCB|覆铜板|连接器|电机|减速)/.test(candidate.business)) {
    return `${candidate.chainPosition}：${truncate(candidate.business, 80)}`;
  }
  return `${candidate.chainPosition} 的供应、认证、产能或良率线索`;
}

function buildWeakenConditions(candidate: SerenityPreviewCandidate) {
  return [
    "后续公告/财报无法证明相关业务收入、产品或客户导入",
    "公司主营与主题只有板块概念关联，缺少真实产业链位置",
    "主题热度上升但公司资金、成交或核心股地位持续弱于同链条公司",
    ...(candidate.missingProof.length ? [`关键缺口未补齐：${candidate.missingProof.slice(0, 2).join("、")}`] : [])
  ];
}

function buildMissingProof(
  candidate: SerenityPreviewCandidate,
  input: {
    hasBusiness: boolean;
    hasMatchedBusiness: boolean;
    hasComposition: boolean;
    hasCompositionRatio: boolean;
  }
) {
  const baseMissing = candidate.missingProof.filter((item) => {
    const bucket = missingProofBucket(item);
    if (input.hasMatchedBusiness && bucket === "business") return false;
    if (input.hasCompositionRatio && bucket === "filing") return false;
    return true;
  });
  return normalizeMissingProof([
    ...baseMissing,
    ...(!input.hasBusiness ? ["东方财富 F10 主营/产品线索"] : []),
    ...(!input.hasMatchedBusiness ? ["主营/产品与产业链位置匹配证据"] : []),
    ...(!input.hasComposition ? ["财报主营构成项目"] : []),
    ...(!input.hasCompositionRatio ? ["相关业务收入占比"] : []),
    "客户、订单、产能、认证或项目进度证据"
  ]);
}

function normalizeMissingProof(items: string[]) {
  const buckets = new Map<string, string>();
  for (const raw of items.map((item) => item.trim()).filter(Boolean)) {
    const key = missingProofBucket(raw);
    if (!buckets.has(key)) buckets.set(key, missingProofLabel(key, raw));
  }
  return Array.from(buckets.values()).slice(0, 6);
}

function missingProofBucket(text: string) {
  if (/主营|业务|产品|F10|产业链位置|匹配/.test(text)) return "business";
  if (/公告|财报|占比|收入/.test(text)) return "filing";
  if (/客户|订单/.test(text)) return "customer";
  if (/产能|认证|项目|良率|扩产/.test(text)) return "capacity";
  if (/资金|成交|行情|盘口/.test(text)) return "market";
  return text;
}

function missingProofLabel(key: string, fallback: string) {
  const labels: Record<string, string> = {
    business: "主营/产品/产业链位置匹配证据",
    filing: "公告或财报中相关业务收入、占比或产品证据",
    customer: "客户、订单或导入进度证据",
    capacity: "产能、认证、良率或扩产约束证据",
    market: "资金、成交或盘口连续性证据"
  };
  return labels[key] ?? fallback;
}

function evaluateBusinessEvidence(profile: SerenityProfileEvidenceData, context: {
  layer: string;
  sectorName?: string;
  theme: string;
}): {
  matched: boolean;
  strength: SerenityEvidenceStrength;
  matchedItems: Array<{ itemName: string; ratio?: number; reportDate?: string }>;
} {
  const robotActuatorContext = isRobotActuatorContext(context);
  const keywords = robotActuatorContext ? robotActuatorBusinessKeywords() : businessKeywordsForContext(context);
  if (!keywords.length) return { matched: false, strength: "weak", matchedItems: [] };

  const matchedItems = (profile.businessComposition ?? [])
    .filter((item) => textHasAny(item.itemName, keywords) && !businessTextExcluded(item.itemName, context))
    .map((item) => ({ itemName: item.itemName, ratio: item.ratio, reportDate: item.reportDate }));
  const businessText = [profile.business, profile.businessScope, profile.orgProfile].filter(Boolean).join(" ");
  const textMatched = robotActuatorContext
    ? robotActuatorHardBusinessMatched(businessText)
    : textHasAny(businessText, keywords) && !businessTextExcluded(businessText, context);
  const maxRatio = Math.max(0, ...matchedItems.map((item) => item.ratio ?? 0));

  if (matchedItems.length && maxRatio >= 20) return { matched: true, strength: "strong", matchedItems };
  if (matchedItems.length) return { matched: true, strength: "medium", matchedItems };
  if (textMatched) return { matched: true, strength: "medium", matchedItems };
  return { matched: false, strength: "weak", matchedItems };
}

function formatCompositionMatches(items: Array<{ itemName: string; ratio?: number; reportDate?: string }>) {
  return items
    .slice(0, 4)
    .map((item) => `${item.itemName}${item.ratio !== undefined ? ` ${item.ratio.toFixed(2)}%` : ""}${item.reportDate ? `(${item.reportDate.slice(0, 10)})` : ""}`)
    .join("、");
}

function businessKeywordsForLayer(layer: string) {
  const layerText = layer.toLowerCase();
  if (/机器人|执行器|减速器|丝杠|空心杯|谐波|伺服|步进|力传感器|触觉传感器|精密传动|关节模组|人形/.test(layerText)) {
    return ["机器人", "执行器", "减速器", "丝杠", "空心杯", "谐波", "伺服", "步进", "力传感器", "触觉传感器", "关节模组", "无框力矩"];
  }
  if (/光通信|光模块|cpo|硅光/i.test(layerText)) {
    return ["光通信", "光模块", "光芯片", "光器件", "硅光", "cpo", "800g", "1.6t", "收发模块"];
  }
  if (/pcb|覆铜板|连接器|高速材料/i.test(layerText)) {
    return ["pcb", "印制电路", "覆铜板", "连接器", "高速板", "hdi", "电路板"];
  }
  if (/半导体|芯片|晶圆|封装|测试|特气|材料|设备|工艺/.test(layerText)) {
    return ["半导体", "芯片", "集成电路", "晶圆", "封装", "封测", "测试", "特气", "光刻", "刻蚀", "薄膜", "设备", "材料"];
  }
  if (/电池|固态|电解质|锂电/.test(layerText)) {
    return ["电池", "固态", "电解质", "锂电", "正极", "负极", "隔膜"];
  }
  if (/液冷|散热|服务器|数据中心/.test(layerText)) {
    return ["液冷", "散热", "服务器", "数据中心", "冷板", "机柜", "换热"];
  }
  return [];
}

function businessKeywordsForContext(context: { layer: string; sectorName?: string; theme: string }) {
  return businessKeywordsForLayer(`${context.layer} ${context.sectorName ?? ""} ${context.theme}`);
}

function isRobotActuatorContext(context: { layer: string; sectorName?: string; theme: string }) {
  return /机器人|执行器|减速器|丝杠|空心杯|谐波|伺服|步进|力传感器|触觉传感器|精密传动|关节模组|人形/.test(
    `${context.layer} ${context.sectorName ?? ""} ${context.theme}`
  );
}

function robotActuatorBusinessKeywords() {
  return [
    "谐波减速器",
    "rv减速器",
    "rv减速",
    "减速器",
    "滚珠丝杠",
    "行星滚柱丝杠",
    "丝杠",
    "机器人执行器",
    "线性执行器",
    "空心杯电机",
    "无框力矩电机",
    "伺服电机",
    "步进电机",
    "关节模组",
    "机器人关节",
    "力传感器",
    "六维力传感器",
    "触觉传感器",
    "精密传动"
  ];
}

function robotActuatorHardBusinessMatched(text: string) {
  const clean = text.toLowerCase();
  if (!clean.trim()) return false;
  if (businessTextExcluded(clean, { layer: "机器人执行器", theme: "机器人执行器" })) return false;
  return textHasAny(clean, robotActuatorBusinessKeywords());
}

function businessTextExcluded(text: string, context: { layer: string; sectorName?: string; theme: string }) {
  const contextText = `${context.layer} ${context.sectorName ?? ""} ${context.theme}`;
  if (!/机器人|执行器|减速器|丝杠|空心杯|谐波|伺服|步进|力传感器|触觉传感器|精密传动|关节模组|人形/.test(contextText)) return false;
  return /光伏|平板显示|显示设备|半导体切割|硅片切割|金属制品|产品收入|工业$|专用设备制造$/.test(text) &&
    !/机器人|执行器|减速器|丝杠|空心杯|谐波|伺服|步进|力传感器|触觉传感器|关节模组|无框力矩/.test(text);
}

function textHasAny(text: string, keywords: string[]) {
  const clean = text.toLowerCase();
  return keywords.some((keyword) => clean.includes(keyword.toLowerCase()));
}

function businessMatchesTheme(business: string, layer: string) {
  const businessText = business.toLowerCase();
  const layerText = layer.toLowerCase();
  if (!businessText.trim()) return false;

  if (/机器人|执行器|减速器|丝杠|空心杯|谐波|伺服|步进|力传感器|触觉传感器|精密传动|关节模组|人形/.test(layerText)) {
    return /机器人|执行器|减速器|丝杠|空心杯|谐波|伺服|步进|力传感器|触觉传感器/.test(businessText);
  }
  if (/光通信|光模块|cpo|硅光/i.test(layerText)) {
    return /光通信|光模块|光芯片|光器件|硅光|cpo|800g|1\.6t/i.test(businessText);
  }
  if (/pcb|覆铜板|连接器|高速材料/i.test(layerText)) {
    return /pcb|印制电路|覆铜板|连接器|高速板|hdi/i.test(businessText);
  }
  if (/半导体|芯片|晶圆|封装|测试|特气|材料|设备|工艺/.test(layerText)) {
    return /半导体|芯片|集成电路|晶圆|封装|封测|测试|特气|光刻|刻蚀|薄膜|设备|材料/.test(businessText);
  }
  if (/电池|固态|电解质|锂电/.test(layerText)) {
    return /电池|固态|电解质|锂电|正极|负极|隔膜/.test(businessText);
  }
  if (/液冷|散热|服务器|数据中心/.test(layerText)) {
    return /液冷|散热|服务器|数据中心|冷板|机柜|换热/.test(businessText);
  }
  return false;
}

function inferEvidenceStrength(evidence: SerenityEvidence[]): SerenityEvidenceStrength {
  if (evidence.some((item) => item.strength === "strong")) return "strong";
  if (evidence.some((item) => item.strength === "medium")) return "medium";
  if (evidence.some((item) => item.strength === "weak")) return "weak";
  return "needs_checking";
}

function maxEvidenceStrength(left: SerenityEvidenceStrength, right: SerenityEvidenceStrength) {
  const rank = { strong: 4, medium: 3, weak: 2, needs_checking: 1 };
  return rank[left] >= rank[right] ? left : right;
}

function summarizeEvidence(evidence: SerenityEvidence[]): SerenityEvidenceCoverage {
  const fetchedTimes = evidence
    .map((item) => item.fetchedAt)
    .filter((item): item is string => Boolean(item))
    .filter((item) => Number.isFinite(Date.parse(item)))
    .sort((left, right) => Date.parse(right) - Date.parse(left));
  const datedEvidence = evidence.map((item) => classifyEvidenceFreshness(item));
  const freshEvidenceCount = datedEvidence.filter((item) => item === "fresh").length;
  const agingEvidenceCount = datedEvidence.filter((item) => item === "aging").length;
  const staleEvidenceCount = datedEvidence.filter((item) => item === "stale").length;
  const undatedEvidenceCount = datedEvidence.filter((item) => item === "unknown").length;
  const hardEvidence = evidence.filter(isHardEvidence);
  const verifiedHardEvidenceCount = hardEvidence.filter((item) => item.strength === "strong" || item.strength === "medium").length;
  const constraintHardEvidenceCount = evidence.filter(isConstraintHardEvidence).length;
  const datedCount = freshEvidenceCount + agingEvidenceCount + staleEvidenceCount;
  const confidencePct = calculateEvidenceConfidence({
    evidenceCount: evidence.length,
    hardEvidenceCount: hardEvidence.length,
    verifiedHardEvidenceCount,
    constraintHardEvidenceCount,
    freshEvidenceCount,
    agingEvidenceCount,
    staleEvidenceCount,
    undatedEvidenceCount
  });
  return {
    sourceCount: evidence.length,
    strongCount: evidence.filter((item) => item.strength === "strong").length,
    mediumCount: evidence.filter((item) => item.strength === "medium").length,
    weakCount: evidence.filter((item) => item.strength === "weak").length,
    needsCheckingCount: evidence.filter((item) => item.strength === "needs_checking").length,
    hardEvidenceCount: hardEvidence.length,
    verifiedHardEvidenceCount,
    freshEvidenceCount,
    agingEvidenceCount,
    staleEvidenceCount,
    undatedEvidenceCount,
    freshnessLevel: inferFreshnessLevel(evidence.length, datedCount, freshEvidenceCount, agingEvidenceCount, staleEvidenceCount),
    confidencePct,
    sourceLabels: unique(evidence.map((item) => item.sourceLabel)).slice(0, 6),
    latestFetchedAt: fetchedTimes[0]
  };
}

function isHardEvidence(item: SerenityEvidence) {
  return /(company_profile|filing|announcement|financial_indicator|financial_report|customer|capacity|project|patent|standard)/i.test(item.sourceType);
}

function isConstraintHardEvidence(item: SerenityEvidence) {
  return /(filing|announcement|customer|capacity|project|patent|standard)/i.test(item.sourceType);
}

function calculateEvidenceConfidence(input: {
  evidenceCount: number;
  hardEvidenceCount: number;
  verifiedHardEvidenceCount: number;
  constraintHardEvidenceCount: number;
  freshEvidenceCount: number;
  agingEvidenceCount: number;
  staleEvidenceCount: number;
  undatedEvidenceCount: number;
}) {
  if (!input.evidenceCount) return 0;
  const sourceCoverage = Math.min(30, input.evidenceCount * 5 + input.hardEvidenceCount * 5);
  const verifiedHardScore = Math.min(45, input.verifiedHardEvidenceCount * 34);
  const freshnessScore = Math.min(
    25,
    input.freshEvidenceCount * 6 + input.agingEvidenceCount * 3 + input.staleEvidenceCount * 0.5 - input.undatedEvidenceCount * 1.5
  );
  const raw = Math.max(0, Math.min(100, Math.round(sourceCoverage + verifiedHardScore + freshnessScore)));

  if (!input.verifiedHardEvidenceCount) return Math.min(raw, input.hardEvidenceCount ? 42 : 30);
  if (!input.constraintHardEvidenceCount) return Math.min(raw, 78);
  if (input.verifiedHardEvidenceCount === 1 && input.hardEvidenceCount === 1) return Math.min(raw, 78);
  return raw;
}

function classifyEvidenceFreshness(item: SerenityEvidence): "fresh" | "aging" | "stale" | "unknown" {
  if (!item.fetchedAt) return "unknown";
  const time = Date.parse(item.fetchedAt);
  if (!Number.isFinite(time)) return "unknown";
  const ageDays = (Date.now() - time) / 86_400_000;
  if (ageDays <= 7) return "fresh";
  if (ageDays <= 45) return "aging";
  return "stale";
}

function inferFreshnessLevel(
  sourceCount: number,
  datedCount: number,
  freshEvidenceCount: number,
  agingEvidenceCount: number,
  staleEvidenceCount: number
): SerenityEvidenceCoverage["freshnessLevel"] {
  if (!sourceCount || !datedCount) return "unknown";
  if (freshEvidenceCount >= Math.ceil(sourceCount * 0.45)) return "fresh";
  if (freshEvidenceCount + agingEvidenceCount >= Math.ceil(sourceCount * 0.5)) return "aging";
  if (staleEvidenceCount >= Math.ceil(sourceCount * 0.5)) return "stale";
  return "unknown";
}

function buildResearchBoundary(
  strength: SerenityEvidenceStrength,
  coverage: SerenityEvidenceCoverage,
  missingProof: string[]
): { level: SerenityResearchBoundaryLevel; label: string; text: string } {
  if (coverage.verifiedHardEvidenceCount > 0 && coverage.strongCount > 0 && missingProof.length <= 1 && coverage.freshnessLevel !== "stale" && coverage.freshnessLevel !== "unknown") {
    return {
      level: "evidence_backed",
      label: "证据支撑较强",
      text: "已有强证据支撑瓶颈位置，可进入深入估值、催化和反证研究；仍不等同交易建议。"
    };
  }
  if (coverage.verifiedHardEvidenceCount >= 1 && strength !== "needs_checking" && coverage.freshnessLevel !== "stale") {
    return {
      level: "candidate_watch",
      label: "研究候选",
      text: "已有主营或行业来源线索，但公告/财报/客户/产能证据仍需补齐，只适合作为优先研究名单。"
    };
  }
  if (strength === "weak" || coverage.weakCount > coverage.mediumCount + coverage.strongCount || !coverage.verifiedHardEvidenceCount) {
    return {
      level: "needs_hard_evidence",
      label: "先补硬证据",
      text: "当前更多是板块、行情或资金线索，不能证明公司控制瓶颈；先补主营、公告、财报、客户或产能证据。"
    };
  }
  return {
    level: "research_only",
    label: "只作线索",
    text: "证据链尚不完整，只能用于下一步检索和复核，不能转成买卖或仓位判断。"
  };
}

function buildNextResearchChecks(
  candidate: SerenityPreviewCandidate,
  coverage: SerenityEvidenceCoverage,
  missingProof: string[]
) {
  const checks = [
    ...missingProof.map((item) => `补证：${item}`),
    ...(coverage.verifiedHardEvidenceCount ? [] : [`核对 ${candidate.name} 的年报/半年报/公告/互动易，确认主营和产品是否真的对应 ${candidate.chainPosition}`]),
    ...((coverage.freshnessLevel === "stale" || coverage.freshnessLevel === "unknown") ? [`刷新 ${candidate.name} 的 F10、公告、财报和行情证据，当前证据新鲜度不足`] : []),
    `验证 ${candidate.name} 是否有客户导入、订单、产能、认证、良率或项目进展证据`,
    "把行情和资金表现只作为短线关注度，不作为产业链瓶颈证明"
  ];
  return unique(checks).slice(0, 5);
}

function evidenceBonus(strength: SerenityEvidenceStrength, business?: string) {
  return (strength === "medium" ? 4 : strength === "strong" ? 7 : 0) + (business ? 2 : 0);
}

function financialEvidenceStrength(item: TushareFinancialIndicator): SerenityEvidenceStrength {
  const goodGrowth = (item.revenueChangePct ?? -Infinity) >= 20 || (item.netProfitChangePct ?? -Infinity) >= 20;
  const strongProfitability = (item.roePct ?? -Infinity) >= 12 && (item.grossMarginPct ?? -Infinity) >= 20;
  if (goodGrowth && strongProfitability) return "medium";
  if ((item.revenueChangePct ?? -Infinity) < -20 || (item.netProfitChangePct ?? -Infinity) < -30) return "weak";
  return "weak";
}

function forecastEvidenceStrength(item: TushareForecast, theme: string): SerenityEvidenceStrength {
  const text = `${item.summary ?? ""} ${item.changeReason ?? ""}`;
  const growth = Math.max(item.pChangeMin ?? -Infinity, item.pChangeMax ?? -Infinity);
  if (growth >= 30 && forecastMentionsTheme(text, theme)) return "medium";
  if (growth >= 30) return "weak";
  return "weak";
}

function forecastMentionsTheme(text: string, theme: string) {
  const clean = `${text} ${theme}`.toLowerCase();
  if (/cpo|光模块|光通信|高速光|算力|ai|服务器|数据中心/.test(clean)) return /cpo|光模块|光通信|高速光|算力|ai|服务器|数据中心/.test(text.toLowerCase());
  if (/半导体|芯片|封装|测试|晶圆|设备|材料/.test(clean)) return /半导体|芯片|封装|测试|晶圆|设备|材料/.test(text);
  if (/机器人|执行器|减速器|丝杠|伺服|传感器/.test(clean)) return /机器人|执行器|减速器|丝杠|伺服|传感器/.test(text);
  return false;
}

function compactDateToIso(value?: string) {
  if (!value || !/^\d{8}$/.test(value)) return value;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00.000Z`;
}

function formatRangePct(min?: number, max?: number) {
  if (min === undefined && max === undefined) return "缺失";
  if (min !== undefined && max !== undefined) return `${formatPct(min)} ~ ${formatPct(max)}`;
  return formatPct(min ?? max);
}

function applyEvidenceScoreCap(
  score: number,
  strength: SerenityEvidenceStrength,
  coverage: SerenityEvidenceCoverage
) {
  let capped = score;
  if (!coverage.verifiedHardEvidenceCount) capped = Math.min(capped, 58);
  if (strength === "weak") capped = Math.min(capped, 62);
  if (strength === "needs_checking") capped = Math.min(capped, 48);
  if (coverage.freshnessLevel === "stale") capped = Math.min(capped, 60);
  if (coverage.freshnessLevel === "unknown") capped = Math.min(capped, 56);
  return Number(Math.max(0, Math.min(100, capped)).toFixed(1));
}

function clamp(value: number) {
  return Number(Math.max(0, Math.min(5, value)).toFixed(1));
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeEvidenceWarnings(candidates: SerenityPreviewCandidate[], warnings: string[]) {
  const uniqueWarnings = unique(warnings);
  if (!uniqueWarnings.length) return [];
  if (!candidates.length) return uniqueWarnings.slice(0, 12);

  const fetchFailures = uniqueWarnings.filter((warning) => /失败|fetch failed|timeout|超时|网络|解析错误/i.test(warning));
  const otherWarnings = uniqueWarnings.filter((warning) => !fetchFailures.includes(warning));
  if (!fetchFailures.length) return otherWarnings.slice(0, 8);

  return [
    ...otherWarnings,
    `部分补证来源未覆盖：${fetchFailures.length} 条行情/F10/资金流请求失败，系统不会用猜测补齐；对应候选会保留为弱证据或待补证。`
  ].slice(0, 8);
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function formatPct(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return "缺失";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatMoney(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return "缺失";
  const abs = Math.abs(value);
  if (abs >= 100000000) return `${(value / 100000000).toFixed(2)}亿`;
  if (abs >= 10000) return `${(value / 10000).toFixed(2)}万`;
  return value.toFixed(0);
}
