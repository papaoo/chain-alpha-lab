import type { StockActivitySnapshot, StockCandidate, StockFundFlowQuality, StockFundFlowSnapshot } from "@/lib/types";
import { TREND_STRETCH_LIMIT } from "@/lib/strategy/support";
import { formatMoney, formatPct } from "@/lib/strategy/candidateUtils";

export function evaluateStockActivity(input: {
  quote: NonNullable<StockCandidate["quote"]>;
  fundFlow?: StockFundFlowSnapshot;
  fundFlowQuality?: StockFundFlowQuality;
  changePct?: number;
  sectorRank?: number;
  maDistance?: NonNullable<StockCandidate["klineSummary"]>["maDistance"];
  tradability: NonNullable<StockCandidate["tradability"]>;
}): StockActivitySnapshot {
  let score = 0;
  const reasons: string[] = [];
  const blockers: string[] = [];
  const amount = input.quote.amount;
  const turnoverRate = input.quote.turnoverRate;
  const mainNetInflow = input.quote.mainNetInflow ?? input.fundFlow?.mainNetFlow;
  const sectorRank = input.sectorRank;
  const changePct = input.changePct ?? input.quote.changePct;

  if (amount !== undefined) {
    if (amount >= 2_000_000_000) {
      score += 24;
      reasons.push("成交额超过20亿，资金参与度强");
    } else if (amount >= 1_000_000_000) {
      score += 20;
      reasons.push("成交额超过10亿，流动性较强");
    } else if (amount >= 500_000_000) {
      score += 16;
      reasons.push("成交额超过5亿，具备交易活跃度");
    } else if (amount >= 100_000_000) {
      score += 10;
      reasons.push("成交额超过1亿，活跃度一般");
    } else if (amount > 0) {
      score += 5;
      blockers.push("成交额偏小，可能承接不足");
    }
  }

  if (turnoverRate !== undefined) {
    if (turnoverRate >= 3 && turnoverRate <= 15) {
      score += 22;
      reasons.push(`换手率${formatPct(turnoverRate)}，筹码交换较健康`);
    } else if (turnoverRate >= 1.5 && turnoverRate < 3) {
      score += 14;
      reasons.push(`换手率${formatPct(turnoverRate)}，有一定活跃度`);
    } else if (turnoverRate > 15 && turnoverRate <= 25) {
      score += 16;
      reasons.push(`换手率${formatPct(turnoverRate)}，高换手分歧`);
      blockers.push("高换手需要观察是否回封或承接");
    } else if (turnoverRate > 25) {
      score += 8;
      blockers.push(`换手率${formatPct(turnoverRate)}过高，短线波动风险大`);
    } else if (turnoverRate > 0) {
      score += 5;
      blockers.push(`换手率${formatPct(turnoverRate)}偏低，筹码活跃度不足`);
    }
  }

  if (input.fundFlowQuality && input.fundFlowQuality.state !== "未知") {
    score += Math.round(input.fundFlowQuality.score * 0.22);
    reasons.push(`资金质量${input.fundFlowQuality.state}/${input.fundFlowQuality.score}`);
  } else if (mainNetInflow !== undefined) {
    if (mainNetInflow > 0) {
      score += 10;
      reasons.push("当日主力净流入为正");
    } else if (mainNetInflow < 0) {
      blockers.push("当日主力净流出，活跃度需要降权");
    }
  }

  if (sectorRank !== undefined) {
    if (sectorRank <= 1) {
      score += 15;
      reasons.push(`板块前排第${sectorRank + 1}，具备核心活跃度`);
    } else if (sectorRank <= 3) {
      score += 12;
      reasons.push(`板块前排第${sectorRank + 1}`);
    } else if (sectorRank <= 5) {
      score += 8;
      reasons.push(`板块成交/涨幅排名第${sectorRank + 1}`);
    }
  }

  if (changePct !== undefined) {
    if (changePct >= 9.8) {
      score += 12;
      reasons.push("涨停或接近涨停，情绪强但买入可达性需单独约束");
    } else if (changePct >= 5) {
      score += 8;
      reasons.push("涨幅超过5%，短线资金活跃");
    } else if (changePct > 0) {
      score += 4;
      reasons.push("价格保持红盘");
    } else if (changePct < 0) {
      blockers.push("价格转弱，活跃度不作为正向信号");
    }
  }

  if ((input.maDistance?.ma5 ?? 0) > TREND_STRETCH_LIMIT.ma5 || (input.maDistance?.ma20 ?? 0) > TREND_STRETCH_LIMIT.ma20) {
    score -= 8;
    blockers.push("股价远离均线，活跃但追高风险上升");
  }
  if (input.tradability.status === "涨停不可达" || input.tradability.status === "接近涨停") {
    blockers.push(`${input.tradability.status}，活跃度只能用于次日/回踩预案，不能直接追买`);
  }

  const bounded = Math.max(0, Math.min(100, Math.round(score)));
  const hasEvidence = amount !== undefined || turnoverRate !== undefined || mainNetInflow !== undefined || sectorRank !== undefined || changePct !== undefined;
  const status: StockActivitySnapshot["status"] = !hasEvidence ? "缺失" : bounded >= 75 ? "强" : bounded >= 45 ? "中" : "弱";
  return {
    score: bounded,
    status,
    reasons,
    blockers,
    basis: { amount, turnoverRate, mainNetInflow, sectorRank, changePct }
  };
}

export function activityDiagnosticNote(activity: StockActivitySnapshot) {
  const basis = [
    activity.basis.amount !== undefined ? `成交额${formatMoney(activity.basis.amount)}` : "",
    activity.basis.turnoverRate !== undefined ? `换手${formatPct(activity.basis.turnoverRate)}` : "",
    activity.basis.mainNetInflow !== undefined ? `主力净流${formatMoney(activity.basis.mainNetInflow)}` : "",
    activity.basis.sectorRank !== undefined ? `板块排名${activity.basis.sectorRank + 1}` : "",
    activity.basis.changePct !== undefined ? `涨跌幅${formatPct(activity.basis.changePct)}` : ""
  ].filter(Boolean);
  return `${basis.join("，") || "缺少活跃度基础字段"}；依据：${activity.reasons.join("；") || "无"}；约束：${activity.blockers.join("；") || "无"}`;
}
