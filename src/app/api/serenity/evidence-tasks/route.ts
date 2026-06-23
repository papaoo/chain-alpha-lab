import { NextResponse } from "next/server";
import { listSerenityEvidenceTasks } from "@/lib/serenity/evidenceTasks";
import type { SerenityEvidenceNeed } from "@/lib/serenity/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const priority = parsePriority(url.searchParams.get("priority"));
    const canAutomate = parseBoolean(url.searchParams.get("canAutomate"));
    const data = listSerenityEvidenceTasks({
      runId: url.searchParams.get("runId")?.trim() || undefined,
      limit: boundedInteger(url.searchParams.get("limit"), 8, 1, 50),
      priority,
      canAutomate
    });

    return NextResponse.json(
      { success: true, data, error: null },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: {
          code: "SERENITY_EVIDENCE_TASKS_FAILED",
          message: error instanceof Error ? error.message : "瓶颈研究证据任务读取失败"
        }
      },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}

function parsePriority(value: string | null): SerenityEvidenceNeed["priority"] | undefined {
  if (value === "high" || value === "medium" || value === "low") return value;
  return undefined;
}

function parseBoolean(value: string | null) {
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return undefined;
}

function boundedInteger(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Math.trunc(Number(value ?? fallback));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
