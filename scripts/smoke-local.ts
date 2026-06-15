const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:3006";

type SmokeTarget = {
  name: string;
  path: string;
  expectJson?: boolean;
};

const targets: SmokeTarget[] = [
  { name: "首页驾驶舱", path: "/" },
  { name: "主线配置视图", path: "/mainline?view=settings" },
  { name: "候选股锚点视图", path: "/mainline?view=mainline&anchor=candidate-signals" },
  { name: "模型配置 API", path: "/api/settings", expectJson: true },
  { name: "数据源配置 API", path: "/api/data-settings", expectJson: true },
  { name: "交易时段 API", path: "/api/market-session", expectJson: true }
];

async function main() {
  const failures: string[] = [];

  for (const target of targets) {
    const url = new URL(target.path, baseUrl).toString();
    const startedAt = Date.now();
    try {
      const response = await fetch(url, { headers: { "user-agent": "a-share-smoke/1.0" } });
      const elapsedMs = Date.now() - startedAt;
      const text = await response.text();
      if (!response.ok) {
        failures.push(`${target.name} ${response.status} ${response.statusText}`);
        continue;
      }
      if (target.expectJson) {
        const parsed = safeJson(text);
        if (!parsed || parsed.success !== true) failures.push(`${target.name} JSON 契约异常`);
      } else if (!text.trim()) {
        failures.push(`${target.name} 返回空页面`);
      }
      console.log(`OK ${target.name} ${response.status} ${elapsedMs}ms`);
    } catch (error) {
      failures.push(`${target.name} 请求失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failures.length) {
    console.error(`\nSmoke failed:\n${failures.map((item) => `- ${item}`).join("\n")}`);
    process.exitCode = 1;
  }
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

void main();
