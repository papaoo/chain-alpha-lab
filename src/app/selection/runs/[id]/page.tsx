import { notFound } from "next/navigation";
import { SelectionRunDetailClient } from "@/components/SelectionRunDetailClient";
import { getSelectionRun } from "@/lib/selection/runs";

export default async function SelectionRunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = getSelectionRun(id);
  if (!run) notFound();
  return <SelectionRunDetailClient run={run} />;
}
