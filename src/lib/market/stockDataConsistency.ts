export type StockDataConsistencyTone = "ok" | "review" | "risk";

export type StockDataConsistencyCheck = {
  key: string;
  label: string;
  value: string;
  tone: StockDataConsistencyTone;
  detail: string;
};

export type StockDataConsistencyInput = {
  latestPrice?: number | null;
  baselinePrice?: number | null;
  baselineFetchedAt?: string | null;
  quoteUpdatedAt?: string | null;
  snapshotFetchedAt?: string | null;
  latestKlineTradeDate?: string | null;
  expectedKlineTradeDate?: string | null;
  klineFreshnessStatus?: "current" | "stale" | "unknown" | string | null;
  klineClose?: number | null;
  klineChangePct?: number | null;
  referencePrice?: number | null;
  referenceLabel?: string;
  requireBaseline?: boolean;
};

export type StockDataConsistencyResult = {
  tone: StockDataConsistencyTone;
  label: string;
  summary: string;
  checks: StockDataConsistencyCheck[];
  warnings: string[];
};

const PRICE_MISMATCH_RISK_PCT = 3;
const PRICE_MISMATCH_REVIEW_PCT = 0.8;

export function buildStockDataConsistency(input: StockDataConsistencyInput): StockDataConsistencyResult {
  const checks: StockDataConsistencyCheck[] = [];
  const warnings: string[] = [];

  const quoteTradeDate = tradeDateFromIso(input.quoteUpdatedAt);
  const latestKlineDate = normalizeTradeDate(input.latestKlineTradeDate);
  const expectedKlineDate = normalizeTradeDate(input.expectedKlineTradeDate);
  const latestPrice = finiteNumber(input.latestPrice);
  const baselinePrice = finiteNumber(input.baselinePrice);
  const klineClose = finiteNumber(input.klineClose);
  const referencePrice = finiteNumber(input.referencePrice);

  checks.push(buildQuoteCheck(input.quoteUpdatedAt, input.snapshotFetchedAt));
  checks.push(buildKlineDateCheck({
    quoteTradeDate,
    latestKlineDate,
    expectedKlineDate,
    freshnessStatus: input.klineFreshnessStatus
  }));
  checks.push(buildKlinePriceCheck({
    latestPrice,
    quoteTradeDate,
    latestKlineDate,
    klineClose,
    klineChangePct: finiteNumber(input.klineChangePct)
  }));
  if (input.requireBaseline !== false) {
    checks.push(buildBaselineCheck({
      latestPrice,
      baselinePrice,
      baselineFetchedAt: input.baselineFetchedAt,
      snapshotFetchedAt: input.snapshotFetchedAt
    }));
  }

  if (referencePrice !== undefined) {
    checks.push(buildReferencePriceCheck({
      latestPrice,
      referencePrice,
      referenceLabel: input.referenceLabel ?? "参考价"
    }));
  }

  for (const check of checks) {
    if (check.tone === "risk" || check.tone === "review") warnings.push(check.detail);
  }

  const tone = checks.some((item) => item.tone === "risk")
    ? "risk"
    : checks.some((item) => item.tone === "review")
      ? "review"
      : "ok";

  return {
    tone,
    label: consistencyLabel(tone),
    summary: consistencySummary(tone, checks),
    checks,
    warnings
  };
}

function buildQuoteCheck(quoteUpdatedAt?: string | null, snapshotFetchedAt?: string | null): StockDataConsistencyCheck {
  if (!quoteUpdatedAt) {
    return {
      key: "quote_time",
      label: "报价时间",
      value: "--",
      tone: "review",
      detail: "缺少报价更新时间，只能把当前价格视作来源不明的快照。"
    };
  }
  const age = ageMinutes(quoteUpdatedAt, snapshotFetchedAt ?? undefined);
  return {
    key: "quote_time",
    label: "报价时间",
    value: formatShortDateTime(quoteUpdatedAt),
    tone: "ok",
    detail: age === undefined ? "已记录报价更新时间。" : `报价相对快照抓取时间约 ${age} 分钟。`
  };
}

function buildKlineDateCheck(input: {
  quoteTradeDate?: string;
  latestKlineDate?: string;
  expectedKlineDate?: string;
  freshnessStatus?: string | null;
}): StockDataConsistencyCheck {
  if (!input.latestKlineDate) {
    return {
      key: "kline_date",
      label: "K线日期",
      value: "--",
      tone: "review",
      detail: "缺少最新 K 线交易日，无法确认 K 线是否覆盖当前报价日期。"
    };
  }
  if (input.freshnessStatus === "stale") {
    return {
      key: "kline_date",
      label: "K线日期",
      value: formatTradeDate(input.latestKlineDate),
      tone: "risk",
      detail: `K 线交易日 ${formatTradeDate(input.latestKlineDate)} 早于预期 ${formatTradeDate(input.expectedKlineDate)}。`
    };
  }
  if (input.quoteTradeDate && input.quoteTradeDate > input.latestKlineDate) {
    return {
      key: "kline_date",
      label: "K线日期",
      value: formatTradeDate(input.latestKlineDate),
      tone: "review",
      detail: `报价日期 ${formatTradeDate(input.quoteTradeDate)} 晚于 K 线日期 ${formatTradeDate(input.latestKlineDate)}，短线判断要按盘中价与上一日K线分开看。`
    };
  }
  if (input.quoteTradeDate && input.quoteTradeDate < input.latestKlineDate) {
    return {
      key: "kline_date",
      label: "K线日期",
      value: formatTradeDate(input.latestKlineDate),
      tone: "review",
      detail: `报价日期 ${formatTradeDate(input.quoteTradeDate)} 早于 K 线日期 ${formatTradeDate(input.latestKlineDate)}，报价可能是历史快照。`
    };
  }
  return {
    key: "kline_date",
    label: "K线日期",
    value: formatTradeDate(input.latestKlineDate),
    tone: input.freshnessStatus === "unknown" ? "review" : "ok",
    detail: input.freshnessStatus === "unknown" ? "K 线日期存在，但新鲜度仍待确认。" : "K 线日期与报价/预期交易日未发现冲突。"
  };
}

function buildKlinePriceCheck(input: {
  latestPrice?: number;
  quoteTradeDate?: string;
  latestKlineDate?: string;
  klineClose?: number;
  klineChangePct?: number;
}): StockDataConsistencyCheck {
  if (input.latestPrice === undefined || input.klineClose === undefined) {
    return {
      key: "kline_price",
      label: "价差",
      value: "--",
      tone: "review",
      detail: "缺少最新价或 K 线收盘价，无法确认价格口径是否一致。"
    };
  }
  const diffPct = diffPercent(input.latestPrice, input.klineClose);
  const sameTradeDate = Boolean(input.quoteTradeDate && input.latestKlineDate && input.quoteTradeDate === input.latestKlineDate);
  const tone: StockDataConsistencyTone =
    sameTradeDate && diffPct >= PRICE_MISMATCH_RISK_PCT
      ? "risk"
      : sameTradeDate && diffPct >= PRICE_MISMATCH_REVIEW_PCT
        ? "review"
        : "ok";
  return {
    key: "kline_price",
    label: sameTradeDate ? "价差" : "距K线收盘",
    value: `${formatSignedPct(((input.latestPrice - input.klineClose) / input.klineClose) * 100)}`,
    tone,
    detail: sameTradeDate
      ? `最新价 ${formatPrice(input.latestPrice)} 与同日 K 线收盘 ${formatPrice(input.klineClose)} 相差 ${diffPct.toFixed(2)}%。`
      : `最新价 ${formatPrice(input.latestPrice)} 相对 K 线收盘 ${formatPrice(input.klineClose)} 偏离 ${diffPct.toFixed(2)}%，若处于盘中这是正常盘中漂移。`
  };
}

function buildBaselineCheck(input: {
  latestPrice?: number;
  baselinePrice?: number;
  baselineFetchedAt?: string | null;
  snapshotFetchedAt?: string | null;
}): StockDataConsistencyCheck {
  if (input.baselinePrice === undefined) {
    return {
      key: "baseline",
      label: "追踪基准",
      value: "--",
      tone: "review",
      detail: "缺少加入追踪时的基准价，加入以来涨跌只能等待后续快照补齐。"
    };
  }
  if (input.latestPrice === undefined) {
    return {
      key: "baseline",
      label: "追踪基准",
      value: formatPrice(input.baselinePrice),
      tone: "review",
      detail: "已记录基准价，但缺少最新价，无法计算加入以来涨跌。"
    };
  }
  const returnPct = ((input.latestPrice - input.baselinePrice) / input.baselinePrice) * 100;
  return {
    key: "baseline",
    label: "追踪基准",
    value: `${formatPrice(input.baselinePrice)} / ${formatSignedPct(returnPct)}`,
    tone: "ok",
    detail: `基准价 ${formatPrice(input.baselinePrice)} 到最新价 ${formatPrice(input.latestPrice)}，加入以来 ${formatSignedPct(returnPct)}。`
  };
}

function buildReferencePriceCheck(input: {
  latestPrice?: number;
  referencePrice: number;
  referenceLabel: string;
}): StockDataConsistencyCheck {
  if (input.latestPrice === undefined) {
    return {
      key: "reference_price",
      label: input.referenceLabel,
      value: formatPrice(input.referencePrice),
      tone: "review",
      detail: `缺少最新价，无法与${input.referenceLabel}比较。`
    };
  }
  const diffPct = diffPercent(input.latestPrice, input.referencePrice);
  const tone: StockDataConsistencyTone = diffPct >= PRICE_MISMATCH_RISK_PCT ? "risk" : diffPct >= PRICE_MISMATCH_REVIEW_PCT ? "review" : "ok";
  return {
    key: "reference_price",
    label: input.referenceLabel,
    value: `${formatPrice(input.referencePrice)} / ${formatSignedPct(((input.latestPrice - input.referencePrice) / input.referencePrice) * 100)}`,
    tone,
    detail: `最新价 ${formatPrice(input.latestPrice)} 与${input.referenceLabel} ${formatPrice(input.referencePrice)} 相差 ${diffPct.toFixed(2)}%。`
  };
}

function consistencyLabel(tone: StockDataConsistencyTone) {
  if (tone === "ok") return "数据口径一致";
  if (tone === "review") return "数据口径需复核";
  return "数据口径冲突";
}

function consistencySummary(tone: StockDataConsistencyTone, checks: StockDataConsistencyCheck[]) {
  const firstIssue = checks.find((item) => item.tone === "risk") ?? checks.find((item) => item.tone === "review");
  if (tone === "ok") return "报价时间、K 线日期、追踪基准价之间未发现明显冲突。";
  if (!firstIssue) return "存在需要复核的数据口径。";
  return firstIssue.detail;
}

function normalizeTradeDate(value?: string | null) {
  if (!value) return undefined;
  const compact = String(value).replace(/[./-]/g, "");
  return /^\d{8}$/.test(compact) ? compact : undefined;
}

function tradeDateFromIso(value?: string | null) {
  if (!value) return undefined;
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date);
    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${map.year}${map.month}${map.day}`;
  }
  return normalizeTradeDate(value);
}

function finiteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function diffPercent(left: number, right: number) {
  if (right <= 0) return 0;
  return Math.abs(((left - right) / right) * 100);
}

function ageMinutes(value?: string | null, now?: string | null) {
  if (!value || !now) return undefined;
  const time = new Date(value).getTime();
  const nowTime = new Date(now).getTime();
  if (!Number.isFinite(time) || !Number.isFinite(nowTime)) return undefined;
  return Math.max(0, Math.round((nowTime - time) / 60_000));
}

function formatTradeDate(value?: string) {
  const date = normalizeTradeDate(value);
  if (!date) return "--";
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
}

function formatShortDateTime(value?: string | null) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatPrice(value: number) {
  return value.toFixed(2);
}

function formatSignedPct(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}
