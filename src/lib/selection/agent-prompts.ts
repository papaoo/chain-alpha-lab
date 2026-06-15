import type { SelectionRunResult, SelectionStrategyDefinition } from "@/lib/selection/types";

const AGENT_SCHEMA = `必须输出 JSON object，且只允许以下顶层字段：
{
  "agentReports": [
    {
      "agentId": "fund_flow|sector|fundamental|technical|risk",
      "agentName": "资金流向分析师|行业板块分析师|财务基本面分析师|技术形态分析师|量化风控分析师",
      "status": "success",
      "summary": "string",
      "topPicks": ["候选池内股票代码"],
      "avoidStocks": ["候选池内股票代码"],
      "missingData": ["string"],
      "stockOpinions": [
        {
          "code": "string",
          "name": "string",
          "recommendation": "support|neutral|reject",
          "confidence": "high|medium|low",
          "logic": "string",
          "riskFlags": ["string"],
          "evidenceRefs": ["string"]
        }
      ],
      "evidenceRefs": ["string"]
    }
  ],
  "finalReview": {
    "status": "success",
    "summary": "string",
    "strategySuitability": "string",
    "finalPicks": [
      {
        "code": "string",
        "name": "string",
        "tier": "S|A|B|C|D",
        "recommendation": "priority|watch|wait|avoid",
        "confidence": "high|medium|low",
        "logic": "string",
        "risk": "string",
        "suggestedPositionPct": 0,
        "watchConditions": ["string"],
        "invalidConditions": ["string"],
        "evidenceRefs": ["string"]
      }
    ],
    "portfolioRisk": "string",
    "noTradeConditions": ["string"],
    "evidenceRefs": ["string"]
  }
}`;

export const SELECTION_AGENT_SYSTEM_PROMPT = `你是 A 股策略选股系统中的 AI 分析师团队。
你只能基于输入的策略定义、规则筛选结果、候选池、数据来源留痕和证据引用进行分析。
你不得编造行情、财务、新闻、资金、股东、客户、订单、市占率或营收利润数据。
你不得新增候选池之外的股票，不得推荐已被规则剔除的股票为最终优先标的。
你不得突破规则动作和硬阻断；如果规则已标记剔除，只能解释剔除原因或列入 avoid。
你必须明确区分：数据事实、规则计算、模型归纳。
每条重要结论必须给 evidenceRefs，且 evidenceRefs 只能来自输入中的 allowedEvidenceRefs。
仓位只是研究辅助，suggestedPositionPct 范围 0-10；剔除/回避/数据不足必须为 0。
输出必须是 JSON，不得输出 Markdown、代码块或额外说明。`;

export function buildSelectionAgentPrompt(strategy: SelectionStrategyDefinition, ruleResult: SelectionRunResult) {
  const context = buildSelectionAgentContext(strategy, ruleResult);
  return `请基于以下选股运行上下文，输出五位分析师团队报告和总评审。

${AGENT_SCHEMA}

篇幅要求：
1. 每个 Agent 的 summary 不超过 80 个汉字。
2. 每个 Agent 的 stockOpinions 最多 5 条。
3. finalReview.finalPicks 最多 5 条。
4. 每个 logic、risk 不超过 80 个汉字。

分析重点：
1. 资金流向分析师：判断资金连续性、当日与多日资金是否背离、是否是假反弹。
2. 行业板块分析师：判断板块归属、主线或行业阶段、个股是否顺板块。
3. 财务基本面分析师：只基于已给出的财务/估值/公司认知字段，缺失必须写 missingData。
4. 技术形态分析师：判断趋势、均线距离、突破/回踩/过热，不得把涨停不可达写成可买。
5. 量化风控分析师：检查硬阻断、数据完整性、追高、流动性、仓位上限和不交易条件。
6. 总评审：只在规则精选 picks 中选择 finalPicks；rejected 不能变成 priority。

上下文 JSON：
${JSON.stringify(context, null, 2)}`;
}

function buildSelectionAgentContext(strategy: SelectionStrategyDefinition, ruleResult: SelectionRunResult) {
  const topPicks = ruleResult.picks.slice(0, 6).map(compactPick);
  const rejected = ruleResult.rejected.slice(0, 6).map(compactPick);
  const allowedEvidenceRefs = Array.from(new Set([...topPicks, ...rejected].flatMap((pick) => pick.evidenceRefs))).slice(0, 200);
  return {
    strategy: {
      id: strategy.id,
      name: strategy.name,
      description: strategy.description,
      riskLevel: strategy.riskLevel,
      cycle: strategy.cycle,
      hardFilters: strategy.hardFilters.slice(0, 5),
      scoreFactors: strategy.scoreFactors.map((factor) => ({
        key: factor.key,
        label: factor.label,
        weight: factor.weight
      })),
      requiredData: strategy.requiredData,
      outputFocus: strategy.outputFocus
    },
    run: {
      mode: ruleResult.mode,
      parameters: ruleResult.parameters,
      sourceReportId: ruleResult.sourceReportId,
      sourceReportCreatedAt: ruleResult.sourceReportCreatedAt,
      dataBasis: ruleResult.dataBasis,
      warnings: ruleResult.warnings.slice(0, 6),
      pickCount: ruleResult.picks.length,
      rejectedCount: ruleResult.rejected.length
    },
    rulePicks: topPicks,
    ruleRejected: rejected,
    allowedCodes: [...topPicks, ...rejected].map((pick) => pick.code),
    allowedFinalPickCodes: topPicks.map((pick) => pick.code),
    allowedEvidenceRefs
  };
}

function compactPick(pick: SelectionRunResult["picks"][number]) {
  return {
    code: pick.code,
    name: pick.name,
    sectorName: pick.sectorName,
    price: pick.price,
    changePct: pick.changePct,
    score: pick.score,
    tier: pick.tier,
    action: pick.action,
    reasons: pick.reasons.slice(0, 3),
    blockers: pick.blockers.slice(0, 4),
    scoreFactors: pick.scoreFactors.map((factor) => ({
      key: factor.key,
      label: factor.label,
      score: factor.score,
      maxScore: factor.maxScore,
      reasons: factor.reasons.slice(0, 1),
      blockers: factor.blockers.slice(0, 1)
    })),
    evidenceRefs: pick.evidenceRefs.slice(0, 8)
  };
}
