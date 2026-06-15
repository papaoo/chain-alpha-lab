import { NextResponse } from "next/server";
import { getDataSourceSettings } from "@/lib/db/settings";
import type { DataProviderId } from "@/lib/types";

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const body = await request.json().catch(() => ({}));
    const providerId = sanitizeProviderId(body.providerId);
    if (providerId !== "tushare") {
      return NextResponse.json({
        success: true,
        data: {
          ok: true,
          providerId,
          elapsedMs: Date.now() - startedAt,
          message: "该数据源当前无需密钥测试，系统会在分析时按字段留痕。"
        },
        error: null
      });
    }

    const saved = getDataSourceSettings().providers.find((provider) => provider.id === "tushare");
    const token = sanitizeString(body.apiKey) || saved?.apiKey || "";
    if (!token) throw new Error("Tushare token 为空");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch("https://api.tushare.pro", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          api_name: "stock_basic",
          token,
          params: {
            exchange: "",
            list_status: "L"
          },
          fields: "ts_code,symbol,name,area,industry,list_date"
        }),
        signal: controller.signal
      });
      const text = await response.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      if (!response.ok) throw new Error(`Tushare HTTP ${response.status}`);
      if (json?.code !== 0) throw new Error(json?.msg || "Tushare 返回非成功状态");
      const count = Array.isArray(json?.data?.items) ? json.data.items.length : 0;
      return NextResponse.json({
        success: true,
        data: {
          ok: true,
          providerId,
          elapsedMs: Date.now() - startedAt,
          recordCount: count,
          message: count ? "Tushare 连接测试成功" : "Tushare 已连通，但测试接口返回空数据"
        },
        error: null
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    return NextResponse.json({
      success: false,
      data: {
        ok: false,
        elapsedMs: Date.now() - startedAt
      },
      error: {
        code: "DATA_SOURCE_CONNECTION_TEST_FAILED",
        message: error instanceof Error ? error.message : String(error)
      }
    }, { status: 200 });
  }
}

function sanitizeProviderId(value: unknown): DataProviderId {
  return value === "tencent_zixuangu" ||
    value === "eastmoney_public" ||
    value === "tushare" ||
    value === "local_cache" ||
    value === "rule_engine"
    ? value
    : "tushare";
}

function sanitizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
