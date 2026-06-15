import { NextResponse } from "next/server";
import { getSelectionRun } from "@/lib/selection/runs";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = getSelectionRun(id);
  if (!data) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: { code: "SELECTION_RUN_NOT_FOUND", message: "未找到选股运行记录。" }
      },
      { status: 404 }
    );
  }
  return NextResponse.json({ success: true, data, error: null });
}
