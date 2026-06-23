import { buildSourceFreshness, chinaTradeDateFromIso } from "@/lib/market/freshness";
import { getAnalysisReport } from "@/lib/db/reports";
import { effectiveTradeDateForSession, inferMarketSessionContext } from "@/lib/market/session";
import type { SelectionRunResult } from "@/lib/selection/types";

export function annotateSelectionFreshness(result: SelectionRunResult, startedAt: string): SelectionRunResult {
  const notes = buildFreshnessNotes(result, startedAt);
  const warnings = [...result.warnings];
  for (const warning of notes.warnings) {
    if (!warnings.includes(warning)) warnings.push(warning);
  }

  return {
    ...result,
    sourceReportTradeDate: notes.sourceReportTradeDate,
    runEffectiveTradeDate: notes.runEffectiveTradeDate,
    freshnessStatus: notes.freshness.status,
    warnings,
    dataBasis: `${result.dataBasis}；数据新鲜度：${notes.summary}`
  };
}

function buildFreshnessNotes(result: SelectionRunResult, startedAt: string) {
  const reportAt = result.sourceReportCreatedAt ? new Date(result.sourceReportCreatedAt) : null;
  const runAt = new Date(startedAt);
  const session = inferMarketSessionContext(startedAt);
  const runEffectiveTradeDate = effectiveTradeDateForSession(startedAt, session);
  const sourceReportTradeDate = result.sourceReportTradeDate ?? lookupSourceReportTradeDate(result.sourceReportId) ?? chinaTradeDateFromIso(result.sourceReportCreatedAt);
  const freshness = buildSourceFreshness({
    sourceCreatedAt: result.sourceReportCreatedAt,
    sourceTradeDate: sourceReportTradeDate,
    currentTradeDate: runEffectiveTradeDate,
    checkedAt: startedAt,
    sourceLabel: "选股来源报告",
    currentLabel: "本次运行有效交易日",
    staleTitle: "选股来源报告已过期",
    currentTitle: "选股来源报告交易日匹配",
    unknownTitle: "选股数据基准待确认",
    staleActionHint: "先重新运行今日分析，再执行需要盘中有效性的选股策略。"
  });
  const warnings: string[] = [];

  if (!reportAt || Number.isNaN(reportAt.getTime()) || Number.isNaN(runAt.getTime())) {
    warnings.push("选股来源报告时间缺失，结果只能作为研究参考。");
    return {
      summary: "来源报告时间缺失，无法判断选股数据新鲜度",
      warnings,
      freshness,
      sourceReportTradeDate,
      runEffectiveTradeDate
    };
  }

  const ageMinutes = Math.max(0, Math.round((runAt.getTime() - reportAt.getTime()) / 60_000));
  const ageText = ageMinutes < 60 ? `${ageMinutes} 分钟` : `${(ageMinutes / 60).toFixed(1)} 小时`;
  const refreshBeforeRun = result.parameters.refreshBeforeRun !== false;
  const poolMode = String(result.parameters.poolMode ?? "strategy_adaptive");

  if (freshness.status === "stale") {
    warnings.push(freshness.message);
  }
  if (ageMinutes > 240) {
    warnings.push(session.isIntraday
      ? `选股来源报告距离本次运行已超过 4 小时（${ageText}），盘中策略需要先重新运行今日分析。`
      : `选股来源报告距离本次运行已超过 4 小时（${ageText}），当前处于${session.phaseLabel}，结果只能作为研究参考，不能当作盘中确认。`);
  } else if (ageMinutes > 60) {
    warnings.push(`选股来源报告距离本次运行 ${ageText}，短线策略需要降级解读。`);
  }
  if (!refreshBeforeRun) {
    warnings.push("本次选股关闭了运行前盘口刷新，候选股价格、资金和技术状态可能不是最新。");
  }
  if (poolMode === "latest_report") {
    warnings.push("候选池仅使用最新报告候选股，覆盖面较窄；若要扩展机会，可切换策略自适应或混合全 A 池。");
  }

  return {
    summary: `来源报告交易日 ${sourceReportTradeDate ?? "未知"}，本次运行有效交易日 ${runEffectiveTradeDate}；来源报告 ${result.sourceReportCreatedAt}，运行于 ${startedAt}，间隔 ${ageText}；运行前刷新${refreshBeforeRun ? "已开启" : "未开启"}；候选池模式 ${poolMode}`,
    warnings,
    freshness,
    sourceReportTradeDate,
    runEffectiveTradeDate
  };
}

function lookupSourceReportTradeDate(reportId?: string) {
  if (!reportId) return undefined;
  return getAnalysisReport(reportId, "none")?.factPackage.tradeDate;
}
