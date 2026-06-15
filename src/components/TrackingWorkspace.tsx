"use client";

import { useEffect, useState } from "react";
import { Plus, Radar, RefreshCw, ShieldAlert } from "lucide-react";
import type { StockTrackingItem } from "@/lib/db/stockTracking";

type ApiResponse<T> = { success: boolean; data: T | null; error: { code: string; message: string } | null };

export function TrackingWorkspace() {
  const [items, setItems] = useState<StockTrackingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ code: "", name: "", price: "", position: "0", thesis: "" });
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    loadItems();
  }, []);

  async function loadItems() {
    setLoading(true);
    try {
      const json = await fetchJson<StockTrackingItem[]>("/api/tracking/items?status=active");
      setItems(json.data ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  async function createItem() {
    if (!form.code.trim() || !form.name.trim()) {
      setMessage("请先填写股票代码和名称。");
      return;
    }
    setLoading(true);
    try {
      await fetchJson<{ id: string }>("/api/tracking/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: form.code.trim(),
          name: form.name.trim(),
          entryMode: Number(form.position) > 0 ? "simulated_buy" : "watch",
          simulatedPrice: Number(form.price) || undefined,
          simulatedPositionPct: Number(form.position) || 0,
          thesis: form.thesis.trim() || undefined
        })
      });
      setForm({ code: "", name: "", price: "", position: "0", thesis: "" });
      setMessage("已加入追踪。");
      await loadItems();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  async function refreshSnapshots() {
    setLoading(true);
    try {
      const json = await fetchJson<{ reportId: string | null; updated: number; message: string }>("/api/tracking/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({})
      });
      setMessage(json.data?.message ?? "追踪快照已刷新。");
      await loadItems();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="grid gap-4">
      <div className="overflow-hidden rounded-2xl border border-cyan-300/20 bg-slate-950/78 shadow-[0_24px_90px_rgba(2,6,23,0.34)]">
        <div className="relative p-5">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(34,211,238,0.18),transparent_36%),radial-gradient(circle_at_80%_0%,rgba(244,114,182,0.12),transparent_32%)]" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs tracking-[0.18em] text-cyan-200">STOCK TRACKING</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-normal text-slate-50">个股追踪与模拟买入</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                先记录你想盯的股票、模拟价格和仓位，再基于最新报告生成继续观察、持有、减仓、卖出等建议。当前版本只用规则快照，不额外调用大模型。
              </p>
            </div>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-300/35 bg-cyan-300/10 px-4 py-3 text-sm font-medium text-cyan-100 transition hover:bg-cyan-300/16 disabled:opacity-60"
              type="button"
              disabled={loading}
              onClick={refreshSnapshots}
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              刷新追踪快照
            </button>
          </div>
        </div>
      </div>

      {message ? <div className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-100">{message}</div> : null}

      <details className="rounded-2xl border border-slate-800 bg-slate-950/72 p-4" open={createOpen} onToggle={(event) => setCreateOpen(event.currentTarget.open)}>
        <summary className="cursor-pointer list-none">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Plus size={17} className="text-cyan-200" />
              <p className="font-medium text-slate-100">新建追踪</p>
            </div>
            <span className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-400">{createOpen ? "收起" : "展开"}</span>
          </div>
          {!createOpen ? <p className="mt-2 text-sm text-slate-500">添加模拟买入或观察票，刷新后生成持有、减仓、卖出等追踪建议。</p> : null}
        </summary>
        <div className="mt-4 grid gap-3 lg:grid-cols-4">
          <Input label="股票代码" value={form.code} onChange={(value) => setForm((old) => ({ ...old, code: value }))} placeholder="sh600000" />
          <Input label="股票名称" value={form.name} onChange={(value) => setForm((old) => ({ ...old, name: value }))} placeholder="浦发银行" />
          <Input label="模拟价格" value={form.price} onChange={(value) => setForm((old) => ({ ...old, price: value }))} placeholder="可空" />
          <Input label="模拟仓位%" value={form.position} onChange={(value) => setForm((old) => ({ ...old, position: value }))} placeholder="0" />
          <label className="grid gap-1.5 text-sm lg:col-span-3">
            <span className="text-slate-400">追踪理由</span>
            <textarea
              className="min-h-20 rounded-xl border border-slate-800 bg-slate-900/72 px-3 py-2 text-slate-100 outline-none transition focus:border-cyan-300/60"
              value={form.thesis}
              onChange={(event) => setForm((old) => ({ ...old, thesis: event.target.value }))}
              placeholder="为什么要盯它，等待什么条件验证"
            />
          </label>
          <button
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-300/35 bg-cyan-300/10 px-4 py-3 text-sm font-medium text-cyan-100 transition hover:bg-cyan-300/16 disabled:opacity-60 lg:self-end"
            type="button"
            disabled={loading}
            onClick={createItem}
          >
            <Plus size={16} />
            加入追踪
          </button>
        </div>
      </details>

      <div className="grid gap-3">
        {items.length ? items.map((item) => <TrackingCard key={item.id} item={item} />) : (
          <div className="rounded-2xl border border-slate-800 bg-slate-950/72 p-8 text-center text-slate-400">
            <Radar className="mx-auto text-cyan-200" size={28} />
            <p className="mt-3 text-sm">暂无活跃追踪股票。</p>
          </div>
        )}
      </div>
    </section>
  );
}

function TrackingCard({ item }: { item: StockTrackingItem }) {
  const snapshot = item.latestSnapshot;
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/72 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-slate-50">{item.name}</h3>
            <span className="font-mono text-xs text-slate-500">{item.code}</span>
            <span className="rounded border border-cyan-300/30 bg-cyan-300/10 px-2 py-0.5 text-[11px] text-cyan-100">{item.entryMode === "simulated_buy" ? "模拟买入" : "观察"}</span>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-400">{item.thesis}</p>
        </div>
        <div className="grid min-w-52 grid-cols-2 gap-2 text-xs">
          <Mini label="模拟价" value={item.simulatedPrice ? item.simulatedPrice.toFixed(2) : "--"} />
          <Mini label="模拟仓位" value={`${item.simulatedPositionPct}%`} />
        </div>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1.2fr]">
        <div className="rounded-xl border border-slate-800 bg-slate-900/58 p-3">
          <p className="text-xs text-slate-500">最新追踪建议</p>
          <p className="mt-2 text-xl font-semibold text-cyan-100">{snapshot?.recommendation ?? "待刷新"}</p>
          <p className="mt-2 text-xs leading-5 text-slate-400">{snapshot?.recommendationReason ?? "点击刷新追踪快照后生成建议。"}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Mini label="最新价" value={snapshot?.latestPrice ? snapshot.latestPrice.toFixed(2) : "--"} />
          <Mini label="涨跌幅" value={snapshot?.changePct !== undefined ? `${snapshot.changePct.toFixed(2)}%` : "--"} />
          <Mini label="趋势" value={snapshot?.trendState ?? "--"} />
          <Mini label="资金" value={snapshot?.fundFlowState ?? "--"} />
        </div>
      </div>
      <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/8 p-3 text-xs leading-5 text-amber-100/85">
        <div className="flex items-start gap-2">
          <ShieldAlert size={15} className="mt-0.5 shrink-0" />
          <p>失效条件：{item.invalidCondition}</p>
        </div>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-slate-400">{label}</span>
      <input
        className="rounded-xl border border-slate-800 bg-slate-900/72 px-3 py-2 text-slate-100 outline-none transition focus:border-cyan-300/60"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/58 px-3 py-2">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-slate-100">{value}</p>
    </div>
  );
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<ApiResponse<T>> {
  const response = await fetch(url, init);
  const json = (await response.json().catch(() => null)) as ApiResponse<T> | null;
  if (!response.ok || !json?.success) throw new Error(json?.error?.message ?? `请求失败：${url}`);
  return json;
}
