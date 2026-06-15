import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const strategyDir = join(process.cwd(), "src", "lib", "strategy");

describe("strategy entrypoint", () => {
  it("keeps the new rules engine as the only public strategy entry", () => {
    const index = readFileSync(join(strategyDir, "index.ts"), "utf8");
    expect(index).toContain('export { buildFactPackage } from "./rules"');
    expect(index).not.toContain("ruleEngine");
  });

  it("does not keep the deprecated ruleEngine implementation in source", () => {
    expect(existsSync(join(strategyDir, "ruleEngine.ts"))).toBe(false);
    expect(existsSync(join(strategyDir, "types.ts"))).toBe(false);
  });
});
