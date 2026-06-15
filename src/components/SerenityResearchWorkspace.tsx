"use client";

import { useEffect, useMemo, useState } from "react";
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
import type {
  SerenityRunInput,
  SerenityRunResult,
  SerenityRunSummary,
  SerenityThemePreview,
  SerenityThemeSuggestion
} from "@/lib/serenity/types";

type ApiResponse<T> = { success: boolean; data: T | null; error: { code: string; message: string } | null };
type CandidateDraft = SerenityRunInput["candidates"][number] & { id: string };

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
  const [preview, setPreview] = useState<SerenityThemePreview | null>(null);
  const [candidates, setCandidates] = useState<CandidateDraft[]>([newDraftCandidate()]);
  const [latest, setLatest] = useState<SerenityRunResult | null>(null);
  const [history, setHistory] = useState<SerenityRunSummary[]>([]);
  const [loading, setLoading] = useState<"themes" | "preview" | "run" | "history" | null>(null);
  const [message, setMessage] = useState("");
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

  async function searchThemes(query: string) {
    setLoading((current) => current ?? "themes");
    try {
      const json = await fetchJson<SerenityThemeSuggestion[]>(
        `/api/serenity/themes?q=${encodeURIComponent(query)}&market=${encodeURIComponent(market)}&limit=8`
      );
      setSuggestions(json.data ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
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
      setMessage(error instanceof Error ? error.message : String(error));
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
      setMessage(error instanceof Error ? error.message : String(error));
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
      setMessage(hasManualCandidates ? "瓶颈研究已生成并留痕。" : "产业链层级预研已留痕；公司排序将在候选池自动生成后启用。");
      await loadHistory();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
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

  return (
    <section className="grid gap-4">
      <div className="overflow-hidden rounded-2xl border border-cyan-300/20 bg-slate-950/80 shadow-[0_24px_90px_rgba(2,6,23,0.34)]">
        <div className="relative p-5">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_15%,rgba(34,211,238,0.16),transparent_34%),radial-gradient(circle_at_80%_0%,rgba(163,230,53,0.10),transparent_34%)]" />
          <div className="relative grid gap-5 xl:grid-cols-[1fr_auto] xl:items-end">
            <div>
              <p className="text-xs tracking-[0.18em] text-cyan-200">SERENITY BOTTLENECK RESEARCH</p>
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
                        <span className="font-medium text-slate-100">{item.name}</span>
                        <span className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-400">{item.category}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{item.description}</p>
                    </button>
                  ))}
                  {!suggestions.length ? <p className="text-sm text-slate-500">输入主题后会显示相近研究方向。</p> : null}
                </div>
              </div>
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
                    <p className="text-sm font-medium text-slate-100">{item.theme}</p>
                    <span className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-400">{item.candidateCount} 公司</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{item.summary}</p>
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

          {activeLayers.length ? (
            <Panel title={activeResult ? "已留痕研究结果" : "产业链预览"} icon={Database}>
              <div className="grid gap-3">
                <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-4">
                  <p className="text-sm font-medium text-cyan-100">{activeResult?.summary ?? preview?.normalizedTheme?.description ?? "已生成产业链层级预览。"}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-400">
                    {activeResult?.methodNote ?? "当前预览不落库；点击“生成研究留痕”后会保存为历史记录。"}
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {activeLayers.map((layer) => (
                    <div key={layer.id} className="rounded-xl border border-slate-800 bg-slate-900/55 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-slate-100">{layer.rank}. {layer.name}</p>
                        <span className="rounded border border-cyan-300/25 px-2 py-0.5 text-[11px] text-cyan-100">Layer</span>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-slate-400">{layer.scarceReason}</p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {layer.constraints.map((item) => <span key={item} className="rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-400">{item}</span>)}
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
                {preview.evidencePlan.map((item, index) => (
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
              <div className="grid gap-3">
                {(preview?.candidatePreview ?? activeResult?.candidatePreview ?? []).slice(0, 12).map((candidate, index) => (
                  <div key={`${candidate.code ?? candidate.name}-${index}`} className="rounded-2xl border border-slate-800 bg-slate-950/58 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-semibold text-slate-50">{index + 1}. {candidate.name}</p>
                          {candidate.code ? <span className="font-mono text-xs text-slate-500">{candidate.code}</span> : null}
                          <span className="rounded border border-cyan-300/30 bg-cyan-300/10 px-2 py-0.5 text-[11px] text-cyan-100">{candidate.chainPosition}</span>
                          <span className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-400">{evidenceLabel(candidate.evidenceStrength)}</span>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-slate-400">{candidate.matchReason}</p>
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-slate-900/65 px-4 py-3 text-right">
                        <p className="font-mono text-xl font-semibold text-cyan-100">{candidate.score.toFixed(1)}</p>
                        <p className="text-[11px] text-slate-500">研究匹配分</p>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-4">
                      <Mini label="来源" value={candidate.sourceLabel} />
                      <Mini label="涨跌幅" value={formatPercent(candidate.changePct)} />
                      <Mini label="换手率" value={formatPercent(candidate.turnoverRate)} />
                      <Mini label="主力净流入" value={formatMoney(candidate.mainNetInflow)} />
                    </div>
                    {candidate.missingProof.length ? <p className="mt-3 text-xs leading-5 text-amber-100">待补证据：{candidate.missingProof.join("；")}</p> : null}
                  </div>
                ))}
              </div>
            </Panel>
          ) : null}

          {activeResult?.candidates.length ? <SerenityCompanyRanking result={activeResult} /> : null}

          {activeWarnings.length ? (
            <div className="grid gap-2">
              {activeWarnings.map((warning) => <p key={warning} className="rounded-xl border border-amber-300/25 bg-amber-300/10 p-3 text-xs leading-5 text-amber-100">{warning}</p>)}
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
          <p className="font-medium text-slate-100">{candidate.name || `候选 ${index + 1}`}</p>
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
  return (
    <Panel title="公司研究排序" icon={FlaskConical}>
      <div className="grid gap-3">
        {result.candidates.map((candidate, index) => (
          <div key={`${candidate.code ?? candidate.name}-${index}`} className="rounded-2xl border border-slate-800 bg-slate-950/58 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-lg font-semibold text-slate-50">{index + 1}. {candidate.name}</p>
                  {candidate.code ? <span className="font-mono text-xs text-slate-500">{candidate.code}</span> : null}
                  <span className="rounded border border-cyan-300/30 bg-cyan-300/10 px-2 py-0.5 text-[11px] text-cyan-100">{priorityLabel(candidate.priority)}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-400">{candidate.verdict}</p>
              </div>
              <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-center">
                <p className="font-mono text-2xl font-semibold text-cyan-100">{candidate.score}</p>
                <p className="text-[11px] text-slate-400">/ 100</p>
              </div>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <Mini label="产业链位置" value={candidate.chainPosition} />
              <Mini label="卡住环节" value={candidate.constrains} />
              <Mini label="证据强度" value={evidenceLabel(candidate.evidenceStrength)} />
            </div>
            {candidate.missingProof.length ? <p className="mt-3 text-xs leading-5 text-amber-100">待补证据：{candidate.missingProof.join("；")}</p> : null}
          </div>
        ))}
      </div>
    </Panel>
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
      <p className="mt-1 text-sm font-medium text-slate-100">{value}</p>
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

function formatMoney(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return "缺失";
  const abs = Math.abs(value);
  if (abs >= 100000000) return `${(value / 100000000).toFixed(2)}亿`;
  if (abs >= 10000) return `${(value / 10000).toFixed(2)}万`;
  return value.toFixed(0);
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<ApiResponse<T>> {
  const response = await fetch(url, init);
  const json = (await response.json().catch(() => null)) as ApiResponse<T> | null;
  if (!response.ok || !json?.success) throw new Error(json?.error?.message ?? `请求失败：${url}`);
  return json;
}
