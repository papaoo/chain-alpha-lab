import { NextResponse } from "next/server";
import { importSerenityThemesFromLatestMainline } from "@/lib/serenity/importers/fromMainline";
import type { SerenityMarket } from "@/lib/serenity/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = boundedInteger(url.searchParams.get("limit"), 8, 1, 20);
  const market = normalizeMarket(url.searchParams.get("market"));
  const data = importSerenityThemesFromLatestMainline(limit, market);
  return NextResponse.json({ success: true, data, error: null });
}

function normalizeMarket(value: string | null): SerenityMarket {
  if (value === "A-share" || value === "HK" || value === "US" || value === "global") return value;
  return "A-share";
}

function boundedInteger(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Math.trunc(Number(value ?? fallback));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
