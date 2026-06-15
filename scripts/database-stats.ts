import { getDatabaseRuntimeInfo } from "@/lib/db/runtime";
import { getDatabaseRetentionPreview, getDatabaseStats } from "@/lib/db/stats";

function main() {
  const mode = readMode();
  const data = mode === "runtime"
    ? getDatabaseRuntimeInfo()
    : mode === "retention"
      ? getDatabaseRetentionPreview()
      : getDatabaseStats();
  console.log(JSON.stringify({ success: true, mode, data }, null, 2));
}

function readMode() {
  const raw = process.argv.find((value) => value.startsWith("--mode="))?.split("=")[1];
  if (raw === "runtime" || raw === "retention") return raw;
  return "stats";
}

main();
