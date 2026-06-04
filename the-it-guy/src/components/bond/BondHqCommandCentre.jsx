import { ArrowRight, BarChart3, Building2, Download, FileWarning, Gauge, Landmark, LineChart, ShieldAlert, UsersRound, WalletCards } from 'lucide-react'
import { Link } from 'react-router-dom'
import BondEmptyState from './BondEmptyState'

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-ZA').format(normalizeNumber(value))
}

function formatPercent(value) {
  return `${normalizeNumber(value)}%`
}

function statusTone(value = '') {
  const normalized = String(value || '').toLowerCase()
  if (normalized.includes('high') || normalized.includes('danger')) return 'text-[#9b3347] bg-[#fff4f6] border-[#efcfd7]'
  if (normalized.includes('medium') || normalized.includes('warning')) return 'text-[#8f5e14] bg-[#fff8ec] border-[#efdcb8]'
  return 'text-[#216b4d] bg-[#f0fbf5] border-[#cde8d4]'
}

function SectionShell({ eyebrow = '', title = '', description = '', action = null, children }) {
  return (
    <section className="rounded-[24px] border border-[#dbe5f0] bg-white p-6 shadow-[0_14px_36px_rgba(15,23,42,0.045)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          {eyebrow ? <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#72869b]">{eyebrow}</p> : null}
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[#142132]">{title}</h2>
          {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-[#64788f]">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className="mt-6">{children}</div>
    </section>
  )
}

export default function BondHqCommandCentre({ snapshot = {}, reportingScope = null }) {
  const hq = snapshot.hqCommandCentre || {}
  const regions = hq.regionalPerformance || []

  return (
    <div className="space-y-8">
      <HqExecutiveHeader regions={regions} reportingScope={reportingScope} />
      <HqKpiGrid items={hq.nationalSnapshot || []} />
      <HqAlertStrip alerts={hq.alerts || []} />
      <HqPipelineFunnel funnel={hq.pipelineFunnel} />
      <HqRegionalPerformance rows={regions} />
      <HqBranchLeaderboard leaderboard={hq.branchLeaderboard || {}} />
      <HqPartnerPerformance rows={hq.partnerPerformance || []} />
      <HqRevenueCommandCentre revenue={hq.revenue || {}} />
      <HqBankPerformance bankPerformance={hq.bankPerformance || {}} />
      <HqExecutiveActions />
    </div>
  )
}

export function HqExecutiveHeader({ regions = [] }) {
  return (
    <header className="rounded-[28px] border border-[#d8e4ef] bg-[linear-gradient(135deg,#ffffff_0%,#f6f9fc_100%)] p-6 shadow-[0_18px_45px_rgba(15,23,42,0.055)]">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
        <div className="max-w-3xl">
          <p className="text-[0.74rem] font-semibold uppercase tracking-[0.18em] text-[#6f849a]">Bond Originator HQ</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.045em] text-[#101828] md:text-4xl">National Bond Command Centre</h1>
          <p className="mt-3 text-base leading-7 text-[#5d7188]">
            Company-wide view of applications, revenue, approvals, partner performance, and operational risk.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[560px]">
          <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[#74879b]">
            Period
            <select className="h-11 rounded-[14px] border border-[#d7e2ee] bg-white px-3 text-sm font-semibold normal-case tracking-normal text-[#20364c]">
              <option>Last 30 Days</option>
              <option>This Month</option>
              <option>Quarter to Date</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[#74879b]">
            Region
            <select className="h-11 rounded-[14px] border border-[#d7e2ee] bg-white px-3 text-sm font-semibold normal-case tracking-normal text-[#20364c]">
              <option>All Regions</option>
              {regions.map((region) => <option key={region.key}>{region.region}</option>)}
            </select>
          </label>
          <Link to="/bond/reports?export=executive" className="mt-auto inline-flex h-11 items-center justify-center gap-2 rounded-[14px] bg-[#17324d] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(23,50,77,0.18)]">
            <Download size={16} />
            Export report
          </Link>
        </div>
      </div>
    </header>
  )
}

export function HqKpiGrid({ items = [] }) {
  const icons = [UsersRound, FileWarning, Gauge, LineChart, BarChart3, WalletCards]
  const rows = items.slice(0, 6)
  if (!rows.length) return <BondEmptyState compact title="No national snapshot yet" description="HQ KPIs will appear once bond applications are available in this workspace." />
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {rows.map((item, index) => {
        const Icon = icons[index] || BarChart3
        return (
          <article key={item.key || item.label} className="flex min-h-[176px] flex-col justify-between rounded-[24px] border border-[#dbe5f0] bg-white p-6 shadow-[0_14px_32px_rgba(15,23,42,0.045)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-[#5f7287]">{item.label}</p>
                <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-[#101828]">{item.value || 'Not available'}</p>
              </div>
              <span className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-[#eef5ff] text-[#24518a]">
                <Icon size={20} />
              </span>
            </div>
            <div className="mt-5 flex items-center justify-between gap-3">
              <span className="rounded-full border border-[#d9e7d9] bg-[#f3fbf4] px-3 py-1 text-xs font-semibold text-[#25714f]">{item.trend || 'Tracking'}</span>
              <p className="text-right text-xs font-medium text-[#74879b]">{item.helper || 'No comparison yet'}</p>
            </div>
          </article>
        )
      })}
    </section>
  )
}

export function HqAlertStrip({ alerts = [] }) {
  const rows = alerts.filter((alert) => normalizeNumber(alert.value) > 0).slice(0, 5)
  if (!rows.length) {
    return (
      <section className="rounded-[22px] border border-[#cde8d4] bg-[#f5fbf7] p-5">
        <p className="text-sm font-semibold text-[#216b4d]">No executive alerts in the national book right now.</p>
      </section>
    )
  }
  return (
    <section className="grid gap-3 lg:grid-cols-5">
      {rows.map((alert) => (
        <Link key={alert.key} to={alert.href || '/bond/reports'} className={`min-h-[112px] rounded-[20px] border p-4 transition hover:-translate-y-0.5 ${statusTone(alert.tone)}`}>
          <div className="flex items-start justify-between gap-3">
            <ShieldAlert size={18} />
            <ArrowRight size={15} />
          </div>
          <p className="mt-4 text-2xl font-semibold tracking-[-0.04em]">{formatNumber(alert.value)}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.1em]">{alert.label}</p>
        </Link>
      ))}
    </section>
  )
}

export function HqPipelineFunnel({ funnel = {} }) {
  const stages = funnel?.stages || []
  const max = Math.max(...stages.map((stage) => normalizeNumber(stage.count)), 1)
  return (
    <SectionShell
      eyebrow="National Pipeline"
      title="National Pipeline Funnel"
      description="A single national flow from intake through registration, with conversion and bottleneck visibility."
      action={<span className="rounded-full border border-[#efdcb8] bg-[#fff8ec] px-3 py-1 text-xs font-semibold text-[#8f5e14]">Bottleneck: {funnel?.bottleneckStage || 'No bottleneck'}</span>}
    >
      {stages.length ? (
        <div className="grid gap-3">
          {stages.map((stage) => {
            const width = Math.max(8, (normalizeNumber(stage.count) / max) * 100)
            return (
              <Link key={stage.key} to={stage.href || '/bond/pipeline'} className="grid gap-3 rounded-[18px] border border-[#e2ebf4] bg-[#fbfdff] p-4 transition hover:border-[#c6d8e8] lg:grid-cols-[210px_minmax(0,1fr)_160px] lg:items-center">
                <div>
                  <p className="text-sm font-semibold text-[#1d344b]">{stage.label}</p>
                  <p className="mt-1 text-xs text-[#71869d]">{stage.valueLabel}</p>
                </div>
                <div className="h-4 overflow-hidden rounded-full bg-[#e6eef7]">
                  <span className="block h-full rounded-full bg-[linear-gradient(90deg,#17324d,#4f7aa6)]" style={{ width: `${width}%` }} />
                </div>
                <div className="flex justify-between gap-3 text-xs font-semibold text-[#60758d] lg:justify-end">
                  <span>{formatPercent(stage.conversionRate)} conversion</span>
                  <span>{formatPercent(stage.dropOff)} drop-off</span>
                </div>
              </Link>
            )
          })}
        </div>
      ) : (
        <BondEmptyState compact title="No pipeline flow yet" description="The national funnel appears once applications enter the workspace." />
      )}
    </SectionShell>
  )
}

export function HqRegionalPerformance({ rows = [] }) {
  return (
    <SectionShell eyebrow="Regional Performance" title="Regional Performance" description="Compare the national bond book across all visible regions.">
      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full text-left text-sm">
          <thead className="text-xs font-semibold uppercase tracking-[0.1em] text-[#72869b]">
            <tr>
              {['Region', 'Active Applications', 'Submitted', 'Approval Rate', 'Avg Approval Time', 'Pipeline Value', 'Projected Commission', 'Risk Level'].map((heading) => (
                <th key={heading} className="border-b border-[#e2ebf4] px-3 py-3">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-[#edf2f7] last:border-0">
                <td className="px-3 py-4"><Link to={row.href || '/bond/organisation?view=branches'} className="font-semibold text-[#17324d]">{row.region}</Link></td>
                <td className="px-3 py-4">{formatNumber(row.activeApplications)}</td>
                <td className="px-3 py-4">{formatNumber(row.submitted)}</td>
                <td className="px-3 py-4">{formatPercent(row.approvalRate)}</td>
                <td className="px-3 py-4">{formatNumber(row.avgApprovalTime)}d</td>
                <td className="px-3 py-4 font-semibold">{row.pipelineValueLabel}</td>
                <td className="px-3 py-4 font-semibold">{row.projectedCommissionLabel}</td>
                <td className="px-3 py-4"><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(row.riskLevel)}`}>{row.riskLevel}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <BondEmptyState compact title="No regional data yet" description="Regional comparisons appear once applications have regional assignment data." /> : null}
      </div>
    </SectionShell>
  )
}

function BranchRow({ branch, attention = false }) {
  return (
    <Link to={branch.href || '/bond/organisation?view=branches'} className="grid gap-3 rounded-[16px] border border-[#e2ebf4] bg-[#fbfdff] p-4 transition hover:border-[#c6d8e8]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-[#17324d]">{branch.branch}</p>
          <p className="mt-1 text-xs text-[#71869d]">{branch.region}</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(attention ? branch.riskLevel : 'Low')}`}>
          {attention ? branch.riskLevel : `#${formatNumber(branch.topScore)}`}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs text-[#60758d]">
        <span>{formatNumber(branch.activeApplications)} active files</span>
        <span>{formatPercent(branch.approvalRate)} approval</span>
        <span>{formatNumber(branch.avgApprovalTime)}d avg</span>
        <span>{attention ? `${formatNumber(branch.missingDocs)} docs missing` : branch.projectedCommissionLabel}</span>
      </div>
    </Link>
  )
}

export function HqBranchLeaderboard({ leaderboard = {} }) {
  const topBranches = leaderboard.topBranches || []
  const attentionBranches = leaderboard.attentionBranches || []
  return (
    <section className="grid gap-6 xl:grid-cols-2">
      <SectionShell eyebrow="Branch Leaderboard" title="Top Performing Branches" description="Weighted by approval rate, submission volume, approval time, and commission.">
        <div className="grid gap-3">
          {topBranches.length ? topBranches.map((branch) => <BranchRow key={branch.key} branch={branch} />) : <BondEmptyState compact title="No top branch data yet" description="Branch performance appears once branch assignments exist." />}
        </div>
      </SectionShell>
      <SectionShell eyebrow="Branch Risk" title="Branches Requiring Attention" description="Ranked by SLA pressure, stale applications, missing docs, low approvals, and unassigned work.">
        <div className="grid gap-3">
          {attentionBranches.length ? attentionBranches.map((branch) => <BranchRow key={branch.key} branch={branch} attention />) : <BondEmptyState compact title="No branch risks flagged" description="High-risk branches will appear here when SLA pressure increases." />}
        </div>
      </SectionShell>
    </section>
  )
}

export function HqPartnerPerformance({ rows = [] }) {
  return (
    <SectionShell eyebrow="Partner Performance" title="Partner Performance" description="Top referral sources by channel, conversion, value, and projected commission.">
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {rows.length ? rows.map((row) => (
          <Link key={row.key} to={row.href || '/bond/partners'} className="flex min-h-[210px] flex-col justify-between rounded-[20px] border border-[#e2ebf4] bg-[#fbfdff] p-5 transition hover:border-[#c6d8e8]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#71869d]">{row.sourceType}</p>
              <h3 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-[#142132]">{row.partner}</h3>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 text-xs text-[#60758d]">
              <span>{formatNumber(row.applicationsReferred)} referred</span>
              <span>{formatNumber(row.submittedApplications)} submitted</span>
              <span>{formatPercent(row.approvalRate)} approval</span>
              <span>{formatPercent(row.conversionRate)} conversion</span>
              <span className="col-span-2 font-semibold text-[#17324d]">{row.pipelineValueLabel} pipeline · {row.projectedCommissionLabel} commission</span>
            </div>
          </Link>
        )) : <BondEmptyState compact title="No partner performance yet" description="Referral partner performance appears once applications have source attribution." />}
      </div>
    </SectionShell>
  )
}

function RevenueList({ title, rows = [] }) {
  return (
    <div className="rounded-[18px] border border-[#e2ebf4] bg-[#fbfdff] p-4">
      <p className="text-sm font-semibold text-[#142132]">{title}</p>
      <div className="mt-4 space-y-3">
        {rows.length ? rows.map((row) => (
          <div key={`${title}-${row.label}`} className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-[#60758d]">{row.label}</span>
            <strong className="text-[#17324d]">{row.valueLabel}</strong>
          </div>
        )) : <p className="text-sm text-[#71869d]">Not enough data yet.</p>}
      </div>
    </div>
  )
}

export function HqRevenueCommandCentre({ revenue = {} }) {
  return (
    <SectionShell eyebrow="Revenue" title="Revenue Command Centre" description="High-level commission movement, source mix, and near-term forecast.">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-[20px] border border-[#e2ebf4] bg-[#fbfdff] p-5"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#71869d]">Revenue This Month</p><p className="mt-3 text-2xl font-semibold text-[#142132]">{revenue.revenueThisMonthLabel || 'Not enough data'}</p></article>
        <article className="rounded-[20px] border border-[#e2ebf4] bg-[#fbfdff] p-5"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#71869d]">Projected Commission</p><p className="mt-3 text-2xl font-semibold text-[#142132]">{revenue.projectedCommissionLabel || 'Not enough data'}</p></article>
        <article className="rounded-[20px] border border-[#e2ebf4] bg-[#fbfdff] p-5"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#71869d]">Commission Confirmed</p><p className="mt-3 text-2xl font-semibold text-[#142132]">{revenue.commissionConfirmedLabel || 'Not enough data'}</p></article>
        <article className="rounded-[20px] border border-[#e2ebf4] bg-[#fbfdff] p-5"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#71869d]">90-Day Forecast</p><p className="mt-3 text-2xl font-semibold text-[#142132]">{revenue.forecast90Day || 'Not enough data'}</p></article>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <RevenueList title="Revenue by Region" rows={revenue.revenueByRegion || []} />
        <RevenueList title="Revenue by Branch" rows={revenue.revenueByBranch || []} />
        <RevenueList title="Revenue by Partner Source" rows={revenue.revenueByPartnerSource || []} />
      </div>
    </SectionShell>
  )
}

export function HqBankPerformance({ bankPerformance = {} }) {
  const rows = bankPerformance.rows || []
  return (
    <SectionShell
      eyebrow="Bank Intelligence"
      title="Bank Performance Overview"
      description="A simplified lender view for national approval, submission, and response performance."
      action={<span className="rounded-full border border-[#dbe5f0] bg-[#fbfdff] px-3 py-1 text-xs font-semibold text-[#31506a]">Best bank: {bankPerformance.bestBank || 'Not enough data'}</span>}
    >
      <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
        <div className="grid gap-3">
          {rows.length ? rows.map((row) => (
            <div key={row.bank} className="grid gap-3 rounded-[16px] border border-[#e2ebf4] bg-[#fbfdff] p-4 md:grid-cols-[1fr_110px_110px_130px] md:items-center">
              <p className="font-semibold text-[#142132]">{row.bank}</p>
              <p className="text-sm text-[#60758d]">{formatNumber(row.submitted)} submitted</p>
              <p className="text-sm text-[#60758d]">{formatPercent(row.approvalRate)} approval</p>
              <p className="text-sm text-[#60758d]">{formatNumber(row.averageResponseTime)}d response</p>
            </div>
          )) : <BondEmptyState compact title="No bank performance yet" description="Bank metrics appear once submissions are linked to lenders." />}
        </div>
        <aside className="grid gap-4">
          <article className="rounded-[18px] border border-[#efdcb8] bg-[#fff8ec] p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8f5e14]">Bottleneck Bank</p><p className="mt-2 font-semibold text-[#142132]">{bankPerformance.bottleneckBank || 'Not enough data'}</p></article>
          <article className="rounded-[18px] border border-[#cde8d4] bg-[#f5fbf7] p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#216b4d]">Best Performing Bank</p><p className="mt-2 font-semibold text-[#142132]">{bankPerformance.bestBank || 'Not enough data'}</p></article>
        </aside>
      </div>
    </SectionShell>
  )
}

export function HqExecutiveActions() {
  const actions = [
    { label: 'Review unassigned applications', href: '/bond/applications?filter=unassigned', icon: UsersRound },
    { label: 'View SLA breaches', href: '/bond/reports?view=sla-breaches', icon: ShieldAlert },
    { label: 'View branch risks', href: '/bond/organisation?view=branches&risk=high', icon: Building2 },
    { label: 'Review partner performance', href: '/bond/partners', icon: Landmark },
    { label: 'Export executive report', href: '/bond/reports?export=executive', icon: Download },
    { label: 'Open revenue report', href: '/bond/revenue', icon: WalletCards },
  ]
  return (
    <SectionShell eyebrow="Executive Actions" title="Executive Actions" description="Shortcuts for the highest-value HQ follow-ups.">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {actions.map((action) => {
          const Icon = action.icon
          return (
            <Link key={action.label} to={action.href} className="flex min-h-[116px] items-center justify-between gap-4 rounded-[20px] border border-[#e2ebf4] bg-[#fbfdff] p-5 transition hover:-translate-y-0.5 hover:border-[#c6d8e8]">
              <span className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-[#eef5ff] text-[#24518a]"><Icon size={19} /></span>
                <span className="font-semibold text-[#17324d]">{action.label}</span>
              </span>
              <ArrowRight size={17} className="text-[#7b8da0]" />
            </Link>
          )
        })}
      </div>
    </SectionShell>
  )
}
