import { NextResponse } from "next/server";
import { buildRiskWarningNotificationMessage, sendRiskWarningNotification } from "@/lib/notifications/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const minLevel = parseLevel(url.searchParams.get("minLevel"));
    const itemLimit = boundedInteger(url.searchParams.get("itemLimit"), 6, 1, 12);
    const send = url.searchParams.get("send") === "1" || url.searchParams.get("send") === "true";
    const preview = buildRiskWarningNotificationMessage({ minLevel, itemLimit });
    const deliveries = send && preview.shouldSend
      ? await sendRiskWarningNotification({ minLevel, itemLimit })
      : [];

    return NextResponse.json(
      {
        success: true,
        data: {
          dryRun: !send,
          preview,
          deliveries
        },
        error: null
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: {
          code: "RISK_NOTIFICATION_FAILED",
          message: error instanceof Error ? error.message : "风险预警通知生成失败"
        }
      },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}

function parseLevel(value: string | null): "high" | "medium" | "low" | undefined {
  if (value === "high" || value === "medium" || value === "low") return value;
  return undefined;
}

function boundedInteger(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Math.trunc(Number(value ?? fallback));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
