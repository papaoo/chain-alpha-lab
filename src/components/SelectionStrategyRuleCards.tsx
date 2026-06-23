"use client";

import { CheckCircle2, ChevronDown, Network, Target } from "lucide-react";
import { cleanDisplayText } from "@/lib/display/text";
import type { SelectionStrategyDefinition } from "@/lib/selection/types";

type IconType = typeof CheckCircle2;

export function StrategyRuleExplainer({
  active,
  strategies
}: {
  active: SelectionStrategyDefinition;
  strategies: SelectionStrategyDefinition[];
}) {
  return (
    <div className="grid gap-4">
      <CollapsibleSection
        icon={CheckCircle2}
        title="Rule boundary and required data"
        meta={`${active.hardFilters.length} hard filters / ${active.requiredData.length} required data groups`}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <EvidencePanel icon={CheckCircle2} title="Hard filters">
            {active.hardFilters.map((item) => <EvidenceLine key={item} text={item} />)}
          </EvidencePanel>

          <EvidencePanel icon={Network} title="Required data">
            {active.requiredData.map((item) => <EvidenceLine key={item} text={item} />)}
          </EvidencePanel>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        icon={Target}
        title="Score factors"
        meta={`${active.scoreFactors.length} factors, all traceable in run detail`}
      >
        <div className="grid gap-3 md:grid-cols-2">
          {active.scoreFactors.map((factor) => <ScoreFactorCard key={factor.key} factor={factor} />)}
        </div>
      </CollapsibleSection>

      <AllStrategyRuleDeck strategies={strategies} activeId={active.id} />
    </div>
  );
}

export function CollapsibleSection({
  icon: Icon,
  title,
  meta,
  children
}: {
  icon: IconType;
  title: string;
  meta: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-lg border border-line bg-panel/84 p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-bg/70 text-info">
            <Icon size={18} />
          </span>
          <div className="min-w-0">
            <h3 className="font-semibold">{title}</h3>
            <p className="mt-1 truncate text-xs text-muted">{meta}</p>
          </div>
        </div>
        <ChevronDown className="shrink-0 text-muted transition group-open:rotate-180 group-open:text-info" size={18} />
      </summary>
      <div className="mt-4 border-t border-line pt-4">{children}</div>
    </details>
  );
}

function AllStrategyRuleDeck({
  strategies,
  activeId
}: {
  strategies: SelectionStrategyDefinition[];
  activeId: SelectionStrategyDefinition["id"];
}) {
  return (
    <CollapsibleSection
      icon={Network}
      title="All strategy rule deck"
      meta="Compare applicable scenes, hard constraints, and output focus."
    >
      <div className="grid gap-3 xl:grid-cols-2">
        {strategies.map((strategy) => (
          <article
            key={strategy.id}
            className={`rounded-lg border p-3 ${strategy.id === activeId ? "border-info/45 bg-info/10" : "border-line bg-bg/50"}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-slate-100">
                  {strategy.order.toString().padStart(2, "0")} / {safeText(strategy.name)}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted">{safeText(strategy.subtitle)}</p>
              </div>
              <span className="rounded border border-line px-1.5 py-0.5 text-[10px] text-muted">{strategy.defaultTimeRange}</span>
            </div>
            <p className="mt-3 line-clamp-2 text-xs leading-5 text-muted">{safeText(strategy.description)}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <MiniRuleStat label="Filters" value={`${strategy.hardFilters.length}`} />
              <MiniRuleStat label="Factors" value={`${strategy.scoreFactors.length}`} />
              <MiniRuleStat label="Data" value={`${strategy.requiredData.length}`} />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {strategy.outputFocus.slice(0, 4).map((item) => (
                <span key={item} className="rounded border border-line bg-panel/55 px-2 py-1 text-[11px] text-muted">
                  {safeText(item)}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </CollapsibleSection>
  );
}

function ScoreFactorCard({ factor }: { factor: SelectionStrategyDefinition["scoreFactors"][number] }) {
  return (
    <div className="rounded-lg border border-line bg-bg/50 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium">{safeText(factor.label)}</p>
        <span className="font-mono text-sm text-info">{factor.weight}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-info" style={{ width: `${Math.max(6, Math.min(100, factor.weight))}%` }} />
      </div>
      <p className="mt-2 text-xs leading-5 text-muted">{safeText(factor.description)}</p>
    </div>
  );
}

function EvidencePanel({ icon: Icon, title, children }: { icon: IconType; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-panel/84 p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-bg/70 text-info">
          <Icon size={18} />
        </span>
        <h3 className="font-semibold">{title}</h3>
      </div>
      <div className="mt-4 grid gap-2">{children}</div>
    </div>
  );
}

function EvidenceLine({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-line bg-bg/50 px-3 py-2 text-sm leading-5 text-muted">
      {safeText(text)}
    </div>
  );
}

function MiniRuleStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel/55 px-2 py-1.5 text-center">
      <p className="text-[10px] text-muted">{label}</p>
      <p className="mt-1 font-mono text-xs text-slate-200">{value}</p>
    </div>
  );
}

function safeText(value?: string | null) {
  return cleanDisplayText(value) ?? value ?? "";
}
