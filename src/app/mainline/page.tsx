import { ResearchDashboard } from "@/components/ResearchDashboard";
import type { StrategyWorkspaceView } from "@/components/StrategyShellNav";

const VIEWS: StrategyWorkspaceView[] = [
  "overview",
  "premarket",
  "mainline",
  "selection",
  "serenity",
  "limitBoard",
  "smallCap",
  "tracking",
  "portfolio",
  "risk",
  "audit",
  "analysis",
  "settings",
  "users",
  "roles",
  "operationLog"
];

export default async function MainlinePage({
  searchParams
}: {
  searchParams?: Promise<{ view?: string | string[] }>;
}) {
  const params = await searchParams;
  const rawView = Array.isArray(params?.view) ? params?.view[0] : params?.view;
  const initialView = VIEWS.includes(rawView as StrategyWorkspaceView) ? rawView as StrategyWorkspaceView : "mainline";
  return <ResearchDashboard initialView={initialView} />;
}
