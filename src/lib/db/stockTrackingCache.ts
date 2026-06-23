import { listTrackingItems, type StockTrackingItem, type TrackingStatus } from "@/lib/db/stockTracking";

const TRACKING_ITEMS_CACHE_TTL_MS = 10_000;

let trackingItemsCache:
  | {
      key: string;
      expiresAt: number;
      data: StockTrackingItem[];
    }
  | null = null;

export function listTrackingItemsCached(status?: TrackingStatus) {
  const key = status ?? "all";
  const now = Date.now();
  if (trackingItemsCache && trackingItemsCache.key === key && trackingItemsCache.expiresAt > now) {
    return {
      data: trackingItemsCache.data,
      cacheStatus: "hit" as const,
      cacheTtlSeconds: Math.round(Math.max(0, trackingItemsCache.expiresAt - now) / 1000)
    };
  }
  const data = listTrackingItems(status);
  trackingItemsCache = {
    key,
    expiresAt: now + TRACKING_ITEMS_CACHE_TTL_MS,
    data
  };
  return {
    data,
    cacheStatus: "miss" as const,
    cacheTtlSeconds: Math.round(TRACKING_ITEMS_CACHE_TTL_MS / 1000)
  };
}

export function invalidateTrackingItemsCache() {
  trackingItemsCache = null;
}
