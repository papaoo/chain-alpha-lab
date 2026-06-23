import { getAnalysisReport, listAnalysisReports } from "@/lib/db/reports";
import { serenityCandidateUniverseProvider, type SerenityCandidateSectorHint } from "@/lib/serenity/candidateUniverseProvider";
import { normalizeStockCode } from "@/lib/strategy/candidateUtils";
import type { AnalysisReport, SectorConstituentStock, StockCandidate } from "@/lib/types";
import type { SerenityMarket, SerenityPreviewCandidate, SerenityThemeSuggestion } from "@/lib/serenity/types";

type CandidateBuildInput = {
  theme: string;
  market: SerenityMarket;
  normalizedTheme?: SerenityThemeSuggestion;
  limit?: number;
};

type CandidateBuildResult = {
  candidates: SerenityPreviewCandidate[];
  warnings: string[];
};

const THEME_SECTOR_MAP: Record<string, SerenityCandidateSectorHint[]> = {
  "ai-semiconductor": [
    { name: "半导体", type: "industry", layer: "算力芯片/设计" },
    { name: "半导体设备", type: "concept", layer: "关键设备/工艺平台" },
    { name: "半导体材料", type: "concept", layer: "材料与耗材" },
    { name: "先进封装", type: "concept", layer: "先进封装与测试" }
  ],
  "cpo-optical": [
    { name: "CPO", type: "concept", layer: "光模块/系统集成" },
    { name: "通信设备", type: "industry", layer: "光模块/系统集成" },
    { name: "光通信模块", type: "concept", layer: "激光器/光芯片器件" },
    { name: "PCB", type: "concept", layer: "上游材料/衬底" }
  ],
  "advanced-packaging": [
    { name: "先进封装", type: "concept", layer: "先进封装与测试" },
    { name: "半导体", type: "industry", layer: "关键设备/工艺平台" },
    { name: "封测", type: "concept", layer: "先进封装与测试" }
  ],
  "electronic-special-gas": [
    { name: "电子特气", type: "concept", layer: "高纯气体制备" },
    { name: "工业气体", type: "concept", layer: "稳定供应" },
    { name: "半导体材料", type: "concept", layer: "客户认证" }
  ],
  "robot-actuator": [
    { name: "机器人执行器", type: "concept", layer: "精密传动" },
    { name: "人形机器人", type: "concept", layer: "总成" },
    { name: "减速器", type: "concept", layer: "精密传动" },
    { name: "电机", type: "industry", layer: "电机" }
  ],
  "solid-state-battery": [
    { name: "固态电池", type: "concept", layer: "电解质材料" },
    { name: "锂电池", type: "concept", layer: "电池制造" },
    { name: "电池", type: "industry", layer: "电池制造" }
  ],
  "liquid-cooling": [
    { name: "液冷服务器", type: "concept", layer: "冷板/泵阀" },
    { name: "数据中心", type: "concept", layer: "工程交付" },
    { name: "服务器", type: "concept", layer: "机柜集成" }
  ],
  "high-speed-pcb": [
    { name: "PCB", type: "concept", layer: "PCB制造" },
    { name: "元件", type: "industry", layer: "PCB制造" },
    { name: "覆铜板", type: "concept", layer: "覆铜板" },
    { name: "高速连接器", type: "concept", layer: "客户认证" }
  ]
};

export async function buildSerenityCandidatePreview(input: CandidateBuildInput): Promise<CandidateBuildResult> {
  if (input.market !== "A-share") {
    return {
      candidates: [],
      warnings: ["当前系统只优先支持 A 股候选池自动生成，其他市场暂不自动拉候选。"]
    };
  }

  const warnings: string[] = [];
  const byCode = new Map<string, SerenityPreviewCandidate>();
  const keywordSet = buildKeywordSet(input.theme, input.normalizedTheme);
  const limit = Math.min(Math.max(input.limit ?? 24, 6), 60);

  for (const candidate of candidatesFromLatestReport(input, keywordSet)) {
    mergeCandidate(byCode, candidate);
  }

  const sectorHints = sectorHintsForTheme(input.theme, input.normalizedTheme);
  const sectorLimit = Math.max(8, Math.ceil(limit / Math.max(sectorHints.length, 1)));
  const sectorResults = await serenityCandidateUniverseProvider.fetchSectorConstituents(sectorHints.slice(0, 5), { timeoutMs: 25000, retries: 1 });

  for (const { hint, result } of sectorResults) {
    warnings.push(...(result.warnings ?? []));
    const fetchedAt = new Date().toISOString();
    for (const stock of (result.data?.stocks ?? []).slice(0, sectorLimit)) {
      mergeCandidate(byCode, fromSectorConstituent(stock, hint.name, hint.layer, fetchedAt));
    }
  }

  const candidates = Array.from(byCode.values())
    .sort((left, right) => right.score - left.score || (right.amount ?? 0) - (left.amount ?? 0))
    .slice(0, limit)
    .map(normalizePreviewMissingProof);

  if (!candidates.length) warnings.push("没有生成自动候选池：最新报告和东方财富相关板块均未提供可用候选。");
  return { candidates, warnings: normalizeCandidateBuildWarnings(candidates, warnings) };
}

function candidatesFromLatestReport(input: CandidateBuildInput, keywords: Set<string>): SerenityPreviewCandidate[] {
  const latest = latestDisplayableReport();
  if (!latest) return [];
  const result: SerenityPreviewCandidate[] = [];

  for (const sector of latest.factPackage.sectors.slice(0, 8)) {
    const sectorMatch = textMatchesKeywords(sector.name, keywords);
    if (!sectorMatch) continue;
    for (const stock of sector.coreStocks.slice(0, 6)) {
      const stockText = [stock.name, sector.name, stock.role, stock.limitStatus].filter(Boolean).join(" ");
      if (!passesThemeStrictGate(stockText, input.normalizedTheme, keywords)) continue;
      result.push({
        code: normalizeStockCode(stock.marketCode || stock.code),
        name: stock.name,
        source: "latest_mainline",
        sourceLabel: `最新主线核心股：${sector.name}`,
        fetchedAt: latest.createdAt,
        sectorName: sector.name,
        chainPosition: inferLayerFromText(sector.name, input.normalizedTheme),
        matchReason: `出现在最新分析报告的 ${sector.name} 主线核心结构中，角色为 ${stock.role}，但仍需主营/公告验证是否真属于 ${input.theme}。`,
        evidenceStrength: "medium",
        missingProof: ["主营业务匹配证据", "公告/财报中与主题相关的业务占比", "客户或订单证据"],
        changePct: stock.changePct,
        amount: stock.amount,
        turnoverRate: stock.turnoverRate,
        mainNetInflow: stock.mainNetInflow,
        score: 70 + Math.min(12, stock.score / 8)
      });
    }
  }

  for (const candidate of latest.factPackage.candidates.slice(0, 20)) {
    const text = [
      candidate.name,
      candidate.sectorName,
      candidate.companyKnowledge?.mainBusiness,
      candidate.companyKnowledge?.coreBusiness,
      candidate.mainlineAttribution?.matchedSector,
      candidate.mainlineAttribution?.reason
    ].filter(Boolean).join(" ");
    if (!textMatchesKeywords(text, keywords)) continue;
    if (!passesThemeStrictGate(text, input.normalizedTheme, keywords)) continue;
    result.push(fromStockCandidate(candidate, input.theme, input.normalizedTheme));
  }

  return result;
}

function fromStockCandidate(candidate: StockCandidate, theme: string, normalizedTheme?: SerenityThemeSuggestion): SerenityPreviewCandidate {
  const hasBusiness = Boolean(candidate.companyKnowledge?.mainBusiness);
  const themeMatch = candidate.companyKnowledge?.themeMatch;
  return {
    code: normalizeStockCode(candidate.code),
    name: candidate.name,
    source: "latest_mainline",
    sourceLabel: `最新报告候选股：${candidate.sectorName}`,
    fetchedAt: candidate.quote?.fetchedAt,
    sectorName: candidate.sectorName,
    chainPosition: inferLayerFromText(`${candidate.sectorName} ${candidate.companyKnowledge?.industryChainPosition ?? ""}`, normalizedTheme),
    matchReason: candidate.mainlineAttribution?.reason || `来自最新报告候选池，需继续验证是否真正对应 ${theme}。`,
    evidenceStrength: themeMatch === "strong" ? "medium" : themeMatch === "medium" ? "medium" : "weak",
    missingProof: [
      ...(hasBusiness ? [] : ["主营业务证据"]),
      "公告/财报中与主题相关的收入或产品证据",
      "客户、订单、产能或认证证据"
    ],
    changePct: candidate.quote?.changePct,
    amount: candidate.quote?.amount,
    turnoverRate: candidate.quote?.turnoverRate,
    mainNetInflow: candidate.quote?.mainNetInflow,
    score: 54 + (candidate.signalScore ?? candidate.strengthScore ?? 0) / 5
  };
}

function fromSectorConstituent(stock: SectorConstituentStock, sectorName: string, layer: string, fetchedAt: string): SerenityPreviewCandidate {
  return {
    code: normalizeStockCode(stock.marketCode || stock.code),
    name: stock.name,
    source: "eastmoney_sector",
    sourceLabel: `东方财富板块成分：${sectorName}`,
    fetchedAt,
    sectorName,
    chainPosition: layer,
    matchReason: `属于东方财富 ${sectorName} 板块成分，说明具备板块归属线索；是否接近真实瓶颈仍需主营、公告和财报验证。`,
    evidenceStrength: "weak",
    missingProof: ["主营业务匹配证据", "公告/财报中相关业务占比", "客户或订单证据", "产能或认证证据"],
    changePct: stock.changePct,
    amount: stock.amount,
    turnoverRate: stock.turnoverRate,
    mainNetInflow: stock.mainNetInflow,
    score: 42 + Math.min(16, Math.max(0, stock.changePct ?? 0)) + Math.min(10, Math.max(0, (stock.turnoverRate ?? 0) / 2))
  };
}

function mergeCandidate(byCode: Map<string, SerenityPreviewCandidate>, candidate: SerenityPreviewCandidate) {
  const key = candidate.code ? normalizeStockCode(candidate.code) : candidate.name;
  const existing = byCode.get(key);
  if (!existing) {
    byCode.set(key, candidate);
    return;
  }
  const better = candidate.score > existing.score ? candidate : existing;
  const other = better === candidate ? existing : candidate;
  byCode.set(key, {
    ...better,
    score: Math.max(candidate.score, existing.score) + 4,
    sourceLabel: Array.from(new Set([better.sourceLabel, other.sourceLabel])).join("；"),
    fetchedAt: better.fetchedAt ?? other.fetchedAt,
    matchReason: `${better.matchReason}；同时命中：${other.sourceLabel}`,
    evidenceStrength: maxEvidence(existing.evidenceStrength, candidate.evidenceStrength),
    missingProof: normalizeSerenityMissingProof([...existing.missingProof, ...candidate.missingProof])
  });
}

function normalizePreviewMissingProof(candidate: SerenityPreviewCandidate): SerenityPreviewCandidate {
  return {
    ...candidate,
    missingProof: normalizeSerenityMissingProof(candidate.missingProof)
  };
}

function normalizeSerenityMissingProof(items: string[]) {
  const buckets = new Map<string, string>();
  for (const raw of items.map((item) => item.trim()).filter(Boolean)) {
    const key = serenityMissingProofBucket(raw);
    if (!buckets.has(key)) buckets.set(key, serenityMissingProofLabel(key, raw));
  }
  return Array.from(buckets.values()).slice(0, 6);
}

function serenityMissingProofBucket(text: string) {
  if (/主营|业务|产品|F10|产业链位置|匹配/.test(text)) return "business";
  if (/公告|财报|占比|收入/.test(text)) return "filing";
  if (/客户|订单|导入/.test(text)) return "customer";
  if (/产能|认证|项目|良率|扩产/.test(text)) return "capacity";
  if (/资金|成交|行情|盘口/.test(text)) return "market";
  return text;
}

function serenityMissingProofLabel(key: string, fallback: string) {
  const labels: Record<string, string> = {
    business: "主营/产品/产业链位置匹配证据",
    filing: "公告或财报中相关业务收入、占比或产品证据",
    customer: "客户、订单或导入进度证据",
    capacity: "产能、认证、良率或扩产约束证据",
    market: "资金、成交或盘口连续性证据"
  };
  return labels[key] ?? fallback;
}

function maxEvidence(left: SerenityPreviewCandidate["evidenceStrength"], right: SerenityPreviewCandidate["evidenceStrength"]) {
  const rank = { strong: 4, medium: 3, weak: 2, needs_checking: 1 };
  return rank[left] >= rank[right] ? left : right;
}

function latestDisplayableReport() {
  const latest = listAnalysisReports(1, 0, { displayableOnly: true })[0];
  return latest ? getAnalysisReport(latest.id, "none") : null;
}

function buildKeywordSet(theme: string, normalizedTheme?: SerenityThemeSuggestion) {
  const genericWords = new Set(["ai", "材料", "设备", "测试", "封装", "客户", "订单", "制造", "供应链", "国产替代", "高端"]);
  const raw = [
    theme,
    normalizedTheme?.name,
    normalizedTheme?.category,
    ...(normalizedTheme?.aliases ?? []),
    ...(normalizedTheme?.chainKeywords ?? [])
  ].filter(Boolean) as string[];
  const tokens = new Set<string>();
  for (const item of raw) {
    const full = cleanText(item);
    if (full.length >= 2 && !genericWords.has(full)) tokens.add(full);
    for (const part of item.split(/[、/,\s]+/)) {
      const clean = cleanText(part);
      if (clean.length >= 2 && !genericWords.has(clean)) tokens.add(clean);
    }
  }
  for (const compound of buildCompoundKeywords(normalizedTheme)) tokens.add(compound);
  return tokens;
}

function passesThemeStrictGate(text: string, normalizedTheme: SerenityThemeSuggestion | undefined, keywords: Set<string>) {
  if (!normalizedTheme) return textMatchesKeywords(text, keywords);
  const clean = cleanText(text);
  if (!clean) return false;

  if (isThemeExcluded(clean, normalizedTheme)) return false;
  if (normalizedTheme.id === "robot-actuator") return hasRobotActuatorEvidence(clean);

  const required = strictThemeKeywords(normalizedTheme);
  if (!required.length) return textMatchesKeywords(text, keywords);
  return required.some((keyword) => clean.includes(keyword));
}

function strictThemeKeywords(normalizedTheme: SerenityThemeSuggestion) {
  if (normalizedTheme.id === "robot-actuator") return ["机器人", "人形机器人", "减速器", "丝杠", "执行器", "空心杯", "谐波", "关节模组", "伺服电机", "步进电机", "力传感器", "触觉传感器"];
  if (normalizedTheme.id === "cpo-optical") return ["cpo", "光模块", "光芯片", "光器件", "光通信", "硅光", "800g", "1.6t"];
  if (normalizedTheme.id === "ai-semiconductor") return ["半导体", "芯片", "集成电路", "晶圆", "光刻", "刻蚀", "电子特气", "先进封装"];
  if (normalizedTheme.id === "high-speed-pcb") return ["pcb", "覆铜板", "高速板", "连接器", "hdi"];
  return [];
}

function isThemeExcluded(cleanTextValue: string, normalizedTheme: SerenityThemeSuggestion) {
  if (normalizedTheme.id === "robot-actuator") {
    const robotTerms = ["机器人", "人形机器人", "减速器", "丝杠", "执行器", "空心杯", "谐波", "关节模组", "伺服", "步进", "力传感器", "触觉传感器"];
    const opticalCommunicationTerms = ["cpo", "光模块", "光通信", "光芯片", "光器件", "硅光", "通信设备", "收发模块"];
    return hasAny(cleanTextValue, opticalCommunicationTerms) && !hasAny(cleanTextValue, robotTerms);
  }
  return false;
}

function hasRobotActuatorEvidence(cleanTextValue: string) {
  const hardTerms = ["机器人", "人形机器人", "减速器", "丝杠", "执行器", "空心杯", "谐波", "关节模组", "rv减速", "谐波减速"];
  if (hasAny(cleanTextValue, hardTerms)) return true;

  const motorTerms = ["伺服电机", "步进电机", "无框力矩电机", "空心杯电机"];
  if (hasAny(cleanTextValue, motorTerms)) return true;

  const sensorTerms = ["六维力传感器", "力传感器", "触觉传感器"];
  if (hasAny(cleanTextValue, sensorTerms)) return true;

  return false;
}

function hasAny(text: string, needles: string[]) {
  return needles.some((needle) => text.includes(needle));
}

function normalizeCandidateBuildWarnings(candidates: SerenityPreviewCandidate[], warnings: string[]) {
  const uniqueWarnings = Array.from(new Set(warnings.filter(Boolean)));
  if (!candidates.length) return uniqueWarnings.slice(0, 12);

  const fetchFailures = uniqueWarnings.filter((warning) => /失败|fetch failed|timeout|超时|网络|解析错误/i.test(warning));
  const otherWarnings = uniqueWarnings.filter((warning) => !fetchFailures.includes(warning));
  if (!fetchFailures.length) return otherWarnings.slice(0, 8);

  return [
    ...otherWarnings,
    `部分候选来源未覆盖：${fetchFailures.length} 条板块/补证请求失败，当前候选已由可用来源生成；失败来源不会被静默补值。`
  ].slice(0, 8);
}

function buildCompoundKeywords(normalizedTheme?: SerenityThemeSuggestion) {
  if (!normalizedTheme) return [];
  if (normalizedTheme.id === "ai-semiconductor") {
    return ["半导体", "ai半导体", "ai芯片", "算力芯片", "半导体设备", "半导体材料", "先进封装", "电子特气", "光刻胶", "集成电路"];
  }
  if (normalizedTheme.id === "cpo-optical") {
    return ["cpo", "光模块", "光芯片", "光器件", "硅光", "光通信", "800g", "1.6t", "高速光通信"];
  }
  if (normalizedTheme.id === "high-speed-pcb") {
    return ["pcb", "高速pcb", "覆铜板", "高速板", "连接器", "服务器pcb", "交换机pcb"];
  }
  return [];
}

function sectorHintsForTheme(theme: string, normalizedTheme?: SerenityThemeSuggestion) {
  const mapped = normalizedTheme?.id ? THEME_SECTOR_MAP[normalizedTheme.id] : undefined;
  if (mapped?.length) return mapped;
  return [
    { name: normalizedTheme?.name || theme, type: "concept" as const, layer: "主题相关层级" },
    { name: normalizedTheme?.category || theme, type: "industry" as const, layer: "主题相关层级" }
  ];
}

function inferLayerFromText(text: string, normalizedTheme?: SerenityThemeSuggestion) {
  const clean = cleanText(text);
  const layers = normalizedTheme?.chainKeywords ?? [];
  if (/设备|工艺|刻蚀|沉积|光刻/.test(clean)) return "关键设备/工艺平台";
  if (/材料|特气|光刻胶|树脂|硅片|覆铜板/.test(clean)) return "材料与耗材";
  if (/封装|封测|测试|chiplet|hbm/.test(clean)) return "先进封装与测试";
  if (/光模块|光芯片|光器件|通信|cpo|硅光/.test(clean)) return "光通信核心器件";
  if (/pcb|连接器|元件/.test(clean)) return "高速材料/PCB";
  if (/机器人|电机|减速器|丝杠|执行器/.test(clean)) return "机器人执行器";
  return layers[0] || normalizedTheme?.category || "待确认产业链位置";
}

function textMatchesKeywords(text: string, keywords: Set<string>) {
  const clean = cleanText(text);
  if (!clean) return false;
  for (const keyword of keywords) {
    if (keyword.length >= 2 && clean.includes(keyword)) return true;
  }
  return false;
}

function cleanText(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[，。、“”‘’（）()\-_/]/g, "");
}
