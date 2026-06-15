import { NextResponse } from "next/server";
import { createDatabaseBackup, listDatabaseBackups } from "@/lib/db/backup";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 10);
  return NextResponse.json({
    success: true,
    data: listDatabaseBackups(Number.isFinite(limit) ? limit : 10),
    error: null
  });
}

export async function POST() {
  try {
    const data = await createDatabaseBackup();
    return NextResponse.json({ success: true, data, error: null });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: {
          code: "DATABASE_BACKUP_FAILED",
          message: error instanceof Error ? error.message : String(error)
        }
      },
      { status: 500 }
    );
  }
}
