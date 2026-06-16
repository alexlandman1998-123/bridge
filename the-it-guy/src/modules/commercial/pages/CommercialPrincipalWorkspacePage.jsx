import { AlertTriangle, ArrowUpRight, Building2, CalendarDays, DollarSign, FileText, Gauge, Handshake, LineChart, TrendingUp, Users, Warehouse } from 'lucide-react'
import { createElement } from 'react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import CommercialEmptyState from '../components/CommercialEmptyState'
import Modal from '../../../components/ui/Modal'
import { formatCurrency, formatDate, formatNumber, titleize } from '../commercialFormatters'
import { useCommercialData } from '../hooks/useCommercialData'
import { getCommercialBrokerageData } from '../services/commercialBrokerageApi'
import { updateCommercialCommission } from '../services/commercialApi'
import { getCommercialPrincipalDashboardData } from '../services/commercialDashboardApi'
import {
  buildCommercialPortalAdoption,
  disableCommercialPortalAccess,
  listCommercialPortalAccessForOrganisation,
  listCommercialPortalAuditEvents,
  resendCommercialPortalInvitation,
  revokeCommercialPortalAccess,
} from '../services/commercialPortalApi'
import {
  buildCommercialOnboardingBrokerSummary,
  listCommercialOnboardingAccessForOrganisation,
  resendCommercialOnboardingInvitation,
} from '../services/commercialOnboardingApi'

const CARD_CLASS = 'rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]'
const TABS = [
  ['overview', 'Overview'],
  ['brokers', 'Brokers'],
  ['teams', 'Teams'],
  ['branches', 'Branches'],
  ['pipeline', 'Pipeline'],
  ['stock', 'Stock'],
  ['transactions', 'Transactions'],
  ['revenue', 'Revenue'],
  ['portal', 'Portals'],
  ['reports', 'Reports'],
]

function KpiCard({ label, value, detail, icon: Icon }) {
  return (
    <article className={`${CARD_CLASS} flex min-h-[124px] items-center gap-4`}>
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#eef5fb] text-[#123b61]">
        {createElement(Icon, { size: 21 })}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-[#102236]">{value}</p>
        <p className="mt-2 text-xs font-semibold text-emerald-600">{detail}</p>
      </div>
    </article>
  )
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-10 items-center rounded-2xl px-4 text-sm font-semibold transition ${
        active ? 'bg-[#102b46] text-white' : 'border border-slate-200 bg-white text-[#102236] hover:border-blue-200 hover:text-blue-700'
      }`}
    >
      {children}
    </button>
  )
}

function Table({ columns = [], rows = [], empty = 'No rows yet.' }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">
          <tr>
            {columns.map((column) => <th key={column.key} className={`px-3 py-3 ${column.align === 'right' ? 'text-right' : ''}`}>{column.label}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length ? rows.map((row) => (
            <tr key={row.id || row.key || row.label} className="align-top hover:bg-slate-50">
              {columns.map((column) => (
                <td key={column.key} className={`px-3 py-3 ${column.align === 'right' ? 'text-right' : ''}`}>
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          )) : (
            <tr>
              <td className="px-3 py-5 text-slate-500" colSpan={columns.length}>{empty}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function StatusPill({ value }) {
  const normalized = String(value || '').toLowerCase()
  const tone = normalized === 'overloaded' || normalized === 'high' || normalized === 'high risk'
    ? 'bg-rose-50 text-rose-700'
    : normalized === 'medium' || normalized === 'approved'
      ? 'bg-amber-50 text-amber-700'
      : normalized === 'paid' || normalized === 'completed'
        ? 'bg-emerald-50 text-emerald-700'
        : 'bg-slate-100 text-slate-600'
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{titleize(value)}</span>
}

function MetricBand({ rows = [] }) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {rows.map((row) => <KpiCard key={row.label} {...row} />)}
    </section>
  )
}

function RevenueEditModal({ row, onClose, onSave, saving }) {
  const [form, setForm] = useState({
    commission_percent: row?.commission_percent ?? 5,
    commission_amount: row?.commission_amount ?? 0,
    status: row?.status || 'projected',
  })
  if (!row) return null
  return (
    <Modal open title="Update Commission" onClose={onClose}>
      <div className="grid gap-4">
        <p className="text-sm text-slate-500">{row.transaction?.title || 'Commercial transaction'}</p>
        <label className="grid gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Commission %</span>
          <input value={form.commission_percent} onChange={(event) => setForm((current) => ({ ...current, commission_percent: event.target.value }))} type="number" className="min-h-11 rounded-2xl border border-slate-200 px-3 text-sm" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Commission Amount</span>
          <input value={form.commission_amount} onChange={(event) => setForm((current) => ({ ...current, commission_amount: event.target.value }))} type="number" className="min-h-11 rounded-2xl border border-slate-200 px-3 text-sm" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Status</span>
          <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm">
            <option value="projected">Projected</option>
            <option value="approved">Approved</option>
            <option value="paid">Paid</option>
          </select>
        </label>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="inline-flex min-h-10 items-center rounded-2xl border border-slate-200 px-4 text-sm font-semibold text-[#102236]">Cancel</button>
          <button type="button" disabled={saving} onClick={() => onSave(form)} className="inline-flex min-h-10 items-center rounded-2xl bg-[#102b46] px-4 text-sm font-semibold text-white disabled:opacity-60">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function CommercialPrincipalWorkspacePage() {
  const [tab, setTab] = useState('overview')
  const [reloadKey, setReloadKey] = useState(0)
  const [editingCommission, setEditingCommission] = useState(null)
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const dashboard = useCommercialData(getCommercialPrincipalDashboardData, [reloadKey])
  const brokerage = useCommercialData(getCommercialBrokerageData, [reloadKey])
  const portals = useCommercialData(async (organisationId) => {
    const [accessRows, auditRows, onboardingRows] = await Promise.all([
      listCommercialPortalAccessForOrganisation(organisationId),
      listCommercialPortalAuditEvents(organisationId, 80),
      listCommercialOnboardingAccessForOrganisation(organisationId),
    ])
    return {
      accessRows,
      auditRows,
      onboardingRows,
      onboardingSummaries: onboardingRows.map(buildCommercialOnboardingBrokerSummary),
      adoption: buildCommercialPortalAdoption(accessRows, auditRows),
    }
  }, [reloadKey])

  const loading = dashboard.loading || brokerage.loading || portals.loading
  const error = dashboard.error || brokerage.error || portals.error
  const data = dashboard.data || {}
  const ops = brokerage.data || {}
  const summary = data.summary || {}
  const intelligence = data.intelligence || {}
  const financialSummary = data.financialSummary || {}
  const brokerRows = intelligence.brokerScorecards || ops.brokers || []
  const teamRows = ops.teams || []
  const branchRows = ops.branchRows || []
  const executivePipeline = intelligence.executivePipeline || []
  const renewalPipeline = intelligence.renewalPipeline || []
  const stockLeaderboard = intelligence.stockLeaderboard || []
  const managementAlerts = intelligence.managementAlerts || []
  const portalAccessRows = portals.data?.accessRows || []
  const portalAuditRows = portals.data?.auditRows || []
  const onboardingRows = portals.data?.onboardingSummaries || []
  const portalAdoption = portals.data?.adoption || {}

  const commissionRows = useMemo(() => {
    const transactionMap = new Map((data.commercialTransactions || []).map((transaction) => [transaction.id, transaction]))
    return (data.commissions || []).map((commission) => ({
      ...commission,
      transaction: transactionMap.get(commission.transaction_id) || null,
    })).sort((left, right) => (right.commission_amount || 0) - (left.commission_amount || 0))
  }, [data.commercialTransactions, data.commissions])

  async function handleSaveCommission(values) {
    if (!editingCommission?.id) return
    setSaving(true)
    setSaveError('')
    try {
      await updateCommercialCommission(editingCommission.id, {
        commission_percent: Number(values.commission_percent) || 0,
        commission_amount: Number(values.commission_amount) || 0,
        status: values.status,
        manual_override: true,
      })
      setEditingCommission(null)
      setReloadKey((current) => current + 1)
    } catch (error) {
      setSaveError(error?.message || 'Commission could not be updated.')
    } finally {
      setSaving(false)
    }
  }

  async function handlePortalAction(action, row) {
    if (!row?.id) return
    setSaving(true)
    setSaveError('')
    try {
      if (action === 'resend') await resendCommercialPortalInvitation(row.id)
      if (action === 'revoke') await revokeCommercialPortalAccess(row.id)
      if (action === 'disable') await disableCommercialPortalAccess(row.id)
      setReloadKey((current) => current + 1)
    } catch (error) {
      setSaveError(error?.message || 'Portal access could not be updated.')
    } finally {
      setSaving(false)
    }
  }

  async function handleOnboardingAction(action, row) {
    if (!row?.id) return
    setSaving(true)
    setSaveError('')
    try {
      if (action === 'resend') {
        await resendCommercialOnboardingInvitation(row.id, 'reminder')
        setReloadKey((current) => current + 1)
      }
      if (action === 'copy' && navigator?.clipboard?.writeText) await navigator.clipboard.writeText(row.portalUrl)
      if (action === 'review' && row.portalUrl) window.open(row.portalUrl, '_blank', 'noopener,noreferrer')
    } catch (error) {
      setSaveError(error?.message || 'Commercial onboarding could not be updated.')
    } finally {
      setSaving(false)
    }
  }

  const topRow = [
    { label: 'Active Requirements', value: formatNumber(summary.activeRequirements || 0), detail: 'Current demand in play', icon: Users },
    { label: 'Active Transactions', value: formatNumber(summary.activeTransactions || 0), detail: 'Serious opportunities closing', icon: Handshake },
    { label: 'Active Listings', value: formatNumber(summary.activeListings || 0), detail: 'Market-facing stock', icon: Warehouse },
    { label: 'Active Vacancies', value: formatNumber(summary.activeVacancies || 0), detail: 'Open supply-side stock', icon: Building2 },
  ]
  const secondRow = [
    { label: 'Pipeline Value', value: formatCurrency(summary.pipelineValue || 0), detail: 'Open brokerage pipeline', icon: LineChart },
    { label: 'Expected Revenue', value: formatCurrency(summary.expectedRevenue || 0), detail: 'Projected commercial commissions', icon: DollarSign },
    { label: 'Occupancy %', value: `${formatNumber(summary.occupancyRate || 0)}%`, detail: 'Current portfolio occupancy', icon: TrendingUp },
    { label: 'Vacancy %', value: `${formatNumber(summary.vacancyRate || 0)}%`, detail: 'Current portfolio vacancy', icon: AlertTriangle },
  ]
  const thirdRow = [
    { label: 'Viewings This Month', value: formatNumber(summary.viewings?.thisMonth || 0), detail: 'Broker inspections scheduled/completed', icon: CalendarDays },
    { label: 'Deals Created', value: formatNumber(summary.dealsCreatedThisMonth || 0), detail: 'New opportunities opened this month', icon: Handshake },
    { label: 'Transactions Closed', value: formatNumber(summary.transactionsClosedThisMonth || 0), detail: 'Completed this month', icon: Gauge },
    { label: 'Average Deal Cycle', value: `${formatNumber(summary.averageDealCycle || 0)} days`, detail: 'Average close time', icon: LineChart },
  ]

  return (
    <div className="grid gap-5">
      <section className={CARD_CLASS}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.045em] text-[#102236]">Commercial Principal View</h1>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-500">One place to run the commercial brokerage: performance, stock, pipeline, transactions, revenue, and reporting.</p>
          </div>
          <Link to="/commercial/dashboard" className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-slate-200 px-4 text-sm font-semibold text-[#102236]">
            Open Dashboard
            <ArrowUpRight size={15} />
          </Link>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {TABS.map(([key, label]) => (
            <TabButton key={key} active={tab === key} onClick={() => setTab(key)}>{label}</TabButton>
          ))}
        </div>
      </section>

      {error ? <CommercialEmptyState title="Principal workspace could not be loaded" description={error} /> : null}

      {tab === 'overview' ? (
        <>
          <MetricBand rows={topRow} />
          <MetricBand rows={secondRow} />
          <MetricBand rows={thirdRow} />

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
            <article className={CARD_CLASS}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-[#102236]">Executive Pipeline</h2>
                  <p className="mt-1 text-sm text-slate-500">Where demand is converting and where it is sticking.</p>
                </div>
                <Link to="/commercial/pipeline" className="text-sm font-semibold text-blue-600">Open pipeline</Link>
              </div>
              <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
                <Table
                  columns={[
                    { key: 'label', label: 'Stage' },
                    { key: 'count', label: 'Count', align: 'right', render: (row) => formatNumber(row.count) },
                    { key: 'value', label: 'Value', align: 'right', render: (row) => formatCurrency(row.value || 0) },
                    { key: 'conversion', label: 'Conversion %', align: 'right', render: (row) => `${formatNumber(row.conversion || 0)}%` },
                  ]}
                  rows={executivePipeline}
                  empty="No pipeline movement yet."
                />
              </div>
            </article>

            <article className={CARD_CLASS}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-[#102236]">Management Alerts</h2>
                  <p className="mt-1 text-sm text-slate-500">Stale stock, aging demand, stalled transactions, overload, and expiry exposure.</p>
                </div>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">{formatNumber(managementAlerts.length)}</span>
              </div>
              <div className="mt-5 space-y-3">
                {loading ? <div className="h-20 animate-pulse rounded-2xl bg-slate-100" /> : managementAlerts.length ? managementAlerts.slice(0, 6).map((alert) => (
                  <Link key={alert.id} to={alert.to} className="block rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4 transition hover:border-blue-200 hover:bg-white">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#102236]">{alert.title}</p>
                        <p className="mt-1 text-xs text-slate-500">{alert.type} · {alert.detail}</p>
                      </div>
                      <StatusPill value={alert.priority} />
                    </div>
                  </Link>
                )) : <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No management alerts right now.</p>}
              </div>
            </article>
          </section>
        </>
      ) : null}

      {tab === 'brokers' ? (
        <section className={CARD_CLASS}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-[#102236]">Broker Scorecard</h2>
              <p className="mt-1 text-sm text-slate-500">Operational output, pipeline, closings, expected commissions, and capacity.</p>
            </div>
            <Link to="/commercial/brokers/performance" className="text-sm font-semibold text-blue-600">Detailed broker page</Link>
          </div>
          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
            <Table
              columns={[
                { key: 'name', label: 'Broker', render: (row) => <Link to={`/commercial/brokers/${encodeURIComponent(row.id)}`} className="font-semibold text-[#102236]">{row.name}</Link> },
                { key: 'activeRequirements', label: 'Requirements', align: 'right', render: (row) => formatNumber(row.activeRequirements) },
                { key: 'viewingsCompleted', label: 'Viewings', align: 'right', render: (row) => formatNumber(row.viewingsCompleted) },
                { key: 'dealsCreated', label: 'Deals', align: 'right', render: (row) => formatNumber(row.dealsCreated) },
                { key: 'activeTransactions', label: 'Transactions', align: 'right', render: (row) => formatNumber(row.activeTransactions) },
                { key: 'closedTransactions', label: 'Closed', align: 'right', render: (row) => formatNumber(row.closedTransactions) },
                { key: 'pipelineValue', label: 'Pipeline', align: 'right', render: (row) => formatCurrency(row.pipelineValue) },
                { key: 'expectedCommission', label: 'Expected Commission', align: 'right', render: (row) => formatCurrency(row.expectedCommission) },
                { key: 'capacityLabel', label: 'Capacity', align: 'right', render: (row) => <StatusPill value={row.capacityLabel} /> },
              ]}
              rows={brokerRows}
              empty="No broker scorecards yet."
            />
          </div>
        </section>
      ) : null}

      {tab === 'teams' ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {teamRows.length ? teamRows.map((team) => (
            <article key={team.id} className={CARD_CLASS}>
              <h2 className="text-base font-semibold text-[#102236]">{team.name}</h2>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-100 bg-[#fbfcfe] px-4 py-3"><p className="text-xs text-slate-400">Brokers</p><p className="mt-1 font-semibold text-[#102236]">{formatNumber(team.brokers || team.brokerCount || 0)}</p></div>
                <div className="rounded-2xl border border-slate-100 bg-[#fbfcfe] px-4 py-3"><p className="text-xs text-slate-400">Transactions</p><p className="mt-1 font-semibold text-[#102236]">{formatNumber(team.activeTransactions || 0)}</p></div>
                <div className="rounded-2xl border border-slate-100 bg-[#fbfcfe] px-4 py-3"><p className="text-xs text-slate-400">Pipeline</p><p className="mt-1 font-semibold text-[#102236]">{formatCurrency(team.pipelineValue || 0)}</p></div>
                <div className="rounded-2xl border border-slate-100 bg-[#fbfcfe] px-4 py-3"><p className="text-xs text-slate-400">Expected Revenue</p><p className="mt-1 font-semibold text-[#102236]">{formatCurrency(team.expectedRevenue || 0)}</p></div>
              </div>
            </article>
          )) : <CommercialEmptyState title="No teams found" description="Commercial team performance will appear here once teams are assigned." />}
        </section>
      ) : null}

      {tab === 'branches' ? (
        <section className={CARD_CLASS}>
          <h2 className="text-lg font-semibold text-[#102236]">Branch Performance</h2>
          <p className="mt-1 text-sm text-slate-500">Stock, pipeline, transactions, revenue, and occupancy by branch.</p>
          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
            <Table
              columns={[
                { key: 'name', label: 'Branch' },
                { key: 'activeListings', label: 'Listings', align: 'right', render: (row) => formatNumber(row.activeListings) },
                { key: 'activeVacancies', label: 'Vacancies', align: 'right', render: (row) => formatNumber(row.activeVacancies) },
                { key: 'pipelineValue', label: 'Pipeline', align: 'right', render: (row) => formatCurrency(row.pipelineValue) },
                { key: 'activeTransactions', label: 'Transactions', align: 'right', render: (row) => formatNumber(row.activeTransactions) },
                { key: 'revenue', label: 'Revenue', align: 'right', render: (row) => formatCurrency(row.revenue || row.expectedRevenue || 0) },
                { key: 'occupancy', label: 'Occupancy', align: 'right', render: (row) => `${formatNumber(row.occupancy || 0)}%` },
              ]}
              rows={branchRows}
              empty="No branch rows yet."
            />
          </div>
        </section>
      ) : null}

      {tab === 'pipeline' ? (
        <section className="grid gap-4 xl:grid-cols-2">
          <article className={CARD_CLASS}>
            <h2 className="text-lg font-semibold text-[#102236]">Executive Pipeline View</h2>
            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
              <Table
                columns={[
                  { key: 'label', label: 'Stage' },
                  { key: 'count', label: 'Count', align: 'right', render: (row) => formatNumber(row.count) },
                  { key: 'value', label: 'Value', align: 'right', render: (row) => formatCurrency(row.value || 0) },
                  { key: 'conversion', label: 'Conversion', align: 'right', render: (row) => `${formatNumber(row.conversion || 0)}%` },
                ]}
                rows={executivePipeline}
              />
            </div>
          </article>
          <article className={CARD_CLASS}>
            <h2 className="text-lg font-semibold text-[#102236]">Renewal Pipeline</h2>
            <div className="mt-5 grid gap-3">
              {renewalPipeline.map((row) => (
                <div key={row.key} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-[#fbfcfe] px-4 py-3">
                  <span className="text-sm font-semibold text-[#102236]">{row.label}</span>
                  <span className="text-sm font-semibold text-slate-500">{formatNumber(row.count)}</span>
                </div>
              ))}
            </div>
          </article>
        </section>
      ) : null}

      {tab === 'stock' ? (
        <section className={CARD_CLASS}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-[#102236]">Stock Leaderboard</h2>
              <p className="mt-1 text-sm text-slate-500">Occupancy, vacancy exposure, active deals, and leasing velocity by asset.</p>
            </div>
            <Link to="/commercial/properties" className="text-sm font-semibold text-blue-600">Open stock</Link>
          </div>
          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
            <Table
              columns={[
                { key: 'propertyName', label: 'Property', render: (row) => <Link to={`/commercial/properties/${row.id}`} className="font-semibold text-[#102236]">{row.propertyName}</Link> },
                { key: 'occupancyRate', label: 'Occupancy %', align: 'right', render: (row) => `${formatNumber(row.occupancyRate || 0)}%` },
                { key: 'vacancyRate', label: 'Vacancy %', align: 'right', render: (row) => `${formatNumber(row.vacancyRate || 0)}%` },
                { key: 'activeDeals', label: 'Deals', align: 'right', render: (row) => formatNumber(row.activeDeals) },
                { key: 'transactions', label: 'Transactions', align: 'right', render: (row) => formatNumber(row.transactions) },
                { key: 'leasingVelocity', label: 'Leasing Velocity', align: 'right', render: (row) => formatNumber(row.leasingVelocity) },
              ]}
              rows={stockLeaderboard}
              empty="No stock performance rows yet."
            />
          </div>
        </section>
      ) : null}

      {tab === 'transactions' ? (
        <section className="grid gap-4 xl:grid-cols-2">
          <article className={CARD_CLASS}>
            <h2 className="text-lg font-semibold text-[#102236]">Recent Transactions</h2>
            <div className="mt-5 space-y-3">
              {(data.commercialTransactions || []).slice(0, 8).map((transaction) => (
                <Link key={transaction.id} to={`/commercial/transactions/${transaction.id}`} className="block rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4 transition hover:border-blue-200 hover:bg-white">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#102236]">{transaction.title}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">{transaction.property?.property_name || 'Property pending'} · {transaction.brokerName || 'Broker pending'}</p>
                    </div>
                    <StatusPill value={transaction.status} />
                  </div>
                  <p className="mt-2 text-xs font-semibold text-slate-500">{formatCurrency(transaction.value || 0)} · {formatDate(transaction.expectedCloseDate || transaction.actualCloseDate || transaction.updatedAt)}</p>
                </Link>
              ))}
            </div>
          </article>
          <article className={CARD_CLASS}>
            <h2 className="text-lg font-semibold text-[#102236]">Lease Expiry & Renewal Risk</h2>
            <div className="mt-5 space-y-3">
              {(intelligence.renewalRisk || []).slice(0, 8).map((row) => (
                <Link key={row.id} to="/commercial/lease-expiry-watch" className="block rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4 transition hover:border-blue-200 hover:bg-white">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#102236]">{row.title}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">{row.property} · {row.tenant} · {row.broker}</p>
                    </div>
                    <StatusPill value={row.risk} />
                  </div>
                  <p className="mt-2 text-xs font-semibold text-slate-500">{row.daysToExpiry} days to expiry · {formatDate(row.expiryDate)}</p>
                </Link>
              ))}
            </div>
          </article>
        </section>
      ) : null}

      {tab === 'revenue' ? (
        <>
          <MetricBand rows={[
            { label: 'Projected Revenue', value: formatCurrency(financialSummary.projectedRevenue || 0), detail: 'Projected commissions', icon: DollarSign },
            { label: 'Approved Revenue', value: formatCurrency(financialSummary.approvedRevenue || 0), detail: 'Approved brokerage revenue', icon: TrendingUp },
            { label: 'Paid Revenue', value: formatCurrency(financialSummary.paidRevenue || 0), detail: 'Paid commissions', icon: Handshake },
            { label: 'Expected Commission', value: formatCurrency(summary.expectedRevenue || 0), detail: 'Live forward view', icon: LineChart },
          ]} />
          <section className={CARD_CLASS}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-[#102236]">Commission Report</h2>
                <p className="mt-1 text-sm text-slate-500">Projected, approved, and paid commissions by transaction.</p>
              </div>
            </div>
            {saveError ? <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{saveError}</p> : null}
            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
              <Table
                columns={[
                  { key: 'transaction', label: 'Transaction', render: (row) => <Link to={`/commercial/transactions/${row.transaction_id}`} className="font-semibold text-[#102236]">{row.transaction?.title || row.transaction_id}</Link> },
                  { key: 'broker', label: 'Broker', render: (row) => row.transaction?.brokerName || 'Assigned broker' },
                  { key: 'commission_percent', label: 'Commission %', align: 'right', render: (row) => `${formatNumber(row.commission_percent || 0)}%` },
                  { key: 'commission_amount', label: 'Amount', align: 'right', render: (row) => formatCurrency(row.commission_amount || 0) },
                  { key: 'status', label: 'Status', align: 'right', render: (row) => <StatusPill value={row.status} /> },
                  { key: 'actions', label: 'Actions', align: 'right', render: (row) => <button type="button" onClick={() => setEditingCommission(row)} className="text-sm font-semibold text-blue-600">Edit</button> },
                ]}
                rows={commissionRows}
                empty="No commission rows yet."
              />
            </div>
          </section>
        </>
      ) : null}

      {tab === 'portal' ? (
        <>
          <MetricBand rows={[
            { label: 'Portal Access', value: formatNumber(portalAdoption.activeAccess || 0), detail: `${formatNumber(portalAdoption.totalAccess || 0)} total links`, icon: Users },
            { label: 'Active Users', value: formatNumber(portalAdoption.activeUsers || 0), detail: 'Accepted or recently active', icon: TrendingUp },
            { label: 'Pending Invitations', value: formatNumber(portalAdoption.pendingInvitations || 0), detail: 'Awaiting activation', icon: AlertTriangle },
            { label: 'Recent Uploads', value: formatNumber(portalAdoption.recentUploads?.length || 0), detail: 'Client document activity', icon: FileText },
          ]} />
          <section className={CARD_CLASS}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-[#102236]">Portal Access Control</h2>
                <p className="mt-1 text-sm text-slate-500">Invitation-only access across landlords, tenants, buyers, sellers, and investors.</p>
              </div>
            </div>
            {saveError ? <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{saveError}</p> : null}
            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
              <Table
                columns={[
                  { key: 'contact', label: 'Contact', render: (row) => row.contact?.contact_name || row.contact?.company_name || 'Portal contact' },
                  { key: 'email', label: 'Email', render: (row) => row.contact?.contact_email || '-' },
                  { key: 'role', label: 'Role', render: (row) => titleize(row.portal_role) },
                  { key: 'status', label: 'Status', render: (row) => <StatusPill value={row.status} /> },
                  { key: 'last', label: 'Last Activity', render: (row) => formatDate(row.last_activity_at || row.last_opened_at || row.accepted_at || row.created_at) },
                  { key: 'actions', label: 'Actions', align: 'right', render: (row) => (
                    <div className="flex justify-end gap-2">
                      <button type="button" disabled={saving} onClick={() => void handlePortalAction('resend', row)} className="text-sm font-semibold text-blue-600 disabled:opacity-60">Resend</button>
                      <button type="button" disabled={saving} onClick={() => void handlePortalAction('disable', row)} className="text-sm font-semibold text-amber-600 disabled:opacity-60">Disable</button>
                      <button type="button" disabled={saving} onClick={() => void handlePortalAction('revoke', row)} className="text-sm font-semibold text-rose-600 disabled:opacity-60">Revoke</button>
                    </div>
                  ) },
                ]}
                rows={portalAccessRows}
                empty="No commercial portal access has been issued yet."
              />
            </div>
          </section>
          <section className={CARD_CLASS}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-[#102236]">Commercial Onboarding Review</h2>
                <p className="mt-1 text-sm text-slate-500">Track tenant and seller onboarding progress, gaps, and follow-up actions from one place.</p>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">{formatNumber(onboardingRows.length)}</span>
            </div>
            {saveError ? <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{saveError}</p> : null}
            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
              <Table
                columns={[
                  { key: 'contact', label: 'Contact', render: (row) => row.contactName || 'Commercial client' },
                  { key: 'status', label: 'Status', render: (row) => <StatusPill value={row.status} /> },
                  { key: 'completion', label: 'Completion', align: 'right', render: (row) => `${formatNumber(row.completionPercentage || 0)}%` },
                  { key: 'missing', label: 'Missing', render: (row) => [
                    ...(row.missingFields || []).slice(0, 2).map((item) => item?.label || item),
                    ...(row.missingDocuments || []).slice(0, 2).map((item) => item?.label || item),
                  ].filter(Boolean).join(' · ') || 'None' },
                  { key: 'email', label: 'Last Email', render: (row) => formatDate(row.lastEmailSentAt) },
                  { key: 'opened', label: 'Last Opened', render: (row) => formatDate(row.lastOpenedAt) },
                  { key: 'submitted', label: 'Last Submitted', render: (row) => formatDate(row.lastSubmittedAt) },
                  { key: 'actions', label: 'Actions', align: 'right', render: (row) => (
                    <div className="flex justify-end gap-2">
                      <button type="button" disabled={saving} onClick={() => void handleOnboardingAction('resend', row)} className="text-sm font-semibold text-blue-600 disabled:opacity-60">Resend Link</button>
                      <button type="button" disabled={saving} onClick={() => void handleOnboardingAction('copy', row)} className="text-sm font-semibold text-blue-600 disabled:opacity-60">Copy Link</button>
                      <button type="button" disabled={saving} onClick={() => void handleOnboardingAction('review', row)} className="text-sm font-semibold text-blue-600 disabled:opacity-60">Review Submission</button>
                    </div>
                  ) },
                ]}
                rows={onboardingRows}
                empty="No commercial onboarding has been issued yet."
              />
            </div>
          </section>
          <section className="grid gap-4 xl:grid-cols-2">
            <article className={CARD_CLASS}>
              <h2 className="text-lg font-semibold text-[#102236]">Recent Portal Activity</h2>
              <div className="mt-5 space-y-3">
                {portalAuditRows.slice(0, 10).map((row) => (
                  <div key={row.id} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] px-4 py-3">
                    <p className="text-sm font-semibold text-[#102236]">{row.event_title || titleize(row.event_type)}</p>
                    <p className="mt-1 text-xs text-slate-500">{titleize(row.portal_role)} · {formatDate(row.created_at)}</p>
                  </div>
                ))}
                {!portalAuditRows.length ? <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No portal audit activity yet.</p> : null}
              </div>
            </article>
            <article className={CARD_CLASS}>
              <h2 className="text-lg font-semibold text-[#102236]">Role Adoption</h2>
              <div className="mt-5 grid gap-3">
                {Object.entries(portalAdoption.roleCounts || {}).map(([role, count]) => (
                  <div key={role} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-[#fbfcfe] px-4 py-3">
                    <span className="text-sm font-semibold text-[#102236]">{titleize(role)}</span>
                    <span className="text-sm font-semibold text-slate-500">{formatNumber(count)}</span>
                  </div>
                ))}
                {!Object.keys(portalAdoption.roleCounts || {}).length ? <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No role adoption data yet.</p> : null}
              </div>
            </article>
          </section>
        </>
      ) : null}

      {tab === 'reports' ? (
        <section className="grid gap-4 xl:grid-cols-2">
          <article className={CARD_CLASS}>
            <h2 className="text-lg font-semibold text-[#102236]">Broker Report</h2>
            <p className="mt-1 text-sm text-slate-500">Top brokers by live pipeline and projected commissions.</p>
            <div className="mt-5 space-y-3">
              {brokerRows.slice(0, 6).map((row) => (
                <div key={row.id} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-[#fbfcfe] px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-[#102236]">{row.name}</p>
                    <p className="text-xs text-slate-500">{formatNumber(row.activeTransactions)} active transactions</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-[#102236]">{formatCurrency(row.pipelineValue)}</p>
                    <p className="text-xs text-slate-500">{formatCurrency(row.expectedCommission)} projected</p>
                  </div>
                </div>
              ))}
            </div>
          </article>
          <article className={CARD_CLASS}>
            <h2 className="text-lg font-semibold text-[#102236]">Team & Branch Report</h2>
            <p className="mt-1 text-sm text-slate-500">Compare team and branch outcomes side by side.</p>
            <div className="mt-5 grid gap-3">
              {teamRows.slice(0, 3).map((row) => (
                <div key={`team-${row.id}`} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] px-4 py-3">
                  <p className="text-sm font-semibold text-[#102236]">{row.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatCurrency(row.pipelineValue || 0)} pipeline · {formatCurrency(row.expectedRevenue || 0)} expected revenue</p>
                </div>
              ))}
              {branchRows.slice(0, 3).map((row) => (
                <div key={`branch-${row.id}`} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] px-4 py-3">
                  <p className="text-sm font-semibold text-[#102236]">{row.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatCurrency(row.pipelineValue || 0)} pipeline · {formatNumber(row.occupancy || 0)}% occupancy</p>
                </div>
              ))}
            </div>
          </article>
          <article className={CARD_CLASS}>
            <h2 className="text-lg font-semibold text-[#102236]">Stock Report</h2>
            <p className="mt-1 text-sm text-slate-500">Top-performing assets and occupancy signal.</p>
            <div className="mt-5 space-y-3">
              {stockLeaderboard.slice(0, 5).map((row) => (
                <div key={row.id} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-[#fbfcfe] px-4 py-3">
                  <span className="text-sm font-semibold text-[#102236]">{row.propertyName}</span>
                  <span className="text-xs text-slate-500">{formatNumber(row.occupancyRate || 0)}% occupied</span>
                </div>
              ))}
            </div>
          </article>
          <article className={CARD_CLASS}>
            <h2 className="text-lg font-semibold text-[#102236]">Pipeline & Commission Report</h2>
            <p className="mt-1 text-sm text-slate-500">Conversion plus revenue visibility from a single screen.</p>
            <div className="mt-5 space-y-3">
              {executivePipeline.map((row) => (
                <div key={row.key} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-[#fbfcfe] px-4 py-3">
                  <span className="text-sm font-semibold text-[#102236]">{row.label}</span>
                  <span className="text-xs text-slate-500">{formatNumber(row.count)} · {formatCurrency(row.value || 0)}</span>
                </div>
              ))}
            </div>
          </article>
        </section>
      ) : null}

      <RevenueEditModal row={editingCommission} onClose={() => setEditingCommission(null)} onSave={handleSaveCommission} saving={saving} />
    </div>
  )
}

export default CommercialPrincipalWorkspacePage
