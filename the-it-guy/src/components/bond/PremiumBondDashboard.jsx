import { useState } from 'react'
import { ArrowRight, ChevronRight, Target } from 'lucide-react'
import { Link } from 'react-router-dom'
import BondEmptyState from './BondEmptyState'
import BondSectionCard from './BondSectionCard'

const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback
const text = (value, fallback = '') => String(value || '').trim() || fallback
const metric = (items, key) => (items || []).find((item) => item.key === key) || {}

function Metric({ value, label, detail, className = '' }) {
  return <div className={`min-w-0 px-1 ${className}`}><p className="text-2xl font-semibold tracking-tight text-[#142132] sm:text-3xl">{text(value, '—')}</p><p className="mt-1 text-sm font-semibold text-[#31475d]">{label}</p>{detail ? <p className="mt-1 text-xs text-[#71859a]">{detail}</p> : null}</div>
}

function ApplicationCard({ item = {} }) {
  const stages = Array.isArray(item.stageItems) ? item.stageItems : []
  return <Link to={item.href || '/bond/pipeline?view=all'} className="group relative flex w-[84vw] max-w-[290px] shrink-0 snap-start flex-col rounded-2xl border border-[#dce6ef] bg-white p-4 shadow-[0_8px_22px_rgba(15,23,42,.035)] transition hover:-translate-y-0.5 hover:border-[#aebfd1] hover:shadow-[0_14px_30px_rgba(15,23,42,.08)] sm:w-[270px]">
    <span className="absolute inset-y-4 left-0 w-1 rounded-r bg-[#24518a]" />
    <div className="flex items-start justify-between gap-2 pl-1"><div className="min-w-0"><p className="truncate text-sm font-semibold text-[#15263a]">{text(item.developmentName, 'Property pending')}</p><p className="mt-0.5 truncate text-xs text-[#71859a]">{text(item.propertyLabel, 'Unit pending')}</p></div><span className="rounded-md bg-[#f2f6fa] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[#50677e]">{text(item.financeType, 'Bond')}</span></div>
    <p className="mt-4 pl-1 text-xl font-semibold tracking-tight text-[#142132]">{text(item.bondValue, '—')}</p>
    <div className="mt-3 flex items-center justify-between gap-2 pl-1 text-xs"><span className="truncate text-[#50677e]"><b className="text-[#243d56]">{text(item.consultantName, 'Unassigned')}</b> · Originator</span><span className="shrink-0 text-[#71859a]">{text(item.applicationAge, '—')}</span></div>
    <div className="mt-4 pl-1"><div className="flex items-center gap-1">{stages.map((stage) => <span key={stage.key} className={`h-1.5 flex-1 rounded-full ${stage.state === 'complete' ? 'bg-[#198b63]' : stage.state === 'active' ? 'bg-[#24518a]' : 'bg-[#dce5ee]'}`} />)}</div><p className="mt-2 truncate text-[11px] font-medium text-[#657a90]">{text(item.currentStage, 'Application')}</p></div>
    <div className="mt-4 border-t border-[#edf1f5] pt-3 pl-1 text-xs text-[#667c91]"><p className="truncate">Buyer: {text(item.buyerName, 'Buyer pending')}</p><p className="mt-1 truncate">Seller: {text(item.agentName, 'Seller pending')}</p></div>
    <span className="mt-4 pl-1 text-sm font-semibold text-[#24518a]">Open <ArrowRight className="inline h-3.5 w-3.5 transition group-hover:translate-x-0.5" /></span>
  </Link>
}

function Pipeline({ overview = {} }) {
  const pipeline = overview.pipeline || []
  const labels = { application: 'Application', at_banks: 'At banks', accepted: 'Approved', lodged: 'Lodged', registered: 'Registered' }
  const total = pipeline.reduce((sum, stage) => sum + number(stage.count), 0)
  return <BondSectionCard eyebrow="Applications pipeline" title="Applications Pipeline" action={<Link to="/bond/pipeline?view=all" className="text-sm font-semibold text-[#24518a]">View pipeline <ArrowRight className="inline h-4 w-4" /></Link>} className="rounded-[20px] p-5" contentClassName="mt-6">
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">{pipeline.map((stage) => <div key={stage.key} className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-[#71859a]">{labels[stage.key] || stage.label}</p><p className="mt-2 text-2xl font-semibold text-[#142132]">{number(stage.count)}</p><p className="mt-1 truncate text-xs text-[#60758d]">{text(stage.loanValueLabel, 'R0')}</p></div>)}</div>
    <div className="mt-6 flex h-2 overflow-hidden rounded-full bg-[#edf1f4]">{pipeline.map((stage, index) => <span key={stage.key} className={index === 1 ? 'bg-[#267e61]' : index > 2 ? 'bg-[#63a88e]' : 'bg-[#1d8f69]'} style={{ width: `${total ? (number(stage.count) / total) * 100 : 0}%` }} />)}</div>
  </BondSectionCard>
}

function TargetTracker({ target = {}, canConfigure = false }) {
  const configured = number(target.target) > 0
  const pct = Math.min(100, number(target.progress))
  return <BondSectionCard eyebrow="Target tracker" title="Target Tracker" className="rounded-[20px] p-5" contentClassName="mt-8">
    {configured ? <><div className="flex items-end justify-between"><p className="text-3xl font-semibold text-[#142132]">{number(target.actual)} <span className="text-lg text-[#7a8da0]">/ {number(target.target)}</span></p><p className="text-lg font-semibold text-[#198b63]">{pct}%</p></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-[#e8eef2]"><span className="block h-full rounded-full bg-[#198b63]" style={{ width: `${pct}%` }} /></div><p className="mt-3 text-sm text-[#657a90]">{target.helper}</p></> : <div className="rounded-xl bg-[#f7f9fb] p-4"><Target className="h-5 w-5 text-[#6e8398]" /><p className="mt-3 text-sm font-semibold text-[#31475d]">No target configured</p>{canConfigure ? <Link to="/settings/organisation#targets" className="mt-2 inline-block text-sm font-semibold text-[#24518a]">Configure target <ChevronRight className="inline h-4 w-4" /></Link> : <p className="mt-1 text-xs text-[#71859a]">Ask an organisation administrator to configure one.</p>}</div>}
  </BondSectionCard>
}

export default function PremiumBondDashboard({ snapshot = {}, canConfigureTarget = false }) {
  const overview = snapshot.managementOverview || {}
  const active = overview.kpis?.find((row) => row.key === 'active_pipeline') || metric(snapshot.heroKpis, 'active_applications')
  const approval = overview.kpis?.find((row) => row.key === 'approval_rate') || metric(snapshot.heroKpis, 'approval_rate')
  const commission = overview.kpis?.find((row) => row.key === 'commission_forecast') || metric(snapshot.heroKpis, 'commission_pipeline')
  const atBanks = (overview.pipeline || []).find((row) => row.key === 'at_banks') || {}
  const bankRows = overview.bankApprovalRanking || []
  const clients = overview.clientRankings || { byVolume: [], byValue: [] }
  const insights = overview.visualMetrics || []
  const activeApps = snapshot.activeApplications || []
  return <div className="space-y-4">
    <BondSectionCard eyebrow="Pipeline overview" className="rounded-[20px] p-5 sm:p-6"><div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4"><Metric value={active.value} label="Active applications" detail={active.secondary || active.microContext} className="xl:border-r xl:border-[#e5ebf0]" /><Metric value={atBanks.count} label="At banks" detail={atBanks.loanValueLabel ? `${atBanks.loanValueLabel} submitted` : ''} className="xl:border-r xl:border-[#e5ebf0]" /><Metric value={approval.value} label="Approval rate" detail={approval.secondary || approval.comparison || 'No decided cases yet'} className="xl:border-r xl:border-[#e5ebf0]" /><Metric value={commission.value} label="Commission pipeline" detail={commission.secondary || commission.microContext} /></div></BondSectionCard>
    <section className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(260px,1fr)]"><Pipeline overview={overview} /><TargetTracker target={overview.targetTracker} canConfigure={canConfigureTarget} /></section>
    <BondSectionCard eyebrow="Active applications" title="Active Applications" action={<Link to="/bond/applications" className="text-sm font-semibold text-[#24518a]">View all applications <ArrowRight className="inline h-4 w-4" /></Link>} className="rounded-[20px] p-5" contentClassName="mt-5">{activeApps.length ? <div className="-mx-1 overflow-x-auto px-1 pb-2 [scrollbar-width:none]"><div className="flex snap-x snap-proximity gap-3">{activeApps.map((item) => <ApplicationCard key={item.id} item={item} />)}</div></div> : <BondEmptyState compact title="No active applications" description="Applications in your current scope will appear here." />}</BondSectionCard>
    <section className="grid gap-4 xl:grid-cols-2"><BondSectionCard eyebrow="Bank performance" title="Bank Performance" action={<Link to="/banks?view=submissions" className="text-sm font-semibold text-[#24518a]">View all banks <ArrowRight className="inline h-4 w-4" /></Link>} className="rounded-[20px] p-5" contentClassName="mt-5">{bankRows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[480px] text-left text-sm"><thead className="text-xs text-[#71859a]"><tr><th className="pb-3 font-medium">Bank</th><th className="pb-3 font-medium">Submitted</th><th className="pb-3 font-medium">Approved</th><th className="pb-3 font-medium">Approval</th><th className="pb-3 font-medium">Avg response</th></tr></thead><tbody>{bankRows.map((row) => <tr key={row.key} className="border-t border-[#edf1f4] text-[#31475d]"><td className="py-3 font-semibold">{row.bank}</td><td>{row.submitted}</td><td>{row.approved}</td><td className="font-semibold text-[#198b63]">{row.approvalRate ? `${row.approvalRate}%` : '—'}</td><td>{row.averageResponseTime ? `${row.averageResponseTime} days` : '—'}</td></tr>)}</tbody></table></div> : <BondEmptyState compact title="No bank submissions" description="Submitted applications will appear here." />}</BondSectionCard>
      <TopClients clients={clients} /></section>
    <BondSectionCard eyebrow="Performance insights" title="Performance Insights" className="rounded-[20px] p-5" contentClassName="mt-6"><div className="grid gap-5 sm:grid-cols-3">{insights.map((item) => <Metric key={item.key} value={item.value === 'No data yet' ? '—' : item.value} label={item.label} detail={item.detail} />)}{!insights.length ? <BondEmptyState compact title="No performance data yet" description="Insights will appear as applications progress." /> : null}</div></BondSectionCard>
  </div>
}

function TopClients({ clients = {} }) {
  const [mode, setMode] = useState('volume')
  const rows = mode === 'volume' ? clients.byVolume || [] : clients.byValue || []
  return <BondSectionCard eyebrow="Top clients" title="Top Clients" action={<Link to="/clients" className="text-sm font-semibold text-[#24518a]">View all clients <ArrowRight className="inline h-4 w-4" /></Link>} className="rounded-[20px] p-5" contentClassName="mt-4"><div className="flex gap-2"><button onClick={() => setMode('volume')} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${mode === 'volume' ? 'bg-[#143250] text-white' : 'bg-[#f1f5f8] text-[#62778c]'}`}>By volume</button><button onClick={() => setMode('value')} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${mode === 'value' ? 'bg-[#143250] text-white' : 'bg-[#f1f5f8] text-[#62778c]'}`}>By value</button></div>{rows.length ? <div className="mt-3 divide-y divide-[#edf1f4]">{rows.map((row) => <div key={row.key} className="flex items-center justify-between gap-3 py-3 text-sm"><p className="truncate font-semibold text-[#31475d]">{row.client}</p><p className="shrink-0 text-right text-xs text-[#657a90]">{row.count} {row.count === 1 ? 'application' : 'applications'}<br /><span className="font-semibold text-[#31475d]">{row.valueLabel}</span></p></div>)}</div> : <BondEmptyState compact title="No clients in this scope" description="Client rankings will appear with applications." />}</BondSectionCard>
}
