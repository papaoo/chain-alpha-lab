export type WestockCommand =
  | "board"
  | "hot"
  | "minute"
  | "kline"
  | "technical"
  | "asfund"
  | "profile"
  | "finance"
  | "shareholder"
  | "reserve";

export type ParsedStatus = "success" | "empty" | "failed" | "partial";

export type WestockSectionType = "markdownTable" | "text" | "batchMeta";

export interface BatchMeta {
  status?: string;
  total?: number;
  success?: number;
  failed?: number;
  raw: string;
  fields: Record<string, string | number>;
}

export interface InvalidCell {
  value: null;
  invalid: true;
  raw: "-";
}

export type ParsedCell = string | number | boolean | null | Record<string, unknown> | unknown[] | InvalidCell;

export interface ParsedSection {
  title?: string;
  type: WestockSectionType;
  columns: string[];
  rows: Record<string, ParsedCell>[];
  text?: string;
  meta?: BatchMeta;
}

export interface ParsedCommandResult {
  command: string;
  args: string[];
  status: ParsedStatus;
  rawText: string;
  sections: ParsedSection[];
  warnings: string[];
}

export interface WestockRunOptions {
  timeoutMs?: number;
  retries?: number;
  rawOutput?: boolean;
}

export interface WestockRunRequest extends WestockRunOptions {
  command: WestockCommand;
  args?: string[];
}

export interface WestockExecutionResult {
  command: WestockCommand;
  args: string[];
  status: ParsedStatus;
  exitCode: number | null;
  timedOut: boolean;
  attempt: number;
  stdout: string;
  stderr: string;
  rawText: string;
  parsed: ParsedCommandResult;
}

export interface WestockAdapterConfig {
  packageName?: string;
  packageVersion?: string;
  timeoutMs?: number;
  retries?: number;
  maxBufferBytes?: number;
}
