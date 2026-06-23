import { getAnalysisReport, listAnalysisReports } from "@/lib/db/reports";
import { searchSerenityThemes } from "@/lib/serenity/themes";
import type { SerenityMarket, SerenityThemeSuggestion } from "@/lib/serenity/types";

export type MainlineThemeImportResult = {
  reportId?: string;
  reportCreatedAt?: string;
  suggestions: SerenityThemeSuggestion[];
  warnings: string[];
};

const SECTOR_THEME_HINTS: Array<{ pattern: RegExp; theme: string; reason: string }> = [
  { pattern: /元件|PCB|覆铜板|连接器|印制电路板/i, theme: "高速 PCB 与材料", reason: "主线含元件/PCB/连接器链条，适合研究 AI 服务器与高速材料瓶颈。" },
  { pattern: /通信|CPO|光模块|光通信|硅光/i, theme: "CPO 光通信", reason: "主线含通信/光模块线索，适合拆 CPO、光芯片、测试与 PCB 层级。" },
  { pattern: /半导体|芯片|集成电路|设备|光刻|封测/i, theme: "AI 半导体", reason: "主线含半导体链条，适合从设备、材料、封装和测试找稀缺环节。" },
  { pattern: /电子特气|特气|工业气体|电子化学/i, theme: "电子特气", reason: "主线含电子特气/电子化学品，适合验证客户认证、纯度和产能瓶颈。" },
  { pattern: /机器人|减速器|电机|执行器|丝杠/i, theme: "机器人执行器", reason: "主线含机器人执行器链条，适合拆精密传动、电机、丝杠与传感器。" },
  { pattern: /电池|固态|锂电|电解质/i, theme: "固态电池", reason: "主线含电池材料/固态方向，适合验证电解质、设备和量产良率。" },
  { pattern: /液冷|服务器|数据中心|散热/i, theme: "液冷服务器", reason: "主线含数据中心/服务器/散热方向，适合拆冷板、泵阀和工程交付能力。" }
];

export function importSerenityThemesFromLatestMainline(limit = 8, market: SerenityMarket = "A-share"): MainlineThemeImportResult {
  const latest = listAnalysisReports(1, 0, { displayableOnly: true })[0];
  if (!latest) {
    return { suggestions: [], warnings: ["暂无可展示的主线分析报告，无法从今日主线导入主题。"] };
  }
  const report = getAnalysisReport(latest.id, "none");
  if (!report) {
    return { reportId: latest.id, suggestions: [], warnings: ["最新主线报告读取失败，无法导入 Serenity 主题。"] };
  }

  const warnings: string[] = [];
  const byId = new Map<string, SerenityThemeSuggestion>();
  for (const sector of report.factPackage.sectors.slice(0, 12)) {
    const text = [
      sector.name,
      sector.normalizedName,
      ...(sector.sourceNames ?? []),
      ...sector.coreStocks.map((stock) => `${stock.name} ${stock.role}`)
    ].filter(Boolean).join(" ");
    for (const hint of SECTOR_THEME_HINTS) {
      if (!hint.pattern.test(text)) continue;
      const base = searchSerenityThemes(hint.theme, market, 1)[0];
      if (!base) continue;
      const sectorScore = Number.isFinite(sector.score) ? Math.max(0, Math.min(100, sector.score)) : 0;
      const score = Number(Math.min(98, base.score * 0.52 + sectorScore * 0.26 + stageBoost(sector.stage)).toFixed(1));
      const existing = byId.get(base.id);
      if (!existing || score > existing.score) {
        byId.set(base.id, {
          ...base,
          source: "mainline",
          sourceLabel: `${sector.name}：${hint.reason}`,
          score
        });
      }
    }
  }

  if (!byId.size) warnings.push("最新主线暂未匹配到内置 Serenity 主题，可手动输入主题继续研究。");
  return {
    reportId: report.id,
    reportCreatedAt: report.createdAt,
    suggestions: Array.from(byId.values()).sort((left, right) => right.score - left.score).slice(0, Math.min(Math.max(limit, 1), 20)),
    warnings
  };
}

function stageBoost(stage: string) {
  if (stage.includes("确认") || stage.includes("加速")) return 18;
  if (stage.includes("启动")) return 12;
  if (stage.includes("观察")) return 6;
  return 0;
}
