import {
  ArrowRight,
  Banknote,
  BarChart3,
  CheckCircle2,
  Clock3,
  Download,
  Edit3,
  FileSpreadsheet,
  Filter,
  Gauge,
  LineChart,
  Plus,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import {
  INVOICE_STATUSES,
  PAYOUT_STATUSES,
  PAYOUT_STATUS_KEYS,
  createCommissionRule,
  generateCommissionStatement,
  getRevenueDashboard,
  updateCommissionRule,
  updatePayoutStatus,
} from '../../services/bondRevenueCommissionService'
import {
  COMMISSION_CALCULATION_BASES,
  COMMISSION_PARTY_TYPES,
  COMMISSION_RULE_TYPES,
} from '../../services/bondCommissionRulesService'

function normalizeText(value) {
  return String(value || '').trim()
}

function resolveWorkspaceId(workspaceContext = {}) {
  return normalizeText(
    workspaceContext.workspaceId ||
      workspaceContext.currentWorkspace?.id ||
      workspaceContext.workspace?.id ||
      workspaceContext.currentMembership?.workspaceId ||
      workspaceContext.currentMembership?.organisation_id ||
      workspaceContext.currentMembership?.organisationId,
  )
}

function formatMoney(value, fallback = 'R 0') {
  if (value === null || value === undefined || value === '') return fallback
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0)).replace('ZAR', 'R')
}

function formatPercent(value, fallback = '—') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return fallback
  return `${Math.round(Number(value || 0))}%`
}

function formatBasis(value = '') {
  const labels = {
    gross_bond_amount: 'Gross bond amount',
    originator_commission: 'Originator commission',
    fixed_amount: 'Fixed amount',
    manual: 'Manual',
  }
  return labels[normalizeText(value)] || normalizeText(value).replaceAll('_', ' ') || 'Not configured'
}

function formatPartyType(value = '') {
  const labels = {
    originator_company: 'Originator Company',
    consultant: 'Consultant',
    agency: 'Agency',
    agent: 'Agent',
    developer: 'Developer',
    branch: 'Branch',
    region: 'Region',
    bank: 'Bank',
    partner_referral: 'Partner Referral',
  }
  return labels[normalizeText(value)] || normalizeText(value).replaceAll('_', ' ') || 'Party'
}

function humanize(value = '') {
  return normalizeText(value).replaceAll('_', ' ') || 'Not configured'
}

function formatRate(row = {}) {
  const value = Number(row.rate || 0)
  if (!value) return row.rateType === 'fixed' ? formatMoney(0) : '0%'
  if (row.rateType === 'fixed') return formatMoney(value)
  return `${value}%`
}

function statusClass(status = '') {
  const normalized = normalizeText(status).toLowerCase()
  if (normalized.includes('hold') || normalized.includes('cancelled')) return 'bg-rose-50 text-rose-700 ring-rose-200'
  if (normalized.includes('pending') || normalized.includes('requested')) return 'bg-amber-50 text-amber-700 ring-amber-200'
  if (normalized.includes('ready') || normalized.includes('approved') || normalized.includes('invoiced')) return 'bg-sky-50 text-sky-700 ring-sky-200'
  if (normalized.includes('paid') || normalized.includes('active')) return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  return 'bg-slate-100 text-slate-700 ring-slate-200'
}

function humanStatus(value = '') {
  return normalizeText(value).replaceAll('_', ' ') || 'Pending'
}

function StatusPill({ status }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ${statusClass(status)}`}>
      {humanStatus(status)}
    </span>
  )
}

function PageButton({ children, icon: Icon, primary = false, disabled = false, onClick, title = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex h-10 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold shadow-sm transition ${
        primary
          ? 'bg-slate-950 text-white hover:bg-slate-800 disabled:bg-slate-300'
          : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:text-slate-400'
      }`}
    >
      {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
      {children}
    </button>
  )
}

function MetricCard({ label, value, trend, icon: Icon, restricted = false }) {
  return (
    <article className="min-h-[132px] rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-3 text-2xl font-semibold tracking-normal text-slate-950">{restricted ? 'Restricted' : value}</p>
        </div>
        {Icon ? (
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 text-slate-500 ring-1 ring-slate-200">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-sm text-slate-500">{restricted ? 'Visible to HQ and finance roles' : trend || 'No previous period'}</p>
    </article>
  )
}

function Section({ title, subtitle, icon: Icon, children, action = null, className = '' }) {
  return (
    <section className={`min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
        <div className="flex items-start gap-3">
          {Icon ? (
            <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 text-slate-500 ring-1 ring-slate-200">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
          ) : null}
          <div>
            <h2 className="text-base font-semibold text-slate-950">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
          </div>
        </div>
        {action}
      </div>
      <div className="min-w-0 p-5 sm:p-6">{children}</div>
    </section>
  )
}

function DataTable({ columns = [], rows = [], emptyTitle = 'No records match this view yet.', emptyDescription = '' }) {
  if (!rows.length) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm">
        <p className="font-semibold text-slate-900">{emptyTitle}</p>
        {emptyDescription ? <p className="mt-1 text-slate-500">{emptyDescription}</p> : null}
      </div>
    )
  }
  return (
    <div className="overflow-x-auto [scrollbar-width:thin]">
      <table className="w-full min-w-[920px] divide-y divide-slate-200 text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className="whitespace-nowrap px-4 py-3 font-semibold">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, index) => (
            <tr key={row.id || row.applicationId || row.key || `${row.partyName || row.bank || 'row'}-${index}`} className="align-middle">
              {columns.map((column) => (
                <td key={column.key} className="whitespace-nowrap px-4 py-4 text-slate-700">
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text' }) {
  return (
    <label className="text-sm font-medium text-slate-600">
      {label}
      <input
        type={type}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-950"
      />
    </label>
  )
}

function SelectField({ label, value, onChange, children }) {
  return (
    <label className="text-sm font-medium text-slate-600">
      {label}
      <select
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950"
      >
        {children}
      </select>
    </label>
  )
}

function emptyCommissionRuleDraft() {
  return {
    id: '',
    name: '',
    partyType: COMMISSION_PARTY_TYPES.bank,
    partyName: '',
    calculationBasis: COMMISSION_CALCULATION_BASES.originatorCommission,
    type: COMMISSION_RULE_TYPES.percentage,
    rate: '',
    fixedAmount: '',
    status: 'active',
    effectiveFrom: '',
    effectiveTo: '',
  }
}

function commissionRuleDraftFromRow(row = {}) {
  return {
    ...emptyCommissionRuleDraft(),
    id: row.id || '',
    name: row.name || '',
    partyType: row.partyType || COMMISSION_PARTY_TYPES.bank,
    partyName: row.partyName || '',
    calculationBasis: row.calculationBasis || COMMISSION_CALCULATION_BASES.originatorCommission,
    type: row.type || row.rateType || COMMISSION_RULE_TYPES.percentage,
    rate: row.rate ?? '',
    fixedAmount: row.fixedAmount ?? '',
    status: row.status || 'active',
    effectiveFrom: row.effectiveFrom || '',
    effectiveTo: row.effectiveTo || '',
  }
}

function CommissionRuleModal({ draft, setDraft, onClose, onSave }) {
  const isEditing = Boolean(draft.id)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 px-4 py-6">
      <div className="max-h-[calc(100vh-48px)] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-950/20">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Commission Structure</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-950">{isEditing ? 'Edit Commission Rule' : 'Add Commission Rule'}</h2>
            <p className="mt-1 text-sm text-slate-500">Define the commercial rule used for bank incentives, partner payouts, consultant splits or internal allocations.</p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Field label="Rule Name" value={draft.name} onChange={(value) => setDraft({ ...draft, name: value })} />
          <SelectField label="Status" value={draft.status} onChange={(value) => setDraft({ ...draft, status: value })}>
            {['active', 'inactive', 'draft'].map((status) => <option key={status} value={status}>{humanize(status)}</option>)}
          </SelectField>
          <SelectField label="Party Type" value={draft.partyType} onChange={(value) => setDraft({ ...draft, partyType: value })}>
            {Object.values(COMMISSION_PARTY_TYPES).map((type) => <option key={type} value={type}>{formatPartyType(type)}</option>)}
          </SelectField>
          <Field label="Partner / Role Name" value={draft.partyName} onChange={(value) => setDraft({ ...draft, partyName: value })} />
          <SelectField label="Calculation Basis" value={draft.calculationBasis} onChange={(value) => setDraft({ ...draft, calculationBasis: value })}>
            {Object.values(COMMISSION_CALCULATION_BASES).map((basis) => <option key={basis} value={basis}>{formatBasis(basis)}</option>)}
          </SelectField>
          <SelectField label="Rule Type" value={draft.type} onChange={(value) => setDraft({ ...draft, type: value })}>
            {Object.values(COMMISSION_RULE_TYPES).map((type) => <option key={type} value={type}>{humanize(type)}</option>)}
          </SelectField>
          <Field label="Percentage Rate" value={draft.rate} onChange={(value) => setDraft({ ...draft, rate: value })} type="number" />
          <Field label="Fixed Amount" value={draft.fixedAmount} onChange={(value) => setDraft({ ...draft, fixedAmount: value })} type="number" />
          <Field label="Effective From" value={draft.effectiveFrom} onChange={(value) => setDraft({ ...draft, effectiveFrom: value })} type="date" />
          <Field label="Effective To" value={draft.effectiveTo} onChange={(value) => setDraft({ ...draft, effectiveTo: value })} type="date" />
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button type="button" onClick={onClose} className="inline-flex h-11 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50">Cancel</button>
          <button type="button" onClick={onSave} className="inline-flex h-11 items-center rounded-lg bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800">Save Rule</button>
        </div>
      </div>
    </div>
  )
}

function FlowNode({ node, isLast, restricted }) {
  return (
    <div className="relative min-w-0">
      <article className="min-h-[118px] rounded-lg border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-medium text-slate-500">{node.label}</p>
        <p className="mt-3 text-xl font-semibold text-slate-950">{restricted && node.key === 'net_profit' ? 'Restricted' : formatMoney(node.amount, '—')}</p>
        <p className="mt-2 text-xs text-slate-500">{node.applications || 0} applications</p>
      </article>
      {!isLast ? <ArrowRight className="absolute right-4 top-4 hidden h-4 w-4 text-slate-400 2xl:block" aria-hidden="true" /> : null}
    </div>
  )
}

function AttributionChart({ rows = [] }) {
  const colors = ['#0f172a', '#2563eb', '#14b8a6', '#f59e0b']
  let cursor = 0
  const gradient = rows.length
    ? rows.map((row, index) => {
        const start = cursor
        cursor += Number(row.percentage || 0)
        return `${colors[index % colors.length]} ${start}% ${cursor}%`
      }).join(', ')
    : '#e2e8f0 0% 100%'
  return (
    <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <div className="mx-auto flex h-56 w-56 items-center justify-center rounded-full" style={{ background: `conic-gradient(${gradient})` }}>
        <div className="flex h-32 w-32 flex-col items-center justify-center rounded-full bg-white text-center shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Split</span>
          <span className="mt-1 text-2xl font-semibold text-slate-950">100%</span>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((row, index) => (
          <article key={row.key} className="rounded-lg border border-slate-200 p-4">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
              <p className="text-sm font-semibold text-slate-900">{row.label}</p>
            </div>
            <p className="mt-2 text-xl font-semibold text-slate-950">{formatMoney(row.amount)}</p>
            <p className="mt-1 text-sm text-slate-500">{formatPercent(row.percentage)} of attributed payouts</p>
          </article>
        ))}
      </div>
    </div>
  )
}

export default function BondRevenueManagementPage() {
  const workspaceContext = useWorkspace()
  const workspaceId = resolveWorkspaceId(workspaceContext)
  const [refreshKey, setRefreshKey] = useState(0)
  const [notice, setNotice] = useState('')
  const [payoutTab, setPayoutTab] = useState(PAYOUT_STATUS_KEYS.readyToPay)
  const [commissionRuleDraft, setCommissionRuleDraft] = useState(null)
  const options = useMemo(() => ({ workspaceId, refreshKey }), [workspaceId, refreshKey])

  const state = useMemo(() => {
    try {
      return { dashboard: getRevenueDashboard(workspaceContext, options), error: '' }
    } catch (error) {
      return { dashboard: null, error: String(error?.message || 'Could not load revenue management.') }
    }
  }, [workspaceContext, options])

  const dashboard = state.dashboard
  const canManagePayouts = Boolean(dashboard?.permissions?.canManagePayouts)
  const canManageCommissionRules = Boolean(dashboard?.permissions?.canManageCommissionRules)
  const canViewProfit = Boolean(dashboard?.permissions?.canViewCompanyProfit)
  const payoutCentre = dashboard?.payoutCentre || { rows: [], tabs: [], summary: {} }
  const visiblePayoutRows = payoutCentre.rows.filter((row) => row.statusKey === payoutTab)
  const primaryForecastRows = (dashboard?.weightedForecast || []).filter((row) => row.id !== 'total')
  const totalForecastRow = (dashboard?.weightedForecast || []).find((row) => row.id === 'total')

  function refresh() {
    setNotice('Commercial dashboard refreshed.')
    setRefreshKey((value) => value + 1)
  }

  function exportPortfolio() {
    setNotice('Export is prepared through the existing revenue report workflow.')
  }

  function changePayout(row, status, label) {
    try {
      updatePayoutStatus(row.id, status, workspaceContext, options)
      setNotice(`${label} for ${row.payeeName || row.partyName || 'payout'}.`)
      setRefreshKey((value) => value + 1)
    } catch (error) {
      setNotice(String(error?.message || 'Could not update payout.'))
    }
  }

  function statement(row, format = 'PDF') {
    try {
      generateCommissionStatement(row.key || row.payeeId, workspaceContext, { ...options, format })
      setNotice(`${format} commission statement generated.`)
    } catch (error) {
      setNotice(String(error?.message || 'Could not generate commission statement.'))
    }
  }

  function openCommissionRuleEditor(row = null) {
    if (row?.isDefault) {
      setCommissionRuleDraft({ ...commissionRuleDraftFromRow(row), id: '', name: `${row.partyName || row.name || 'Commission Rule'} Custom` })
      return
    }
    setCommissionRuleDraft(row ? commissionRuleDraftFromRow(row) : emptyCommissionRuleDraft())
  }

  function saveCommissionRule() {
    if (!commissionRuleDraft) return
    const payload = {
      name: commissionRuleDraft.name || commissionRuleDraft.partyName || 'Commission Rule',
      partyType: commissionRuleDraft.partyType,
      appliesTo: commissionRuleDraft.partyType,
      partyName: commissionRuleDraft.partyName,
      appliesToLabel: commissionRuleDraft.partyName,
      calculationBasis: commissionRuleDraft.calculationBasis,
      type: commissionRuleDraft.type,
      rateType: commissionRuleDraft.type,
      rate: commissionRuleDraft.rate,
      percentage: commissionRuleDraft.type === COMMISSION_RULE_TYPES.fixed ? 0 : commissionRuleDraft.rate,
      fixedAmount: commissionRuleDraft.fixedAmount,
      status: commissionRuleDraft.status,
      effectiveFrom: commissionRuleDraft.effectiveFrom,
      effectiveTo: commissionRuleDraft.effectiveTo,
    }
    try {
      if (commissionRuleDraft.id) updateCommissionRule(commissionRuleDraft.id, payload, workspaceContext, options)
      else createCommissionRule(payload, workspaceContext, options)
      setCommissionRuleDraft(null)
      setNotice('Commission structure saved.')
      setRefreshKey((value) => value + 1)
    } catch (error) {
      setNotice(String(error?.message || 'Could not save commission structure.'))
    }
  }

  if (state.error) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:px-5 lg:px-8">
        <div className="mx-auto max-w-4xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-950">Revenue & Commissions</h1>
          <p className="mt-3 text-sm text-slate-600">{state.error}</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:px-5 lg:px-8">
      <div className="mx-auto max-w-[1440px] space-y-8">
        <header className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Bond Originator</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal text-slate-950">Revenue & Commissions</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">Commercial engine and payout control</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <PageButton icon={Clock3}>This Month</PageButton>
            <PageButton icon={Filter}>Filters</PageButton>
            <PageButton icon={Download} onClick={exportPortfolio}>Export</PageButton>
            <PageButton icon={RefreshCw} primary onClick={refresh}>Refresh</PageButton>
          </div>
        </header>

        <nav className="flex gap-2 overflow-x-auto pb-1 text-sm">
          {[
            ['Dashboard', '/dashboard'],
            ['Bank Relationships', '/bond/banks'],
            ['Revenue & Commissions', '/bond/revenue'],
            ['HQ Command Centre', '/bond/hq-command-centre'],
          ].map(([label, to]) => (
            <Link
              key={label}
              to={to}
              className={`shrink-0 rounded-lg px-3 py-2 font-medium ${
                label === 'Revenue & Commissions'
                  ? 'bg-slate-950 text-white'
                  : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>

        {notice ? <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">{notice}</p> : null}

        <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          <MetricCard label="Gross Commission Received" value={formatMoney(dashboard.kpis.grossCommissionReceived.value, '—')} trend={dashboard.kpis.grossCommissionReceived.trend} icon={Banknote} restricted={dashboard.kpis.grossCommissionReceived.value === null} />
          <MetricCard label="Consultant Commissions" value={formatMoney(dashboard.kpis.consultantCommissions.value)} trend={dashboard.kpis.consultantCommissions.trend} icon={Users} />
          <MetricCard label="Partner / Agent Payouts" value={formatMoney(dashboard.kpis.partnerPayouts.value, '—')} trend={dashboard.kpis.partnerPayouts.trend} icon={ReceiptText} restricted={dashboard.kpis.partnerPayouts.value === null} />
          <MetricCard label="Net Profit" value={formatMoney(dashboard.kpis.netProfit.value, '—')} trend={dashboard.kpis.netProfit.trend} icon={Gauge} restricted={!canViewProfit} />
          <MetricCard label="Pending Payouts" value={formatMoney(dashboard.kpis.pendingPayouts.value)} trend={dashboard.kpis.pendingPayouts.trend} icon={Wallet} />
          <MetricCard label="Margin %" value={formatPercent(dashboard.kpis.marginPercent.value)} trend={dashboard.kpis.marginPercent.trend} icon={ShieldCheck} restricted={!canViewProfit} />
        </section>

        <Section title="Revenue Flow" subtitle="Bond value movement through bank commission, splits, partner payouts, and company profit." icon={LineChart}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            {dashboard.revenueFlow.nodes.map((node, index) => (
              <FlowNode key={node.key} node={node} isLast={index === dashboard.revenueFlow.nodes.length - 1} restricted={!canViewProfit} />
            ))}
          </div>
          <div className="mt-5 grid gap-3 border-t border-slate-200 pt-5 text-sm sm:grid-cols-3">
            <p><span className="font-semibold text-slate-900">Avg Originator Rate:</span> <span className="text-slate-500">{formatPercent(dashboard.revenueFlow.rates.averageOriginatorRate)}</span></p>
            <p><span className="font-semibold text-slate-900">Avg Consultant Split:</span> <span className="text-slate-500">{formatPercent(dashboard.revenueFlow.rates.averageConsultantSplit)}</span></p>
            <p><span className="font-semibold text-slate-900">Avg Partner Rate:</span> <span className="text-slate-500">{formatPercent(dashboard.revenueFlow.rates.averagePartnerRate)}</span></p>
          </div>
        </Section>

        <div className="grid gap-8 xl:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]">
          <Section
            title="Revenue Attribution"
            subtitle="Split of consultant, partner, developer, and internal company share."
            icon={BarChart3}
            action={(
              <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                {['Partner Type', 'Consultant', 'Branch', 'Region', 'Bank', 'Development'].map((label) => (
                  <span key={label} className="rounded-full bg-slate-50 px-3 py-1.5 ring-1 ring-slate-200">{label}</span>
                ))}
              </div>
            )}
          >
            <AttributionChart rows={dashboard.revenueAttribution} />
          </Section>

          <Section
            title="Commission Structures"
            subtitle="Manage the active rules used for bank agreements, partner payouts, consultant splits and internal allocations."
            icon={ReceiptText}
            action={canManageCommissionRules ? <PageButton icon={Plus} primary onClick={() => openCommissionRuleEditor()}>Add Commission Rule</PageButton> : null}
          >
            <DataTable
              rows={dashboard.commissionRules}
              emptyTitle="No commission rules configured."
              emptyDescription="Add originator, consultant and partner commission rules to start calculating revenue automatically."
              columns={[
                { key: 'partyType', label: 'Applies To', render: (row) => formatPartyType(row.partyType) },
                { key: 'partyName', label: 'Partner / Role', render: (row) => row.partyName || 'Default rule' },
                { key: 'calculationBasis', label: 'Calculation Basis', render: (row) => formatBasis(row.calculationBasis) },
                { key: 'rate', label: 'Rate / Split', render: (row) => formatRate(row) },
                { key: 'status', label: 'Status', render: (row) => <StatusPill status={row.status} /> },
                {
                  key: 'actions',
                  label: 'Actions',
                  render: (row) => canManageCommissionRules ? (
                    <button type="button" onClick={() => openCommissionRuleEditor(row)} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-950 hover:underline">
                      <Edit3 className="h-3.5 w-3.5" /> {row.isDefault ? 'Create override' : 'Edit'}
                    </button>
                  ) : <span className="text-sm font-semibold text-slate-400">View</span>,
                },
              ]}
            />
            {dashboard.hasConfiguredCommissionRules ? null : (
              <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-500 ring-1 ring-slate-200">
                Default calculation rules are being used until organisation-specific commission rules are configured.
              </p>
            )}
          </Section>
        </div>

        <Section title="Revenue Forecast" subtitle="Weighted forecast from application stage and bond amount." icon={LineChart}>
          <DataTable
            rows={primaryForecastRows}
            columns={[
              { key: 'pipelineStage', label: 'Pipeline Stage' },
              { key: 'applications', label: 'Applications' },
              { key: 'totalBondAmount', label: 'Total Bond Amount', render: (row) => formatMoney(row.totalBondAmount) },
              { key: 'weight', label: 'Weight', render: (row) => formatPercent(row.weight) },
              { key: 'expectedRevenue', label: 'Expected Revenue', render: (row) => formatMoney(row.expectedRevenue) },
            ]}
            emptyTitle="Performance metrics will appear once applications begin moving through the bond pipeline."
          />
          {totalForecastRow ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-lg bg-slate-950 px-5 py-4 text-white">
              <div>
                <p className="text-sm font-semibold">Total / Weighted Forecast</p>
                <p className="mt-1 text-sm text-slate-300">{totalForecastRow.applications} applications · {formatMoney(totalForecastRow.totalBondAmount)} bond value</p>
              </div>
              <p className="text-2xl font-semibold">{formatMoney(totalForecastRow.expectedRevenue)}</p>
            </div>
          ) : null}
        </Section>

        <Section
          title="Payout Centre"
          subtitle="Operational control for pending, approved, invoiced, paid and held payouts."
          icon={Wallet}
          action={canManagePayouts ? <PageButton primary onClick={() => setNotice('Bulk payout actions use the selected tab context.')}>Approve Selected</PageButton> : null}
        >
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0">
              <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
                {payoutCentre.tabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setPayoutTab(tab.key)}
                    className={`shrink-0 rounded-full px-3 py-2 text-sm font-semibold ring-1 ${
                      payoutTab === tab.key
                        ? 'bg-slate-950 text-white ring-slate-950'
                        : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {tab.label} <span className="ml-1 text-xs opacity-75">{tab.count}</span>
                  </button>
                ))}
              </div>
              <DataTable
                rows={visiblePayoutRows}
                emptyTitle={payoutTab === PAYOUT_STATUS_KEYS.readyToPay ? 'No payouts ready yet.' : 'No payouts in this status.'}
                emptyDescription={payoutTab === PAYOUT_STATUS_KEYS.readyToPay ? 'Payouts will appear here once an application reaches instruction issued.' : 'Try another payout status tab.'}
                columns={[
                  { key: 'application', label: 'Application', render: (row) => row.application || row.applicationId || 'Application pending' },
                  { key: 'client', label: 'Client', render: (row) => row.client || 'Client pending' },
                  { key: 'payeeName', label: 'Partner / Consultant', render: (row) => <div><p className="font-semibold text-slate-900">{row.payeeName || 'Payee pending'}</p><p className="text-xs text-slate-500">{formatPartyType(row.payeeType)}</p></div> },
                  { key: 'bondAmount', label: 'Bond Amount', render: (row) => formatMoney(row.bondAmount) },
                  { key: 'grossCommission', label: 'Gross Commission', render: (row) => formatMoney(row.grossCommission) },
                  { key: 'consultantCommission', label: 'Consultant Commission', render: (row) => formatMoney(row.consultantCommission) },
                  { key: 'partnerPayout', label: 'Partner Payout', render: (row) => formatMoney(row.partnerPayout) },
                  { key: 'netProfit', label: 'Net Profit', render: (row) => canViewProfit ? formatMoney(row.netProfit, '—') : 'Restricted' },
                  { key: 'status', label: 'Status', render: (row) => <StatusPill status={row.status} /> },
                  {
                    key: 'actions',
                    label: 'Actions',
                    render: (row) => canManagePayouts ? (
                      <div className="flex gap-2">
                        <button type="button" onClick={() => changePayout(row, PAYOUT_STATUSES.approved, 'Payout approved')} className="font-semibold text-slate-950 hover:underline">Approve</button>
                        <button type="button" onClick={() => changePayout(row, PAYOUT_STATUSES.invoiced, 'Invoice marked received')} className="font-semibold text-slate-950 hover:underline">Invoice</button>
                        <button type="button" onClick={() => changePayout(row, PAYOUT_STATUSES.paid, 'Payout marked paid')} className="font-semibold text-slate-950 hover:underline">Paid</button>
                        <button type="button" onClick={() => changePayout(row, PAYOUT_STATUSES.onHold, 'Payout put on hold')} className="font-semibold text-slate-500 hover:underline">Hold</button>
                      </div>
                    ) : <span className="text-slate-400">View</span>,
                  },
                ]}
              />
            </div>
            <aside className="grid content-start gap-4">
              <MetricCard label="Total Ready To Pay" value={formatMoney(payoutCentre.summary.totalReadyToPay)} icon={CheckCircle2} />
              <MetricCard label="Pending Approval" value={formatMoney(payoutCentre.summary.pendingApproval)} icon={Clock3} />
              <MetricCard label="Overdue Payouts" value={formatMoney(payoutCentre.summary.overduePayouts)} icon={Gauge} />
              <article className="rounded-lg border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                <p className="font-semibold text-slate-900">Invoicing foundation</p>
                <p className="mt-2">Supported statuses: {Object.values(INVOICE_STATUSES).map(humanStatus).join(', ')}.</p>
              </article>
            </aside>
          </div>
        </Section>

        <div className="grid gap-8 xl:grid-cols-2">
          <Section title="Partner Revenue" subtitle="Referral payout performance by partner, agent, agency, or developer." icon={Users}>
            <DataTable
              rows={dashboard.partnerRevenue}
              emptyTitle="No partner revenue yet."
              emptyDescription="Partner payouts will appear once partner-linked applications reach commercial stages."
              columns={[
                { key: 'partnerName', label: 'Partner' },
                { key: 'partnerType', label: 'Type', render: (row) => formatPartyType(row.partnerType) },
                { key: 'applicationsSent', label: 'Applications' },
                { key: 'bondValue', label: 'Bond Value', render: (row) => formatMoney(row.bondValue) },
                { key: 'payoutRate', label: 'Payout Rate', render: (row) => formatPercent(row.payoutRate) },
                { key: 'payoutAmount', label: 'Payout Amount', render: (row) => formatMoney(row.payoutAmount) },
                { key: 'status', label: 'Status', render: (row) => <StatusPill status={row.status} /> },
              ]}
            />
          </Section>

          <Section title="Bank Revenue" subtitle="Revenue by configured bank relationship." icon={Banknote}>
            <DataTable
              rows={dashboard.bankRevenue}
              emptyTitle="No configured bank revenue yet."
              emptyDescription="Bank revenue only shows configured or observed banks from the bond workflow."
              columns={[
                { key: 'bank', label: 'Bank' },
                { key: 'applications', label: 'Applications' },
                { key: 'bondValue', label: 'Bond Value', render: (row) => formatMoney(row.bondValue) },
                { key: 'grossCommission', label: 'Gross Commission', render: (row) => formatMoney(row.grossCommission) },
                { key: 'approvalRevenue', label: 'Approval Revenue', render: (row) => formatMoney(row.approvalRevenue) },
                { key: 'instructionRevenue', label: 'Instruction Revenue', render: (row) => formatMoney(row.instructionRevenue) },
                { key: 'profit', label: 'Net Profit', render: (row) => canViewProfit ? formatMoney(row.profit) : 'Restricted' },
              ]}
            />
          </Section>
        </div>

        <Section title="Consultant Earnings" subtitle="Commission statements and consultant payable balances." icon={FileSpreadsheet}>
          <DataTable
            rows={dashboard.consultantEarnings}
            emptyTitle="No consultant earnings yet."
            emptyDescription="Consultant commissions will appear once bond amount and commission rules are available."
            columns={[
              { key: 'name', label: 'Consultant' },
              { key: 'applications', label: 'Applications' },
              { key: 'bondValue', label: 'Bond Value', render: (row) => formatMoney(row.bondValue) },
              { key: 'revenueGenerated', label: 'Gross Revenue', render: (row) => formatMoney(row.revenueGenerated) },
              { key: 'commissionEarned', label: 'Commission Earned', render: (row) => formatMoney(row.commissionEarned) },
              { key: 'commissionOutstanding', label: 'Outstanding', render: (row) => formatMoney(row.commissionOutstanding) },
              {
                key: 'statement',
                label: 'Statement',
                render: (row) => (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => statement(row, 'PDF')} className="font-semibold text-slate-950 hover:underline">PDF</button>
                    <button type="button" onClick={() => statement(row, 'Excel')} className="font-semibold text-slate-950 hover:underline">Excel</button>
                  </div>
                ),
              },
            ]}
          />
        </Section>
      </div>
      {commissionRuleDraft ? (
        <CommissionRuleModal
          draft={commissionRuleDraft}
          setDraft={setCommissionRuleDraft}
          onClose={() => setCommissionRuleDraft(null)}
          onSave={saveCommissionRule}
        />
      ) : null}
    </main>
  )
}
