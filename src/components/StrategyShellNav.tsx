"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  BellRing,
  BrainCircuit,
  Building2,
  ChevronDown,
  Clipboard,
  Database,
  FileClock,
  FileText,
  Flame,
  Gauge,
  GitBranch,
  Globe2,
  Landmark,
  LineChart,
  LockKeyhole,
  Radar,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  UserCog,
  Users,
  WalletCards,
  Zap
} from "lucide-react";
import { fetchApiJson } from "@/lib/client/api";
import type { AnalysisReport, AppSettings } from "@/lib/types";

export type StrategyWorkspaceView =
  | "overview"
  | "premarket"
  | "mainline"
  | "selection"
  | "serenity"
  | "limitBoard"
  | "smallCap"
  | "tracking"
  | "portfolio"
  | "risk"
  | "audit"
  | "analysis"
  | "settings"
  | "users"
  | "roles"
  | "operationLog";

type NavTarget = {
  view?: StrategyWorkspaceView;
  anchor?: string;
};

type NavItem = {
  id: string;
  label: string;
  meta?: string;
  icon: typeof Gauge;
  href?: string;
  target?: NavTarget;
  badge?: string;
};

type NavGroup = {
  id: string;
  title: string;
  icon: typeof Gauge;
  defaultOpen?: boolean;
  items: NavItem[];
};

export function StrategyShellNav({
  report,
  reportSummary,
  settings,
  currentView,
  onNavigate
}: {
  report: AnalysisReport | null;
  reportSummary?: Pick<AnalysisReport, "llmStatus" | "reportStatus" | "createdAt"> | null;
  settings: AppSettings | null;
  currentView?: StrategyWorkspaceView;
  onNavigate?: (target: NavTarget) => void;
}) {
  const pathname = usePathname();
  const latestLlmStatus = report?.llmStatus ?? reportSummary?.llmStatus;
  const [riskBadge, setRiskBadge] = useState("试运行");
  const groups = useMemo(() => buildNavGroups(riskBadge), [riskBadge]);
  const activeGroupIds = useMemo(
    () =>
      new Set(
        groups
          .filter((group) => group.items.some((item) => isItemActive(item, pathname, currentView)))
          .map((group) => group.id)
      ),
    [groups, pathname, currentView]
  );
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map((group) => [group.id, group.defaultOpen ?? true]))
  );

  useEffect(() => {
    let alive = true;
    fetchApiJson<{ summary?: { high?: number; medium?: number; stale?: boolean } }>("/api/risk/warnings", { cache: "no-store" })
      .then((json) => {
        if (!alive) return;
        const summary = json.data?.summary;
        if (!summary) return;
        if ((summary.high ?? 0) > 0) setRiskBadge(`高 ${summary.high}`);
        else if ((summary.medium ?? 0) > 0) setRiskBadge(`中 ${summary.medium}`);
        else if (summary.stale) setRiskBadge("过期");
        else setRiskBadge("正常");
      })
      .catch(() => {
        if (alive) setRiskBadge("待查");
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <aside className="border-b border-slate-800/80 bg-slate-950/88 px-4 py-4 backdrop-blur-xl xl:sticky xl:top-0 xl:h-[100dvh] xl:border-b-0 xl:border-r">
      <div className="flex h-full flex-col gap-5">
        <a className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.06] p-4 transition hover:border-cyan-300/40" href="/">
          <div className="flex items-center gap-3">
            <div className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-300/35 bg-slate-950 text-cyan-200">
              <Activity size={21} />
              <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-rose-400 shadow-[0_0_18px_rgba(251,113,133,0.9)]" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-slate-100">A 股投研驾驶舱</h1>
              <p className="mt-1 text-xs text-slate-400">规则边界 + 模型研判</p>
            </div>
          </div>
        </a>

        <nav className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 scrollbar-thin" aria-label="主导航">
          {groups.map((group) => {
            const open = openGroups[group.id] ?? false;
            const GroupIcon = group.icon;
            return (
              <div key={group.id} className="rounded-2xl border border-slate-800/80 bg-slate-900/45 p-2">
                <button
                  className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2 text-left text-xs text-slate-400 transition hover:bg-white/[0.035] hover:text-slate-100"
                  type="button"
                  onClick={() => setOpenGroups((value) => ({ ...value, [group.id]: !open }))}
                >
                  <span className="flex items-center gap-2">
                    <GroupIcon className={activeGroupIds.has(group.id) ? "text-cyan-200" : ""} size={15} />
                    <span className="font-medium tracking-[0.16em]">{group.title}</span>
                  </span>
                  <ChevronDown className={`transition-transform ${open ? "rotate-180" : ""}`} size={16} />
                </button>
                {open ? (
                  <div className="mt-1 grid gap-1">
                    {group.items.map((item) => (
                      <StrategyNavItem key={item.id} item={item} active={isItemActive(item, pathname, currentView)} onNavigate={onNavigate} />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/62 p-4 text-xs">
          <InfoRow label="模型服务" value={settings?.enabled ? "已启用" : "未启用"} />
          <div className="mt-2">
            <InfoRow label="最新报告" value={latestLlmStatus ? formatLlmStatus(latestLlmStatus) : "暂无"} />
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
            <div className="signal-sweep h-full w-2/3 rounded-full bg-cyan-300" />
          </div>
        </div>
      </div>
    </aside>
  );
}

function StrategyNavItem({
  item,
  active,
  onNavigate
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: (target: NavTarget) => void;
}) {
  const Icon = item.icon;
  const className = `flex items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm transition ${
    active
      ? "border-cyan-400/45 bg-cyan-400/10 text-cyan-100 shadow-[0_0_22px_rgba(56,189,248,0.08)]"
      : "border-transparent bg-transparent text-slate-400 hover:border-cyan-400/25 hover:bg-slate-950/52 hover:text-slate-100"
  }`;
  const content = (
    <>
      <span className="flex min-w-0 items-center gap-2.5">
        <Icon className="shrink-0" size={16} />
        <span className="min-w-0">
          <span className="block truncate font-medium">{item.label}</span>
          {item.meta ? <span className="mt-0.5 block truncate text-[11px] text-slate-500">{item.meta}</span> : null}
        </span>
      </span>
      {item.badge ? <span className="shrink-0 rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-500">{item.badge}</span> : null}
    </>
  );

  if (onNavigate && item.target) {
    return (
      <button className={className} type="button" onClick={() => onNavigate(item.target ?? {})}>
        {content}
      </button>
    );
  }

  return (
    <a className={className} href={item.href ?? buildMainlineHref(item.target)}>
      {content}
    </a>
  );
}

function buildNavGroups(riskBadge = "试运行"): NavGroup[] {
  return [
    {
      id: "workspace",
      title: "工作台",
      icon: Gauge,
      defaultOpen: true,
      items: [
        { id: "home", label: "首页驾驶舱", meta: "新版宏观总览", icon: Gauge, href: "/", badge: "新版" },
        { id: "overview", label: "策略工作台", meta: "模块地图 / 开发边界", icon: ShieldCheck, target: { view: "overview" } }
      ]
    },
    {
      id: "research",
      title: "市场研究",
      icon: Landmark,
      defaultOpen: true,
      items: [
        { id: "mainline-workbench", label: "主线趋势", meta: "大盘 -> 主线 -> 强股", icon: TrendingUp, target: { view: "mainline" } },
        { id: "premarket-scout", label: "盘前侦察", meta: "外围 / 日历 / 开盘预案", icon: Globe2, target: { view: "premarket" } },
        { id: "market-gate", label: "大盘闸门", meta: "规则 1", icon: Gauge, target: { view: "mainline", anchor: "market-gate" } },
        { id: "stage-flow", label: "主线阶段", meta: "规则 2", icon: GitBranch, target: { view: "mainline", anchor: "mainline-stages" } },
        { id: "candidate-signal", label: "候选强股", meta: "规则 3 / 5", icon: BarChart3, target: { view: "mainline", anchor: "candidate-signals" } },
        { id: "company-card", label: "公司认知", meta: "规则 4", icon: Building2, target: { view: "mainline", anchor: "company-card" } },
        { id: "report-history", label: "历史研报", meta: "事实包留痕", icon: FileText, target: { view: "analysis" } }
      ]
    },
    {
      id: "strategy",
      title: "策略工具",
      icon: Target,
      defaultOpen: true,
      items: [
        { id: "selection", label: "策略选股", meta: "六策略 / 规则精选", icon: Target, target: { view: "selection" }, badge: "规则" },
        { id: "serenity", label: "瓶颈研究", meta: "产业链卡点 / 证据链", icon: Sparkles, target: { view: "serenity" }, badge: "新" },
        { id: "tracking", label: "个股追踪", meta: "模拟买入 / AI 盯盘", icon: Radar, target: { view: "tracking" }, badge: "核心" },
        { id: "portfolio", label: "模拟持仓", meta: "仓位 / 盈亏 / 复盘", icon: WalletCards, target: { view: "portfolio" }, badge: "规划" },
        { id: "risk", label: "风险预警", meta: "失效条件 / 追踪", icon: BellRing, target: { view: "risk" }, badge: riskBadge },
        { id: "limit-board", label: "连板接力", meta: "情绪周期 / 梯队", icon: Flame, target: { view: "limitBoard" }, badge: "后续" },
        { id: "small-cap", label: "小盘强势", meta: "量价异动 / 流动性", icon: Zap, target: { view: "smallCap" }, badge: "后续" }
      ]
    },
    {
      id: "access",
      title: "账户权限",
      icon: Users,
      defaultOpen: false,
      items: [
        { id: "users", label: "用户管理", meta: "用户资料 / 风险偏好", icon: Users, target: { view: "users" }, badge: "预留" },
        { id: "roles", label: "角色权限", meta: "管理员 / 普通用户", icon: LockKeyhole, target: { view: "roles" }, badge: "预留" },
        { id: "operation-log", label: "操作留痕", meta: "配置 / 分析 / 追踪", icon: FileClock, target: { view: "operationLog" }, badge: "预留" }
      ]
    },
    {
      id: "system",
      title: "系统管理",
      icon: Settings,
      defaultOpen: true,
      items: [
        { id: "audit", label: "系统反馈", meta: "模型审查建议", icon: Clipboard, target: { view: "audit" } },
        { id: "settings", label: "配置中心", meta: "模型 / 数据源 / 定时", icon: Settings, target: { view: "settings" } },
        { id: "data-source", label: "数据源状态", meta: "Tushare / 东方财富", icon: Database, target: { view: "mainline", anchor: "data-source-status" } },
        { id: "model-quality", label: "模型质量", meta: "token / 耗时 / 重试", icon: BrainCircuit, target: { view: "mainline", anchor: "model-quality" } }
      ]
    }
  ];
}

function buildMainlineHref(target?: NavTarget) {
  if (!target?.view) return "/mainline";
  const params = new URLSearchParams({ view: target.view });
  if (target.anchor) params.set("anchor", target.anchor);
  return `/mainline?${params.toString()}`;
}

function isItemActive(item: NavItem, pathname: string | null, currentView?: StrategyWorkspaceView) {
  if (item.href === "/" && pathname === "/") return true;
  if (currentView && item.target?.view === currentView && !item.target.anchor) return true;
  if (!currentView && item.href && item.href !== "/" && pathname === item.href) return true;
  return false;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/58 px-3 py-2">
      <span className="text-slate-500">{label}</span>
      <span className="text-right text-slate-200">{value}</span>
    </div>
  );
}

function formatLlmStatus(status: AnalysisReport["llmStatus"]) {
  if (status === "success") return "模型已生成";
  if (status === "failed") return "模型失败";
  if (status === "rejected") return "模型被拒绝";
  return "等待模型";
}
