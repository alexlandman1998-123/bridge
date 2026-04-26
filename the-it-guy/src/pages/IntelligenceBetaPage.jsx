import {
  Activity,
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  Building2,
  ChevronRight,
  Landmark,
  Lightbulb,
  Radar,
  Scale,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users2,
} from 'lucide-react'
import { useMemo } from 'react'
import { useWorkspace } from '../context/WorkspaceContext'

function IntelligenceKpiCard({ title, value, subtext, icon: Icon, tone = 'blue' }) {
  const toneClass =
    tone === 'green'
      ? 'from-[#f3fcf8] to-[#f9fffc] border-[#d6ebdf]'
      : tone === 'amber'
        ? 'from-[#fffaf2] to-[#fffdf8] border-[#ece1cb]'
        : tone === 'indigo'
          ? 'from-[#f6f7ff] to-[#fcfcff] border-[#dfe2fa]'
          : 'from-[#f3f8ff] to-[#fbfdff] border-[#d7e5f4]'
  return (
    <article className={`rounded-[22px] border bg-gradient-to-br p-4 shadow-[0_12px_32px_rgba(15,23,42,0.06)] ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.75rem] font-semibold uppercase tracking-[0.1em] text-[#6e8298]">{title}</p>
          <p className="mt-2 text-[1.7rem] font-semibold leading-none tracking-[-0.04em] text-[#142132]">{value}</p>
        </div>
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#d6e4f3] bg-white/80 text-[#375f86]">
          <Icon size={17} />
        </span>
      </div>
      <p className="mt-3 text-[0.86rem] leading-6 text-[#6b7d93]">{subtext}</p>
    </article>
  )
}

function StatusBadge({ label, tone = 'neutral' }) {
  const className =
    tone === 'danger'
      ? 'border-[#efc9c8] bg-[#fff4f4] text-[#b54645]'
      : tone === 'warning'
        ? 'border-[#edd8b4] bg-[#fff9ef] text-[#a37627]'
        : tone === 'success'
          ? 'border-[#cae8d7] bg-[#f2fbf6] text-[#2b7c55]'
          : 'border-[#d9e5f2] bg-[#f7fafe] text-[#536b86]'
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${className}`}>{label}</span>
}

function IntelligenceInsightCard({ title, copy, icon: Icon, children, footer, className = '' }) {
  return (
    <article className={`rounded-[24px] border border-[#dce6f2] bg-white/75 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)] backdrop-blur-[1px] ${className}`.trim()}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[1.1rem] font-semibold tracking-[-0.025em] text-[#142132]">{title}</h3>
          <p className="mt-2 text-[0.93rem] leading-7 text-[#6b7d93]">{copy}</p>
        </div>
        {Icon ? (
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#d8e5f3] bg-[#f7fafe] text-[#375f86]">
            <Icon size={17} />
          </span>
        ) : null}
      </div>
      <div className="mt-4">{children}</div>
      {footer ? <div className="mt-4">{footer}</div> : null}
    </article>
  )
}

function MetricBar({ label, valueLabel, percent, tone = 'blue' }) {
  const color = tone === 'green' ? '#2f8a63' : tone === 'amber' ? '#b17c30' : '#3f78a8'
  return (
    <div className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[0.95rem] font-medium text-[#233448]">{label}</p>
        <p className="shrink-0 text-[0.95rem] font-semibold text-[#142132]">{valueLabel}</p>
      </div>
      <div className="mt-2.5 h-1.5 rounded-full bg-[#dfe8f3]">
        <span className="block h-full rounded-full" style={{ width: `${Math.max(4, Math.min(100, percent))}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

const DEVELOPER_DATA = {
  kpis: [
    {
      title: 'Predicted Sales Next 30 Days',
      value: '24 Units',
      subtext: '87% confidence based on current deal velocity',
      icon: TrendingUp,
      tone: 'blue',
    },
    {
      title: 'Revenue Forecast',
      value: 'R38.4M',
      subtext: 'Projected from active pipeline and buyer behaviour',
      icon: BarChart3,
      tone: 'indigo',
    },
    {
      title: 'Market Share by Value',
      value: '6.8%',
      subtext: 'Up 1.2% in Pretoria East',
      icon: Radar,
      tone: 'green',
    },
    {
      title: 'At-Risk Deals',
      value: '9',
      subtext: 'Pricing and finance delays detected',
      icon: AlertTriangle,
      tone: 'amber',
    },
    {
      title: 'Growth Opportunity',
      value: 'R112M',
      subtext: 'Undersupplied 2-bed segment identified',
      icon: Sparkles,
      tone: 'green',
    },
  ],
  assistant: [
    'Adjust Phase 2 pricing by 3–5% to improve absorption',
    'Prioritise 2-bed stock in next release',
    'Reduce dependency on top 2 agencies',
    'Explore Boksburg sectional title opportunity',
  ],
}

const ATTORNEY_DATA = {
  kpis: [
    {
      title: 'Predicted Registrations Next 30 Days',
      value: '31',
      subtext: '91% confidence based on current file progress',
      icon: Scale,
      tone: 'blue',
    },
    {
      title: 'Revenue Forecast',
      value: 'R2.7M',
      subtext: 'Projected from active transfer pipeline',
      icon: BarChart3,
      tone: 'indigo',
    },
    {
      title: 'Market Share by Volume',
      value: '4.4%',
      subtext: 'Up 0.8% across assigned regions',
      icon: Radar,
      tone: 'green',
    },
    {
      title: 'At-Risk Transfers',
      value: '7',
      subtext: 'FICA and guarantee delays detected',
      icon: AlertTriangle,
      tone: 'amber',
    },
    {
      title: 'New Partner Opportunities',
      value: '12',
      subtext: 'High-performing agents identified in network',
      icon: Users2,
      tone: 'green',
    },
  ],
  assistant: [
    'Prioritise 7 at-risk transfers today',
    'Follow up on guarantee delays',
    'Rebalance workload across transfer team',
    'Connect with 3 high-volume agents this week',
  ],
}

function DeveloperContent() {
  return (
    <>
      <IntelligenceInsightCard
        title="AI Development Strategy"
        copy="Bridge AI analyses live transaction behaviour to recommend what to build, where to build, and how to price it."
        icon={BrainCircuit}
        footer={<StatusBadge label="Confidence Score: 89%" tone="success" />}
      >
        <div className="grid gap-2.5">
          {[
            'Build more 2-bed units under R1.35M in Pretoria East',
            'Reduce exposure to bond-heavy buyer segments in Phase 2',
            'Release smaller units first to accelerate early cash flow',
          ].map((item) => (
            <div key={item} className="flex items-start gap-3 rounded-[14px] border border-[#dce7f3] bg-[#f9fcff] px-3.5 py-3">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#3f78a8]" />
              <p className="text-[0.92rem] leading-6 text-[#26384c]">{item}</p>
            </div>
          ))}
        </div>
      </IntelligenceInsightCard>

      <IntelligenceInsightCard
        title="Market Demand & Supply Gaps"
        copy="Live demand signals show where the market is undersupplied and which products are converting fastest."
        icon={TrendingUp}
      >
        <div className="grid gap-2.5">
          <MetricBar label="2-bed units" valueLabel="High demand / Low supply" percent={88} tone="green" />
          <MetricBar label="3-bed units" valueLabel="Stable demand / Moderate supply" percent={64} />
          <MetricBar label="Units above R1.8M" valueLabel="Slowing conversion" percent={35} tone="amber" />
          <MetricBar label="Cash buyers (selected nodes)" valueLabel="Increasing" percent={73} tone="green" />
        </div>
      </IntelligenceInsightCard>

      <IntelligenceInsightCard
        title="Business Risk Detection"
        copy="Bridge detects risks before they appear in retrospective reports."
        icon={AlertTriangle}
      >
        <div className="grid gap-2.5">
          <div className="flex items-center justify-between gap-3 rounded-[14px] border border-[#ebc9c9] bg-[#fff5f5] px-3.5 py-2.5">
            <p className="text-[0.9rem] text-[#8b4242]">62% of sales pipeline dependent on 2 agencies</p>
            <StatusBadge label="At Risk" tone="danger" />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-[14px] border border-[#edd8b4] bg-[#fffaf2] px-3.5 py-2.5">
            <p className="text-[0.9rem] text-[#7f5c23]">Finance delays increased by 14% this month</p>
            <StatusBadge label="Detected" tone="warning" />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-[14px] border border-[#edd8b4] bg-[#fffaf2] px-3.5 py-2.5">
            <p className="text-[0.9rem] text-[#7f5c23]">Deals above R1.6M showing higher fall-through risk</p>
            <StatusBadge label="Watch" tone="warning" />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-[14px] border border-[#ebc9c9] bg-[#fff5f5] px-3.5 py-2.5">
            <p className="text-[0.9rem] text-[#8b4242]">Phase 3 pricing may exceed current absorption levels</p>
            <StatusBadge label="At Risk" tone="danger" />
          </div>
        </div>
      </IntelligenceInsightCard>

      <IntelligenceInsightCard
        title="Growth & Network Opportunities"
        copy="Bridge identifies partners, suppliers, and areas that can unlock growth."
        icon={Lightbulb}
        footer={
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-[12px] border border-[#d4e3f2] bg-[#f5fafe] px-3.5 py-2 text-[0.86rem] font-semibold text-[#2f5f8b]"
          >
            View Recommended Partners <ChevronRight size={15} />
          </button>
        }
      >
        <div className="grid gap-2.5">
          {[
            '5 high-performing agencies recommended for Pretoria East',
            '3 bond originators showing faster approval performance',
            'Supplier opportunity: introduce preferred transfer support partner',
            'Growth node detected: Boksburg sectional title market',
          ].map((item) => (
            <div key={item} className="rounded-[14px] border border-[#dce7f3] bg-[#f9fcff] px-3.5 py-3 text-[0.9rem] text-[#26384c]">
              {item}
            </div>
          ))}
        </div>
      </IntelligenceInsightCard>
    </>
  )
}

function AttorneyContent() {
  return (
    <>
      <IntelligenceInsightCard
        title="Autonomous Transaction Engine"
        copy="Bridge AI monitors every transfer, triggers next steps, and escalates only when human attention is required."
        icon={Activity}
        footer={<StatusBadge label="AI Operating Layer Active" tone="success" />}
      >
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          {[
            ['42', 'active files monitored'],
            ['18', 'automatic client follow-ups triggered'],
            ['9', 'document requests issued'],
            ['5', 'files escalated for review'],
          ].map(([value, label]) => (
            <div key={label} className="rounded-[14px] border border-[#dce7f3] bg-[#f9fcff] px-3 py-3">
              <p className="text-[1.35rem] font-semibold tracking-[-0.03em] text-[#142132]">{value}</p>
              <p className="mt-1 text-[0.8rem] leading-5 text-[#5f738a]">{label}</p>
            </div>
          ))}
        </div>
      </IntelligenceInsightCard>

      <IntelligenceInsightCard
        title="Predictive Registration Engine"
        copy="Bridge predicts expected registration dates based on live file progress, partner response time, and transaction patterns."
        icon={ShieldCheck}
      >
        <div className="grid gap-2.5">
          <MetricBar label="Registrations predicted in next 30 days" valueLabel="31" percent={91} tone="green" />
          <MetricBar label="Likely to register within 10 business days" valueLabel="14 files" percent={74} />
          <MetricBar label="At risk of missing expected registration date" valueLabel="7 files" percent={36} tone="amber" />
          <MetricBar label="Average confidence score" valueLabel="91%" percent={91} tone="green" />
        </div>
      </IntelligenceInsightCard>

      <IntelligenceInsightCard
        title="Revenue & Market Position"
        copy="Bridge forecasts revenue and tracks the firm’s market position by value and volume."
        icon={Landmark}
      >
        <div className="grid grid-cols-2 gap-2.5">
          {[
            ['Projected revenue this month', 'R2.7M'],
            ['Market share by volume', '4.4%'],
            ['Market share by value', '5.1%'],
            ['Development transfers increased', '18%'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-[14px] border border-[#dce7f3] bg-[#f9fcff] px-3 py-3">
              <p className="text-[0.78rem] uppercase tracking-[0.09em] text-[#71859d]">{label}</p>
              <p className="mt-1 text-[1.22rem] font-semibold tracking-[-0.02em] text-[#142132]">{value}</p>
            </div>
          ))}
        </div>
      </IntelligenceInsightCard>

      <IntelligenceInsightCard
        title="Partner Growth Engine"
        copy="Bridge identifies new business opportunities through the transaction network."
        icon={Building2}
        footer={
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-[12px] border border-[#d4e3f2] bg-[#f5fafe] px-3.5 py-2 text-[0.86rem] font-semibold text-[#2f5f8b]"
          >
            View Growth Opportunities <ChevronRight size={15} />
          </button>
        }
      >
        <div className="grid gap-2.5">
          {[
            '12 high-value agent connections recommended',
            '4 developers with growing transaction volume identified',
            '2 under-served areas showing legal service demand',
            'Referral concentration risk detected: 58% from 3 partners',
          ].map((item) => (
            <div key={item} className="rounded-[14px] border border-[#dce7f3] bg-[#f9fcff] px-3.5 py-3 text-[0.9rem] text-[#26384c]">
              {item}
            </div>
          ))}
        </div>
      </IntelligenceInsightCard>
    </>
  )
}

export default function IntelligenceBetaPage() {
  const { role } = useWorkspace()
  const isAttorney = role === 'attorney'
  const personaData = useMemo(() => (isAttorney ? ATTORNEY_DATA : DEVELOPER_DATA), [isAttorney])
  const personaTitle = isAttorney ? 'Attorney Intelligence Preview' : 'Developer Intelligence Preview'

  return (
    <section className="space-y-5">
      <header className="rounded-[24px] border border-[#d7e4f2] bg-[linear-gradient(135deg,#f4f8fd_0%,#fbfdff_45%,#f7fbff_100%)] px-5 py-6 shadow-[0_14px_34px_rgba(15,23,42,0.06)] md:px-7">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-[1.6rem] font-semibold tracking-[-0.03em] text-[#142132]">Intelligence (Beta)</h1>
              <p className="mt-2 max-w-[980px] text-[0.98rem] leading-7 text-[#5f738a]">
                Autonomous, predictive, revenue-driven intelligence powered by live transaction data across the property ecosystem.
              </p>
            </div>
            <span className="inline-flex items-center rounded-full border border-[#d7e4f2] bg-white/80 px-3 py-1.5 text-[0.76rem] font-semibold uppercase tracking-[0.09em] text-[#46698d]">
              Preview Mode — simulated data for demonstration
            </span>
          </div>
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#d7e4f2] bg-white/70 px-3 py-1.5 text-[0.8rem] font-medium text-[#53708f]">
            <Sparkles size={14} />
            {personaTitle}
          </div>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {personaData.kpis.map((item) => (
          <IntelligenceKpiCard key={item.title} {...item} />
        ))}
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <div className="grid gap-4 md:grid-cols-2">
          {isAttorney ? <AttorneyContent /> : <DeveloperContent />}
        </div>

        <aside className="rounded-[24px] border border-[#dce6f2] bg-[linear-gradient(180deg,#fbfdff_0%,#f6fafe_100%)] p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#d7e4f2] bg-white text-[#365e86]">
              <BrainCircuit size={15} />
            </span>
            <h2 className="text-[1.03rem] font-semibold tracking-[-0.02em] text-[#152538]">Bridge AI Recommendations</h2>
          </div>
          <div className="mt-4 grid gap-2.5">
            {personaData.assistant.map((item) => (
              <div key={item} className="rounded-[14px] border border-[#dce6f2] bg-white px-3.5 py-3 text-[0.9rem] leading-6 text-[#24394f]">
                <div className="flex items-start gap-2.5">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#3f78a8]" />
                  <p>{item}</p>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <footer className="rounded-[16px] border border-[#dde7f3] bg-[#f8fbff] px-4 py-3 text-[0.82rem] text-[#61758d]">
        Simulated intelligence preview. Data shown for demonstration purposes only.
      </footer>
    </section>
  )
}

