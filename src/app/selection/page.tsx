import Link from "next/link";
import { ArrowLeft, History } from "lucide-react";
import { SelectionWorkspace } from "@/components/SelectionWorkspace";

export default function SelectionPage() {
  return (
    <main className="min-h-screen bg-bg px-4 py-6 text-slate-100 md:px-8">
      <div className="mx-auto grid max-w-7xl gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/mainline" className="inline-flex items-center gap-2 text-sm text-muted hover:text-info">
            <ArrowLeft size={16} />
            返回主线驾驶舱
          </Link>
          <Link
            href="/selection/runs"
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel/80 px-3 py-2 text-sm text-muted hover:border-info/40 hover:text-info"
          >
            <History size={16} />
            查看运行记录
          </Link>
        </div>
        <SelectionWorkspace />
      </div>
    </main>
  );
}
