import { eastmoneyAdapter } from "@/lib/eastmoney/adapter";
import type { DataProviderId, SectorConstituentSnapshot } from "@/lib/types";

export type SerenityCandidateSectorHint = {
  name: string;
  type: "industry" | "concept";
  layer: string;
};

export type SerenityCandidateUniverseFetchResult = {
  hint: SerenityCandidateSectorHint;
  result: {
    data: SectorConstituentSnapshot | null;
    warnings: string[];
    sourceUrl?: string;
  };
};

export type SerenityCandidateUniverseProviderSource = {
  provider: DataProviderId;
  role: "primary" | "planned_fallback";
  fields: string[];
  note: string;
};

const SOURCES: SerenityCandidateUniverseProviderSource[] = [
  {
    provider: "eastmoney_public",
    role: "primary",
    fields: ["板块代码映射", "行业/概念成分股", "涨跌幅", "成交额", "换手率", "主力净流入"],
    note: "用于从主题映射到 A 股候选池，只能证明市场板块归属，不能直接证明供应链瓶颈。"
  },
  {
    provider: "tushare",
    role: "planned_fallback",
    fields: ["行业分类", "基础行情", "主题成分补充"],
    note: "后续作为板块映射失败时的补源，避免单一公开接口变更导致候选池为空。"
  }
];

export class SerenityCandidateUniverseProvider {
  describe() {
    return {
      name: "SerenityCandidateUniverseProvider",
      providers: SOURCES,
      contract: "为 Serenity 主题研究生成 A 股候选公司初始池，返回板块成分、来源和 warnings。",
      boundary: "只负责候选池数据来源，不负责供应链评分、证据强弱判断、交易建议或 LLM 结论。"
    };
  }

  async fetchSectorConstituents(
    hints: SerenityCandidateSectorHint[],
    options: { timeoutMs?: number; retries?: number } = {}
  ): Promise<SerenityCandidateUniverseFetchResult[]> {
    return Promise.all(
      hints.map(async (hint) => {
        const result = await eastmoneyAdapter.getSectorConstituents(hint.name, hint.type, options).catch((error) => ({
          data: null,
          warnings: [`东方财富板块成分获取失败：${hint.name} ${error instanceof Error ? error.message : String(error)}`],
          sourceUrl: undefined
        }));
        return { hint, result };
      })
    );
  }
}

export const serenityCandidateUniverseProvider = new SerenityCandidateUniverseProvider();
