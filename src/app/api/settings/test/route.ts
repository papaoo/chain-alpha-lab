import { NextResponse } from "next/server";
import { getRuntimeSettings } from "@/lib/db/settings";
import { parseProvider } from "@/lib/config";

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const body = await request.json().catch(() => ({}));
    const current = getRuntimeSettings();
    const provider = parseProvider(body.provider) ?? current.provider;
    const baseUrl = sanitizeString(body.baseUrl) || current.baseUrl;
    const model = sanitizeString(body.model) || current.model;
    const apiKey = sanitizeString(body.apiKey) || current.apiKey;
    const timeoutMs = sanitizeInteger(body.timeoutMs, Math.min(current.timeoutMs, 30000));
    if (!apiKey) throw new Error("模型 API 密钥为空");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(buildChatCompletionsUrl(baseUrl), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: 16,
          messages: [
            { role: "system", content: "You are a connection health checker. Reply with pong only." },
            { role: "user", content: "ping" }
          ],
          ...(provider === "deepseek" ? { thinking: { type: "disabled" } } : {})
        }),
        signal: controller.signal
      });
      const text = await response.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      if (!response.ok) {
        throw new Error(json?.error?.message || `模型接口 HTTP ${response.status}`);
      }
      const content = json?.choices?.[0]?.message?.content;
      if (!content) throw new Error("模型接口返回缺少 choices[0].message.content");
      return NextResponse.json({
        success: true,
        data: {
          ok: true,
          provider,
          model,
          elapsedMs: Date.now() - startedAt,
          message: "模型连接测试成功"
        },
        error: null
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    return NextResponse.json({
      success: false,
      data: {
        ok: false,
        elapsedMs: Date.now() - startedAt
      },
      error: {
        code: "MODEL_CONNECTION_TEST_FAILED",
        message: error instanceof Error ? error.message : String(error)
      }
    }, { status: 200 });
  }
}

function buildChatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  if (trimmed.endsWith("/v1")) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
}

function sanitizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeInteger(value: unknown, fallback: number) {
  const parsed = Math.trunc(typeof value === "number" ? value : Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
