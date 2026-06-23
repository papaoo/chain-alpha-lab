export function cleanDisplayText(value?: string | null): string | undefined {
  if (!value) return value ?? undefined;
  const candidates = [value, decodeLatin1Mojibake(value)];
  return normalizeStatusWords(candidates.sort((left, right) => mojibakeScore(left) - mojibakeScore(right))[0]);
}

export function cleanDisplayList(values?: string[] | null): string[] {
  if (!values?.length) return [];
  return values.map((value) => cleanDisplayText(value) ?? value).filter(Boolean);
}

function decodeLatin1Mojibake(value: string): string {
  if (!looksLikeMojibake(value)) return value;
  try {
    const bytes = Uint8Array.from(Array.from(value, (char) => char.charCodeAt(0) & 0xff));
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return value;
  }
}

function mojibakeScore(value: string): number {
  const replacement = (value.match(/\uFFFD/g) ?? []).length * 5;
  const latinNoise = countMatches(value, /[\u00C0-\u00FF]/g) * 2;
  const cjkNoise = countMatches(value, /[\u92B4\u9474\u8DF5\u95C0\u942D\u7F02\u6FA7\u741B\u9359\u6D93\u7F01\u6957\u95B2\u9F8D\uE000-\uF8FF]/g) * 2;
  const control = countMatches(value, /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g) * 3;
  return replacement + latinNoise + cjkNoise + control;
}

function looksLikeMojibake(value: string) {
  if (/[\uFFFD\uE000-\uF8FF]/.test(value)) return true;
  if (/[\u00C0-\u00FF]/.test(value) && /[\u0080-\u00BF]/.test(value)) return true;
  if (/[\u00C0-\u00FF]{2,}/.test(value)) return true;
  return /[\u92B4\u9474\u8DF5\u95C0\u942D\u7F02\u6FA7\u741B\u9359\u6D93\u7F01\u6957\u95B2\u9F8D]/.test(value);
}

function countMatches(value: string, pattern: RegExp) {
  return (value.match(pattern) ?? []).length;
}

function normalizeStatusWords(value: string) {
  return value
    .replace(/K线\s+success/gi, "K线成功")
    .replace(/技术\s+success/gi, "技术成功")
    .replace(/资金\s+success/gi, "资金成功")
    .replace(/\bprofile success\b/gi, "公司概况成功")
    .replace(/\blrb success\b/gi, "利润表成功")
    .replace(/\bzcfz success\b/gi, "资产负债表成功")
    .replace(/\bxjll success\b/gi, "现金流量表成功")
    .replace(/\bshareholder success\b/gi, "股东数据成功")
    .replace(/\breserve success\b/gi, "备用数据成功")
    .replace(/\bfailed\b/gi, "失败")
    .replace(/\bpartial\b/gi, "部分可用")
    .replace(/\bmissing\b/gi, "缺失")
    .replace(/\bfallback\b/gi, "备用源")
    .replace(/\bunknown\b/gi, "未知")
    .replace(/\bcomplete\b/gi, "完整");
}
