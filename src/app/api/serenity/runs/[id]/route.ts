import { NextResponse } from "next/server";
import { getSerenityRun } from "@/lib/serenity/research";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = getSerenityRun(id);
  if (!run) {
    return NextResponse.json(
      { success: false, data: null, error: { code: "SERENITY_RUN_NOT_FOUND", message: "瓶颈研究记录不存在" } },
      { status: 404 }
    );
  }
  return NextResponse.json({ success: true, data: run, error: null });
}
