import { getDataSourceSettings } from "@/lib/db/settings";

const TUSHARE_API_URL = "https://api.tushare.pro";

export interface TushareDailyMetric {
  code: string;
  tsCode: string;
  tradeDate: string;
  close?: number;
  changePct?: number;
  amount?: number;
  turnoverRate?: number;
  volumeRatio?: number;
  peTtm?: number;
  pb?: number;
  psTtm?: number;
  dividendYieldTtm?: number;
  totalMarketValue?: number;
  floatMarketValue?: number;
}

export interface TushareDailyKlineBar {
  code: string;
  tsCode: string;
  tradeDate: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  amount?: number;
  changePct?: number;
  turnoverRate?: number;
}

export interface TushareFundFlowMetric {
  code: string;
  tsCode: string;
  tradeDate?: string;
  mainNetFlow?: number;
  mainNetFlow5D?: number;
  mainNetFlow10D?: number;
  mainNetFlow20D?: number;
}

export interface TushareFinancialIndicator {
  code: string;
  tsCode: string;
  endDate?: string;
  roePct?: number;
  revenueChangePct?: number;
  netProfitChangePct?: number;
  grossMarginPct?: number;
  debtRatioPct?: number;
}

export interface TushareHolderNumber {
  code: string;
  tsCode: string;
  endDate?: string;
  holderCount?: number;
  previousHolderCount?: number;
}

export interface TushareForecast {
  code: string;
  tsCode: string;
  annDate?: string;
  endDate?: string;
  type?: string;
  pChangeMin?: number;
  pChangeMax?: number;
  netProfitMin?: number;
  netProfitMax?: number;
  summary?: string;
  changeReason?: string;
}

export interface TushareTradeCalDay {
  exchange?: string;
  calDate: string;
  isOpen: boolean;
  pretradeDate?: string;
}

type TushareResponse = {
  code: number;
  msg?: string;
  data?: {
    fields?: string[];
    items?: unknown[][];
  };
};

export class TushareAdapter {
  isEnabled() {
    const provider = getDataSourceSettings().providers.find((item) => item.id === "tushare");
    return Boolean(provider?.enabled && provider.status !== "disabled" && provider.apiKey);
  }

  async getDailyMetrics(codes: string[], tradeDate: string): Promise<{ data: TushareDailyMetric[]; warnings: string[] }> {
    if (!this.isEnabled()) return { data: [], warnings: [] };
    const uniqueCodes = Array.from(new Set(codes.map(normalizeMarketCode).filter(Boolean)));
    if (!uniqueCodes.length) return { data: [], warnings: [] };

    const warnings: string[] = [];
    const settled = await Promise.all(uniqueCodes.map(async (code) => {
      try {
        const tsCode = toTushareCode(code);
        const [daily, basic] = await Promise.all([
          this.query("daily", { ts_code: tsCode, start_date: tradeDate, end_date: tradeDate }, "ts_code,trade_date,close,pct_chg,amount"),
          this.query("daily_basic", { ts_code: tsCode, start_date: tradeDate, end_date: tradeDate }, "ts_code,trade_date,turnover_rate,volume_ratio,pe_ttm,pb,ps_ttm,dv_ttm,total_mv,circ_mv")
        ]);
        return mergeDailyMetric(code, daily[0], basic[0]);
      } catch (error) {
        warnings.push(`Tushare 候选股日线指标补充失败 ${code}：${error instanceof Error ? error.message : String(error)}`);
        return null;
      }
    }));

    return {
      data: settled.filter((item): item is TushareDailyMetric => Boolean(item)),
      warnings: Array.from(new Set(warnings))
    };
  }

  async getDailyKlines(code: string, endDate: string, limit = 90): Promise<{ data: TushareDailyKlineBar[]; warnings: string[] }> {
    if (!this.isEnabled()) return { data: [], warnings: ["Tushare 未启用，跳过日 K 线补源。"] };
    const normalized = normalizeMarketCode(code);
    if (!normalized) return { data: [], warnings: [`Tushare 日 K 线补源失败：股票代码无效 ${code}`] };

    const safeLimit = Math.min(Math.max(Math.trunc(limit), 20), 240);
    const startDate = offsetCompactDate(endDate, -Math.ceil(safeLimit * 2.2));
    try {
      const tsCode = toTushareCode(normalized);
      const [dailyRows, basicRows] = await Promise.all([
        this.query(
          "daily",
          { ts_code: tsCode, start_date: startDate, end_date: endDate },
          "ts_code,trade_date,open,high,low,close,vol,amount,pct_chg"
        ),
        this.query(
          "daily_basic",
          { ts_code: tsCode, start_date: startDate, end_date: endDate },
          "ts_code,trade_date,turnover_rate"
        ).catch(() => [])
      ]);
      const basicByDate = new Map(basicRows.map((row) => [String(row.trade_date ?? ""), row]));
      const data = dailyRows
        .map((row) => mergeDailyKlineBar(normalized, row, basicByDate.get(String(row.trade_date ?? ""))))
        .filter((item): item is TushareDailyKlineBar => Boolean(item?.tradeDate && item.close !== undefined))
        .sort((left, right) => left.tradeDate.localeCompare(right.tradeDate))
        .slice(-safeLimit);
      return { data, warnings: data.length ? [] : [`Tushare 日 K 线补源为空：${normalized}`] };
    } catch (error) {
      return {
        data: [],
        warnings: [`Tushare 日 K 线补源失败 ${normalized}：${error instanceof Error ? error.message : String(error)}`]
      };
    }
  }

  async getFundFlows(codes: string[], endDate: string, lookbackDays = 90): Promise<{ data: TushareFundFlowMetric[]; warnings: string[] }> {
    if (!this.isEnabled()) return { data: [], warnings: [] };
    const uniqueCodes = Array.from(new Set(codes.map(normalizeMarketCode).filter(Boolean)));
    const startDate = offsetCompactDate(endDate, -lookbackDays);
    const warnings: string[] = [];
    const settled = await Promise.all(uniqueCodes.map(async (code) => {
      try {
        const tsCode = toTushareCode(code);
        const rows = await this.query("moneyflow", { ts_code: tsCode, start_date: startDate, end_date: endDate }, "ts_code,trade_date,net_mf_amount");
        return mergeFundFlowMetric(code, rows);
      } catch (error) {
        warnings.push(`Tushare 资金流补充失败 ${code}：${error instanceof Error ? error.message : String(error)}`);
        return null;
      }
    }));
    return { data: settled.filter((item): item is TushareFundFlowMetric => Boolean(item)), warnings: Array.from(new Set(warnings)) };
  }

  async getFinancialIndicators(codes: string[], period: string): Promise<{ data: TushareFinancialIndicator[]; warnings: string[] }> {
    if (!this.isEnabled()) return { data: [], warnings: [] };
    const uniqueCodes = Array.from(new Set(codes.map(normalizeMarketCode).filter(Boolean)));
    const warnings: string[] = [];
    const settled = await Promise.all(uniqueCodes.map(async (code) => {
      try {
        const tsCode = toTushareCode(code);
        const rows = await this.query("fina_indicator", { ts_code: tsCode, period }, "ts_code,end_date,roe,or_yoy,netprofit_yoy,grossprofit_margin,debt_to_assets");
        return mergeFinancialIndicator(code, rows[0]);
      } catch (error) {
        warnings.push(`Tushare 财务指标补充失败 ${code}：${error instanceof Error ? error.message : String(error)}`);
        return null;
      }
    }));
    return { data: settled.filter((item): item is TushareFinancialIndicator => Boolean(item)), warnings: Array.from(new Set(warnings)) };
  }

  async getHolderNumbers(codes: string[], endDate: string, lookbackDays = 540): Promise<{ data: TushareHolderNumber[]; warnings: string[] }> {
    if (!this.isEnabled()) return { data: [], warnings: [] };
    const uniqueCodes = Array.from(new Set(codes.map(normalizeMarketCode).filter(Boolean)));
    const startDate = offsetCompactDate(endDate, -lookbackDays);
    const warnings: string[] = [];
    const settled = await Promise.all(uniqueCodes.map(async (code) => {
      try {
        const tsCode = toTushareCode(code);
        const rows = await this.query("stk_holdernumber", { ts_code: tsCode, start_date: startDate, end_date: endDate }, "ts_code,end_date,holder_num");
        return mergeHolderNumber(code, rows);
      } catch (error) {
        warnings.push(`Tushare 股东户数补充失败 ${code}：${error instanceof Error ? error.message : String(error)}`);
        return null;
      }
    }));
    return { data: settled.filter((item): item is TushareHolderNumber => Boolean(item)), warnings: Array.from(new Set(warnings)) };
  }

  async getForecasts(codes: string[], endDate: string, lookbackDays = 540): Promise<{ data: TushareForecast[]; warnings: string[] }> {
    if (!this.isEnabled()) return { data: [], warnings: [] };
    const uniqueCodes = Array.from(new Set(codes.map(normalizeMarketCode).filter(Boolean)));
    const startDate = offsetCompactDate(endDate, -lookbackDays);
    const warnings: string[] = [];
    const settled = await Promise.all(uniqueCodes.map(async (code) => {
      try {
        const tsCode = toTushareCode(code);
        const rows = await this.query(
          "forecast",
          { ts_code: tsCode, start_date: startDate, end_date: endDate },
          "ts_code,ann_date,end_date,type,p_change_min,p_change_max,net_profit_min,net_profit_max,summary,change_reason"
        );
        return mergeForecast(code, rows);
      } catch (error) {
        warnings.push(`Tushare 业绩预告补充失败 ${code}：${error instanceof Error ? error.message : String(error)}`);
        return null;
      }
    }));
    return { data: settled.filter((item): item is TushareForecast => Boolean(item)), warnings: Array.from(new Set(warnings)) };
  }

  async getTradeCalendar(startDate: string, endDate: string): Promise<{ data: TushareTradeCalDay[]; warnings: string[] }> {
    if (!this.isEnabled()) return { data: [], warnings: [] };
    try {
      const rows = await this.query("trade_cal", { exchange: "SSE", start_date: startDate, end_date: endDate }, "exchange,cal_date,is_open,pretrade_date");
      return {
        data: rows.map((row) => ({
          exchange: stringValue(row.exchange),
          calDate: String(row.cal_date ?? ""),
          isOpen: numberValue(row.is_open) === 1,
          pretradeDate: stringValue(row.pretrade_date)
        })).filter((row) => /^\d{8}$/.test(row.calDate)),
        warnings: []
      };
    } catch (error) {
      return { data: [], warnings: [`Tushare 交易日历校验失败：${error instanceof Error ? error.message : String(error)}`] };
    }
  }

  private async query(apiName: string, params: Record<string, string>, fields: string) {
    const token = getTushareToken();
    if (!token) throw new Error("Tushare token 为空");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(TUSHARE_API_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ api_name: apiName, token, params, fields }),
        signal: controller.signal
      });
      const json = await response.json().catch(() => null) as TushareResponse | null;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!json || json.code !== 0) throw new Error(json?.msg || `${apiName} 返回非成功状态`);
      return rowsToObjects(json.data?.fields ?? [], json.data?.items ?? []);
    } finally {
      clearTimeout(timer);
    }
  }
}

function getTushareToken() {
  const provider = getDataSourceSettings().providers.find((item) => item.id === "tushare");
  return provider?.apiKey?.trim() || "";
}

function rowsToObjects(fields: string[], items: unknown[][]) {
  return items.map((item) => Object.fromEntries(fields.map((field, index) => [field, item[index]])));
}

function mergeDailyMetric(code: string, daily?: Record<string, unknown>, basic?: Record<string, unknown>): TushareDailyMetric {
  const tsCode = String(daily?.ts_code ?? basic?.ts_code ?? toTushareCode(code));
  return {
    code,
    tsCode,
    tradeDate: String(daily?.trade_date ?? basic?.trade_date ?? ""),
    close: numberValue(daily?.close),
    changePct: numberValue(daily?.pct_chg),
    amount: multiply(numberValue(daily?.amount), 1000),
    turnoverRate: numberValue(basic?.turnover_rate),
    volumeRatio: numberValue(basic?.volume_ratio),
    peTtm: numberValue(basic?.pe_ttm),
    pb: numberValue(basic?.pb),
    psTtm: numberValue(basic?.ps_ttm),
    dividendYieldTtm: numberValue(basic?.dv_ttm),
    totalMarketValue: multiply(numberValue(basic?.total_mv), 10000),
    floatMarketValue: multiply(numberValue(basic?.circ_mv), 10000)
  };
}

function mergeDailyKlineBar(code: string, daily?: Record<string, unknown>, basic?: Record<string, unknown>): TushareDailyKlineBar | null {
  if (!daily) return null;
  const tradeDate = stringValue(daily.trade_date);
  if (!tradeDate) return null;
  return {
    code,
    tsCode: String(daily.ts_code ?? toTushareCode(code)),
    tradeDate,
    open: numberValue(daily.open),
    high: numberValue(daily.high),
    low: numberValue(daily.low),
    close: numberValue(daily.close),
    volume: multiply(numberValue(daily.vol), 100),
    amount: multiply(numberValue(daily.amount), 1000),
    changePct: numberValue(daily.pct_chg),
    turnoverRate: numberValue(basic?.turnover_rate)
  };
}

function mergeFundFlowMetric(code: string, rows: Record<string, unknown>[]): TushareFundFlowMetric | null {
  const sorted = [...rows].sort((left, right) => String(right.trade_date ?? "").localeCompare(String(left.trade_date ?? "")));
  const latest = sorted[0];
  if (!latest) return null;
  return {
    code,
    tsCode: String(latest.ts_code ?? toTushareCode(code)),
    tradeDate: stringValue(latest.trade_date),
    mainNetFlow: multiply(numberValue(latest.net_mf_amount), 10000),
    mainNetFlow5D: sumMoneyFlow(sorted, 5),
    mainNetFlow10D: sumMoneyFlow(sorted, 10),
    mainNetFlow20D: sumMoneyFlow(sorted, 20)
  };
}

function mergeFinancialIndicator(code: string, row?: Record<string, unknown>): TushareFinancialIndicator | null {
  if (!row) return null;
  return {
    code,
    tsCode: String(row.ts_code ?? toTushareCode(code)),
    endDate: stringValue(row.end_date),
    roePct: numberValue(row.roe),
    revenueChangePct: numberValue(row.or_yoy),
    netProfitChangePct: numberValue(row.netprofit_yoy),
    grossMarginPct: numberValue(row.grossprofit_margin),
    debtRatioPct: numberValue(row.debt_to_assets)
  };
}

function mergeHolderNumber(code: string, rows: Record<string, unknown>[]): TushareHolderNumber | null {
  const sorted = [...rows].sort((left, right) => String(right.end_date ?? "").localeCompare(String(left.end_date ?? "")));
  const latest = sorted[0];
  if (!latest) return null;
  return {
    code,
    tsCode: String(latest.ts_code ?? toTushareCode(code)),
    endDate: stringValue(latest.end_date),
    holderCount: numberValue(latest.holder_num),
    previousHolderCount: numberValue(sorted[1]?.holder_num)
  };
}

function mergeForecast(code: string, rows: Record<string, unknown>[]): TushareForecast | null {
  const sorted = [...rows].sort((left, right) => String(right.ann_date ?? "").localeCompare(String(left.ann_date ?? "")));
  const latest = sorted[0];
  if (!latest) return null;
  return {
    code,
    tsCode: String(latest.ts_code ?? toTushareCode(code)),
    annDate: stringValue(latest.ann_date),
    endDate: stringValue(latest.end_date),
    type: stringValue(latest.type),
    pChangeMin: numberValue(latest.p_change_min),
    pChangeMax: numberValue(latest.p_change_max),
    netProfitMin: multiply(numberValue(latest.net_profit_min), 10_000),
    netProfitMax: multiply(numberValue(latest.net_profit_max), 10_000),
    summary: stringValue(latest.summary),
    changeReason: stringValue(latest.change_reason)
  };
}

function sumMoneyFlow(rows: Record<string, unknown>[], limit: number) {
  const values = rows.slice(0, limit).map((row) => multiply(numberValue(row.net_mf_amount), 10000)).filter((value): value is number => value !== undefined);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : undefined;
}

function normalizeMarketCode(code: string) {
  const raw = String(code ?? "").trim().toLowerCase();
  const digits = raw.replace(/^(sh|sz|bj)/, "").replace(/\.(sh|sz|bj)$/i, "");
  if (!/^\d{6}$/.test(digits)) return "";
  if (raw.startsWith("sh") || raw.endsWith(".sh")) return `sh${digits}`;
  if (raw.startsWith("sz") || raw.endsWith(".sz")) return `sz${digits}`;
  if (raw.startsWith("bj") || raw.endsWith(".bj")) return `bj${digits}`;
  if (digits.startsWith("6")) return `sh${digits}`;
  if (digits.startsWith("8") || digits.startsWith("4")) return `bj${digits}`;
  return `sz${digits}`;
}

function toTushareCode(code: string) {
  const normalized = normalizeMarketCode(code);
  const digits = normalized.slice(2);
  const suffix = normalized.startsWith("sh") ? "SH" : normalized.startsWith("bj") ? "BJ" : "SZ";
  return `${digits}.${suffix}`;
}

function numberValue(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stringValue(value: unknown) {
  return value === null || value === undefined || value === "" ? undefined : String(value);
}

function multiply(value: number | undefined, factor: number) {
  return value === undefined ? undefined : value * factor;
}

function offsetCompactDate(compactDate: string, offsetDays: number) {
  const year = Number(compactDate.slice(0, 4));
  const month = Number(compactDate.slice(4, 6));
  const day = Number(compactDate.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
}

export const tushareAdapter = new TushareAdapter();
