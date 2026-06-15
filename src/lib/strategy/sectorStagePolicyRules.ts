import type { SectorRuleResult } from "@/lib/types";
import { ZH } from "@/lib/strategy/support";

export function allowedBuyTypesForStage(stage: SectorRuleResult["stage"]): SectorRuleResult["allowedBuyTypes"] {
  if (stage === ZH.startup) return [ZH.maPullback, ZH.breakoutPullback];
  if (stage === ZH.confirmed) return [ZH.maPullback, ZH.breakoutPullback, ZH.divergenceRepair];
  if (stage === ZH.accelerating) return [ZH.divergenceRepair];
  if (stage === ZH.diverging) return [ZH.divergenceRepair, ZH.maPullback];
  return [];
}

export function forbiddenActionsForStage(stage: SectorRuleResult["stage"]) {
  if (stage === ZH.accelerating) return ["追涨", "后排补涨", "高位接力"];
  if (stage === ZH.diverging) return ["追涨", "弱势反抽", "非核心股试错"];
  if (stage === ZH.fading) return ["新开仓", "加仓", "抄底弱修复"];
  if (stage === ZH.startup) return ["重仓", "后排追涨"];
  if (stage === ZH.observe) return ["新开仓", "追涨", "后排补涨", "重仓"];
  return ["高位追涨"];
}

export function invalidConditionsForStage(stage: SectorRuleResult["stage"]) {
  if (stage === ZH.accelerating) return ["核心股放量长阴", "后排亏钱效应扩大", "资金由流入转为连续流出"];
  if (stage === ZH.diverging) return ["核心股跌破MA20", "板块资金继续流出", "分歧后无法修复"];
  if (stage === ZH.fading) return ["资金未重新流入", "核心股未收复关键均线", "板块未重新进入前排"];
  if (stage === ZH.confirmed) return ["5日强度转负", "主力资金连续流出", "中军跌破MA20"];
  if (stage === ZH.startup) return ["次日无法延续", "资金回流失败", "领涨股冲高回落"];
  if (stage === ZH.observe) return ["未形成持续性", "核心股结构转弱", "板块未进入前排"];
  return ["缺少持续性证据"];
}

export function inferDivergenceType(change: number, inflow: number, inflow5: number, breadthScore: number): SectorRuleResult["divergenceType"] {
  if (inflow < 0 && inflow5 < 0 && breadthScore < 0) return "恶性分歧";
  if (change < 0 && inflow5 > 0) return "良性分歧";
  return "日内分歧修复";
}
