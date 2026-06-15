import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { getEnvSettings } from "@/lib/config";
import { parseWestockOutput, type ParsedCommandResult } from "@/lib/westock/parser";

export type WestockCommand =
  | "board"
  | "hot"
  | "calendar"
  | "minute"
  | "kline"
  | "technical"
  | "asfund"
  | "profile"
  | "finance"
  | "shareholder"
  | "reserve";

export interface WestockRunOptions {
  timeoutMs?: number;
  retries?: number;
  rawOutput?: boolean;
}

export interface WestockRawExecution {
  command: WestockCommand;
  args: string[];
  exitCode: number | null;
  timedOut: boolean;
  attempt: number;
  stdout: string;
  stderr: string;
  rawText: string;
}

const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_RETRIES = 2;
const MAX_BUFFER_BYTES = 8 * 1024 * 1024;
const ALLOWED_COMMANDS = new Set<WestockCommand>([
  "board",
  "hot",
  "calendar",
  "minute",
  "kline",
  "technical",
  "asfund",
  "profile",
  "finance",
  "shareholder",
  "reserve"
]);
const HOT_TYPES = new Set(["board", "stock"]);
const PERIODS = new Set(["day", "week", "month", "60", "30", "15", "5", "1"]);
const TECH_GROUPS = new Set(["ma", "macd", "rsi"]);
const FINANCE_TYPES = new Set(["lrb", "zcfz", "xjll"]);
const CODE_LIST_RE = /^(sh|sz|bj)\d{6}(,(sh|sz|bj)\d{6})*$/i;
const SINGLE_CODE_RE = /^(sh|sz|bj)\d{6}$/i;
const POSITIVE_INT_RE = /^[1-9]\d*$/;

export class WestockAdapter {
  constructor(
    private readonly packageVersion = getEnvSettings().westockPackageVersion
  ) {}

  getMarketMinutes(options?: WestockRunOptions) {
    return Promise.all(["sh000001", "sz399001", "sz399006", "sh000688"].map((code) => this.minute(code, options)));
  }

  getIndexKlines(options?: WestockRunOptions) {
    return this.getStockKlines(["sh000001", "sz399001", "sz399006", "sh000688"], 30, options);
  }

  getBoardOverview(options?: WestockRunOptions) {
    return this.run("board", [], options);
  }

  getHotBoards(limit = 20, options?: WestockRunOptions) {
    return this.runWithParsedLimit("hot", ["board", "--limit", String(limit)], limit, options);
  }

  getHotStocks(limit = 50, options?: WestockRunOptions) {
    return this.runWithParsedLimit("hot", ["stock", "--limit", String(limit)], limit, options);
  }

  getCalendar(date: string, country: 1 | 2 | 3 = 1, indicator: 1 | 2 | 3 | 4 = 1, limit = 30, options?: WestockRunOptions) {
    return this.run("calendar", [date, "--limit", String(limit), "--country", String(country), "--indicator", String(indicator)], options);
  }

  getStockTechnicals(codes: string[], options?: WestockRunOptions) {
    return this.run("technical", [joinCodes(codes), "--group", "ma,macd,rsi"], options);
  }

  getStockFundFlows(codes: string[], options?: WestockRunOptions) {
    return this.run("asfund", [joinCodes(codes)], options);
  }

  getStockProfiles(codes: string[], options?: WestockRunOptions) {
    return this.run("profile", [joinCodes(codes)], options);
  }

  getStockKlines(codes: string[], limit = 30, options?: WestockRunOptions) {
    return this.run("kline", [joinCodes(codes), "--period", "day", "--limit", String(limit)], options);
  }

  getStockCompanyKnowledge(codes: string[], options?: WestockRunOptions) {
    const codeList = joinCodes(codes);
    return Promise.all([
      this.getStockProfiles(codes, options),
      this.run("finance", [codeList, "--num", "4"], options).catch((error) => errorToResult("finance", [codeList], error)),
      this.run("shareholder", [codeList], options).catch((error) => errorToResult("shareholder", [codeList], error)),
      this.run("reserve", [codeList], options).catch((error) => errorToResult("reserve", [codeList], error))
    ]);
  }

  minute(code: string, options?: WestockRunOptions) {
    return this.run("minute", [code], options);
  }

  kline(code: string, limit = 30, options?: WestockRunOptions) {
    return this.run("kline", [code, "--period", "day", "--limit", String(limit)], options);
  }

  async run(command: WestockCommand, args: string[], options: WestockRunOptions = {}): Promise<ParsedCommandResult> {
    const safeArgs = buildSafeArgs(command, args);
    const retries = options.retries ?? DEFAULT_RETRIES;
    let last: ParsedCommandResult | undefined;

    for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
      const raw = await runNpx(this.packageVersion, command, safeArgs, options.timeoutMs ?? DEFAULT_TIMEOUT_MS, attempt);
      const parsed = parseWestockOutput(command, safeArgs, raw.stdout);
      const failed = raw.timedOut || raw.exitCode !== 0 || /未知命令|unknown command/i.test(raw.stderr);

      last = {
        ...parsed,
        status: failed ? "failed" : parsed.status,
        rawText: options.rawOutput ? raw.rawText : parsed.rawText,
        warnings: failed ? [...parsed.warnings, raw.stderr || raw.rawText || "westock-data command failed"] : parsed.warnings
      };

      if (!failed) return last;
    }

    return last ?? errorToResult(command, safeArgs, new Error("westock-data command failed before execution"));
  }

  async smokeTest(options?: WestockRunOptions) {
    const checks: Array<{ name: string; command: WestockCommand; args: string[] }> = [
      { name: "board", command: "board", args: [] },
      { name: "hot board", command: "hot", args: ["board", "--limit", "5"] },
      { name: "hot stock", command: "hot", args: ["stock", "--limit", "5"] },
      { name: "minute", command: "minute", args: ["sh000001"] },
      { name: "kline", command: "kline", args: ["sh000001", "--period", "day", "--limit", "5"] },
      { name: "technical", command: "technical", args: ["sh600584", "--group", "ma,macd,rsi"] },
      { name: "asfund", command: "asfund", args: ["sh600584"] },
      { name: "profile", command: "profile", args: ["sh600584"] },
      { name: "finance", command: "finance", args: ["sh600584", "--num", "2"] },
      { name: "shareholder", command: "shareholder", args: ["sh600584"] },
      { name: "reserve", command: "reserve", args: ["sh600584"] }
    ];

    const results = [];
    for (const check of checks) {
      const result = await this.run(check.command, check.args, options);
      results.push({
        name: check.name,
        status: result.status,
        sections: result.sections.map((section) => ({
          title: section.title,
          type: section.type,
          columns: section.columns,
          rowCount: section.rows.length
        })),
        warnings: result.warnings
      });
    }
    return results;
  }

  private async runWithParsedLimit(command: WestockCommand, args: string[], limit: number, options?: WestockRunOptions) {
    const normalizedLimit = normalizePositiveInt(limit, "limit");
    const result = await this.run(command, args, options);
    return {
      ...result,
      sections: result.sections.map((section) =>
        section.type === "markdownTable"
          ? { ...section, rows: section.rows.slice(0, normalizedLimit) }
          : section
      )
    };
  }
}

export function buildSafeArgs(command: WestockCommand, args: string[]) {
  if (!ALLOWED_COMMANDS.has(command)) throw new Error(`westock command is not allowed: ${command}`);

  switch (command) {
    case "board":
      if (args.length) throw new Error("board does not accept args");
      return [];
    case "hot":
      return validateHotArgs(args);
    case "calendar":
      return validateCalendarArgs(args);
    case "minute":
      return validateMinuteArgs(args);
    case "asfund":
    case "profile":
    case "shareholder":
    case "reserve":
      return validateCodeListArgs(command, args);
    case "kline":
      return validateKlineArgs(args);
    case "technical":
      return validateTechnicalArgs(args);
    case "finance":
      return validateFinanceArgs(args);
  }
}

function validateCalendarArgs(args: string[]) {
  if (
    args.length !== 7 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(args[0]) ||
    args[1] !== "--limit" ||
    args[3] !== "--country" ||
    args[5] !== "--indicator"
  ) {
    throw new Error("calendar args must be: <YYYY-MM-DD> --limit <positive integer> --country <1|2|3> --indicator <1|2|3|4>");
  }
  const country = Number(args[4]);
  const indicator = Number(args[6]);
  if (![1, 2, 3].includes(country)) throw new Error("calendar country must be 1, 2 or 3");
  if (![1, 2, 3, 4].includes(indicator)) throw new Error("calendar indicator must be 1, 2, 3 or 4");
  return [args[0], "--limit", String(normalizePositiveInt(args[2], "limit")), "--country", String(country), "--indicator", String(indicator)];
}

export function getWestockNpxDebug(packageVersion = getEnvSettings().westockPackageVersion) {
  return getNpxInvocation(packageVersion);
}

function runNpx(version: string, command: WestockCommand, args: string[], timeoutMs: number, attempt: number) {
  return new Promise<WestockRawExecution>((resolve) => {
    const npxInvocation = getNpxInvocation(version);
    let child;
    let stdout = "";
    let stderr = "";
    let bytes = 0;
    let timedOut = false;
    let settled = false;

    const finish = (result: WestockRawExecution) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    try {
      child = spawn(
        npxInvocation.bin,
        [...npxInvocation.argsPrefix, command, ...args],
        { shell: npxInvocation.shell, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: buildWestockProcessEnv(npxInvocation.bin) }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      finish(toRawExecution(command, args, null, false, attempt, "", message));
      return;
    }

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    const collect = (target: "stdout" | "stderr", chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_BUFFER_BYTES) {
        timedOut = true;
        child.kill();
        return;
      }
      if (target === "stdout") stdout += chunk.toString("utf8");
      else stderr += chunk.toString("utf8");
    };

    child.stdout.on("data", (chunk: Buffer) => collect("stdout", chunk));
    child.stderr.on("data", (chunk: Buffer) => collect("stderr", chunk));
    child.on("error", (error: Error) => {
      clearTimeout(timer);
      stderr = [stderr, error.message].filter(Boolean).join("\n");
      finish(toRawExecution(command, args, null, timedOut, attempt, stdout, stderr));
    });
    child.on("close", (code: number | null) => {
      clearTimeout(timer);
      finish(toRawExecution(command, args, code, timedOut, attempt, stdout, stderr));
    });
  });
}

function getNpxInvocation(version: string) {
  const safeVersion = normalizePackageVersion(version);
  const nodePath = getUsableNodePath();
  const npmCli = join(dirname(nodePath), "node_modules", "npm", "bin", "npx-cli.js");
  if (existsSync(npmCli)) {
    return { bin: nodePath, argsPrefix: [npmCli, "-y", `westock-data-skillhub@${safeVersion}`], shell: false };
  }
  if (process.platform === "win32") {
    const npxCmd = findOnPath("npx.cmd") ?? "npx.cmd";
    return { bin: npxCmd, argsPrefix: ["-y", `westock-data-skillhub@${safeVersion}`], shell: false };
  }
  return { bin: findOnPath("npx") ?? "npx", argsPrefix: ["-y", `westock-data-skillhub@${safeVersion}`], shell: false };
}

function findOnPath(fileName: string) {
  const matches: string[] = [];
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, fileName);
    if (existsSync(candidate)) matches.push(candidate);
  }
  return matches.find((match) => !/nvm4w/i.test(match)) ?? matches[0];
}

function getUsableNodePath() {
  if (existsSync(process.execPath)) return process.execPath;
  return findOnPath(process.platform === "win32" ? "node.exe" : "node") ?? process.execPath;
}

function buildWestockProcessEnv(binPath: string) {
  const env: NodeJS.ProcessEnv = { ...process.env };
  const stalePathFragments = [/\\nvm4w\\nodejs/i];
  const keysToDelete = [
    "npm_config_prefix",
    "NPM_CONFIG_PREFIX",
    "prefix",
    "PREFIX",
    "NODE_PATH",
    "INIT_CWD"
  ];
  for (const key of keysToDelete) delete env[key];

  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
  const nodeDir = dirname(binPath);
  const parts = (env[pathKey] ?? "")
    .split(delimiter)
    .filter((part) => part && !stalePathFragments.some((fragment) => fragment.test(part)));
  env[pathKey] = [nodeDir, ...parts.filter((part) => part.toLowerCase() !== nodeDir.toLowerCase())].join(delimiter);
  return env;
}

function normalizePackageVersion(version: string) {
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error("westock package version must be a semver string");
  }
  return version;
}

function toRawExecution(
  command: WestockCommand,
  args: string[],
  exitCode: number | null,
  timedOut: boolean,
  attempt: number,
  stdout: string,
  stderr: string
): WestockRawExecution {
  return {
    command,
    args,
    exitCode,
    timedOut,
    attempt,
    stdout,
    stderr,
    rawText: [stdout, stderr].filter(Boolean).join("\n").trimEnd()
  };
}

function validateHotArgs(args: string[]) {
  if (args.length !== 3 || !HOT_TYPES.has(args[0]) || args[1] !== "--limit") {
    throw new Error("hot args must be: board|stock --limit <positive integer>");
  }
  return [args[0], "--limit", String(normalizePositiveInt(args[2], "limit"))];
}

function validateMinuteArgs(args: string[]) {
  if (args.length !== 1 || !SINGLE_CODE_RE.test(args[0])) {
    throw new Error("minute args must be a single A-share index or stock code");
  }
  return [args[0].toLowerCase()];
}

function validateCodeListArgs(command: WestockCommand, args: string[]) {
  if (args.length !== 1 || !CODE_LIST_RE.test(args[0])) {
    throw new Error(`${command} args must be a comma-separated A-share code list`);
  }
  return [args[0].toLowerCase()];
}

function validateKlineArgs(args: string[]) {
  if (args.length !== 5 || !CODE_LIST_RE.test(args[0]) || args[1] !== "--period" || !PERIODS.has(args[2]) || args[3] !== "--limit") {
    throw new Error("kline args must be: <codes> --period <allowed period> --limit <positive integer>");
  }
  return [args[0].toLowerCase(), "--period", args[2], "--limit", String(normalizePositiveInt(args[4], "limit"))];
}

function validateTechnicalArgs(args: string[]) {
  if (args.length !== 3 || !CODE_LIST_RE.test(args[0]) || args[1] !== "--group") {
    throw new Error("technical args must be: <codes> --group <groups>");
  }
  const groups = args[2].split(",").map((group) => group.trim()).filter(Boolean);
  if (!groups.length || groups.some((group) => !TECH_GROUPS.has(group))) {
    throw new Error("technical groups must be limited to ma,macd,rsi");
  }
  return [args[0].toLowerCase(), "--group", groups.join(",")];
}

function validateFinanceArgs(args: string[]) {
  if (args.length === 3 && CODE_LIST_RE.test(args[0]) && args[1] === "--num") {
    return [args[0].toLowerCase(), "--num", String(normalizePositiveInt(args[2], "num"))];
  }
  if (args.length === 5 && CODE_LIST_RE.test(args[0]) && args[1] === "--type" && FINANCE_TYPES.has(args[2]) && args[3] === "--num") {
    return [args[0].toLowerCase(), "--type", args[2], "--num", String(normalizePositiveInt(args[4], "num"))];
  }
  throw new Error("finance args must be: <codes> --num <positive integer> or <codes> --type <lrb|zcfz|xjll> --num <positive integer>");
}

function normalizePositiveInt(value: string | number, name: string) {
  const text = String(value);
  if (!POSITIVE_INT_RE.test(text)) throw new Error(`${name} must be a positive integer`);
  return Number(text);
}

function joinCodes(codes: string[]) {
  const joined = codes.join(",").toLowerCase();
  if (!CODE_LIST_RE.test(joined)) throw new Error("codes must be A-share codes like sh600584 or sz300308");
  return joined;
}

function errorToResult(command: string, args: string[], error: unknown): ParsedCommandResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    command,
    args,
    status: "failed",
    rawText: message,
    sections: [],
    warnings: [message]
  };
}

export const westockAdapter = new WestockAdapter();
