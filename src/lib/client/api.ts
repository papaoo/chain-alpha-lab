export type ClientApiResponse<T> = {
  success: boolean;
  data: T | null;
  error: { code: string; message: string } | null;
};

export async function parseApiResponse<T>(response: Response, label = response.url): Promise<ClientApiResponse<T>> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return {
      success: false,
      data: null,
      error: {
        code: "EMPTY_RESPONSE",
        message: `接口返回空响应：${label}`
      }
    };
  }

  try {
    return JSON.parse(text) as ClientApiResponse<T>;
  } catch {
    const preview = text.replace(/\s+/g, " ").slice(0, 140);
    return {
      success: false,
      data: null,
      error: {
        code: "INVALID_JSON",
        message: `接口返回非 JSON 内容：${label}${preview ? `；片段：${preview}` : ""}`
      }
    };
  }
}

export async function fetchApiJson<T>(url: string, init?: RequestInit): Promise<ClientApiResponse<T>> {
  const response = await fetch(url, init);
  const json = await parseApiResponse<T>(response, url);
  if (!response.ok || !json.success) {
    throw new Error(json.error?.message ?? `请求失败：${url}`);
  }
  return json;
}
