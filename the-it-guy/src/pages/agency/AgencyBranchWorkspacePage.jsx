import { ArrowLeft, ArrowRightLeft, Banknote, BarChart3, Building2, FileCheck2, Files, MapPin, Plus, Settings, UserRound, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Button from '../../components/ui/Button'
import SectionHeader from '../../components/ui/SectionHeader'
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

function KpiTile({ label, value }) {
  return (
    <article className="rounded-[16px] border border-[#e4ebf4] bg-[#fbfcfe] px-4 py-4">
      <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">{label}</span>
      <strong className="mt-2 block text-[1.2rem] font-semibold tracking-[-0.03em] text-[#142132]">{value}</strong>
    </article>
  )
}

function EmptyState({ title, copy }) {
  return (
    <div className="rounded-[16px] border border-dashed border-[#d7e1ec] bg-[#fbfdff] px-5 py-8 text-center">
      <h4 className="text-[1rem] font-semibold text-[#1a2a3d]">{title}</h4>
      <p className="mt-2 text-sm text-[#6b7d93]">{copy}</p>
    </div>
  )
}

function SimpleTable({ columns, rows }) {
  return (
    <div className="overflow-hidden rounded-[16px] border border-[#dbe5f0]">
      <table className="min-w-full divide-y divide-[#dbe5f0] text-sm">
        <thead className="bg-[#f5f8fc]">
          <tr>
            {columns.map((column) => (
              <th key={column} className="px-4 py-3 text-left text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-[#6f8499]">{column}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#e5ecf4] bg-white text-[#223449]">
          {rows.map((row, index) => (
            <tr key={`${index}-${row.join('|')}`}>
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

  const monthlyPerformance = useMemo(() => {
    const revenue = Number(branch?.kpis?.pipelineValue || 0) * 0.03
    return Math.max(0, Math.round(revenue / 1000))
  }, [branch?.kpis?.pipelineValue])

  if (loading) {
    return <p className="rounded-[16px] border border-[#dde4ee] bg-white px-5 py-4 text-sm text-[#6b7d93]">Loading branch workspace...</p>
  }

  if (error) {
    return <p className="rounded-[16px] border border-[#f3d2cc] bg-[#fef3f2] px-5 py-4 text-sm text-[#b42318]">{error}</p>
  }

  return (
    <section className="flex flex-col">
      <section className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <button type="button" onClick={() => navigate('/agency/branches')} className="inline-flex items-center gap-2 text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-[#5d7590] hover:text-[#244a6f]">
              <ArrowLeft size={14} />
              Back to Branches
            </button>
            <h1 className="mt-3 text-[1.6rem] font-semibold tracking-[-0.04em] text-[#142132]">{branch?.name || 'Branch Workspace'}</h1>
            <p className="mt-2 inline-flex items-center gap-2 text-[0.94rem] text-[#60758d]"><MapPin size={14} />{branch?.city || 'City'}, {branch?.province || 'Province'} • {branch?.address || 'Address pending'}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm">Mobile Executive View</Button>
            <Button type="button" variant="secondary" size="sm"><Plus size={15} />Add Agent</Button>
            <Button type="button" size="sm"><Plus size={15} />Add Transaction</Button>
          </div>
        </div>

        <div className="mt-5 border-t border-[#e3ebf4] pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm">Edit Branch</Button>
            <Button type="button" variant="secondary" size="sm">Invite Agent</Button>
            <Button type="button" variant="secondary" size="sm">Branch Settings</Button>
            <Button type="button" variant="ghost" size="sm">Archive Branch</Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <KpiTile label="Agents" value={branch?.kpis?.activeAgents ?? 0} />
          <KpiTile label="Listings" value={branch?.kpis?.activeListings ?? 0} />
          <KpiTile label="Active Deals" value={activeDeals} />
          <KpiTile label="Revenue Secured" value={formatCurrency((Number(branch?.kpis?.pipelineValue || 0) * 0.03))} />
          <KpiTile label="% Closed" value={`${closedRate}%`} />
          <KpiTile label="Monthly Performance" value={`${monthlyPerformance}k`} />
        </div>
      </section>

      <section className="mt-5 rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-center gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                activeTab === tab.key
                  ? 'border-[#1f4f78] bg-[#1f4f78] text-white'
                  : 'border-[#d1deeb] bg-white text-[#35546c] hover:border-[#bdd0e2]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-5">
          {activeTab === 'overview' ? (
            <div className="grid gap-5 xl:grid-cols-[1.45fr_1fr]">
              <section className="rounded-[18px] border border-[#e1e9f2] bg-[#fbfcfe] p-5">
                <SectionHeader title="Executive Overview" copy="Sales progress, branch velocity, and team execution in one operational view." />
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <KpiTile label="Pipeline Value" value={formatCurrency(branch?.kpis?.pipelineValue || 0)} />
                  <KpiTile label="Conversion" value={`${branch?.kpis?.conversionRate || 0}%`} />
                  <KpiTile label="Registered" value={closedDeals} />
                  <KpiTile label="Transactions" value={branchTransactions.length} />
                </div>
                <div className="mt-4 rounded-[14px] border border-[#e4ebf4] bg-white p-4">
                  <p className="text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Transactions Pipeline</p>
                  <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-[#e5ecf4]">
                    <div className="h-full bg-[linear-gradient(90deg,#2b5f8a_0%,#6fa7d6_100%)]" style={{ width: `${Math.min(100, Math.max(8, closedRate))}%` }} />
                  </div>
                  <p className="mt-2 text-sm text-[#60758d]">Closed deal ratio across this branch portfolio.</p>
                </div>
              </section>

              <section className="rounded-[18px] border border-[#e1e9f2] bg-[#fbfcfe] p-5">
                <SectionHeader title="Recent Activity" copy="Latest operational movements for this branch." />
                <div className="mt-4 space-y-3">
                  {branchTransactions.slice(0, 5).map((row) => (
                    <article key={row.id} className="rounded-[14px] border border-[#e4ebf4] bg-white px-3 py-3">
                      <p className="text-sm font-semibold text-[#1c3147]">Transaction updated</p>
                      <p className="mt-1 text-xs text-[#667c93]">{row.transaction_reference || row.id} • {row.stage || 'In progress'}</p>
                    </article>
                  ))}
                  {!branchTransactions.length ? <EmptyState title="No activity yet" copy="Branch events will appear here once transactions and listings are active." /> : null}
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
                  agent.lastActive ? new Date(agent.lastActive).toLocaleDateString('en-ZA') : '—',
                ])}
              />
            ) : (
              <EmptyState title="No agents yet" copy="Invite branch agents to unlock team performance and deal ownership tracking." />
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
                  listing.updated_at ? new Date(listing.updated_at).toLocaleDateString('en-ZA') : '—',
                ])}
              />
            ) : (
              <EmptyState title="No listings yet" copy="Create or assign listings to this branch to start branch-level inventory tracking." />
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
                  row.updated_at ? new Date(row.updated_at).toLocaleDateString('en-ZA') : '—',
                ])}
              />
            ) : (
              <EmptyState title="No transactions yet" copy="Branch transactions will appear once deals are created or assigned." />
            )
          ) : null}

          {activeTab === 'clients' ? (
            <EmptyState title="Client workspace coming next" copy="Client rollups per branch will be wired in Phase 3 reporting refinement." />
          ) : null}

          {activeTab === 'reporting' ? (
            <section className="rounded-[16px] border border-[#e1e9f2] bg-[#fbfcfe] p-5">
              <SectionHeader title="Branch Reporting" copy="Revenue trends, conversion quality, and comparative branch performance." />
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <KpiTile label="Pipeline" value={formatCurrency(branch?.kpis?.pipelineValue || 0)} />
                <KpiTile label="Conversion" value={`${branch?.kpis?.conversionRate || 0}%`} />
                <KpiTile label="Registered" value={branch?.kpis?.registeredDeals || 0} />
              </div>
            </section>
          ) : null}

          {activeTab === 'documents' ? (
            <section className="rounded-[16px] border border-[#e1e9f2] bg-[#fbfcfe] p-5">
              <SectionHeader title="Branch Documents" copy="Company docs, compliance files, training assets, and reporting packs." />
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  'Company Docs',
                  'Marketing Assets',
                  'Compliance',
                  'Branch Reports',
                ].map((label) => (
                  <article key={label} className="rounded-[14px] border border-[#e4ebf4] bg-white p-4">
                    <p className="text-sm font-semibold text-[#1f3348]">{label}</p>
                    <p className="mt-2 text-xs text-[#6b7d93]">No documents uploaded yet.</p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {activeTab === 'settings' ? (
            <section className="rounded-[16px] border border-[#e1e9f2] bg-[#fbfcfe] p-5">
              <SectionHeader title="Branch Settings" copy="Permissions, branding, notifications, and role boundaries for this office." />
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <article className="rounded-[14px] border border-[#e4ebf4] bg-white p-4">
                  <p className="text-sm font-semibold text-[#1f3348]">Permissions</p>
                  <p className="mt-2 text-xs text-[#6b7d93]">Principal, manager, and agent access policies are branch-scoped.</p>
                </article>
                <article className="rounded-[14px] border border-[#e4ebf4] bg-white p-4">
                  <p className="text-sm font-semibold text-[#1f3348]">Branding</p>
                  <p className="mt-2 text-xs text-[#6b7d93]">Branch logo, cover image, and notification identity settings.</p>
                </article>
              </div>
            </section>
          ) : null}
        </div>
      </section>

      <section className="mt-4 rounded-[20px] border border-[#dde4ee] bg-white p-4 shadow-[0_8px_22px_rgba(15,23,42,0.05)]">
        <div className="flex flex-wrap items-center gap-3 text-[#5f748c]">
          <Building2 size={15} />
          <span className="text-sm">Branch workspace mirrors the development workspace pattern for consistent principal operations.</span>
        </div>
      </section>
    </section>
  )
}
