import type { SelectionStrategyDefinition, SelectionStrategyId } from "@/lib/selection/types";

export const SELECTION_STRATEGIES: SelectionStrategyDefinition[] = [
  {
    id: "main_force_accumulation",
    order: 1,
    name: "主力吸筹",
    subtitle: "资金连续性 + 筹码集中 + 低位结构",
    description: "寻找主力资金持续进入、筹码趋于集中、股价尚未明显透支的中期波段观察标的。",
    defaultTimeRange: "3m",
    recommendedPickCount: 10,
    candidatePoolLimit: 250,
    riskLevel: "medium",
    cycle: "mid",
    enabledInMvp: true,
    hardFilters: [
      "近 5 日主力净流入为正",
      "股东户数下降，或近 20/60 日资金为正",
      "当日涨幅不超过追高阈值",
      "60 日资金大幅流出且股价大涨时不得高置信推荐"
    ],
    scoreFactors: [
      { key: "fund", label: "资金强度", weight: 25, description: "比较当日、5 日、20 日、60 日主力资金连续性。" },
      { key: "chip", label: "筹码集中", weight: 20, description: "股东户数下降、换手温和、筹码稳定性。" },
      { key: "volumePrice", label: "量价背离", weight: 15, description: "资金进入但价格未透支，优先识别压价吸筹。" },
      { key: "valuationSafety", label: "估值安全", weight: 10, description: "PE/PB 与行业区间比较，过滤明显透支。" },
      { key: "fundamental", label: "基本面托底", weight: 10, description: "盈利、现金流、负债和主营业务稳定性。" },
      { key: "technicalLow", label: "技术低位", weight: 10, description: "均线修复、低位横盘、未严重超买。" },
      { key: "sector", label: "板块匹配", weight: 5, description: "是否属于当前可识别主线或强势板块。" },
      { key: "external", label: "外部验证", weight: 5, description: "龙虎榜、北向、公告等辅助证据。" }
    ],
    requiredData: ["日 K", "技术指标", "资金流", "股东户数", "市值换手", "公司资料", "财务指标"],
    outputFocus: ["真吸筹", "压价吸筹", "假反弹", "中期追踪条件"],
    parameters: commonParameters({ maxDayChangePct: 5, pickCount: 10, candidateLimit: 250 })
  },
  {
    id: "short_term_breakout",
    order: 2,
    name: "短期突破",
    subtitle: "放量突破 + 均线多头 + 板块共振",
    description: "寻找短期动能增强、突破结构清晰、板块处于启动或确认阶段的强势交易机会。",
    defaultTimeRange: "15d",
    recommendedPickCount: 5,
    candidatePoolLimit: 200,
    riskLevel: "medium_high",
    cycle: "short",
    enabledInMvp: true,
    hardFilters: [
      "成交额达到最低流动性",
      "近 5 日涨幅不得超过追高上限",
      "不能是一字涨停不可买状态",
      "板块退潮或炸板率过高时降级"
    ],
    scoreFactors: [
      { key: "breakoutPattern", label: "突破形态", weight: 25, description: "平台突破、新高突破、回踩确认。" },
      { key: "volumeExpansion", label: "量能放大", weight: 20, description: "突破时放量，回踩时缩量优先。" },
      { key: "maTrend", label: "均线多头", weight: 15, description: "MA5/MA10/MA20 多头或站回关键均线。" },
      { key: "momentum", label: "动能指标", weight: 15, description: "MACD、KDJ、RSI 协同且未极端过热。" },
      { key: "sector", label: "板块强度", weight: 10, description: "板块阶段、扩散、核心股结构。" },
      { key: "fund", label: "资金确认", weight: 10, description: "主力资金不能与突破方向明显背离。" },
      { key: "risk", label: "风险控制", weight: 5, description: "上影线、炸板、高位透支等扣分。" }
    ],
    requiredData: ["日 K", "技术指标", "资金流", "成交额", "板块阶段", "涨跌停池"],
    outputFocus: ["突破有效性", "是否可买", "回踩触发", "止损条件"],
    parameters: [
      ...commonParameters({ maxDayChangePct: 8, pickCount: 5, candidateLimit: 200 }),
      {
        key: "minAmountYi",
        label: "最低成交额",
        type: "number" as const,
        defaultValue: 1,
        min: 0.2,
        max: 50,
        unit: "亿",
        description: "短线突破必须有足够流动性承接，低于该成交额只保留观察或剔除。"
      }
    ]
  },
  {
    id: "value_stable",
    order: 3,
    name: "价值稳健",
    subtitle: "估值安全 + 盈利质量 + 现金流",
    description: "寻找估值合理、盈利和现金流稳定、财务风险较低的中长期配置观察标的。",
    defaultTimeRange: "1y",
    recommendedPickCount: 10,
    candidatePoolLimit: 300,
    riskLevel: "low",
    cycle: "long",
    enabledInMvp: true,
    hardFilters: ["PE/PB 不得明显高于行业分位", "ROE 不得低于策略阈值", "资产负债率不得超过上限", "经营现金流不能长期恶化"],
    scoreFactors: [
      { key: "valuationSafety", label: "估值安全", weight: 25, description: "PE/PB/股息率与行业分位比较。" },
      { key: "profitability", label: "盈利能力", weight: 20, description: "ROE、净利率、毛利率稳定性。" },
      { key: "cashFlow", label: "现金流质量", weight: 15, description: "经营现金流与利润匹配度。" },
      { key: "debtRisk", label: "负债风险", weight: 15, description: "资产负债率、流动比率、偿债压力。" },
      { key: "shareholderReturn", label: "股东回报", weight: 10, description: "分红、回购、长期回报。" },
      { key: "trendStability", label: "趋势稳定", weight: 10, description: "低波动趋势和关键均线支撑。" },
      { key: "fund", label: "资金确认", weight: 5, description: "温和资金认可即可，不追求短线爆发。" }
    ],
    requiredData: ["财务指标", "估值", "分红", "现金流", "负债", "日 K"],
    outputFocus: ["低估值修复", "价值陷阱", "配置观察", "财务风险"],
    parameters: commonParameters({ maxDayChangePct: 4, pickCount: 10, candidateLimit: 300 })
  },
  {
    id: "growth_potential",
    order: 4,
    name: "成长潜力",
    subtitle: "成长质量 + 行业景气 + 研发逻辑",
    description: "寻找营收和利润具备成长性、行业景气度较高、估值有基本面支撑的成长型标的。",
    defaultTimeRange: "6m",
    recommendedPickCount: 10,
    candidatePoolLimit: 300,
    riskLevel: "medium_high",
    cycle: "long",
    enabledInMvp: true,
    hardFilters: ["营收增长或净利增长至少一项为正", "毛利率不得持续恶化", "资产负债率不得失控", "高估值必须有成长数据支撑"],
    scoreFactors: [
      { key: "revenueGrowth", label: "营收增长", weight: 20, description: "营收同比与连续性。" },
      { key: "profitGrowth", label: "净利增长", weight: 20, description: "净利润增速与扣非质量。" },
      { key: "quality", label: "毛利率和 ROE", weight: 15, description: "成长质量和盈利效率。" },
      { key: "industryCycle", label: "行业景气", weight: 15, description: "行业趋势、政策和订单景气。" },
      { key: "research", label: "研发产品", weight: 10, description: "研发投入、产品迭代和产业链位置。" },
      { key: "fund", label: "资金关注", weight: 10, description: "中期资金是否认可。" },
      { key: "technical", label: "技术位置", weight: 5, description: "避免极端追高。" },
      { key: "riskPenalty", label: "风险惩罚", weight: 5, description: "一次性收益、现金流不足、题材泡沫。" }
    ],
    requiredData: ["财务指标", "公司资料", "行业景气", "研发", "资金流", "日 K"],
    outputFocus: ["成长质量", "估值支撑", "产业链位置", "泡沫风险"],
    parameters: commonParameters({ maxDayChangePct: 6, pickCount: 10, candidateLimit: 300 })
  },
  {
    id: "sector_rotation",
    order: 5,
    name: "板块轮动",
    subtitle: "板块阶段 + 个股地位 + 资金切换",
    description: "结合主线驾驶舱的板块阶段和资金扩散，寻找轮动中更有地位和承接的个股。",
    defaultTimeRange: "30d",
    recommendedPickCount: 10,
    candidatePoolLimit: 250,
    riskLevel: "medium",
    cycle: "mid",
    enabledInMvp: true,
    hardFilters: ["必须归属到可识别板块", "板块不得处于退潮", "个股不得显著弱于板块", "板块内同类股票不能全部资金流出"],
    scoreFactors: [
      { key: "sectorStrength", label: "板块强度", weight: 25, description: "涨幅、宽度、阶段和核心股。" },
      { key: "sectorFund", label: "板块资金", weight: 20, description: "板块资金强度和连续性。" },
      { key: "role", label: "个股地位", weight: 15, description: "龙头、中军、补涨或后排。" },
      { key: "stockFund", label: "个股资金", weight: 15, description: "个股资金是否领先板块。" },
      { key: "volumePrice", label: "量价匹配", weight: 10, description: "上涨、回踩和承接质量。" },
      { key: "catalyst", label: "新闻政策", weight: 10, description: "政策、公告、产业催化。" },
      { key: "riskPenalty", label: "风险惩罚", weight: 5, description: "退潮、补跌、后排冲高。" }
    ],
    requiredData: ["板块成分", "板块阶段", "资金流", "涨跌停池", "日 K", "新闻"],
    outputFocus: ["轮动方向", "个股地位", "板块集中风险", "切换条件"],
    parameters: commonParameters({ maxDayChangePct: 7, pickCount: 10, candidateLimit: 250 })
  },
  {
    id: "low_risk_return",
    order: 6,
    name: "低风险收益",
    subtitle: "低波动 + 回撤控制 + 估值边际",
    description: "寻找波动和回撤相对可控、估值安全边际较高、事件风险较少的稳健观察标的。",
    defaultTimeRange: "6m",
    recommendedPickCount: 8,
    candidatePoolLimit: 250,
    riskLevel: "low",
    cycle: "mid",
    enabledInMvp: true,
    hardFilters: ["历史波动不得超过上限", "最大回撤不得超过上限", "估值安全分不得过低", "不得处于连续下跌无支撑状态"],
    scoreFactors: [
      { key: "volatility", label: "波动控制", weight: 20, description: "历史波动和异常波动。" },
      { key: "drawdown", label: "回撤控制", weight: 20, description: "阶段最大回撤和修复速度。" },
      { key: "valuationSafety", label: "估值安全", weight: 20, description: "估值分位与安全边际。" },
      { key: "profitStability", label: "盈利稳定", weight: 15, description: "盈利和现金流稳定性。" },
      { key: "trendStability", label: "趋势平稳", weight: 10, description: "均线和价格结构平稳。" },
      { key: "fundStability", label: "资金稳定", weight: 10, description: "资金不持续大幅流出。" },
      { key: "eventRisk", label: "事件风险", weight: 5, description: "公告、财报和新闻风险。" }
    ],
    requiredData: ["日 K", "波动率", "回撤", "估值", "财务指标", "新闻"],
    outputFocus: ["防守配置", "稳健低吸", "回撤风险", "失效条件"],
    parameters: commonParameters({ maxDayChangePct: 4, pickCount: 8, candidateLimit: 250 })
  }
];

export function listSelectionStrategies() {
  return [...SELECTION_STRATEGIES].sort((a, b) => a.order - b.order);
}

export function getSelectionStrategy(id: SelectionStrategyId) {
  return SELECTION_STRATEGIES.find((strategy) => strategy.id === id) ?? null;
}

function commonParameters({
  maxDayChangePct,
  pickCount,
  candidateLimit
}: {
  maxDayChangePct: number;
  pickCount: number;
  candidateLimit: number;
}) {
  return [
    {
      key: "refreshBeforeRun",
      label: "运行前刷新",
      type: "boolean" as const,
      defaultValue: true,
      description: "运行规则选股前，批量刷新候选池K线、技术指标和资金流，减少历史快照滞后。"
    },
    {
      key: "refreshLimit",
      label: "刷新上限",
      type: "number" as const,
      defaultValue: Math.min(candidateLimit, 80),
      min: 20,
      max: 120,
      description: "为控制接口耗时，每次最多刷新多少只候选股。"
    },
    {
      key: "largeCapPolicy",
      label: "超大市值处理",
      type: "select" as const,
      defaultValue: "balanced",
      options: [
        { label: "平衡约束", value: "balanced" },
        { label: "允许大票", value: "allow" },
        { label: "主动回避", value: "avoid_large_cap" }
      ],
      description: "平衡约束下，超大市值股票若缺少板块/主线承接会被降权，避免低波银行类股票挤占吸筹候选。"
    },
    {
      key: "poolMode",
      label: "候选池来源",
      type: "select" as const,
      defaultValue: "strategy_adaptive",
      options: [
        { label: "策略自适应沉淀池", value: "strategy_adaptive" },
        { label: "全 A 扫描池", value: "full_a_scan" },
        { label: "混合全 A 池", value: "hybrid_full_a" },
        { label: "最近信号沉淀池", value: "recent_signals" },
        { label: "最新报告候选池", value: "latest_report" }
      ],
      description: "策略自适应沉淀池会合并最新报告与近期历史信号；全 A 扫描池先用东方财富最新行情做盘口初筛，再只刷新前排股票进入正式评分。"
    },
    {
      key: "timeRange",
      label: "时间区间",
      type: "select" as const,
      defaultValue: "strategy_default",
      options: [
        { label: "按策略默认", value: "strategy_default" },
        { label: "最近 15 天", value: "15d" },
        { label: "最近 30 天", value: "30d" },
        { label: "近 3 个月", value: "3m" },
        { label: "近 6 个月", value: "6m" },
        { label: "近 1 年", value: "1y" }
      ],
      description: "用于候选池拉取、涨跌幅约束和策略评价窗口。"
    },
    {
      key: "maxFinalPicks",
      label: "至多精选",
      type: "number" as const,
      defaultValue: pickCount,
      min: 3,
      max: 20,
      description: "最终由规则和总评审输出的股票数量上限。"
    },
    {
      key: "candidatePoolLimit",
      label: "候选池上限",
      type: "number" as const,
      defaultValue: candidateLimit,
      min: 50,
      max: 1000,
      description: "初筛前最多保留的股票数量，后续会通过数据完整性和硬过滤缩小。"
    },
    {
      key: "maxDayChangePct",
      label: "当日最大涨幅",
      type: "number" as const,
      defaultValue: maxDayChangePct,
      min: 1,
      max: 20,
      unit: "%",
      description: "防止策略选股直接追入短线过热标的。"
    },
    {
      key: "excludeDataInsufficient",
      label: "排除数据不足",
      type: "boolean" as const,
      defaultValue: true,
      description: "核心行情、K 线、资金或公司信息缺失时默认不进入最终精选。"
    },
    {
      key: "forceAgentOnStale",
      label: "强制复核历史快照",
      type: "boolean" as const,
      defaultValue: false,
      description: "来源报告过期时默认跳过 Agent 以节省 token；仅在做历史复盘或链路压测时开启。"
    },
    {
      key: "forceAgentOnReferenceOnly",
      label: "复核仅研究快照",
      type: "boolean" as const,
      defaultValue: false,
      description: "盘前、夜间或休市快照默认不调用 Agent；仅在做研究复盘、提示词压测或人工确认需要模型总结时开启。"
    }
  ];
}
