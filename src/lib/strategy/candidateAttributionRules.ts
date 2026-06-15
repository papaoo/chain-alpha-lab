import type { CompanyKnowledgeCard, SectorConstituentSnapshot, SectorRuleResult, StockCandidate } from "@/lib/types";
import { normalizeSectorName } from "@/lib/sector/normalization";
import { inferIndustryChainPosition, matchBusinessToSector, profileText } from "@/lib/strategy/candidateBusinessMatchRules";

type CandidateMembership = { name: string; boardCode: string; boardType: SectorConstituentSnapshot["boardType"] };
type MainlineAttribution = NonNullable<StockCandidate["mainlineAttribution"]>;

export function evaluateMainlineAttribution(
  stockName: string,
  sectors: SectorRuleResult[],
  membership: CandidateMembership | undefined,
  profile: Record<string, unknown> | undefined
): MainlineAttribution {
  if (membership) {
    const matched = sectors.find((sector) => normalizeSectorName(sector.name) === normalizeSectorName(membership.name));
    if (matched) {
      const businessMatch = matchBusinessToSector(profile, matched.name);
      const chainPosition = inferIndustryChainPosition(String(profile?.business ?? ""), String(profile?.industry ?? ""), matched.name);
      const negativeEvidence = businessMatch.level === "none" && profileText(profile)
        ? [`主营/行业资料未直接命中 ${matched.name} 关键词：${profileText(profile)}`]
        : [];
      return {
        status: "direct_constituent",
        matchedSector: matched.name,
        membershipSector: membership.name,
        normalizedMembershipSector: normalizeSectorName(membership.name),
        businessKeywords: businessMatch.matchedKeywords,
        sectorKeywords: businessMatch.sectorKeywords.length ? businessMatch.sectorKeywords : [matched.name],
        evidence: [
          `东方财富${membership.boardType === "industry" ? "行业" : "概念"}成分股：${membership.name}`,
          businessMatch.matchedKeywords.length ? `主营/行业关键词辅助命中：${businessMatch.matchedKeywords.join("、")}` : ""
        ].filter(Boolean),
        blockers: negativeEvidence,
        evidenceChain: {
          constituentEvidence: [`${membership.boardType === "industry" ? "行业" : "概念"}成分股 ${membership.name}(${membership.boardCode})`],
          businessEvidence: businessMatch.matchedKeywords.length ? [`主营/行业关键词：${businessMatch.matchedKeywords.join("、")}`] : [],
          industryChainEvidence: chainPosition !== "unknown" ? [`产业链位置推断：${chainPosition}`] : [],
          negativeEvidence,
          sourceQuality: "direct",
          reviewRequired: negativeEvidence.length > 0,
          reviewReason: negativeEvidence.length ? "成分股证据成立，但主营资料未直接命中，需防止宽概念误归属。" : undefined
        },
        confidence: "高",
        shouldExclude: false,
        reason: `${stockName} 是当前主线 ${matched.name} 的成分股，主线归属成立${negativeEvidence.length ? "，但主营资料未直接命中，需复核概念口径。" : "。"}`
      };
    }
  }

  const directMatches = sectors
    .map((sector) => ({ sector, match: matchBusinessToSector(profile, sector.name) }))
    .filter((item) => item.match.level === "direct");
  if (directMatches.length) {
    const { sector, match } = directMatches[0];
    return {
      status: "business_direct",
      matchedSector: sector.name,
      membershipSector: membership?.name,
      normalizedMembershipSector: membership ? normalizeSectorName(membership.name) : undefined,
      businessKeywords: match.matchedKeywords,
      sectorKeywords: match.sectorKeywords,
      evidence: [`主营/行业关键词命中：${match.matchedKeywords.join("、")}`],
      blockers: membership ? [`成分股证据来自 ${membership.name}，与当前主线 ${sector.name} 不完全一致，需继续校验。`] : ["缺少成分股直接证据，仅按主营业务匹配。"],
      evidenceChain: {
        constituentEvidence: membership ? [`存在其他板块成分证据：${membership.name}(${membership.boardCode})`] : [],
        businessEvidence: [`主营/行业关键词：${match.matchedKeywords.join("、")}`],
        industryChainEvidence: [inferIndustryChainPosition(String(profile?.business ?? ""), String(profile?.industry ?? ""), sector.name)]
          .filter((item) => item !== "unknown")
          .map((item) => `产业链位置推断：${item}`),
        negativeEvidence: membership ? [`成分股板块 ${membership.name} 与目标主线 ${sector.name} 不一致`] : ["缺少当前主线成分股直接证据"],
        sourceQuality: "inferred",
        reviewRequired: true,
        reviewReason: "仅由主营/行业关键词归纳，缺少成分股直接证据，适合观察但不应当成主线核心。"
      },
      confidence: "中",
      shouldExclude: false,
      reason: `${stockName} 主营业务与当前主线 ${sector.name} 存在直接关键词匹配，但缺少成分股证据，按中等置信纳入观察。`
    };
  }

  const supplyMatches = sectors
    .map((sector) => ({ sector, match: matchBusinessToSector(profile, sector.name) }))
    .filter((item) => item.match.level === "supply");
  if (supplyMatches.length) {
    const { sector, match } = supplyMatches[0];
    return {
      status: "supply_chain_related",
      matchedSector: sector.name,
      membershipSector: membership?.name,
      normalizedMembershipSector: membership ? normalizeSectorName(membership.name) : undefined,
      businessKeywords: match.matchedKeywords,
      sectorKeywords: match.sectorKeywords,
      evidence: [`产业链弱相关关键词：${match.matchedKeywords.join("、")}`],
      blockers: ["没有当前主线成分股证据", "主营业务不是该主线的直接业务口径，不能自动进入候选池"],
      evidenceChain: {
        constituentEvidence: membership ? [`存在其他板块成分证据：${membership.name}(${membership.boardCode})`] : [],
        businessEvidence: [],
        industryChainEvidence: [`产业链弱相关关键词：${match.matchedKeywords.join("、")}`],
        negativeEvidence: ["没有当前主线成分股证据", "主营业务不是该主线的直接业务口径"],
        sourceQuality: "weak",
        reviewRequired: true,
        reviewReason: "仅产业链弱相关，不能自动进入候选池。"
      },
      confidence: "低",
      shouldExclude: true,
      reason: `${stockName} 与 ${sector.name} 仅存在产业链或题材弱相关，证据不足，剔除出候选股信号表。`
    };
  }

  const hasProfile = Boolean(`${profile?.business ?? ""}${profile?.industry ?? ""}${profile?.sector ?? ""}`.trim());
  return {
    status: hasProfile ? "mismatch" : "unknown",
    membershipSector: membership?.name,
    normalizedMembershipSector: membership ? normalizeSectorName(membership.name) : undefined,
    businessKeywords: [],
    sectorKeywords: sectors.map((sector) => sector.name),
    evidence: hasProfile ? [`主营/行业：${profileText(profile)}`] : [],
    blockers: hasProfile ? ["主营业务与当前主线缺少直接匹配证据", "未发现当前主线成分股证据"] : ["公司基础信息缺失", "未发现当前主线成分股证据"],
    evidenceChain: {
      constituentEvidence: membership ? [`存在非当前主线成分证据：${membership.name}(${membership.boardCode})`] : [],
      businessEvidence: hasProfile ? [`主营/行业：${profileText(profile)}`] : [],
      industryChainEvidence: [],
      negativeEvidence: hasProfile ? ["主营业务与当前主线缺少直接匹配证据", "未发现当前主线成分股证据"] : ["公司基础信息缺失", "未发现当前主线成分股证据"],
      sourceQuality: hasProfile ? "weak" : "missing",
      reviewRequired: true,
      reviewReason: hasProfile ? "主营资料存在但无法匹配当前主线，应剔除或人工复核。" : "公司基础信息缺失，无法建立主线归属。"
    },
    confidence: "低",
    shouldExclude: true,
    reason: hasProfile
      ? `${stockName} 主营业务与当前主线缺少直接匹配证据，标记为主题偏离并剔除。`
      : `${stockName} 缺少公司基础信息和当前主线成分股证据，标记为数据不足并剔除。`
  };
}

export {
  businessMatchesSector,
  formatAttributionStatus,
  inferIndustryChainPosition
} from "@/lib/strategy/candidateBusinessMatchRules";
