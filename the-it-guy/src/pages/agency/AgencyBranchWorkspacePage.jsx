import {
  ArrowLeft,
  ArrowRightLeft,
  Banknote,
  BarChart3,
  Building2,
  CalendarDays,
  FileCheck2,
  Files,
  MapPin,
  MoreHorizontal,
  Plus,
  Settings,
  ShieldCheck,
  TrendingUp,
  UserPlus,
  Users,
} from 'lucide-react'
import { createElement, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getAgentLeaderboard } from '../../services/branchAnalyticsService'
import { getBranch, getBranchListings, getBranchTransactions } from '../../services/agencyBranchService'

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'agents', label: 'Agents' },
  { key: 'listings', label: 'Listings' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'clients', label: 'Clients' },
  { key: 'reporting', label: 'Reporting' },
  { key: 'documents', label: 'Documents' },
  { key: 'settings', label: 'Settings' },
]

function normalizeText(value) {
  return String(value || '').trim()
}

function formatCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return 'R 0'
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(amount)
}

function formatPercent(value) {
  const numeric = Number(value || 0)
  if (!Number.isFinite(numeric)) return '0%'
  return `${Math.round(numeric)}%`
}

function formatDateShort(value) {
  if (!value) return 'No recent update'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No recent update'
  return date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function getInitials(value = '') {
  const parts = normalizeText(value).split(/\s+/).filter(Boolean)
  if (!parts.length) return 'BR'
  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function ExecutiveMetric({ label, value, insight, icon, tone = 'blue' }) {
  const toneClass = {
    blue: 'bg-[#edf5ff] text-[#315f8f]',
    green: 'bg-[#effaf3] text-[#26724c]',
    gold: 'bg-[#fff7e8] text-[#8a641d]',
    slate: 'bg-[#f5f8fc] text-[#405b75]',
    navy: 'bg-[#edf2f6] text-[#163247]',
  }[tone] || 'bg-[#f5f8fc] text-[#405b75]'

  return (
    <article className="group min-w-[210px] rounded-[22px] border border-white/80 bg-white/88 px-4 py-4 shadow-[0_18px_42px_rgba(24,45,68,0.08)] backdrop-blur transition duration-200 hover:-translate-y-0.5 hover:border-[#cbd9e7]">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.13em] text-[#7b8ca2]">{label}</span>
        <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] ${toneClass}`}>
          {icon ? createElement(icon, { size: 15 }) : null}
        </span>
      </div>
      <strong className="mt-4 block text-[2rem] font-semibold leading-none tracking-[-0.055em] text-[#102236] tabular-nums">
        {value}
      </strong>
      <p className="mt-2 truncate text-[0.78rem] font-medium text-[#667b92]">{insight}</p>
    </article>
  )
}

function EmptyState({ title, copy, icon = Building2 }) {
  return (
    <div className="rounded-[22px] border border-dashed border-[#d6e2ef] bg-[#fbfdff] px-6 py-8 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-[18px] bg-[#edf4fb] text-[#35546c]">
        {createElement(icon, { size: 22 })}
      </div>
      <h4 className="mt-4 text-[1.05rem] font-semibold tracking-[-0.025em] text-[#142132]">{title}</h4>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#60758b]">{copy}</p>
    </div>
  )
}

function SimpleTable({ columns, rows }) {
  return (
    <div className="overflow-x-auto rounded-[20px] border border-[#dfe8f1] bg-white shadow-[0_14px_30px_rgba(24,45,68,0.05)]">
      <table className="min-w-[860px] w-full text-sm">
        <thead className="bg-[#f7faff] text-left text-[0.68rem] uppercase tracking-[0.12em] text-[#6f839a]">
          <tr>
            {columns.map((column) => (
              <th key={column} className="px-4 py-3 font-semibold">{column}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#edf2f7] bg-white text-[#223449]">
          {rows.map((row, index) => (
            <tr key={`${index}-${row.join('|')}`} className="transition hover:bg-[#f8fbff]">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-4 py-3">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SectionTitle({ eyebrow, title, copy }) {
  return (
    <div>
      {eyebrow ? <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">{eyebrow}</p> : null}
      <h2 className="mt-1 text-[1.25rem] font-semibold tracking-[-0.035em] text-[#142132]">{title}</h2>
      {copy ? <p className="mt-1 text-sm leading-6 text-[#60758b]">{copy}</p> : null}
    </div>
  )
}

export default function AgencyBranchWorkspacePage() {
  const { branchId = '' } = useParams()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('overview')
  const [branch, setBranch] = useState(null)
  const [branchTransactions, setBranchTransactions] = useState([])
  const [branchListings, setBranchListings] = useState([])
  const [leaderboard, setLeaderboard] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadWorkspace = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [branchRow, transactions, listings, topAgents] = await Promise.all([
        getBranch(branchId),
        getBranchTransactions(branchId),
        getBranchListings(branchId),
        getAgentLeaderboard(branchId),
      ])

      if (!branchRow) {
        throw new Error('Branch not found or no longer accessible.')
      }

      setBranch(branchRow)
      setBranchTransactions(transactions)
      setBranchListings(listings)
      setLeaderboard(topAgents)
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load branch workspace right now.')
    } finally {
      setLoading(false)
    }
  }, [branchId])

  useEffect(() => {
    void loadWorkspace()
  }, [loadWorkspace])

  const activeDeals = useMemo(() => branchTransactions.filter((row) => {
    const status = normalizeText(row?.lifecycle_state).toLowerCase()
    return status !== 'completed' && status !== 'archived' && status !== 'cancelled'
  }).length, [branchTransactions])

  const closedDeals = useMemo(() => branchTransactions.filter((row) => Boolean(row?.registered_at)).length, [branchTransactions])

  const closedRate = useMemo(() => {
    if (!branchTransactions.length) return 0
    return Math.round((closedDeals / branchTransactions.length) * 100)
  }, [closedDeals, branchTransactions.length])

  const pipelineValue = Number(branch?.kpis?.pipelineValue || 0)
  const revenueSecured = pipelineValue * 0.03
  const monthlyPerformance = Math.max(0, Math.round(revenueSecured / 1000))
  const branchName = branch?.name || 'Branch Workspace'
  const branchLocation = [branch?.city || 'City', branch?.province || 'Province'].filter(Boolean).join(', ')
  const activeAgents = Number(branch?.kpis?.activeAgents ?? leaderboard.length ?? 0)

  const activityItems = useMemo(() => {
    const transactions = branchTransactions.slice(0, 4).map((row) => ({
      id: `tx-${row.id}`,
      actor: row.assigned_agent || row.assigned_agent_email || 'Branch team',
      title: 'Transaction updated',
      detail: `${row.transaction_reference || row.id} - ${row.stage || 'In progress'}`,
      timestamp: row.updated_at || row.created_at,
      icon: ArrowRightLeft,
    }))
    const listings = branchListings.slice(0, 3).map((listing) => ({
      id: `listing-${listing.id}`,
      actor: listing.assigned_agent_name || listing.assigned_agent_email || 'Branch team',
      title: 'Listing activity',
      detail: `${listing.listing_title || listing.id} - ${listing.listing_status || 'Active'}`,
      timestamp: listing.updated_at || listing.created_at,
      icon: Building2,
    }))
    return [...transactions, ...listings]
      .sort((left, right) => new Date(right.timestamp || 0) - new Date(left.timestamp || 0))
      .slice(0, 6)
  }, [branchListings, branchTransactions])

  if (loading) {
    return (
      <section className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_18px_42px_rgba(24,45,68,0.06)]">
        <div className="h-4 w-44 animate-pulse rounded-full bg-[#e7eef6]" />
        <div className="mt-5 h-10 w-80 max-w-full animate-pulse rounded-full bg-[#e7eef6]" />
        <div className="mt-8 grid gap-3 md:grid-cols-3">
          {[0, 1, 2].map((item) => <div key={item} className="h-28 animate-pulse rounded-[20px] bg-[#f0f5fa]" />)}
        </div>
      </section>
    )
  }

  if (error) {
    return <p className="rounded-[16px] border border-[#f3d2cc] bg-[#fef3f2] px-5 py-4 text-sm text-[#b42318]">{error}</p>
  }

  return (
    <section className="flex flex-col gap-5">
      <section className="relative overflow-hidden rounded-[30px] bg-[#101d2c] p-5 text-white shadow-[0_30px_80px_rgba(16,29,44,0.24)] sm:p-7">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(118,160,205,0.26),transparent_36%),linear-gradient(145deg,rgba(255,255,255,0.1),transparent_44%)]" />
        <div className="relative z-10">
          <button type="button" onClick={() => navigate('/agency/branches')} className="inline-flex items-center gap-2 text-[0.78rem] font-semibold uppercase tracking-[0.12em] text-white/62 transition hover:text-white">
            <ArrowLeft size={14} />
            Back to Branches
          </button>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_auto] xl:items-end">
            <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
              <div className="grid h-20 w-20 shrink-0 place-items-center rounded-[24px] border border-white/12 bg-white/10 text-[1.25rem] font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
                {getInitials(branchName)}
              </div>
              <div className="min-w-0">
                <p className="text-[0.74rem] font-semibold uppercase tracking-[0.16em] text-white/52">Agency Headquarters</p>
                <h1 className="mt-2 text-[2.45rem] font-semibold leading-none tracking-[-0.065em] text-white sm:text-[3.1rem]">{branchName}</h1>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-sm font-medium text-white/72">
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-1.5">
                    <MapPin size={14} />
                    {branchLocation}
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-1.5">
                    <span className="h-2 w-2 rounded-full bg-[#5ee29a] shadow-[0_0_0_3px_rgba(94,226,154,0.14)]" />
                    Operational
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5">
                    {activeAgents} Agents - {activeDeals} Active Transactions
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row xl:justify-end">
              <button
                type="button"
                className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-[16px] border border-white/10 bg-white px-5 py-2 text-sm font-semibold text-[#102236] shadow-[0_18px_38px_rgba(0,0,0,0.2)] transition hover:-translate-y-0.5"
                onClick={() => navigate('/new-transaction', { state: { branchId } })}
              >
                <Plus size={16} />
                Add Transaction
              </button>
              <button
                type="button"
                className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-[16px] border border-white/12 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/14"
                onClick={() => setActiveTab('agents')}
              >
                <UserPlus size={16} />
                Add Agent
              </button>
              <button
                type="button"
                className="inline-flex min-h-[46px] items-center justify-center rounded-[16px] border border-white/12 bg-white/10 px-4 py-2 text-white transition hover:bg-white/14"
                onClick={() => setActiveTab('settings')}
                aria-label="Branch settings"
              >
                <Settings size={17} />
              </button>
            </div>
          </div>

          <div className="mt-7 overflow-x-auto pb-1">
            <div className="grid min-w-[920px] gap-3 xl:grid-cols-6">
              <ExecutiveMetric label="Agents" value={activeAgents} insight="Active branch users" icon={Users} tone="blue" />
              <ExecutiveMetric label="Listings" value={branch?.kpis?.activeListings ?? branchListings.length} insight="Live inventory" icon={Building2} tone="slate" />
              <ExecutiveMetric label="Active Deals" value={activeDeals} insight={`${branchTransactions.length} total tracked`} icon={ArrowRightLeft} tone="gold" />
              <ExecutiveMetric label="Revenue Secured" value={formatCurrency(revenueSecured)} insight="Estimated commission value" icon={Banknote} tone="green" />
              <ExecutiveMetric label="Close Rate" value={formatPercent(closedRate)} insight={`${closedDeals} registered deals`} icon={FileCheck2} tone="navy" />
              <ExecutiveMetric label="Performance Trend" value={`${monthlyPerformance}k`} insight="Monthly revenue signal" icon={TrendingUp} tone="blue" />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-[#dfe8f1] bg-white/88 p-3 shadow-[0_18px_42px_rgba(24,45,68,0.06)] backdrop-blur">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-[14px] border border-[#dce6f1] bg-white px-3 text-sm font-semibold text-[#263f58] transition hover:border-[#c7d6e5] hover:bg-[#f8fbff]">
              <Building2 size={15} />
              Edit Branch
            </button>
            <button type="button" className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-[14px] border border-[#dce6f1] bg-white px-3 text-sm font-semibold text-[#263f58] transition hover:border-[#c7d6e5] hover:bg-[#f8fbff]" onClick={() => setActiveTab('agents')}>
              <UserPlus size={15} />
              Invite Agent
            </button>
            <button type="button" className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-[14px] border border-[#dce6f1] bg-white px-3 text-sm font-semibold text-[#263f58] transition hover:border-[#c7d6e5] hover:bg-[#f8fbff]" onClick={() => setActiveTab('settings')}>
              <Settings size={15} />
              Branch Settings
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-[14px] border border-[#ead5d2] bg-[#fff8f8] px-3 text-sm font-semibold text-[#8a3a33] transition hover:bg-[#fff3f1]">
              Archive Branch
            </button>
            <button type="button" className="inline-flex min-h-[40px] items-center justify-center rounded-[14px] border border-[#dce6f1] bg-white px-3 text-[#405b75] transition hover:border-[#c7d6e5] hover:bg-[#f8fbff]" aria-label="More branch actions">
              <MoreHorizontal size={17} />
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-[#dfe8f1] bg-white p-4 shadow-[0_24px_60px_rgba(24,45,68,0.08)] sm:p-5">
        <div className="overflow-x-auto pb-1">
          <div className="inline-flex min-w-max items-center rounded-[18px] border border-[#dfe8f1] bg-[#f6f9fc] p-1">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`min-h-[38px] rounded-[14px] px-4 text-sm font-semibold transition ${
                  activeTab === tab.key
                    ? 'bg-white text-[#163247] shadow-[0_10px_22px_rgba(24,45,68,0.12)]'
                    : 'text-[#5f7187] hover:text-[#163247]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5">
          {activeTab === 'overview' ? (
            <div className="grid gap-5 xl:grid-cols-[1.55fr_0.95fr]">
              <section className="relative overflow-hidden rounded-[26px] border border-[#dfe8f1] bg-[linear-gradient(145deg,#ffffff_0%,#f8fbfe_100%)] p-5 shadow-[0_18px_42px_rgba(24,45,68,0.06)] sm:p-6">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_18%_0%,rgba(54,94,128,0.12),transparent_40%)]" />
                <div className="relative z-10">
                  <SectionTitle eyebrow="Executive Overview" title="Branch Performance Cockpit" copy="Pipeline health, transaction velocity, listing movement, and conversion quality in one operating view." />
                  <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <ExecutiveMetric label="Pipeline Value" value={formatCurrency(pipelineValue)} insight="Open branch portfolio" icon={BarChart3} tone="blue" />
                    <ExecutiveMetric label="Conversion" value={formatPercent(branch?.kpis?.conversionRate || closedRate)} insight="Lead to closed signal" icon={TrendingUp} tone="green" />
                    <ExecutiveMetric label="Velocity" value={`${activeDeals}`} insight="Deals in motion" icon={ArrowRightLeft} tone="gold" />
                    <ExecutiveMetric label="Listings" value={branchListings.length} insight="Inventory tracked" icon={Building2} tone="slate" />
                  </div>
                  <div className="mt-5 rounded-[22px] border border-[#e4edf6] bg-white p-5">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">Transaction Pipeline</p>
                        <h3 className="mt-1 text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">Closed deal ratio across this branch portfolio</h3>
                      </div>
                      <span className="rounded-full border border-[#dce7f2] bg-[#f8fbff] px-3 py-1 text-sm font-semibold text-[#405b75]">{closedRate}% closed</span>
                    </div>
                    <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-[#e7eef6]">
                      <div className="h-full rounded-full bg-[linear-gradient(90deg,#163247_0%,#4f82b8_70%,#77b8d6_100%)]" style={{ width: `${Math.min(100, Math.max(8, closedRate))}%` }} />
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-[16px] border border-[#edf2f7] bg-[#fbfdff] px-4 py-3">
                        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Registered</p>
                        <p className="mt-2 text-xl font-semibold text-[#142132]">{closedDeals}</p>
                      </div>
                      <div className="rounded-[16px] border border-[#edf2f7] bg-[#fbfdff] px-4 py-3">
                        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Transactions</p>
                        <p className="mt-2 text-xl font-semibold text-[#142132]">{branchTransactions.length}</p>
                      </div>
                      <div className="rounded-[16px] border border-[#edf2f7] bg-[#fbfdff] px-4 py-3">
                        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Revenue Signal</p>
                        <p className="mt-2 text-xl font-semibold text-[#142132]">{formatCurrency(revenueSecured)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-[26px] border border-[#dfe8f1] bg-white p-5 shadow-[0_18px_42px_rgba(24,45,68,0.06)] sm:p-6">
                <SectionTitle eyebrow="Live Feed" title="Recent Activity" copy="Agent, transaction, listing, and client movements will appear here in real time." />
                <div className="mt-5 space-y-3">
                  {activityItems.length ? (
                    activityItems.map((item) => {
                      const Icon = item.icon
                      return (
                        <article key={item.id} className="flex items-start gap-3 rounded-[18px] border border-[#e7eef6] bg-[#fbfdff] px-4 py-3 transition hover:border-[#cbd9e7] hover:bg-white">
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#edf4fb] text-[#35546c]">
                            <Icon size={16} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-[#142132]">{item.title}</p>
                            <p className="mt-1 truncate text-sm text-[#60758b]">{item.actor} - {item.detail}</p>
                          </div>
                          <time className="shrink-0 text-[0.72rem] font-semibold text-[#8a9bb0]">{formatDateShort(item.timestamp)}</time>
                        </article>
                      )
                    })
                  ) : (
                    <EmptyState title="Activity will appear here" copy="Activity from agents, transactions, listings and client updates will appear here in real time." icon={CalendarDays} />
                  )}
                </div>
              </section>
            </div>
          ) : null}

          {activeTab === 'agents' ? (
            leaderboard.length ? (
              <SimpleTable
                columns={['Name', 'Role', 'Listings', 'Transactions', 'Revenue', 'Status', 'Last Active']}
                rows={leaderboard.map((agent) => [
                  agent.name,
                  agent.role,
                  String(agent.listings || 0),
                  String(agent.transactions || 0),
                  formatCurrency(agent.revenue || 0),
                  agent.status || 'active',
                  formatDateShort(agent.lastActive),
                ])}
              />
            ) : (
              <EmptyState title="No agents yet" copy="Invite branch agents to unlock team performance and deal ownership tracking." icon={Users} />
            )
          ) : null}

          {activeTab === 'listings' ? (
            branchListings.length ? (
              <SimpleTable
                columns={['Listing', 'Status', 'Asking Price', 'Assigned Agent', 'Updated']}
                rows={branchListings.map((listing) => [
                  listing.listing_title || listing.id,
                  listing.listing_status || listing.stage || 'active',
                  formatCurrency(listing.asking_price || 0),
                  listing.assigned_agent_name || listing.assigned_agent_email || 'Unassigned',
                  formatDateShort(listing.updated_at),
                ])}
              />
            ) : (
              <EmptyState title="No listings yet" copy="Create or assign listings to this branch to start branch-level inventory tracking." icon={Building2} />
            )
          ) : null}

          {activeTab === 'transactions' ? (
            branchTransactions.length ? (
              <SimpleTable
                columns={['Reference', 'Stage', 'Agent', 'Value', 'Status', 'Updated']}
                rows={branchTransactions.map((row) => [
                  row.transaction_reference || row.id,
                  row.stage || 'In progress',
                  row.assigned_agent || row.assigned_agent_email || 'Unassigned',
                  formatCurrency(row.sales_price || row.purchase_price || 0),
                  row.lifecycle_state || 'active',
                  formatDateShort(row.updated_at),
                ])}
              />
            ) : (
              <EmptyState title="No transactions yet" copy="Branch transactions will appear once deals are created or assigned." icon={ArrowRightLeft} />
            )
          ) : null}

          {activeTab === 'clients' ? (
            <EmptyState title="Client workspace coming next" copy="Client rollups per branch will be wired into the branch operating cockpit." icon={Users} />
          ) : null}

          {activeTab === 'reporting' ? (
            <section className="rounded-[24px] border border-[#dfe8f1] bg-[#fbfcfe] p-5">
              <SectionTitle eyebrow="Reporting" title="Branch Intelligence" copy="Revenue trends, conversion quality, and comparative branch performance." />
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <ExecutiveMetric label="Pipeline" value={formatCurrency(pipelineValue)} insight="Open portfolio value" icon={BarChart3} tone="blue" />
                <ExecutiveMetric label="Conversion" value={formatPercent(branch?.kpis?.conversionRate || closedRate)} insight="Performance quality" icon={TrendingUp} tone="green" />
                <ExecutiveMetric label="Registered" value={branch?.kpis?.registeredDeals || closedDeals} insight="Completed outcomes" icon={FileCheck2} tone="navy" />
              </div>
            </section>
          ) : null}

          {activeTab === 'documents' ? (
            <section className="rounded-[24px] border border-[#dfe8f1] bg-[#fbfcfe] p-5">
              <SectionTitle eyebrow="Documents" title="Branch Document Hub" copy="Company docs, compliance files, training assets, and reporting packs." />
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ['Company Docs', Files],
                  ['Marketing Assets', Building2],
                  ['Compliance', ShieldCheck],
                  ['Branch Reports', BarChart3],
                ].map(([label, Icon]) => (
                  <article key={label} className="rounded-[20px] border border-[#e4ebf4] bg-white p-4 shadow-[0_12px_26px_rgba(24,45,68,0.05)]">
                    <span className="grid h-10 w-10 place-items-center rounded-[14px] bg-[#edf4fb] text-[#35546c]">
                      {createElement(Icon, { size: 16 })}
                    </span>
                    <p className="mt-4 text-sm font-semibold text-[#1f3348]">{label}</p>
                    <p className="mt-2 text-xs leading-5 text-[#6b7d93]">No documents uploaded yet.</p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {activeTab === 'settings' ? (
            <section className="rounded-[24px] border border-[#dfe8f1] bg-[#fbfcfe] p-5">
              <SectionTitle eyebrow="Settings" title="Branch Controls" copy="Permissions, branding, notifications, and role boundaries for this office." />
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <article className="rounded-[20px] border border-[#e4ebf4] bg-white p-5">
                  <p className="text-sm font-semibold text-[#1f3348]">Permissions</p>
                  <p className="mt-2 text-sm leading-6 text-[#6b7d93]">Principal, manager, and agent access policies are branch-scoped.</p>
                </article>
                <article className="rounded-[20px] border border-[#e4ebf4] bg-white p-5">
                  <p className="text-sm font-semibold text-[#1f3348]">Branding</p>
                  <p className="mt-2 text-sm leading-6 text-[#6b7d93]">Branch logo, cover image, and notification identity settings.</p>
                </article>
              </div>
            </section>
          ) : null}
        </div>
      </section>
    </section>
  )
}
