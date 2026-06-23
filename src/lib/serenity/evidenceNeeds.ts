import type { SerenityEvidence, SerenityEvidenceNeed, SerenityEvidenceNeedKey } from "@/lib/serenity/types";

type EvidenceNeedInput = {
  missingProof?: string[];
  evidence?: SerenityEvidence[];
  evidenceCoverage?: {
    verifiedHardEvidenceCount: number;
    hardEvidenceCount: number;
    freshnessLevel: "fresh" | "aging" | "stale" | "unknown";
  };
};

const NEED_LIBRARY: Record<SerenityEvidenceNeedKey, Omit<SerenityEvidenceNeed, "priority" | "reason">> = {
  business: {
    key: "business",
    label: "主营/产品匹配",
    sourcePaths: ["东方财富 F10 主营构成", "公司年报经营讨论", "官网产品页", "互动易/上证 e 互动"],
    canAutomate: true
  },
  filing: {
    key: "filing",
    label: "公告/财报硬证据",
    sourcePaths: ["交易所公告", "年报/半年报/季报", "重大合同/项目公告", "募集说明书"],
    canAutomate: true
  },
  customer: {
    key: "customer",
    label: "客户/订单验证",
    sourcePaths: ["客户认证公告", "订单/中标公告", "客户年报供应商披露", "招投标/采购平台"],
    canAutomate: false
  },
  capacity: {
    key: "capacity",
    label: "产能/认证/良率",
    sourcePaths: ["环评/能评/项目备案", "扩产公告", "认证进展披露", "产线投产公告"],
    canAutomate: false
  },
  constraint: {
    key: "constraint",
    label: "卡点机制说明",
    sourcePaths: ["行业协会资料", "技术白皮书", "公司投资者交流纪要", "产业链专家报告"],
    canAutomate: false
  },
  falsification: {
    key: "falsification",
    label: "反证条件",
    sourcePaths: ["替代路线公告", "竞品扩产", "毛利率/存货/应收变化", "客户需求放缓信号"],
    canAutomate: false
  },
  market: {
    key: "market",
    label: "市场关注度连续性",
    sourcePaths: ["行情快照", "资金流", "板块成分", "主线阶段记忆"],
    canAutomate: true
  },
  evidence_strength: {
    key: "evidence_strength",
    label: "强/中证据交叉验证",
    sourcePaths: ["公告 + 财报 + F10 交叉", "公司口径 + 客户口径交叉", "财务指标 + 产能进度交叉"],
    canAutomate: false
  }
};

export function buildSerenityEvidenceNeeds(input: EvidenceNeedInput): SerenityEvidenceNeed[] {
  const keys = new Set<SerenityEvidenceNeedKey>();
  for (const proof of input.missingProof ?? []) keys.add(classifyNeedKey(proof));

  const evidence = input.evidence ?? [];
  const coverage = input.evidenceCoverage;
  if (!evidence.some((item) => item.sourceType === "company_profile")) keys.add("business");
  if (!coverage?.verifiedHardEvidenceCount) keys.add("filing");
  if (!evidence.some((item) => /(customer|order|contract|bid|tender)/i.test(item.sourceType))) keys.add("customer");
  if (!evidence.some((item) => /(capacity|certification|project|approval|yield)/i.test(item.sourceType))) keys.add("capacity");
  if (!evidence.some((item) => /(filing|announcement|financial_report|customer|capacity|project|patent|standard)/i.test(item.sourceType))) keys.add("evidence_strength");
  if (coverage?.freshnessLevel === "stale" || coverage?.freshnessLevel === "unknown") keys.add("market");

  return Array.from(keys)
    .map((key) => ({
      ...NEED_LIBRARY[key],
      priority: priorityForNeed(key, coverage),
      reason: reasonForNeed(key, coverage)
    }))
    .sort((left, right) => priorityWeight(right.priority) - priorityWeight(left.priority) || left.label.localeCompare(right.label, "zh-CN"))
    .slice(0, 6);
}

function classifyNeedKey(text: string): SerenityEvidenceNeedKey {
  if (/主营|业务|产品|F10|产业链位置|匹配/.test(text)) return "business";
  if (/公告|财报|占比|收入/.test(text)) return "filing";
  if (/客户|订单|导入/.test(text)) return "customer";
  if (/产能|认证|项目|良率|扩产/.test(text)) return "capacity";
  if (/具体卡住|环节|瓶颈|机制/.test(text)) return "constraint";
  if (/反证|失效|削弱|替代/.test(text)) return "falsification";
  if (/资金|成交|行情|盘口|连续性/.test(text)) return "market";
  return "evidence_strength";
}

function priorityForNeed(
  key: SerenityEvidenceNeedKey,
  coverage?: EvidenceNeedInput["evidenceCoverage"]
): SerenityEvidenceNeed["priority"] {
  if (key === "filing" || key === "customer" || key === "capacity") return "high";
  if (key === "business" && !coverage?.verifiedHardEvidenceCount) return "high";
  if (key === "evidence_strength") return "medium";
  if (key === "constraint" || key === "falsification") return "medium";
  return "low";
}

function reasonForNeed(key: SerenityEvidenceNeedKey, coverage?: EvidenceNeedInput["evidenceCoverage"]) {
  if (key === "filing") return coverage?.verifiedHardEvidenceCount ? "已有部分硬证据，但仍需公告/财报补强收入和产品口径。" : "缺少已验证硬证据，不能把瓶颈线索升级为强结论。";
  if (key === "customer") return "客户导入、订单或中标能验证需求是否真实落到公司。";
  if (key === "capacity") return "产能、认证、良率和项目进度决定公司是否真的卡住供给爬坡。";
  if (key === "business") return "先证明公司主营或产品确实贴近该稀缺环节。";
  if (key === "constraint") return "需要说明为什么这一层难扩、难替代或供应商集中。";
  if (key === "falsification") return "研究结论必须有反证条件，避免只讲顺风故事。";
  if (key === "market") return "行情和资金只说明关注度，需要连续性和时间口径留痕。";
  return "当前证据偏弱，需要用至少两类中/强证据交叉验证。";
}

function priorityWeight(priority: SerenityEvidenceNeed["priority"]) {
  if (priority === "high") return 3;
  if (priority === "medium") return 2;
  return 1;
}
