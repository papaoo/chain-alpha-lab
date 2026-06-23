import { buildRuleBottleneckSnapshot, type RuleBottleneckAuctionWatchItem } from "@/lib/db/ruleBottleneck";

export type AuctionWatchlistSnapshot = {
  generatedAt: string;
  servedAt?: string;
  cacheStatus?: "hit" | "miss";
  cacheTtlSeconds?: number;
  source: "rule-bottleneck";
  reportCount: number;
  candidateCount: number;
  latestReportAt?: string;
  total: number;
  items: RuleBottleneckAuctionWatchItem[];
  summary: {
    title: string;
    message: string;
    topSectors: Array<{ sectorName: string; count: number }>;
    topNames: string[];
  };
  cautions: string[];
};

export function buildAuctionWatchlistSnapshot(limit = 80, itemLimit = 12): AuctionWatchlistSnapshot {
  const snapshot = buildRuleBottleneckSnapshot(limit);
  const safeItemLimit = Math.min(Math.max(Math.trunc(itemLimit), 1), 50);
  const items = snapshot.auctionWatchlist.slice(0, safeItemLimit);
  return {
    generatedAt: new Date().toISOString(),
    servedAt: snapshot.servedAt,
    cacheStatus: snapshot.cacheStatus,
    cacheTtlSeconds: snapshot.cacheTtlSeconds,
    source: "rule-bottleneck",
    reportCount: snapshot.reportCount,
    candidateCount: snapshot.candidateCount,
    latestReportAt: snapshot.latestReportAt,
    total: snapshot.auctionWatchlist.length,
    items,
    summary: buildAuctionSummary(items, snapshot.auctionWatchlist.length),
    cautions: [
      "次日竞价观察池不是买入清单，只表示当日不可追后保留到次日验证。",
      "必须等待竞价、开板承接、板块扩散和失效条件共同验证，不能按历史涨停直接追入。",
      "该数据来自最近分析报告的规则快照；盘前或开盘后应刷新追踪快照再判断。"
    ]
  };
}

function buildAuctionSummary(items: RuleBottleneckAuctionWatchItem[], total: number): AuctionWatchlistSnapshot["summary"] {
  if (!total) {
    return {
      title: "暂无次日竞价观察样本",
      message: "最近报告没有形成次日竞价观察池，说明当前主要问题不是涨停不可达，而可能是数据、主线或买点本身不足。",
      topSectors: [],
      topNames: []
    };
  }
  const topSectors = topSectorCounts(items);
  const topNames = items.slice(0, 5).map((item) => item.name);
  const sectorText = topSectors.map((item) => `${item.sectorName}${item.count}只`).join("、") || "板块分散";
  return {
    title: `次日竞价观察 ${total} 只`,
    message: `近期可转化机会主要集中在次日竞价承接路径，优先观察 ${sectorText}。`,
    topSectors,
    topNames
  };
}

function topSectorCounts(items: RuleBottleneckAuctionWatchItem[]) {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = item.sectorName || "未归类";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([sectorName, count]) => ({ sectorName, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 5);
}
