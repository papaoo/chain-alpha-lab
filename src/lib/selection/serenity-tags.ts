import { buildSerenityTagMap, DEFAULT_SERENITY_TAG_LOOKBACK } from "@/lib/serenity/tags";
import { normalizeStockCode } from "@/lib/strategy/candidateUtils";
import type { SelectionPick } from "@/lib/selection/types";

type SerenityTag = NonNullable<SelectionPick["serenityTag"]>;

export function attachSerenityTagsToPicks(picks: SelectionPick[], lookback = DEFAULT_SERENITY_TAG_LOOKBACK): SelectionPick[] {
  if (!picks.length) return picks;
  const tagMap = buildSerenityTagMap({ lookback, codes: picks.map((pick) => pick.code) }) as Map<string, SerenityTag>;
  if (!tagMap.size) return picks;
  return picks.map((pick) => {
    const tag = tagMap.get(normalizeStockCode(pick.code));
    return tag ? { ...pick, serenityTag: tag } : pick;
  });
}
