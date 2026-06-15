import type { ParseStatus } from "@/lib/types";

export interface InvalidCell {
  value: null;
  invalid: true;
  raw: "-";
}

export type ParsedCell = string | number | boolean | null | InvalidCell | Record<string, unknown> | unknown[];

export interface BatchMeta {
  status?: string;
  total?: number;
  success?: number;
  failed?: number;
  raw: string;
  fields: Record<string, string | number>;
}

export interface ParsedSection {
  title?: string;
  type: "markdownTable" | "text" | "batchMeta";
  columns: string[];
  rows: Array<Record<string, ParsedCell>>;
  raw: string;
  text?: string;
  meta?: BatchMeta;
}

export interface ParsedCommandResult {
  command: string;
  args: string[];
  status: ParseStatus;
  rawText: string;
  sections: ParsedSection[];
  warnings: string[];
}

const TABLE_SEPARATOR_RE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/;
const TABLE_ROW_RE = /^\s*\|.*\|\s*$/;

export function parseWestockOutput(command: string, args: string[], rawText: string): ParsedCommandResult {
  const normalized = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const warnings: string[] = [];
  const sections: ParsedSection[] = [];

  if (!normalized.trim()) {
    return {
      command,
      args,
      status: "empty",
      rawText,
      sections: [],
      warnings: ["Command succeeded with empty output"]
    };
  }

  const lines = normalized.split("\n");
  let currentTitle: string | undefined;
  let textBuffer: string[] = [];
  let textTitle: string | undefined;

  const flushText = () => {
    const text = textBuffer.join("\n").trim();
    if (text) {
      sections.push({
        title: textTitle ?? currentTitle,
        type: "text",
        columns: [],
        rows: [{ text }],
        raw: text,
        text
      });
      textBuffer = [];
      textTitle = undefined;
      currentTitle = undefined;
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) continue;

    if (trimmed.startsWith("[Batch]")) {
      flushText();
      const meta = parseBatchMeta(trimmed);
      sections.push({
        title: currentTitle,
        type: "batchMeta",
        columns: [],
        rows: [meta.fields],
        raw: trimmed,
        meta
      });
      currentTitle = undefined;
      continue;
    }

    if (isMarkdownTableAt(lines, i)) {
      flushText();
      const tableLines: string[] = [];
      while (i < lines.length && TABLE_ROW_RE.test(lines[i])) {
        tableLines.push(lines[i]);
        i += 1;
      }
      i -= 1;
      const table = parseMarkdownTable(tableLines, warnings);
      sections.push({
        title: currentTitle,
        type: "markdownTable",
        columns: table.columns,
        rows: table.rows,
        raw: tableLines.join("\n")
      });
      currentTitle = undefined;
      continue;
    }

    const title = parseTitle(trimmed);
    if (title || isPlainSectionTitle(trimmed)) {
      flushText();
      currentTitle = title ?? trimmed;
      continue;
    }

    textTitle ??= currentTitle;
    textBuffer.push(line);
  }

  flushText();

  const tableRows = sections.reduce((count, section) => count + (section.type === "markdownTable" ? section.rows.length : 0), 0);
  const status: ParseStatus = tableRows > 0 ? "success" : sections.length > 0 ? "partial" : "empty";

  return { command, args, status, rawText, sections, warnings };
}

function isMarkdownTableAt(lines: string[], index: number) {
  return Boolean(lines[index] && lines[index + 1] && TABLE_ROW_RE.test(lines[index]) && TABLE_SEPARATOR_RE.test(lines[index + 1]));
}

function parseTitle(line: string) {
  const bold = line.match(/^\*\*(.+)\*\*$/);
  if (bold) return bold[1].trim();
  const heading = line.match(/^#{1,6}\s+(.+)$/);
  if (heading) return heading[1].trim();
  return undefined;
}

function isPlainSectionTitle(line: string) {
  if (TABLE_ROW_RE.test(line)) return false;
  if (/^[=-]{3,}$/.test(line)) return false;
  return line.length <= 80 && !line.includes("|");
}

function parseBatchMeta(line: string): BatchMeta {
  const body = line.replace(/^\[Batch\]\s*/, "");
  const fields: Record<string, string | number> = {};

  for (const part of body.split("|")) {
    const [rawKey, ...rawValue] = part.split(":");
    const key = rawKey?.trim();
    const value = rawValue.join(":").trim();
    if (!key || !value) continue;
    fields[key] = /^-?\d+$/.test(value) ? Number(value) : value;
  }

  return {
    status: typeof fields["状态"] === "string" ? fields["状态"] : undefined,
    total: typeof fields["总数"] === "number" ? fields["总数"] : undefined,
    success: typeof fields["成功"] === "number" ? fields["成功"] : undefined,
    failed: typeof fields["失败"] === "number" ? fields["失败"] : undefined,
    raw: line,
    fields
  };
}

function parseMarkdownTable(lines: string[], warnings: string[]) {
  const [header, , ...body] = lines;
  const columns = splitTableLine(header);
  const rows = body
    .filter((line) => TABLE_ROW_RE.test(line.trim()) && !TABLE_SEPARATOR_RE.test(line.trim()))
    .map((line) => {
      const cells = splitTableLine(line);
      const row = columns.reduce<Record<string, ParsedCell>>((acc, column, index) => {
        acc[column] = normalizeCell(cells[index] ?? "", warnings, column);
        return acc;
      }, {});
      if (cells.length > columns.length) {
        warnings.push(`row has ${cells.length} cells but table has ${columns.length} columns`);
      }
      return row;
    });
  return { columns, rows };
}

function splitTableLine(line: string) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let current = "";
  let escaped = false;

  for (const char of trimmed) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      current += char;
      escaped = true;
      continue;
    }
    if (char === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function normalizeCell(value: string, warnings: string[], column: string): ParsedCell {
  const trimmed = value.trim();
  if (trimmed === "-") return { value: null, invalid: true, raw: "-" };
  if (!trimmed) return null;

  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      return JSON.parse(trimmed) as ParsedCell;
    } catch {
      warnings.push(`column ${column} contains invalid JSON-like text`);
      return trimmed;
    }
  }

  const numberText = trimmed.replace(/,/g, "");
  if (/^-?\d+(\.\d+)?$/.test(numberText)) return Number(numberText);
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  return trimmed;
}

export function firstTableRows(result: ParsedCommandResult, titleIncludes?: string) {
  const section = result.sections.find(
    (item) =>
      item.type === "markdownTable" &&
      (!titleIncludes || item.title?.includes(titleIncludes))
  );
  return section?.rows ?? [];
}
