import { beforeEach, describe, expect, it, vi } from "vitest";

const dbGet = vi.fn();
const dbRun = vi.fn();

vi.mock("@/lib/db/client", () => ({
  dbGet: (...args: unknown[]) => dbGet(...args),
  dbRun: (...args: unknown[]) => dbRun(...args)
}));

vi.mock("@/lib/data/providerRegistry", () => ({
  DATA_PROVIDER_REGISTRY: {}
}));

describe("settings cache", () => {
  beforeEach(() => {
    vi.resetModules();
    dbGet.mockReset();
    dbRun.mockReset();
    dbGet.mockReturnValue({
      value: JSON.stringify({
        provider: "deepseek",
        providerName: "DeepSeek",
        apiKey: "unit-key",
        model: "deepseek-chat",
        enabled: true
      })
    });
  });

  it("reuses the short-lived model settings cache", async () => {
    const settings = await import("@/lib/db/settings");

    const first = settings.getRuntimeSettings();
    const second = settings.getRuntimeSettings();

    expect(first.model).toBe("deepseek-chat");
    expect(second.apiKey).toBe("unit-key");
    expect(dbGet).toHaveBeenCalledTimes(1);
  });

  it("invalidates model settings cache after save", async () => {
    const settings = await import("@/lib/db/settings");

    const before = settings.getRuntimeSettings();
    dbGet.mockReturnValue({
      value: JSON.stringify({
        provider: "deepseek",
        providerName: "DeepSeek",
        apiKey: "unit-key",
        model: "deepseek-reasoner",
        enabled: true
      })
    });
    const saved = settings.saveModelSettings({ model: "deepseek-reasoner" });
    const after = settings.getRuntimeSettings();

    expect(before.model).toBe("deepseek-chat");
    expect(saved.model).toBe("deepseek-reasoner");
    expect(after.model).toBe("deepseek-reasoner");
    expect(dbRun).toHaveBeenCalledTimes(1);
    expect(dbGet).toHaveBeenCalledTimes(1);
  });
});
