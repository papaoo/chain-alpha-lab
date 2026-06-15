import type { LimitPoolSnapshot, MarketBreadthSnapshot, SectorConstituentSnapshot } from "@/lib/types";
import { cleanSectorName, normalizeSectorName, sectorAliasesFor } from "@/lib/sector/normalization";

const EASTMONEY_UT = process.env.EASTMONEY_UT || "bd1d9ddb04089700cf9c27f6f7426281";
const LIMIT_POOL_UT = process.env.EASTMONEY_LIMIT_POOL_UT || "7eea3edcaed734bea9cbfc24409ed989";
const CLIST_URL = "https://push2delay.eastmoney.com/api/qt/clist/get";
const STOCK_GET_URLS = [
  "https://push2delay.eastmoney.com/api/qt/stock/get",
  "https://push2.eastmoney.com/api/qt/stock/get"
];
const F10_URL = "https://emweb.securities.eastmoney.com/PC_HSF10";
const DEFAULT_TIMEOUT_MS = parsePositiveInt(process.env.EASTMONEY_TIMEOUT_MS, 15000);
const DEFAULT_RETRIES = parsePositiveInt(process.env.EASTMONEY_RETRIES, 2);

type BoardType = "industry" | "concept";
type LimitPoolType = LimitPoolSnapshot["pool"];

interface EastmoneyOptions {
  timeoutMs?: number;
  retries?: number;
}

interface EastmoneyEnvelope<T> {
  data: T | null;
  warnings: string[];
  sourceUrl?: string;
}

interface RawBoard {
  f12?: string;
  f14?: string;
}

interface RawQuote {
  f2?: number | string;
  f3?: number | string;
  f4?: number | string;
  f5?: number | string;
  f6?: number | string;
  f7?: number | string;
  f8?: number | string;
  f9?: number | string;
  f43?: number | string;
  f44?: number | string;
  f45?: number | string;
  f46?: number | string;
  f47?: number | string;
  f48?: number | string;
  f12?: string;
  f13?: number | string;
  f14?: string;
  f15?: number | string;
  f16?: number | string;
  f17?: number | string;
  f18?: number | string;
  f20?: number | string;
  f21?: number | string;
  f23?: number | string;
  f57?: string;
  f58?: string;
  f60?: number | string;
  f107?: number | string;
  f116?: number | string;
  f117?: number | string;
  f127?: string;
  f162?: number | string;
  f167?: number | string;
  f168?: number | string;
  f169?: number | string;
  f170?: number | string;
  f171?: number | string;
  f62?: number | string;
  f100?: string;
}

export interface EastmoneyQuote {
  code: string;
  marketCode: string;
  name: string;
  latest?: number;
  changePct?: number;
  changeAmount?: number;
  volume?: number;
  amount?: number;
  amplitude?: number;
  turnoverRate?: number;
  peDynamic?: number;
  high?: number;
  low?: number;
  open?: number;
  prevClose?: number;
  totalMarketValue?: number;
  floatMarketValue?: number;
  pb?: number;
  mainNetInflow?: number;
  industry?: string;
}

interface EastmoneyKline {
  date: string;
  open?: number;
  close?: number;
  high?: number;
  low?: number;
  volume?: number;
  amount?: number;
  amplitude?: number;
  changePct?: number;
  changeAmount?: number;
  turnoverRate?: number;
}

interface EastmoneyFundFlow {
  date: string;
  mainNetFlow?: number;
  smallNetFlow?: number;
  mediumNetFlow?: number;
  largeNetFlow?: number;
  superLargeNetFlow?: number;
  mainNetFlowPct?: number;
  close?: number;
  changePct?: number;
}

interface EastmoneyCompanyProfile {
  code: string;
  marketCode: string;
  name: string;
  industry?: string;
  business?: string;
  businessScope?: string;
  orgProfile?: string;
  mainProducts?: string[];
}

interface RawF10Survey {
  SECURITY_CODE?: string;
  SECURITY_NAME_ABBR?: string;
  EM2016?: string;
  INDUSTRYCSRC1?: string;
  ORG_PROFILE?: string;
}

interface RawF10BusinessScope {
  BUSINESS_SCOPE?: string;
}

interface RawF10BusinessComposition {
  ITEM_NAME?: string;
  MAINOP_TYPE?: string;
  MBI_RATIO?: number;
  REPORT_DATE?: string;
}

interface RawLimitPool {
  c?: string;
  m?: number | string;
  n?: string;
  p?: number | string;
  zdp?: number | string;
  amount?: number | string;
  ltsz?: number | string;
  tshare?: number | string;
  hs?: number | string;
  fbt?: number | string;
  lbt?: number | string;
  fund?: number | string;
  zbc?: number | string;
  lbc?: number | string;
  lb?: number | string;
  zttj?: { days?: number; ct?: number };
  hybk?: string;
}

export class EastmoneyAdapter {
  async getAllAQuotes(limit = 80, options: EastmoneyOptions = {}): Promise<EastmoneyEnvelope<EastmoneyQuote[]>> {
    const fetched = await fetchPaged<RawQuote>(CLIST_URL, {
      pz: Math.min(Math.max(limit, 20), 100),
      po: 1,
      np: 1,
      ut: EASTMONEY_UT,
      fltt: 2,
      invt: 2,
      fid: "f3",
      fs: "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048",
      fields: "f2,f3,f4,f5,f6,f7,f8,f9,f12,f13,f14,f15,f16,f17,f18,f20,f21,f23,f62,f100"
    }, options, Math.ceil(limit / 100) + 1);
    if (!fetched.ok) return { data: null, warnings: [fetched.warning], sourceUrl: fetched.sourceUrl };
    return {
      sourceUrl: fetched.sourceUrl,
      warnings: fetched.records.length ? [] : ["东方财富全A行情返回空数据"],
      data: fetched.records.slice(0, limit).map(toQuote).filter((quote) => quote.code)
    };
  }

  async getStockQuotes(codes: string[], options: EastmoneyOptions = {}): Promise<EastmoneyEnvelope<EastmoneyQuote[]>> {
    const warnings: string[] = [];
    const data: EastmoneyQuote[] = [];
    const settled = await Promise.all(codes.map(async (code) => {
      const secid = toSecid(code);
      if (!secid) return { data: null, warnings: [`东方财富个股报价代码格式不支持：${code}`] };
      const fetched = await fetchStockQuote(secid, options);
      if (!fetched.ok || !fetched.json.data) return { data: null, warnings: [fetched.warning || `东方财富个股报价返回空数据：${code}`] };
      return { data: toQuoteFromStockGet(fetched.json.data), warnings: [] };
    }));
    for (const item of settled) {
      warnings.push(...item.warnings);
      if (item.data) data.push(item.data);
    }
    return { data, warnings };
  }

  async getStockKlines(code: string, limit = 30, options: EastmoneyOptions = {}): Promise<EastmoneyEnvelope<EastmoneyKline[]>> {
    const secid = toSecid(code);
    if (!secid) return { data: null, warnings: [`东方财富日K代码格式不支持：${code}`] };
    const fetched = await fetchJson<{ data?: { klines?: string[] } }>("https://push2his.eastmoney.com/api/qt/stock/kline/get", {
      ut: EASTMONEY_UT,
      secid,
      fields1: "f1,f2,f3,f4,f5,f6",
      fields2: "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61",
      klt: 101,
      fqt: 1,
      beg: "19900101",
      end: "20500101",
      lmt: limit
    }, options);
    if (!fetched.ok) return { data: null, warnings: [fetched.warning], sourceUrl: fetched.sourceUrl };
    return {
      data: (fetched.json.data?.klines ?? []).slice(-limit).map(parseKline).filter((item): item is EastmoneyKline => Boolean(item)),
      warnings: [],
      sourceUrl: fetched.sourceUrl
    };
  }

  async getStockFundFlow(code: string, limit = 20, options: EastmoneyOptions = {}): Promise<EastmoneyEnvelope<EastmoneyFundFlow[]>> {
    const secid = toSecid(code);
    if (!secid) return { data: null, warnings: [`东方财富资金流代码格式不支持：${code}`] };
    const fetched = await fetchJson<{ data?: { klines?: string[] } }>("https://push2.eastmoney.com/api/qt/stock/fflow/daykline/get", {
      ut: EASTMONEY_UT,
      secid,
      lmt: limit,
      klt: 101,
      fields1: "f1,f2,f3,f7",
      fields2: "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63"
    }, options);
    if (!fetched.ok) return { data: null, warnings: [fetched.warning], sourceUrl: fetched.sourceUrl };
    return {
      data: (fetched.json.data?.klines ?? []).slice(-limit).map(parseFundFlow).filter((item): item is EastmoneyFundFlow => Boolean(item)),
      warnings: [],
      sourceUrl: fetched.sourceUrl
    };
  }

  async getCompanyProfile(code: string, options: EastmoneyOptions = {}): Promise<EastmoneyEnvelope<EastmoneyCompanyProfile>> {
    const f10Code = toF10Code(code);
    if (!f10Code) return { data: null, warnings: [`东方财富F10代码格式不支持：${code}`] };
    const [survey, business] = await Promise.all([
      fetchJson<{ jbzl?: RawF10Survey[] }>(`${F10_URL}/CompanySurvey/PageAjax`, { code: f10Code }, options),
      fetchJson<{ zyfw?: RawF10BusinessScope[]; zygcfx?: RawF10BusinessComposition[] }>(`${F10_URL}/BusinessAnalysis/PageAjax`, { code: f10Code }, options)
    ]);
    const warnings = [
      ...(!survey.ok ? [survey.warning] : []),
      ...(!business.ok ? [business.warning] : [])
    ];
    const base = survey.ok ? survey.json.jbzl?.[0] : undefined;
    const scope = business.ok ? business.json.zyfw?.[0] : undefined;
    const products = business.ok
      ? (business.json.zygcfx ?? [])
          .filter((item) => item.MAINOP_TYPE === "1" || item.MAINOP_TYPE === "2")
          .sort((left, right) => (right.MBI_RATIO ?? 0) - (left.MBI_RATIO ?? 0))
          .map((item) => item.ITEM_NAME)
          .filter((item): item is string => Boolean(item))
          .slice(0, 5)
      : [];
    const normalizedCode = normalizeMarketCode(code);
    const data = {
      code: normalizedCode,
      marketCode: normalizedCode,
      name: base?.SECURITY_NAME_ABBR ?? "",
      industry: base?.EM2016 ?? base?.INDUSTRYCSRC1,
      business: products.length ? products.join("、") : scope?.BUSINESS_SCOPE ?? base?.ORG_PROFILE,
      businessScope: scope?.BUSINESS_SCOPE,
      orgProfile: base?.ORG_PROFILE,
      mainProducts: products
    };
    return {
      data: data.business || data.industry ? data : null,
      warnings: data.business || data.industry ? warnings : [...warnings, `东方财富F10未返回有效公司概况：${code}`]
    };
  }

  async getMarketBreadth(options: EastmoneyOptions = {}): Promise<EastmoneyEnvelope<MarketBreadthSnapshot>> {
    const url = CLIST_URL;
    const params = {
      pz: 100,
      po: 1,
      np: 1,
      ut: EASTMONEY_UT,
      fltt: 2,
      invt: 2,
      fid: "f3",
      fs: "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048",
      fields: "f2,f3,f4,f5,f6,f8,f12,f13,f14,f20,f21"
    };
    const fetched = await fetchPaged<RawQuote>(url, params, options, 120);
    if (!fetched.ok) return { data: null, warnings: [fetched.warning], sourceUrl: fetched.sourceUrl };
    const records = fetched.records
      .map((record) => ({ changePct: numberValue(record.f3), amount: numberValue(record.f6) }))
      .filter((record) => record.changePct !== undefined);
    const total = records.length;
    const up = records.filter((record) => (record.changePct ?? 0) > 0).length;
    const down = records.filter((record) => (record.changePct ?? 0) < 0).length;
    const flat = records.filter((record) => record.changePct === 0).length;
    const gt5 = records.filter((record) => (record.changePct ?? 0) >= 5).length;
    const ltMinus5 = records.filter((record) => (record.changePct ?? 0) <= -5).length;
    const limitUpApprox = records.filter((record) => (record.changePct ?? 0) >= 9.8).length;
    const limitDownApprox = records.filter((record) => (record.changePct ?? 0) <= -9.8).length;
    return {
      sourceUrl: fetched.sourceUrl,
      warnings: [],
      data: {
        source: "eastmoney",
        fetchedAt: new Date().toISOString(),
        total,
        up,
        down,
        flat,
        upPct: percent(up, total),
        downPct: percent(down, total),
        gt5Count: gt5,
        ltMinus5Count: ltMinus5,
        limitUpApprox,
        limitDownApprox,
        medianChangePct: median(records.map((record) => record.changePct).filter(isNumber)),
        amount: records.reduce((sum, record) => sum + (record.amount ?? 0), 0)
      }
    };
  }

  async getLimitPool(pool: LimitPoolType, date: string, options: EastmoneyOptions = {}): Promise<EastmoneyEnvelope<LimitPoolSnapshot>> {
    const [url, sort] = limitPoolEndpoint(pool);
    const fetched = await fetchJson<{ data?: { pool?: RawLimitPool[] } }>(url, {
      ut: LIMIT_POOL_UT,
      dpt: "wz.ztzt",
      Pageindex: 0,
      pagesize: 10000,
      sort,
      date
    }, options);
    if (!fetched.ok) return { data: null, warnings: [fetched.warning], sourceUrl: fetched.sourceUrl };
    const rows = fetched.json.data?.pool ?? [];
    return {
      sourceUrl: fetched.sourceUrl,
      warnings: rows.length || pool !== "zt" ? [] : [`东方财富 ${pool} 池在 ${date} 返回空数据，请确认交易日或接口时效。`],
      data: {
        source: "eastmoney",
        fetchedAt: new Date().toISOString(),
        pool,
        date,
        stocks: rows.map((row) => ({
          code: row.c ?? "",
          marketCode: marketCode(row.c, numberValue(row.m)),
          name: row.n ?? "",
          latest: milliPrice(row.p),
          changePct: numberValue(row.zdp),
          amount: numberValue(row.amount),
          floatMarketValue: numberValue(row.ltsz),
          totalMarketValue: numberValue(row.tshare),
          turnoverRate: numberValue(row.hs),
          firstLimitTime: formatTime(row.fbt),
          lastLimitTime: formatTime(row.lbt),
          sealAmount: numberValue(row.fund),
          openBoardCount: numberValue(row.zbc),
          consecutiveLimitCount: numberValue(row.lbc) ?? numberValue(row.lb),
          limitStats: row.zttj ? `${row.zttj.days ?? 0}/${row.zttj.ct ?? 0}` : undefined,
          industry: row.hybk
        })).filter((stock) => stock.code)
      }
    };
  }

  async getSectorConstituents(name: string, type: BoardType = "industry", options: EastmoneyOptions = {}): Promise<EastmoneyEnvelope<SectorConstituentSnapshot>> {
    const resolved = await this.resolveBoardCode(name, type, options);
    if (!resolved.data) return { data: null, warnings: resolved.warnings, sourceUrl: resolved.sourceUrl };
    const url = CLIST_URL;
    const fetched = await fetchPaged<RawQuote>(url, {
      pz: 100,
      po: 1,
      np: 1,
      ut: EASTMONEY_UT,
      fltt: 2,
      invt: 2,
      fid: type === "concept" ? "f12" : "f3",
      fs: `b:${resolved.data.code}+f:!50`,
      fields: "f2,f3,f4,f5,f6,f7,f8,f9,f12,f13,f14,f15,f16,f17,f18,f21,f23,f62"
    }, options, 80);
    if (!fetched.ok) return { data: null, warnings: [fetched.warning], sourceUrl: fetched.sourceUrl };
    const stocks = fetched.records.map((record) => ({
      code: record.f12 ?? "",
      marketCode: marketCode(record.f12, numberValue(record.f13)),
      name: record.f14 ?? "",
      latest: numberValue(record.f2),
      changePct: numberValue(record.f3),
      changeAmount: numberValue(record.f4),
      volume: numberValue(record.f5),
      amount: numberValue(record.f6),
      amplitude: numberValue(record.f7),
      turnoverRate: numberValue(record.f8),
      peDynamic: numberValue(record.f9),
      high: numberValue(record.f15),
      low: numberValue(record.f16),
      open: numberValue(record.f17),
      prevClose: numberValue(record.f18),
      floatMarketValue: numberValue(record.f21),
      pb: numberValue(record.f23),
      mainNetInflow: numberValue(record.f62)
    })).filter((stock) => stock.code);
    return {
      sourceUrl: fetched.sourceUrl,
      warnings: resolved.warnings,
      data: {
        source: "eastmoney",
        fetchedAt: new Date().toISOString(),
        name,
        boardCode: resolved.data.code,
        boardType: type,
        stocks
      }
    };
  }

  private async resolveBoardCode(nameOrCode: string, type: BoardType, options: EastmoneyOptions): Promise<EastmoneyEnvelope<{ code: string; name: string }>> {
    if (/^BK\d+$/i.test(nameOrCode)) {
      return { data: { code: nameOrCode.toUpperCase(), name: nameOrCode }, warnings: [] };
    }
    const isConcept = type === "concept";
    const url = CLIST_URL;
    const fetched = await fetchPaged<RawBoard>(url, {
      pz: 100,
      po: 1,
      np: 1,
      ut: EASTMONEY_UT,
      fltt: 2,
      invt: 2,
      fid: isConcept ? "f12" : "f3",
      fs: isConcept ? "m:90+t:3+f:!50" : "m:90+t:2+f:!50",
      fields: "f12,f14"
    }, options, 80);
    if (!fetched.ok) return { data: null, warnings: [fetched.warning], sourceUrl: fetched.sourceUrl };
    const match = findBoardMatch(fetched.records, nameOrCode);
    if (match?.f12) return { data: { code: match.f12, name: match.f14 ?? nameOrCode }, warnings: [], sourceUrl: fetched.sourceUrl };
    for (const alias of boardAliases(nameOrCode, type)) {
      const aliasMatch = findBoardMatch(fetched.records, alias);
      if (aliasMatch?.f12) {
        return {
          data: { code: aliasMatch.f12, name: aliasMatch.f14 ?? alias },
          warnings: [`东方财富未找到${type === "industry" ? "行业" : "概念"}板块“${nameOrCode}”，已使用关联板块“${aliasMatch.f14 ?? alias}”作为近似成分来源，主线归属需降级确认。`],
          sourceUrl: fetched.sourceUrl
        };
      }
    }
    if (!match?.f12) return { data: null, warnings: [`东方财富未找到${type === "industry" ? "行业" : "概念"}板块：${nameOrCode}`], sourceUrl: fetched.sourceUrl };
    return { data: { code: match.f12, name: match.f14 ?? nameOrCode }, warnings: [], sourceUrl: fetched.sourceUrl };
  }
}

function findBoardMatch(records: RawBoard[], nameOrCode: string) {
  const normalizedName = cleanSectorName(nameOrCode);
  return records.find((record) => record.f14 === nameOrCode)
    ?? records.find((record) => cleanSectorName(record.f14 ?? "") === normalizedName)
    ?? records.find((record) => cleanSectorName(record.f14 ?? "").includes(normalizedName))
    ?? records.find((record) => normalizedName.includes(cleanSectorName(record.f14 ?? "")) && cleanSectorName(record.f14 ?? "").length >= 3);
}

function boardAliases(nameOrCode: string, type: BoardType) {
  const normalized = normalizeBoardName(nameOrCode);
  const aliases: string[] = sectorAliasesFor(nameOrCode);
  if (/空心杯电机|微特电机|机器人电机|电机执行器/.test(normalized)) {
    aliases.push(...(type === "concept"
      ? ["机器人执行器", "人形机器人", "同步磁阻电机", "机器人概念", "减速器"]
      : ["电机Ⅱ", "电机Ⅲ", "机器人", "自动化设备", "通用设备"]));
  }
  if (/国家大基金|大基金持股|集成电路基金/.test(normalized)) {
    aliases.push(...(type === "concept"
      ? ["国家大基金持股", "大基金持股", "国产芯片", "中芯概念", "半导体概念"]
      : ["半导体", "半导体Ⅱ", "集成电路"]));
  }
  if (/大硅片|硅片|半导体材料|电子化学品|电子树脂|光刻胶|靶材/.test(normalized)) {
    aliases.push(...(type === "concept"
      ? ["半导体概念", "第三代半导体", "碳化硅", "有机硅概念"]
      : ["半导体材料", "合成树脂", "半导体Ⅱ"]));
  }
  if (/物理AI|具身智能|人形机器人/.test(normalized)) {
    aliases.push(...(type === "concept"
      ? ["人形机器人", "机器人概念", "AI智能体", "AI应用"]
      : ["机器人", "自动化设备", "通用设备"]));
  }
  if (/Manus|AI智能体|智能体|AIAgent|AI应用/.test(normalized)) {
    aliases.push(...(type === "concept"
      ? ["AI智能体", "AI应用", "AIGC概念", "多模态AI"]
      : ["软件开发", "互联网服务", "IT服务"]));
  }
  if (/电视广播|图片媒体|数字媒体|影视院线/.test(normalized)) {
    aliases.push(...(type === "concept"
      ? ["文化传媒", "虚拟数字人", "AIGC概念"]
      : ["图片媒体", "影视院线", "广告营销"]));
  }
  return Array.from(new Set(aliases.filter((alias) => alias !== nameOrCode)));
}

function normalizeBoardName(value: string) {
  return normalizeSectorName(value);
}

async function fetchPaged<T>(url: string, params: Record<string, string | number>, options: EastmoneyOptions, maxPages: number) {
  const records: T[] = [];
  let sourceUrl: string | undefined;
  let total: number | undefined;
  const pageSize = Number(params.pz ?? 100);
  for (let pn = 1; pn <= maxPages; pn += 1) {
    const fetched = await fetchJson<{ data?: { diff?: T[]; total?: number } }>(url, { ...params, pn }, options);
    sourceUrl = fetched.sourceUrl;
    if (!fetched.ok) return { ok: false as const, records, sourceUrl, warning: fetched.warning };
    const page = fetched.json.data?.diff ?? [];
    total = fetched.json.data?.total ?? total;
    records.push(...page);
    if (!page.length || records.length >= (total ?? 0) || page.length < pageSize) break;
  }
  return { ok: true as const, records, sourceUrl };
}

async function fetchJson<T>(url: string, params: Record<string, string | number>, options: EastmoneyOptions) {
  const sourceUrl = `${url}?${new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)])).toString()}`;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  let lastError = "";

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(sourceUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 AShareTrendAssistant/1.0",
          Referer: "https://quote.eastmoney.com/"
        }
      });
      clearTimeout(timer);
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      return { ok: true as const, json: await response.json() as T, sourceUrl };
    } catch (error) {
      clearTimeout(timer);
      lastError = classifyFetchError(error);
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }

  return { ok: false as const, json: {} as T, sourceUrl, warning: `东方财富接口请求失败：${lastError}` };
}

async function fetchStockQuote(secid: string, options: EastmoneyOptions) {
  const params = {
    ut: EASTMONEY_UT,
    fltt: 2,
    invt: 2,
    secid,
    fields: "f43,f44,f45,f46,f47,f48,f57,f58,f60,f107,f116,f117,f127,f162,f167,f168,f169,f170,f171"
  };
  let lastWarning = "";
  for (const url of STOCK_GET_URLS) {
    const fetched = await fetchJson<{ data?: RawQuote }>(url, params, options);
    if (fetched.ok && fetched.json.data) return fetched;
    lastWarning = fetched.warning ?? "";
  }
  return {
    ok: false as const,
    json: {} as { data?: RawQuote },
    sourceUrl: `${STOCK_GET_URLS[0]}?${new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)])).toString()}`,
    warning: lastWarning || "东方财富个股报价接口请求失败"
  };
}

function classifyFetchError(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") return `请求超时（>${DEFAULT_TIMEOUT_MS}ms）`;
  if (error instanceof Error && /^HTTP\s/.test(error.message)) return `HTTP错误：${error.message}`;
  if (error instanceof Error) return `网络或解析错误：${error.message}`;
  return `未知错误：${String(error)}`;
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function limitPoolEndpoint(pool: LimitPoolType) {
  if (pool === "zt") return ["https://push2ex.eastmoney.com/getTopicZTPool", "fbt:asc"] as const;
  if (pool === "dt") return ["https://push2ex.eastmoney.com/getTopicDTPool", "fund:asc"] as const;
  if (pool === "zb") return ["https://push2ex.eastmoney.com/getTopicZBPool", "fbt:asc"] as const;
  return ["https://push2ex.eastmoney.com/getYesterdayZTPool", "zs:desc"] as const;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value && value !== "-") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function percent(count: number, total: number) {
  return total ? Number(((count / total) * 100).toFixed(2)) : undefined;
}

function median(values: number[]) {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(2));
}

function milliPrice(value: unknown) {
  const parsed = numberValue(value);
  return parsed === undefined ? undefined : parsed / 1000;
}

function marketCode(code?: string, marketId?: number) {
  if (!code) return "";
  if (marketId === 2 || code.startsWith("4") || code.startsWith("8") || code.startsWith("9")) return `bj${code}`;
  if (marketId === 1 || code.startsWith("6")) return `sh${code}`;
  if (marketId === 0 || code.startsWith("0") || code.startsWith("3")) return `sz${code}`;
  return code;
}

function formatTime(value: unknown) {
  if (value === undefined || value === null || value === 0 || value === "-") return undefined;
  return String(value).padStart(6, "0").replace(/^(\d{2})(\d{2})(\d{2})$/, "$1:$2:$3");
}

function toQuote(record: RawQuote): EastmoneyQuote {
  return {
    code: record.f12 ?? "",
    marketCode: marketCode(record.f12, numberValue(record.f13)),
    name: record.f14 ?? "",
    latest: numberValue(record.f2),
    changePct: numberValue(record.f3),
    changeAmount: numberValue(record.f4),
    volume: numberValue(record.f5),
    amount: numberValue(record.f6),
    amplitude: numberValue(record.f7),
    turnoverRate: numberValue(record.f8),
    peDynamic: numberValue(record.f9),
    high: numberValue(record.f15),
    low: numberValue(record.f16),
    open: numberValue(record.f17),
    prevClose: numberValue(record.f18),
    totalMarketValue: numberValue(record.f20),
    floatMarketValue: numberValue(record.f21),
    pb: numberValue(record.f23),
    mainNetInflow: numberValue(record.f62),
    industry: typeof record.f100 === "string" ? record.f100 : undefined
  };
}

function toQuoteFromStockGet(record: RawQuote): EastmoneyQuote {
  const code = String(record.f57 ?? "");
  return {
    code,
    marketCode: marketCode(code, numberValue(record.f107)),
    name: String(record.f58 ?? ""),
    latest: numberValue(record.f43),
    changePct: numberValue(record.f170),
    changeAmount: numberValue(record.f169),
    volume: numberValue(record.f47),
    amount: numberValue(record.f48),
    high: numberValue(record.f44),
    low: numberValue(record.f45),
    open: numberValue(record.f46),
    prevClose: numberValue(record.f60),
    totalMarketValue: numberValue(record.f116),
    floatMarketValue: numberValue(record.f117),
    peDynamic: numberValue(record.f162),
    pb: numberValue(record.f167),
    turnoverRate: numberValue(record.f168),
    amplitude: numberValue(record.f171),
    industry: typeof record.f127 === "string" ? record.f127 : undefined
  };
}

function parseKline(raw: string): EastmoneyKline | undefined {
  const [date, open, close, high, low, volume, amount, amplitude, changePct, changeAmount, turnoverRate] = raw.split(",");
  if (!date) return undefined;
  return {
    date,
    open: numberValue(open),
    close: numberValue(close),
    high: numberValue(high),
    low: numberValue(low),
    volume: numberValue(volume),
    amount: numberValue(amount),
    amplitude: numberValue(amplitude),
    changePct: numberValue(changePct),
    changeAmount: numberValue(changeAmount),
    turnoverRate: numberValue(turnoverRate)
  };
}

function parseFundFlow(raw: string): EastmoneyFundFlow | undefined {
  const [date, mainNetFlow, smallNetFlow, mediumNetFlow, largeNetFlow, superLargeNetFlow, mainNetFlowPct, , , , , close, changePct] = raw.split(",");
  if (!date) return undefined;
  return {
    date,
    mainNetFlow: numberValue(mainNetFlow),
    smallNetFlow: numberValue(smallNetFlow),
    mediumNetFlow: numberValue(mediumNetFlow),
    largeNetFlow: numberValue(largeNetFlow),
    superLargeNetFlow: numberValue(superLargeNetFlow),
    mainNetFlowPct: numberValue(mainNetFlowPct),
    close: numberValue(close),
    changePct: numberValue(changePct)
  };
}

function toSecid(code: string) {
  const normalized = code.trim().toLowerCase();
  const digits = normalized.replace(/^(sh|sz|bj)/, "");
  if (!/^\d{6}$/.test(digits)) return undefined;
  if (normalized.startsWith("sh") || digits.startsWith("6")) return `1.${digits}`;
  if (normalized.startsWith("sz") || digits.startsWith("0") || digits.startsWith("3")) return `0.${digits}`;
  if (normalized.startsWith("bj") || /^[489]/.test(digits)) return `0.${digits}`;
  return undefined;
}

function toF10Code(code: string) {
  const normalized = normalizeMarketCode(code);
  const digits = normalized.slice(2);
  if (!/^\d{6}$/.test(digits)) return undefined;
  if (normalized.startsWith("sh")) return `SH${digits}`;
  if (normalized.startsWith("sz")) return `SZ${digits}`;
  if (normalized.startsWith("bj")) return `BJ${digits}`;
  return undefined;
}

function normalizeMarketCode(code: string) {
  const normalized = code.trim().toLowerCase();
  const digits = normalized.match(/\d{6}/)?.[0] ?? "";
  if (!digits) return normalized;
  if (normalized.startsWith("sh") || digits.startsWith("6")) return `sh${digits}`;
  if (normalized.startsWith("bj") || /^[489]/.test(digits)) return `bj${digits}`;
  return `sz${digits}`;
}

export const eastmoneyAdapter = new EastmoneyAdapter();
