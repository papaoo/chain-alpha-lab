import type { Fact, LimitPoolSnapshot, SectorConstituentSnapshot, SectorCoreStockSnapshot, SectorSnapshot } from "@/lib/types";
import type { ParsedCommandResult } from "@/lib/westock/parser";
import { maxDefined, numberValue, pushFact } from "@/lib/strategy/utils";
import { normalizeSectorName, sectorDisplayName } from "@/lib/sector/normalization";
import { buildSectorCoreStocks } from "@/lib/strategy/sectorCoreStockRules";

export function parseSectors(
  board: ParsedCommandResult,
  facts: Fact[],
  sectorConstituents: SectorConstituentSnapshot[],
  limitPools: LimitPoolSnapshot[]
): SectorSnapshot[] {
  const rows = board.sections
    .filter((section) => section.type === "markdownTable")
    .flatMap((section) => section.rows.map((row) => ({ row, title: section.title })))
    .filter(({ row }) => row.name && !isNonMainlineBoardName(String(row.name)));

  const snapshots = rows.map(({ row, title }) => {
    const rawName = String(row.name);
    const name = sectorDisplayName(rawName);
    const normalizedName = normalizeSectorName(rawName);
    const snapshot: SectorSnapshot = {
      name,
      normalizedName,
      sourceNames: [rawName],
      changePct: numberValue(row.changePct),
      turnoverRate: numberValue(row.turnoverRate),
      changePct5d: numberValue(row.changePct5d),
      changePct20d: numberValue(row.changePct20d),
      leadStock: row.leadStock ? String(row.leadStock) : undefined,
      mainNetInflow: numberValue(row.mainNetInflow),
      mainNetInflow5d: numberValue(row.mainNetInflow5d),
      upDownRatio: row.upDownRatio ? String(row.upDownRatio) : undefined,
      facts: []
    };
    snapshot.facts.push(pushFact(facts, `sector.${name}.board.changePct`, "dataSourceFact", `${title ?? "板块"} ${rawName} 涨跌幅 ${snapshot.changePct ?? "缺失"}%`, snapshot.changePct ?? null, "%"));
    if (snapshot.mainNetInflow !== undefined) {
      snapshot.facts.push(pushFact(facts, `sector.${name}.board.mainNetInflow`, "dataSourceFact", `${rawName} 主力净流入 ${snapshot.mainNetInflow}`, snapshot.mainNetInflow));
    }
    return snapshot;
  });
  const merged = mergeSectorSnapshots(snapshots);
  for (const sector of merged) {
    if ((sector.sourceNames?.length ?? 0) > 1) {
      sector.facts.push(pushFact(
        facts,
        `rule.sector.${sector.name}.alias_merge`,
        "ruleComputed",
        `${sector.name} 已合并同义板块：${sector.sourceNames?.join("、")}`,
        sector.sourceNames?.length ?? 0
      ));
    }
  }
  return enrichSectorSnapshots(merged, sectorConstituents, limitPools, facts);
}

function isNonMainlineBoardName(name: string) {
  return /昨日|连板|首板|涨停|炸板|跌停|破板|ST|融资融券|预盈预增|预亏预减/.test(name);
}

function mergeSectorSnapshots(sectors: SectorSnapshot[]) {
  const byName = new Map<string, SectorSnapshot>();
  for (const sector of sectors) {
    const key = sector.normalizedName ?? normalizeSectorName(sector.name);
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, sector);
      continue;
    }
    byName.set(key, {
      ...existing,
      changePct: maxDefined(existing.changePct, sector.changePct),
      turnoverRate: maxDefined(existing.turnoverRate, sector.turnoverRate),
      changePct5d: maxDefined(existing.changePct5d, sector.changePct5d),
      changePct20d: maxDefined(existing.changePct20d, sector.changePct20d),
      leadStock: existing.leadStock ?? sector.leadStock,
      mainNetInflow: maxDefined(existing.mainNetInflow, sector.mainNetInflow),
      mainNetInflow5d: maxDefined(existing.mainNetInflow5d, sector.mainNetInflow5d),
      upDownRatio: existing.upDownRatio ?? sector.upDownRatio,
      sourceNames: Array.from(new Set([...(existing.sourceNames ?? [existing.name]), ...(sector.sourceNames ?? [sector.name])])),
      facts: [...existing.facts, ...sector.facts]
    });
  }
  return Array.from(byName.values());
}

function enrichSectorSnapshots(
  sectors: SectorSnapshot[],
  sectorConstituents: SectorConstituentSnapshot[],
  limitPools: LimitPoolSnapshot[],
  facts: Fact[]
) {
  const constituentsByName = new Map(sectorConstituents.map((item) => [normalizeSectorName(item.name), item]));
  const ztPools = limitPools.filter((pool) => pool.pool === "zt");
  const zbPools = limitPools.filter((pool) => pool.pool === "zb");
  return sectors.map((sector) => {
    const constituent = constituentsByName.get(sector.normalizedName ?? normalizeSectorName(sector.name));
    const stocks = constituent?.stocks ?? [];
    const validChanges = stocks.map((stock) => stock.changePct).filter((value): value is number => value !== undefined);
    const up = validChanges.filter((value) => value > 0).length;
    const down = validChanges.filter((value) => value < 0).length;
    const strong = validChanges.filter((value) => value >= 5).length;
    const weak = validChanges.filter((value) => value <= -5).length;
    const constituentAmount = sumDefined(stocks.map((stock) => stock.amount));
    const constituentMainNetInflow = sumDefined(stocks.map((stock) => stock.mainNetInflow));
    const constituentFloatMarketValue = sumDefined(stocks.map((stock) => stock.floatMarketValue));
    const industryLimitUpCount = ztPools.reduce((count, pool) => count + pool.stocks.filter((stock) => stock.industry === sector.name).length, 0);
    const industryOpenBoardCount = zbPools.reduce((count, pool) => count + pool.stocks.filter((stock) => stock.industry === sector.name).length, 0);
    const coreStocks = buildSectorCoreStocks(sector, stocks, ztPools, zbPools);
    const coreLimitUpCount = coreStocks.filter((stock) => stock.limitStatus === "涨停").length;
    const coreOpenBoardCount = coreStocks.filter((stock) => stock.limitStatus === "炸板").length;
    const limitUpCount = Math.max(industryLimitUpCount, coreLimitUpCount);
    const openBoardCount = Math.max(industryOpenBoardCount, coreOpenBoardCount);
    const limitPoolUsedCoreFallback = coreLimitUpCount > industryLimitUpCount || coreOpenBoardCount > industryOpenBoardCount;
    const enriched: SectorSnapshot = {
      ...sector,
      code: sector.code ?? constituent?.boardCode,
      constituentCount: validChanges.length || undefined,
      constituentUpCount: validChanges.length ? up : undefined,
      constituentDownCount: validChanges.length ? down : undefined,
      constituentUpPct: validChanges.length ? Number(((up / validChanges.length) * 100).toFixed(2)) : undefined,
      constituentStrongCount: validChanges.length ? strong : undefined,
      constituentWeakCount: validChanges.length ? weak : undefined,
      constituentAmount,
      constituentMainNetInflow,
      constituentFloatMarketValue,
      limitUpCount: limitUpCount || undefined,
      openBoardCount: openBoardCount || undefined,
      coreStocks
    };
    if (constituent) {
      enriched.facts.push(pushFact(
        facts,
        `sector.${sector.name}.constituents.breadth`,
        "dataSourceFact",
        `${sector.name} 成分股结构：有效${validChanges.length}只，上涨${up}只，下跌${down}只，强势股${strong}只，弱势股${weak}只`,
        enriched.constituentUpPct,
        "%"
      ));
    }
    if (limitUpCount || openBoardCount) {
      enriched.facts.push(pushFact(
        facts,
        `sector.${sector.name}.limit_pool.concentration`,
        "dataSourceFact",
        `${sector.name} 涨停池集中度：涨停${limitUpCount}只，炸板${openBoardCount}只${limitPoolUsedCoreFallback ? "；行业映射不足时已用核心股涨停状态回补" : ""}`,
        limitUpCount
      ));
    }
    if (coreStocks.length) {
      enriched.facts.push(pushFact(
        facts,
        `sector.${sector.name}.core_stocks`,
        "dataSourceFact",
        `${sector.name} 核心股结构：${coreStocks.map((stock) => `${stock.role}${stock.name}(${stock.score.toFixed(0)}，${stock.limitStatus})`).join("、")}`,
        coreStocks.length
      ));
    }
    return enriched;
  });
}

function sumDefined(values: Array<number | undefined>) {
  const valid = values.filter((value): value is number => value !== undefined && Number.isFinite(value));
  if (!valid.length) return undefined;
  return valid.reduce((sum, value) => sum + value, 0);
}
