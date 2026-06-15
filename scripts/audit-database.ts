import { getDatabaseAudit } from "@/lib/db/audit";

function main() {
  const sampleLimit = readSampleLimit();
  const audit = getDatabaseAudit({ maxJsonRowsPerColumn: sampleLimit });
  console.log(JSON.stringify({ success: true, data: audit }, null, 2));
  if (audit.integrity.status !== "ok" || audit.migrationReadiness.status === "blocked") {
    process.exitCode = 1;
  }
}

function readSampleLimit() {
  const arg = process.argv.find((value) => value.startsWith("--sample-limit="));
  if (!arg) return undefined;
  const parsed = Number(arg.split("=")[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

main();
