import { Plus, Search, ShieldCheck, UserCircle2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import Field from '../components/ui/Field'
import SectionHeader from '../components/ui/SectionHeader'
import { useWorkspace } from '../context/WorkspaceContext'
import { canAccessAgentsModule } from '../lib/roles'
import { fetchTransactionsByParticipantSummary, fetchTransactionsListSummary } from '../lib/api'
import { isSupabaseConfigured } from '../lib/supabaseClient'

const PRIVATE_LISTINGS_STORAGE_KEY = 'itg:agent-private-listings:v1'
const PIPELINE_STORAGE_KEY = 'itg:pipeline-leads:v1'

const AGENT_WORKSPACE_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'listings', label: 'Listings' },
  { key: 'deals', label: 'Deals' },
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'performance', label: 'Performance' },
  { key: 'documents', label: 'Documents' },
  { key: 'reviews', label: 'Reviews' },
  { key: 'settings', label: 'Settings' },
]

const PIPELINE_STATUS_ORDER = [
  'New Lead',
  'Contacted',
  'Viewing Scheduled',
  'Interested',
  'Offer Pending',
  'Converted to Deal',
  'Lost',
]

function readLocalRows(storageKey) {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function normalizeAgentIdentity(row) {
  const email = String(row?.transaction?.assigned_agent_email || '').trim().toLowerCase()
  const name = String(row?.transaction?.assigned_agent || '').trim()
  const identifier = email || name.toLowerCase() || 'unassigned'

  return {
    id: identifier,
    name: name || 'Unassigned Agent',
    email: email || '',
  }
}

function formatCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) {
    return 'R 0'
  }

  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDate(value) {
  if (!value) {
    return '—'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return date.toLocaleDateString('en-ZA')
}

function normalizeDealStatus(row) {
  const stage = String(row?.stage || row?.transaction?.stage || '').trim().toLowerCase()
  const lifecycle = String(row?.transaction?.lifecycle_state || '').trim().toLowerCase()

  if (lifecycle.includes('cancel') || lifecycle.includes('lost') || stage.includes('cancelled')) {
    return 'cancelled'
  }

  if (stage === 'registered' || row?.transaction?.registered_at) {
    return 'completed'
  }

  return 'active'
}

function computeAgentWorkspaceData({ transactions, privateListings, pipelineRows, agentDirectory = null }) {
  const groupedByAgent = new Map()

  for (const row of transactions) {
    const identity = normalizeAgentIdentity(row)
    if (!groupedByAgent.has(identity.id)) {
      groupedByAgent.set(identity.id, {
        id: identity.id,
        name: identity.name,
        email: identity.email,
        phone: '',
        office: row?.development?.location || 'Main Office',
        status: 'Active',
        deals: [],
        developmentListings: [],
      })
    }

    const item = groupedByAgent.get(identity.id)
    item.deals.push(row)

    const developmentListingId = row?.unit?.id || row?.transaction?.unit_id || null
    if (developmentListingId) {
      item.developmentListings.push({
        id: developmentListingId,
        title: `Unit ${row?.unit?.unit_number || '-'}`,
        developmentName: row?.development?.name || 'Development',
        suburb: row?.transaction?.suburb || row?.development?.location || 'Area pending',
        price: Number(row?.transaction?.sales_price || row?.transaction?.purchase_price || row?.unit?.price || 0),
        status: normalizeDealStatus(row) === 'completed' ? 'Sold' : 'Active',
        mandateStatus: 'N/A',
        sellerOnboardingStatus: 'N/A',
        documentsStatus: 'In Progress',
        listedAt: row?.transaction?.created_at || null,
        listingType: 'development',
        row,
      })
    }
  }

  const listingsByAgent = privateListings.reduce((accumulator, listing) => {
    const agentId = String(listing?.commission?.agent_id || '').trim().toLowerCase()
    if (!agentId) {
      return accumulator
    }
    if (!accumulator.has(agentId)) {
      accumulator.set(agentId, [])
    }
    accumulator.get(agentId).push(listing)
    return accumulator
  }, new Map())

  const developmentAgentMap = new Map()
  for (const row of transactions) {
    const developmentId = String(row?.development?.id || row?.transaction?.development_id || row?.unit?.development_id || '').trim()
    if (!developmentId) {
      continue
    }
    const identity = normalizeAgentIdentity(row)
    if (identity.id && !developmentAgentMap.has(developmentId)) {
      developmentAgentMap.set(developmentId, identity.id)
    }
  }

  const defaultAgentId = groupedByAgent.keys().next().value || ''
  const pipelineByAgent = pipelineRows.reduce((accumulator, item) => {
    const developmentId = String(item?.developmentId || item?.development_id || '').trim()
    const inferredByDevelopment = developmentId ? developmentAgentMap.get(developmentId) : ''
    const agentId = String(item?.agent_id || item?.assigned_agent_id || inferredByDevelopment || defaultAgentId || '').trim().toLowerCase()
    if (!agentId) {
      return accumulator
    }
    if (!accumulator.has(agentId)) {
      accumulator.set(agentId, [])
    }
    accumulator.get(agentId).push(item)
    return accumulator
  }, new Map())

  const directoryAgents = Array.isArray(agentDirectory?.agents) ? agentDirectory.agents : []
  for (const directoryAgent of directoryAgents) {
    const directoryId = String(directoryAgent?.id || directoryAgent?.email || directoryAgent?.name || '').trim().toLowerCase()
    if (!directoryId) continue
    if (!groupedByAgent.has(directoryId)) {
      groupedByAgent.set(directoryId, {
        id: directoryId,
        name: directoryAgent?.name || 'Agent',
        email: directoryAgent?.email || '',
        phone: directoryAgent?.phone || '',
        office: directoryAgent?.office || 'Office',
        status: String(directoryAgent?.status || 'Active').replace(/\b\w/g, (char) => char.toUpperCase()),
        deals: [],
        developmentListings: [],
      })
    } else {
      const existing = groupedByAgent.get(directoryId)
      groupedByAgent.set(directoryId, {
        ...existing,
        name: existing.name || directoryAgent?.name || existing.name,
        email: existing.email || directoryAgent?.email || existing.email,
        phone: existing.phone || directoryAgent?.phone || existing.phone,
        office: existing.office || directoryAgent?.office || existing.office,
      })
    }
  }

  const agents = [...groupedByAgent.values()].map((agent) => {
    const agentPrivateListings = listingsByAgent.get(agent.id) || []
    const agentPipelineRows = pipelineByAgent.get(agent.id) || []

    const activeDeals = agent.deals.filter((row) => normalizeDealStatus(row) === 'active')
    const completedDeals = agent.deals.filter((row) => normalizeDealStatus(row) === 'completed')
    const cancelledDeals = agent.deals.filter((row) => normalizeDealStatus(row) === 'cancelled')

    const totalSalesValue = completedDeals.reduce((sum, row) => {
      const value = Number(row?.transaction?.sales_price || row?.transaction?.purchase_price || row?.unit?.price || 0)
      return sum + (Number.isFinite(value) ? value : 0)
    }, 0)

    const activeDealValue = activeDeals.reduce((sum, row) => {
      const value = Number(row?.transaction?.sales_price || row?.transaction?.purchase_price || row?.unit?.price || 0)
      return sum + (Number.isFinite(value) ? value : 0)
    }, 0)

    const pipelineValue = agentPipelineRows.reduce((sum, lead) => {
      const value = Number(lead?.budget || 0)
      return sum + (Number.isFinite(value) ? value : 0)
    }, 0)

    const estimatedCommission = totalSalesValue * 0.03
    const avgDealTime = completedDeals.length ? 42 : 0

    const recentDeals = [...agent.deals]
      .sort((left, right) => new Date(right?.transaction?.updated_at || 0).getTime() - new Date(left?.transaction?.updated_at || 0).getTime())
      .slice(0, 4)

    return {
      ...agent,
      privateListings: agentPrivateListings,
      pipelineRows: agentPipelineRows,
      metrics: {
        activeListings: agent.developmentListings.filter((item) => item.status !== 'Sold').length + agentPrivateListings.length,
        activeDeals: activeDeals.length,
        completedDeals: completedDeals.length,
        cancelledDeals: cancelledDeals.length,
        registeredDeals: completedDeals.length,
        totalSalesValue,
        pipelineValue,
        activeDealValue,
        commissionEarned: estimatedCommission,
        followUpsDue: agentPipelineRows.filter((lead) => !!lead?.nextFollowUpDate || !!lead?.next_follow_up_date).length,
        averageDealTime: avgDealTime,
      },
      recentDeals,
    }
  })

  return agents.sort((left, right) => right.metrics.totalSalesValue - left.metrics.totalSalesValue)
}

function AgentMetricCard({ label, value, helper = '' }) {
  return (
    <div className="rounded-[16px] border border-[#dfe7f1] bg-[#fbfcfe] px-4 py-3">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">{label}</p>
      <p className="mt-2 text-[1.25rem] font-semibold tracking-[-0.02em] text-[#142132]">{value}</p>
      {helper ? <p className="mt-1 text-xs text-[#657a92]">{helper}</p> : null}
    </div>
  )
}

function AgentCard({ agent, onView }) {
  return (
    <article className="rounded-[20px] border border-[#dce5f0] bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-full border border-[#d7e2ef] bg-[#f8fbff] text-[#30567a]">
            <UserCircle2 size={20} />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-[1.02rem] font-semibold text-[#142132]">{agent.name}</h3>
            <p className="truncate text-sm text-[#60758d]">{agent.office}</p>
          </div>
        </div>
        <span className="inline-flex rounded-full border border-[#d7e7dd] bg-[#edf9f1] px-2.5 py-1 text-[0.68rem] font-semibold text-[#1d7d45]">
          {agent.status}
        </span>
      </div>

      <div className="mt-3 space-y-1 text-xs text-[#61778f]">
        <p className="truncate">{agent.email || 'Email pending'}</p>
        <p>{agent.phone || 'Phone pending'}</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <AgentMetricCard label="Active Listings" value={agent.metrics.activeListings} />
        <AgentMetricCard label="Active Deals" value={agent.metrics.activeDeals} />
        <AgentMetricCard label="Pipeline" value={formatCurrency(agent.metrics.pipelineValue)} />
        <AgentMetricCard label="Registered" value={agent.metrics.registeredDeals} />
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm font-semibold text-[#1f4f78]">Sales {formatCurrency(agent.metrics.totalSalesValue)}</p>
        <Button type="button" size="sm" variant="secondary" onClick={onView}>
          View Agent
        </Button>
      </div>
    </article>
  )
}

function AgentWorkspace({ agent, canManageSettings }) {
  const [activeTab, setActiveTab] = useState('overview')

  const allowedTabs = canManageSettings
    ? AGENT_WORKSPACE_TABS
    : AGENT_WORKSPACE_TABS.filter((tab) => tab.key !== 'settings')

  const developmentListings = agent.developmentListings || []
  const privateListings = agent.privateListings || []
  const allListings = [...developmentListings, ...privateListings.map((listing) => ({
    id: listing.id,
    title: listing.listingTitle,
    listingType: 'private_sale',
    developmentName: 'Private Sale',
    suburb: listing.suburb || 'Area pending',
    price: Number(listing.askingPrice || 0),
    status: 'Active',
    mandateStatus: listing.mandateType || 'Sole',
    sellerOnboardingStatus: listing?.sellerOnboarding?.status || 'sent',
    documentsStatus: 'Requested',
    listedAt: listing.createdAt || null,
  }))]

  const activeDeals = agent.deals.filter((row) => normalizeDealStatus(row) === 'active')
  const completedDeals = agent.deals.filter((row) => normalizeDealStatus(row) === 'completed')
  const cancelledDeals = agent.deals.filter((row) => normalizeDealStatus(row) === 'cancelled')

  const pipelineStageSummary = PIPELINE_STATUS_ORDER.map((status) => ({
    status,
    count: agent.pipelineRows.filter((lead) => lead.status === status).length,
  }))

  return (
    <section className="space-y-5">
      <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-[#d7e2ef] bg-[#f8fbff] text-[#2f5578]">
              <UserCircle2 size={24} />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-[1.45rem] font-semibold tracking-[-0.03em] text-[#142132]">{agent.name}</h1>
              <p className="text-sm text-[#60758d]">Agent • {agent.office}</p>
              <p className="mt-1 text-xs text-[#6b8098]">{agent.email || 'Email pending'} • {agent.phone || 'Phone pending'}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm">Message Agent</Button>
            <Button type="button" variant="secondary" size="sm">Assign Listing</Button>
            <Button type="button" variant="secondary" size="sm">Assign Deal</Button>
            <Button type="button" variant="accent" size="sm">Edit Agent</Button>
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
        <div className="flex flex-wrap items-center gap-2">
          {allowedTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                activeTab === tab.key
                  ? 'border-[#1f4f78] bg-[#1f4f78] text-white'
                  : 'border-[#d4deea] bg-[#f8fbff] text-[#35546c] hover:border-[#b9cadf]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'overview' ? (
          <div className="mt-5 space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <AgentMetricCard label="Active Listings" value={agent.metrics.activeListings} />
              <AgentMetricCard label="Active Deals" value={agent.metrics.activeDeals} />
              <AgentMetricCard label="Pipeline Value" value={formatCurrency(agent.metrics.pipelineValue)} />
              <AgentMetricCard label="Registered Deals" value={agent.metrics.registeredDeals} />
              <AgentMetricCard label="Total Sales Value" value={formatCurrency(agent.metrics.totalSalesValue)} />
              <AgentMetricCard label="Commission Earned" value={formatCurrency(agent.metrics.commissionEarned)} />
              <AgentMetricCard label="Follow-ups Due" value={agent.metrics.followUpsDue} />
              <AgentMetricCard label="Average Deal Time" value={`${agent.metrics.averageDealTime} days`} />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <article className="rounded-[18px] border border-[#dce5f0] bg-[#fbfcfe] p-4 lg:col-span-2">
                <h3 className="text-base font-semibold text-[#142132]">Current Priorities</h3>
                <ul className="mt-3 space-y-2 text-sm text-[#5d728a]">
                  <li>• Follow up on {agent.metrics.followUpsDue} open lead follow-ups.</li>
                  <li>• Progress {activeDeals.length} active deals toward registration milestones.</li>
                  <li>• Review seller document readiness on private mandates.</li>
                </ul>
              </article>
              <article className="rounded-[18px] border border-[#dce5f0] bg-[#fbfcfe] p-4">
                <h3 className="text-base font-semibold text-[#142132]">Recent Activity</h3>
                <div className="mt-3 space-y-2">
                  {agent.recentDeals.length ? (
                    agent.recentDeals.map((row) => (
                      <div key={row.transaction.id} className="rounded-[12px] border border-[#e3ebf4] bg-white px-3 py-2">
                        <p className="text-sm font-semibold text-[#1f3448]">{row.buyer?.name || 'Buyer pending'}</p>
                        <p className="text-xs text-[#60758d]">{row.development?.name || 'Private'} • {row.unit?.unit_number || '-'}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-[#60758d]">No recent activity yet.</p>
                  )}
                </div>
              </article>
            </div>
          </div>
        ) : null}

        {activeTab === 'listings' ? (
          <div className="mt-5 space-y-5">
            <article className="rounded-[18px] border border-[#dce5f0] bg-[#fbfcfe] p-4">
              <h3 className="text-base font-semibold text-[#142132]">Development Listings</h3>
              <div className="mt-3 space-y-2">
                {developmentListings.length ? (
                  developmentListings.map((listing) => (
                    <div key={listing.id} className="grid gap-2 rounded-[12px] border border-[#e4ebf5] bg-white px-3 py-2 text-sm md:grid-cols-[1.4fr_repeat(4,minmax(0,1fr))] md:items-center">
                      <span className="font-semibold text-[#1f3448]">{listing.title}</span>
                      <span>{listing.developmentName}</span>
                      <span>{formatCurrency(listing.price)}</span>
                      <span>{listing.status}</span>
                      <span>{formatDate(listing.listedAt)}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[#60758d]">No development listings linked yet.</p>
                )}
              </div>
            </article>

            <article className="rounded-[18px] border border-[#dce5f0] bg-[#fbfcfe] p-4">
              <h3 className="text-base font-semibold text-[#142132]">Private Sales</h3>
              <div className="mt-3 space-y-2">
                {privateListings.length ? (
                  privateListings.map((listing) => (
                    <div key={listing.id} className="rounded-[12px] border border-[#e4ebf5] bg-white px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-[#1f3448]">{listing.listingTitle}</p>
                        <span className="text-sm font-semibold text-[#1f4f78]">{formatCurrency(listing.askingPrice)}</span>
                      </div>
                      <p className="mt-1 text-xs text-[#60758d]">
                        {listing.suburb || 'Suburb pending'} • Mandate {listing.mandateType || 'sole'} • Seller onboarding {listing?.sellerOnboarding?.status || 'sent'}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[#60758d]">No private sales captured yet.</p>
                )}
              </div>
            </article>
          </div>
        ) : null}

        {activeTab === 'deals' ? (
          <div className="mt-5 grid gap-4 xl:grid-cols-3">
            {[{ title: 'Active Deals', rows: activeDeals }, { title: 'Completed Deals', rows: completedDeals }, { title: 'Cancelled / Lost', rows: cancelledDeals }].map((group) => (
              <article key={group.title} className="rounded-[18px] border border-[#dce5f0] bg-[#fbfcfe] p-4">
                <h3 className="text-base font-semibold text-[#142132]">{group.title}</h3>
                <div className="mt-3 space-y-2">
                  {group.rows.length ? (
                    group.rows.map((row) => (
                      <div key={row.transaction.id} className="rounded-[12px] border border-[#e4ebf5] bg-white px-3 py-2">
                        <p className="text-sm font-semibold text-[#1f3448]">{row.buyer?.name || 'Buyer pending'}</p>
                        <p className="mt-1 text-xs text-[#60758d]">
                          {row.development?.name || 'Private'} • {row.unit?.unit_number || '-'} • {row.transaction?.finance_type || 'cash'}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-[#60758d]">No deals in this segment.</p>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {activeTab === 'pipeline' ? (
          <div className="mt-5 rounded-[18px] border border-[#dce5f0] bg-[#fbfcfe] p-4">
            <h3 className="text-base font-semibold text-[#142132]">Pipeline Activity</h3>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {pipelineStageSummary.map((item) => (
                <div key={item.status} className="rounded-[12px] border border-[#e4ebf5] bg-white px-3 py-2">
                  <p className="text-xs uppercase tracking-[0.08em] text-[#6b7f97]">{item.status}</p>
                  <p className="mt-1 text-[1.1rem] font-semibold text-[#16283c]">{item.count}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {activeTab === 'performance' ? (
          <div className="mt-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <AgentMetricCard label="Listings Captured" value={allListings.length} />
              <AgentMetricCard label="Deals Opened" value={agent.deals.length} />
              <AgentMetricCard label="Deals Registered" value={agent.metrics.registeredDeals} />
              <AgentMetricCard label="Conversion Rate" value={`${agent.deals.length ? Math.round((agent.metrics.registeredDeals / agent.deals.length) * 100) : 0}%`} />
              <AgentMetricCard label="Sales Value" value={formatCurrency(agent.metrics.totalSalesValue)} />
              <AgentMetricCard label="Commission" value={formatCurrency(agent.metrics.commissionEarned)} />
              <AgentMetricCard label="Average Time to Close" value={`${agent.metrics.averageDealTime} days`} />
              <AgentMetricCard label="Pipeline Conversion" value={`${agent.pipelineRows.length ? Math.round((agent.metrics.activeDeals / Math.max(agent.pipelineRows.length, 1)) * 100) : 0}%`} />
            </div>
            <div className="rounded-[18px] border border-[#dce5f0] bg-[#fbfcfe] p-4 text-sm text-[#5e748d]">
              Monthly performance and development/source breakdown charts can be expanded here using the same metric cards and chart blocks already used in dashboard reporting.
            </div>
          </div>
        ) : null}

        {activeTab === 'documents' ? (
          <div className="mt-5 rounded-[18px] border border-[#dce5f0] bg-[#fbfcfe] p-4">
            <h3 className="text-base font-semibold text-[#142132]">Documents</h3>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {['Agent FICA', 'Employment / Contractor Agreement', 'Mandates', 'Certificates', 'Compliance Documents', 'Other Documents'].map((name) => (
                <div key={name} className="rounded-[12px] border border-[#e4ebf5] bg-white px-3 py-2 text-sm text-[#2d445d]">
                  {name} <span className="ml-2 text-xs text-[#6c8098]">Requested</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {activeTab === 'reviews' ? (
          <div className="mt-5 rounded-[18px] border border-[#dce5f0] bg-[#fbfcfe] p-4">
            <h3 className="text-base font-semibold text-[#142132]">Reviews</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <article className="rounded-[12px] border border-[#e4ebf5] bg-white px-3 py-2">
                <p className="text-sm font-semibold text-[#1f3448]">Client Review</p>
                <p className="mt-1 text-xs text-[#60758d]">Excellent communication and fast follow-up during OTP stage.</p>
              </article>
              <article className="rounded-[12px] border border-[#e4ebf5] bg-white px-3 py-2">
                <p className="text-sm font-semibold text-[#1f3448]">Internal Principal Note</p>
                <p className="mt-1 text-xs text-[#60758d]">Strong pipeline quality this month. Focus on faster document turnarounds.</p>
              </article>
            </div>
          </div>
        ) : null}

        {activeTab === 'settings' && canManageSettings ? (
          <div className="mt-5 rounded-[18px] border border-[#dce5f0] bg-[#fbfcfe] p-4">
            <h3 className="text-base font-semibold text-[#142132]">Settings</h3>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {[
                'Assigned office / branch',
                'Role',
                'Status',
                'Permission level',
                'Commission setup',
                'Notification preferences',
                'Assigned developments',
              ].map((setting) => (
                <div key={setting} className="rounded-[12px] border border-[#e4ebf5] bg-white px-3 py-2 text-sm text-[#2d445d]">
                  {setting}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </section>
  )
}

export function AgentsPage() {
  const navigate = useNavigate()
  const { role, baseRole, profile } = useWorkspace()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [officeFilter, setOfficeFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [agents, setAgents] = useState([])

  const canAccess = canAccessAgentsModule({ role, baseRole, profile })

  const loadData = useCallback(async () => {
    if (!canAccess) {
      setAgents([])
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError('')

      const transactions = role === 'agent'
        ? await fetchTransactionsListSummary({ activeTransactionsOnly: false })
        : await fetchTransactionsByParticipantSummary({ userId: profile?.id, roleType: role })

      const privateListings = readLocalRows(PRIVATE_LISTINGS_STORAGE_KEY)
      const pipelineRows = readLocalRows(PIPELINE_STORAGE_KEY)

      const agentDirectory = readLocalRows('itg:agent-directory:v1')
      const mapped = computeAgentWorkspaceData({
        transactions: Array.isArray(transactions) ? transactions : [],
        privateListings,
        pipelineRows,
        agentDirectory,
      })

      setAgents(mapped)
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load agents.')
      setAgents([])
    } finally {
      setLoading(false)
    }
  }, [canAccess, profile?.id, role])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const officeOptions = useMemo(() => {
    const items = [...new Set(agents.map((agent) => agent.office).filter(Boolean))]
    return ['all', ...items]
  }, [agents])

  const filteredAgents = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    return agents.filter((agent) => {
      const officeMatch = officeFilter === 'all' ? true : agent.office === officeFilter
      const searchMatch = query
        ? `${agent.name} ${agent.email} ${agent.office}`.toLowerCase().includes(query)
        : true
      return officeMatch && searchMatch
    })
  }, [agents, officeFilter, searchTerm])

  if (!canAccess) {
    return (
      <section className="space-y-5">
        <div className="rounded-[20px] border border-[#f3d8cc] bg-[#fff6f2] px-5 py-4 text-sm text-[#9a3a13]">
          Agents workspace is available to Headquarters, Principal, and Admin users only.
        </div>
      </section>
    )
  }

  if (!isSupabaseConfigured) {
    return (
      <section className="space-y-5">
        <div className="rounded-[20px] border border-[#f3d8cc] bg-[#fff6f2] px-5 py-4 text-sm text-[#9a3a13]">
          Supabase is not configured for this workspace.
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-5">
      <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
        <SectionHeader
          title=""
          copy="Manage your agents, listings, deals, and performance from one place."
          actions={
            <Button type="button" onClick={() => window.alert('Add Agent flow placeholder')}>
              <Plus size={16} />
              Add Agent
            </Button>
          }
        />

        <div className="mt-4 grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
          <label className="grid gap-1.5">
            <span className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Office</span>
            <Field as="select" value={officeFilter} onChange={(event) => setOfficeFilter(event.target.value)}>
              {officeOptions.map((office) => (
                <option key={office} value={office}>
                  {office === 'all' ? 'All Offices' : office}
                </option>
              ))}
            </Field>
          </label>
          <label className="grid gap-1.5">
            <span className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Search Agent</span>
            <div className="ui-input flex items-center gap-2">
              <Search size={15} className="text-[#6f859d]" />
              <input
                className="w-full border-0 bg-transparent p-0 text-sm text-[#142132] outline-none"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by name, email, or office"
              />
            </div>
          </label>
        </div>
      </section>

      {error ? <p className="rounded-[16px] border border-[#f2d7d7] bg-[#fff6f6] px-4 py-3 text-sm text-[#b42318]">{error}</p> : null}

      {loading ? (
        <div className="rounded-[20px] border border-[#dde4ee] bg-white px-5 py-6 text-sm text-[#647a92]">Loading agents…</div>
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredAgents.length ? (
            filteredAgents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                onView={() => navigate(`/agents/${encodeURIComponent(agent.id)}`)}
              />
            ))
          ) : (
            <div className="rounded-[20px] border border-[#dde4ee] bg-white px-5 py-8 text-sm text-[#647a92]">
              No agents found for this filter.
            </div>
          )}
        </section>
      )}
    </section>
  )
}

export function AgentWorkspacePage() {
  const navigate = useNavigate()
  const { agentId } = useParams()
  const { role, baseRole, profile } = useWorkspace()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [agent, setAgent] = useState(null)

  const canAccess = canAccessAgentsModule({ role, baseRole, profile })
  const canManageSettings = canAccess

  const loadWorkspace = useCallback(async () => {
    if (!canAccess) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError('')

      const transactions = role === 'agent'
        ? await fetchTransactionsListSummary({ activeTransactionsOnly: false })
        : await fetchTransactionsByParticipantSummary({ userId: profile?.id, roleType: role })

      const privateListings = readLocalRows(PRIVATE_LISTINGS_STORAGE_KEY)
      const pipelineRows = readLocalRows(PIPELINE_STORAGE_KEY)
      const agentDirectory = readLocalRows('itg:agent-directory:v1')
      const mappedAgents = computeAgentWorkspaceData({
        transactions: Array.isArray(transactions) ? transactions : [],
        privateListings,
        pipelineRows,
        agentDirectory,
      })

      const target = mappedAgents.find((item) => item.id === String(agentId || '').trim().toLowerCase())
      if (!target) {
        setError('Agent not found in your current workspace scope.')
        setAgent(null)
      } else {
        setAgent(target)
      }
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load agent workspace.')
      setAgent(null)
    } finally {
      setLoading(false)
    }
  }, [agentId, canAccess, profile?.id, role])

  useEffect(() => {
    void loadWorkspace()
  }, [loadWorkspace])

  if (!canAccess) {
    return (
      <section className="space-y-5">
        <div className="rounded-[20px] border border-[#f3d8cc] bg-[#fff6f2] px-5 py-4 text-sm text-[#9a3a13]">
          Agents workspace is available to Headquarters, Principal, and Admin users only.
        </div>
      </section>
    )
  }

  if (loading) {
    return <div className="rounded-[20px] border border-[#dde4ee] bg-white px-5 py-6 text-sm text-[#647a92]">Loading agent workspace…</div>
  }

  if (error || !agent) {
    return (
      <section className="space-y-4">
        <p className="rounded-[16px] border border-[#f2d7d7] bg-[#fff6f6] px-4 py-3 text-sm text-[#b42318]">{error || 'Agent not found.'}</p>
        <Button type="button" variant="secondary" onClick={() => navigate('/agents')}>
          Back to Agents
        </Button>
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <Button type="button" variant="secondary" size="sm" onClick={() => navigate('/agents')}>
          Back to Agents
        </Button>
        <div className="inline-flex items-center gap-2 text-xs text-[#647a92]">
          <ShieldCheck size={13} />
          Principal Workspace
        </div>
      </div>
      <AgentWorkspace agent={agent} canManageSettings={canManageSettings} />
    </section>
  )
}

export default AgentsPage
