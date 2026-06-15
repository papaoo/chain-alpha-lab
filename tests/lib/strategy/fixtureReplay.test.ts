import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildFactPackage } from "../../../src/lib/strategy/rules";
import type { BuildRuleInput } from "../../../src/lib/strategy/support";
import type { FactPackage } from "../../../src/lib/types";

type FixtureExpectation = {
  marketState?: FactPackage["market"]["marketState"];
  topSectorStage?: FactPackage["sectors"][number]["stage"];
  minCandidateCount?: number;
  maxPositionPct?: number;
};

type ReplayFixture = {
  name: string;
  description?: string;
  input?: BuildRuleInput;
  factPackage?: FactPackage;
  expect?: FixtureExpectation;
};

const fixtureDir = path.resolve(process.cwd(), "tests", "fixtures", "analysis");
const fixtureFiles = fs.existsSync(fixtureDir)
  ? fs.readdirSync(fixtureDir).filter((name) => name.endsWith(".json")).sort()
  : [];

describe("historical analysis fixture replay", () => {
  if (fixtureFiles.length === 0) {
    it.skip("has no real historical fixtures yet; run npm run fixture:export after a saved analysis", () => {});
    return;
  }

  for (const fileName of fixtureFiles) {
    it(`replays ${fileName}`, () => {
      const fixture = JSON.parse(fs.readFileSync(path.join(fixtureDir, fileName), "utf8")) as ReplayFixture;
      const factPackage = fixture.input ? buildFactPackage(fixture.input) : fixture.factPackage;

      expect(factPackage, `${fixture.name} must contain either input or factPackage`).toBeTruthy();
      assertCoreInvariants(factPackage!);
      assertExpectations(factPackage!, fixture.expect ?? {});
    });
  }
});

function assertCoreInvariants(factPackage: FactPackage) {
  expect(factPackage.schemaVersion).toBeTruthy();
  expect(factPackage.timestamp).toBeTruthy();
  expect(factPackage.market.marketState).toMatch(/^(tradable|cautious|defensive)$/);
  expect(factPackage.ruleResult.status).toBe("success");
  for (const candidate of factPackage.candidates) {
    expect(factPackage.constraints.allowedCodes).toContain(candidate.code);
    expect(candidate.positionLimitPct).toBeGreaterThanOrEqual(0);
    expect(candidate.positionLimitPct).toBeLessThanOrEqual(factPackage.constraints.maxSingleStockPositionPct);
    if (candidate.action !== "小仓试错") expect(candidate.positionLimitPct).toBe(0);
  }
}

function assertExpectations(factPackage: FactPackage, expectation: FixtureExpectation) {
  if (expectation.marketState) expect(factPackage.market.marketState).toBe(expectation.marketState);
  if (expectation.topSectorStage) expect(factPackage.sectors[0]?.stage).toBe(expectation.topSectorStage);
  if (expectation.minCandidateCount !== undefined) expect(factPackage.candidates.length).toBeGreaterThanOrEqual(expectation.minCandidateCount);
  if (expectation.maxPositionPct !== undefined) {
    for (const candidate of factPackage.candidates) {
      expect(candidate.positionLimitPct).toBeLessThanOrEqual(expectation.maxPositionPct);
    }
  }
}
