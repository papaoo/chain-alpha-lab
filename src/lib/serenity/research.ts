import crypto from "node:crypto";
import { dbAll, dbGet, dbRun } from "@/lib/db/client";
import { serenityPreviewToCandidateInput } from "@/lib/serenity/evidenceCollector";
import { buildDefaultLayers, scoreSerenityCandidate, summarizeSerenityRun } from "@/lib/serenity/scoring";
import type { SerenityRunInput, SerenityRunResult, SerenityRunSummary } from "@/lib/serenity/types";

type SerenityRunRow = {
  id: string;
  theme: string;
  market: SerenityRunInput["market"];
  timeWindow: string;
  summary: string;
  candidateCount: number;
  topCandidateJson: string | null;
  inputJson: string;
  resultJson: string;
  createdAt: string;
};

const DEFAULT_TIME_WINDOW = "未来 3-12 个月";

export function createSerenityRun(input: SerenityRunInput): SerenityRunResult {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const timeWindow = input.timeWindow?.trim() || DEFAULT_TIME_WINDOW;
  const layerRanking = (input.layers?.length ? input.layers : buildDefaultLayers(input.theme))
    .sort((left, right) => left.rank - right.rank);
  const candidateInputs = input.candidates.length
    ? input.candidates
    : (input.candidatePreview ?? []).slice(0, 12).map(serenityPreviewToCandidateInput);
  const candidates = candidateInputs
    .map((candidate) => scoreSerenityCandidate(candidate, input.market))
    .sort((left, right) => right.score - left.score);
  const summary = summarizeSerenityRun(input.theme, candidates);
  const result: SerenityRunResult = {
    id,
    theme: input.theme.trim(),
    market: input.market,
    timeWindow,
    createdAt,
    layerRanking,
    candidatePreview: input.candidatePreview,
    candidates,
    summary,
    methodNote: "基于 muxuuu/serenity-skill 的公开方法论：先排产业链层级，再排公司；证据强度不足时只作为研究线索，不直接给交易建议。",
    warnings: buildWarnings(input, candidates)
  };

  dbRun(
    `insert into serenity_research_runs
       (id, theme, market, timeWindow, summary, candidateCount, topCandidateJson, inputJson, resultJson, createdAt)
       values (@id, @theme, @market, @timeWindow, @summary, @candidateCount, @topCandidateJson, @inputJson, @resultJson, @createdAt)`,
    {
      id,
      theme: result.theme,
      market: result.market,
      timeWindow,
      summary,
      candidateCount: candidates.length,
      topCandidateJson: candidates[0] ? JSON.stringify(candidates[0]) : null,
      inputJson: JSON.stringify({ ...input, candidates: candidateInputs }),
      resultJson: JSON.stringify(result),
      createdAt
    },
    { label: "serenity_research_runs.insert", slowMs: 300 }
  );
  return result;
}

export function listSerenityRuns(limit = 20): SerenityRunSummary[] {
  const rows = dbAll<Omit<SerenityRunRow, "inputJson" | "resultJson">>(
    `select id, theme, market, timeWindow, summary, candidateCount, topCandidateJson, createdAt
       from serenity_research_runs
       order by createdAt desc
       limit ?`,
    [Math.min(Math.max(Math.trunc(limit), 1), 100)],
    { label: "serenity_research_runs.list" }
  );
  return rows.map((row) => ({
    id: row.id,
    theme: row.theme,
    market: row.market,
    timeWindow: normalizeTimeWindow(row.timeWindow),
    summary: row.summary,
    candidateCount: row.candidateCount,
    topCandidate: row.topCandidateJson ? safeJson(row.topCandidateJson, undefined) : undefined,
    createdAt: row.createdAt
  }));
}

export function getSerenityRun(id: string): SerenityRunResult | null {
  const row = dbGet<Pick<SerenityRunRow, "resultJson">>(
    `select resultJson from serenity_research_runs where id = ?`,
    [id],
    { label: "serenity_research_runs.get" }
  );
  if (!row) return null;
  const result = safeJson<SerenityRunResult | null>(row.resultJson, null);
  return result ? { ...result, timeWindow: normalizeTimeWindow(result.timeWindow) } : null;
}

function normalizeTimeWindow(value: string | undefined) {
  const text = value?.trim();
  if (!text || /\?{2,}/.test(text)) return DEFAULT_TIME_WINDOW;
  return text;
}

function buildWarnings(input: SerenityRunInput, candidates: SerenityRunResult["candidates"]) {
  const warnings: string[] = [];
  if (!input.candidates.length && !input.candidatePreview?.length) {
    warnings.push("没有候选公司，当前只输出产业链层级和证据计划，不能做公司排序。");
  }
  if (!input.candidates.length && input.candidatePreview?.length) {
    warnings.push("本次公司排序由自动候选池生成，属于研究优先级，不是买入名单。");
  }
  if (candidates.some((candidate) => candidate.evidenceStrength === "needs_checking")) {
    warnings.push("部分候选缺少公告、财报、客户或产能证据，只能作为待核验线索。");
  }
  if (candidates.some((candidate) => candidate.evidenceStrength === "weak")) {
    warnings.push("存在弱证据候选，需要用强/中证据交叉验证，不能直接用于交易。");
  }
  return warnings;
}

function safeJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
