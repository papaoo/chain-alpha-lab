import { createDatabaseBackup, listDatabaseBackups } from "@/lib/db/backup";

async function main() {
  const command = process.argv.includes("--list") ? "list" : "backup";
  if (command === "list") {
    const backups = listDatabaseBackups(20);
    console.log(JSON.stringify({ success: true, data: backups }, null, 2));
    return;
  }
  const backup = await createDatabaseBackup();
  console.log(JSON.stringify({ success: true, data: backup }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
