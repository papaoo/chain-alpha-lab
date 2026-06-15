import { NextResponse } from "next/server";
import { getModelAuditFeedback, updateModelAuditFeedbackStatus } from "@/lib/db/modelAudit";
import type { ModelAuditStatus } from "@/lib/types";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const feedback = getModelAuditFeedback(id);
  if (!feedback) {
    return NextResponse.json(
      { success: false, data: null, error: { code: "MODEL_AUDIT_NOT_FOUND", message: "系统反馈不存在" } },
      { status: 404 }
    );
  }
  return NextResponse.json({ success: true, data: feedback, error: null });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const status = parseStatus(body.status);
  if (!status) {
    return NextResponse.json(
      { success: false, data: null, error: { code: "INVALID_STATUS", message: "反馈状态无效" } },
      { status: 400 }
    );
  }
  const feedback = updateModelAuditFeedbackStatus(id, status);
  if (!feedback) {
    return NextResponse.json(
      { success: false, data: null, error: { code: "MODEL_AUDIT_NOT_FOUND", message: "系统反馈不存在" } },
      { status: 404 }
    );
  }
  return NextResponse.json({ success: true, data: feedback, error: null });
}

function parseStatus(value: unknown): ModelAuditStatus | null {
  if (value === "待评估" || value === "已采纳" || value === "已拒绝" || value === "已实现") return value;
  return null;
}
