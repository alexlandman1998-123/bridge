import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  ChevronRight,
  CircleDollarSign,
  CalendarDays,
  FileCheck2,
  Flag,
  HeartPulse,
  PieChart,
  ShieldAlert,
  ShieldCheck,
  Signature,
  TrendingUp,
  Upload,
  UsersRound,
  WalletCards,
} from 'lucide-react'
import { createElement, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useWorkspace } from '../context/WorkspaceContext'
import useAttorneyPermissions from '../hooks/useAttorneyPermissions'
import { createPerfTimer } from '../lib/performanceTrace'
import { getAttorneyManagementDashboardData } from '../services/attorneyDashboard'

const ROLE_VIEW_OPTIONS = [
  { value: 'active', label: 'Incoming Matters' },
  { value: 'all', label: 'All Matters' },
  { value: 'registered', label: 'Registered Matters' },
  { value: 'archived', label: 'Archived Matters' },
  { value: 'transfer', label: 'Transfer Matters' },
  { value: 'bond', label: 'Bond Matters' },
  { value: 'cancellation', label: 'Cancellation Matters' },
  { value: 'shared', label: 'Shared Matters' },
  { value: 'full-service', label: 'Full-Service Matters' },
]

function normalizeText(value = '') {
  return String(value || '').trim()
}

const EMPTY_DASHBOARD = {
  firm: null,
  canViewFirmDashboard: false,
  matterStats: {},
  criticalAlerts: [],
  mattersRequiringAttention: [],
  matterLanes: {
    transfer: [],
    bond: [],
    cancellation: [],
  },
  attentionMetrics: [],
  partnerAnalytics: {
    status: 'empty',
    rows: [],
  },
  conveyancingPerformance: {
    averageDaysToRegistration: 0,
    registrationSuccessRate: 0,
    averageDocumentTurnaroundDays: 0,
    registrationForecast: {
      thisWeek: 0,
      nextWeek: 0,
      thisMonth: 0,
    },
    matterDistribution: [],
  },
  matterHealth: {
    total: 0,
    onTrack: { count: 0, percentage: 0 },
    attention: { count: 0, percentage: 0 },
    critical: { count: 0, percentage: 0 },
  },
}

const surfaceClass = 'min-w-0 rounded-xl border border-slate-200/80 bg-white shadow-[0_8px_22px_rgba(15,23,42,0.035)]'
const softButtonClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50'
const primaryButtonClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#17324b] bg-[#17324b] px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#224761]'

function formatNumber(value) {
  return new Intl.NumberFormat('en-ZA').format(Number(value || 0))
}

function formatCurrency(value) {
  const amount = Number(value || 0)
  if (amount >= 1000000) {
    return `R${(amount / 1000000).toFixed(amount >= 10000000 ? 0 : 1)}m`
  }
  if (amount >= 1000) {
    return `R${Math.round(amount / 1000)}k`
  }
  return `R${formatNumber(amount)}`
}

function clampPercentage(value) {
  return Math.max(0, Math.min(100, Number(value || 0)))
}

function StatePanel({ children, tone = 'neutral' }) {
  const toneClass = tone === 'danger' ? 'text-red-700' : 'text-slate-600'
  return (
    <section className="grid w-full max-w-none gap-4 px-3 py-4 sm:px-4 lg:px-5">
      <div className={`${surfaceClass} p-4`}>
        <p className={`text-sm ${toneClass}`}>{children}</p>
      </div>
    </section>
  )
}

function KpiCards({ stats = {}, performance = {} }) {
  const cards = [
    {
      key: 'active',
      label: 'Active Matters',
      value: formatNumber(stats.activeMatters),
      helper: `+${formatNumber(stats.newThisWeek)} this week`,
      icon: BriefcaseBusiness,
      tone: 'green',
    },
    {
      key: 'client',
      label: 'Awaiting Client',
      value: formatNumber(Number(stats.awaitingFica || 0) + Number(stats.awaitingSignatures || 0)),
      helper: 'Client action needed',
      icon: UsersRound,
      tone: 'amber',
    },
    {
      key: 'lodgement',
      label: 'Lodgements',
      value: formatNumber(stats.lodgementsToday || stats.lodgementsPending || 0),
      helper: stats.lodgementsToday ? `${formatNumber(stats.lodgementsToday)} today` : 'Pending',
      icon: Upload,
      tone: 'green',
    },
    {
      key: 'registration',
      label: 'Registrations',
      value: formatNumber(performance?.registrationForecast?.thisWeek || stats.registrationsThisWeek || 0),
      helper: 'This week',
      icon: Flag,
      tone: 'green',
    },
    {
      key: 'revenue',
      label: 'Revenue Pipeline',
      value: formatCurrency(stats.revenuePipelineValue),
      helper: 'Transfer value',
      icon: WalletCards,
      tone: 'green',
    },
  ]

  return (
    <section className={`${surfaceClass} overflow-x-auto overflow-y-hidden`} aria-label="Matter summary">
      <div className="flex min-w-max divide-x divide-slate-200/90 px-3 py-4 sm:px-4 lg:grid lg:min-w-0 lg:grid-cols-5 lg:px-5 lg:py-6">
        {cards.map((card) => {
        const Icon = card.icon
        // “Incoming Matters” is a separate pre-instruction queue. Active
        // Matters must lead to the same all-matters workspace that supplies
        // this KPI, not that incoming queue.
        const href = card.key === 'active' ? '/attorney/matters/all' : card.key === 'client' ? '/attorney/matters/delayed' : card.key === 'registration' ? '/attorney/matters/registered' : '/attorney/matters'
        return (
          <Link key={card.key} to={href} className="group min-w-[166px] px-4 py-2 first:pl-2 last:pr-2 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 lg:min-w-0 lg:px-5">
            <span className="flex items-center gap-3">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[#e5f1ed] text-[#1c6b55]">
                <Icon size={17} />
              </span>
              <span className="truncate text-[13px] font-semibold text-slate-700">{card.label}</span>
            </span>
            <strong className="mt-3 block text-[30px] font-semibold leading-none tracking-[-0.04em] text-slate-950">{card.value}</strong>
            <span className={card.tone === 'amber' ? 'mt-3 block text-xs font-semibold text-amber-700' : 'mt-3 block text-xs font-semibold text-[#1c6b55]'}>{card.helper}</span>
          </Link>
        )
      })}
      </div>
    </section>
  )
}

function NeedsAttentionSection({ metrics = [] }) {
  const iconMap = {
    signatures: Signature,
    guarantees: ShieldAlert,
    clearance: FileCheck2,
    'client-documents': UsersRound,
    invoices: CircleDollarSign,
    stalled: AlertTriangle,
  }

  const rows = metrics.length ? metrics : EMPTY_DASHBOARD.attentionMetrics

  return (
    <section className="grid gap-3">
      <div className={`${surfaceClass} grid overflow-hidden sm:grid-cols-2 xl:grid-cols-6`}>
        {rows.map((item) => {
          const Icon = iconMap[item.key] || AlertTriangle
          return (
            <Link
              key={item.key}
              to="/attorney/matters/delayed"
              className="group grid min-h-[112px] grid-cols-[auto_minmax(0,1fr)] items-center gap-3 border-b border-slate-100 p-4 transition hover:bg-slate-50 sm:border-r xl:border-b-0"
            >
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
                <Icon size={17} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold text-slate-600">{item.label}</span>
                <strong className="mt-2 block text-2xl font-semibold leading-none text-slate-950">{formatNumber(item.count)}</strong>
                <span className="mt-2 block truncate text-xs font-medium text-slate-500">{item.helper}</span>
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

function getActiveMatterRows(lanes = {}) {
  const roleConfig = [
    { key: 'transfer', label: 'Transfer' },
    { key: 'bond', label: 'Bond' },
    { key: 'cancellation', label: 'Cancellation' },
  ]
  const byId = new Map()

  roleConfig.forEach((role) => {
    const laneRows = lanes[role.key] || []
    laneRows.forEach((matter) => {
      const id = matter.id || `${role.key}-${matter.reference}`
      if (!byId.has(id)) {
        byId.set(id, {
          ...matter,
          id,
          roleLabels: [role.label],
        })
        return
      }

      const existing = byId.get(id)
      if (!existing.roleLabels.includes(role.label)) existing.roleLabels.push(role.label)
    })
  })

  return [...byId.values()]
}

function getMatterProgressTone(riskTone = '') {
  if (riskTone === 'attention' || riskTone === 'high') return '#b7791f'
  return '#1c6b55'
}

function getMatterStatusClasses(statusLabel = '', riskTone = '') {
  const status = String(statusLabel || '').toLowerCase()
  if (status.includes('fica')) return 'bg-amber-50 text-amber-700'
  if (status.includes('doc')) return 'bg-sky-50 text-sky-700'
  if (status.includes('bank')) return 'bg-violet-50 text-violet-700'
  if (status.includes('lodg') || status.includes('track')) return 'bg-emerald-50 text-[#1c6b55]'
  if (riskTone === 'high') return 'bg-red-50 text-red-700'
  if (riskTone === 'attention') return 'bg-amber-50 text-amber-700'
  return 'bg-emerald-50 text-[#1c6b55]'
}

function getMatterPreview(matter = {}) {
  return {
    matterId: matter.id,
    matterReference: matter.reference,
    financeType: matter.financeType,
    purchasePrice: matter.purchasePrice || matter.value || 0,
    sellerName: matter.sellerName || '',
    sellerHasExistingBond: matter.sellerHasExistingBond || false,
    currentBondBank: matter.currentBondBank || matter.bank || '',
    estimatedSettlementAmount: matter.estimatedSettlementAmount || 0,
    propertyLabel: matter.propertyAddress || '',
    lifecycleState: matter.lifecycleState || 'active',
    currentStage: matter.currentStage || matter.statusLabel || '',
    registrationDate: matter.registrationDate || null,
    lastUpdated: matter.lastUpdated || matter.lastActivityAt || matter.instructedAt || null,
    buyerName: matter.buyerName || '',
    clientName: matter.buyerName || '',
    developmentName: matter.developmentName || '',
  }
}

function getInitials(value = '') {
  return String(value || 'Partner')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'P'
}

function formatProfessionalRole(role = '') {
  const labels = {
    firm_admin: 'Firm Administrator',
    director_partner: 'Director / Partner',
    attorney_conveyancer: 'Attorney / Conveyancer',
    candidate_attorney: 'Candidate Attorney',
    conveyancing_secretary: 'Conveyancing Secretary',
  }
  return labels[role] || String(role || 'Team Member').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function ActiveMatterStrip({ lanes = {} }) {
  const rows = getActiveMatterRows(lanes)
  const railRef = useRef(null)
  const [canScrollNext, setCanScrollNext] = useState(false)

  useEffect(() => {
    const rail = railRef.current
    if (!rail) return undefined

    const updateOverflow = () => {
      setCanScrollNext(rail.scrollWidth - rail.clientWidth - rail.scrollLeft > 4)
    }
    updateOverflow()
    rail.addEventListener('scroll', updateOverflow, { passive: true })
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateOverflow)
    observer?.observe(rail)
    return () => {
      rail.removeEventListener('scroll', updateOverflow)
      observer?.disconnect()
    }
  }, [rows.length])

  const scrollNext = () => {
    const rail = railRef.current
    if (!rail) return
    rail.scrollBy({ left: Math.min(rail.clientWidth * 0.8, 340), behavior: 'smooth' })
  }

  const handleWheel = (event) => {
    const rail = railRef.current
    if (!rail || !event.deltaY || event.deltaX) return
    if (rail.scrollWidth <= rail.clientWidth) return
    event.preventDefault()
    rail.scrollLeft += event.deltaY
  }

  return (
    <section className={`${surfaceClass} overflow-hidden`} aria-labelledby="active-matters-heading">
      <header className="flex h-14 items-center justify-between gap-4 border-b border-slate-100 px-5">
        <h2 id="active-matters-heading" className="text-[15px] font-semibold tracking-[-0.01em] text-slate-950">Active Matters</h2>
        <Link to="/attorney/matters/all" className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-slate-600 transition hover:text-slate-950">
          View all matters <ArrowRight size={14} />
        </Link>
      </header>
      {rows.length ? (
        <div className="relative">
          <div
            ref={railRef}
            onWheel={handleWheel}
            className="flex snap-x snap-proximity gap-4 overflow-x-auto overflow-y-hidden px-5 py-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {rows.map((matter) => {
              const progress = clampPercentage(matter.progress || 0)
              const progressTone = getMatterProgressTone(matter.riskTone)
              const roleLabel = (matter.roleLabels || []).join(' / ') || matter.matterType || 'Matter'
              const statusLabel = matter.statusLabel || 'In Progress'

              return (
                <Link
                  key={matter.id}
                  to={matter.href || '/attorney/matters'}
                  state={{ matterPreview: getMatterPreview(matter) }}
                  className="group flex min-h-[268px] w-[88vw] shrink-0 snap-start flex-col rounded-2xl border border-slate-200 border-l-4 border-l-[#00614f] bg-[#f7faf9] p-5 shadow-[0_2px_8px_rgba(15,23,42,0.025)] transition duration-200 hover:-translate-y-px hover:border-[#a8cbbf] hover:bg-[#f4f8f6] hover:shadow-[0_10px_22px_rgba(15,23,42,0.075)] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 sm:w-[335px]"
                >
                  <header className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <strong className="block truncate text-sm font-semibold tracking-[-0.01em] text-slate-950">{matter.reference}</strong>
                      <span className="mt-2 block truncate text-xs font-medium text-slate-500">{roleLabel}</span>
                    </span>
                    <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${getMatterStatusClasses(statusLabel, matter.riskTone)}`}>
                        {statusLabel}
                    </span>
                  </header>

                  <section className="mt-4 min-w-0">
                    <p className="line-clamp-2 min-h-[40px] text-sm font-semibold leading-5 text-slate-900">{matter.propertyAddress || 'Property address pending'}</p>
                    <p className="mt-1.5 truncate text-xs font-medium text-slate-500">{matter.contextLabel || matter.buyerSellerName || matter.buyerName || 'Workflow progressing'}</p>
                  </section>

                  <section className="mt-4 grid grid-cols-2 divide-x divide-slate-200">
                    <span className="min-w-0 pr-4">
                      <strong className="block truncate text-sm font-semibold text-slate-950">{formatCurrency(matter.value || matter.purchasePrice)}</strong>
                      <span className="mt-1 block text-[11px] font-medium text-slate-500">Value</span>
                    </span>
                    <span className="min-w-0 pl-4">
                      <strong className="block truncate text-sm font-semibold text-slate-950">{matter.assignedStaff || 'Unassigned'}</strong>
                      <span className="mt-1 block text-[11px] font-medium text-slate-500">Attorney</span>
                    </span>
                  </section>

                  <section className="mt-auto pt-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">Matter progress</span>
                      <strong className="text-xs font-semibold text-slate-900">{Math.round(progress)}%</strong>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                      <span className="block h-full rounded-full bg-[#16805f] transition-all duration-200" style={{ width: `${progress}%`, backgroundColor: progressTone }} />
                    </div>
                  </section>
                </Link>
              )
            })}
          </div>
          {canScrollNext ? (
            <button
              type="button"
              onClick={scrollNext}
              className="absolute right-3 top-1/2 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-800 shadow-[0_5px_15px_rgba(15,23,42,0.12)] transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              aria-label="Scroll active matters forward"
            >
              <ChevronRight size={20} />
            </button>
          ) : null}
        </div>
      ) : (
        <div className="flex min-h-[86px] items-center px-5 py-4">
          <p className="text-sm font-medium text-slate-500">No active matters yet.</p>
        </div>
      )}
    </section>
  )
}

function AttorneyTeamOverview({ members = [], selectedMember, onSelectMember }) {
  const visibleMembers = members.filter((member) =>
    ['attorney_conveyancer', 'candidate_attorney', 'conveyancing_secretary', 'transfer_attorney', 'bond_attorney'].includes(member.professionalRole || member.role),
  )

  if (!visibleMembers.length) return null

  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold tracking-[-0.01em] text-slate-950">Your firm’s team</h2>
        <Link to="/users" className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-950">
          Manage team <ArrowRight size={13} />
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {visibleMembers.map((member) => {
          const isSelected = selectedMember?.userId === member.userId
          return (
            <button
              key={member.memberId || member.userId}
              type="button"
              onClick={() => onSelectMember(member)}
              className={`min-w-0 rounded-xl border bg-white p-4 text-left shadow-[0_8px_22px_rgba(15,23,42,0.035)] transition hover:-translate-y-px hover:border-[#9bc9ba] hover:shadow-[0_12px_26px_rgba(15,23,42,0.075)] focus:outline-none focus:ring-4 focus:ring-emerald-100 ${isSelected ? 'border-[#3c8a71] ring-2 ring-emerald-100' : 'border-slate-200/80'}`}
              aria-pressed={isSelected}
            >
              <span className="flex items-start gap-3">
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[#14394f] text-xs font-bold text-white">{getInitials(member.fullName)}</span>
                <span className="min-w-0">
                  <strong className="block truncate text-sm font-semibold text-slate-950">{member.fullName}</strong>
                  <span className="mt-1 block truncate text-xs font-medium text-slate-500">{formatProfessionalRole(member.professionalRole || member.role)}</span>
                </span>
              </span>
              <span className="mt-4 flex items-end justify-between gap-3">
                <span><span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">Active matters</span><strong className="mt-1 block text-xl font-semibold leading-none text-slate-950">{formatNumber(member.assignedMatters)}</strong></span>
                <span className="text-xs font-semibold text-[#1c6b55]">View profile</span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function AttorneyTeamProfile({ member, onClose }) {
  if (!member) return null

  return (
    <section className={`${surfaceClass} grid gap-4 p-5`} aria-live="polite">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-[#14394f] text-sm font-bold text-white">{getInitials(member.fullName)}</span>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-slate-950">{member.fullName}</h2>
            <p className="mt-1 truncate text-sm text-slate-500">{formatProfessionalRole(member.professionalRole || member.role)} · {member.departmentName}</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800">Close</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-slate-50 px-4 py-3"><span className="block text-xs font-medium text-slate-500">Active matters</span><strong className="mt-1 block text-2xl font-semibold text-slate-950">{formatNumber(member.assignedMatters)}</strong></div>
        <div className="rounded-lg bg-slate-50 px-4 py-3"><span className="block text-xs font-medium text-slate-500">Matters needing attention</span><strong className="mt-1 block text-2xl font-semibold text-slate-950">{formatNumber(member.delayedMatters)}</strong></div>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-slate-800">Current active matters</h3>
        {member.activeMatters?.length ? (
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {member.activeMatters.map((matter) => (
              <Link key={matter.id} to={matter.href} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 transition hover:border-[#9bc9ba] hover:bg-emerald-50/30">
                <strong className="block truncate text-xs font-semibold text-slate-900">{matter.reference}</strong>
                <span className="mt-1 block truncate text-xs text-slate-500">{matter.propertyAddress}</span>
              </Link>
            ))}
          </div>
        ) : <p className="mt-2 text-sm text-slate-500">No active matters are assigned at the moment.</p>}
      </div>
    </section>
  )
}

function AnalyticsCardHeader({ icon, title, subtitle, actionHref, actionLabel = 'View report' }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#e5f1ed] text-[#0f684f]">
          {icon ? createElement(icon, { size: 21 }) : null}
        </span>
        <span className="min-w-0">
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-slate-950">{title}</h2>
          <p className="mt-1 text-sm font-medium leading-5 text-slate-500">{subtitle}</p>
        </span>
      </div>
      {actionHref ? (
        <Link to={actionHref} className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-[#0f684f] hover:text-[#0a4938]">
          {actionLabel} <ArrowRight size={14} />
        </Link>
      ) : null}
    </div>
  )
}

function PartnerAvatar({ row = {}, index = 0 }) {
  const tones = ['bg-[#0f684f] text-white', 'bg-slate-950 text-white', 'bg-[#d6c08f] text-white', 'bg-[#6f9284] text-white', 'bg-[#e5f1ed] text-[#0f684f]']
  return (
    <span className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${tones[index % tones.length]}`}>
      {row.avatar || String(row.partnerName || row.partner || 'P').slice(0, 2).toUpperCase()}
    </span>
  )
}

function PartnerAnalyticsCard({ analytics = EMPTY_DASHBOARD.partnerAnalytics }) {
  const rows = analytics.rows || []

  return (
    <section className={`${surfaceClass} flex min-h-[410px] flex-col p-5`}>
      <AnalyticsCardHeader
        icon={UsersRound}
        title="Partner Analytics"
        subtitle="Track which partners are bringing the most work."
        actionHref="/partners"
        actionLabel="View all"
      />

      {rows.length ? (
        <div className="mt-6 min-w-0 overflow-x-auto">
          <table className="w-full min-w-[640px] table-fixed text-left">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                <th className="w-[38%] py-3 pr-4">Partner</th>
                <th className="w-[18%] py-3 pr-4 text-center">Active Matters</th>
                <th className="w-[18%] py-3 pr-4 text-center">New This Month</th>
                <th className="w-[26%] py-3">Revenue Pipeline</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.slice(0, 5).map((row, index) => (
                <tr key={row.partnerId || row.partner} className="text-sm text-slate-700">
                  <td className="py-3 pr-4">
                    <span className="flex min-w-0 items-center gap-3">
                      <PartnerAvatar row={row} index={index} />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-slate-950">{row.partnerName || row.partner}</span>
                        <span className="mt-0.5 block truncate text-xs font-medium text-slate-500">{row.partnerType || 'Referral Partner'}</span>
                      </span>
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-center font-semibold text-slate-950">{formatNumber(row.activeMatters)}</td>
                  <td className="py-3 pr-4 text-center font-semibold text-slate-950">{formatNumber(row.newThisMonth)}</td>
                  <td className="py-3">
                    <div className="grid min-w-0 grid-cols-[76px_minmax(0,1fr)] items-center gap-3">
                      <span className="font-semibold text-slate-950">{formatCurrency(row.pipelineValue ?? row.revenuePipeline)}</span>
                      <span className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <span className="block h-full rounded-full bg-[#2f9a70]" style={{ width: `${clampPercentage(row.revenueShare)}%` }} />
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-6 flex flex-1 items-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8">
          <p className="max-w-md text-sm font-medium leading-6 text-slate-500">Partner analytics will appear once matters are linked to referring partners.</p>
        </div>
      )}

      <div className="mt-auto flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-500">
        <FileCheck2 size={16} className="text-[#0f684f]" />
        Partner analytics updates automatically as matters are linked.
      </div>
    </section>
  )
}

function getHealthDonutStyle(health = {}) {
  const onTrack = clampPercentage(health.onTrack?.percentage)
  const attention = clampPercentage(health.attention?.percentage)
  const critical = clampPercentage(health.critical?.percentage)
  return {
    background: `conic-gradient(#2f9a70 0 ${onTrack}%, #f5a623 ${onTrack}% ${onTrack + attention}%, #ef4444 ${onTrack + attention}% ${onTrack + attention + critical}%, #e5e7eb ${onTrack + attention + critical}% 100%)`,
  }
}

function MatterHealthCard({ health = EMPTY_DASHBOARD.matterHealth }) {
  const hasMatters = Number(health.total || 0) > 0
  const legend = [
    { label: 'On Track', value: health.onTrack, color: 'bg-[#2f9a70]' },
    { label: 'Attention', value: health.attention, color: 'bg-[#f5a623]' },
    { label: 'Critical', value: health.critical, color: 'bg-red-500' },
  ]

  return (
    <section className={`${surfaceClass} flex min-h-[410px] flex-col p-5`}>
      <AnalyticsCardHeader
        icon={HeartPulse}
        title="Matter Health"
        subtitle="Overview of all active matters."
        actionHref="/attorney/matters/delayed"
        actionLabel="View report"
      />

      {hasMatters ? (
        <div className="mt-7 grid flex-1 gap-7 lg:grid-cols-[minmax(220px,0.9fr)_minmax(220px,1fr)] lg:items-center">
          <div className="relative mx-auto size-56 rounded-full p-5 shadow-[inset_0_0_0_1px_rgba(226,232,240,0.45)]" style={getHealthDonutStyle(health)}>
            <div className="grid size-full place-items-center rounded-full bg-white text-center shadow-[inset_0_8px_24px_rgba(15,23,42,0.06)]">
              <span>
                <strong className="block text-4xl font-semibold leading-none tracking-[-0.04em] text-slate-950">{formatNumber(health.total)}</strong>
                <span className="mt-2 block text-sm font-semibold text-slate-500">Total Matters</span>
              </span>
            </div>
          </div>
          <div className="grid divide-y divide-slate-100">
            {legend.map((item) => (
              <div key={item.label} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 py-4">
                <span className={`size-3 rounded-full ${item.color}`} />
                <span className="font-semibold text-slate-900">{item.label}</span>
                <span className="text-right">
                  <strong className="block text-xl font-semibold text-slate-950">{formatNumber(item.value?.percentage)}%</strong>
                  <span className="text-sm font-medium text-slate-500">{formatNumber(item.value?.count)} matters</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-6 flex flex-1 items-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8">
          <div>
            <p className="text-lg font-semibold text-slate-950">No active matters.</p>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-500">Matter health will appear once work begins.</p>
          </div>
        </div>
      )}

      <div className="mt-auto flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-500">
        <ShieldCheck size={16} className="text-[#0f684f]" />
        Matter health is automatically calculated based on deadlines, activity and risks.
      </div>
    </section>
  )
}

function PerformanceKPIs({ performance = EMPTY_DASHBOARD.conveyancingPerformance }) {
  const metricItems = [
    {
      label: 'Avg. Days to Registration',
      value: formatNumber(performance.averageDaysToRegistration),
      suffix: 'days',
      helper: performance.registrationSampleSize ? `${formatNumber(performance.registrationSampleSize)} registrations sampled` : 'Baseline pending',
    },
    {
      label: 'Registration Success Rate',
      value: `${Number(performance.registrationSuccessRate || 0).toFixed(1)}%`,
      suffix: '',
      helper: Number(performance.registrationSuccessRate || 0) ? 'Completed matters' : 'Baseline pending',
    },
    {
      label: 'Avg. Doc Turnaround',
      value: formatNumber(performance.averageDocumentTurnaroundDays),
      suffix: 'days',
      helper: Number(performance.averageDocumentTurnaroundDays || 0) ? 'Document SLA' : 'Baseline pending',
    },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {metricItems.map((item) => (
        <article key={item.label} className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-semibold leading-5 text-slate-500">{item.label}</p>
          <strong className="mt-4 block text-3xl font-semibold tracking-[-0.04em] text-slate-950">
            {item.value} {item.suffix ? <span className="text-base font-medium text-slate-500">{item.suffix}</span> : null}
          </strong>
          <span className="mt-3 block text-sm font-semibold text-[#0f684f]">{item.helper}</span>
        </article>
      ))}
    </div>
  )
}

function RegistrationForecastCard({ forecast = EMPTY_DASHBOARD.conveyancingPerformance.registrationForecast }) {
  const rows = [
    { label: 'This Week', value: forecast.thisWeek },
    { label: 'Next Week', value: forecast.nextWeek },
    { label: 'This Month', value: forecast.thisMonth },
  ]

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
        <CalendarDays size={16} className="text-slate-500" />
        Registration Forecast
      </div>
      <div className="mt-6 grid grid-cols-3 divide-x divide-slate-200 text-center">
        {rows.map((row) => (
          <span key={row.label} className="px-4">
            <span className="block text-sm font-medium text-slate-500">{row.label}</span>
            <strong className="mt-4 block text-4xl font-semibold tracking-[-0.04em] text-slate-950">{formatNumber(row.value)}</strong>
          </span>
        ))}
      </div>
      <p className="mt-6 text-center text-sm font-medium text-slate-500">Matters expected to register</p>
    </article>
  )
}

function getDistributionStyle(distribution = []) {
  const colors = ['#2f9a70', '#f5a623', '#ef4444', '#64748b']
  const segments = distribution.filter((item) => Number(item.percentage || 0) > 0)
  if (!segments.length) return { background: '#e5e7eb' }

  const totalPercentage = segments.reduce((sum, item) => sum + clampPercentage(item.percentage), 0)
  let cursor = 0
  const gradient = segments.map((item, index) => {
    const segmentSize = totalPercentage > 100
      ? (clampPercentage(item.percentage) / totalPercentage) * 100
      : clampPercentage(item.percentage)
    const start = cursor
    cursor += segmentSize
    return `${colors[index % colors.length]} ${start}% ${cursor}%`
  })
  if (cursor < 100) gradient.push(`#e5e7eb ${cursor}% 100%`)
  return { background: `conic-gradient(${gradient.join(', ')})` }
}

function MatterDistributionCard({ distribution = [] }) {
  const hasDistribution = distribution.some((item) => Number(item.count || 0) > 0)
  const colors = ['bg-[#2f9a70]', 'bg-[#f5a623]', 'bg-red-500', 'bg-slate-500']

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
        <PieChart size={16} className="text-slate-500" />
        Matter Distribution
      </div>
      {hasDistribution ? (
        <div className="mt-5 grid gap-5 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center">
          <div className="mx-auto size-32 rounded-full p-4" style={getDistributionStyle(distribution)}>
            <div className="size-full rounded-full bg-white shadow-inner" />
          </div>
          <div className="grid gap-3">
            {distribution.map((item, index) => (
              <div key={item.label} className="grid grid-cols-[auto_minmax(0,1fr)_64px_80px] items-center gap-3 text-sm">
                <span className={`size-2.5 rounded-full ${colors[index % colors.length]}`} />
                <span className="font-medium text-slate-700">{item.label}</span>
                <strong className="text-right text-slate-950">{formatNumber(item.percentage)}%</strong>
                <span className="text-right font-medium text-slate-500">{formatNumber(item.count)} matters</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-8 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-sm font-medium text-slate-500">
          Performance statistics will appear once the firm starts registering matters.
        </p>
      )}
    </article>
  )
}

function ConveyancingPerformanceCard({ performance = EMPTY_DASHBOARD.conveyancingPerformance }) {
  const distribution = performance.matterDistribution || []
  const forecast = performance.registrationForecast || EMPTY_DASHBOARD.conveyancingPerformance.registrationForecast

  return (
    <section className={`${surfaceClass} p-5`}>
      <AnalyticsCardHeader
        icon={TrendingUp}
        title="Conveyancing Performance"
        subtitle="Measure firm performance and forecast upcoming registrations."
        actionHref="/attorney/matters/registered"
        actionLabel="View report"
      />
      <div className="mt-6 grid gap-4">
        <PerformanceKPIs performance={performance} />
        <div className="grid gap-4 xl:grid-cols-2">
          <RegistrationForecastCard forecast={forecast} />
          <MatterDistributionCard distribution={distribution} />
        </div>
      </div>
    </section>
  )
}

function AttorneyAnalyticsSection({ partnerAnalytics, matterHealth, conveyancingPerformance }) {
  return (
    <section className="grid gap-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <PartnerAnalyticsCard analytics={partnerAnalytics || EMPTY_DASHBOARD.partnerAnalytics} />
        <MatterHealthCard health={matterHealth || EMPTY_DASHBOARD.matterHealth} />
      </div>
      <ConveyancingPerformanceCard performance={conveyancingPerformance || EMPTY_DASHBOARD.conveyancingPerformance} />
    </section>
  )
}

function AttorneyAnalyticsSkeleton() {
  return (
    <section
      className="grid gap-4"
      aria-busy="true"
      aria-label="Loading dashboard analytics"
      data-testid="attorney-dashboard-analytics-skeleton"
    >
      <div className="grid gap-4 xl:grid-cols-2">
        <div className={`${surfaceClass} h-56 animate-pulse bg-slate-100`} />
        <div className={`${surfaceClass} h-56 animate-pulse bg-slate-100`} />
      </div>
      <div className={`${surfaceClass} h-72 animate-pulse bg-slate-100`} />
    </section>
  )
}

function AttorneyDashboardPage() {
  const { role, profile, workspace: activeWorkspace } = useWorkspace()
  const permissionsState = useAttorneyPermissions()
  const location = useLocation()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dashboard, setDashboard] = useState(EMPTY_DASHBOARD)
  const [selectedTeamMember, setSelectedTeamMember] = useState(null)
  const [analyticsReady, setAnalyticsReady] = useState(false)

  const roleView = useMemo(() => {
    const value = new URLSearchParams(location.search).get('roleView') || 'all'
    return ROLE_VIEW_OPTIONS.some((option) => option.value === value) ? value : 'all'
  }, [location.search])
  const attorneyFirmId = useMemo(() => {
    if (normalizeText(activeWorkspace?.type) === 'attorney_firm') return normalizeText(activeWorkspace?.id)
    return normalizeText(profile?.primaryAttorneyFirmId || profile?.primary_attorney_firm_id)
  }, [activeWorkspace?.id, activeWorkspace?.type, profile?.primaryAttorneyFirmId, profile?.primary_attorney_firm_id])
  const currentUserId = normalizeText(profile?.id || profile?.userId)
  const shellClass = 'grid w-full max-w-none gap-4 bg-[#f7f9fb] px-0 py-3'

  useEffect(() => {
    let active = true

    async function loadDashboard() {
      const timer = createPerfTimer('attorney.page.dashboard', {
        firmId: attorneyFirmId || null,
        userId: currentUserId || null,
        roleView,
      })
      let outcome = 'success'
      setLoading(true)
      setError('')
      try {
        timer.mark('service:start')
        const nextData = await getAttorneyManagementDashboardData(attorneyFirmId || null, {
          roleView,
          userId: currentUserId || null,
        })
        timer.mark('service:end', {
          hasFirm: Boolean(nextData?.firm?.id),
          activeMatters: nextData?.kpis?.activeMatters ?? null,
        })
        if (!active) return
        setDashboard(nextData || EMPTY_DASHBOARD)
      } catch (loadError) {
        outcome = 'failed'
        if (!active) return
        setError(loadError?.message || 'Unable to load attorney dashboard.')
        setDashboard(EMPTY_DASHBOARD)
      } finally {
        timer.end({ outcome })
        if (active) setLoading(false)
      }
    }

    void loadDashboard()

    return () => {
      active = false
    }
  }, [attorneyFirmId, currentUserId, roleView])

  useEffect(() => {
    let active = true
    const revealAnalytics = () => {
      if (active) setAnalyticsReady(true)
    }
    const idleCallbackId = typeof window.requestIdleCallback === 'function'
      ? window.requestIdleCallback(revealAnalytics, { timeout: 1800 })
      : null
    const timeoutId = idleCallbackId === null
      ? window.setTimeout(revealAnalytics, 0)
      : null

    return () => {
      active = false
      if (idleCallbackId !== null && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleCallbackId)
      }
      if (timeoutId !== null) window.clearTimeout(timeoutId)
    }
  }, [])

  if (role !== 'attorney') return <Navigate to="/dashboard" replace />
  if (permissionsState.loading) return <StatePanel>Loading attorney permissions...</StatePanel>
  if (permissionsState.error) return <StatePanel tone="danger">{permissionsState.error}</StatePanel>
  if (permissionsState.membership && !permissionsState.membership.isActive) {
    return (
      <StatePanel>
        {permissionsState.membership.status === 'suspended'
          ? 'Your access to this firm has been suspended. Please contact your firm administrator.'
          : 'You are not an active member of this attorney firm.'}
      </StatePanel>
    )
  }
  if (loading) return <StatePanel>Loading attorney dashboard...</StatePanel>

  if (!dashboard?.firm?.id) {
    const hasProfileFirmLink = Boolean(String(profile?.primaryAttorneyFirmId || '').trim())
    return (
      <section className={shellClass}>
        <div className={`${surfaceClass} grid gap-3 p-4`}>
          <h2 className="text-xl font-semibold text-slate-950">Firm Setup Pending</h2>
          <p className="text-sm text-slate-600">
            {hasProfileFirmLink
              ? 'Your profile points to an attorney firm, but we could not load an active firm workspace. Review or repair the firm setup to unlock full workflow access.'
              : 'Your onboarding is complete, but your attorney firm is not configured yet. Continue setup to unlock full workflow access.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link to="/attorney/onboarding?repair=firm" className={primaryButtonClass}>
              {hasProfileFirmLink ? 'Repair Firm Setup' : 'Continue Firm Setup'}
            </Link>
            <Link to="/setup" className={softButtonClass}>View Setup Status</Link>
          </div>
        </div>
      </section>
    )
  }

  if (!dashboard.canViewFirmDashboard) return <Navigate to="/attorney/operations" replace />

  const lanes = dashboard.matterLanes || EMPTY_DASHBOARD.matterLanes
  const stats = dashboard.matterStats || EMPTY_DASHBOARD.matterStats
  const performance = dashboard.conveyancingPerformance || EMPTY_DASHBOARD.conveyancingPerformance
  const canViewTeamOverview = ['firm_admin', 'director_partner'].includes(
    dashboard.currentUserProfessionalRole || dashboard.currentUserRole,
  )

  return (
    <section className={shellClass}>
      {error ? <div className={`${surfaceClass} p-4`}><p className="text-sm text-red-700">{error}</p></div> : null}

      <KpiCards stats={stats} performance={performance} />
      <ActiveMatterStrip lanes={lanes} />
      {canViewTeamOverview ? (
        <>
          <AttorneyTeamOverview
            members={dashboard.staffWorkload || []}
            selectedMember={selectedTeamMember}
            onSelectMember={setSelectedTeamMember}
          />
          <AttorneyTeamProfile member={selectedTeamMember} onClose={() => setSelectedTeamMember(null)} />
        </>
      ) : null}
      <NeedsAttentionSection metrics={dashboard.attentionMetrics || []} />
      {analyticsReady ? (
        <AttorneyAnalyticsSection
          partnerAnalytics={dashboard.partnerAnalytics || EMPTY_DASHBOARD.partnerAnalytics}
          matterHealth={dashboard.matterHealth || EMPTY_DASHBOARD.matterHealth}
          conveyancingPerformance={performance}
        />
      ) : <AttorneyAnalyticsSkeleton />}
    </section>
  )
}

export default AttorneyDashboardPage
