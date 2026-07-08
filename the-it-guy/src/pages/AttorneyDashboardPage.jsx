import {
  AlertTriangle,
  ArrowRight,
  Bell,
  BriefcaseBusiness,
  CheckCircle2,
  CircleDollarSign,
  CalendarDays,
  FileCheck2,
  FileText,
  Flag,
  HeartPulse,
  Landmark,
  PieChart,
  ShieldAlert,
  ShieldCheck,
  Signature,
  TrendingUp,
  Upload,
  UsersRound,
  WalletCards,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useWorkspace } from '../context/WorkspaceContext'
import useAttorneyPermissions from '../hooks/useAttorneyPermissions'
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

function formatShortDate(value) {
  const parsed = new Date(value || '')
  if (Number.isNaN(parsed.getTime())) return 'TBC'
  return parsed.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function getFirstName(profile = {}) {
  const explicit = String(profile.firstName || profile.first_name || '').trim()
  if (explicit) return explicit
  const fullName = String(profile.fullName || profile.full_name || profile.name || '').trim()
  return fullName ? fullName.split(/\s+/)[0] : 'there'
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

function SectionHeading({ title, actionHref, actionLabel }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold tracking-[-0.01em] text-slate-950">{title}</h2>
      {actionHref ? (
        <Link to={actionHref} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-950">
          {actionLabel || 'View all'} <ArrowRight size={13} />
        </Link>
      ) : null}
    </div>
  )
}

function DashboardIntro({ profile = {}, stats = {} }) {
  const firstName = getFirstName(profile)
  const attentionToday = Number(stats.delayedMatters || 0) + Number(stats.awaitingSignatures || 0)
  const registrationsThisWeek = Number(stats.registrationsThisWeek || 0)

  return (
    <header className="grid gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-slate-950 sm:text-3xl">Good morning, {firstName}</h1>
          <span className="pb-1 text-sm font-medium text-slate-500">You have {formatNumber(stats.activeMatters)} active matters</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-600">
          <span className="inline-flex items-center gap-2">
            <Bell size={15} className="text-slate-500" />
            <strong className="font-semibold text-slate-800">{formatNumber(attentionToday)}</strong> require attention today
          </span>
          <span className="hidden h-5 w-px bg-slate-200 sm:inline-block" />
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 size={15} className="text-slate-500" />
            <strong className="font-semibold text-slate-800">{formatNumber(registrationsThisWeek)}</strong> registrations expected this week
          </span>
        </div>
      </div>
    </header>
  )
}

function MiniTrend({ tone = 'green' }) {
  const stroke = tone === 'amber' ? '#f59e0b' : '#1b8065'
  return (
    <svg viewBox="0 0 88 30" aria-hidden="true" className="h-8 w-20">
      <polyline
        points="2,22 14,19 25,23 37,14 49,17 61,9 74,12 86,5"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.5"
      />
    </svg>
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
      key: 'registration',
      label: 'Registrations',
      value: formatNumber(performance?.registrationForecast?.thisWeek || stats.registrationsThisWeek || 0),
      helper: 'This week',
      icon: Flag,
      tone: 'green',
    },
    {
      key: 'lodgement',
      label: 'Lodgements',
      value: formatNumber(stats.lodgementsToday || stats.lodgementsPending || 0),
      helper: stats.lodgementsToday ? 'Today' : 'Pending',
      icon: Upload,
      tone: 'green',
    },
    {
      key: 'documents',
      label: 'Document Requests',
      value: formatNumber(stats.documentRequestsOutstanding),
      helper: 'Outstanding',
      icon: FileText,
      tone: 'amber',
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
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <article key={card.key} className={`${surfaceClass} min-h-[146px] p-4`}>
            <div className="flex items-start justify-between gap-3">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[#e5f1ed] text-[#1c6b55]">
                <Icon size={18} />
              </span>
              <MiniTrend tone={card.tone} />
            </div>
            <p className="mt-4 text-sm font-semibold text-slate-800">{card.label}</p>
            <strong className="mt-2 block text-3xl font-semibold leading-none tracking-[-0.03em] text-slate-950">{card.value}</strong>
            <span className={card.tone === 'amber' ? 'mt-3 block text-xs font-semibold text-amber-700' : 'mt-3 block text-xs font-semibold text-[#1c6b55]'}>
              {card.helper}
            </span>
          </article>
        )
      })}
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
      <SectionHeading title="Needs Attention" actionHref="/attorney/matters/delayed" actionLabel="View all" />
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

function ActiveMatterStrip({ lanes = {} }) {
  const rows = getActiveMatterRows(lanes)

  return (
    <section className="grid gap-3">
      <SectionHeading title="Active Matters" actionHref="/attorney/matters" actionLabel="View all matters" />
      {rows.length ? (
        <div className="overflow-x-auto pb-1">
          <div className="flex w-max min-w-full gap-3">
            {rows.map((matter) => (
              <Link
                key={matter.id}
                to={matter.href || '/attorney/matters'}
                className={`${surfaceClass} grid min-h-[154px] w-[296px] shrink-0 content-between p-4 transition hover:border-[#b8d8cc] hover:shadow-[0_10px_24px_rgba(15,23,42,0.055)]`}
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <strong className="block truncate text-sm font-semibold text-slate-950">{matter.reference}</strong>
                    <span className="mt-1 block truncate text-xs font-medium text-slate-500">{matter.propertyAddress || 'Property pending'}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-[#e5f1ed] px-2.5 py-1 text-[11px] font-semibold text-[#1c6b55]">
                    {matter.roleLabels?.[0] || 'Matter'}
                  </span>
                </span>
                <span className="mt-4 block min-w-0">
                  <span className="block truncate text-xs font-semibold text-slate-700">{matter.buyerSellerName || matter.buyerName || 'Client pending'}</span>
                  <span className="mt-1 block truncate text-xs text-slate-500">{matter.currentStage || matter.statusLabel || 'Stage pending'}</span>
                </span>
                <span className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs">
                  <span className="font-medium text-slate-500">Instructed {formatShortDate(matter.instructedAt)}</span>
                  <ArrowRight size={14} className="shrink-0 text-slate-400" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <div className={`${surfaceClass} flex min-h-[86px] items-center px-4 py-3`}>
          <p className="text-sm font-medium text-slate-500">No active matters yet.</p>
        </div>
      )}
    </section>
  )
}

function MatterTableCard({ title, count, rows = [], href, emptyLabel, icon: Icon }) {
  return (
    <article className={`${surfaceClass} flex min-h-[304px] flex-col p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-[#e5f1ed] text-[#1c6b55]">
            <Icon size={15} />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-slate-950">{title}</h3>
            <p className="text-xs font-medium text-[#1c6b55]">{formatNumber(count)} active</p>
          </div>
        </div>
        <Link to={href} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-950">
          View <ArrowRight size={13} />
        </Link>
      </div>

      <div className="mt-4 min-w-0 flex-1 overflow-x-auto">
        {rows.length ? (
          <table className="w-full min-w-[520px] table-fixed text-left">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                <th className="w-[25%] py-2 pr-3">Matter Reference</th>
                <th className="w-[31%] py-2 pr-3">Property</th>
                <th className="w-[27%] py-2 pr-3">Buyer / Seller</th>
                <th className="w-[17%] py-2">Instructed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.slice(0, 5).map((matter) => (
                <tr key={matter.id} className="text-xs text-slate-700">
                  <td className="py-2.5 pr-3">
                    <Link to={matter.href || href} className="block truncate font-semibold text-slate-900 hover:text-[#1c6b55]">
                      {matter.reference}
                    </Link>
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className="block truncate">{matter.propertyAddress || 'Property pending'}</span>
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className="block truncate">{matter.buyerSellerName || matter.buyerName || 'Client pending'}</span>
                  </td>
                  <td className="py-2.5">
                    <span className="block truncate font-medium text-slate-600">{formatShortDate(matter.instructedAt)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="flex min-h-[190px] items-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-5">
            <p className="text-sm font-medium text-slate-500">{emptyLabel}</p>
          </div>
        )}
      </div>

      <Link to={href} className="mt-4 inline-flex items-center justify-center gap-2 border-t border-slate-100 pt-3 text-xs font-semibold text-[#1c6b55] hover:text-[#14513f]">
        View all {title.toLowerCase()} <ArrowRight size={13} />
      </Link>
    </article>
  )
}

function ActiveMattersByType({ lanes = {} }) {
  return (
    <section className="grid gap-3">
      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-3">
        <MatterTableCard
          title="Transfer Matters"
          count={(lanes.transfer || []).length}
          rows={lanes.transfer || []}
          href="/attorney/matters/transfer"
          emptyLabel="No active transfer matters yet."
          icon={FileCheck2}
        />
        <MatterTableCard
          title="Bond Matters"
          count={(lanes.bond || []).length}
          rows={lanes.bond || []}
          href="/attorney/matters/bond"
          emptyLabel="No active bond matters yet."
          icon={Landmark}
        />
        <MatterTableCard
          title="Cancellation Matters"
          count={(lanes.cancellation || []).length}
          rows={lanes.cancellation || []}
          href="/attorney/matters/cancellation"
          emptyLabel="No active cancellation matters yet."
          icon={ShieldAlert}
        />
      </div>
    </section>
  )
}

function AnalyticsCardHeader({ icon: Icon, title, subtitle, actionHref, actionLabel = 'View report' }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#e5f1ed] text-[#0f684f]">
          <Icon size={21} />
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

function AttorneyDashboardPage() {
  const { role, profile } = useWorkspace()
  const permissionsState = useAttorneyPermissions()
  const location = useLocation()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dashboard, setDashboard] = useState(EMPTY_DASHBOARD)

  const roleView = useMemo(() => {
    const value = new URLSearchParams(location.search).get('roleView') || 'all'
    return ROLE_VIEW_OPTIONS.some((option) => option.value === value) ? value : 'all'
  }, [location.search])
  const shellClass = 'grid w-full max-w-none gap-4 bg-[#f7f9fb] px-0 py-3'

  useEffect(() => {
    let active = true

    async function loadDashboard() {
      setLoading(true)
      setError('')
      try {
        const nextData = await getAttorneyManagementDashboardData(null, { roleView })
        if (!active) return
        setDashboard(nextData || EMPTY_DASHBOARD)
      } catch (loadError) {
        if (!active) return
        setError(loadError?.message || 'Unable to load attorney dashboard.')
        setDashboard(EMPTY_DASHBOARD)
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadDashboard()

    return () => {
      active = false
    }
  }, [roleView])

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

  return (
    <section className={shellClass}>
      {error ? <div className={`${surfaceClass} p-4`}><p className="text-sm text-red-700">{error}</p></div> : null}

      <DashboardIntro profile={profile} stats={stats} />
      <KpiCards stats={stats} performance={performance} />
      <NeedsAttentionSection metrics={dashboard.attentionMetrics || []} />
      <ActiveMatterStrip lanes={lanes} />
      <ActiveMattersByType lanes={lanes} />
      <AttorneyAnalyticsSection
        partnerAnalytics={dashboard.partnerAnalytics || EMPTY_DASHBOARD.partnerAnalytics}
        matterHealth={dashboard.matterHealth || EMPTY_DASHBOARD.matterHealth}
        conveyancingPerformance={performance}
      />
    </section>
  )
}

export default AttorneyDashboardPage
