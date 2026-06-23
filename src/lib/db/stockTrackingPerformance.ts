export type TrackingPerformancePoint = {
  createdAt: string;
  latestPrice?: number | null;
};

export type TrackingBaselineTraceInput = {
  price?: number;
};

export type TrackingPerformanceResult = {
  baselinePrice?: number;
  latestPrice?: number;
  latestReturnPct?: number;
  bestPrice?: number;
  bestReturnPct?: number;
  worstPrice?: number;
  worstReturnPct?: number;
  maxDrawdownPct?: number;
  snapshotCount: number;
  latestSnapshotAt?: string;
  bestSnapshotAt?: string;
  worstSnapshotAt?: string;
  recentPoints: Array<{
    createdAt: string;
    price: number;
    returnPct?: number;
  }>;
};

export function resolveTrackingBaselinePrice(input: {
  simulatedPrice?: number | null;
  baselineTrace?: TrackingBaselineTraceInput;
  snapshots: TrackingPerformancePoint[];
}) {
  const traced = finiteNumber(input.baselineTrace?.price);
  if (traced !== undefined && traced > 0) return traced;
  const simulated = finiteNumber(input.simulatedPrice);
  if (simulated !== undefined && simulated > 0) return simulated;
  const firstSnapshotPrice = input.snapshots
    .map((snapshot) => finiteNumber(snapshot.latestPrice))
    .find((price): price is number => price !== undefined && price > 0);
  return firstSnapshotPrice;
}

export function calculateTrackingPerformance(
  baselinePrice: number | undefined,
  snapshots: TrackingPerformancePoint[]
): TrackingPerformanceResult {
  const prices = snapshots
    .map((snapshot) => ({ price: finiteNumber(snapshot.latestPrice), createdAt: snapshot.createdAt }))
    .filter((snapshot): snapshot is { price: number; createdAt: string } => snapshot.price !== undefined);
  const latest = prices.at(-1);
  let best = prices[0];
  let worst = prices[0];
  let peak = prices[0]?.price;
  let maxDrawdownPct = 0;

  for (const item of prices) {
    if (!best || item.price > best.price) best = item;
    if (!worst || item.price < worst.price) worst = item;
    if (peak === undefined || item.price > peak) peak = item.price;
    if (peak > 0) {
      const drawdown = ((item.price - peak) / peak) * 100;
      if (drawdown < maxDrawdownPct) maxDrawdownPct = drawdown;
    }
  }

  return {
    baselinePrice,
    latestPrice: latest?.price,
    latestReturnPct: returnPct(baselinePrice, latest?.price),
    bestPrice: best?.price,
    bestReturnPct: returnPct(baselinePrice, best?.price),
    worstPrice: worst?.price,
    worstReturnPct: returnPct(baselinePrice, worst?.price),
    maxDrawdownPct: prices.length ? Number(maxDrawdownPct.toFixed(2)) : undefined,
    snapshotCount: prices.length,
    latestSnapshotAt: latest?.createdAt,
    bestSnapshotAt: best?.createdAt,
    worstSnapshotAt: worst?.createdAt,
    recentPoints: prices.slice(-12).map((item) => ({
      createdAt: item.createdAt,
      price: item.price,
      returnPct: returnPct(baselinePrice, item.price)
    }))
  };
}

export function returnPct(base?: number, value?: number | null) {
  if (base === undefined || value === undefined || value === null || base <= 0) return undefined;
  return Number((((value - base) / base) * 100).toFixed(2));
}

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
