"use client";

import type { ElementType, ReactNode } from "react";
import {
  BrainCircuit,
  Flame,
  Globe2,
  Loader2,
  Network,
  Play,
  Radar,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Zap
} from "lucide-react";
import type { StrategyWorkspaceView } from "@/components/StrategyShellNav";
import type { AnalysisReport, AppSettings } from "@/lib/types";

export function ResearchTopCommandBar({
  view,
  report,
  runAnalysis,
  loading
}: {
  view: StrategyWorkspaceView;
  report: AnalysisReport | null;
  runAnalysis: () => void;
  loading: boolean;
}) {
  const title = viewTitle(view);
  const marketTone =
    report?.ruleResult.market.marketState === "tradable"
      ? "up"
      : report?.ruleResult.market.marketState === "cautious"
        ? "warn"
        : "info";

  return (
    <header className="sticky top-0 z-30 rounded-lg border border-line/80 bg-bg/88 p-3 shadow-[0_20px_80px_rgba(0,0,0,0.22)] backdrop-blur-xl">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>策略操作系统</span>
            <span className="text-line">/</span>
            <span className="text-info">{title}</span>
          </div>
          <h2 className="mt-1 text-xl font-semibold">{title}</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <OverviewStatusPill
            icon={ShieldCheck}
            label={report ? formatMarketState(report.ruleResult.market.marketState) : "等待报告"}
            tone={marketTone}
          />
          <OverviewStatusPill
            icon={BrainCircuit}
            label={report ? formatLlmStatus(report.llmStatus) : "模型待命"}
            tone={report?.llmStatus === "success" ? "up" : "info"}
          />
          <button
            className="flex items-center gap-2 rounded-lg border border-up/40 bg-up/10 px-3 py-2 text-sm text-up disabled:opacity-60"
            type="button"
            onClick={runAnalysis}
            disabled={loading}
          >
            {loading ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />}
            运行今日分析
          </button>
        </div>
      </div>
    </header>
  );
}

export function StrategyOverview({
  report,
  settings,
  setView
}: {
  report: AnalysisReport | null;
  settings: AppSettings | null;
  setView: (view: StrategyWorkspaceView) => void;
}) {
  const sectors = report?.factPackage.sectors ?? [];
  const candidates = report?.factPackage.candidates ?? [];

  return (
    <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
      <div className="rounded-lg border border-info/20 bg-[linear-gradient(135deg,rgba(56,189,248,0.12),rgba(15,23,42,0.72)_44%,rgba(239,68,68,0.08))] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.28)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs tracking-[0.18em] text-info">市场指挥台</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight">策略矩阵总览</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
              当前版本以“主线趋势”为主策略，先完成大盘闸门、主线阶段、候选强股过滤、公司认知和模型研判闭环。策略选股、个股追踪、模拟持仓、连板接力和小盘强势会作为独立模块接入，避免不同玩法互相污染判断。
            </p>
          </div>
          <button
            className="flex w-fit items-center gap-2 rounded-lg border border-info/40 bg-info/10 px-4 py-2 text-sm text-info"
            type="button"
            onClick={() => setView("mainline")}
          >
            <TrendingUp size={16} />
            进入主线趋势
          </button>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <OverviewMetric label="大盘闸门" value={report ? formatMarketState(report.ruleResult.market.marketState) : "待分析"} />
          <OverviewMetric label="主线数量" value={`${sectors.length} 条`} />
          <OverviewMetric label="候选股票" value={`${candidates.length} 只`} />
          <OverviewMetric label="模型配置" value={settings?.enabled ? "已启用" : "未启用"} />
        </div>
      </div>

      <OverviewPanel>
        <OverviewSectionTitle icon={Network} title="策略模块地图" meta="每个策略独立规则、独立记忆、独立研报" />
        <div className="mt-5 grid gap-3">
          <StrategyMapItem
            icon={Globe2}
            title="盘前侦察"
            status="运行中"
            body="整合外围指数、港股/A50期指、美元汇率和中美投资日历，先给出开盘前风险温度与观察清单，再决定是否进入主线试错。"
            tone="warn"
          />
          <StrategyMapItem
            icon={TrendingUp}
            title="主线趋势"
            status="运行中"
            body="先看大盘，再看主线，再看强股，再看公司认知；当前重点打磨规则 1 到规则 5。"
            tone="up"
          />
          <StrategyMapItem
            icon={Target}
            title="策略选股"
            status="规划中"
            body="六大策略独立运行，规则先筛、Agent 再审、总评审只在候选池内精选。"
            tone="info"
          />
          <StrategyMapItem
            icon={Radar}
            title="个股追踪"
            status="核心后续"
            body="从主线候选或策略选股一键加入追踪，持续记录证据、盘面变化和失效条件。"
            tone="warn"
          />
          <StrategyMapItem
            icon={Flame}
            title="连板 / 小盘扩展"
            status="后续策略"
            body="连板接力、小盘强势、低风险收益等玩法使用独立候选池和风控边界。"
            tone="info"
          />
        </div>
      </OverviewPanel>

      <OverviewPanel className="xl:col-span-2">
        <OverviewSectionTitle icon={Sparkles} title="模型研报能力规划" meta="规则定边界，模型做结构化解释和执行条件" />
        <div className="mt-5 grid gap-3 lg:grid-cols-4">
          {[
            ["市场结构洞察", "解释指数、宽度、情绪、风格是否共振。"],
            ["主线竞争格局", "比较多条主线谁在扩散，谁在退潮。"],
            ["阶段迁移预案", "给出确认、分歧、退潮的触发条件。"],
            ["个股追踪清单", "把触发和失效条件写成可盯盘事项。"]
          ].map(([title, body]) => (
            <div key={title} className="rounded-lg border border-line bg-bg/55 p-3">
              <p className="font-medium">{title}</p>
              <p className="mt-2 text-xs leading-5 text-muted">{body}</p>
            </div>
          ))}
        </div>
      </OverviewPanel>
    </section>
  );
}

export function StrategyPlaceholder({
  icon: Icon,
  title,
  status,
  description,
  bullets = []
}: {
  icon: ElementType;
  title: string;
  status: string;
  description: string;
  bullets?: string[];
}) {
  return (
    <section className="grid gap-4 xl:grid-cols-[1fr_420px]">
      <div className="rounded-lg border border-line bg-panel/80 p-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-info/35 bg-info/10 text-info">
          <Icon size={26} />
        </div>
        <p className="mt-5 text-xs uppercase tracking-[0.24em] text-info">{status}</p>
        <h2 className="mt-2 text-3xl font-semibold">{title}</h2>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-muted">{description}</p>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <OverviewMiniStat label="规则引擎" value="独立设计" />
          <OverviewMiniStat label="数据契约" value="来源留痕" />
          <OverviewMiniStat label="模型研判" value="候选池内" />
        </div>
        {bullets.length ? (
          <div className="mt-6 grid gap-2 md:grid-cols-2">
            {bullets.map((item) => (
              <div key={item} className="rounded-lg border border-line bg-bg/55 px-3 py-2 text-sm text-muted">
                {item}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <OverviewPanel>
        <OverviewSectionTitle icon={Target} title="开发边界" meta="先搭入口，不混入主线规则" />
        <p className="mt-4 text-sm leading-6 text-muted">
          这个模块会有自己的事实包、策略状态、候选池、仓位上限、用户记忆和历史记录。这样后续扩展策略时，不会让不同交易玩法相互污染判断，也方便做权限、追踪和复盘。
        </p>
      </OverviewPanel>
    </section>
  );
}

function StrategyMapItem({
  icon: Icon,
  title,
  status,
  body,
  tone
}: {
  icon: ElementType;
  title: string;
  status: string;
  body: string;
  tone: "up" | "info" | "warn";
}) {
  const cls =
    tone === "up"
      ? "border-up/35 bg-up/10 text-up"
      : tone === "warn"
        ? "border-warn/35 bg-warn/10 text-warn"
        : "border-info/35 bg-info/10 text-info";

  return (
    <div className="rounded-lg border border-line bg-bg/55 p-3">
      <div className="flex items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${cls}`}>
          <Icon size={18} />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{title}</p>
            <span className={`rounded border px-2 py-0.5 text-[11px] ${cls}`}>{status}</span>
          </div>
          <p className="mt-2 text-xs leading-5 text-muted">{body}</p>
        </div>
      </div>
    </div>
  );
}

function OverviewStatusPill({ icon: Icon, label, tone }: { icon: ElementType; label: string; tone: "up" | "info" | "warn" }) {
  const cls =
    tone === "up"
      ? "border-up/35 bg-up/10 text-up"
      : tone === "warn"
        ? "border-warn/35 bg-warn/10 text-warn"
        : "border-info/35 bg-info/10 text-info";

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${cls}`}>
      <Icon size={14} />
      {label}
    </span>
  );
}

function OverviewPanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-line bg-panel/88 p-4 shadow-[0_20px_80px_rgba(0,0,0,0.22)] ${className}`}>{children}</div>;
}

function OverviewSectionTitle({ icon: Icon, title, meta }: { icon: ElementType; title: string; meta: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-bg/70 text-info">
        <Icon size={18} />
      </span>
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-1 text-xs text-muted">{meta}</p>
      </div>
    </div>
  );
}

function OverviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-bg/60 p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function OverviewMiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-bg/60 p-3">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function viewTitle(view: StrategyWorkspaceView) {
  const labels: Record<StrategyWorkspaceView, string> = {
    overview: "策略工作台",
    premarket: "盘前侦察",
    mainline: "主线趋势",
    selection: "策略选股",
    serenity: "瓶颈研究",
    limitBoard: "连板接力",
    smallCap: "小盘强势",
    tracking: "个股追踪",
    portfolio: "模拟持仓",
    risk: "风险预警",
    audit: "系统反馈",
    analysis: "历史研报",
    settings: "配置中心",
    users: "用户管理",
    roles: "角色权限",
    operationLog: "操作留痕"
  };
  return labels[view];
}

function formatMarketState(state: string) {
  if (state === "tradable") return "可交易";
  if (state === "cautious") return "谨慎交易";
  if (state === "defensive") return "防守观望";
  return state || "未知";
}

function formatLlmStatus(status: AnalysisReport["llmStatus"]) {
  const labels: Record<AnalysisReport["llmStatus"], string> = {
    disabled: "模型未启用",
    success: "模型成功",
    rejected: "模型输出被拒绝",
    failed: "模型失败"
  };
  return labels[status] ?? status;
}
