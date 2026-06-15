"use client";

import { PlanLine } from "@/components/ResearchCompanyUi";

export function CompanyInfoBlock({ title, lines, empty }: { title: string; lines: Array<[string, string | undefined]>; empty: string }) {
  const visible = lines.filter(([, value]) => value && value !== "缺失");
  return (
    <div className="rounded-lg border border-line bg-bg/60 p-3 text-sm">
      <p className="font-medium">{title}</p>
      {visible.length ? (
        <div className="mt-3 grid gap-2">
          {visible.map(([label, value]) => (
            <PlanLine key={label} label={label} value={value ?? ""} />
          ))}
        </div>
      ) : (
        <p className="mt-2 text-muted">{empty}</p>
      )}
    </div>
  );
}
