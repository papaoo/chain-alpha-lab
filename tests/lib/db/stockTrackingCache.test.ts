import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/stockTracking", () => ({
  listTrackingItems: vi.fn(() => [{ id: crypto.randomUUID(), code: "sh600000" }])
}));

describe("stock tracking items cache", () => {
  it("reuses the short-lived tracking list cache and supports explicit invalidation", async () => {
    const tracking = await import("@/lib/db/stockTracking");
    const cache = await import("@/lib/db/stockTrackingCache");
    const listTrackingItems = vi.mocked(tracking.listTrackingItems);

    cache.invalidateTrackingItemsCache();
    const first = cache.listTrackingItemsCached("active");
    const second = cache.listTrackingItemsCached("active");

    expect(first.cacheStatus).toBe("miss");
    expect(second.cacheStatus).toBe("hit");
    expect(listTrackingItems).toHaveBeenCalledTimes(1);

    cache.invalidateTrackingItemsCache();
    const third = cache.listTrackingItemsCached("active");

    expect(third.cacheStatus).toBe("miss");
    expect(listTrackingItems).toHaveBeenCalledTimes(2);
  });
});
