import { uniqueText } from "@/lib/selection/scoring-utils";
import type { StockCandidate } from "@/lib/types";

export function isBankLike(candidate: StockCandidate) {
  const text = [
    candidate.name,
    candidate.sectorName,
    candidate.companyKnowledge.industry,
    candidate.companyKnowledge.mainBusiness,
    candidate.companyKnowledge.coreBusiness
  ].join(" ");
  return /银行|农商行|城商行/i.test(text);
}

export function isLowVolFinancial(candidate: StockCandidate) {
  const text = [
    candidate.name,
    candidate.sectorName,
    candidate.companyKnowledge.industry,
    candidate.companyKnowledge.mainBusiness,
    candidate.companyKnowledge.coreBusiness
  ].join(" ");
  return /银行|农商行|城商行|保险|证券|券商|信托|金融/i.test(text);
}

export function isLargeCap(candidate: StockCandidate, thresholdYi = 1000) {
  const value = candidate.quote?.floatMarketValue;
  return value !== undefined && value / 100_000_000 >= thresholdYi;
}

export function financialEvidenceRefs(candidate: StockCandidate, extra: string[] = []) {
  return uniqueText(
    [
      ...candidate.evidenceRefs,
      ...(candidate.companyKnowledge.financialSummary ? [`company.${candidate.code}.financial.summary`] : []),
      ...(candidate.companyKnowledge.mainBusiness ? [`company.${candidate.code}.business`] : []),
      ...(candidate.companyKnowledge.shareholderSummary ? [`company.${candidate.code}.shareholder.summary`] : []),
      `stock.${candidate.code}.technical.ma20`,
      `stock.${candidate.code}.fund.quality`,
      `rule.stock.${candidate.code}.activity`,
      ...extra
    ],
    12
  );
}

export function hasValidPe(candidate: StockCandidate) {
  const pe = candidate.quote?.peTtm;
  return pe !== undefined && Number.isFinite(pe) && pe > 0;
}

export function hasValidPb(candidate: StockCandidate) {
  const pb = candidate.quote?.pb;
  return pb !== undefined && Number.isFinite(pb) && pb > 0;
}

export function growthAtLeast(value: number | undefined, threshold: number) {
  return value !== undefined && Number.isFinite(value) && value >= threshold;
}

export function formatYi(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return "缺失";
  return `${(value / 100_000_000).toFixed(0)}亿`;
}
