import type { SelectionPick, SelectionRunRecord, SelectionRunSummary } from "@/lib/selection/types";

export const SELECTION_ACTION_ORDER: SelectionPick["action"][] = ["重点观察", "跟踪观察", "条件等待", "剔除"];
export const SELECTION_TIER_ORDER: SelectionPick["tier"][] = ["S", "A", "B", "C", "D"];

export interface SelectionAggregateItem {
  key: string;
  label: string;
  count: number;
  score?: number;
  sampleCodes: string[];
}

export interface SelectionRunInsight {
  candidateCount: number;
  pickCount: number;
  rejectedCount: number;
  selectionRate: number;
  avgPickScore: number | null;
  avgAllScore: number | null;
  bestPick: Pick<SelectionPick, "code" | "name" | "score" | "tier" | "action"> | null;
  actionCounts: Record<SelectionPick["action"], number>;
  tierCounts: Record<SelectionPick["tier"], number>;
  sectorDistribution: SelectionAggregateItem[];
  topPositiveFactors: SelectionAggregateItem[];
  topBlockers: SelectionAggregateItem[];
  topWarnings: SelectionAggregateItem[];
  actionabilityStats: SelectionActionabilityStats;
  qualityLabel: string;
  qualityTone: "emerald" | "cyan" | "amber" | "rose" | "slate";
  quickRead: string;
  noPickDiagnosis: SelectionNoPickDiagnosis | null;
  serenityInsight: SelectionSerenityInsight | null;
}

export interface SelectionActionabilityStats {
  total: number;
  actionable: number;
  referenceOnly: number;
  notActionable: number;
  unknown: number;
  label: string;
  tone: "emerald" | "cyan" | "amber" | "rose" | "slate";
  summary: string;
}

export interface SelectionSerenityStockItem {
  code: string;
  name: string;
  score: number;
  tier: SelectionPick["tier"];
  action: SelectionPick["action"];
  theme: string;
  priority: NonNullable<SelectionPick["serenityTag"]>["priority"];
  serenityScore: number;
  evidenceStrength: NonNullable<SelectionPick["serenityTag"]>["evidenceStrength"];
  chainPosition: string;
  verdict: string;
}

export interface SelectionSerenityInsight {
  taggedCount: number;
  taggedPickCount: number;
  taggedRejectedCount: number;
  topPriorityCount: number;
  strongOrMediumEvidenceCount: number;
  weakOrPendingEvidenceCount: number;
  themeDistribution: SelectionAggregateItem[];
  chainDistribution: SelectionAggregateItem[];
  topTaggedStocks: SelectionSerenityStockItem[];
  quickRead: string;
}

export interface SelectionPickDecisionPlan {
  label: string;
  tone: "cyan" | "amber" | "rose" | "emerald" | "slate";
  summary: string;
  watchPoints: string[];
  invalidPoints: string[];
  riskPoints: string[];
}

export interface SelectionNoPickDiagnosis {
  title: string;
  tone: "amber" | "rose" | "slate";
  summary: string;
  bestRejected: Pick<SelectionPick, "code" | "name" | "score" | "tier" | "action"> | null;
  completeSnapshotCount: number;
  partialSnapshotCount: number;
  missingSnapshotCount: number;
  topBlockers: SelectionAggregateItem[];
  nextChecks: string[];
}

const LEGACY_ACTION_MAP: Record<string, SelectionPick["action"]> = {
  "\u95b2\u5d87\u5063\u7459\u509a\u7642": "重点观察",
  "\u74ba\u71bb\u91dc\u7459\u509a\u7642": "跟踪观察",
  "\u93c9\u2032\u6b22\u7edb\u590a\u7ddf": "条件等待",
  "\u9353\u65c8\u6ace": "剔除"
};

export function normalizeSelectionAction(action: unknown): SelectionPick["action"] {
  if (typeof action !== "string") return "条件等待";
  if (SELECTION_ACTION_ORDER.includes(action as SelectionPick["action"])) return action as SelectionPick["action"];
  return LEGACY_ACTION_MAP[action] ?? "条件等待";
}

export function isSelectionRejected(action: unknown) {
  return normalizeSelectionAction(action) === "剔除";
}

export function buildSelectionRunInsight(run: SelectionRunRecord): SelectionRunInsight {
  const picks = run.picks.map(normalizePickAction);
  const rejected = run.rejected.map(normalizePickAction);
  const all = [...picks, ...rejected];
  const candidateCount = run.candidateCount || all.length;
  const pickCount = run.pickCount || picks.length;
  const rejectedCount = Math.max(0, candidateCount - pickCount);
  const selectionRate = candidateCount > 0 ? pickCount / candidateCount : 0;
  const avgPickScore = average(picks.map((pick) => pick.score));
  const avgAllScore = average(all.map((pick) => pick.score));
  const bestPick = all
    .slice()
    .sort((a, b) => b.score - a.score)[0] ?? null;

  const topBlockers = aggregateText(
    all.flatMap((pick) => [
      ...pick.blockers.map((item) => ({ label: compactBlockerText(item), code: pick.code })),
      ...pick.scoreFactors.flatMap((factor) => factor.blockers.map((item) => ({ label: compactBlockerText(item), code: pick.code })))
    ]),
    8
  );

  const topPositiveFactors = aggregateFactors(picks.length ? picks : all, 8);
  const sectorDistribution = aggregateText(all.map((pick) => ({ label: pick.sectorName || "未识别板块", code: pick.code })), 8);
  const topWarnings = aggregateText(run.warnings.map((warning) => ({ label: warning, code: "" })), 5);
  const actionCounts = countByAction(all);
  const tierCounts = countByTier(all);
  const actionabilityStats = buildActionabilityStats(all);
  const quality = judgeQuality(run.status, candidateCount, pickCount, avgPickScore, run.warnings.length, topBlockers);
  const noPickDiagnosis = buildNoPickDiagnosis(candidateCount, pickCount, all, topBlockers, run.warnings);
  const serenityInsight = buildSerenityInsight(picks, rejected);

  return {
    candidateCount,
    pickCount,
    rejectedCount,
    selectionRate,
    avgPickScore,
    avgAllScore,
    bestPick: bestPick
      ? {
          code: bestPick.code,
          name: bestPick.name,
          score: bestPick.score,
          tier: bestPick.tier,
          action: bestPick.action
        }
      : null,
    actionCounts,
    tierCounts,
    sectorDistribution,
    topPositiveFactors,
    topBlockers,
    topWarnings,
    actionabilityStats,
    qualityLabel: quality.label,
    qualityTone: quality.tone,
    quickRead: buildQuickRead(candidateCount, pickCount, avgPickScore, avgAllScore, topPositiveFactors[0], topBlockers[0], run.warnings.length, noPickDiagnosis),
    noPickDiagnosis,
    serenityInsight
  };
}

export function buildSelectionSummaryInsight(run: SelectionRunSummary) {
  const candidateCount = run.candidateCount || run.pickCount + run.rejectedCount;
  const selectionRate = candidateCount > 0 ? run.pickCount / candidateCount : 0;
  const avgPreviewScore = average(run.topPickPreview.map((pick) => pick.score));
  const bestPick = run.topPickPreview.slice().sort((a, b) => b.score - a.score)[0] ?? null;
  const actionabilityStats = buildActionabilityStats(run.topPickPreview as SelectionPick[]);
  const quality = judgeQuality(run.status, candidateCount, run.pickCount, avgPreviewScore, run.warningCount, []);
  return {
    candidateCount,
    pickCount: run.pickCount,
    rejectedCount: run.rejectedCount,
    selectionRate,
    avgPreviewScore,
    bestPick,
    actionabilityStats,
    qualityLabel: quality.label,
    qualityTone: quality.tone
  };
}

export function formatSelectionRate(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function formatSelectionScore(value: number | null) {
  return value === null ? "--" : value.toFixed(0);
}

export function buildSelectionPickDecisionPlan(pick: SelectionPick): SelectionPickDecisionPlan {
  const action = normalizeSelectionAction(pick.action);
  const blockers = pick.blockers.map(compactBlockerText).filter(Boolean);
  const reasons = pick.reasons.map(compactText).filter(Boolean);
  const factorBlockers = pick.scoreFactors.flatMap((factor) => factor.blockers.map(compactBlockerText)).filter(Boolean);
  const allBlockers = dedupeText([...blockers, ...factorBlockers]);
  const nextSessionReason = reasons.find((item) => /次日|竞价|承接|回踩/.test(item));
  const hasNextSession = action === "条件等待" && (Boolean(nextSessionReason) || allBlockers.some((item) => /不可追|次日|涨停/.test(item)));
  const topReasons = reasons.slice(0, 3);
  const topRisks = allBlockers.slice(0, 4);

  if (action === "剔除") {
    return {
      label: "本次剔除",
      tone: "rose",
      summary: `本次不进入策略候选：${topRisks[0] ?? "阻断条件较多或评分不足"}。`,
      watchPoints: topReasons,
      invalidPoints: topRisks,
      riskPoints: topRisks
    };
  }

  if (hasNextSession) {
    return {
      label: "次日观察计划",
      tone: "amber",
      summary: "当前只记录强度，不给当日追价信号；下一交易日只看竞价承接、开板回封或回踩确认。",
      watchPoints: dedupeText([
        nextSessionReason?.replace(/^次日(竞价|承接)观察前提：?/, ""),
        "竞价不能是一字买不到，也不能明显低开弱转弱。",
        "所属板块继续启动/确认，核心股没有大面积负反馈。",
        "若高开无量或开盘后快速转弱，不参与。"
      ]).slice(0, 4),
      invalidPoints: dedupeText([
        ...topRisks.filter((item) => /退潮|流出|高开无量|弱转弱|追高|不可追/.test(item)),
        "竞价过度高开且无量，或开盘后放量回落。"
      ]).slice(0, 4),
      riskPoints: topRisks
    };
  }

  if (action === "重点观察") {
    return {
      label: "重点观察",
      tone: "emerald",
      summary: `证据相对完整，评分 ${pick.score}/100；仍需按策略触发条件执行，不等于立即买入。`,
      watchPoints: topReasons,
      invalidPoints: topRisks,
      riskPoints: topRisks
    };
  }

  if (action === "跟踪观察") {
    return {
      label: "跟踪观察",
      tone: "cyan",
      summary: `有可跟踪证据但还未达到强信号，评分 ${pick.score}/100；适合进入观察池等待补证。`,
      watchPoints: topReasons,
      invalidPoints: topRisks,
      riskPoints: topRisks
    };
  }

  return {
    label: "条件等待",
    tone: "amber",
    summary: `有部分正向证据，但需要关键条件补齐后再升级，当前评分 ${pick.score}/100。`,
    watchPoints: topReasons,
    invalidPoints: topRisks,
    riskPoints: topRisks
  };
}

function normalizePickAction(pick: SelectionPick): SelectionPick {
  const normalized = normalizeSelectionAction(pick.action);
  return normalized === pick.action ? pick : { ...pick, action: normalized };
}

function countByAction(picks: SelectionPick[]) {
  const result = Object.fromEntries(SELECTION_ACTION_ORDER.map((action) => [action, 0])) as Record<SelectionPick["action"], number>;
  for (const pick of picks) result[normalizeSelectionAction(pick.action)] += 1;
  return result;
}

function countByTier(picks: SelectionPick[]) {
  const result = Object.fromEntries(SELECTION_TIER_ORDER.map((tier) => [tier, 0])) as Record<SelectionPick["tier"], number>;
  for (const pick of picks) result[pick.tier] += 1;
  return result;
}

function buildActionabilityStats(picks: Array<Pick<SelectionPick, "runtimeSnapshot">>): SelectionActionabilityStats {
  const total = picks.length;
  let actionable = 0;
  let referenceOnly = 0;
  let notActionable = 0;
  let unknown = 0;
  for (const pick of picks) {
    const level = pick.runtimeSnapshot?.actionability?.level;
    if (level === "actionable") actionable += 1;
    else if (level === "reference_only") referenceOnly += 1;
    else if (level === "not_actionable") notActionable += 1;
    else unknown += 1;
  }
  const known = total - unknown;
  const tone: SelectionActionabilityStats["tone"] =
    !total || unknown === total
      ? "slate"
      : notActionable > 0
        ? "rose"
        : referenceOnly >= Math.max(1, Math.ceil(known * 0.5))
          ? "amber"
          : actionable >= Math.max(1, Math.ceil(known * 0.6))
            ? "emerald"
            : "cyan";
  const label =
    tone === "emerald"
      ? "盘中可行动"
      : tone === "amber"
        ? "多为参考"
      : tone === "rose"
        ? "含不可行动"
      : tone === "cyan"
            ? "部分可行动"
            : "历史快照待分级";
  const summary = total
    ? unknown === total
      ? `历史运行快照 ${unknown}/${total} 条缺少可行动性分级字段；这不等于行情缺失，当前统一行情覆盖请以上方快照校验为准。`
      : `盘中可行动 ${actionable}/${total}，仅研究参考 ${referenceOnly}/${total}，不可行动 ${notActionable}/${total}${unknown ? `，历史快照待分级 ${unknown}/${total}` : ""}。`
    : "没有可统计的运行快照。";
  return { total, actionable, referenceOnly, notActionable, unknown, label, tone, summary };
}

function aggregateFactors(picks: SelectionPick[], limit: number): SelectionAggregateItem[] {
  const bucket = new Map<string, { label: string; count: number; score: number; sampleCodes: Set<string> }>();
  for (const pick of picks) {
    for (const factor of pick.scoreFactors) {
      if (factor.score <= 0) continue;
      const item = bucket.get(factor.key) ?? { label: factor.label, count: 0, score: 0, sampleCodes: new Set<string>() };
      item.count += 1;
      item.score += factor.score;
      item.sampleCodes.add(pick.code);
      bucket.set(factor.key, item);
    }
  }
  return Array.from(bucket.entries())
    .map(([key, item]) => ({
      key,
      label: item.label,
      count: item.count,
      score: item.score,
      sampleCodes: Array.from(item.sampleCodes).slice(0, 4)
    }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, limit);
}

function aggregateText(items: Array<{ label: string; code: string }>, limit: number): SelectionAggregateItem[] {
  const bucket = new Map<string, { count: number; sampleCodes: Set<string> }>();
  for (const item of items) {
    const label = compactText(item.label);
    if (!label) continue;
    const next = bucket.get(label) ?? { count: 0, sampleCodes: new Set<string>() };
    next.count += 1;
    if (item.code) next.sampleCodes.add(item.code);
    bucket.set(label, next);
  }
  return Array.from(bucket.entries())
    .map(([label, item]) => ({
      key: label,
      label,
      count: item.count,
      sampleCodes: Array.from(item.sampleCodes).slice(0, 4)
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function buildSerenityInsight(picks: SelectionPick[], rejected: SelectionPick[]): SelectionSerenityInsight | null {
  const all = [...picks, ...rejected];
  const tagged = all.filter((pick) => pick.serenityTag);
  if (!tagged.length) return null;

  const taggedPickCodes = new Set(picks.filter((pick) => pick.serenityTag).map((pick) => pick.code));
  const topPriorityCount = tagged.filter((pick) => pick.serenityTag?.priority === "top" || pick.serenityTag?.priority === "high").length;
  const strongOrMediumEvidenceCount = tagged.filter(
    (pick) => pick.serenityTag?.evidenceStrength === "strong" || pick.serenityTag?.evidenceStrength === "medium"
  ).length;
  const weakOrPendingEvidenceCount = tagged.length - strongOrMediumEvidenceCount;
  const themeDistribution = aggregateText(
    tagged.map((pick) => ({ label: pick.serenityTag?.theme || "未识别主题", code: pick.code })),
    6
  );
  const chainDistribution = aggregateText(
    tagged.map((pick) => ({ label: pick.serenityTag?.chainPosition || "未识别环节", code: pick.code })),
    6
  );
  const topTaggedStocks = tagged
    .slice()
    .sort((a, b) => {
      const aTag = a.serenityTag;
      const bTag = b.serenityTag;
      return (
        serenityPriorityRank(bTag?.priority) - serenityPriorityRank(aTag?.priority) ||
        (bTag?.score ?? 0) - (aTag?.score ?? 0) ||
        b.score - a.score
      );
    })
    .slice(0, 5)
    .map((pick) => {
      const tag = pick.serenityTag!;
      return {
        code: pick.code,
        name: pick.name,
        score: pick.score,
        tier: pick.tier,
        action: pick.action,
        theme: tag.theme,
        priority: tag.priority,
        serenityScore: tag.score,
        evidenceStrength: tag.evidenceStrength,
        chainPosition: tag.chainPosition,
        verdict: tag.verdict
      };
    });
  const quickRead = `本次 ${tagged.length}/${all.length} 只候选叠加了瓶颈研究标签，核心/高优先级 ${topPriorityCount} 只，强或中等证据 ${strongOrMediumEvidenceCount} 只。该标签只提高研究优先级，不直接改变买入动作。`;

  return {
    taggedCount: tagged.length,
    taggedPickCount: taggedPickCodes.size,
    taggedRejectedCount: tagged.length - taggedPickCodes.size,
    topPriorityCount,
    strongOrMediumEvidenceCount,
    weakOrPendingEvidenceCount,
    themeDistribution,
    chainDistribution,
    topTaggedStocks,
    quickRead
  };
}

function serenityPriorityRank(value: NonNullable<SelectionPick["serenityTag"]>["priority"] | undefined) {
  if (value === "top") return 4;
  if (value === "high") return 3;
  if (value === "watch") return 2;
  return 1;
}

function compactBlockerText(value: string) {
  const text = compactText(value);
  if (!text) return "";
  if (/涨停不可达|接近涨停|可交易性状态为 .*涨停|次日竞价观察|次日承接观察/.test(text)) {
    return "当日不可追，只保留次日承接观察";
  }
  if (/当日涨幅.*超过.*追高上限|当日涨幅超过.*追高上限|超过短线追高上限|超过轮动追高上限/.test(text)) {
    return "涨幅超过策略追高上限";
  }
  if (/远离 MA20|距离MA20.*吸筹策略不追高|价格远离 MA20/.test(text)) {
    return "价格远离 MA20，追高风险高";
  }
  if (/新闻\/政策催化尚未接入|新闻\/政策.*尚未接入/.test(text)) {
    return "新闻/政策催化未接入结构化数据";
  }
  if (/未匹配到当前主线\/板块证据/.test(text)) {
    return "未匹配到当前主线/板块证据";
  }
  if (/缺少板块阶段|缺少所属板块阶段/.test(text)) {
    return "缺少板块阶段证据";
  }
  if (/持续流出|资金状态流出/.test(text)) {
    return "资金持续流出或质量偏弱";
  }
  return text;
}

function dedupeText(values: Array<string | undefined | null | false>) {
  return Array.from(new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0)));
}

function compactText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function average(values: number[]) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function judgeQuality(
  status: SelectionRunRecord["status"],
  candidateCount: number,
  pickCount: number,
  avgPickScore: number | null,
  warningCount: number,
  topBlockers: SelectionAggregateItem[]
): { label: string; tone: SelectionRunInsight["qualityTone"] } {
  if (status === "running") return { label: "后台运行中", tone: "cyan" };
  if (status === "failed") return { label: "运行失败", tone: "rose" };
  if (!candidateCount) return { label: "无有效候选", tone: "slate" };
  if (!pickCount) return { label: "未产生精选", tone: warningCount ? "amber" : "slate" };
  if (warningCount >= 3) return { label: "需降级复核", tone: "amber" };
  if ((avgPickScore ?? 0) >= 78 && !topBlockers.length) return { label: "强候选批次", tone: "emerald" };
  if ((avgPickScore ?? 0) >= 65) return { label: "可跟踪批次", tone: "cyan" };
  return { label: "证据偏弱", tone: "amber" };
}

function buildNoPickDiagnosis(
  candidateCount: number,
  pickCount: number,
  all: SelectionPick[],
  topBlockers: SelectionAggregateItem[],
  warnings: string[]
): SelectionNoPickDiagnosis | null {
  if (!candidateCount || pickCount > 0) return null;
  const bestRejected = all.slice().sort((a, b) => b.score - a.score)[0] ?? null;
  const completeSnapshotCount = all.filter((pick) => pick.runtimeSnapshot?.quality === "complete").length;
  const partialSnapshotCount = all.filter((pick) => pick.runtimeSnapshot?.quality === "partial" || pick.runtimeSnapshot?.quality === "quote_only").length;
  const missingSnapshotCount = Math.max(0, all.length - completeSnapshotCount - partialSnapshotCount);
  const hasCompleteMajority = completeSnapshotCount >= Math.ceil(candidateCount * 0.6);
  const hasSevereDataWarning = warnings.some((warning) => /失败|缺失|未取得|missing|failed|数据状态为 partial|超过 4 小时|刷新.*0\/|补不到/.test(warning));
  const hasDataProblem = missingSnapshotCount >= Math.ceil(candidateCount * 0.4) || (hasSevereDataWarning && !hasCompleteMajority);
  const title = hasDataProblem ? "未精选：先排查数据链路" : "未精选：规则闸门未通过";
  const tone: SelectionNoPickDiagnosis["tone"] = hasDataProblem ? "rose" : hasCompleteMajority ? "amber" : "slate";
  const bestText = bestRejected ? `最高分为 ${bestRejected.name} ${bestRejected.score}/100，动作仍为「${bestRejected.action}」` : "没有可排序候选";
  const dataText = `快照完整 ${completeSnapshotCount}/${candidateCount}，部分可用 ${partialSnapshotCount}/${candidateCount}，缺失 ${missingSnapshotCount}/${candidateCount}`;
  const blockerText = topBlockers[0] ? `主要卡在「${topBlockers[0].label}」` : "没有形成集中阻断项";
  return {
    title,
    tone,
    summary: `${bestText}；${blockerText}；${dataText}。`,
    bestRejected: bestRejected
      ? {
          code: bestRejected.code,
          name: bestRejected.name,
          score: bestRejected.score,
          tier: bestRejected.tier,
          action: bestRejected.action
        }
      : null,
    completeSnapshotCount,
    partialSnapshotCount,
    missingSnapshotCount,
    topBlockers: topBlockers.slice(0, 4),
    nextChecks: buildNoPickNextChecks(hasDataProblem, topBlockers, bestRejected)
  };
}

function buildNoPickNextChecks(hasDataProblem: boolean, topBlockers: SelectionAggregateItem[], bestRejected: SelectionPick | null) {
  const checks: string[] = [];
  if (hasDataProblem) checks.push("先查看运行快照质量和数据提示，确认行情、K线、技术、资金、公司层是否齐全。");
  if (topBlockers.some((item) => /追高|涨停|不可追/.test(item.label))) checks.push("若卡在追高或涨停不可达，改看次日竞价承接、开板回封或回踩确认。");
  if (topBlockers.some((item) => /资金/.test(item.label))) checks.push("若卡在资金质量，重点看 5/10/20 日资金是否从流出转为温和流入。");
  if (topBlockers.some((item) => /板块|主线/.test(item.label))) checks.push("若卡在主线归属或板块阶段，先补成分股、主营关键词和产业链证据。");
  if (bestRejected && bestRejected.score >= 60) checks.push("最高分已接近可跟踪区间，可以加入观察池，但仍按阻断条件等待补证。");
  if (!checks.length) checks.push("打开单票明细，优先看最低分因子和硬阻断项，判断是规则过严还是候选池质量不足。");
  return checks.slice(0, 4);
}

function buildQuickRead(
  candidateCount: number,
  pickCount: number,
  avgPickScore: number | null,
  avgAllScore: number | null,
  topFactor: SelectionAggregateItem | undefined,
  topBlocker: SelectionAggregateItem | undefined,
  warningCount: number,
  noPickDiagnosis: SelectionNoPickDiagnosis | null
) {
  if (!candidateCount) return "本次没有形成可分析候选，优先检查候选池来源和数据状态。";
  if (!pickCount) {
    const scoreText = avgAllScore === null ? "全池均分缺失" : `全池均分 ${formatSelectionScore(avgAllScore)}`;
    const diagnosisText = noPickDiagnosis ? noPickDiagnosis.summary : topBlocker ? `主要阻断来自「${topBlocker.label}」。` : "没有集中阻断项，需要查看单票明细。";
    return `本次未产生精选，${scoreText}。${diagnosisText}`;
  }
  const parts = [`本次精选 ${pickCount}/${candidateCount} 只，均分 ${formatSelectionScore(avgPickScore)}。`];
  if (topFactor) parts.push(`主要加分来自「${topFactor.label}」。`);
  if (topBlocker) parts.push(`主要限制是「${topBlocker.label}」。`);
  if (warningCount) parts.push(`存在 ${warningCount} 条数据提示，需结合来源留痕复核。`);
  return parts.join("");
}
