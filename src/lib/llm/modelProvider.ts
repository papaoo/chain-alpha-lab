import type { FactPackage } from "../types";
import { generateDeepSeekReport, generateModelAuditFeedback as generateDeepSeekModelAuditFeedback } from "./deepseek";

export async function generateModelReport(factPackage: FactPackage) {
  return generateDeepSeekReport(factPackage);
}

export async function generateModelAuditFeedback(input: Parameters<typeof generateDeepSeekModelAuditFeedback>[0]) {
  return generateDeepSeekModelAuditFeedback(input);
}
