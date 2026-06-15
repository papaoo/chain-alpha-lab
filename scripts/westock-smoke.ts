import { westockAdapter } from "../src/lib/westock/adapter";

async function main() {
  const results = await westockAdapter.smokeTest({ timeoutMs: 45000, retries: 0 });
  const failed = results.filter((result) => result.status === "failed");

  console.table(
    results.map((result) => ({
      name: result.name,
      status: result.status,
      sections: result.sections.length,
      rows: result.sections.reduce((total, section) => total + section.rowCount, 0),
      warnings: result.warnings.length
    }))
  );

  for (const result of results) {
    if (result.warnings.length) {
      console.log(`\n[${result.name}] warnings`);
      for (const warning of result.warnings) console.log(`- ${warning}`);
    }
  }

  if (failed.length) {
    throw new Error(`westock smoke failed: ${failed.map((result) => result.name).join(", ")}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
