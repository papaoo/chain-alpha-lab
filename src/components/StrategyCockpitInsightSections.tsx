"use client";

import { Activity, Database, TrendingUp } from "lucide-react";
import type { AnalysisReport, AppSettings } from "@/lib/types";
import type { ReportSummary } from "@/components/StrategyCockpitTypes";
import { MetricTile, Panel, StrategyCard } from "@/components/StrategyCockpitPrimitives";
import { classifyCockpitDataWarnings, formatLlmStatus, formatSectorStage, groupCockpitDataWarnings, llmStatusTone } from "@/components/StrategyCockpitUtils";
import { DataHealthStrip, ModelQualityStrip } from "@/components/StrategyCockpitDataQualityPanels";

export function SectorRadarPanel({ sectors }: { sectors: AnalysisReport["factPackage"]["sectors"] }) {
  return (
    <Panel
      title="主线雷达"
      icon={TrendingUp}
      action={<span className="text-xs text-slate-500">阶段 / 强度 / 迁移</span>}
      collapsible
      defaultOpen={false}
      summary={<SectorSummary sectors={sectors} />}
    >
      <div className="space-y-3">
        {sectors.slice(0, 5).map((sector) => (
          <div key={`${sector.name}-${sector.normalizedName ?? ""}`} className="rounded-xl border border-slate-800 bg-slate-950/58 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium text-slate-100">{sector.name}</p>
                <p className="mt-1 text-xs text-slate-500">{sector.normalizedName ?? "未归一"}</p>
              </div>
              <span className="rounded-lg border border-cyan-400/25 bg-cyan-400/10 px-2 py-1 text-xs text-cyan-100">{formatSectorStage(sector.stage)}</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-cyan-300" style={{ width: `${Math.min(100, Math.max(8, sector.score ?? 0))}%` }} />
            </div>
          </div>
        ))}
        {!sectors.length ? <p className="text-sm text-slate-400">暂无主线数据。</p> : null}
      </div>
    </Panel>
  );
}

export function FundsAndRiskPanel({ report, reports, settings, dataWarnings }: { report: AnalysisReport | null; reports: ReportSummary[]; settings: AppSettings | null; dataWarnings: string[] }) {
  const risks = report?.ruleResult.market.riskFlags ?? [];
  const warningGroups = groupCockpitDataWarnings(classifyCockpitDataWarnings(dataWarnings));
  const modelStatus = report ? formatLlmStatus(report.llmStatus) : settings?.modelAuditEnabled ? "等待报告" : "模型关闭";
  return (
    <Panel
      title="资金与风险"
      icon={Database}
      action={<span className="text-xs text-slate-500">资金语境 / 数据健康</span>}
      collapsible
      defaultOpen={false}
      testId="funds-risk-panel"
      summary={
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricTile label="数据警告" value={`${dataWarnings.length} 条`} tone={dataWarnings.length ? "warn" : "up"} compact />
          <MetricTile label="报告数量" value={`${reports.length} 份`} compact />
          <MetricTile label="模型状态" value={modelStatus} tone={llmStatusTone(report?.llmStatus)} compact />
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricTile label="数据警告" value={`${dataWarnings.length} 条`} tone={dataWarnings.length ? "warn" : "up"} compact />
        <MetricTile label="报告数量" value={`${reports.length} 份`} compact />
        <MetricTile label="模型状态" value={modelStatus} tone={llmStatusTone(report?.llmStatus)} compact />
      </div>
      <div className="mt-4">
        <DataHealthStrip groups={warningGroups} warnings={dataWarnings} traces={report?.factPackage.dataSource.traces ?? []} />
      </div>
      <div className="mt-4">
        <ModelQualityStrip report={report} settings={settings} />
      </div>
      <div className="mt-4 space-y-2">
        {(risks.length ? risks : ["暂无新增风险提示。"]).slice(0, 4).map((risk, index) => (
          <p key={`${risk}-${index}`} className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100">{risk}</p>
        ))}
      </div>
    </Panel>
  );
}

export function SectorSummary({ sectors }: { sectors: AnalysisReport["factPackage"]["sectors"] }) {
  const top = sectors.slice(0, 3);
  if (!top.length) return <p className="text-sm text-slate-400">暂无主线数据。</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {top.map((sector) => (
        <span key={`${sector.name}-${sector.normalizedName ?? ""}-summary`} className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-100">
          <span className="font-medium">{sector.name}</span>
          <span className="text-slate-400">{formatSectorStage(sector.stage)}</span>
          <span className="text-slate-500">{sector.score ?? 0}</span>
        </span>
      ))}
    </div>
  );
}

export function StrategyMapPanel() {
  return (
    <Panel title="策略扩展地图" icon={Activity} action={<span className="text-xs text-slate-500">模块化扩展</span>} collapsible defaultOpen={false}>
      <div className="grid gap-3 md:grid-cols-2">
        <StrategyCard title="主线趋势" status="运行中" body="当前主策略，保留完整证据链和风控边界。" />
        <StrategyCard title="连板接力" status="规划中" body="独立接入涨停池、连板梯队和情绪周期。" />
        <StrategyCard title="小盘策略" status="规划中" body="独立处理市值、流动性和量价异动。" />
        <StrategyCard title="个股追踪" status="待开发" body="模拟买入后生成跟踪计划和预警。" />
      </div>
    </Panel>
  );
}
