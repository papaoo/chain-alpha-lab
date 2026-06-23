import { NextResponse } from "next/server";
import { buildSerenityCandidatePreview } from "@/lib/serenity/candidateBuilder";
import { enrichSerenityCandidatesWithEvidence } from "@/lib/serenity/evidenceCollector";
import { buildSerenityThemePreview } from "@/lib/serenity/themes";
import type { SerenityMarket } from "@/lib/serenity/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as {
      theme?: string;
      market?: SerenityMarket;
      timeWindow?: string;
    };
    const theme = body.theme?.trim();
    if (!theme) throw new Error("请先输入研究主题");
    const base = buildSerenityThemePreview({
      theme,
      market: normalizeMarket(body.market),
      timeWindow: body.timeWindow
    });
    const candidateBuild = await buildSerenityCandidatePreview({
      theme,
      market: base.market,
      normalizedTheme: base.normalizedTheme,
      limit: 24
    });
    const enriched = await enrichSerenityCandidatesWithEvidence(candidateBuild.candidates, {
      theme,
      limit: 12
    });
    const data = buildSerenityThemePreview({
      theme,
      market: base.market,
      timeWindow: body.timeWindow,
      candidatePreview: enriched.candidates,
      extraWarnings: [...candidateBuild.warnings, ...enriched.warnings]
    });
    return NextResponse.json({ success: true, data, error: null });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: {
          code: "SERENITY_PREVIEW_FAILED",
          message: error instanceof Error ? error.message : "瓶颈研究预览失败"
        }
      },
      { status: 400 }
    );
  }
}

function normalizeMarket(value: SerenityMarket | undefined): SerenityMarket {
  if (value === "A-share" || value === "HK" || value === "US" || value === "global") return value;
  return "A-share";
}
