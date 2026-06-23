import { describe, expect, it } from "vitest";
import { buildReportDataGapAudit } from "@/lib/dataQuality/reportGaps";
import type { AnalysisReport } from "@/lib/types";

describe("report data gap audit", () => {
  it("separates hard candidate gaps from company supplement and fallback sources", async () => {
    const report = {
      id: "report-1",
      title: "收盘复盘",
      createdAt: "2026-06-22T07:33:00.000Z",
      factPackage: {
        tradeDate: "20260622",
        dataSource: {
          warningDetails: [
            {
              message: "东方财富未找到概念板块，已使用关联板块作为近似成分来源。",
              severity: "warning",
              scope: "sector",
              impact: "中影响",
              action: "复核映射"
            }
          ],
          traces: [
            {
              id: "sector.x.constituents",
              scope: "sector",
              field: "sectorConstituents",
              subjectName: "锗镓概念",
              providerName: "东方财富公开数据",
              provider: "eastmoney_public",
              accessPath: "http",
              sourceLabel: "东方财富",
              quality: "approximate",
              freshness: "delayed",
              warning: "使用小金属概念近似"
            },
            {
              id: "stock.sh603688.dailyKline",
              scope: "stock",
              field: "dailyKline",
              subjectCode: "sh603688",
              subjectName: "石英股份",
              providerName: "Tushare",
              provider: "tushare",
              accessPath: "api",
              sourceLabel: "Tushare",
              quality: "fallback",
              freshness: "eod"
            }
          ]
        },
        candidates: [
          {
            code: "sh603688",
            name: "石英股份",
            sectorName: "非金属材料",
            action: "不追",
            dataCompleteness: {
              level: "complete",
              coreMarketLevel: "complete",
              companyKnowledgeLevel: "partial",
              hasHotData: true,
              hasKlineData: true,
              hasTechnicalData: true,
              hasFundFlowData: true,
              hasSectorData: true,
              hasProfileData: true,
              hasCompanyKnowledge: true,
              missingFields: ["公司认知补充字段"],
              blockingReasons: []
            },
            companyKnowledge: {
              missingFields: ["产业链位置"]
            },
            sourceTraces: [
              {
                id: "stock.sh603688.dailyKline",
                scope: "stock",
                field: "dailyKline",
                subjectCode: "sh603688",
                subjectName: "石英股份",
                providerName: "Tushare",
                provider: "tushare",
                accessPath: "api",
                sourceLabel: "Tushare",
                quality: "fallback",
                freshness: "eod"
              }
            ]
          }
        ]
      }
    } as unknown as AnalysisReport;

    const audit = await buildReportDataGapAudit(report, { includeProviderCapabilities: false });

    expect(audit.conclusion).toBe("存在软补充项");
    expect(audit.candidateSummary.hardGapCount).toBe(0);
    expect(audit.companySupplementGaps).toHaveLength(1);
    expect(audit.approximateSectorMappings).toHaveLength(1);
    expect(audit.fallbackSources).toHaveLength(1);
    expect(audit.summary).toContain("不等于个股行情缺失");
  });

  it("classifies missing K-line as a hard candidate gap", async () => {
    const report = {
      id: "report-2",
      title: "午后确认",
      createdAt: "2026-06-22T05:15:00.000Z",
      factPackage: {
        dataSource: { warningDetails: [], traces: [] },
        candidates: [
          {
            code: "sh600030",
            name: "中信证券",
            sectorName: "证券",
            action: "数据不足",
            dataCompleteness: {
              level: "insufficient",
              coreMarketLevel: "insufficient",
              companyKnowledgeLevel: "sufficient",
              hasHotData: true,
              hasKlineData: false,
              hasTechnicalData: true,
              hasFundFlowData: true,
              hasSectorData: true,
              hasProfileData: true,
              hasCompanyKnowledge: true,
              missingFields: ["K线"],
              blockingReasons: ["缺少K线，禁止给出明确买入动作"]
            },
            companyKnowledge: { missingFields: [] }
          }
        ]
      }
    } as unknown as AnalysisReport;

    const audit = await buildReportDataGapAudit(report, { includeProviderCapabilities: false });

    expect(audit.conclusion).toBe("存在关键缺口");
    expect(audit.hardCandidateGaps[0]?.missingFields).toContain("K线");
  });
});
