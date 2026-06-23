"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  Database,
  FlaskConical,
  History,
  Loader2,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { BasicStockNameHover } from "@/components/SelectionStockHover";
import { SerenityEvidenceBoundary } from "@/components/SerenityEvidenceBoundary";
import { SerenityEvidenceTaskPanel } from "@/components/SerenityEvidenceTaskPanel";
import { SerenityTrackButton } from "@/components/SerenityTrackButton";
import { fetchApiJson } from "@/lib/client/api";
import { cleanDisplayList, cleanDisplayText } from "@/lib/display/text";
import type {
  SerenityRunInput,
  SerenityRunResult,
  SerenityRunSummary,
  SerenityThemePreview,
  SerenityThemeSuggestion
} from "@/lib/serenity/types";

type ApiResponse<T> = { success: boolean; data: T | null; error: { code: string; message: string } | null };
type CandidateDraft = SerenityRunInput["candidates"][number] & { id: string };
type MainlineImportResult = {
  reportId?: string;
  reportCreatedAt?: string;
  suggestions: SerenityThemeSuggestion[];
  warnings: string[];
};

const FACTOR_KEYS = [
  ["demandInflection", "需求拐点"],
  ["architectureCoupling", "架构耦合"],
  ["chokepointSeverity", "瓶颈强度"],
  ["supplierConcentration", "供应集中"],
  ["expansionDifficulty", "扩产难度"],
  ["evidenceQuality", "证据质量"],
  ["valuationDisconnect", "认知差"],
  ["catalystTiming", "催化时点"]
] as const;

export function SerenityResearchWorkspace() {
  const [theme, setTheme] = useState("AI 半导体");
  const [market, setMarket] = useState<SerenityRunInput["market"]>("A-share");
  const [timeWindow, setTimeWindow] = useState("未来 3-12 个月");
  const [suggestions, setSuggestions] = useState<SerenityThemeSuggestion[]>([]);
  const [mainlineSuggestions, setMainlineSuggestions] = useState<SerenityThemeSuggestion[]>([]);
  const [mainlineImportMeta, setMainlineImportMeta] = useState<Pick<MainlineImportResult, "reportId" | "reportCreatedAt" | "warnings"> | null>(null);
  const [preview, setPreview] = useState<SerenityThemePreview | null>(null);
  const [candidates, setCandidates] = useState<CandidateDraft[]>([newDraftCandidate()]);
  const [latest, setLatest] = useState<SerenityRunResult | null>(null);
  const [history, setHistory] = useState<SerenityRunSummary[]>([]);
  const [loading, setLoading] = useState<"themes" | "preview" | "run" | "history" | "mainline" | null>(null);
  const [message, setMessage] = useState("");
  const autoLoadedHistoryId = useRef("");
  const hasManualCandidates = useMemo(() => candidates.some((item) => item.name.trim()), [candidates]);

  useEffect(() => {
    void loadHistory();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void searchThemes(theme);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [theme, market]);

  useEffect(() => {
    const latestHistory = history[0];
    if (!latestHistory || latest || preview || autoLoadedHistoryId.current === latestHistory.id) return;
    autoLoadedHistoryId.current = latestHistory.id;
    fetchJson<SerenityRunResult>(`/api/serenity/runs/${latestHistory.id}`)
      .then((json) => setLatest(json.data))
      .catch((error) => setMessage(error instanceof Error ? error.message : String(error)));
  }, [history, latest, preview]);

  async function searchThemes(query: string) {
    setLoading((current) => current ?? "themes");
    try {
      const json = await fetchJson<SerenityThemeSuggestion[]>(
        `/api/serenity/themes?q=${encodeURIComponent(query)}&market=${encodeURIComponent(market)}&limit=8`
      );
      setSuggestions(json.data ?? []);
    } catch (error) {
      setMessage(cleanText(error instanceof Error ? error.message : String(error)));
    } finally {
      setLoading((current) => current === "themes" ? null : current);
    }
  }

  async function loadHistory() {
    setLoading((current) => current ?? "history");
    try {
      const json = await fetchJson<SerenityRunSummary[]>("/api/serenity/runs?limit=12");
      setHistory(json.data ?? []);
    } catch (error) {
      setMessage(cleanText(error instanceof Error ? error.message : String(error)));
    } finally {
      setLoading((current) => current === "history" ? null : current);
    }
  }

  async function buildPreview(nextTheme = theme) {
    setLoading("preview");
    setMessage("");
    try {
      const json = await fetchJson<SerenityThemePreview>("/api/serenity/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ theme: nextTheme, market, timeWindow })
      });
      setPreview(json.data);
      setLatest(null);
    } catch (error) {
      setMessage(cleanText(error instanceof Error ? error.message : String(error)));
    } finally {
      setLoading(null);
    }
  }

  async function createRun() {
    setLoading("run");
    setMessage("");
    try {
      const basePreview = preview ?? (await fetchPreviewForRun());
      const payload: SerenityRunInput = {
        theme,
        market,
        timeWindow,
        layers: basePreview?.layerRanking,
        candidatePreview: basePreview?.candidatePreview,
        candidates: candidates
          .filter((item) => item.name.trim())
          .map(({ id: _id, ...candidate }) => candidate)
      };
      const json = await fetchJson<SerenityRunResult>("/api/serenity/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      setLatest(json.data);
      setMessage(hasManualCandidates ? "瓶颈研究已生成并留痕。" : "瓶颈研究已基于自动候选池生成公司排序并留痕。");
      await loadHistory();
    } catch (error) {
      setMessage(cleanText(error instanceof Error ? error.message : String(error)));
    } finally {
      setLoading(null);
    }
  }

  async function importFromMainline() {
    setLoading("mainline");
    setMessage("");
    try {
      const json = await fetchJson<MainlineImportResult>(`/api/serenity/import/mainline?market=${encodeURIComponent(market)}&limit=8`);
      const imported = json.data?.suggestions ?? [];
      setMainlineSuggestions(imported);
      setMainlineImportMeta({
        reportId: json.data?.reportId,
        reportCreatedAt: json.data?.reportCreatedAt,
        warnings: json.data?.warnings ?? []
      });
      if (imported[0]) {
        setTheme(imported[0].name);
        await buildPreview(imported[0].name);
      }
      const warnings = json.data?.warnings ?? [];
      setMessage(imported.length
        ? `已从最新主线导入 ${imported.length} 个瓶颈研究主题，当前选中：${cleanText(imported[0]?.name, "无")}。`
        : cleanText(warnings[0], "最新主线暂未匹配到可导入主题。"));
    } catch (error) {
      setMessage(cleanText(error instanceof Error ? error.message : String(error)));
    } finally {
      setLoading(null);
    }
  }

  async function fetchPreviewForRun() {
    const json = await fetchJson<SerenityThemePreview>("/api/serenity/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ theme, market, timeWindow })
    });
    setPreview(json.data);
    return json.data;
  }

  function pickTheme(item: SerenityThemeSuggestion) {
    setTheme(item.name);
    void buildPreview(item.name);
  }

  const activeResult = latest;
  const activeLayers = activeResult?.layerRanking ?? preview?.layerRanking ?? [];
  const activeWarnings = activeResult?.warnings ?? preview?.warnings ?? [];
  const activeTheme = cleanText(activeResult?.theme ?? preview?.theme ?? theme);
  const activeQuality = buildSerenityQualitySnapshot(activeResult, preview);

  return (
    <section className="grid gap-4">
      <div className="overflow-hidden rounded-2xl border border-cyan-300/20 bg-slate-950/80 shadow-[0_24px_90px_rgba(2,6,23,0.34)]">
        <div className="relative p-5">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_15%,rgba(34,211,238,0.16),transparent_34%),radial-gradient(circle_at_80%_0%,rgba(163,230,53,0.10),transparent_34%)]" />
          <div className="relative grid gap-5 xl:grid-cols-[1fr_auto] xl:items-end">
            <div>
              <p className="text-xs tracking-[0.18em] text-cyan-200">产业链瓶颈研究</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-50">供应链瓶颈研究</h2>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-400">
                从主题出发，先排产业链层级，再反推 A 股候选公司。当前阶段先做主题预览和研究留痕，不直接给买入信号。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-cyan-300/40 hover:text-cyan-100 disabled:opacity-60"
                type="button"
                disabled={loading === "preview"}
                onClick={() => buildPreview()}
              >
                {loading === "preview" ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
                预览产业链
              </button>
              <button
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-lime-300/30 bg-lime-300/10 px-4 py-3 text-sm font-medium text-lime-100 transition hover:bg-lime-300/16 disabled:opacity-60"
                type="button"
                disabled={loading === "mainline"}
                onClick={importFromMainline}
              >
                {loading === "mainline" ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                从今日主线导入
              </button>
              <button
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-300/35 bg-cyan-300/10 px-4 py-3 text-sm font-medium text-cyan-100 transition hover:bg-cyan-300/16 disabled:opacity-60"
                type="button"
                disabled={loading === "run"}
                onClick={createRun}
              >
                {loading === "run" ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                生成研究留痕
              </button>
            </div>
          </div>
        </div>
      </div>

      {message ? <div className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-100">{message}</div> : null}

      <SerenityUsageGuide />

      <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <div className="grid gap-4 content-start">
          <Panel title="主题入口" icon={BrainCircuit}>
            <div className="grid gap-3">
              <Input label="研究主题" value={theme} onChange={setTheme} placeholder="输入 AI半导体 / CPO / 机器人 / 固态电池" />
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                <label className="grid gap-1.5 text-sm">
                  <span className="text-slate-400">市场</span>
                  <select
                    className="rounded-xl border border-slate-800 bg-slate-900/72 px-3 py-2 text-slate-100 outline-none transition focus:border-cyan-300/60"
                    value={market}
                    onChange={(event) => setMarket(event.target.value as SerenityRunInput["market"])}
                  >
                    <option value="A-share">A 股</option>
                  </select>
                </label>
                <Input label="时间窗口" value={timeWindow} onChange={setTimeWindow} />
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/45 p-3">
                <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
                  <Sparkles size={14} className="text-cyan-200" />
                  主题模糊匹配
                </div>
                <div className="grid gap-2">
                  {suggestions.map((item) => (
                    <button
                      key={item.id}
                      className="rounded-lg border border-slate-800 bg-slate-950/58 p-3 text-left transition hover:border-cyan-300/35"
                      type="button"
                      onClick={() => pickTheme(item)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-slate-100">{cleanText(item.name)}</span>
                        <span className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-400">{cleanText(item.category)}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{cleanText(item.description)}</p>
                    </button>
                  ))}
                  {!suggestions.length ? <p className="text-sm text-slate-500">输入主题后会显示相近研究方向。</p> : null}
                </div>
              </div>
              {mainlineSuggestions.length ? (
                <div className="rounded-xl border border-lime-300/20 bg-lime-300/10 p-3">
                  <div className="mb-3 flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-xs text-lime-100">
                      <Sparkles size={14} />
                      今日主线导入建议
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                      <span className="rounded border border-lime-300/25 bg-slate-950/30 px-2 py-1 text-lime-100">
                        主题 {mainlineSuggestions.length}
                      </span>
                      {mainlineImportMeta?.reportId ? (
                        <span className="rounded border border-slate-700 bg-slate-950/40 px-2 py-1 font-mono text-slate-300" title={mainlineImportMeta.reportId}>
                          报告 {mainlineImportMeta.reportId.slice(0, 8)}
                        </span>
                      ) : null}
                      {mainlineImportMeta?.reportCreatedAt ? (
                        <span className="rounded border border-slate-700 bg-slate-950/40 px-2 py-1 text-slate-400">
                          {formatDateTime(mainlineImportMeta.reportCreatedAt)}
                        </span>
                      ) : null}
                      {mainlineImportMeta?.warnings.length ? (
                        <span className="rounded border border-amber-300/25 bg-amber-300/10 px-2 py-1 text-amber-100">
                          提示 {mainlineImportMeta.warnings.length}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="grid gap-2">
                    {mainlineSuggestions.map((item) => (
                      <button
                        key={item.id}
                        className="rounded-lg border border-lime-300/15 bg-slate-950/52 p-3 text-left transition hover:border-lime-300/40"
                        type="button"
                        onClick={() => pickTheme(item)}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium text-slate-100">{cleanText(item.name)}</span>
                          <span className="rounded border border-lime-300/30 px-2 py-0.5 text-[11px] text-lime-100">主线导入</span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{cleanText(item.sourceLabel ?? item.description)}</p>
                        <p className="mt-2 text-[11px] text-slate-500">
                          导入分 {item.score.toFixed(1)} / 别名 {cleanList(item.aliases).slice(0, 3).join("、") || "无"}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </Panel>

          <Panel title="历史留痕" icon={History}>
            <div className="grid gap-2">
              {history.length ? history.map((item) => (
                <button
                  key={item.id}
                  className="rounded-xl border border-slate-800 bg-slate-900/55 p-3 text-left transition hover:border-cyan-300/35"
                  type="button"
                  onClick={async () => {
                    const json = await fetchJson<SerenityRunResult>(`/api/serenity/runs/${item.id}`);
                    setLatest(json.data);
                    setPreview(null);
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-slate-100">{cleanText(item.theme)}</p>
                    <span className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-400">{item.candidateCount} 公司</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{cleanText(item.summary)}</p>
                </button>
              )) : <p className="text-sm text-slate-500">暂无瓶颈研究记录。</p>}
            </div>
          </Panel>
        </div>

        <div className="grid gap-4 content-start">
          <Panel title="研究路径" icon={ShieldCheck}>
            <div className="grid gap-3 md:grid-cols-3">
              <StepCard index="01" title="主题归一" text="把 AI、CPO、半导体等模糊输入归并成可追踪主题。" />
              <StepCard index="02" title="层级排序" text="先判断设备、材料、封装、测试等哪层更可能稀缺。" />
              <StepCard index="03" title="证据核验" text="再用公告、财报、主营、客户、产能证据筛公司。" />
            </div>
          </Panel>

          {activeQuality ? <SerenityQualityPanel quality={activeQuality} /> : null}
          <SerenityEvidenceTaskPanel runId={activeResult?.id} />

          {activeLayers.length ? (
            <Panel title={activeResult ? "已留痕研究结果" : "产业链预览"} icon={Database}>
              <div className="grid gap-3">
                <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-4">
                  <p className="text-sm font-medium text-cyan-100">{cleanText(activeResult?.summary ?? preview?.normalizedTheme?.description, "已生成产业链层级预览。")}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-400">
                    {cleanText(activeResult?.methodNote, "当前预览不落库；点击“生成研究留痕”后会保存为历史记录。")}
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {activeLayers.map((layer) => (
                    <div key={layer.id} className="rounded-xl border border-slate-800 bg-slate-900/55 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-slate-100">{layer.rank}. {cleanText(layer.name)}</p>
                        <span className="rounded border border-cyan-300/25 px-2 py-0.5 text-[11px] text-cyan-100">层级</span>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-slate-400">{cleanText(layer.scarceReason)}</p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {cleanList(layer.constraints).map((item) => <span key={item} className="rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-400">{item}</span>)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
          ) : (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/72 p-8 text-center text-slate-500">
              <BrainCircuit className="mx-auto text-cyan-200" size={30} />
              <p className="mt-3 text-sm">输入主题后，先预览产业链层级，再决定是否生成研究留痕。</p>
            </div>
          )}

          {preview?.evidencePlan.length ? (
            <Panel title="下一步证据计划" icon={AlertTriangle}>
              <div className="grid gap-2 md:grid-cols-2">
                {cleanList(preview.evidencePlan).map((item, index) => (
                  <div key={item} className="flex gap-3 rounded-xl border border-slate-800 bg-slate-900/55 p-3">
                    <span className="font-mono text-xs text-cyan-200">0{index + 1}</span>
                    <p className="text-sm leading-5 text-slate-300">{item}</p>
                  </div>
                ))}
              </div>
            </Panel>
          ) : null}

          {(preview?.candidatePreview.length || activeResult?.candidatePreview?.length) ? (
            <Panel title="自动候选池预览" icon={FlaskConical}>
              <div className="mb-3 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-xs leading-5 text-amber-100">
                这里展示的是“研究候选”，不是买入名单。候选来自最新系统报告和东方财富板块成分，后续还要用主营、公告、财报、客户、产能证据继续过滤。
              </div>
              <SerenityCandidatePoolSummary candidates={preview?.candidatePreview ?? activeResult?.candidatePreview ?? []} />
              <div className="grid gap-3">
                {(preview?.candidatePreview ?? activeResult?.candidatePreview ?? []).slice(0, 12).map((candidate, index) => (
                  <div key={`${candidate.code ?? candidate.name}-${index}`} className="rounded-2xl border border-slate-800 bg-slate-950/58 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-semibold text-slate-50">
                            {index + 1}.{" "}
                            <BasicStockNameHover
                              stock={{
                                name: cleanText(candidate.name),
                                code: candidate.code,
                                changePct: candidate.changePct,
                                turnoverRate: candidate.turnoverRate,
                                amount: candidate.amount,
                                mainNetFlow: candidate.mainNetInflow,
                                score: candidate.score,
                                note: cleanText(candidate.matchReason)
                              }}
                            />
                          </p>
                          {candidate.code ? <span className="font-mono text-xs text-slate-500">{candidate.code}</span> : null}
                          <span className="rounded border border-cyan-300/30 bg-cyan-300/10 px-2 py-0.5 text-[11px] text-cyan-100">{cleanText(candidate.chainPosition)}</span>
                          <span className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-400">{evidenceLabel(candidate.evidenceStrength)}</span>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-slate-400">{cleanText(candidate.matchReason)}</p>
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-slate-900/65 px-4 py-3 text-right">
                        <p className="font-mono text-xl font-semibold text-cyan-100">{candidate.score.toFixed(1)}</p>
                        <p className="text-[11px] text-slate-500">研究匹配分</p>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      <Mini label="来源" value={cleanText(candidate.sourceLabel)} />
                      <Mini label="来源类型" value={sourceTypeLabel(candidate.source)} />
                      <Mini label="抓取时间" value={formatDateTime(candidate.fetchedAt)} />
                      <Mini label="行业/主营" value={cleanText(candidate.industry || candidate.business, "待补证")} />
                      <Mini label="最新价" value={formatPrice(candidate.latest)} />
                      <Mini label="涨跌幅" value={formatPercent(candidate.changePct)} />
                      <Mini label="换手率" value={formatPercent(candidate.turnoverRate)} />
                      <Mini label="主力净流入" value={formatMoney(candidate.mainNetInflow)} />
                    </div>
                    {candidate.evidenceSummary ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <span className="rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-400">证据源 {candidate.evidenceSummary.sourceCount}</span>
                        <span className="rounded-md border border-emerald-300/25 px-2 py-1 text-[11px] text-emerald-100">强证据 {candidate.evidenceSummary.strongCount}</span>
                        <span className="rounded-md border border-cyan-300/25 px-2 py-1 text-[11px] text-cyan-100">中证据 {candidate.evidenceSummary.mediumCount}</span>
                        <span className="rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-400">弱证据 {candidate.evidenceSummary.weakCount}</span>
                        <span className="rounded-md border border-rose-300/25 px-2 py-1 text-[11px] text-rose-100">待核验 {candidate.evidenceSummary.needsCheckingCount}</span>
                      </div>
                    ) : null}
                    <div className="mt-3">
                      <SerenityEvidenceBoundary item={candidate} compact />
                    </div>
                    <SerenityTrackButton stock={candidate} theme={activeTheme} />
                    {candidate.missingProof.length ? <p className="mt-3 text-xs leading-5 text-amber-100">待补证据：{cleanList(candidate.missingProof).join("；")}</p> : null}
                    {candidate.evidence?.length ? (
                      <details className="mt-3 rounded-xl border border-slate-800 bg-slate-900/45 p-3">
                        <summary className="cursor-pointer text-xs font-medium text-slate-300">查看证据链</summary>
                        <div className="mt-2 grid gap-2">
                          {candidate.evidence.map((item, evidenceIndex) => (
                            <p key={`${item.sourceType}-${evidenceIndex}`} className="text-xs leading-5 text-slate-400">
                              <span className="text-cyan-100">[{evidenceLabel(item.strength)}]</span> {cleanText(item.claim)}
                              <span className="text-slate-600"> 来源：{cleanText(item.sourceLabel)}</span>
                            </p>
                          ))}
                        </div>
                      </details>
                    ) : null}
                  </div>
                ))}
              </div>
            </Panel>
          ) : null}

          {activeResult?.candidates.length ? <SerenityCompanyRanking result={activeResult} /> : null}

          {activeWarnings.length ? (
            <div className="grid gap-2">
              {cleanList(activeWarnings).map((warning) => <p key={warning} className="rounded-xl border border-amber-300/25 bg-amber-300/10 p-3 text-xs leading-5 text-amber-100">{warning}</p>)}
            </div>
          ) : null}

          <details className="rounded-2xl border border-slate-800 bg-slate-950/72 p-4">
            <summary className="cursor-pointer list-none">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <FlaskConical size={17} className="text-cyan-200" />
                  <p className="font-medium text-slate-100">高级模式：手动比较候选公司</p>
                </div>
                <span className="text-xs text-slate-500">可选</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">只有当你明确想比较几家公司时才需要填写；默认流程后续会自动生成 A 股候选池。</p>
            </summary>
            <div className="mt-4 grid gap-3">
              {candidates.map((candidate, index) => (
                <CandidateEditor
                  key={candidate.id}
                  candidate={candidate}
                  index={index}
                  onChange={(next) => setCandidates((items) => items.map((item) => item.id === candidate.id ? next : item))}
                />
              ))}
              <button
                className="inline-flex w-fit items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/65 px-4 py-2 text-sm text-slate-300 transition hover:border-cyan-300/35 hover:text-cyan-100"
                type="button"
                onClick={() => setCandidates((items) => [...items, newDraftCandidate()])}
              >
                <Plus size={16} />
                增加候选
              </button>
            </div>
          </details>
        </div>
      </div>
    </section>
  );
}

function CandidateEditor({ candidate, index, onChange }: { candidate: CandidateDraft; index: number; onChange: (value: CandidateDraft) => void }) {
  return (
    <details className="rounded-2xl border border-slate-800 bg-slate-950/58 p-4" open={index === 0}>
      <summary className="cursor-pointer list-none">
        <div className="flex items-center justify-between gap-3">
          <p className="font-medium text-slate-100">{cleanText(candidate.name) || `候选 ${index + 1}`}</p>
          <span className="font-mono text-xs text-slate-500">{candidate.code || "未填代码"}</span>
        </div>
      </summary>
      <div className="mt-4 grid gap-3">
        <div className="grid gap-3 md:grid-cols-2">
          <Input label="股票代码" value={candidate.code ?? ""} onChange={(code) => onChange({ ...candidate, code })} placeholder="可空" />
          <Input label="公司名称" value={candidate.name} onChange={(name) => onChange({ ...candidate, name })} />
        </div>
        <Input label="产业链位置" value={candidate.chainPosition ?? ""} onChange={(chainPosition) => onChange({ ...candidate, chainPosition })} placeholder="例如：光芯片/测试设备/材料耗材" />
        <Input label="它卡住什么" value={candidate.constrains ?? ""} onChange={(constrains) => onChange({ ...candidate, constrains })} placeholder="例如：高端产品良率、客户认证、扩产瓶颈" />
        <div className="grid gap-2 md:grid-cols-4">
          {FACTOR_KEYS.map(([key, label]) => (
            <RatingInput
              key={key}
              label={label}
              value={candidate.factors?.[key] ?? 0}
              onChange={(value) => onChange({ ...candidate, factors: { ...candidate.factors, [key]: value } })}
            />
          ))}
        </div>
        <Input
          label="证据"
          value={candidate.evidence?.[0]?.claim ?? ""}
          onChange={(claim) => onChange({ ...candidate, evidence: claim ? [{ claim, sourceType: "manual", sourceLabel: "手工输入", strength: "needs_checking" }] : [] })}
          placeholder="先写一条证据线索，后续会接公告/财报/互动易自动补证据"
        />
      </div>
    </details>
  );
}

function SerenityCompanyRanking({ result }: { result: SerenityRunResult }) {
  const previewByCode = new Map((result.candidatePreview ?? [])
    .filter((item) => item.code)
    .map((item) => [item.code, item]));
  return (
    <Panel title="公司研究排序" icon={FlaskConical}>
      <div className="grid gap-3">
        {result.candidates.map((candidate, index) => {
          const preview = candidate.code ? previewByCode.get(candidate.code) : undefined;
          return (
          <div key={`${candidate.code ?? candidate.name}-${index}`} className="rounded-2xl border border-slate-800 bg-slate-950/58 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-lg font-semibold text-slate-50">
                    {index + 1}.{" "}
                    <BasicStockNameHover
                      stock={{
                        name: cleanText(candidate.name),
                        code: candidate.code,
                        latest: preview?.latest,
                        changePct: preview?.changePct,
                        turnoverRate: preview?.turnoverRate,
                        amount: preview?.amount,
                        mainNetFlow: preview?.mainNetInflow,
                        score: candidate.score,
                        note: cleanText(candidate.verdict)
                      }}
                    />
                  </p>
                  {candidate.code ? <span className="font-mono text-xs text-slate-500">{candidate.code}</span> : null}
                  <span className="rounded border border-cyan-300/30 bg-cyan-300/10 px-2 py-0.5 text-[11px] text-cyan-100">{priorityLabel(candidate.priority)}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-400">{cleanText(candidate.verdict)}</p>
              </div>
              <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-center">
                <p className="font-mono text-2xl font-semibold text-cyan-100">{candidate.score}</p>
                <p className="text-[11px] text-slate-400">/ 100</p>
              </div>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <Mini label="产业链位置" value={cleanText(candidate.chainPosition)} />
              <Mini label="卡住环节" value={cleanText(candidate.constrains)} />
              <Mini label="证据强度" value={evidenceLabel(candidate.evidenceStrength)} />
              {preview ? (
                <>
                  <Mini label="候选来源" value={cleanText(preview.sourceLabel)} />
                  <Mini label="抓取时间" value={formatDateTime(preview.fetchedAt)} />
                  <Mini label="最新价" value={formatPrice(preview.latest)} />
                  <Mini label="涨跌幅" value={formatPercent(preview.changePct)} />
                  <Mini label="主力净流入" value={formatMoney(preview.mainNetInflow)} />
                </>
              ) : null}
            </div>
            <SerenityTrackButton
              stock={{
                code: candidate.code,
                name: cleanText(candidate.name),
                sectorName: cleanText(preview?.sectorName),
                chainPosition: cleanText(candidate.chainPosition),
                matchReason: cleanText(candidate.verdict),
                missingProof: cleanList(candidate.missingProof),
                latest: preview?.latest,
                score: candidate.score,
                evidenceStrength: candidate.evidenceStrength,
                verdict: cleanText(candidate.verdict)
              }}
              theme={result.theme}
            />
            {candidate.missingProof.length ? <p className="mt-3 text-xs leading-5 text-amber-100">待补证据：{cleanList(candidate.missingProof).join("；")}</p> : null}
            {candidate.nextResearchChecks?.length ? (
              <details className="mt-3 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.055] p-3">
                <summary className="cursor-pointer text-xs font-medium text-cyan-100">
                  下一步核验动作
                </summary>
                <div className="mt-2 grid gap-1.5 text-xs leading-5 text-slate-300">
                  {cleanList(candidate.nextResearchChecks).map((item) => <p key={item}>- {item}</p>)}
                </div>
              </details>
            ) : null}
            <div className="mt-3">
              <SerenityEvidenceBoundary item={candidate} />
            </div>
            {candidate.evidence.length ? (
              <details className="mt-3 rounded-xl border border-slate-800 bg-slate-900/45 p-3">
                <summary className="cursor-pointer text-xs font-medium text-slate-300">
                  证据链与反证点
                </summary>
                <div className="mt-3 grid gap-2">
                  {candidate.evidence.map((item, evidenceIndex) => (
                    <EvidenceLine item={item} key={`${candidate.code ?? candidate.name}-${item.sourceType}-${evidenceIndex}`} />
                  ))}
                  {candidate.weakenConditions.length ? (
                    <div className="mt-2 rounded-lg border border-rose-300/15 bg-rose-300/[0.06] p-3">
                      <p className="text-[11px] font-medium text-rose-100">什么情况说明判断变弱</p>
                      <div className="mt-2 grid gap-1.5 text-xs leading-5 text-slate-300">
                        {cleanList(candidate.weakenConditions).map((item) => <p key={item}>- {item}</p>)}
                      </div>
                    </div>
                  ) : null}
                </div>
              </details>
            ) : null}
          </div>
          );
        })}
      </div>
    </Panel>
  );
}

function SerenityUsageGuide() {
  return (
    <details className="rounded-2xl border border-slate-800 bg-slate-950/72 p-4">
      <summary className="cursor-pointer list-none">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck size={17} className="text-cyan-200" />
            <p className="font-medium text-slate-100">这块到底怎么用</p>
          </div>
          <span className="text-xs text-slate-500">A 股研究链路 / 可折叠</span>
        </div>
      </summary>
      <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_1fr]">
        <div className="grid gap-2 md:grid-cols-2">
          <GuideStep title="1. 输入主题" text="主题支持模糊输入，例如 AI 半导体、CPO、机器人、固态电池。系统先做主题归一和相近方向匹配。" />
          <GuideStep title="2. 预览产业链" text="先排产业链层级，再看哪一层更可能成为供给、认证、良率、产能或材料瓶颈。" />
          <GuideStep title="3. 自动候选池" text="候选公司不是必填项。默认会从主线报告、板块成分、主营和行情数据里自动生成 A 股研究候选。" />
          <GuideStep title="4. 留痕与追踪" text="生成研究留痕后才进入历史记录；高优先级公司可以加入个股追踪，后续用价格和证据变化验证研究效果。" />
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/45 p-3">
          <p className="text-xs font-medium text-cyan-100">A 股证据优先级</p>
          <div className="mt-3 grid gap-2 text-xs leading-5 text-slate-300">
            <p><span className="text-emerald-100">强证据：</span>年报、半年报、公告、交易所问询/回复、招投标、中标、环评能评、专利和标准。</p>
            <p><span className="text-cyan-100">中证据：</span>公司官网、产品页、行业协会、可信财经媒体、上下游公开交叉验证。</p>
            <p><span className="text-amber-100">弱证据：</span>KOL、论坛、无出处截图、单纯价格异动，只能作为线索，不能直接转成交易判断。</p>
          </div>
        </div>
      </div>
    </details>
  );
}

function SerenityCandidatePoolSummary({ candidates }: { candidates: SerenityThemePreview["candidatePreview"] }) {
  const summary = useMemo(() => buildSerenityCandidatePoolSummary(candidates), [candidates]);
  if (!candidates.length) return null;
  return (
    <div className={`mb-3 rounded-xl border p-3 ${qualityToneClass(summary.tone)}`}>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs tracking-[0.16em] text-cyan-100">证据覆盖</p>
          <h3 className="mt-1 text-sm font-semibold text-slate-100">{summary.label}</h3>
          <p className="mt-1 text-xs leading-5 text-slate-300">{summary.summary}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
          <Mini label="候选" value={`${summary.total}`} />
          <Mini label="硬证据" value={`${summary.hardEvidence}`} />
          <Mini label="强/中证据" value={`${summary.verified}`} />
          <Mini label="待补证" value={`${summary.missingProof}`} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
        {Object.entries(summary.sourceCounts).map(([source, count]) => (
          <span key={source} className="rounded-md border border-slate-700 bg-slate-950/35 px-2 py-1 text-slate-300">
            {sourceTypeLabel(source as SerenityThemePreview["candidatePreview"][number]["source"])} {count}
          </span>
        ))}
      </div>
    </div>
  );
}

function GuideStep({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/45 p-3">
      <p className="text-sm font-medium text-slate-100">{title}</p>
      <p className="mt-2 text-xs leading-5 text-slate-400">{text}</p>
    </div>
  );
}

function SerenityQualityPanel({ quality }: { quality: SerenityQualitySnapshot }) {
  return (
    <Panel title="研究可信度" icon={ShieldCheck}>
      <div className="grid gap-3">
        <div className={`rounded-xl border p-4 ${qualityToneClass(quality.tone)}`}>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-50">{cleanText(quality.label)}</p>
              <p className="mt-1 text-xs leading-5 text-slate-300">{cleanText(quality.summary)}</p>
            </div>
            <div className="grid min-w-[280px] grid-cols-3 gap-2 text-center">
              <Mini label="核心瓶颈" value={`${quality.topPriorityCount}`} />
              <Mini label="强/中证据" value={`${quality.strongCount + quality.mediumCount}/${quality.candidateCount}`} />
              <Mini label="待补证据" value={`${quality.missingProofCount}`} />
            </div>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-4">
          <EvidenceMeter label="强证据" value={quality.strongCount} total={quality.candidateCount} tone="emerald" />
          <EvidenceMeter label="中证据" value={quality.mediumCount} total={quality.candidateCount} tone="cyan" />
          <EvidenceMeter label="弱证据" value={quality.weakCount} total={quality.candidateCount} tone="amber" />
          <EvidenceMeter label="待核验" value={quality.needsCheckingCount} total={quality.candidateCount} tone="rose" />
        </div>
        {quality.proofTasks.length ? <SerenityProofTaskBoard tasks={quality.proofTasks} /> : null}
        {quality.nextChecks.length ? (
          <details className="rounded-xl border border-slate-800 bg-slate-900/45 p-3">
            <summary className="cursor-pointer text-sm font-medium text-cyan-100">下一步补证清单</summary>
            <div className="mt-2 grid gap-1.5 text-xs leading-5 text-slate-300">
              {cleanList(quality.nextChecks).map((item) => <p key={item}>{item}</p>)}
            </div>
          </details>
        ) : null}
      </div>
    </Panel>
  );
}

function SerenityProofTaskBoard({ tasks }: { tasks: SerenityProofTask[] }) {
  const [filter, setFilter] = useState<"all" | SerenityProofTask["kind"]>("all");
  const filteredTasks = filter === "all" ? tasks : tasks.filter((task) => task.kind === filter);
  const tabs: Array<{ key: "all" | SerenityProofTask["kind"]; label: string; count: number }> = [
    { key: "all", label: "全部", count: tasks.length },
    { key: "no_hard_evidence", label: "无硬证据", count: tasks.filter((task) => task.kind === "no_hard_evidence").length },
    { key: "needs_checking", label: "待核验", count: tasks.filter((task) => task.kind === "needs_checking").length },
    { key: "weak_evidence", label: "弱证据", count: tasks.filter((task) => task.kind === "weak_evidence").length },
    { key: "missing_proof", label: "补证明", count: tasks.filter((task) => task.kind === "missing_proof").length }
  ];
  return (
    <details className="rounded-xl border border-cyan-300/20 bg-cyan-300/[0.04] p-3" open>
      <summary className="cursor-pointer text-sm font-medium text-cyan-100">
        公司级证据补全任务 <span className="text-xs text-slate-500">{tasks.length} 项</span>
      </summary>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`rounded-lg border px-2.5 py-1.5 text-[11px] transition ${
              filter === tab.key
                ? "border-cyan-300/45 bg-cyan-300/14 text-cyan-100"
                : "border-slate-700 bg-slate-950/40 text-slate-400 hover:border-cyan-300/25 hover:text-slate-200"
            }`}
            onClick={(event) => {
              event.preventDefault();
              setFilter(tab.key);
            }}
          >
            {tab.label} {tab.count}
          </button>
        ))}
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {filteredTasks.slice(0, 6).map((task) => (
          <div key={task.key} className={`rounded-xl border p-3 ${proofTaskToneClass(task.tone)}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-50">{task.company}</p>
                <p className="mt-1 text-xs leading-5 text-slate-300">{task.title}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="rounded border border-current/25 px-2 py-0.5 text-[11px]">{task.priority}</span>
                <span className="rounded border border-current/20 px-2 py-0.5 text-[10px] opacity-80">{proofTaskKindLabel(task.kind)}</span>
              </div>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-400">{task.reason}</p>
            {task.checks.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {task.checks.slice(0, 3).map((item) => (
                  <span key={item} className="rounded-md border border-slate-700 bg-slate-950/40 px-2 py-1 text-[11px] text-slate-300">
                    {cleanText(item)}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        {!filteredTasks.length ? (
          <p className="rounded-xl border border-slate-800 bg-slate-950/45 p-3 text-xs text-slate-500">
            当前筛选下没有待处理任务。
          </p>
        ) : null}
      </div>
    </details>
  );
}

function EvidenceMeter({ label, value, total, tone }: { label: string; value: number; total: number; tone: "emerald" | "cyan" | "amber" | "rose" }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/58 p-3">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="font-mono text-slate-100">{value}/{total}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full rounded-full ${meterToneClass(tone)}`} style={{ width: `${Math.max(value ? 6 : 0, pct)}%` }} />
      </div>
    </div>
  );
}

function EvidenceLine({ item }: { item: SerenityRunResult["candidates"][number]["evidence"][number] }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/55 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className={`rounded border px-2 py-0.5 text-[11px] ${evidenceToneClass(item.strength)}`}>{evidenceLabel(item.strength)}</span>
        <span className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-400">{cleanText(item.sourceLabel)}</span>
        <span className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-500">{evidenceSourceTypeLabel(item.sourceType)}</span>
        {item.fetchedAt ? <span className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-500">{formatDateTime(item.fetchedAt)}</span> : null}
      </div>
      <p className="text-xs leading-5 text-slate-300">{cleanText(item.claim)}</p>
    </div>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof BrainCircuit; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/72 p-4">
      <div className="mb-4 flex items-center gap-2">
        <Icon size={17} className="text-cyan-200" />
        <p className="font-medium text-slate-100">{title}</p>
      </div>
      {children}
    </div>
  );
}

function StepCard({ index, title, text }: { index: string; title: string; text: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/55 p-4">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-cyan-200">{index}</span>
        <ArrowRight size={14} className="text-slate-600" />
      </div>
      <p className="mt-3 font-medium text-slate-100">{title}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{text}</p>
    </div>
  );
}

function Input({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-slate-400">{label}</span>
      <input
        className="rounded-xl border border-slate-800 bg-slate-900/72 px-3 py-2 text-slate-100 outline-none transition focus:border-cyan-300/60"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function RatingInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="grid gap-1 text-xs">
      <span className="text-slate-500">{label}</span>
      <input
        className="rounded-lg border border-slate-800 bg-slate-900/72 px-2 py-1.5 font-mono text-slate-100 outline-none transition focus:border-cyan-300/60"
        type="number"
        min={0}
        max={5}
        step={0.5}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/58 px-3 py-2">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-100">{cleanText(value)}</p>
    </div>
  );
}

function newDraftCandidate(): CandidateDraft {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    name: "",
    market: "A-share",
    factors: {
      demandInflection: 3,
      architectureCoupling: 3,
      chokepointSeverity: 3,
      supplierConcentration: 3,
      expansionDifficulty: 3,
      evidenceQuality: 1,
      valuationDisconnect: 2,
      catalystTiming: 2
    },
    penalties: {}
  };
}

type SerenityQualitySnapshot = {
  candidateCount: number;
  topPriorityCount: number;
  strongCount: number;
  mediumCount: number;
  weakCount: number;
  needsCheckingCount: number;
  missingProofCount: number;
  label: string;
  tone: "emerald" | "cyan" | "amber" | "rose";
  summary: string;
  nextChecks: string[];
  proofTasks: SerenityProofTask[];
};

type SerenityProofTask = {
  key: string;
  company: string;
  title: string;
  priority: string;
  kind: "no_hard_evidence" | "needs_checking" | "weak_evidence" | "missing_proof";
  tone: "rose" | "amber" | "cyan";
  reason: string;
  checks: string[];
};

function buildSerenityQualitySnapshot(
  result: SerenityRunResult | null,
  preview: SerenityThemePreview | null
): SerenityQualitySnapshot | null {
  const scored = result?.candidates ?? [];
  const previewCandidates = preview?.candidatePreview ?? [];
  const candidateCount = scored.length || previewCandidates.length;
  if (!candidateCount) return null;
  const evidenceValues = scored.length
    ? scored.map((item) => item.evidenceStrength)
    : previewCandidates.map((item) => item.evidenceStrength);
  const missingProofCount = scored.length
    ? scored.reduce((sum, item) => sum + item.missingProof.length, 0)
    : previewCandidates.reduce((sum, item) => sum + item.missingProof.length, 0);
  const topPriorityCount = scored.filter((item) => item.priority === "top").length;
  const strongCount = evidenceValues.filter((item) => item === "strong").length;
  const mediumCount = evidenceValues.filter((item) => item === "medium").length;
  const weakCount = evidenceValues.filter((item) => item === "weak").length;
  const needsCheckingCount = evidenceValues.filter((item) => item === "needs_checking").length;
  const verifiedCount = strongCount + mediumCount;
  const verifiedRatio = candidateCount > 0 ? verifiedCount / candidateCount : 0;
  const tone: SerenityQualitySnapshot["tone"] =
    verifiedRatio >= 0.65 && missingProofCount <= candidateCount ? "emerald"
      : verifiedRatio >= 0.4 ? "cyan"
        : weakCount + needsCheckingCount > verifiedCount ? "rose"
          : "amber";
  const label =
    tone === "emerald" ? "证据质量较强"
      : tone === "cyan" ? "可作为研究线索"
        : tone === "rose" ? "证据偏弱，先补证"
          : "需要降级解读";
  const summary = result
    ? `本次已落库 ${candidateCount} 个公司排序，强/中证据 ${verifiedCount} 个，核心瓶颈候选 ${topPriorityCount} 个，待补证据 ${missingProofCount} 项。`
    : `当前是预览候选池 ${candidateCount} 个，强/中证据 ${verifiedCount} 个；生成留痕前仍应先补主营、公告、客户、产能证据。`;
  return {
    candidateCount,
    topPriorityCount,
    strongCount,
    mediumCount,
    weakCount,
    needsCheckingCount,
    missingProofCount,
    label,
    tone,
    summary,
    nextChecks: buildSerenityNextChecks({
      result,
      preview,
      weakCount,
      needsCheckingCount,
      missingProofCount,
      verifiedCount,
      candidateCount
    }),
    proofTasks: buildSerenityProofTasks(result, preview)
  };
}

function buildSerenityCandidatePoolSummary(candidates: SerenityThemePreview["candidatePreview"]) {
  const total = candidates.length;
  const sourceCounts = candidates.reduce<Record<SerenityThemePreview["candidatePreview"][number]["source"], number>>(
    (bucket, candidate) => {
      bucket[candidate.source] = (bucket[candidate.source] ?? 0) + 1;
      return bucket;
    },
    { manual: 0, latest_mainline: 0, eastmoney_sector: 0 }
  );
  const hardEvidence = candidates.reduce((sum, item) => sum + (item.evidenceCoverage?.hardEvidenceCount ?? 0), 0);
  const strong = candidates.filter((item) => item.evidenceStrength === "strong").length;
  const medium = candidates.filter((item) => item.evidenceStrength === "medium").length;
  const weak = candidates.filter((item) => item.evidenceStrength === "weak").length;
  const needsChecking = candidates.filter((item) => item.evidenceStrength === "needs_checking").length;
  const missingProof = candidates.reduce((sum, item) => sum + item.missingProof.length, 0);
  const verified = strong + medium;
  const verifiedRatio = total ? verified / total : 0;
  const tone: SerenityQualitySnapshot["tone"] =
    total && hardEvidence >= total && verifiedRatio >= 0.55
      ? "emerald"
      : total && verifiedRatio >= 0.35
        ? "cyan"
        : weak + needsChecking > verified
          ? "rose"
          : "amber";
  const label =
    tone === "emerald"
      ? "候选池证据覆盖较好"
      : tone === "cyan"
        ? "候选池可进入研究复核"
        : tone === "rose"
          ? "候选池弱证据偏多"
          : "候选池需要降级解读";
  const summary =
    `当前预览 ${total} 只研究候选；强/中证据 ${verified} 只，弱证据 ${weak} 只，待核验 ${needsChecking} 只；` +
    `硬证据合计 ${hardEvidence} 条，待补证明 ${missingProof} 项。证据不足时只用于研究排序，不转成交易动作。`;
  return { total, sourceCounts, hardEvidence, strong, medium, weak, needsChecking, verified, missingProof, tone, label, summary };
}

function buildSerenityNextChecks({
  result,
  preview,
  weakCount,
  needsCheckingCount,
  missingProofCount,
  verifiedCount,
  candidateCount
}: {
  result: SerenityRunResult | null;
  preview: SerenityThemePreview | null;
  weakCount: number;
  needsCheckingCount: number;
  missingProofCount: number;
  verifiedCount: number;
  candidateCount: number;
}) {
  const checks: string[] = [];
  if (!result) checks.push("当前只是预览，点击生成研究留痕后才会进入候选股、主线和追踪页面的瓶颈标签体系。");
  if (verifiedCount < Math.ceil(candidateCount * 0.4)) checks.push("强/中证据不足，优先补公告、财报、互动易、客户认证、产能扩张等硬证据。");
  if (weakCount || needsCheckingCount) checks.push("弱证据和待核验候选只能作为研究线索，不应直接转化成交易动作。");
  if (missingProofCount) checks.push("逐条消化待补证据：先证明公司确实贴近稀缺环节，再讨论估值和催化。");
  const firstLayerNeed = (result?.layerRanking ?? preview?.layerRanking ?? [])[0]?.evidenceNeeds?.[0];
  if (firstLayerNeed) checks.push(`优先验证最高层级的关键证据：${firstLayerNeed}`);
  return checks.slice(0, 5);
}

function buildSerenityProofTasks(result: SerenityRunResult | null, preview: SerenityThemePreview | null): SerenityProofTask[] {
  const rows = result?.candidates?.length
    ? result.candidates.map((candidate) => ({
        key: `${candidate.code ?? candidate.name}-${candidate.priority}-${candidate.evidenceStrength}`,
        company: candidate.code ? `${candidate.name} ${candidate.code}` : candidate.name,
        priority: candidate.priority,
        evidenceStrength: candidate.evidenceStrength,
        missingProof: candidate.missingProof,
        nextResearchChecks: candidate.nextResearchChecks ?? [],
        hardEvidenceCount: candidate.evidenceCoverage?.verifiedHardEvidenceCount ?? candidate.evidenceCoverage?.hardEvidenceCount ?? 0
      }))
    : (preview?.candidatePreview ?? []).map((candidate) => ({
        key: `${candidate.code ?? candidate.name}-${candidate.source}-${candidate.evidenceStrength}`,
        company: candidate.code ? `${candidate.name} ${candidate.code}` : candidate.name,
        priority: candidate.score >= 82 ? "top" : candidate.score >= 68 ? "high" : candidate.score >= 50 ? "watch" : "low",
        evidenceStrength: candidate.evidenceStrength,
        missingProof: candidate.missingProof,
        nextResearchChecks: candidate.nextResearchChecks ?? [],
        hardEvidenceCount: candidate.evidenceCoverage?.verifiedHardEvidenceCount ?? candidate.evidenceCoverage?.hardEvidenceCount ?? 0
      }));

  return rows
    .filter((row) =>
      row.evidenceStrength === "weak" ||
      row.evidenceStrength === "needs_checking" ||
      row.missingProof.length > 0 ||
      row.hardEvidenceCount <= 0
    )
    .sort((a, b) => proofTaskSortScore(b) - proofTaskSortScore(a))
    .slice(0, 8)
    .map((row) => {
      const missing = cleanList(row.missingProof);
      const checks = cleanList([...missing, ...row.nextResearchChecks]);
      const noHardEvidence = row.hardEvidenceCount <= 0;
      const kind: SerenityProofTask["kind"] = noHardEvidence
        ? "no_hard_evidence"
        : row.evidenceStrength === "needs_checking"
          ? "needs_checking"
          : row.evidenceStrength === "weak"
            ? "weak_evidence"
            : "missing_proof";
      const tone: SerenityProofTask["tone"] =
        row.evidenceStrength === "needs_checking" || noHardEvidence
          ? "rose"
          : row.evidenceStrength === "weak" || missing.length
            ? "amber"
            : "cyan";
      const title = noHardEvidence
        ? "先补硬证据，再讨论瓶颈价值"
        : row.evidenceStrength === "weak"
          ? "弱证据候选，需要验证主业贴合度"
          : row.evidenceStrength === "needs_checking"
            ? "待核验候选，不能进入交易结论"
            : "补齐关键证明后再升级";
      const reason = missing[0]
        ? `当前缺口：${missing[0]}。`
        : noHardEvidence
          ? "当前没有公告、财报、客户认证、产能等硬证据支撑。"
          : "证据链仍不够完整，需要继续补主营、客户、产能和催化验证。";
      return {
        key: row.key,
        company: cleanText(row.company) ?? row.company,
        title,
        priority: priorityLabel(row.priority as SerenityRunResult["candidates"][number]["priority"]),
        kind,
        tone,
        reason,
        checks: checks.length ? checks : ["公告/财报验证", "客户或产品认证", "产能与订单变化"]
      };
    });
}

function proofTaskSortScore(row: {
  priority: string;
  evidenceStrength: string;
  missingProof: string[];
  hardEvidenceCount: number;
}) {
  const priorityScore = row.priority === "top" ? 40 : row.priority === "high" ? 30 : row.priority === "watch" ? 18 : 8;
  const evidenceScore = row.evidenceStrength === "needs_checking" ? 24 : row.evidenceStrength === "weak" ? 18 : row.evidenceStrength === "medium" ? 8 : 0;
  const proofScore = Math.min(20, row.missingProof.length * 5);
  const hardEvidencePenalty = row.hardEvidenceCount <= 0 ? 18 : 0;
  return priorityScore + evidenceScore + proofScore + hardEvidencePenalty;
}

function qualityToneClass(tone: SerenityQualitySnapshot["tone"]) {
  if (tone === "emerald") return "border-emerald-300/25 bg-emerald-300/[0.07]";
  if (tone === "cyan") return "border-cyan-300/25 bg-cyan-300/[0.07]";
  if (tone === "rose") return "border-rose-300/25 bg-rose-300/[0.07]";
  return "border-amber-300/25 bg-amber-300/[0.07]";
}

function meterToneClass(tone: "emerald" | "cyan" | "amber" | "rose") {
  if (tone === "emerald") return "bg-emerald-300";
  if (tone === "cyan") return "bg-cyan-300";
  if (tone === "rose") return "bg-rose-300";
  return "bg-amber-300";
}

function proofTaskToneClass(tone: SerenityProofTask["tone"]) {
  if (tone === "rose") return "border-rose-300/25 bg-rose-300/[0.07] text-rose-100";
  if (tone === "amber") return "border-amber-300/25 bg-amber-300/[0.07] text-amber-100";
  return "border-cyan-300/25 bg-cyan-300/[0.07] text-cyan-100";
}

function proofTaskKindLabel(kind: SerenityProofTask["kind"]) {
  if (kind === "no_hard_evidence") return "无硬证据";
  if (kind === "needs_checking") return "待核验";
  if (kind === "weak_evidence") return "弱证据";
  return "补关键证明";
}

function evidenceToneClass(value: SerenityRunResult["candidates"][number]["evidenceStrength"]) {
  if (value === "strong") return "border-emerald-300/30 bg-emerald-300/10 text-emerald-100";
  if (value === "medium") return "border-cyan-300/30 bg-cyan-300/10 text-cyan-100";
  if (value === "weak") return "border-amber-300/30 bg-amber-300/10 text-amber-100";
  return "border-rose-300/30 bg-rose-300/10 text-rose-100";
}

function sourceTypeLabel(value: SerenityThemePreview["candidatePreview"][number]["source"]) {
  if (value === "latest_mainline") return "主线报告";
  if (value === "eastmoney_sector") return "东方财富板块";
  return "手工输入";
}

function evidenceSourceTypeLabel(value: string) {
  if (/manual/i.test(value)) return "手工线索";
  if (/company_profile|business/i.test(value)) return "公司资料";
  if (/filing|announcement/i.test(value)) return "公告披露";
  if (/financial_indicator|financial_report/i.test(value)) return "财报指标";
  if (/customer/i.test(value)) return "客户认证";
  if (/capacity|project/i.test(value)) return "产能项目";
  if (/patent|standard/i.test(value)) return "专利标准";
  if (/eastmoney|sector/i.test(value)) return "板块数据";
  return cleanText(value, "来源类型待确认");
}

function priorityLabel(value: SerenityRunResult["candidates"][number]["priority"]) {
  if (value === "top") return "核心瓶颈";
  if (value === "high") return "高优先级";
  if (value === "watch") return "待验证";
  return "低优先级";
}

function evidenceLabel(value: SerenityRunResult["candidates"][number]["evidenceStrength"]) {
  if (value === "strong") return "强";
  if (value === "medium") return "中";
  if (value === "weak") return "弱";
  return "待核验";
}

function formatPercent(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return "缺失";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatPrice(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return "缺失";
  return value.toFixed(2);
}

function formatMoney(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return "缺失";
  const abs = Math.abs(value);
  if (abs >= 100000000) return `${(value / 100000000).toFixed(2)}亿`;
  if (abs >= 10000) return `${(value / 10000).toFixed(2)}万`;
  return value.toFixed(0);
}

function formatDateTime(value?: string) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<ApiResponse<T>> {
  return fetchApiJson<T>(url, init);
}

function cleanText(value?: string | null, fallback = ""): string {
  return cleanDisplayText(value) ?? value ?? fallback;
}

function cleanList(values?: string[] | null): string[] {
  return cleanDisplayList(values);
}
