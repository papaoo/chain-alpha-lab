import type { ChartKLineData } from "@/components/StockKLineHoverTypes";
import { finiteNumber } from "@/components/StockKLineData";

export function buildLevels(data: ChartKLineData[], ma20DistancePct?: number | null) {
  const last = data[data.length - 1];
  const recent = data.slice(-30);
  const support = Math.min(...recent.map((item) => item.low));
  const resistance = Math.max(...recent.map((item) => item.high));
  const ma20 = finiteNumber(ma20DistancePct) !== undefined && ma20DistancePct !== 0
    ? last.close / (1 + Number(ma20DistancePct) / 100)
    : data.slice(-20).reduce((sum, item) => sum + item.close, 0) / Math.min(20, data.length);
  return { support, resistance, ma20 };
}

export function SideMetric({ label, value, tone }: { label: string; value: string; tone: "up" | "down" | "warn" | "info" }) {
  const color = tone === "up" ? "text-rose-200" : tone === "down" ? "text-emerald-200" : tone === "warn" ? "text-amber-200" : "text-cyan-100";
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/65 px-2.5 py-2">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={`mt-1 truncate font-mono text-sm font-semibold ${color}`}>{value}</p>
    </div>
  );
}

export function formatPrice(value?: number | null) {
  const parsed = finiteNumber(value);
  return parsed === undefined ? "--" : parsed.toFixed(2);
}

export function formatPct(value?: number | null) {
  const parsed = finiteNumber(value);
  if (parsed === undefined) return "--";
  return `${parsed >= 0 ? "+" : ""}${parsed.toFixed(2)}%`;
}
