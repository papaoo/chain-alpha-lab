import { NextResponse } from "next/server";
import { getAccessControlPlan } from "@/lib/access/roles";

export async function GET() {
  return NextResponse.json({ success: true, data: getAccessControlPlan(), error: null });
}
