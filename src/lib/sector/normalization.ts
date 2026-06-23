export interface SectorAliasGroup {
  canonical: string;
  aliases: string[];
  patterns?: RegExp[];
}

const CJK_ROMAN_LEVEL_SUFFIX_RE = /[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+$/g;
const ASCII_ROMAN_LEVEL_SUFFIX_RE = /(^|[^A-Za-z])([IVX]{1,4})$/i;
const GENERIC_SUFFIX_RE = /概念|板块|行业/g;

export const sectorAliasGroups: SectorAliasGroup[] = [
  {
    canonical: "元件",
    aliases: ["被动元件", "元件", "电子元件", "电子元器件", "电子元件及组件", "被动元件概念"]
  },
  {
    canonical: "电子特气",
    aliases: ["电子特气", "电子气体", "特种气体", "工业气体", "高纯气体"]
  },
  {
    canonical: "光学光电子",
    aliases: ["光学光电子", "光学电子", "光电子", "光学光电", "显示器件", "显示面板", "面板", "OLED", "MicroLED"]
  },
  {
    canonical: "焦炭",
    aliases: ["焦炭", "焦炭加工"],
    patterns: [/^焦炭/]
  },
  {
    canonical: "煤炭",
    aliases: ["煤炭", "煤炭开采", "煤炭开采加工", "煤炭行业"]
  },
  {
    canonical: "通信设备",
    aliases: ["通信设备", "通讯设备", "网络设备"]
  },
  {
    canonical: "半导体设备",
    aliases: ["半导体设备", "芯片设备", "集成电路设备", "光刻机", "先进封装设备"]
  },
  {
    canonical: "半导体材料",
    aliases: ["半导体材料", "电子化学品", "光刻胶", "硅片", "大硅片", "靶材", "湿电子化学品", "电子树脂"]
  },
  {
    canonical: "半导体",
    aliases: ["半导体", "集成电路", "芯片", "国产芯片", "中芯概念", "半导体概念"]
  },
  {
    canonical: "金刚石",
    aliases: ["金刚石", "培育钻石", "人造钻石", "工业金刚石", "超硬材料", "培育钻石概念"]
  },
  {
    canonical: "有色锆",
    aliases: ["有色(锆)", "有色锆", "锆", "锆金属", "锆材料", "锆产业链", "锆英砂", "氧氯化锆"]
  },
  {
    canonical: "锗镓",
    aliases: ["锗镓", "锗镓概念", "锗", "镓", "锗材料", "镓材料", "云南锗业"]
  },
  {
    canonical: "有色铋",
    aliases: ["有色(铋)", "有色铋", "铋", "铋金属", "铋材料", "铋产业链"]
  },
  {
    canonical: "机器人执行器",
    aliases: ["机器人执行器", "空心杯电机", "微特电机", "机器人电机", "电机执行器", "减速器"]
  },
  {
    canonical: "人形机器人",
    aliases: ["人形机器人", "机器人概念", "机器人", "物理AI", "具身智能", "Physical AI"]
  },
  {
    canonical: "算力",
    aliases: ["算力", "算力租赁", "数据中心", "液冷服务器", "服务器"]
  },
  {
    canonical: "CPO",
    aliases: ["CPO", "光模块", "高速光模块", "光通信模块"]
  },
  {
    canonical: "新能源汽车",
    aliases: ["新能源汽车", "新能源车", "智能电动车"]
  },
  {
    canonical: "智能驾驶",
    aliases: ["智能驾驶", "无人驾驶", "车路云", "车联网"]
  },
  {
    canonical: "汽车零部件",
    aliases: ["汽车零部件", "汽车配件", "汽车电子"]
  },
  {
    canonical: "储能",
    aliases: ["储能", "新型储能", "储能系统"]
  },
  {
    canonical: "光伏",
    aliases: ["光伏", "光伏设备", "太阳能", "TOPCon电池", "HJT电池"]
  },
  {
    canonical: "风电",
    aliases: ["风电", "风电设备", "海上风电"]
  }
];

const exactAliasMap = new Map<string, string>();
for (const group of sectorAliasGroups) {
  exactAliasMap.set(cleanSectorName(group.canonical), group.canonical);
  for (const alias of group.aliases) exactAliasMap.set(cleanSectorName(alias), group.canonical);
}

export function cleanSectorName(value: string) {
  return value
    .replace(CJK_ROMAN_LEVEL_SUFFIX_RE, "")
    .replace(ASCII_ROMAN_LEVEL_SUFFIX_RE, "$1")
    .replace(GENERIC_SUFFIX_RE, "")
    .replace(/\s+/g, "")
    .trim();
}

export function canonicalSectorName(value: string) {
  const normalized = cleanSectorName(value);
  const exact = exactAliasMap.get(normalized);
  if (exact) return exact;

  for (const group of sectorAliasGroups) {
    if (group.patterns?.some((pattern) => pattern.test(normalized))) return group.canonical;
  }

  return normalized;
}

export function normalizeSectorName(value: string) {
  return canonicalSectorName(value);
}

export function sectorAliasesFor(value: string) {
  const canonical = canonicalSectorName(value);
  const group = sectorAliasGroups.find((item) => item.canonical === canonical);
  if (!group) return [];
  return Array.from(new Set([group.canonical, ...group.aliases])).filter((alias) => cleanSectorName(alias) !== cleanSectorName(value));
}

export function sectorDisplayName(value: string) {
  return normalizeSectorName(value) || value;
}

export function sameSectorName(left: string, right: string) {
  const normalizedLeft = normalizeSectorName(left);
  const normalizedRight = normalizeSectorName(right);
  if (!normalizedLeft || !normalizedRight) return false;
  return normalizedLeft === normalizedRight || normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft);
}
