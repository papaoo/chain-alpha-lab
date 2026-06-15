import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  BrainCircuit,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Database,
  FileText,
  Flame,
  Gauge,
  Layers3,
  LineChart,
  LockKeyhole,
  Network,
  Radio,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users
} from "lucide-react";

type DemoKey = "clear" | "radar" | "studio";

const demos: Array<{
  key: DemoKey;
  title: string;
  subtitle: string;
  accent: string;
  href: string;
  image: string;
}> = [
  {
    key: "clear",
    title: "Clear Console",
    subtitle: "白底、细边框、左侧菜单，适合正式后台长期演进。",
    accent: "from-sky-500 to-cyan-400",
    href: "/demos/clear",
    image: "https://images.unsplash.com/photo-1642790106117-e829e14a795f?auto=format&fit=crop&w=1200&q=80"
  },
  {
    key: "radar",
    title: "Market Radar",
    subtitle: "数据杂志感，突出温度计、热力、时间轴和证据链。",
    accent: "from-emerald-500 to-lime-400",
    href: "/demos/radar",
    image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1200&q=80"
  },
  {
    key: "studio",
    title: "Research Studio",
    subtitle: "更产品化的投研工作台，适合加入用户、权限和协作。",
    accent: "from-indigo-500 to-blue-400",
    href: "/demos/studio",
    image: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1200&q=80"
  }
];

const menu = [
  ["总览", Gauge],
  ["主线研判", TrendingUp],
  ["候选股池", Building2],
  ["证据链", Network],
  ["研报中心", FileText],
  ["模型配置", BrainCircuit],
  ["用户权限", Users],
  ["系统设置", Settings]
] as const;

const sectors = [
  { name: "算力基础设施", score: 91, change: "+8.6%", state: "主升延续", heat: "bg-sky-500" },
  { name: "机器人执行器", score: 84, change: "+5.1%", state: "轮动加强", heat: "bg-cyan-500" },
  { name: "低空经济", score: 78, change: "+3.7%", state: "分歧修复", heat: "bg-indigo-500" },
  { name: "创新药", score: 69, change: "+1.9%", state: "观察回流", heat: "bg-violet-500" }
];

const candidates = [
  { code: "300124", name: "汇川技术", sector: "机器人执行器", role: "中军", trend: "MA20 上方", action: "等待回踩", score: 88, risk: "不追高" },
  { code: "002230", name: "科大讯飞", sector: "算力应用", role: "弹性", trend: "放量突破", action: "小仓试错", score: 82, risk: "量能需确认" },
  { code: "600839", name: "四川长虹", sector: "算力基础设施", role: "龙头", trend: "强趋势", action: "持有观察", score: 91, risk: "高位波动" },
  { code: "688256", name: "寒武纪", sector: "AI 芯片", role: "趋势核心", trend: "强势整理", action: "等待低吸", score: 86, risk: "估值敏感" },
  { code: "300750", name: "宁德时代", sector: "新能车", role: "权重", trend: "箱体修复", action: "观察", score: 72, risk: "主线弱化" }
];

const evidence = [
  { time: "09:42", label: "北向资金净流入", detail: "沪深 300 权重回暖，风险偏好从防御转向成长。", level: "data" },
  { time: "10:18", label: "算力板块放量", detail: "板块成交额较 5 日均值提升 34%，龙头维持 MA20 上方。", level: "rule" },
  { time: "11:05", label: "候选股完整性校验", detail: "5 只候选股中 4 只具备 K 线、资金、公司画像字段。", level: "check" },
  { time: "13:36", label: "模型输出验证", detail: "模型结论引用事实 27 条，未越过仓位和追高约束。", level: "model" }
];

const users = [
  { name: "投研管理员", count: 3, access: "全部菜单、模型配置、用户权限" },
  { name: "研究员", count: 12, access: "研报、候选股池、证据链" },
  { name: "只读观察员", count: 26, access: "总览、研报中心" }
];

export function DemoIndexPage() {
  return (
    <main className="min-h-[100dvh] bg-[#f6f8fb] px-5 py-8 text-[#172033]">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col justify-between gap-5 rounded-[28px] border border-white bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] md:flex-row md:items-end">
          <div>
            <p className="text-sm font-semibold text-sky-600">A 股主线趋势助手 UI 方向探索</p>
            <h1 className="mt-3 max-w-4xl text-4xl font-semibold leading-tight tracking-normal text-[#111827] md:text-5xl">
              三套静态后台展示页，用来选择未来产品气质
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
              所有页面都是静态数据，重点展示左侧菜单、白色科技风、多卡片布局、温度图、时间轴、证据链和权限扩展入口。
            </p>
          </div>
          <Link href="/" className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700">
            返回当前系统 <ArrowRight size={16} />
          </Link>
        </div>
        <div className="grid gap-5 lg:grid-cols-3">
          {demos.map((demo) => (
            <Link
              key={demo.key}
              href={demo.href}
              className="group overflow-hidden rounded-[24px] border border-white bg-white shadow-[0_24px_70px_rgba(15,23,42,0.08)] transition hover:-translate-y-1 hover:shadow-[0_30px_90px_rgba(15,23,42,0.14)]"
            >
              <div className="relative h-56 overflow-hidden">
                <img className="h-full w-full object-cover transition duration-500 group-hover:scale-105" src={demo.image} alt={demo.title} />
                <div className={`absolute inset-x-4 bottom-4 h-2 rounded-full bg-gradient-to-r ${demo.accent}`} />
              </div>
              <div className="p-5">
                <h2 className="text-2xl font-semibold text-slate-950">{demo.title}</h2>
                <p className="mt-2 min-h-12 text-sm leading-6 text-slate-600">{demo.subtitle}</p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-sky-700">
                  打开静态 demo <ChevronRight size={16} />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}

export function ClearConsoleDemo() {
  return (
    <DemoFrame active="总览" brand="Mainline Console" tone="clear">
      <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <HeroPanel
          title="今日市场状态：结构性强势"
          subtitle="算力、机器人、低空经济形成主线轮动，风险来自高位成交拥挤和午后缩量。"
          score={82}
          image="https://images.unsplash.com/photo-1518186285589-2f7649de83e0?auto=format&fit=crop&w=1200&q=80"
        />
        <TemperatureCard score={82} label="大盘风险偏好" caption="温度处于进攻区，但未进入极端过热。" />
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <Card title="主线热度" icon={Flame}>
          <div className="grid gap-3">
            {sectors.map((item) => (
              <div key={item.name} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">{item.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.state}</p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-emerald-600 shadow-sm">{item.change}</span>
                </div>
                <div className="mt-4 h-2 rounded-full bg-slate-200">
                  <div className={`h-2 rounded-full ${item.heat}`} style={{ width: `${item.score}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
        <CandidateTable compact={false} />
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-3">
        <EvidenceTimeline />
        <CompanyProfile />
        <PermissionPreview />
      </section>
    </DemoFrame>
  );
}

export function MarketRadarDemo() {
  return (
    <DemoFrame active="主线研判" brand="Market Radar" tone="radar">
      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[32px] bg-[#10251f] p-6 text-white shadow-[0_24px_80px_rgba(16,37,31,0.22)]">
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-emerald-300 px-3 py-1 text-xs font-bold text-emerald-950">LIVE RADAR</span>
            <Radio className="text-emerald-200" size={22} />
          </div>
          <h1 className="mt-8 max-w-xl text-4xl font-semibold leading-tight tracking-normal">主线能量从扩散进入筛选</h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-emerald-50/80">
            热点从多方向试探收敛到算力基础设施和机器人执行器。策略上降低追涨，强化回踩确认和证据引用。
          </p>
          <div className="mt-8 grid grid-cols-3 gap-3">
            {["成交扩散", "资金确认", "模型验证"].map((item, index) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-white/10 p-4">
                <p className="text-xs text-emerald-100/70">{item}</p>
                <p className="mt-2 text-2xl font-semibold">{[76, 84, 91][index]}</p>
              </div>
            ))}
          </div>
        </div>
        <HeatMapPanel />
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <EvidenceGraph />
        <Card title="主线时间轴" icon={CalendarClock}>
          <div className="space-y-4">
            {evidence.map((item) => (
              <div key={item.time} className="grid grid-cols-[56px_1fr] gap-3">
                <span className="font-mono text-xs font-semibold text-emerald-700">{item.time}</span>
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
                  <p className="font-semibold text-slate-950">{item.label}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <TemperatureCard score={76} label="追涨风险温度" caption="越接近 100，越需要等待回踩或降级仓位。" />
        <CandidateTable compact />
      </section>
    </DemoFrame>
  );
}

export function ResearchStudioDemo() {
  return (
    <DemoFrame active="研报中心" brand="Research Studio" tone="studio">
      <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="overflow-hidden rounded-[30px] border border-indigo-100 bg-white shadow-[0_24px_80px_rgba(30,64,175,0.10)]">
          <div className="grid min-h-[340px] md:grid-cols-[1fr_0.85fr]">
            <div className="p-7">
              <div className="flex w-fit items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-700">
                <Sparkles size={15} /> 协作型投研工作台
              </div>
              <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-normal text-slate-950">从报告生成到权限分发，一屏完成</h1>
              <p className="mt-4 max-w-xl text-sm leading-7 text-slate-600">
                未来可以把用户、角色、报告审批、模型审计放进同一个产品壳。研究员看到研究任务，管理员看到权限和运行质量。
              </p>
              <div className="mt-7 grid gap-3 sm:grid-cols-3">
                <MiniStat label="今日报告" value="18" />
                <MiniStat label="待审证据" value="42" />
                <MiniStat label="有效用户" value="41" />
              </div>
            </div>
            <img className="h-full min-h-[280px] w-full object-cover" src="https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1000&q=80" alt="Research workspace" />
          </div>
        </div>
        <Card title="运行队列" icon={Activity}>
          <div className="space-y-3">
            {["08:50 数据源同步", "09:20 规则引擎执行", "10:05 模型审计", "14:30 报告分发"].map((item, index) => (
              <div key={item} className="flex items-center justify-between rounded-2xl bg-indigo-50 p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-indigo-600 shadow-sm">{index + 1}</span>
                  <p className="font-medium text-slate-800">{item}</p>
                </div>
                <CheckCircle2 className="text-indigo-500" size={18} />
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <PermissionPreview />
        <ReportCards />
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-3">
        <CompanyProfile />
        <EvidenceTimeline />
        <TemperatureCard score={68} label="组合暴露风险" caption="主题集中度可控，单票仓位建议不超过 8%。" />
      </section>
    </DemoFrame>
  );
}

function DemoFrame({
  children,
  active,
  brand,
  tone
}: {
  children: React.ReactNode;
  active: string;
  brand: string;
  tone: "clear" | "radar" | "studio";
}) {
  const toneClass = tone === "radar" ? "bg-[#f3f8f2]" : tone === "studio" ? "bg-[#f5f6ff]" : "bg-[#f6f8fb]";
  return (
    <main className={`min-h-[100dvh] ${toneClass} text-slate-900`}>
      <div className="grid min-h-[100dvh] lg:grid-cols-[280px_1fr]">
        <aside className="border-r border-slate-200/80 bg-white px-5 py-5">
          <Link href="/demos" className="flex items-center gap-3 rounded-2xl bg-slate-950 p-3 text-white">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
              <LineChart size={20} />
            </span>
            <div>
              <p className="font-semibold">{brand}</p>
              <p className="text-xs text-white/60">A-share research OS</p>
            </div>
          </Link>
          <nav className="mt-6 space-y-1">
            {menu.map(([label, Icon]) => (
              <button
                key={label}
                className={`flex w-full items-center justify-between rounded-2xl px-3 py-3 text-sm font-medium transition ${
                  active === label ? "bg-sky-50 text-sky-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                }`}
                type="button"
              >
                <span className="flex items-center gap-3">
                  <Icon size={18} />
                  {label}
                </span>
                {active === label ? <CircleDot size={14} /> : null}
              </button>
            ))}
          </nav>
          <div className="mt-6 rounded-3xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex items-center gap-3">
              <img className="h-11 w-11 rounded-full object-cover" src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80" alt="Analyst avatar" />
              <div>
                <p className="text-sm font-semibold">研究管理员</p>
                <p className="text-xs text-slate-500">全局权限</p>
              </div>
            </div>
          </div>
        </aside>
        <div className="min-w-0">
          <header className="sticky top-0 z-20 border-b border-white/70 bg-white/80 px-5 py-4 backdrop-blur">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500">静态 UI Demo</p>
                <h2 className="text-xl font-semibold text-slate-950">{active}</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500">
                  <Search size={16} /> 搜索股票、板块、证据
                </div>
                <button className="rounded-full border border-slate-200 bg-white p-2 text-slate-600" type="button">
                  <Bell size={18} />
                </button>
                <button className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white" type="button">
                  生成今日研报
                </button>
              </div>
            </div>
          </header>
          <div className="p-5 xl:p-7">{children}</div>
        </div>
      </div>
    </main>
  );
}

function HeroPanel({ title, subtitle, score, image }: { title: string; subtitle: string; score: number; image: string }) {
  return (
    <div className="overflow-hidden rounded-[30px] border border-white bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
      <div className="grid md:grid-cols-[1fr_0.7fr]">
        <div className="p-7">
          <span className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-sm font-semibold text-sky-700">
            <Activity size={15} /> Real data ready
          </span>
          <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-normal text-slate-950">{title}</h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-slate-600">{subtitle}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <MiniStat label="大盘评分" value={String(score)} />
            <MiniStat label="候选股票" value="5" />
            <MiniStat label="证据数量" value="27" />
          </div>
        </div>
        <img className="h-full min-h-[310px] w-full object-cover" src={image} alt="Market dashboard material" />
      </div>
    </div>
  );
}

function Card({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="rounded-[28px] border border-white bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.07)]">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
            <Icon size={19} />
          </span>
          <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
        </div>
        <ChevronRight className="text-slate-300" size={18} />
      </div>
      {children}
    </div>
  );
}

function TemperatureCard({ score, label, caption }: { score: number; label: string; caption: string }) {
  const bands = ["#22c55e", "#84cc16", "#eab308", "#f97316", "#ef4444"];
  return (
    <Card title={label} icon={Gauge}>
      <div className="grid gap-5 md:grid-cols-[180px_1fr] md:items-center">
        <div className="relative mx-auto h-44 w-44 rounded-full bg-[conic-gradient(from_210deg,#22c55e_0deg,#84cc16_70deg,#eab308_135deg,#f97316_205deg,#ef4444_280deg,#e2e8f0_281deg)] p-4">
          <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white shadow-inner">
            <p className="text-5xl font-semibold text-slate-950">{score}</p>
            <p className="text-xs font-semibold text-slate-500">/ 100</p>
          </div>
          <span
            className="absolute left-1/2 top-1/2 h-1.5 w-20 origin-left rounded-full bg-slate-950"
            style={{ transform: `rotate(${210 + score * 2.55}deg)` }}
          />
        </div>
        <div>
          <p className="text-sm leading-7 text-slate-600">{caption}</p>
          <div className="mt-5 grid grid-cols-5 gap-2">
            {bands.map((color, index) => (
              <div key={color} className="h-24 rounded-2xl" style={{ backgroundColor: color, opacity: 0.35 + index * 0.12 }} />
            ))}
          </div>
          <div className="mt-3 flex justify-between text-xs font-medium text-slate-400">
            <span>冰点</span>
            <span>平衡</span>
            <span>过热</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

function CandidateTable({ compact }: { compact: boolean }) {
  return (
    <Card title="候选股池" icon={BarChart3}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-slate-500">
              <th className="pb-3">股票</th>
              <th className="pb-3">主线</th>
              <th className="pb-3">角色</th>
              <th className="pb-3">趋势</th>
              <th className="pb-3">动作</th>
              <th className="pb-3">评分</th>
              {!compact ? <th className="pb-3">风险</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {candidates.map((item) => (
              <tr key={item.code} className="hover:bg-slate-50">
                <td className="py-3">
                  <p className="font-semibold text-slate-950">{item.name}</p>
                  <p className="font-mono text-xs text-slate-400">{item.code}</p>
                </td>
                <td className="text-slate-600">{item.sector}</td>
                <td>
                  <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">{item.role}</span>
                </td>
                <td className="text-slate-600">{item.trend}</td>
                <td className="font-semibold text-slate-800">{item.action}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{item.score}</span>
                    <div className="h-2 w-16 rounded-full bg-slate-100">
                      <div className="h-2 rounded-full bg-sky-500" style={{ width: `${item.score}%` }} />
                    </div>
                  </div>
                </td>
                {!compact ? <td className="text-slate-500">{item.risk}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function EvidenceTimeline() {
  return (
    <Card title="证据时间轴" icon={Database}>
      <div className="relative space-y-4 before:absolute before:left-[17px] before:top-2 before:h-[calc(100%-16px)] before:w-px before:bg-slate-200">
        {evidence.map((item) => (
          <div key={item.time} className="relative grid grid-cols-[36px_1fr] gap-3">
            <span className="relative z-10 mt-1 flex h-9 w-9 items-center justify-center rounded-full bg-slate-950 text-white">
              <CircleDot size={15} />
            </span>
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-slate-950">{item.label}</p>
                <span className="font-mono text-xs text-slate-400">{item.time}</span>
              </div>
              <p className="mt-1 text-sm leading-6 text-slate-600">{item.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function CompanyProfile() {
  return (
    <Card title="公司侧边卡" icon={Building2}>
      <div className="overflow-hidden rounded-3xl bg-slate-950 text-white">
        <img className="h-36 w-full object-cover opacity-80" src="https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=900&q=80" alt="Company building" />
        <div className="p-5">
          <p className="text-2xl font-semibold">寒武纪</p>
          <p className="mt-1 font-mono text-xs text-white/50">688256 / AI 芯片</p>
          <p className="mt-4 text-sm leading-7 text-white/70">
            公司核心业务围绕智能芯片和云边端加速卡，主题匹配度强，但估值弹性和成交拥挤是主要约束。
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <MiniDark label="主题匹配" value="Strong" />
            <MiniDark label="仓位上限" value="8%" />
          </div>
        </div>
      </div>
    </Card>
  );
}

function PermissionPreview() {
  return (
    <Card title="用户与权限预留" icon={ShieldCheck}>
      <div className="space-y-3">
        {users.map((item) => (
          <div key={item.name} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm">
                  <LockKeyhole size={17} />
                </span>
                <div>
                  <p className="font-semibold text-slate-950">{item.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.access}</p>
                </div>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-slate-700 shadow-sm">{item.count}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function HeatMapPanel() {
  const cells = Array.from({ length: 48 }, (_, index) => ({
    id: index,
    value: 28 + ((index * 17) % 70),
    label: ["AI", "机器人", "低空", "芯片", "医药", "电力"][index % 6]
  }));
  return (
    <Card title="板块热力图" icon={Layers3}>
      <div className="grid grid-cols-6 gap-2">
        {cells.map((cell) => (
          <div
            key={cell.id}
            className="flex aspect-square flex-col justify-between rounded-2xl p-2 text-xs font-semibold"
            style={{
              backgroundColor: `rgba(16, 185, 129, ${0.18 + cell.value / 150})`,
              color: cell.value > 70 ? "#064e3b" : "#475569"
            }}
          >
            <span>{cell.label}</span>
            <span>{cell.value}</span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-600">热力图用于快速看板块扩散，颜色越深代表成交和强度组合评分越高。</p>
    </Card>
  );
}

function EvidenceGraph() {
  const nodes = [
    ["数据源", "WeStock / Eastmoney", "left-[4%] top-[34%]"],
    ["事实包", "27 facts", "left-[31%] top-[15%]"],
    ["规则引擎", "趋势 / 风险 / 仓位", "left-[31%] top-[58%]"],
    ["模型验证", "引用约束", "left-[62%] top-[34%]"],
    ["研报输出", "可追溯结论", "left-[80%] top-[34%]"]
  ];
  return (
    <Card title="证据链节点图" icon={Network}>
      <div className="relative h-[360px] overflow-hidden rounded-3xl bg-slate-950">
        <img className="absolute inset-0 h-full w-full object-cover opacity-25" src="https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1200&q=80" alt="Data network background" />
        <div className="absolute left-[16%] top-[47%] h-px w-[70%] bg-emerald-300/60" />
        <div className="absolute left-[38%] top-[29%] h-[38%] w-px bg-emerald-300/40" />
        {nodes.map(([title, meta, position]) => (
          <div key={title} className={`absolute ${position} w-36 rounded-2xl border border-white/10 bg-white/90 p-3 shadow-xl`}>
            <p className="font-semibold text-slate-950">{title}</p>
            <p className="mt-1 text-xs text-slate-500">{meta}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ReportCards() {
  const reports = [
    { title: "算力主线复盘", status: "已通过", desc: "模型引用 12 条事实，仓位约束完整。" },
    { title: "机器人午后更新", status: "待审核", desc: "缺少一条资金流证据，需要研究员确认。" },
    { title: "低空经济观察池", status: "只读", desc: "主题热度下降，保留观察名单。" }
  ];
  return (
    <Card title="研报中心" icon={FileText}>
      <div className="grid gap-3 md:grid-cols-3">
        {reports.map((report) => (
          <div key={report.title} className="rounded-3xl border border-slate-100 bg-slate-50 p-5">
            <div className="flex items-center justify-between gap-3">
              <FileText className="text-indigo-500" size={22} />
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-indigo-700 shadow-sm">{report.status}</span>
            </div>
            <p className="mt-5 text-lg font-semibold text-slate-950">{report.title}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{report.desc}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-28 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function MiniDark({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/10 p-3">
      <p className="text-xs text-white/50">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
