import { NextResponse } from "next/server";
import { listSelectionStrategies } from "@/lib/selection/strategies";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ success: true, data: listSelectionStrategies(), error: null });
}
