import { SelectionRunsClient } from "@/components/SelectionRunsClient";
import { listSelectionRunSummaries } from "@/lib/selection/runs";

export default function SelectionRunsPage() {
  const runs = listSelectionRunSummaries(80);

  return <SelectionRunsClient runs={runs} />;
}
