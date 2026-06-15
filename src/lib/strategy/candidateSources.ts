import type { CompanyKnowledgeCard, Fact, SectorConstituentSnapshot, SectorRuleResult, SectorSnapshot, StockCandidate } from "@/lib/types";
import type { ParsedCommandResult } from "@/lib/westock/parser";
import { ZH } from "@/lib/strategy/support";
import { firstTableRows, maxDefined, numberValue, pushFact } from "@/lib/strategy/utils";
import { normalizeStockCode } from "@/lib/strategy/candidateUtils";
import { normalizeSectorName, sameSectorName } from "@/lib/sector/normalization";

export function buildCandidateSourceRows(
  hotStocks: ParsedCommandResult | null | undefined,
  sectorConstituents: SectorConstituentSnapshot[],
  sectors: SectorRuleResult[],
  facts: Fact[]
) {
  const rows = new Map<string, Record<string, unknown>>();
  const constituentsByName = new Map(sectorConstituents.map((item) => [normalizeSectorName(item.name), item]));
  const currentSectorNames = new Set(sectors.slice(0, 5).map((sector) => normalizeSectorName(sector.name)));
  const currentSectorCodes = new Set<string>();

  for (const constituent of sectorConstituents) {
    if (!currentSectorNames.has(normalizeSectorName(constituent.name))) continue;
    for (const stock of constituent.stocks) {
      currentSectorCodes.add(normalizeStockCode(stock.marketCode || stock.code));
    }
  }

  const hotRows = firstTableRows(hotStocks).slice(0, 12);
  for (const row of hotRows) {
    const code = normalizeStockCode(String(row.code ?? ""));
    if (!code || rows.has(code) || !currentSectorCodes.has(code)) continue;
    rows.set(code, { ...row, code, source: "hot_stock_mainline_member" });
  }

  for (const sector of sectors.slice(0, 5)) {
    const constituent = constituentsByName.get(normalizeSectorName(sector.name));
    if (!constituent) continue;
    const leaders = [...constituent.stocks]
      .sort((left, right) => {
        const leftLimit = (left.changePct ?? 0) >= 9.8 ? 1 : 0;
        const rightLimit = (right.changePct ?? 0) >= 9.8 ? 1 : 0;
        if (rightLimit !== leftLimit) return rightLimit - leftLimit;
        const changeDelta = (right.changePct ?? -99) - (left.changePct ?? -99);
        if (Math.abs(changeDelta) > 0.01) return changeDelta;
        const fundDelta = (right.mainNetInflow ?? 0) - (left.mainNetInflow ?? 0);
        if (Math.abs(fundDelta) > 1000000) return fundDelta;
        return (right.amount ?? 0) - (left.amount ?? 0);
      })
      .slice(0, 8);
    for (const [sectorRank, stock] of leaders.entries()) {
      const code = normalizeStockCode(stock.marketCode || stock.code);
      if (!code || rows.has(code)) continue;
      rows.set(code, {
        code,
        name: stock.name,
        stock_type: "GP-A",
        zxj: stock.latest,
        zdf: stock.changePct,
        cje: stock.amount,
        amount: stock.amount,
        hsl: stock.turnoverRate,
        turnoverRate: stock.turnoverRate,
        lb: stock.volumeRatio,
        volumeRatio: stock.volumeRatio,
        mainNetInflow: stock.mainNetInflow,
        floatMarketValue: stock.floatMarketValue,
        peTtm: stock.peTtm ?? stock.peDynamic,
        peDynamic: stock.peDynamic,
        pb: stock.pb,
        psTtm: stock.psTtm,
        dividendYieldTtm: stock.dividendYieldTtm,
        source: "sector_constituent",
        sectorName: constituent.name,
        sectorRank
      });
      pushFact(
        facts,
        `candidate.source.${code}`,
        "ruleComputed",
        `${stock.name}(${code}) 来自主线 ${constituent.name} 成分股前排，而不是单纯热门股。`,
        constituent.name
      );
    }
  }

  for (const row of hotRows) {
    const code = normalizeStockCode(String(row.code ?? ""));
    if (!code || rows.has(code)) continue;
    rows.set(code, { ...row, code, source: "hot_stock" });
  }

  return Array.from(rows.values());
}

export function buildSectorMembershipIndex(
  snapshots: SectorConstituentSnapshot[],
  sectors: SectorRuleResult[],
  facts: Fact[]
) {
  const sectorNames = new Set(sectors.map((sector) => normalizeSectorName(sector.name)));
  const index = new Map<string, { name: string; boardCode: string; boardType: SectorConstituentSnapshot["boardType"] }>();
  for (const snapshot of snapshots) {
    if (!sectorNames.has(normalizeSectorName(snapshot.name))) continue;
    for (const stock of snapshot.stocks) {
      const normalized = normalizeStockCode(stock.marketCode || stock.code);
      if (!normalized || index.has(normalized)) continue;
      index.set(normalized, { name: snapshot.name, boardCode: snapshot.boardCode, boardType: snapshot.boardType });
      pushFact(
        facts,
        `sector.${snapshot.name}.constituent.${normalized}`,
        "dataSourceFact",
        `${stock.name}(${normalized}) 属于${snapshot.boardType === "industry" ? "行业" : "概念"}板块 ${snapshot.name}`,
        snapshot.name
      );
    }
  }
  return index;
}

type CandidateMembership = { name: string; boardCode: string; boardType: SectorConstituentSnapshot["boardType"] };
type MainlineAttribution = NonNullable<StockCandidate["mainlineAttribution"]>;

export {
  businessMatchesSector,
  evaluateMainlineAttribution,
  formatAttributionStatus,
  inferIndustryChainPosition
} from "@/lib/strategy/candidateAttributionRules";
