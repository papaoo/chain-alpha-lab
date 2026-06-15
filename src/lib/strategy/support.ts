import type {
  FactPackage,
  LimitPoolSnapshot,
  MarketBreadthSnapshot,
  MarketSessionContext,
  MarketTimelinePoint,
  SectorConstituentSnapshot
} from "@/lib/types";
import type { PremarketSnapshot } from "@/lib/premarket/types";
import type { ParsedCommandResult } from "@/lib/westock/parser";

export const ZH = {
  provider: "\u817e\u8baf\u81ea\u9009\u80a1\u884c\u60c5\u6570\u636e\u63a5\u53e3",
  sh: "\u4e0a\u8bc1\u6307\u6570",
  sz: "\u6df1\u6210\u6307",
  cyb: "\u521b\u4e1a\u677f\u6307",
  kcb: "\u79d1\u521b50",
  startup: "\u542f\u52a8",
  confirmed: "\u786e\u8ba4",
  accelerating: "\u52a0\u901f",
  diverging: "\u5206\u6b67",
  fading: "\u9000\u6f6e",
  leader: "\u9f99\u5934",
  core: "\u4e2d\u519b",
  catchUp: "\u8865\u6da8",
  dipWatch: "\u4f4e\u5438\u89c2\u5bdf",
  observe: "\u89c2\u5bdf",
  smallTrial: "\u5c0f\u4ed3\u8bd5\u9519",
  waitPullback: "\u7b49\u5f85\u56de\u8e29",
  noChase: "\u4e0d\u8ffd",
  avoid: "\u56de\u907f",
  insufficient: "\u6570\u636e\u4e0d\u8db3",
  maPullback: "\u56de\u8e29\u5747\u7ebf",
  breakoutPullback: "\u7a81\u7834\u56de\u8e29",
  divergenceRepair: "\u5206\u6b67\u4fee\u590d",
  noBuyPoint: "\u65e0\u4e70\u70b9"
} as const;

export const TREND_STRETCH_LIMIT = { ma5: 10, ma20: 18 } as const;
export const BUY_POINT_STRETCH_LIMIT = { ma5: 8, ma20: 14 } as const;

export interface BuildRuleInput {
  timestamp: string;
  packageVersion: string;
  marketKlines: ParsedCommandResult[];
  marketTechnicals?: ParsedCommandResult | null;
  boardOverview: ParsedCommandResult;
  hotBoards: ParsedCommandResult;
  hotStocks: ParsedCommandResult;
  stockKlines: ParsedCommandResult | null;
  stockTechnicals: ParsedCommandResult | null;
  stockFundFlows: ParsedCommandResult | null;
  stockProfiles: ParsedCommandResult | null;
  stockIncomeStatements?: ParsedCommandResult | null;
  stockBalanceSheets?: ParsedCommandResult | null;
  stockCashFlows?: ParsedCommandResult | null;
  stockShareholders?: ParsedCommandResult | null;
  stockReserves?: ParsedCommandResult | null;
  marketBreadth?: MarketBreadthSnapshot | null;
  limitPools?: LimitPoolSnapshot[];
  sectorConstituents?: SectorConstituentSnapshot[];
  supplementalWarnings?: string[];
  marketTimeline?: MarketTimelinePoint[];
  session?: MarketSessionContext;
  premarket?: PremarketSnapshot;
}


export function buildDataSourceWarningDetails(warnings: string[]): NonNullable<FactPackage["dataSource"]["warningDetails"]> {
  return Array.from(new Set(warnings.map((warning) => warning.trim()).filter(Boolean))).map((message) => {
    const scope = inferWarningScope(message);
    const severity = inferWarningSeverity(message);
    return {
      message,
      severity,
      scope,
      impact: warningImpact(scope, severity),
      action: warningAction(scope, severity)
    };
  });
}

function inferWarningSeverity(message: string): NonNullable<FactPackage["dataSource"]["warningDetails"]>[number]["severity"] {
  if (/失败|failed|fetch failed|超时|timeout|网络|接口请求失败|未找到|空数据|缺失/i.test(message)) return "risk";
  if (/降级|近似|弱参考|滞后|校验|不能视为|需复核|补充/.test(message)) return "warning";
  return "info";
}

function inferWarningScope(message: string): NonNullable<FactPackage["dataSource"]["warningDetails"]>[number]["scope"] {
  if (/交易日历|非交易日|集合竞价|开盘|闭市|夜间|午间|交易日/.test(message)) return "calendar";
  if (/模型|DeepSeek|LLM|大模型/i.test(message)) return "model";
  if (/F10|公司|主营|财务|股东|业绩|公告/.test(message)) return "company";
  if (/候选|热门股|个股|股票|资金流|日K|K线缺口/.test(message)) return "stock";
  if (/板块|成分|概念|行业|主线/.test(message)) return "sector";
  if (/指数|全A|宽度|涨跌停|涨停|跌停|炸板|大跌|行情/.test(message)) return "market";
  return "system";
}

function warningImpact(
  scope: NonNullable<FactPackage["dataSource"]["warningDetails"]>[number]["scope"],
  severity: NonNullable<FactPackage["dataSource"]["warningDetails"]>[number]["severity"]
) {
  const prefix = severity === "risk" ? "高影响" : severity === "warning" ? "中影响" : "低影响";
  const labels: Record<typeof scope, string> = {
    market: "大盘状态、宽度和情绪评分需要降级确认",
    sector: "主线阶段、成分扩散和板块归属需要复核",
    stock: "候选股排序、资金连续性和买点判断需要降级",
    company: "公司认知、长期逻辑和主线匹配不能过度推断",
    calendar: "分析时段和有效交易日需要校验，盘中结论可能滞后",
    model: "模型增强报告可能不可用，但规则结论仍可保留",
    system: "系统数据完整性需要人工查看"
  };
  return `${prefix}：${labels[scope]}`;
}

function warningAction(
  scope: NonNullable<FactPackage["dataSource"]["warningDetails"]>[number]["scope"],
  severity: NonNullable<FactPackage["dataSource"]["warningDetails"]>[number]["severity"]
) {
  if (severity === "info") return "记录留痕即可，不单独改变规则结论。";
  const actions: Record<typeof scope, string> = {
    market: "检查全A宽度、涨跌停池和指数技术指标；缺失时禁止判为可交易。",
    sector: "补充板块代码映射、成分股和同义板块来源；近似成分需标记置信度。",
    stock: "补充候选股K线、技术指标和资金流；缺核心字段不得给试错仓位。",
    company: "补充F10、财务指标、主营构成和股东数据；不足时禁止长期持有理由。",
    calendar: "用真实K线日期或Tushare交易日历校验本地日历。",
    model: "保留规则报告，检查模型配置、token预算和输出校验错误。",
    system: "查看数据源日志和接口健康检查。"
  };
  return actions[scope];
}
