"use client";

import { localizeText } from "@/components/ResearchCompanyFormatters";

export function CompanyBulletBlock({ title, items, empty, tone = "normal" }: { title: string; items: string[]; empty: string; tone?: "normal" | "warn" }) {
  const cls = tone === "warn" ? "border-warn/30 bg-warn/10 text-warn" : "border-line bg-bg/60 text-muted";
  const safeItems = Array.isArray(items) ? items : [];
  return (
    <div className={`rounded-lg border p-3 text-sm ${cls}`}>
      <p className="font-medium text-text">{title}</p>
      {safeItems.length ? (
        <div className="mt-3 space-y-2">
          {safeItems.slice(0, 5).map((item, index) => (
            <p key={`${item}-${index}`} className="text-xs leading-5">{localizeText(item)}</p>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs leading-5">{empty}</p>
      )}
    </div>
  );
}
