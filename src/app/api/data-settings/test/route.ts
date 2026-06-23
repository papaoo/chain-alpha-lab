import { NextResponse } from "next/server";
import { getDataSourceSettings } from "@/lib/db/settings";
import { testProviderCapabilities } from "@/lib/data/providerCapabilityAudit";
import type { DataProviderId } from "@/lib/types";

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const body = await request.json().catch(() => ({}));
    const providerId = sanitizeProviderId(body.providerId);
    const providerAudit = await testProviderCapabilities(providerId, {
      apiKey: sanitizeString(body.apiKey),
      enabled: true
    });

    if (providerId !== "tushare") {
      return NextResponse.json({
        success: true,
        data: {
          ok: true,
          providerId,
          elapsedMs: Date.now() - startedAt,
          message: providerAudit.summary,
          capabilityAudit: providerAudit
        },
        error: null
      });
    }

    const connectionOk = providerAudit.connected;
    const available = providerAudit.checks.filter((check) => check.status === "available" || check.status === "available_empty").length;
    const denied = providerAudit.checks.filter((check) => check.status === "permission_denied").length;
    const failed = providerAudit.checks.filter((check) => check.status === "failed").length;

    return NextResponse.json({
      success: connectionOk,
      data: {
        ok: connectionOk,
        providerId,
        elapsedMs: Date.now() - startedAt,
        recordCount: providerAudit.checks.find((check) => check.key === "tushare.stock_basic")?.recordCount,
        message: `${providerAudit.summary}；可用 ${available} 项，权限不足 ${denied} 项，失败 ${failed} 项。`,
        capabilityAudit: providerAudit
      },
      error: connectionOk ? null : {
        code: "DATA_SOURCE_CONNECTION_TEST_FAILED",
        message: providerAudit.summary
      }
    }, { status: 200 });
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
