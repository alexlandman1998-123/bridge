import { RegistrationTargets, ApplicationConversion, BankTurnaround, CommissionBreakdown } from './BondPerformancePanels'
import { bondMoney } from '../../services/bondDashboardPerformanceModel'
import './premium-bond-dashboard.css'
import { createElement, useState } from 'react'
import { ArrowRight, BadgeCheck, BriefcaseBusiness, Landmark, WalletCards } from 'lucide-react'
import { Link } from 'react-router-dom'
import BondEmptyState from './BondEmptyState'
import BondSectionCard from './BondSectionCard'

const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback
const text = (value, fallback = '') => String(value ?? '').trim() || fallback
const metric = (items, key) => (items || []).find((item) => item.key === key) || {}

function Metric({ value, label, detail, icon: Icon = BriefcaseBusiness, className = '' }) {
  return <div className={`min-w-0 px-2 py-1 ${className}`}><div className="flex items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#e8f5ef] text-[#16835f]">{createElement(Icon, { size: 18, strokeWidth: 1.8 })}</span><p className="text-sm font-semibold text-[#31475d]">{label}</p></div><p className="bond-dashboard-metric-value mt-3 font-semibold text-[#111b2c]">{text(value, '—')}</p>{detail ? <p className="mt-2 truncate text-xs font-medium text-[#587087]">{detail}</p> : null}</div>
}

function ApplicationCard({ item = {} }) {
  const stages = Array.isArray(item.stageItems) ? item.stageItems : []
  const initials = text(item.buyerName, '?').split(' ').map((word) => word[0]).slice(0, 2).join('')
  return <Link to={item.href || '/bond/pipeline?view=all'} className="bond-application-card group">
    <div className="bond-application-meta"><span>{text(item.reference, 'Application')}</span><ArrowRight size={15} /></div>
    <div className="bond-applicant"><span className="bond-applicant-avatar">{initials}</span><div><h3>{text(item.buyerName, 'Buyer pending')}</h3><p>{text(item.consultantName, 'Unassigned originator')}</p></div></div>
    <div className="bond-application-property"><strong>{text(item.propertyLabel, 'Property pending')}</strong><span>{text(item.developmentName, '')}</span></div>
    <div className="bond-application-loan"><span>Loan amount</span><strong>{text(item.bondValue, '—')}</strong></div>
    <div className="bond-application-stage"><span>{text(item.currentStage, 'Application')}</span><div className="bond-application-stage-bars">{stages.map((stage) => <i key={stage.key} data-state={stage.state} />)}</div></div>
    <div className="bond-application-outcomes"><span><strong>{item.submittedBanks ?? '—'}</strong> banks submitted</span><span><strong>{item.approvedBanks ?? '—'}</strong> approved</span></div>
    <div className="bond-application-footer"><span>Updated {text(item.updatedLabel, 'not recorded')}</span><strong>Open file <ArrowRight size={13} /></strong></div>
  </Link>
}

function Pipeline({ overview = {} }) {
  const pipeline = overview.pipeline || []
  const labels = { application: 'Application', at_banks: 'At banks', accepted: 'Approved', lodged: 'Lodged', registered: 'Registered' }
  const total = pipeline.reduce((sum, stage) => sum + number(stage.count), 0)
  return <BondSectionCard title="Applications Pipeline" action={<Link to="/bond/pipeline?view=all" className="text-sm font-semibold text-[#24518a]">View pipeline <ArrowRight className="inline h-4 w-4" /></Link>} className="rounded-[16px] border-[#e5eaee] p-5 shadow-[0_7px_20px_rgba(15,23,42,.03)]" contentClassName="mt-6">
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">{pipeline.map((stage) => <div key={stage.key} className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-[#71859a]">{labels[stage.key] || stage.label}</p><p className="bond-dashboard-metric-value mt-2 font-semibold text-[#142132]">{number(stage.count)}</p><p className="mt-1 truncate text-xs text-[#60758d]">{text(stage.loanValueLabel, 'R0')}</p></div>)}</div>
    <div className="mt-6 flex h-2 overflow-hidden rounded-full bg-[#edf1f4]">{pipeline.map((stage, index) => <span key={stage.key} className={index === 1 ? 'bg-[#267e61]' : index > 2 ? 'bg-[#63a88e]' : 'bg-[#1d8f69]'} style={{ width: `${total ? (number(stage.count) / total) * 100 : 0}%` }} />)}</div>
  </BondSectionCard>
}

export default function PremiumBondDashboard({ snapshot = {}, canConfigureTarget = false }) {
  const overview = snapshot.managementOverview || {}
  const active = overview.kpis?.find((row) => row.key === 'active_pipeline') || metric(snapshot.heroKpis, 'active_applications')
  const approval = overview.kpis?.find((row) => row.key === 'approval_rate') || metric(snapshot.heroKpis, 'approval_rate')
  const commission = overview.kpis?.find((row) => row.key === 'commission_forecast') || metric(snapshot.heroKpis, 'commission_pipeline')
  const atBanks = (overview.pipeline || []).find((row) => row.key === 'at_banks') || {}
  const clients = overview.clientRankings || { byVolume: [], byValue: [] }
  const performance = snapshot.dashboardPerformance || {}
  const applications = snapshot.dashboardApplications || snapshot.activeApplications || []
  const [applicationFilter, setApplicationFilter] = useState('all')
  const activeApps = applications.filter((item) => applicationFilter === 'all' || (applicationFilter === 'at_banks' ? item.submittedBanks > 0 && !item.approvedBanks : item.approvedBanks > 0))
  return <div className="bond-dashboard space-y-5 rounded-[22px] bg-[#f8fafb] p-1 sm:p-2">
    <section aria-label="Pipeline metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <BondSectionCard className="min-w-0 rounded-[16px] border-[#e5eaee] p-5 shadow-[0_7px_20px_rgba(15,23,42,.03)]">
        <Metric value={snapshot.dashboardApplications ? applications.length : active.value} label="Active applications" detail="Current open applications" icon={BriefcaseBusiness} />
      </BondSectionCard>
      <BondSectionCard className="min-w-0 rounded-[16px] border-[#e5eaee] p-5 shadow-[0_7px_20px_rgba(15,23,42,.03)]">
        <Metric value={atBanks.count} label="At banks" detail={atBanks.loanValueLabel ? `${atBanks.loanValueLabel} submitted` : ''} icon={Landmark} />
      </BondSectionCard>
      <BondSectionCard className="min-w-0 rounded-[16px] border-[#e5eaee] p-5 shadow-[0_7px_20px_rgba(15,23,42,.03)]">
        <Metric value={performance.bankAvailable === false ? '—' : performance.conversion ? performance.conversion.approvalRate === null ? '—' : `${performance.conversion.approvalRate}%` : approval.value} label="Approval rate" detail={performance.bankAvailable === false ? 'Submission records unavailable' : performance.conversion ? `${performance.conversion.approved} of ${performance.conversion.submitted} submitted this month` : 'No cohort data yet'} icon={BadgeCheck} />
      </BondSectionCard>
      <BondSectionCard className="min-w-0 rounded-[16px] border-[#e5eaee] p-5 shadow-[0_7px_20px_rgba(15,23,42,.03)]">
        <Metric value={performance.commissionAvailable === false ? '—' : performance.commissions ? bondMoney(performance.commissionPipeline) : commission.value} label="Commission pipeline" detail={performance.commissionAvailable === false ? 'Commission records unavailable' : 'Open bond commission records'} icon={WalletCards} />
      </BondSectionCard>
    </section>
    <BondSectionCard title="Active Applications" action={<Link to="/bond/applications" className="text-sm font-semibold text-[#24518a]">View all applications <ArrowRight className="inline h-4 w-4" /></Link>} className="rounded-[16px] border-[#e5eaee] p-5 shadow-[0_7px_20px_rgba(15,23,42,.03)]" contentClassName="mt-5">{applications.length ? <div className="bond-application-filters" role="group" aria-label="Filter active applications">{[['all', 'All'], ['at_banks', 'At banks'], ['approved', 'Approved']].map(([key, label]) => <button type="button" key={key} aria-pressed={applicationFilter === key} onClick={() => setApplicationFilter(key)}>{label}</button>)}</div> : null}{activeApps.length ? <div className="-mx-1 overflow-x-auto px-1 pb-2 [scrollbar-width:none]"><div className="flex snap-x snap-proximity gap-3">{activeApps.map((item) => <ApplicationCard key={item.id} item={item} />)}</div></div> : <BondEmptyState compact title={applications.length ? "No applications in this stage" : "No active applications"} description="Applications in your current scope will appear here." />}</BondSectionCard>
    <section className="grid gap-4 xl:grid-cols-2"><RegistrationTargets performance={performance} canConfigure={canConfigureTarget} /><ApplicationConversion performance={performance} /></section>
    <Pipeline overview={overview} />
    <section className="grid gap-4 xl:grid-cols-2"><BankTurnaround performance={performance} /><CommissionBreakdown performance={performance} /></section>
    <TopClients clients={clients} />
  </div>
}

function TopClients({ clients = {} }) {
  const [mode, setMode] = useState('volume')
  const rows = mode === 'volume' ? clients.byVolume || [] : clients.byValue || []
  return <BondSectionCard title="Top Clients" action={<Link to="/bond/clients" className="text-sm font-semibold text-[#24518a]">View all clients <ArrowRight className="inline h-4 w-4" /></Link>} className="rounded-[16px] border-[#e5eaee] p-5 shadow-[0_7px_20px_rgba(15,23,42,.03)]" contentClassName="mt-4"><div className="flex gap-2"><button onClick={() => setMode('volume')} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${mode === 'volume' ? 'bg-[#143250] text-white' : 'bg-[#f1f5f8] text-[#62778c]'}`}>By volume</button><button onClick={() => setMode('value')} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${mode === 'value' ? 'bg-[#143250] text-white' : 'bg-[#f1f5f8] text-[#62778c]'}`}>By value</button></div>{rows.length ? <div className="mt-3 divide-y divide-[#edf1f4]">{rows.map((row) => <div key={row.key} className="flex items-center justify-between gap-3 py-3 text-sm"><p className="truncate font-semibold text-[#31475d]">{row.client}</p><p className="shrink-0 text-right text-xs text-[#657a90]">{row.count} {row.count === 1 ? 'application' : 'applications'}<br /><span className="font-semibold text-[#31475d]">{row.valueLabel}</span></p></div>)}</div> : <BondEmptyState compact title="No clients in this scope" description="Client rankings will appear with applications." />}</BondSectionCard>
}
