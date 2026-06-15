import { buildDefaultLayers } from "@/lib/serenity/scoring";
import type { SerenityMarket, SerenityThemePreview, SerenityThemeSuggestion } from "@/lib/serenity/types";

type BuiltinTheme = Omit<SerenityThemeSuggestion, "source" | "score"> & {
  chainLayers: string[];
  evidencePlan: string[];
};

const BUILTIN_THEMES: BuiltinTheme[] = [
  {
    id: "ai-semiconductor",
    name: "AI 半导体",
    market: "A-share",
    category: "半导体",
    aliases: ["AI芯片", "算力芯片", "半导体国产替代", "先进制程", "半导体设备"],
    description: "围绕 AI 算力扩张，研究设备、材料、先进封装、测试和国产替代链条里的稀缺层级。",
    chainKeywords: ["半导体", "芯片", "设备", "材料", "封装", "测试", "电子特气", "光刻胶"],
    chainLayers: ["关键设备/工艺平台", "材料与耗材", "先进封装与测试", "算力芯片/设计"],
    evidencePlan: ["验证相关业务收入占比", "检查设备/材料客户认证", "检查订单和产能项目", "对比研发投入与毛利率变化"]
  },
  {
    id: "cpo-optical",
    name: "CPO 光通信",
    market: "A-share",
    category: "AI 基础设施",
    aliases: ["光模块", "硅光", "800G", "1.6T", "光芯片", "光器件", "高速光通信"],
    description: "围绕 AI 数据中心网络升级，研究光芯片、光器件、模块、测试、PCB 和高速材料瓶颈。",
    chainKeywords: ["CPO", "光模块", "光芯片", "光器件", "通信设备", "PCB", "连接器", "硅光"],
    chainLayers: ["上游材料/衬底", "激光器/光芯片器件", "测试与封装", "光模块/系统集成"],
    evidencePlan: ["验证 800G/1.6T 产品进展", "检查海外客户和订单证据", "跟踪良率和产能扩张", "观察毛利率是否被价格竞争压缩"]
  },
  {
    id: "advanced-packaging",
    name: "先进封装",
    market: "A-share",
    category: "半导体",
    aliases: ["Chiplet", "HBM封装", "2.5D", "3D封装", "封测", "CoWoS"],
    description: "研究 AI 芯片放量下，封装产能、封装材料、测试设备和良率爬坡带来的真实约束。",
    chainKeywords: ["封装", "封测", "测试", "载板", "材料", "Chiplet", "HBM"],
    chainLayers: ["封装产能", "封装材料", "测试设备", "客户认证"],
    evidencePlan: ["验证先进封装产能规划", "检查资本开支和在建工程", "验证客户导入", "跟踪封测业务毛利率"]
  },
  {
    id: "electronic-special-gas",
    name: "电子特气",
    market: "A-share",
    category: "半导体材料",
    aliases: ["特种气体", "半导体气体", "电子气体", "工业气体"],
    description: "研究晶圆制造扩产与国产替代下，高纯气体、客户认证和稳定供应能力的稀缺性。",
    chainKeywords: ["电子特气", "特种气体", "工业气体", "半导体材料", "高纯"],
    chainLayers: ["高纯气体制备", "客户认证", "稳定供应", "产能扩张"],
    evidencePlan: ["验证半导体客户占比", "检查扩产项目进度", "查找认证和供货公告", "观察应收和存货变化"]
  },
  {
    id: "robot-actuator",
    name: "机器人执行器",
    market: "A-share",
    category: "机器人",
    aliases: ["人形机器人", "减速器", "丝杠", "空心杯电机", "传感器", "执行器"],
    description: "研究人形机器人量产前，执行器、减速器、丝杠、电机和传感器中更难扩产的环节。",
    chainKeywords: ["机器人", "减速器", "丝杠", "电机", "传感器", "执行器"],
    chainLayers: ["精密传动", "电机", "传感器", "控制系统", "总成"],
    evidencePlan: ["验证客户送样或定点", "检查量产时间表", "对比毛利率和产能弹性", "警惕纯概念和小批量样品"]
  },
  {
    id: "solid-state-battery",
    name: "固态电池",
    market: "A-share",
    category: "新能源",
    aliases: ["半固态电池", "固态电解质", "硫化物电解质", "锂电材料"],
    description: "研究固态电池产业化过程中，电解质、设备、材料体系和量产良率的瓶颈。",
    chainKeywords: ["固态电池", "电解质", "锂电", "电池材料", "设备"],
    chainLayers: ["电解质材料", "核心设备", "电池制造", "整车验证"],
    evidencePlan: ["验证中试或量产进度", "检查客户合作", "跟踪安全性和循环寿命数据", "警惕产业化时间过早"]
  },
  {
    id: "liquid-cooling",
    name: "液冷服务器",
    market: "A-share",
    category: "AI 基础设施",
    aliases: ["液冷", "数据中心散热", "冷板", "浸没式液冷", "服务器散热"],
    description: "研究 AI 数据中心功耗提升后，冷板、泵阀、换热、机柜和工程交付能力的瓶颈。",
    chainKeywords: ["液冷", "散热", "服务器", "数据中心", "冷板", "机柜"],
    chainLayers: ["冷板/泵阀", "换热系统", "机柜集成", "工程交付"],
    evidencePlan: ["验证数据中心订单", "检查客户导入", "关注毛利率和交付周期", "区分硬件供应和工程外包"]
  },
  {
    id: "high-speed-pcb",
    name: "高速 PCB 与材料",
    market: "A-share",
    category: "AI 基础设施",
    aliases: ["PCB", "覆铜板", "高速板", "HDI", "服务器PCB", "交换机PCB"],
    description: "研究 AI 服务器和高速交换机放量下，高速 PCB、覆铜板、树脂和良率瓶颈。",
    chainKeywords: ["PCB", "覆铜板", "元件", "高速板", "交换机", "服务器"],
    chainLayers: ["高速材料", "覆铜板", "PCB制造", "客户认证"],
    evidencePlan: ["验证 AI 服务器订单", "检查高速材料占比", "观察产能利用率", "跟踪毛利率是否改善"]
  }
];

export function searchSerenityThemes(query: string, market: SerenityMarket = "A-share", limit = 8): SerenityThemeSuggestion[] {
  const normalizedQuery = normalizeText(query);
  const candidates = BUILTIN_THEMES.filter((theme) => market === "global" || theme.market === market || theme.market === "A-share")
    .map((theme) => {
      const score = scoreTheme(theme, normalizedQuery);
      return { ...theme, source: "builtin" as const, score };
    })
    .filter((theme) => !normalizedQuery || theme.score > 0)
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name, "zh-CN"))
    .slice(0, Math.min(Math.max(limit, 1), 20));

  if (candidates.length) return candidates;
  return BUILTIN_THEMES.slice(0, Math.min(Math.max(limit, 1), 20)).map((theme, index) => ({
    ...theme,
    source: "builtin" as const,
    score: Math.max(1, 20 - index)
  }));
}

export function findBestSerenityTheme(themeName: string, market: SerenityMarket = "A-share") {
  return searchSerenityThemes(themeName, market, 1)[0];
}

export function buildSerenityThemePreview(input: {
  theme: string;
  market?: SerenityMarket;
  timeWindow?: string;
  candidatePreview?: SerenityThemePreview["candidatePreview"];
  extraWarnings?: string[];
}): SerenityThemePreview {
  const market = input.market ?? "A-share";
  const timeWindow = input.timeWindow?.trim() || "未来 3-12 个月";
  const builtinTheme = findBestBuiltinTheme(input.theme, market);
  const normalizedTheme = builtinTheme ? toSuggestion(builtinTheme, scoreTheme(builtinTheme, normalizeText(input.theme))) : undefined;
  const layerRanking = buildDefaultLayers(builtinTheme?.name || input.theme)
    .map((layer, index) => {
      const layerName = builtinTheme?.chainLayers[index] ?? layer.name;
      return { ...layer, name: layerName };
    })
    .sort((left, right) => left.rank - right.rank);
  const evidencePlan = builtinTheme?.evidencePlan ?? [
    "验证主题对应的真实需求是否扩张",
    "查找公司主营、公告、财报、客户和产能证据",
    "区分真实瓶颈、普通受益和概念蹭热点",
    "补充反证条件，防止只看正面故事"
  ];

  return {
    theme: input.theme.trim() || normalizedTheme?.name || "未命名主题",
    market,
    timeWindow,
    normalizedTheme,
    layerRanking,
    candidatePreview: input.candidatePreview ?? [],
    evidencePlan,
    warnings: [
      "候选池当前来自最新系统报告和东方财富板块成分，主营、公告、财报证据仍在后续阶段补强。",
      "本模块只输出研究优先级，不直接生成买入、卖出或仓位建议。",
      ...(input.extraWarnings ?? [])
    ].filter((warning, index, list) => list.indexOf(warning) === index)
  };
}

function findBestBuiltinTheme(themeName: string, market: SerenityMarket = "A-share") {
  const normalizedQuery = normalizeText(themeName);
  return BUILTIN_THEMES.filter((theme) => market === "global" || theme.market === market || theme.market === "A-share")
    .map((theme) => ({ theme, score: scoreTheme(theme, normalizedQuery) }))
    .sort((left, right) => right.score - left.score)
    .at(0)?.theme;
}

function toSuggestion(theme: BuiltinTheme, score: number): SerenityThemeSuggestion {
  return {
    id: theme.id,
    name: theme.name,
    market: theme.market,
    category: theme.category,
    aliases: theme.aliases,
    description: theme.description,
    chainKeywords: theme.chainKeywords,
    source: "builtin",
    score
  };
}

function scoreTheme(theme: BuiltinTheme, normalizedQuery: string) {
  if (!normalizedQuery) return 10;
  const texts = [theme.name, theme.category, theme.description, ...theme.aliases, ...theme.chainKeywords, ...theme.chainLayers]
    .map(normalizeText);
  let score = 0;
  for (const text of texts) {
    if (text === normalizedQuery) score += 100;
    else if (text.includes(normalizedQuery)) score += 42;
    else if (normalizedQuery.includes(text) && text.length >= 2) score += 24;
    else score += overlapScore(text, normalizedQuery);
  }
  return score;
}

function overlapScore(text: string, query: string) {
  if (!query) return 0;
  let score = 0;
  for (const char of new Set(query.split(""))) {
    if (text.includes(char)) score += 2;
  }
  return score >= Math.max(4, query.length) ? score : 0;
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[，。、“”‘’（）()\-_/]/g, "");
}
