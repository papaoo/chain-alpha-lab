import { NextResponse } from "next/server";
import { buildSerenityTagMap, DEFAULT_SERENITY_TAG_LOOKBACK } from "@/lib/serenity/tags";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const codes = (url.searchParams.get("codes") ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 100);
  const lookback = boundedInteger(url.searchParams.get("lookback"), DEFAULT_SERENITY_TAG_LOOKBACK, 1, 60);
  const tagMap = buildSerenityTagMap({ codes, lookback });
  return NextResponse.json(
    {
      success: true,
      data: Object.fromEntries(tagMap.entries()),
      error: null
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

function boundedInteger(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Math.trunc(Number(value ?? fallback));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
