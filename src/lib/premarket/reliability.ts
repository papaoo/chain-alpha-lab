import type {
  PremarketActionability,
  PremarketDataQuality,
  PremarketScoreBucket,
  PremarketSourceTrace,
  PremarketTemperatureReliability
} from "@/lib/premarket/types";

export function evaluatePremarketDataQuality(sourceTraces: PremarketSourceTrace[]): PremarketDataQuality {
  const critical = sourceTraces.filter((source) => source.critical);
  const criticalOk = critical.filter((source) => source.status === "ok" || source.status === "partial").length;
  const failedCritical = critical.filter((source) => source.status === "failed").map((source) => source.label);
  const partialCritical = critical.filter((source) => source.status === "partial").map((source) => source.label);
  const staleCritical = critical.filter(isPremarketSourceStale).map((source) => source.label);
  const status: PremarketDataQuality["status"] = failedCritical.length === critical.length
    ? "failed"
    : failedCritical.length
      ? "degraded"
      : partialCritical.length || staleCritical.length
        ? "partial"
        : "ok";
  const labels: Record<PremarketDataQuality["status"], string> = {
    ok: "核心数据可用",
    partial: "核心数据部分可用",
    degraded: "核心数据降级",
    failed: "核心数据失败"
  };
  const affectedSources = [...partialCritical, ...staleCritical];
  const message = status === "ok"
    ? "外围行情与宏观日历均已取得；新闻/催化源未接入时不参与温度打分。"
    : status === "partial"
      ? `部分核心源有告警或新鲜度不足：${affectedSources.join("、") || "未列明"}，盘前结论需降级解读。`
      : status === "degraded"
        ? `核心源失败：${failedCritical.join("、")}，盘前温度只能作为占位参考。`
        : "外围行情和宏观日历均不可用，不应输出盘前判断。";

  return {
    status,
    label: labels[status],
    message,
    criticalOk,
    criticalTotal: critical.length,
    staleSources: sourceTraces.filter(isPremarketSourceStale).map((source) => source.label),
    okSources: sourceTraces.filter((source) => source.status === "ok").map((source) => source.label),
    partialSources: sourceTraces.filter((source) => source.status === "partial").map((source) => source.label),
    failedSources: sourceTraces.filter((source) => source.status === "failed").map((source) => source.label),
    unavailableSources: sourceTraces.filter((source) => source.status === "unavailable").map((source) => source.label)
  };
}

export function evaluatePremarketActionability(dataQuality: PremarketDataQuality, sourceTraces: PremarketSourceTrace[]): PremarketActionability {
  const failedCritical = sourceTraces.filter((source) => source.critical && source.status === "failed");
  const staleCritical = sourceTraces.filter((source) => source.critical && isPremarketSourceStale(source));
  const missingImpact = [
    ...failedCritical.map((source) => `${source.label}失败：${source.impact ?? "该维度不能用于盘前判断。"}`),
    ...staleCritical.map((source) => `${source.label}过期：最新数据已超过 ${source.staleAfterMinutes ?? "阈值"} 分钟，只能降级参考。`)
  ];

  if (dataQuality.status === "failed" || failedCritical.length >= 2) {
    return {
      level: "not_actionable",
      label: "不可行动",
      guidance: "核心盘前源不可用，本快照只能提示数据故障；不要据此调整策略、仓位或候选池。",
      allowedUses: ["检查数据源状态", "保留失败留痕", "等待人工刷新或下一次自动刷新"],
      blockedUses: ["生成盘前风险温度结论", "压制或放宽交易规则", "新增候选股或买入建议"],
      missingImpact
    };
  }

  if (dataQuality.status === "degraded" || dataQuality.status === "partial") {
    return {
      level: "degraded_reference",
      label: "降级参考",
      guidance: "盘前源部分可用，只能辅助生成开盘观察清单；所有结论必须等待 A 股开盘承接、宽度和主线核心股验证。",
      allowedUses: ["生成开盘观察清单", "提示外围风险语境", "提醒哪些数据源缺失或过期"],
      blockedUses: ["盘前直接买入", "把外围风险当成 A 股盘口事实", "突破规则引擎仓位上限"],
      missingImpact
    };
  }

  return {
    level: "plan_ready",
    label: "计划可用",
    guidance: "核心盘前源可用，可用于生成盘前计划和开盘验证清单；仍不能替代 A 股开盘后的宽度、资金和主线确认。",
    allowedUses: ["生成盘前风险温度", "生成开盘观察清单", "作为大盘规则的盘前/竞价约束语境"],
    blockedUses: ["替代 A 股盘中事实", "盘前直接确认买点", "跳过规则引擎风控"],
    missingImpact
  };
}

export function evaluatePremarketTemperatureReliability(
  buckets: PremarketScoreBucket[],
  sourceTraces: PremarketSourceTrace[],
  actionability: PremarketActionability
): PremarketTemperatureReliability {
  const scoreInputs = sourceTraces.filter((source) => source.usage === "score_input");
  const scoreInputTotal = scoreInputs.length;
  const scoreInputOk = scoreInputs.filter((source) => source.status === "ok" || source.status === "partial").length;
  const failedScoreInputCount = scoreInputs.filter((source) => source.status === "failed").length;
  const staleScoreInputCount = scoreInputs.filter(isPremarketSourceStale).length;
  const fallbackBucketCount = buckets.filter((bucket) => bucket.state === "missing").length;
  const coveragePct = scoreInputTotal ? Math.round((scoreInputOk / scoreInputTotal) * 100) : 0;
  const penalty = fallbackBucketCount * 12 + staleScoreInputCount * 10 + failedScoreInputCount * 22;
  const confidencePct = clamp(
    actionability.level === "not_actionable" ? Math.min(coveragePct, 20) : coveragePct - penalty,
    0,
    100
  );
  const level: PremarketTemperatureReliability["level"] =
    actionability.level === "not_actionable" || failedScoreInputCount >= 2 ? "invalid" :
    confidencePct >= 80 && fallbackBucketCount === 0 && staleScoreInputCount === 0 ? "high" :
    confidencePct >= 55 && fallbackBucketCount <= 1 ? "medium" :
    "low";
  const labels: Record<PremarketTemperatureReliability["level"], string> = {
    high: "高置信",
    medium: "中置信",
    low: "低置信",
    invalid: "不可采信"
  };
  const message =
    level === "high"
      ? "盘前温度的核心计分源完整且新鲜，可作为开盘计划的风险语境。"
      : level === "medium"
        ? "盘前温度存在少量缺口，只能作为观察清单和风险语境，仍需等 A 股开盘承接验证。"
        : level === "low"
          ? "盘前温度包含缺失桶或过期源的保守占位分，只能降级参考，不应压制或放宽正式交易规则。"
          : "盘前核心计分源不可用，温度计只保留故障留痕，不能参与规则判断。";

  return {
    level,
    label: labels[level],
    confidencePct,
    scoreInputOk,
    scoreInputTotal,
    fallbackBucketCount,
    staleScoreInputCount,
    failedScoreInputCount,
    message
  };
}

export function isPremarketSourceStale(source: PremarketSourceTrace) {
  return typeof source.freshnessMinutes === "number" && typeof source.staleAfterMinutes === "number" && source.freshnessMinutes > source.staleAfterMinutes;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
