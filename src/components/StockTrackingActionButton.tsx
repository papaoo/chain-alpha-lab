"use client";

import Link from "next/link";
import { useState } from "react";
import { BellPlus, CheckCircle2, Loader2 } from "lucide-react";
import { cleanDisplayList, cleanDisplayText } from "@/lib/display/text";
import type { StockCandidate } from "@/lib/types";
import type { CoreStockSnapshot } from "@/components/ResearchStockHoverRegistry";

type ApiResponse<T> = { success: boolean; data: T | null; error: { code: string; message: string } | null };
type TrackingCreateResult = {
  id: string;
  created: boolean;
  baselinePrice?: number;
  baselineSource?: string;
  baselineFetchedAt?: string;
  warnings?: string[];
};

export function StockTrackingActionButton({
  stock,
  reportId,
  sectorName,
  compact = false
}: {
  stock: StockCandidate | CoreStockSnapshot;
  reportId?: string;
  sectorName?: string;
  compact?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState(false);
  const [trackingId, setTrackingId] = useState("");
  const [message, setMessage] = useState("");

  async function addToTracking() {
    setLoading(true);
    setMessage("");
    try {
      const payload = buildTrackingPayload(stock, reportId, sectorName);
      const response = await fetch("/api/tracking/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = (await response.json().catch(() => null)) as ApiResponse<TrackingCreateResult> | null;
      if (!response.ok || !json?.success) throw new Error(cleanDisplayText(json?.error?.message) ?? "加入追踪失败");

      setAdded(true);
      setTrackingId(json.data?.id ?? "");
      const baseline = json.data?.baselinePrice !== undefined ? `基准价 ${json.data.baselinePrice.toFixed(2)}` : "基准价待补";
      setMessage(json.data?.created ? `已加入追踪，${baseline}` : `已在追踪中，${baseline}`);
    } catch (error) {
      setMessage(cleanDisplayText(error instanceof Error ? error.message : String(error)) ?? "加入追踪失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={compact ? "" : "mt-3"}>
      <button
        type="button"
        className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-65 ${
          added
            ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-100"
            : "border-cyan-300/35 bg-cyan-300/10 text-cyan-100 hover:border-cyan-200/60 hover:bg-cyan-300/15"
        }`}
        disabled={loading || added}
        onClick={(event) => {
          event.stopPropagation();
          void addToTracking();
        }}
        title="加入个股追踪，后端会拉取最新统一行情作为基准价。"
      >
        {loading ? <Loader2 className="animate-spin" size={13} /> : added ? <CheckCircle2 size={13} /> : <BellPlus size={13} />}
        {added ? "已追踪" : "加入观察"}
      </button>
      {message ? (
        <p className={`mt-1 text-[11px] leading-4 ${added ? "text-emerald-200" : "text-amber-100"}`}>
          {message}
          {trackingId ? (
            <>
              {" / "}
              <Link className="underline decoration-dotted underline-offset-2 hover:text-cyan-100" href="/mainline?view=tracking">
                打开追踪页
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

function buildTrackingPayload(stock: StockCandidate | CoreStockSnapshot, reportId?: string, sectorName?: string) {
  const code = "marketCode" in stock ? stock.marketCode || stock.code : stock.code;
  const name = cleanDisplayText(stock.name) ?? stock.name;
  const resolvedSectorName = cleanDisplayText(sectorName ?? ("sectorName" in stock ? stock.sectorName : undefined));

  return {
    code,
    name,
    source: "mainline",
    entryMode: "watch",
    simulatedPrice: fallbackPrice(stock),
    simulatedPositionPct: 0,
    sourceReportId: reportId,
    sectorName: resolvedSectorName,
    thesis: buildThesis(stock, resolvedSectorName),
    invalidCondition: buildInvalidCondition(stock),
    watchConditions: buildWatchConditions(stock),
    riskNotes: buildRiskNotes(stock)
  };
}

function fallbackPrice(stock: StockCandidate | CoreStockSnapshot) {
  if ("quote" in stock) return stock.quote?.latest ?? stock.price;
  return undefined;
}

function buildThesis(stock: StockCandidate | CoreStockSnapshot, sectorName?: string) {
  if (isCandidate(stock)) {
    const reason = cleanDisplayText(stock.opportunityProfile?.primaryReason ?? stock.signalReasons?.[0] ?? stock.buyPointEvaluation?.triggerCondition);
    const tier = cleanDisplayText(stock.signalTier) ?? stock.signalTier ?? "未分级";
    const action = cleanDisplayText(stock.action) ?? stock.action;
    return `主线候选观察：${cleanDisplayText(stock.sectorName) ?? stock.sectorName} / ${tier}，动作=${action}。${reason ?? "等待后续行情和规则验证。"}`;
  }
  const role = cleanDisplayText(stock.role) ?? stock.role;
  const limitStatus = cleanDisplayText(stock.limitStatus) ?? stock.limitStatus;
  return `主线核心股观察：${sectorName ?? "当前主线"} / ${role}，核心评分 ${stock.score.toFixed(0)}，状态=${limitStatus}。`;
}

function buildInvalidCondition(stock: StockCandidate | CoreStockSnapshot) {
  if (isCandidate(stock)) {
    return (
      cleanDisplayText(stock.invalidCondition) ??
      "若候选评分下降、趋势跌破关键均线、资金继续转弱或买点证据失效，则重新评估。"
    );
  }
  const risk = cleanDisplayText(stock.risks?.[0]);
  if (risk) return `若核心股风险强化则失效：${risk}`;
  return "若主线退潮、核心股分歧扩大、资金转弱或趋势跌破关键均线，则重新评估。";
}

function buildWatchConditions(stock: StockCandidate | CoreStockSnapshot) {
  if (isCandidate(stock)) {
    return cleanDisplayList([
      ...(stock.opportunityProfile?.activationConditions ?? []).slice(0, 3),
      stock.buyPointEvaluation?.triggerCondition,
      stock.tradability?.waitFor
    ].filter((item): item is string => Boolean(item)));
  }
  return cleanDisplayList([
    `观察 ${stock.name} 是否维持 ${stock.role} 角色。`,
    `观察涨跌停状态是否从 ${stock.limitStatus} 转弱。`
  ]);
}

function buildRiskNotes(stock: StockCandidate | CoreStockSnapshot) {
  if (isCandidate(stock)) return cleanDisplayList(stock.riskFlags).slice(0, 4);
  return cleanDisplayList(stock.risks).slice(0, 4);
}

function isCandidate(stock: StockCandidate | CoreStockSnapshot): stock is StockCandidate {
  return "sectorName" in stock && "action" in stock;
}
