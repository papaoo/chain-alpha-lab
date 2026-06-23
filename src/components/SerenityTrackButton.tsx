"use client";

import Link from "next/link";
import { useState } from "react";
import { BellPlus, CheckCircle2, Loader2 } from "lucide-react";
import { cleanDisplayList, cleanDisplayText } from "@/lib/display/text";
import type { SerenityCandidateScore, SerenityPreviewCandidate } from "@/lib/serenity/types";

type ApiResponse<T> = { success: boolean; data: T | null; error: { code: string; message: string } | null };
type TrackingCreateResult = { id: string; created: boolean; baselinePrice?: number; warnings?: string[] };

type SerenityTrackStock = Pick<
  SerenityPreviewCandidate,
  "code" | "name" | "sectorName" | "chainPosition" | "matchReason" | "missingProof" | "latest" | "score"
> & {
  evidenceStrength?: SerenityPreviewCandidate["evidenceStrength"] | SerenityCandidateScore["evidenceStrength"];
  evidenceCoverage?: SerenityPreviewCandidate["evidenceCoverage"] | SerenityCandidateScore["evidenceCoverage"];
  researchBoundary?: SerenityPreviewCandidate["researchBoundary"] | SerenityCandidateScore["researchBoundary"];
  nextResearchChecks?: SerenityPreviewCandidate["nextResearchChecks"] | SerenityCandidateScore["nextResearchChecks"];
  verdict?: string;
};

export function SerenityTrackButton({
  stock,
  theme,
  compact = false
}: {
  stock: SerenityTrackStock;
  theme: string;
  compact?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState(false);
  const [trackingId, setTrackingId] = useState("");
  const [message, setMessage] = useState("");

  if (!stock.code) return null;

  async function addToTracking() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/tracking/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildTrackingPayload(stock, theme))
      });
      const json = (await response.json().catch(() => null)) as ApiResponse<TrackingCreateResult> | null;
      if (!response.ok || !json?.success) throw new Error(cleanDisplayText(json?.error?.message) ?? "加入追踪失败");

      setAdded(true);
      setTrackingId(json.data?.id ?? "");
      const baseline = json.data?.baselinePrice !== undefined ? `基准价 ${json.data.baselinePrice.toFixed(2)}` : "基准价待补";
      setMessage(json.data?.created ? `已加入瓶颈研究观察，${baseline}` : `已在追踪中，${baseline}`);
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
            : "border-lime-300/35 bg-lime-300/10 text-lime-100 hover:border-lime-200/60 hover:bg-lime-300/15"
        }`}
        disabled={loading || added}
        onClick={(event) => {
          event.stopPropagation();
          void addToTracking();
        }}
        title="加入个股追踪。后端会获取最新统一行情作为基准价，并记录 Serenity 瓶颈研究逻辑。"
      >
        {loading ? <Loader2 className="animate-spin" size={13} /> : added ? <CheckCircle2 size={13} /> : <BellPlus size={13} />}
        {added ? "已追踪" : "加入瓶颈观察"}
      </button>
      {message ? (
        <p className={`mt-1 text-[11px] leading-4 ${added ? "text-emerald-200" : "text-amber-100"}`}>
          {message}
          {trackingId ? (
            <>
              {" / "}
              <Link className="underline decoration-dotted underline-offset-2 hover:text-cyan-100" href="/mainline?view=tracking">
                查看追踪
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

function buildTrackingPayload(stock: SerenityTrackStock, theme: string) {
  const name = cleanDisplayText(stock.name) ?? stock.name;
  const chainPosition = cleanDisplayText(stock.chainPosition) ?? stock.chainPosition;
  return {
    code: stock.code,
    name,
    source: "serenity",
    entryMode: "watch",
    simulatedPrice: stock.latest,
    simulatedPositionPct: 0,
    sectorName: cleanDisplayText(stock.sectorName) ?? chainPosition,
    thesis: buildThesis(stock, theme),
    invalidCondition: buildInvalidCondition(stock),
    watchConditions: [
      `验证 ${name} 是否真实处在「${chainPosition}」附近。`,
      "只有财报、公告、客户、产能、认证或项目证据被确认后，才提升研究优先级。",
      "观察它是否进入主线核心结构，或进入高分策略选股池。",
      ...cleanDisplayList(stock.nextResearchChecks).slice(0, 3)
    ],
    riskNotes: [
      `证据强度：${evidenceStrengthLabel(stock.evidenceStrength)}`,
      stock.researchBoundary ? `研究边界：${cleanDisplayText(stock.researchBoundary.label) ?? stock.researchBoundary.label}。${cleanDisplayText(stock.researchBoundary.text) ?? stock.researchBoundary.text}` : "",
      stock.evidenceCoverage ? `证据覆盖：硬证据 ${stock.evidenceCoverage.hardEvidenceCount}，已验证 ${stock.evidenceCoverage.verifiedHardEvidenceCount}，来源 ${stock.evidenceCoverage.sourceCount}，置信度 ${stock.evidenceCoverage.confidencePct}%。` : "",
      ...cleanDisplayList(stock.missingProof).slice(0, 4)
    ].filter(Boolean)
  };
}

function buildThesis(stock: SerenityTrackStock, theme: string) {
  const cleanTheme = cleanDisplayText(theme) ?? theme;
  const chainPosition = cleanDisplayText(stock.chainPosition) ?? stock.chainPosition;
  const reason = cleanDisplayText(stock.verdict ?? stock.matchReason) ?? "来自 Serenity 瓶颈研究候选池。";
  const boundary = stock.researchBoundary ? `边界=${cleanDisplayText(stock.researchBoundary.label) ?? stock.researchBoundary.label}。` : "";
  const score = typeof stock.score === "number" ? stock.score.toFixed(1) : "缺失";
  return `Serenity 瓶颈研究：${cleanTheme} / ${chainPosition}，研究分 ${score}。${boundary}${reason}`;
}

function buildInvalidCondition(stock: SerenityTrackStock) {
  const missing = cleanDisplayText(stock.missingProof?.[0]);
  if (missing) return `若关键缺失证据仍无法补齐，则降低研究优先级：${missing}。`;
  return "若公告、财务、业务结构、客户证据或产能证据无法证明其供应链瓶颈位置，则重新评估。";
}

function evidenceStrengthLabel(value: SerenityTrackStock["evidenceStrength"]) {
  if (value === "strong") return "强";
  if (value === "medium") return "中";
  if (value === "weak") return "弱";
  return "待核验";
}
