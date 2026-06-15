import type { ParsedCommandResult } from "@/lib/westock/parser";

export type FallbackParsedRow = Record<string, string | number | null>;

export function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function westockErrorToResult(command: string, codes: string[], error: unknown): ParsedCommandResult {
  return {
    command,
    args: [codes.join(",")],
    status: "failed",
    rawText: "",
    warnings: [toErrorMessage(error)],
    sections: []
  };
}

export function appendFallbackRows(
  base: ParsedCommandResult | null,
  input: {
    command: string;
    args: string[];
    title: string;
    columns: string[];
    rows: FallbackParsedRow[];
    warning: string;
  }
): ParsedCommandResult {
  const sections = base?.sections ?? [];
  const firstTableIndex = sections.findIndex((section) => section.type === "markdownTable");
  const fallbackSection = {
    type: "markdownTable" as const,
    title: input.title,
    columns: input.columns,
    rows: input.rows,
    raw: input.title
  };

  if (firstTableIndex >= 0) {
    return {
      ...base!,
      status: base?.status === "success" ? "partial" : base?.status ?? "partial",
      warnings: [...(base?.warnings ?? []), input.warning],
      sections: sections.map((section, index) => index === firstTableIndex
        ? { ...section, rows: [...section.rows, ...input.rows] }
        : section)
    };
  }

  return {
    command: input.command,
    args: input.args,
    status: "partial",
    rawText: input.title,
    warnings: [input.warning],
    sections: [fallbackSection]
  };
}

export function firstMarkdownRows(result?: ParsedCommandResult | null) {
  const tables = result?.sections.filter((section) => section.type === "markdownTable") ?? [];
  const dataTables = tables.filter((section) => section.columns.length && section.rows.length);
  if (dataTables.length) return dataTables.flatMap((section) => section.rows);
  return tables.find((section) => section.rows.length)?.rows ?? [];
}

export function sumLastFundFlow(rows: Array<{ mainNetFlow?: number }>, count: number) {
  const values = rows
    .slice(-count)
    .map((row) => row.mainNetFlow)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (values.length < Math.min(count, rows.length) || values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0);
}
