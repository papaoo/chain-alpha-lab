"use client";

import Link from "next/link";
import { useState } from "react";
import { BellPlus, CheckCircle2, Loader2 } from "lucide-react";
import { cleanDisplayList, cleanDisplayText } from "@/lib/display/text";
import type { SelectionPick, SelectionRunRecord } from "@/lib/selection/types";

type ApiResponse<T> = { success: boolean; data: T | null; error: { code: string; message: string } | null };

type TrackingCreateResult = {
  id: string;
  created: boolean;
  baselinePrice?: number;
  baselineSource?: string;
  baselineFetchedAt?: string;
  baselineQuoteUpdatedAt?: string;
  warnings?: string[];
};

export function SelectionTrackButton({
  pick,
  run,
  compact = false
}: {
  pick: SelectionPick;
  run: SelectionRunRecord;
  compact?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [added, setAdded] = useState(false);
  const [trackingId, setTrackingId] = useState("");

  async function addToTracking() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/tracking/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildTrackingPayload(pick, run))
      });
      const json = (await response.json().catch(() => null)) as ApiResponse<TrackingCreateResult> | null;
      if (!response.ok || !json?.success) {
        throw new Error(cleanDisplayText(json?.error?.message) ?? "加入追踪失败");
      }

      setAdded(true);
      setTrackingId(json.data?.id ?? "");
      const baselineText = json.data?.baselinePrice !== undefined
        ? `基准价 ${json.data.baselinePrice.toFixed(2)}`
        : "基准价待补充";
      setMessage(json.data?.created ? `已加入追踪，${baselineText}` : `已在追踪中，${baselineText}`);
    } catch (error) {
      setMessage(cleanDisplayText(error instanceof Error ? error.message : String(error)) ?? "加入追踪失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={compact ? "mt-3" : "mt-3"}>
      <button
        type="button"
        className={`inline-flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs transition disabled:cursor-not-allowed disabled:opacity-65 ${
          added
            ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-100"
            : "border-cyan-300/35 bg-cyan-300/10 text-cyan-100 hover:border-cyan-200/60 hover:bg-cyan-300/15"
        }`}
        disabled={loading || added}
        onClick={addToTracking}
        title="加入个股追踪：后端会拉取最新统一行情作为基准价，并持续计算加入后的涨跌验证。"
      >
        {loading ? <Loader2 className="animate-spin" size={14} /> : added ? <CheckCircle2 size={14} /> : <BellPlus size={14} />}
        {added ? "已追踪" : "加入追踪"}
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

function buildTrackingPayload(pick: SelectionPick, run: SelectionRunRecord) {
  const snapshot = pick.runtimeSnapshot;
  const baselinePrice = snapshot?.latestPrice ?? pick.price;
  const baselineFetchedAt = snapshot?.fetchedAt ?? pick.dataFreshness?.refreshedAt ?? run.finishedAt ?? run.startedAt;
  const baselineQuoteUpdatedAt = snapshot?.quoteUpdatedAt;
  const actionText = cleanDisplayText(pick.action) ?? pick.action;
  const isWaitAction = /wait|condition|条件|等待/i.test(actionText);
  const watchConditions = [
    ...cleanDisplayList(pick.reasons).slice(0, 3),
    isWaitAction
      ? "等待触发条件满足后，再从观察升级为模拟买入。"
      : "观察评分、板块证据、资金证据和刷新后的行情质量是否继续有效。"
  ].filter(Boolean);
  const riskNotes = [
    ...cleanDisplayList(pick.blockers).slice(0, 3),
    ...cleanDisplayList(pick.dataFreshness?.warnings).slice(0, 2),
    ...(snapshot?.actionability?.level && snapshot.actionability.level !== "actionable"
      ? [`运行快照状态为 ${snapshot.actionability.level}：${cleanDisplayText(snapshot.actionability.reason) ?? snapshot.actionability.reason}`]
      : [])
  ].filter(Boolean);

  return {
    code: pick.code,
    name: cleanDisplayText(pick.name) ?? pick.name,
    source: "selection",
    entryMode: "watch",
    simulatedPrice: baselinePrice,
    simulatedPositionPct: 0,
    sourceReportId: run.sourceReportId,
    sourceStrategyRunId: run.id,
    sectorName: cleanDisplayText(pick.sectorName) ?? pick.sectorName,
    thesis: buildTrackingThesis(pick, run),
    invalidCondition: buildInvalidCondition(pick),
    watchConditions,
    riskNotes,
    baselineMeta: {
      price: baselinePrice,
      source: snapshot?.source ?? pick.dataFreshness?.label ?? "选股运行快照",
      fetchedAt: baselineFetchedAt,
      quoteUpdatedAt: baselineQuoteUpdatedAt,
      warnings: cleanDisplayList(snapshot?.warnings ?? pick.dataFreshness?.warnings ?? [])
    }
  };
}

function buildTrackingThesis(pick: SelectionPick, run: SelectionRunRecord) {
  const reason = cleanDisplayText(pick.reasons[0]) ?? "进入策略候选池。";
  const strategyName = cleanDisplayText(run.strategyName) ?? run.strategyName;
  const action = cleanDisplayText(pick.action) ?? pick.action;
  return `${strategyName}：等级 ${pick.tier}，评分 ${pick.score}，动作 ${action}。${reason}`;
}

function buildInvalidCondition(pick: SelectionPick) {
  const blocker = cleanDisplayText(pick.blockers[0]);
  if (blocker) return `若阻断项继续强化则失效：${blocker}`;
  return "若策略评分下降、板块证据失效、资金持续转弱，或刷新后的行情不再支持该形态，则重新评估。";
}
