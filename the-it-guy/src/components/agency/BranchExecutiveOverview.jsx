import { useState } from 'react'
import { ArrowDownRight, ArrowRight, ArrowUpRight, Banknote, ChartNoAxesCombined, CheckCircle2, Target, Users } from 'lucide-react'

const COLORS = ['#087b55', '#55bfa0', '#397ef4', '#8b5cf6', '#c78b31', '#94a3b8']
const PANEL = 'min-w-0 rounded-xl border border-[#e2e8f0] bg-white p-4 shadow-[0_3px_14px_rgba(15,23,42,0.025)] sm:p-5'
function dashboardNumber(value, { currency = false, percent = false } = {}) {
  if (value === null || value === undefined) return '—'
  if (percent) return `${value}%`
  if (currency) {
    const amount = Math.abs(value)
    if (amount >= 1000000) return `R${(value / 1000000).toFixed(2).replace(/\.?0+$/, '')}m`
    if (amount >= 1000) return `R${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`
    return `R${new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 }).format(value)}`
  }
  return new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 1 }).format(value)
}
function Change({ value, unit = '%' }) {
  if (value === null || value === undefined) return null
  const Icon = value < 0 ? ArrowDownRight : ArrowUpRight
  return <span className={`inline-flex items-center gap-1 text-xs font-medium ${value < 0 ? 'text-[#be453d]' : 'text-[#087b55]'}`}><Icon size={13} />{Math.abs(value)}{unit} vs previous period</span>
}
function SmallMetric({ label, value, currency = false, percent = false }) {
  return <div className="min-w-0"><dt className="text-xs leading-5 text-[#64748b]">{label}</dt><dd className="mt-0.5 text-lg font-semibold tracking-tight text-[#142132] tabular-nums">{dashboardNumber(value, { currency, percent })}</dd></div>
}
function MovementChart({ data }) {
  const [hidden, setHidden] = useState([])
  const [hover, setHover] = useState(null)
  const series = data.movement.filter((item) => !hidden.includes(item.key) && item.value !== null)
  const max = Math.max(1, ...series.flatMap((item) => item.values).filter((value) => value !== null))
  const ceiling = Math.max(5, Math.ceil(max / 5) * 5)
  const left = 42, right = 978, top = 12, bottom = 154
  const x = (index) => left + index / Math.max(1, data.buckets.length - 1) * (right - left)
  const y = (value) => bottom - value / ceiling * (bottom - top)
  const ticks = Array.from({ length: 5 }, (_, index) => ceiling * index / 4)
  const noActivity = !series.some((item) => item.value > 0)
  return (
    <>
      <div className="mb-3 flex flex-wrap justify-end gap-x-4 gap-y-2" aria-label="Activity chart legend">
        {data.movement.map((item, index) => <button key={item.key} type="button" disabled={item.value === null} aria-pressed={!hidden.includes(item.key)} onClick={() => setHidden((previous) => previous.includes(item.key) ? previous.filter((key) => key !== item.key) : [...previous, item.key])} className={`inline-flex items-center gap-1.5 text-xs disabled:opacity-40 ${hidden.includes(item.key) ? 'text-[#94a3b8] line-through' : 'text-[#52657a]'}`}><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[index] }} />{item.label}</button>)}
      </div>
      <div className="relative" tabIndex={0} role="group" aria-label="Operational activity by date. Use left and right arrows to inspect dates." onMouseLeave={() => setHover(null)} onBlur={() => setHover(null)} onKeyDown={(event) => { if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); setHover((previous) => Math.max(0, Math.min(data.buckets.length - 1, (previous ?? 0) + (event.key === 'ArrowRight' ? 1 : -1)))) } }}>
        <svg className="h-[180px] w-full sm:h-[195px]" viewBox="0 0 1000 190" preserveAspectRatio="none" aria-hidden="true" onMouseMove={(event) => { const bounds = event.currentTarget.getBoundingClientRect(); const plotX = (event.clientX - bounds.left) / bounds.width * 1000; setHover(Math.max(0, Math.min(data.buckets.length - 1, Math.round((plotX - left) / (right - left) * (data.buckets.length - 1))))) }}>
          {ticks.map((tick) => <g key={tick}><line x1={left} y1={y(tick)} x2={right} y2={y(tick)} stroke="#edf2f7" /><text x={left - 9} y={y(tick) + 4} textAnchor="end" fill="#718198" fontSize="11">{Math.round(tick)}</text></g>)}
          {data.buckets.map((bucket, index) => index % Math.max(1, Math.ceil(data.buckets.length / 7)) === 0 || index === data.buckets.length - 1 ? <text key={index} x={x(index)} y="181" textAnchor={index === 0 ? 'start' : index === data.buckets.length - 1 ? 'end' : 'middle'} fill="#718198" fontSize="11">{bucket.label}</text> : null)}
          {series.map((item) => <g key={item.key}><polyline points={item.values.map((value, index) => `${x(index)},${y(value ?? 0)}`).join(' ')} fill="none" stroke={COLORS[data.movement.indexOf(item)]} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />{hover !== null ? <circle cx={x(hover)} cy={y(item.values[hover] ?? 0)} r="4" fill={COLORS[data.movement.indexOf(item)]} /> : null}</g>)}
          {hover !== null ? <line x1={x(hover)} y1={top} x2={x(hover)} y2={bottom} stroke="#b7c5d3" strokeDasharray="4 4" /> : null}
        </svg>
        {noActivity ? <p className="pointer-events-none absolute inset-x-0 top-12 text-center text-sm text-[#94a3b8]">{data.movement.every((item) => item.value === null) ? 'Activity data not available' : 'No activity for this period'}</p> : null}
        {hover !== null ? <div role="status" className="pointer-events-none absolute right-4 top-2 rounded-lg border border-[#e2e8f0] bg-white/95 px-3 py-2 text-xs shadow-lg"><strong className="mb-1 block text-[#142132]">{data.buckets[hover]?.label}</strong>{series.map((item) => <p key={item.key} className="flex justify-between gap-5 text-[#64748b]"><span>{item.label}</span><strong>{dashboardNumber(item.values[hover])}</strong></p>)}</div> : null}
      </div>
    </>
  )
}
function FinanceChart({ buckets, metric }) {
  const max = Math.max(1, ...buckets.map((bucket) => bucket[metric] ?? 0))
  const allUnavailable = buckets.every((bucket) => bucket[metric] === null)
  return <div className="relative mt-4">
    <div className="flex h-40 gap-2">
      <div className="flex w-12 shrink-0 flex-col justify-between pb-6 text-[10px] text-[#718198]"><span>{dashboardNumber(max, { currency: true })}</span><span>{dashboardNumber(max / 2, { currency: true })}</span><span>R0</span></div>
      <div className="grid min-w-0 flex-1 items-end gap-1 border-b border-[#e2e8f0]" style={{ gridTemplateColumns: `repeat(${buckets.length}, minmax(0, 1fr))` }}>
        {buckets.map((bucket, index) => <div key={bucket.label} className="flex h-full min-w-0 flex-col justify-end gap-2 text-center"><div className="flex h-full items-end justify-center border-b border-[#edf2f7]"><div className={`w-3/5 rounded-t-sm ${index === buckets.length - 1 ? 'bg-[#087b55]' : 'bg-[#6bc5aa]'}`} style={{ height: `${(bucket[metric] ?? 0) / max * 100}%` }} tabIndex={0} aria-label={`${bucket.label}: ${dashboardNumber(bucket[metric], { currency: true })}`} title={`${bucket.label}: ${dashboardNumber(bucket[metric], { currency: true })}`} /></div><span className="h-6 truncate text-[9px] text-[#718198] sm:text-[10px]">{bucket.label}</span></div>)}
      </div>
    </div>
    {allUnavailable || max === 1 && buckets.every((bucket) => !bucket[metric]) ? <p className="pointer-events-none absolute inset-x-0 top-12 text-center text-sm text-[#94a3b8]">{allUnavailable ? 'Financial data not available' : 'No registered sales for this period'}</p> : null}
  </div>
}
function Portfolio({ portfolio, periodLabel }) {
  const parts = portfolio.statuses.map((status, index) => { const start = portfolio.total ? portfolio.statuses.slice(0, index).reduce((total, item) => total + item.count, 0) / portfolio.total * 360 : 0; const end = start + (portfolio.total ? status.count / portfolio.total * 360 : 0); return `${COLORS[index % COLORS.length]} ${start}deg ${end}deg` })
  return <section className={PANEL}><h2 className="text-base font-semibold text-[#142132]">Listing Portfolio</h2>
    <dl className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4"><SmallMetric label="Active Listings" value={portfolio.active} /><SmallMetric label="Avg. Listing Age (days)" value={portfolio.averageAge} /><SmallMetric label={`New · ${periodLabel}`} value={portfolio.newListings} /><SmallMetric label="Listings >90 Days" value={portfolio.olderThan90} /></dl>
    <div className="mt-5 flex flex-wrap items-center justify-center gap-5">
      <div className="grid h-32 w-32 shrink-0 place-items-center rounded-full" style={{ background: parts.length && portfolio.total ? `conic-gradient(${parts.join(',')})` : '#edf2f7' }} role="img" aria-label={`${dashboardNumber(portfolio.total)} total listings by status`}><div className="grid h-24 w-24 content-center rounded-full bg-white text-center"><strong className="text-2xl font-semibold text-[#142132]">{dashboardNumber(portfolio.total)}</strong><span className="text-[11px] text-[#64748b]">Total Listings</span></div></div>
      <dl className="min-w-0 flex-1 space-y-2 text-xs">{portfolio.statuses.length ? portfolio.statuses.map((status, index) => <div key={status.key} className="flex items-center justify-between gap-3"><dt className="flex items-center gap-2 text-[#64748b]"><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />{status.label}</dt><dd className="font-semibold text-[#142132]">{status.count}</dd></div>) : <p className="text-[#94a3b8]">{portfolio.total === null ? 'Listing data not available' : 'No listings yet'}</p>}</dl>
    </div>
  </section>
}
export function BranchOverviewSkeleton() {
  return <div aria-label="Loading branch dashboard" aria-busy="true" className="space-y-4"><div className="h-[200px] animate-pulse rounded-xl bg-[#e5ece9]" /><div className="h-12 animate-pulse rounded-xl bg-[#edf2f7]" /><div className="grid grid-cols-2 gap-3 xl:grid-cols-5">{[0, 1, 2, 3, 4].map((index) => <div key={index} className="h-24 animate-pulse rounded-xl bg-[#edf2f7]" />)}</div>{[180, 100, 240].map((height) => <div key={height} className="animate-pulse rounded-xl bg-[#edf2f7]" style={{ height }} />)}<div className="grid gap-4 lg:grid-cols-2"><div className="h-64 animate-pulse rounded-xl bg-[#edf2f7]" /><div className="h-64 animate-pulse rounded-xl bg-[#edf2f7]" /></div></div>
}
export default function BranchExecutiveOverview({ data, financialMonths, onFinancialMonthsChange, canViewFinancials, onViewAgents, onOpenAgent }) {
  const [financialMetric, setFinancialMetric] = useState('gross')
  const icons = [ChartNoAxesCombined, Users, Banknote, CheckCircle2, Target]
  const ranked = data.agents.filter((agent) => agent.deals > 0 && agent.salesValue !== null).slice(0, 3)
  return <div className="min-w-0 space-y-4">

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Executive branch metrics">
      {data.kpis.map((metric, index) => { const Icon = icons[index]; const restricted = metric.currency && !canViewFinancials; return <article key={metric.key} className={`${PANEL} flex items-start gap-3 sm:p-4`}><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#edf9f3] text-[#087b55]"><Icon size={21} /></span><div className="min-w-0"><p className="text-[10px] font-medium uppercase tracking-[0.04em] text-[#718198]">{metric.label}</p><strong className="mt-1 block text-2xl font-semibold tracking-tight text-[#0f172a] tabular-nums">{restricted ? '—' : dashboardNumber(metric.value, metric)}</strong>{!restricted ? <Change value={metric.change} unit={metric.changeUnit || '%'} /> : null}<p className="mt-1 text-[11px] text-[#718198]">{restricted ? 'Restricted' : metric.context}</p></div></article> })}
    </section>
    <section className={PANEL}><h2 className="text-base font-semibold text-[#142132]">Operational Movement</h2><dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">{data.movement.map((metric) => <div key={metric.key} className="border-l border-[#edf2f7] pl-3 first:border-0 first:pl-0"><SmallMetric label={metric.label} value={metric.value} /><Change value={metric.change} /></div>)}</dl><div className="mt-4"><MovementChart data={data} /></div></section>
    <section className={PANEL}><h2 className="text-base font-semibold text-[#142132]">Sales Pipeline</h2><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">{data.stages.map((stage, index) => <div key={stage.key} className="min-w-0"><div className={`relative rounded-lg px-3 py-3 text-center ${index === data.stages.length - 1 ? 'bg-[#087b55] text-white' : 'bg-[#edf8f3] text-[#163a2e]'}`}><strong className="block text-xl font-semibold tabular-nums">{dashboardNumber(stage.count)}</strong><span className="text-xs">{stage.label}</span>{index < data.stages.length - 1 ? <ArrowRight size={13} className="absolute right-1 top-1/2 -translate-y-1/2 opacity-40" /> : null}</div><p className="mt-2 text-center text-[11px] text-[#64748b]">{index === 0 ? 'Leads created in period' : stage.rate === null ? '—' : `${stage.rate}% from ${data.stages[index - 1].label.toLowerCase()}`}</p></div>)}</div></section>
    <section className={PANEL}><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold text-[#142132]">Financial Performance</h2><label className="text-xs text-[#64748b]"><span className="sr-only">Financial reporting period</span><select value={financialMonths} onChange={(event) => onFinancialMonthsChange(Number(event.target.value))} className="rounded-lg border border-[#dbe4ee] bg-white px-3 py-2"><option value={12}>Last 12 months</option><option value={6}>Last 6 months</option></select></label></div>{canViewFinancials ? <><dl className="mt-4 grid grid-cols-2 gap-4 xl:grid-cols-4"><SmallMetric label="Registered Sales Value" value={data.financials.sales} currency /><SmallMetric label="Gross Commission" value={data.financials.gross} currency /><SmallMetric label="Agency Commission" value={data.financials.agency} currency /><SmallMetric label="Agent Commission" value={data.financials.agent} currency /></dl><div className="mt-4 flex flex-wrap gap-2" aria-label="Financial chart metric">{[['sales', 'Sales Value'], ['gross', 'Gross Commission'], ['agency', 'Agency Commission']].map(([value, label]) => <button key={value} type="button" aria-pressed={financialMetric === value} onClick={() => setFinancialMetric(value)} className={`rounded-md px-2.5 py-1 text-xs font-medium ${financialMetric === value ? 'bg-[#edf8f3] text-[#087b55]' : 'text-[#718198] hover:bg-[#f8fafc]'}`}>{label}</button>)}</div><FinanceChart buckets={data.financials.buckets} metric={financialMetric} /></> : <p className="py-6 text-sm text-[#94a3b8]">Financial performance is restricted.</p>}</section>
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)]"><Portfolio portfolio={data.portfolio} periodLabel={data.range.label} /><section className={PANEL}><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold text-[#142132]">Agent Performance</h2><button type="button" onClick={onViewAgents} className="inline-flex items-center gap-1 text-xs font-medium text-[#087b55]">View all agents <ArrowRight size={13} /></button></div>{ranked.length ? <div className="mt-4 grid gap-3 md:grid-cols-3">{ranked.map((agent, index) => <button key={agent.id} type="button" onClick={() => onOpenAgent(agent)} className="min-w-0 rounded-xl border border-[#e4ebf2] bg-[#fbfdff] p-3 text-left transition hover:border-[#9ecbb7]"><div className="flex items-center gap-2">{agent.avatarUrl ? <img src={agent.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" /> : <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#e7f5ed] text-xs font-semibold text-[#087b55]">{agent.name.split(/\s+/).slice(0, 2).map((word) => word[0]).join('')}</span>}<div className="min-w-0"><span className="mr-1 rounded-full bg-[#e7f5ed] px-1.5 py-0.5 text-[10px] font-semibold text-[#087b55]">#{index + 1}</span><strong className="text-xs text-[#142132]">{agent.name}</strong><p className="mt-0.5 text-[10px] text-[#718198]">{index === 0 ? 'Top performer' : 'Registered sales'}</p></div></div><dl className="mt-3 grid grid-cols-3 gap-1 text-center">{[['Listings', agent.listings], ['Leads', agent.leads], ['Deals', agent.deals]].map(([label, value]) => <div key={label}><dd className="text-sm font-semibold text-[#142132]">{dashboardNumber(value)}</dd><dt className="text-[10px] text-[#718198]">{label}</dt></div>)}</dl><dl className="mt-3 grid grid-cols-2 gap-2 border-t border-[#e4ebf2] pt-3"><div><dd className="text-sm font-semibold text-[#142132]">{canViewFinancials ? dashboardNumber(agent.salesValue, { currency: true }) : '—'}</dd><dt className="text-[10px] text-[#718198]">Sales Value</dt></div><div><dd className="text-sm font-semibold text-[#142132]">{canViewFinancials ? dashboardNumber(agent.commission, { currency: true }) : '—'}</dd><dt className="text-[10px] text-[#718198]">Commission</dt></div></dl></button>)}</div> : <p className="mt-4 rounded-lg bg-[#f8fafc] px-4 py-8 text-center text-sm text-[#94a3b8]">No agent performance data yet</p>}</section></div>
  </div>
}
