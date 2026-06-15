"use client";

import { Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { toolbarButtonClass } from "@/components/StrategyCockpitPrimitives";

export function MarketCognitionStateBanner({
  status,
  error,
  onRefresh
}: {
  status: "loading" | "ready" | "failed" | "refreshing";
  error: string;
  onRefresh: () => void;
}) {
  const loading = status === "loading";
  const refreshing = status === "refreshing";
  return (
    <div className={`mb-4 flex flex-col gap-3 rounded-2xl border p-4 md:flex-row md:items-center md:justify-between ${loading || refreshing ? "border-cyan-400/20 bg-cyan-400/10 text-cyan-100" : "border-amber-400/25 bg-amber-400/10 text-amber-100"}`}>
      <div className="flex items-start gap-3">
        {loading || refreshing ? <Loader2 size={18} className="mt-0.5 animate-spin" /> : <ShieldCheck size={18} className="mt-0.5" />}
        <div>
          <p className="text-sm font-semibold">{refreshing ? "正在刷新市场认知快照" : loading ? "正在读取真实行情与板块结构" : "市场认知数据暂不可用"}</p>
          <p className="mt-1 text-xs leading-5 opacity-80">
            {refreshing
              ? "当前仍展示上一轮成功快照；新数据返回后会无缝替换，避免刷新期间整块变空。"
              : loading
                ? "系统正在请求全 A 宽度、涨跌停池和板块资金数据。读取完成前不展示伪造结论。"
                : error || "数据源异常时只做降级提示，不用空值生成有效计划。"}
          </p>
        </div>
      </div>
      {!loading && !refreshing ? (
        <button type="button" className={toolbarButtonClass} onClick={onRefresh}>
          <RefreshCw size={14} />
          重试
        </button>
      ) : null}
    </div>
  );
}
