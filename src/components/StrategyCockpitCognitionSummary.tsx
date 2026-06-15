"use client";

import type { AnalysisReport } from "@/lib/types";
import type { MarketCognitionSnapshot, Tone } from "@/components/StrategyCockpitTypes";
import { formatMarketState, formatMoney, formatPercent, formatSignedPct, marketStateTone, sentimentBoxClass } from "@/components/StrategyCockpitUtils";

export function MarketCognitionSummary({ snapshot, report }: { snapshot: MarketCognitionSnapshot | null; report: AnalysisReport | null }) {
  const breadth = snapshot?.breadth;
  const emotion = snapshot?.emotion;
  const burst = emotion?.burstRate ?? 0;
  const upPct = breadth?.upPct ?? 0;
  const strongest = snapshot?.topInflowBoards?.[0] ?? snapshot?.topChangeBoards?.[0];
  const posture = snapshot && report?.ruleResult.market.marketState ? formatMarketState(report.ruleResult.market.marketState) : "等待同步";
  const cards = [
    {
      label: "市场宽度",
      value: breadth ? `${upPct.toFixed(1)}%` : "--",
      hint: breadth ? `上涨 ${breadth.up} / 下跌 ${breadth.down}，中位涨跌幅 ${formatSignedPct(breadth.medianChangePct)}` : "等待全 A 宽度",
      tone: upPct >= 55 ? "up" as Tone : upPct >= 40 ? "warn" as Tone : "risk" as Tone
    },
    {
      label: "情绪压力",
      value: emotion ? `${emotion.limitUpCount}/${emotion.openBoardCount}` : "--",
      hint: emotion ? `涨停 ${emotion.limitUpCount}，炸板 ${emotion.openBoardCount}，炸板率 ${formatPercent(burst)}` : "等待涨跌停池",
      tone: burst >= 40 ? "risk" as Tone : burst >= 25 ? "warn" as Tone : "up" as Tone
    },
    {
      label: "资金焦点",
      value: strongest?.name ?? "--",
      hint: strongest ? `主力净流入 ${formatMoney(strongest.mainNetInflow)}，涨跌 ${formatSignedPct(strongest.changePct)}，领涨 ${strongest.leadStock ?? "--"}` : "等待板块资金",
      tone: (strongest?.mainNetInflow ?? 0) > 0 ? "info" as Tone : "muted" as Tone
    },
    {
      label: "规则姿态",
      value: posture,
      hint: snapshot ? "该状态来自规则引擎，不由首页展示层或模型自由改变。" : "市场认知数据读取完成后，再与最新规则报告对照。",
      tone: snapshot ? marketStateTone(report?.ruleResult.market.marketState) : "muted" as Tone
    }
  ];
  return (
    <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className={`group relative overflow-hidden rounded-2xl border p-4 ${sentimentBoxClass(card.tone)}`}>
          <div className="absolute -right-8 -top-8 h-20 w-20 rounded-full bg-current opacity-[0.06]" />
          <p className="text-xs opacity-75">{card.label}</p>
          <p className="mt-2 truncate text-2xl font-semibold">{card.value}</p>
          <p className="mt-2 line-clamp-2 text-xs leading-5 opacity-80">{card.hint}</p>
        </div>
      ))}
    </div>
  );
}
