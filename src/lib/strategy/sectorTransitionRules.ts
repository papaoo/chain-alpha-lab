import type { MarketTimelinePoint, SectorRuleResult, SectorSnapshot } from "@/lib/types";
import { ZH } from "@/lib/strategy/support";
import { sameSectorName } from "@/lib/sector/normalization";

export function buildSectorCoreContinuity(sector: SectorSnapshot, marketTimeline: MarketTimelinePoint[]): NonNullable<SectorRuleResult["coreContinuity"]> {
  const previousSector = [...marketTimeline]
    .reverse()
    .map((point) => point.topSectors.find((item) => sameSectorName(item.name, sector.name)))
    .find((item): item is NonNullable<typeof item> => Boolean(item));
  const currentCore = (sector.coreStocks ?? []).slice(0, 5);
  const currentNames = currentCore.map((stock) => stock.name);
  const currentLeader = currentCore.find((stock) => stock.role === ZH.leader)?.name ?? currentCore[0]?.name;

  if (!previousSector) {
    const score = Math.min(20, currentCore.length * 3 + (currentLeader ? 3 : 0));
    return {
      retained: [],
      appeared: currentNames,
      disappeared: [],
      currentLeader,
      leaderChanged: false,
      score,
      state: "无历史",
      reason: currentCore.length ? `历史中没有同名主线核心股，本期核心为${currentNames.join("、")}，需要后续验证延续性。` : "历史中没有同名主线，本期也缺少明确核心股。"
    };
  }

  const previousCore = previousSector.coreStocks.slice(0, 5);
  const previousNames = previousCore.map((stock) => stock.name);
  const previousLeader = previousCore.find((stock) => stock.role === ZH.leader)?.name ?? previousCore[0]?.name;
  const retained = currentNames.filter((name) => previousNames.includes(name));
  const appeared = currentNames.filter((name) => !previousNames.includes(name));
  const disappeared = previousNames.filter((name) => !currentNames.includes(name));
  const leaderChanged = Boolean(previousLeader && currentLeader && previousLeader !== currentLeader);
  const score = Math.max(
    0,
    Math.min(20, retained.length * 5 + Math.min(currentCore.length, 4) * 2 + (!leaderChanged ? 3 : -3) - disappeared.length)
  );
  const state: NonNullable<SectorRuleResult["coreContinuity"]>["state"] =
    retained.length >= 2 && !leaderChanged
      ? "稳定"
      : retained.length >= 1 && appeared.length >= 1
        ? "轮动健康"
        : leaderChanged && retained.length === 0
          ? "换龙头待确认"
          : currentCore.length >= 2
            ? "轮动健康"
            : "结构偏弱";
  const reason = `上一期核心${previousNames.join("、") || "无"}；本期核心${currentNames.join("、") || "无"}；延续${retained.join("、") || "无"}，新出现${appeared.join("、") || "无"}，退出${disappeared.join("、") || "无"}${leaderChanged ? `，龙头由${previousLeader}切换为${currentLeader}` : "，龙头未明显切换"}。`;

  return {
    retained,
    appeared,
    disappeared,
    previousLeader,
    currentLeader,
    leaderChanged,
    score,
    state,
    reason
  };
}

export function applySectorStageTransition(input: {
  sector: SectorSnapshot;
  rawStage: SectorRuleResult["stage"];
  score: number;
  fundingScore: number;
  breadthScore: number;
  limitPoolScore: number;
  coreContinuity: NonNullable<SectorRuleResult["coreContinuity"]>;
  marketTimeline: MarketTimelinePoint[];
}): {
  stage: SectorRuleResult["stage"];
  previousStage?: SectorRuleResult["stage"];
  transition: NonNullable<SectorRuleResult["stageTransition"]>;
  reason: string;
  adjusted: boolean;
  lifecycleDays: number;
} {
  const history = input.marketTimeline
    .map((point) => point.topSectors.find((item) => sameSectorName(item.name, input.sector.name)))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const previous = history[history.length - 1];
  const lifecycleDays = history.length + 1;
  if (!previous) {
    return {
      stage: input.rawStage,
      transition: "新出现",
      reason: "历史报告中未找到同名主线，本期按当日证据作为新出现主线处理。",
      adjusted: false,
      lifecycleDays
    };
  }

  const coreStocks = input.sector.coreStocks ?? [];
  const limitUpCount = input.sector.limitUpCount ?? 0;
  const openBoardCount = input.sector.openBoardCount ?? 0;
  const openBoardPressure = openBoardCount > Math.max(2, limitUpCount) || (limitUpCount >= 3 && openBoardCount / Math.max(limitUpCount, 1) >= 0.8);
  const hasLimitLeader = coreStocks.some((stock) => stock.role === ZH.leader && (stock.limitStatus === "涨停" || stock.score >= 65));
  const hasCoreAnchor = coreStocks.some((stock) => (stock.role === ZH.leader || stock.role === ZH.core) && stock.score >= 45);
  const coreChangeUnconfirmed = input.coreContinuity.state === "换龙头待确认" || input.coreContinuity.state === "结构偏弱";
  const broadConfirm =
    input.score >= 72 &&
    input.fundingScore >= 14 &&
    input.breadthScore >= 12 &&
    input.limitPoolScore >= 8 &&
    hasCoreAnchor &&
    !coreChangeUnconfirmed;
  const coreLimitConfirm =
    input.score >= 64 &&
    input.limitPoolScore >= 9 &&
    hasLimitLeader &&
    !openBoardPressure &&
    input.fundingScore >= 5 &&
    (input.breadthScore >= 6 || limitUpCount >= 5) &&
    !coreChangeUnconfirmed;
  const continuityConfirm =
    input.score >= 66 &&
    input.coreContinuity.score >= 12 &&
    hasCoreAnchor &&
    input.limitPoolScore >= 6 &&
    input.fundingScore >= 8 &&
    !openBoardPressure &&
    input.coreContinuity.state !== "换龙头待确认";
  const hardConfirm = broadConfirm || coreLimitConfirm || continuityConfirm;
  const confirmPath = broadConfirm ? "广度确认" : coreLimitConfirm ? "涨停核心确认" : continuityConfirm ? "连续性确认" : "未硬确认";
  const confirmBlockers = [
    input.score < 64 ? `总分不足${input.score.toFixed(0)}/64` : "",
    input.limitPoolScore < 6 ? `涨停核心不足${input.limitPoolScore}/6` : "",
    input.fundingScore < 5 ? `资金分不足${input.fundingScore}/5` : "",
    input.breadthScore < 6 && limitUpCount < 5 ? `扩散不足${input.breadthScore}/6且涨停数不足5只` : "",
    !hasLimitLeader && !hasCoreAnchor ? "缺少龙头/中军核心锚" : "",
    openBoardPressure ? `炸板压力偏高：涨停${limitUpCount}只、炸板${openBoardCount}只` : "",
    coreChangeUnconfirmed ? `核心结构${input.coreContinuity.state}` : ""
  ].filter(Boolean);
  const previousStage = previous.stage;
  let stage = input.rawStage;
  let adjusted = false;
  let reason = `上一期为${previousStage}，本期当日原始阶段为${input.rawStage}，阶段按证据${stageTransitionLabel(previousStage, input.rawStage)}；确认路径：${confirmPath}。`;

  if ((previousStage === ZH.observe || previousStage === ZH.startup) && input.rawStage === ZH.confirmed && !hardConfirm) {
    stage = ZH.startup;
    adjusted = true;
    reason = `上一期为${previousStage}，本期原始阶段直接升为确认，但尚未满足广度确认、涨停核心确认或连续性确认路径，先压制为启动并等待下一期延续验证；阻断项：${confirmBlockers.join("；") || "综合证据不足"}。`;
  } else if ((previousStage === ZH.observe || previousStage === ZH.startup) && input.rawStage === ZH.accelerating) {
    stage = hardConfirm ? ZH.confirmed : ZH.startup;
    adjusted = true;
    reason = `上一期为${previousStage}，本期原始阶段跳到加速；加速必须建立在已确认主线之上，本期按${confirmPath}先修正为${stage}，避免单日高潮误判为成熟主线。`;
  } else if ((previousStage === ZH.confirmed || previousStage === ZH.accelerating) && input.rawStage === ZH.observe && input.score >= 40) {
    stage = ZH.diverging;
    adjusted = true;
    reason = `上一期为${previousStage}，本期单日转弱但综合评分仍有${input.score.toFixed(0)}，先标记为分歧，观察核心股和资金是否修复，而不是直接打回观察。`;
  } else if (previousStage === ZH.confirmed && input.rawStage === ZH.startup && input.score >= 52 && input.fundingScore >= 8) {
    stage = ZH.diverging;
    adjusted = true;
    reason = `上一期为确认，本期原始阶段降为启动且仍有一定资金/评分支撑，按确认主线分歧处理，等待下一期确认是修复还是降级。`;
  } else if ((previousStage === ZH.confirmed || previousStage === ZH.accelerating) && input.rawStage === ZH.confirmed && input.coreContinuity.state === "换龙头待确认") {
    stage = ZH.diverging;
    adjusted = true;
    reason = `上一期为${previousStage}，本期原始阶段仍为确认，但核心股出现换龙头且缺少延续核心，先按分歧处理，等待新核心连续性验证。`;
  }

  return {
    stage,
    previousStage,
    transition: adjusted ? (stageRankForTransition(input.rawStage) > stageRankForTransition(stage) ? "压制升级" : "降级修正") : stageTransitionLabel(previousStage, stage),
    reason,
    adjusted,
    lifecycleDays
  };
}

function stageTransitionLabel(previous: SectorRuleResult["stage"], current: SectorRuleResult["stage"]): NonNullable<SectorRuleResult["stageTransition"]> {
  const delta = stageRankForTransition(current) - stageRankForTransition(previous);
  if (delta > 0) return "升级";
  if (delta < 0) return "降级";
  return "延续";
}

function stageRankForTransition(stage: SectorRuleResult["stage"]) {
  if (stage === ZH.fading) return -1;
  if (stage === ZH.observe) return 0;
  if (stage === ZH.startup || stage === ZH.diverging) return 1;
  if (stage === ZH.confirmed) return 2;
  return 3;
}
