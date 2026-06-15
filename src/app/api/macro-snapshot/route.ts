import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type EastmoneyQuote = {
  f2?: number | string;
  f3?: number | string;
  f4?: number | string;
  f12?: string;
  f14?: string;
};

type MacroAsset = {
  key: string;
  name: string;
  symbol: string;
  latest: number | null;
  changePct: number | null;
  change: number | null;
  source: string;
  sourceUrl: string;
  dataType: "index" | "futures" | "fx" | "commodity";
  note: string;
};

const EASTMONEY_SYMBOLS = [
  { key: "nasdaq", secid: "100.NDX", fallbackName: "纳斯达克", dataType: "index" as const, note: "科技成长风险偏好参考。" },
  { key: "sp500", secid: "100.SPX", fallbackName: "标普500", dataType: "index" as const, note: "全球风险资产基准。" },
  { key: "a50_future", secid: "104.CN00Y", fallbackName: "A50期指当月连续", dataType: "futures" as const, note: "A股盘前风险偏好优先参考，区别于富时中国A50指数收盘值。" },
  { key: "a50_index", secid: "100.XIN9", fallbackName: "富时中国A50指数", dataType: "index" as const, note: "富时中国A50官方指数/延迟行情，主要用于指数本体对照。" },
  { key: "hsi", secid: "100.HSI", fallbackName: "恒生指数", dataType: "index" as const, note: "港股与外资风险偏好参考。" },
  { key: "gold", secid: "101.GC00Y", fallbackName: "COMEX黄金", dataType: "commodity" as const, note: "避险情绪与通胀预期参考。" },
  { key: "oil", secid: "102.CL00Y", fallbackName: "NYMEX原油", dataType: "commodity" as const, note: "资源线、通胀预期与全球需求参考。" },
  { key: "usdcnh", secid: "133.USDCNH", fallbackName: "美元兑离岸人民币", dataType: "fx" as const, note: "汇率压力与外资风险偏好参考。" }
];

const EASTMONEY_QUOTE_PAGE = "https://quote.eastmoney.com/center/gridlist.html";

export async function GET() {
  const now = new Date().toISOString();
  const secids = EASTMONEY_SYMBOLS.map((item) => item.secid).join(",");
  const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&fields=f12,f13,f14,f2,f3,f4,f6&secids=${encodeURIComponent(secids)}`;

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        "user-agent": "Mozilla/5.0 AShareMainlineAssistant/0.1"
      }
    });
    if (!response.ok) throw new Error(`Eastmoney macro quote HTTP ${response.status}`);
    const json = (await response.json()) as { data?: { diff?: EastmoneyQuote[] } };
    const diff = json.data?.diff ?? [];
    const assets = EASTMONEY_SYMBOLS.map((item): MacroAsset => {
      const quote = diff.find((row) => row.f12 === item.secid.split(".")[1]);
      return {
        key: item.key,
        name: String(quote?.f14 ?? item.fallbackName),
        symbol: item.secid,
        latest: toNumberOrNull(quote?.f2),
        changePct: toNumberOrNull(quote?.f3),
        change: toNumberOrNull(quote?.f4),
        source: "东方财富公开行情接口",
        sourceUrl: EASTMONEY_QUOTE_PAGE,
        dataType: item.dataType,
        note: item.note
      };
    });

    const riskFlags = buildMacroRiskFlags(assets);
    return NextResponse.json({
      success: true,
      data: {
        fetchedAt: now,
        source: "eastmoney_public",
        assets,
        riskFlags,
        warnings: diff.length ? [] : ["东方财富宏观快照返回为空，首页仅展示占位。"]
      },
      error: null
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: {
          code: "MACRO_SNAPSHOT_FAILED",
          message: error instanceof Error ? error.message : String(error)
        }
      },
      { status: 502 }
    );
  }
}

function toNumberOrNull(value: unknown) {
  if (value === "-" || value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function buildMacroRiskFlags(assets: MacroAsset[]) {
  const flags: string[] = [];
  const nasdaq = assets.find((item) => item.key === "nasdaq");
  const sp500 = assets.find((item) => item.key === "sp500");
  const usdcnh = assets.find((item) => item.key === "usdcnh");

  if ((nasdaq?.changePct ?? 0) <= -2) flags.push("纳指跌幅超过 2%，科技成长线开盘风险偏好可能受压。");
  if ((sp500?.changePct ?? 0) <= -1.5) flags.push("标普500明显走弱，全球风险资产情绪偏谨慎。");
  if ((usdcnh?.changePct ?? 0) >= 0.3) flags.push("离岸人民币走弱，需要关注外资和权重情绪压力。");
  const a50Future = assets.find((item) => item.key === "a50_future");
  const a50Index = assets.find((item) => item.key === "a50_index");
  const hsi = assets.find((item) => item.key === "hsi");
  const oil = assets.find((item) => item.key === "oil");
  const gold = assets.find((item) => item.key === "gold");
  if ((a50Future?.changePct ?? a50Index?.changePct ?? 0) <= -1) flags.push("A50期指走弱，A股权重与开盘情绪可能承压。");
  if ((hsi?.changePct ?? 0) <= -1.5) flags.push("恒生指数偏弱，关注港股科技与外资情绪传导。");
  if ((oil?.changePct ?? 0) >= 2) flags.push("原油明显走强，资源线和通胀交易可能获得关注。");
  if ((gold?.changePct ?? 0) >= 1.5) flags.push("黄金明显走强，避险情绪升温，需要降低追高冲动。");
  if (!flags.length) flags.push("外盘快照未触发明显宏观压制信号。");
  return flags;
}
