"use client";

import type { SelectionStrategyDefinition } from "@/lib/selection/types";

type SelectionParameter = SelectionStrategyDefinition["parameters"][number];

export function StrategyParameterGrid({
  parameters,
  values,
  onChange
}: {
  parameters: SelectionParameter[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {parameters.map((param) => (
        <ParameterControl
          key={param.key}
          param={param}
          value={values[param.key] ?? param.defaultValue}
          onChange={(value) => onChange(param.key, value)}
        />
      ))}
    </div>
  );
}

function ParameterControl({ param, value, onChange }: { param: SelectionParameter; value: unknown; onChange: (value: unknown) => void }) {
  return (
    <div className="rounded-lg border border-line bg-bg/50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{param.label}</p>
          <p className="mt-1 text-xs leading-5 text-muted">{param.description}</p>
        </div>
        {param.unit ? <span className="rounded border border-line px-1.5 py-0.5 text-[10px] text-muted">{param.unit}</span> : null}
      </div>
      <div className="mt-3">
        {param.type === "boolean" ? (
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-panel/70 px-3 py-2 text-sm">
            <input
              className="h-4 w-4 accent-cyan-400"
              type="checkbox"
              checked={Boolean(value)}
              onChange={(event) => onChange(event.target.checked)}
            />
            {value ? "开启" : "关闭"}
          </label>
        ) : param.type === "select" ? (
          <select
            className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-info"
            value={String(value ?? "")}
            onChange={(event) => {
              const option = param.options?.find((item) => String(item.value) === event.target.value);
              onChange(option ? option.value : event.target.value);
            }}
          >
            {param.options?.map((option) => (
              <option key={String(option.value)} value={String(option.value)}>
                {option.label}
              </option>
            ))}
          </select>
        ) : param.type === "range" ? (
          <div className="grid grid-cols-2 gap-2">
            <NumberInput value={Array.isArray(value) ? value[0] : null} min={param.min} max={param.max} onChange={(next) => onChange([next, Array.isArray(value) ? value[1] : null])} />
            <NumberInput value={Array.isArray(value) ? value[1] : null} min={param.min} max={param.max} onChange={(next) => onChange([Array.isArray(value) ? value[0] : null, next])} />
          </div>
        ) : (
          <NumberInput value={value} min={param.min} max={param.max} onChange={onChange} />
        )}
      </div>
      <p className="mt-2 font-mono text-xs text-info">当前：{formatParameterValue(value, param.unit)}</p>
    </div>
  );
}

function NumberInput({ value, min, max, onChange }: { value: unknown; min?: number; max?: number; onChange: (value: number | null) => void }) {
  return (
    <input
      className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-info"
      type="number"
      min={min}
      max={max}
      value={value === null || value === undefined ? "" : Number(value)}
      onChange={(event) => {
        const next = event.target.value === "" ? null : Number(event.target.value);
        onChange(Number.isFinite(next) ? next : null);
      }}
    />
  );
}

function formatParameterValue(value: unknown, unit?: string) {
  if (Array.isArray(value)) return `${value[0] ?? "不限"} - ${value[1] ?? "不限"}${unit ?? ""}`;
  if (typeof value === "boolean") return value ? "开启" : "关闭";
  if (value === "strategy_default") return "按策略默认";
  if (value === null) return "不限";
  return `${value}${unit ?? ""}`;
}
