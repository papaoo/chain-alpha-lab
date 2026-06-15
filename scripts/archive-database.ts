import { exportDatabaseArchive, listDatabaseArchives } from "@/lib/db/archive";

async function main() {
  if (process.argv.includes("--list")) {
    const archives = listDatabaseArchives(20);
    console.log(JSON.stringify({ success: true, data: archives }, null, 2));
    return;
  }

  const dryRun = process.argv.includes("--dry-run");
  const archive = exportDatabaseArchive({ dryRun });
  console.log(JSON.stringify({ success: true, data: archive }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
