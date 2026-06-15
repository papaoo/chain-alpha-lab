import fs from "node:fs";
import path from "node:path";
import { getAnalysisReport, listAnalysisReports } from "../src/lib/db/reports";

const args = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, ...rest] = arg.slice(2).split("=");
      return [key, rest.join("=") || "true"] as const;
    })
);

const reportId = args.get("report-id") ?? listAnalysisReports(1, 0, { displayableOnly: true })[0]?.id;
if (!reportId) {
  console.error("没有可导出的历史报告。请先运行一次分析，再执行 npm run fixture:export。");
  process.exitCode = 1;
} else {
  const report = getAnalysisReport(reportId, "none");
  if (!report) {
    console.error(`未找到报告：${reportId}`);
    process.exitCode = 1;
  } else {
    const outputDir = path.resolve(process.cwd(), "tests", "fixtures", "analysis");
    fs.mkdirSync(outputDir, { recursive: true });
    const safeTime = report.createdAt.replace(/[:.]/g, "-");
    const outputPath = path.join(outputDir, `${safeTime}-${report.id}.json`);
    const fixture = {
      name: `${report.createdAt} ${report.summary.slice(0, 40)}`,
      description: "从已保存报告导出的 factPackage 快照。若未来保存 BuildRuleInput，可升级为真正规则重放样本。",
      factPackage: report.factPackage,
      expect: {
        marketState: report.factPackage.market.marketState,
        topSectorStage: report.factPackage.sectors[0]?.stage,
        minCandidateCount: Math.min(report.factPackage.candidates.length, 1),
        maxPositionPct: report.factPackage.constraints.maxSingleStockPositionPct
      }
    };
    fs.writeFileSync(outputPath, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
    console.log(`已导出历史分析 fixture：${outputPath}`);
  }
}
