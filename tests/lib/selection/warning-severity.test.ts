import { describe, expect, it } from "vitest";
import { buildSelectionWarningSummary, classifySelectionWarning } from "@/lib/selection/warning-severity";

describe("selection warning severity", () => {
  it("classifies stale and missing data as risk", () => {
    expect(classifySelectionWarning("选股来源报告已过期，需要重新运行今日分析")).toEqual({
      category: "freshness",
      severity: "risk"
    });
    expect(classifySelectionWarning("未取得涨停池，数据缺失")).toEqual({
      category: "data_gap",
      severity: "risk"
    });
  });

  it("keeps legacy actionability compatibility as informational", () => {
    const summary = buildSelectionWarningSummary(
      ["历史旧版快照缺少行动分级字段"],
      {
        freshnessStatus: "current",
        topPickPreview: [
          { code: "sh600000", name: "浦发银行", score: 70, tier: "B", action: "跟踪观察" }
        ]
      }
    );

    expect(summary.primarySeverity).toBe("info");
    expect(summary.riskCount).toBe(0);
    expect(summary.categories.legacy_compat).toBeGreaterThanOrEqual(1);
    expect(summary.label).toContain("历史兼容");
  });

  it("separates source fallback warnings from hard data gaps", () => {
    const summary = buildSelectionWarningSummary(["东方财富接口请求失败：fetch failed，已使用备用源"]);

    expect(summary.primarySeverity).toBe("warning");
    expect(summary.categories.source_fallback).toBe(1);
    expect(summary.riskCount).toBe(0);
  });

  it("prioritizes real risk categories over high-count legacy notes", () => {
    const summary = buildSelectionWarningSummary(
      [
        "历史旧版快照缺少行动分级字段",
        "历史旧版快照缺少行动分级字段",
        "K线数据缺失，无法判断趋势"
      ],
      {
        freshnessStatus: "current",
        topPickPreview: [
          { code: "sh600000", name: "浦发银行", score: 70, tier: "B", action: "跟踪观察" }
        ]
      }
    );

    expect(summary.primarySeverity).toBe("risk");
    expect(summary.primaryCategory).toBe("data_gap");
    expect(summary.label).toContain("数据缺口");
  });

  it("does not treat conditional fallback explanations as hard missing data", () => {
    const classified = classifySelectionWarning("补不到主营业务的股票仍会保留数据不足或低置信约束。");

    expect(classified).toEqual({ category: "other", severity: "info" });
  });

  it("keeps routine selection process notes informational", () => {
    expect(classifySelectionWarning("候选池预筛会合并最近信号沉淀数据；最终评分前会按 refreshBeforeRun/refreshLimit 刷新入池前排股票的最新盘口、K线、技术和资金流。")).toEqual({
      category: "other",
      severity: "info"
    });
    expect(classifySelectionWarning("运行前补充财务层数据：profile success，lrb success，zcfz success，xjll success，shareholder success，reserve success。")).toEqual({
      category: "other",
      severity: "info"
    });
  });

  it("downgrades reference-only session snapshots instead of marking them as hard risk", () => {
    expect(classifySelectionWarning("运行快照仅可参考：当前尚未进入连续竞价，快照主要反映上一交易日或竞价参考，不应用作盘中确认。")).toEqual({
      category: "freshness",
      severity: "warning"
    });
    expect(classifySelectionWarning("运行快照仅可参考：夜间研究只能用于研究排队，不能作为当前行动依据。")).toEqual({
      category: "freshness",
      severity: "warning"
    });
  });

  it("keeps truly stale source reports as hard freshness risk", () => {
    expect(classifySelectionWarning("选股来源报告已过期，默认跳过选股 Agent 复核")).toEqual({
      category: "freshness",
      severity: "risk"
    });
  });

  it("downgrades long-age warnings when the current run is explicitly research-only", () => {
    const summary = buildSelectionWarningSummary(
      ["选股来源报告距离本次运行已超过 4 小时（85.4 小时），盘中策略需要先重新运行今日分析。"],
      {
        freshnessStatus: "current",
        topPickPreview: [
          {
            code: "sz301071",
            name: "力量钻石",
            score: 69,
            tier: "B",
            action: "跟踪观察",
            runtimeSnapshot: {
              latestPrice: 76.6,
              source: "unit",
              basis: "runtime_refresh",
              actionability: {
                level: "reference_only",
                label: "研究可参考",
                reason: "盘前快照不应用作盘中确认。",
                staleAfterMinutes: 30,
                sessionPhase: "premarket"
              },
              warnings: []
            }
          }
        ]
      }
    );

    expect(summary.primarySeverity).toBe("warning");
    expect(summary.riskCount).toBe(0);
    expect(summary.warningCount).toBe(1);
    expect(summary.primaryWarning).toContain("超过 4 小时");
    expect(summary.summary).toContain("主触发");
  });

  it("uses actionability instead of session name when downgrading long-age research snapshots", () => {
    const summary = buildSelectionWarningSummary(
      [
        "选股来源报告距离本次运行已超过 4 小时（85.4 小时），盘中策略需要先重新运行今日分析。",
        "来源报告数据状态为 partial，主力吸筹筛选需要降级解读。"
      ],
      {
        freshnessStatus: "current",
        topPickPreview: [
          {
            code: "sz301071",
            name: "力量钻石",
            score: 69,
            tier: "B",
            action: "跟踪观察",
            runtimeSnapshot: {
              latestPrice: 76.6,
              source: "unit",
              basis: "runtime_refresh",
              actionability: {
                level: "reference_only",
                label: "仅可参考",
                reason: "真实报价时间已超过 30 分钟，不适合直接触发行动。",
                ageMinutes: 5424,
                staleAfterMinutes: 30,
                sessionPhase: "morning"
              },
              warnings: []
            }
          }
        ]
      }
    );

    expect(summary.primarySeverity).toBe("warning");
    expect(summary.riskCount).toBe(0);
    expect(summary.warningCount).toBe(2);
    expect(summary.primaryWarning).toContain("partial");
  });
});
