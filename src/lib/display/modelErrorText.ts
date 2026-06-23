export function localizeModelError(message?: string | null): string {
  const raw = (message ?? "").trim();
  if (!raw) return "未知模型错误。";
  const text = raw.toLowerCase();

  const unknownFact = raw.match(/unknown factId:\s*([^\s,，。]+)/i);
  if (/evidencerefs contains unknown factid/i.test(raw)) {
    return unknownFact?.[1]
      ? `模型引用了事实包中不存在的证据 ID：${unknownFact[1]}。这通常说明模型没有严格使用后端提供的 evidenceRefs 白名单。`
      : "模型引用了事实包中不存在的证据 ID。需要收紧证据引用白名单或在输出前过滤无效引用。";
  }

  if (/long-term logic while company information is insufficient/i.test(raw)) {
    return "公司基本面、财报或公告证据不足，但模型写出了长期逻辑。系统已拦截，避免把短线盘面误写成长线确定性。";
  }

  const forbidden = raw.match(/forbidden term appears in (?:report|audit feedback):\s*(.+)$/i);
  if (/forbidden term appears/i.test(raw)) {
    return forbidden?.[1]
      ? `模型输出包含禁用承诺性词语：${forbidden[1]}。报告只能表达条件、证据和风险，不能写确定收益或无风险表述。`
      : "模型输出包含禁用承诺性词语。报告只能表达条件、证据和风险，不能写确定收益或无风险表述。";
  }

  if (/output must contain a json object/i.test(raw)) {
    return "模型输出没有包含合法 JSON 对象。通常是输出了 Markdown、解释文字，或 JSON 被截断。";
  }

  if (/unterminated string|unexpected end of json|invalid json|不是合法 json/i.test(text) || /不是合法 JSON/.test(raw)) {
    return "模型输出 JSON 不完整或格式错误。通常是内容过长被截断，或字符串没有正确闭合。";
  }

  if (/invalid enum value/i.test(raw)) {
    return "模型输出了系统枚举之外的取值。需要把可选阶段、动作和状态限制在后端允许范围内。";
  }

  if (/this operation was aborted|aborterror|operation aborted/i.test(raw)) {
    return "请求被中止。常见原因是页面切换、刷新、超时取消，或前端主动终止了旧请求。";
  }

  if (/model provider request failed/i.test(raw)) {
    return "模型服务请求失败。需要检查模型接口、API Key、网络代理或服务商限流状态。";
  }

  if (/fetch failed/i.test(raw)) return "网络请求失败。需要检查数据源可用性、代理设置或上游接口状态。";
  if (/timeout|timed out|超时/i.test(raw)) return "请求超时。可能是上游接口响应慢、网络波动或本次任务耗时过长。";
  if (/outside allowedcodes|not in factpackage candidates/i.test(raw)) {
    return "模型输出了候选池之外的股票。系统已拦截，Agent 只能在规则候选池内复核。";
  }
  if (/position|exceeds|maxsinglestockpositionpct|positionlimitpct/i.test(raw)) {
    return "模型给出的仓位建议越过了风控上限。系统已拦截，仓位必须服从规则引擎边界。";
  }
  if (/unsupported fund-flow window/i.test(raw)) {
    return "模型引用了事实包中不存在的资金窗口。只能使用系统已采集的 1 日、5 日、20 日等真实字段。";
  }

  return raw;
}

export function localizeModelErrors(messages?: string[] | null): string[] {
  return (messages ?? []).map(localizeModelError);
}
