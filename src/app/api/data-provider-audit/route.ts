import { NextResponse } from "next/server";
import { buildProviderDecouplingAudit } from "@/lib/data/providerDecouplingAudit";
import { buildProviderCapabilityAudit } from "@/lib/data/providerCapabilityAudit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const force = url.searchParams.get("force") === "1";
    const [decoupling, capabilities] = await Promise.all([
      buildProviderDecouplingAudit(),
      buildProviderCapabilityAudit({ force })
    ]);
    return NextResponse.json({ success: true, data: { ...decoupling, capabilities }, error: null });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: {
          code: "DATA_PROVIDER_AUDIT_FAILED",
          message: error instanceof Error ? error.message : "数据源解耦审计失败"
        }
      },
      { status: 500 }
    );
  }
}
