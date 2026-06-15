import type { CompanyKnowledgeCard, StockCandidate } from "@/lib/types";
import { normalizeSectorName } from "@/lib/sector/normalization";

type MainlineAttribution = NonNullable<StockCandidate["mainlineAttribution"]>;

export function businessMatchesSector(row: Record<string, unknown> | undefined, sectorName: string) {
  return matchBusinessToSector(row, sectorName).level === "direct";
}

export function matchBusinessToSector(row: Record<string, unknown> | undefined, sectorName: string): { level: "direct" | "supply" | "none"; matchedKeywords: string[]; sectorKeywords: string[] } {
  const text = profileText(row).toLowerCase();
  const keywords = sectorKeywordProfile(sectorName);
  if (!text.trim()) return { level: "none", matchedKeywords: [], sectorKeywords: keywords.direct };
  const direct = keywords.direct.filter((keyword) => text.includes(keyword.toLowerCase()));
  if (direct.length) return { level: "direct", matchedKeywords: direct, sectorKeywords: keywords.direct };
  const supply = keywords.supply.filter((keyword) => text.includes(keyword.toLowerCase()));
  if (supply.length) return { level: "supply", matchedKeywords: supply, sectorKeywords: keywords.direct };
  return { level: "none", matchedKeywords: [], sectorKeywords: keywords.direct };
}

function sectorKeywordProfile(sectorName: string) {
  const normalized = normalizeSectorName(sectorName);
  const base = normalized ? [normalized] : [];
  const profiles: Record<string, { direct: string[]; supply: string[] }> = {
    元件: {
      direct: ["元件", "电子元件", "电子元器件", "被动元件", "电容", "电感", "电阻", "连接器"],
      supply: ["pcb", "印制电路板", "电路板", "电子材料", "显示器件", "显示面板", "面板", "模组"]
    },
    电子特气: {
      direct: ["电子特气", "电子气体", "特种气体", "高纯气体", "工业气体", "含氟气体"],
      supply: ["半导体材料", "气体材料", "氟化工", "湿电子化学品"]
    },
    焦炭: {
      direct: ["焦炭", "焦化", "煤焦", "冶金焦"],
      supply: ["焦煤", "煤炭", "炼钢", "钢铁"]
    },
    煤炭: {
      direct: ["煤炭", "煤矿", "焦煤", "动力煤", "无烟煤"],
      supply: ["煤化工", "焦化", "电力运营"]
    },
    通信设备: {
      direct: ["通信设备", "通信", "光模块", "网络设备", "基站", "交换机", "路由器", "光通信"],
      supply: ["光芯片", "光器件", "数据中心", "服务器"]
    },
    光学光电子: {
      direct: ["光学光电子", "显示器件", "显示面板", "面板", "oled", "led", "背光", "光学"],
      supply: ["玻璃基板", "偏光片", "模组", "消费电子"]
    },
    半导体: {
      direct: ["半导体", "芯片", "集成电路", "晶圆", "封装", "功率器件", "半导体设备"],
      supply: ["电子特气", "光刻胶", "硅片", "先进封装", "材料"]
    }
  };
  const profile = profiles[normalized] ?? { direct: base, supply: [] };
  return {
    direct: Array.from(new Set([...base, ...profile.direct])).filter(Boolean),
    supply: Array.from(new Set(profile.supply)).filter(Boolean)
  };
}

export function profileText(row: Record<string, unknown> | undefined) {
  return `${row?.business ?? ""} ${row?.industry ?? ""} ${row?.sector ?? ""}`.trim();
}

export function formatAttributionStatus(status: MainlineAttribution["status"]) {
  const labels: Record<MainlineAttribution["status"], string> = {
    direct_constituent: "成分股直接归属",
    business_direct: "主营业务直接匹配",
    supply_chain_related: "产业链弱相关",
    theme_indirect: "题材间接相关",
    mismatch: "主题偏离",
    unknown: "数据不足"
  };
  return labels[status];
}

export function inferIndustryChainPosition(business: string, industry: string, sectorName: string): CompanyKnowledgeCard["industryChainPosition"] {
  const text = `${business} ${industry} ${sectorName}`.toLowerCase();
  const sector = normalizeSectorName(sectorName).toLowerCase();
  const upstream = [
    "材料", "电子材料", "电子特气", "特种气体", "工业气体", "电子气体", "化学品", "原料",
    "硅", "树脂", "铜箔", "光刻胶", "靶材", "三氟甲磺酸", "半导体材料"
  ];
  const midstream = [
    "pcb", "印制电路板", "电路板", "被动元件", "电容", "电感", "连接器", "元器件",
    "显示器件", "面板", "oled", "led", "模组", "封测", "封装", "功率器件", "晶圆", "设备", "制造"
  ];
  const downstream = ["应用", "终端", "整机", "手机", "汽车", "服务器", "消费电子", "电力运营", "发电"];
  if (upstream.some((keyword) => text.includes(keyword))) return "上游";
  if (midstream.some((keyword) => text.includes(keyword))) return "中游";
  if (downstream.some((keyword) => text.includes(keyword))) return "下游";
  if (sector.includes("元件") && /电子|电器|器件|线路|组件/.test(text)) return "中游";
  if (sector.includes("半导体") && /设计|晶圆|封测|设备|材料|功率/.test(text)) return "中游";
  if (/服务|销售|解决方案|系统集成/.test(text)) return "终端应用";
  return "unknown";
}
