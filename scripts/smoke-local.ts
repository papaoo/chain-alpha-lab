const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:3006";

type SmokeTarget = {
  name: string;
  path: string;
  expectJson?: boolean;
  method?: "GET" | "POST";
  body?: unknown;
};

const targets: SmokeTarget[] = [
  { name: "home", path: "/" },
  { name: "mainline settings", path: "/mainline?view=settings" },
  { name: "mainline candidate signals", path: "/mainline?view=mainline&anchor=candidate-signals" },
  { name: "selection workspace", path: "/mainline?view=selection" },
  { name: "premarket scout", path: "/mainline?view=premarket" },
  { name: "serenity bottleneck research", path: "/mainline?view=serenity" },
  { name: "stock tracking", path: "/mainline?view=tracking" },
  { name: "selection runs page", path: "/selection/runs" },
  { name: "selection runs summary api", path: "/api/selection/runs?limit=1", expectJson: true },
  { name: "settings api", path: "/api/settings", expectJson: true },
  { name: "data settings api", path: "/api/data-settings", expectJson: true },
  { name: "market session api", path: "/api/market-session", expectJson: true },
  { name: "premarket snapshot api", path: "/api/premarket/snapshot", expectJson: true },
  { name: "data source health api", path: "/api/data-source-health?limit=20", expectJson: true },
  { name: "model usage api", path: "/api/model-usage?windowDays=30&limit=20", expectJson: true },
  { name: "tracking items api", path: "/api/tracking/items?status=active", expectJson: true },
  { name: "tracking refresh api", path: "/api/tracking/refresh", expectJson: true, method: "POST", body: { preferRealtime: true } },
  { name: "auction watchlist api", path: "/api/auction-watchlist?limit=80&itemLimit=6", expectJson: true },
  { name: "serenity themes api", path: "/api/serenity/themes?q=AI&market=A-share&limit=3", expectJson: true },
  { name: "serenity runs api", path: "/api/serenity/runs?limit=3", expectJson: true },
  { name: "serenity tags api", path: "/api/serenity/tags?codes=sh603019,sz002463&lookback=10", expectJson: true },
  { name: "serenity mainline import api", path: "/api/serenity/import/mainline?market=A-share&limit=3", expectJson: true }
];

async function main() {
  const failures: string[] = [];

  for (const target of targets) {
    const url = new URL(target.path, baseUrl).toString();
    const startedAt = Date.now();
    try {
      const response = await fetch(url, {
        method: target.method ?? "GET",
        headers: {
          "user-agent": "chain-alpha-smoke/1.0",
          ...(target.body ? { "content-type": "application/json" } : {})
        },
        body: target.body ? JSON.stringify(target.body) : undefined
      });
      const elapsedMs = Date.now() - startedAt;
      const text = await response.text();
      if (!response.ok) {
        failures.push(`${target.name} ${response.status} ${response.statusText}`);
        continue;
      }
      if (target.expectJson) {
        const parsed = safeJson(text);
        if (!parsed || parsed.success !== true) failures.push(`${target.name} JSON contract failed`);
      } else if (!text.trim()) {
        failures.push(`${target.name} returned an empty page`);
      }
      console.log(`OK ${target.name} ${response.status} ${elapsedMs}ms`);
    } catch (error) {
      failures.push(`${target.name} request failed: ${error instanceof Error ? error.message : String(error)}`);
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
