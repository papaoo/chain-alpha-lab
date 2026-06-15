import { dbAll } from "@/lib/db/client";
import { normalizeSectorName } from "@/lib/sector/normalization";
import type { AnalysisReport, SectorCoreStockSnapshot, SectorRuleResult, StockCandidate } from "@/lib/types";

export type RuleReplaySnapshot = {
  generatedAt: string;
  reportCount: number;
  pointCount: number;
  firstReportAt?: string;
  latestReportAt?: string;
  reliability: "high" | "medium" | "low";
  reliabilityNote: string;
  market: {
    stateCounts: Record<string, number>;
    transitionCount: number;
    improvementCount: number;
    deteriorationCount: number;
    whipsawCount: number;
    observations: string[];
  };
  sectors: RuleReplaySector[];
  candidates: {
    actionCounts: Record<string, number>;
    opportunityCounts: Record<string, number>;
    repeatedBlockedStocks: Array<{ code: string; name: string; count: number; latestReason: string }>;
    observations: string[];
  };
  cautions: string[];
};

export type RuleReplaySector = {
  name: string;
  appearances: number;
  latestStage: string;
  latestScore: number;
  upgrades: number;
  downgrades: number;
  followThroughCount: number;
  failedUpgradeCount: number;
  averageCoreRetentionPct?: number;
  stagePath: Array<{ reportId: string; createdAt: string; stage: string; score: number }>;
  observations: string[];
};

type ReportRow = {
  id: string;
  createdAt: string;
  factPackageJson: string;
  displayable: number | null;
};

type ReplayPoint = {
  id: string;
  createdAt: string;
  marketState: string;
  marketScore: number;
  sectors: Array<{
    name: string;
    normalizedName: string;
    stage: string;
    score: number;
    coreStocks: Array<Pick<SectorCoreStockSnapshot, "code" | "name">>;
  }>;
  candidates: Array<{
    code: string;
    name: string;
    action: string;
    opportunityState?: string;
    blockReason?: string;
  }>;
};

export function buildRuleReplay(limit = 60): RuleReplaySnapshot {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 5), 200);
  const rows = dbAll<ReportRow>(
    `select id, createdAt, factPackageJson, displayable
       from analysis_reports
       where reportType = 'full'
       order by createdAt desc
       limit ?`,
    [safeLimit],
    { label: "analysis_reports.rule_replay", slowMs: 500 }
  );
  const points = rows
    .map(toReplayPoint)
    .filter((point): point is ReplayPoint => Boolean(point))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

  const market = buildMarketReplay(points);
  const sectors = buildSectorReplay(points);
  const candidates = buildCandidateReplay(points);
  const cautions = buildCautions(rows.length, points.length);

  return {
    generatedAt: new Date().toISOString(),
    reportCount: rows.length,
    pointCount: points.length,
    firstReportAt: points[0]?.createdAt,
    latestReportAt: points[points.length - 1]?.createdAt,
    reliability: inferReliability(rows.length, points.length),
    reliabilityNote: reliabilityNote(rows.length, points.length),
    market,
    sectors,
    candidates,
    cautions
  };
}

function toReplayPoint(row: ReportRow): ReplayPoint | null {
  const factPackage = safeJson<AnalysisReport["factPackage"]>(row.factPackageJson);
  if (!factPackage) return null;
  if (!factPackage.ruleResult?.market || !Array.isArray(factPackage.sectors)) return null;
  return {
    id: row.id,
    createdAt: row.createdAt,
    marketState: factPackage.ruleResult.market.marketState,
    marketScore: factPackage.ruleResult.market.score,
    sectors: factPackage.sectors.slice(0, 8).map((sector) => ({
      name: sector.name,
      normalizedName: normalizeSectorName(sector.normalizedName ?? sector.name),
      stage: sector.stage,
      score: sector.score,
      coreStocks: sector.coreStocks.slice(0, 8).map((stock) => ({ code: stock.code, name: stock.name }))
    })),
    candidates: (factPackage.candidates ?? []).map((candidate) => ({
      code: candidate.code,
      name: candidate.name,
      action: candidate.action,
      opportunityState: candidate.opportunityProfile?.state,
      blockReason: candidate.opportunityProfile?.primaryReason ?? candidate.riskFlags[0] ?? candidate.invalidCondition
    }))
  };
}

function buildMarketReplay(points: ReplayPoint[]): RuleReplaySnapshot["market"] {
  const stateCounts: Record<string, number> = {};
  let transitionCount = 0;
  let improvementCount = 0;
  let deteriorationCount = 0;
  let whipsawCount = 0;

  points.forEach((point) => {
    stateCounts[point.marketState] = (stateCounts[point.marketState] ?? 0) + 1;
  });

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const delta = marketRank(current.marketState) - marketRank(previous.marketState);
    if (delta === 0) continue;
    transitionCount += 1;
    if (delta > 0) improvementCount += 1;
    if (delta < 0) deteriorationCount += 1;
    const next = points[index + 1];
    if (next) {
      const nextDelta = marketRank(next.marketState) - marketRank(current.marketState);
      if (Math.sign(delta) !== 0 && Math.sign(nextDelta) === -Math.sign(delta)) whipsawCount += 1;
    }
  }

  const observations: string[] = [];
  const defensiveRatio = points.length ? (stateCounts.defensive ?? 0) / points.length : 0;
  if (defensiveRatio >= 0.65) observations.push("历史报告大多处于防守状态，需要重点检查规则是否过度抑制买点。");
  if (whipsawCount >= 2) observations.push("大盘状态出现多次来回切换，需要检查连续性阈值和翻转条件。");
  if (!observations.length) observations.push("大盘状态迁移没有明显异常，但仍需结合更长历史继续观察。");

  return { stateCounts, transitionCount, improvementCount, deteriorationCount, whipsawCount, observations };
}

function buildSectorReplay(points: ReplayPoint[]): RuleReplaySector[] {
  const map = new Map<string, RuleReplaySector & { coreRetentions: number[] }>();

  for (const point of points) {
    for (const sector of point.sectors) {
      const current = map.get(sector.normalizedName) ?? {
        name: sector.name,
        appearances: 0,
        latestStage: sector.stage,
        latestScore: sector.score,
        upgrades: 0,
        downgrades: 0,
        followThroughCount: 0,
        failedUpgradeCount: 0,
        coreRetentions: [],
        stagePath: [],
        observations: []
      };
      const previous = current.stagePath[current.stagePath.length - 1];
      if (previous) {
        const delta = stageRank(sector.stage as SectorRuleResult["stage"]) - stageRank(previous.stage as SectorRuleResult["stage"]);
        if (delta > 0) current.upgrades += 1;
        if (delta < 0) current.downgrades += 1;
        if (isConstructiveStage(previous.stage) && sector.score >= previous.score - 5 && stageRank(sector.stage as SectorRuleResult["stage"]) >= stageRank(previous.stage as SectorRuleResult["stage"]) - 1) {
          current.followThroughCount += 1;
        }
        if (delta > 0 && (sector.score < previous.score - 12 || stageRank(sector.stage as SectorRuleResult["stage"]) < stageRank(previous.stage as SectorRuleResult["stage"]))) {
          current.failedUpgradeCount += 1;
        }
        const previousPoint = findPointById(points, previous.reportId);
        const previousSector = previousPoint?.sectors.find((item) => item.normalizedName === sector.normalizedName);
        const retention = coreRetention(previousSector?.coreStocks ?? [], sector.coreStocks);
        if (retention !== undefined) current.coreRetentions.push(retention);
      }
      current.appearances += 1;
      current.latestStage = sector.stage;
      current.latestScore = sector.score;
      current.stagePath.push({ reportId: point.id, createdAt: point.createdAt, stage: sector.stage, score: sector.score });
      map.set(sector.normalizedName, current);
    }
  }

  return Array.from(map.values())
    .filter((sector) => sector.appearances >= 2)
    .map((sector) => {
      const averageCoreRetentionPct = sector.coreRetentions.length
        ? Number((sector.coreRetentions.reduce((sum, value) => sum + value, 0) / sector.coreRetentions.length).toFixed(1))
        : undefined;
      const observations = [...sector.observations];
      if (sector.failedUpgradeCount > 0) observations.push("升级后出现回落，需要复核阶段迁移是否过早。");
      if ((averageCoreRetentionPct ?? 100) < 35) observations.push("核心股延续率偏低，主线可能更像轮动试错。");
      if (sector.appearances >= 4 && sector.upgrades === 0 && sector.latestStage === "观察") observations.push("长期停留观察，需确认是否阈值过严或板块证据不足。");
      if (!observations.length) observations.push("阶段路径暂未暴露明显异常。");
      return {
        name: sector.name,
        appearances: sector.appearances,
        latestStage: sector.latestStage,
        latestScore: sector.latestScore,
        upgrades: sector.upgrades,
        downgrades: sector.downgrades,
        followThroughCount: sector.followThroughCount,
        failedUpgradeCount: sector.failedUpgradeCount,
        averageCoreRetentionPct,
        stagePath: sector.stagePath,
        observations
      };
    })
    .sort((left, right) => right.appearances - left.appearances || right.latestScore - left.latestScore)
    .slice(0, 8);
}

function buildCandidateReplay(points: ReplayPoint[]): RuleReplaySnapshot["candidates"] {
  const actionCounts: Record<string, number> = {};
  const opportunityCounts: Record<string, number> = {};
  const blocked = new Map<string, { code: string; name: string; count: number; latestReason: string }>();

  for (const point of points) {
    for (const candidate of point.candidates) {
      actionCounts[candidate.action] = (actionCounts[candidate.action] ?? 0) + 1;
      if (candidate.opportunityState) opportunityCounts[candidate.opportunityState] = (opportunityCounts[candidate.opportunityState] ?? 0) + 1;
      const isBlocked = candidate.action === "数据不足" || candidate.action === "回避" || candidate.opportunityState === "blocked";
      if (isBlocked) {
        const current = blocked.get(candidate.code) ?? { code: candidate.code, name: candidate.name, count: 0, latestReason: candidate.blockReason ?? "未记录原因" };
        current.count += 1;
        current.latestReason = candidate.blockReason ?? current.latestReason;
        blocked.set(candidate.code, current);
      }
    }
  }

  const repeatedBlockedStocks = Array.from(blocked.values()).filter((item) => item.count >= 2).sort((left, right) => right.count - left.count).slice(0, 8);
  const observations: string[] = [];
  const total = Object.values(actionCounts).reduce((sum, value) => sum + value, 0);
  const zeroAction = (actionCounts["观察"] ?? 0) + (actionCounts["数据不足"] ?? 0) + (actionCounts["回避"] ?? 0) + (actionCounts["不追"] ?? 0);
  if (total && zeroAction / total >= 0.85) observations.push("候选股大多被压制在观察、回避或数据不足，需要继续拆分“潜在买点”和“正式买点”。");
  if (repeatedBlockedStocks.length) observations.push("存在连续被阻断股票，适合进入人工复核/剔除列表，避免占用候选池。");
  if (!observations.length) observations.push("候选动作分布暂未暴露明显阻塞。");

  return { actionCounts, opportunityCounts, repeatedBlockedStocks, observations };
}

function buildCautions(rowCount: number, pointCount: number) {
  const cautions = [
    "这是规则状态回放，不是收益回测；不能据此推断真实收益率。",
    "回放只使用当时已保存的报告快照，避免引入未来数据。"
  ];
  if (pointCount < 10) cautions.push("有效点数偏少，结论只能用于发现规则问题，不能用于参数优化。");
  if (rowCount > pointCount) cautions.push("部分报告无法解析或缺少必要字段，时间链可能有断点。");
  return cautions;
}

function inferReliability(rowCount: number, pointCount: number): RuleReplaySnapshot["reliability"] {
  if (pointCount >= 30 && pointCount / Math.max(rowCount, 1) >= 0.8) return "high";
  if (pointCount >= 10 && pointCount / Math.max(rowCount, 1) >= 0.6) return "medium";
  return "low";
}

function reliabilityNote(rowCount: number, pointCount: number) {
  if (pointCount >= 30) return `已纳入 ${pointCount}/${rowCount} 个有效历史点，可用于观察规则稳定性。`;
  if (pointCount >= 10) return `已纳入 ${pointCount}/${rowCount} 个有效历史点，适合做初步规则体检。`;
  return `有效历史点只有 ${pointCount}/${rowCount} 个，只能作为问题线索。`;
}

function coreRetention(previous: Array<Pick<SectorCoreStockSnapshot, "code" | "name">>, current: Array<Pick<SectorCoreStockSnapshot, "code" | "name">>) {
  if (!previous.length || !current.length) return undefined;
  const previousKeys = new Set(previous.map((stock) => stock.code || stock.name));
  const retained = current.filter((stock) => previousKeys.has(stock.code || stock.name)).length;
  return Number(((retained / previousKeys.size) * 100).toFixed(1));
}

function findPointById(points: ReplayPoint[], id: string) {
  return points.find((point) => point.id === id);
}

function marketRank(state: string) {
  if (state === "tradable") return 2;
  if (state === "cautious") return 1;
  return 0;
}

function isConstructiveStage(stage: string) {
  return stage === "启动" || stage === "确认" || stage === "加速";
}

function stageRank(stage: SectorRuleResult["stage"]) {
  const map: Record<string, number> = {
    "观察": 0,
    "启动": 1,
    "确认": 2,
    "加速": 3,
    "分歧": 1,
    "退潮": -1
  };
  return map[String(stage)] ?? 0;
}

function safeJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
