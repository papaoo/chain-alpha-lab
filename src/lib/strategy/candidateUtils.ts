export function normalizeStockCode(code: string) {
  const raw = String(code).toLowerCase().trim();
  const digits = raw.match(/\d{6}/)?.[0];
  if (!digits) return raw;
  if (raw.startsWith("sh") || raw.startsWith("sz") || raw.startsWith("bj")) return `${raw.slice(0, 2)}${digits}`;
  if (digits.startsWith("6")) return `sh${digits}`;
  if (digits.startsWith("8") || digits.startsWith("4")) return `bj${digits}`;
  return `sz${digits}`;
}

export function isAshareStockCode(code: string) {
  const normalized = normalizeStockCode(code);
  const digits = normalized.match(/\d{6}/)?.[0];
  if (!digits) return false;
  if (normalized.startsWith("bj")) return /^[48]/.test(digits);
  if (normalized.startsWith("sh")) return /^(600|601|603|605|688|689)/.test(digits);
  if (normalized.startsWith("sz")) return /^(000|001|002|003|300|301|302)/.test(digits);
  return false;
}

export function formatPct(value?: number) {
  return value === undefined ? "缺失" : `${value.toFixed(1)}%`;
}

export function formatSignedPct(value?: number) {
  if (value === undefined) return "缺失";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export function formatMoney(value?: number) {
  if (value === undefined) return "缺失";
  const abs = Math.abs(value);
  if (abs >= 100000000) return `${(value / 100000000).toFixed(2)}亿`;
  if (abs >= 10000) return `${(value / 10000).toFixed(2)}万`;
  return `${value.toFixed(2)}`;
}

export function pctChange(current?: number, previous?: number) {
  if (current === undefined || previous === undefined || previous === 0) return undefined;
  return Number((((current - previous) / Math.abs(previous)) * 100).toFixed(2));
}
