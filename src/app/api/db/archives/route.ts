import { NextResponse } from "next/server";
import { exportDatabaseArchive, listDatabaseArchives } from "@/lib/db/archive";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 10);
  return NextResponse.json({
    success: true,
    data: listDatabaseArchives(Number.isFinite(limit) ? limit : 10),
    error: null
  });
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const dryRun = url.searchParams.get("dryRun") === "1";
    const data = exportDatabaseArchive({ dryRun });
    return NextResponse.json({ success: true, data, error: null });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: {
          code: "DATABASE_ARCHIVE_FAILED",
          message: error instanceof Error ? error.message : String(error)
        }
      },
      { status: 500 }
    );
  }
}
