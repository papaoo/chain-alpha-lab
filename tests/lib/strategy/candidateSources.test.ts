import { describe, expect, it } from "vitest";
import { buildCandidateSourceRows, buildSectorMembershipIndex } from "@/lib/strategy/candidateSources";
import { isAshareStockCode, normalizeStockCode } from "@/lib/strategy/candidateUtils";
import { extractCandidateStockCodes } from "@/lib/data/analysisCandidateDataGateway";
import type { Fact, SectorConstituentSnapshot, SectorRuleResult } from "@/lib/types";
import type { ParsedCell, ParsedCommandResult } from "@/lib/westock/parser";

function mockHotStocks(rows: Array<Record<string, ParsedCell>>): ParsedCommandResult {
  return {
    command: "mock",
    args: [],
    status: "success" as const,
    warnings: [],
    rawText: "",
    sections: [{ type: "markdownTable" as const, title: "hot", columns: Object.keys(rows[0] ?? { code: "" }), rows, raw: "" }]
  };
}

describe("candidate source filtering", () => {
  it("keeps A-share codes but rejects B-share codes from candidate rows", () => {
    expect(normalizeStockCode("200012")).toBe("sz200012");
    expect(isAshareStockCode("sz200012")).toBe(false);
    expect(isAshareStockCode("sz000012")).toBe(true);
    expect(isAshareStockCode("sh900901")).toBe(false);
  });

  it("does not let B-share sector constituents enter the candidate pool", () => {
    const facts: Fact[] = [];
    const sectors = [{ name: "玻璃玻纤", stage: "启动", score: 70 } as SectorRuleResult];
    const constituents: SectorConstituentSnapshot[] = [{
      source: "eastmoney",
      name: "玻璃玻纤",
      boardCode: "BK0546",
      boardType: "industry",
      fetchedAt: "2026-06-22T06:00:00.000Z",
      stocks: [
        { code: "200012", marketCode: "sz200012", name: "南玻B", changePct: 9.9, amount: 10000000 },
        { code: "000012", marketCode: "sz000012", name: "南玻A", changePct: 5.2, amount: 9000000 }
      ]
    }];
    const rows = buildCandidateSourceRows(mockHotStocks([]), constituents, sectors, facts);
    expect(rows.map((row) => row.code)).toEqual(["sz000012"]);

    const membership = buildSectorMembershipIndex(constituents, sectors, facts);
    expect(membership.has("sz000012")).toBe(true);
    expect(membership.has("sz200012")).toBe(false);
  });

  it("extracts supplement codes from A-share sector leaders without B-share pollution", () => {
    const sectors: SectorConstituentSnapshot[] = [{
      source: "eastmoney",
      name: "材料",
      boardCode: "BK0001",
      boardType: "industry",
      fetchedAt: "2026-06-22T06:00:00.000Z",
      stocks: [
        { code: "200012", marketCode: "sz200012", name: "南玻B", changePct: 10, amount: 9_000_000 },
        { code: "301071", marketCode: "sz301071", name: "力量钻石", changePct: 8, amount: 8_000_000 },
        { code: "001296", marketCode: "sz001296", name: "长江材料", changePct: 7, amount: 7_000_000 }
      ]
    }];
    const codes = extractCandidateStockCodes(mockHotStocks([{ code: "sh600030", name: "中信证券", stock_type: "GP-A" }]), sectors);
    expect(codes).toContain("sz301071");
    expect(codes).toContain("sz001296");
    expect(codes).toContain("sh600030");
    expect(codes).not.toContain("sz200012");
  });
});
