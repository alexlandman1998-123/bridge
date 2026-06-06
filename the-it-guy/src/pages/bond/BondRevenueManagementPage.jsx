import {
  ArrowRight,
  Banknote,
  BarChart3,
  CheckCircle2,
  Clock3,
  Download,
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
import { useWorkspace } from '../../context/WorkspaceContext'
import {
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
  return `${Math.round(Number(value || 0) * 10) / 10}%`
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

function formatTrend(value = '', fallback = '0.0%') {
  const text = normalizeText(value)
  if (!text || text === 'No change') return fallback
  return text
}

function formatComparison(value = '', fallback = 'vs last month') {
  const text = normalizeText(value)
  if (!text || text === 'No previous period') return fallback
  if (text.toLowerCase().includes('last') || text.toLowerCase().includes('previous')) return text
  return `${text} ${fallback}`
}

function getPrimaryRevenue(row = {}) {
  return Number(row.revenue || row.revenueGenerated || row.grossCommission || row.payoutAmount || row.commissionEarned || row.profit || 0)
}

function getApplicationCount(row = {}) {
  return Number(row.applications || row.applicationsSent || row.expectedApplications || 0)
}

function ruleShareCells(row = {}) {
  const partyType = normalizeText(row.partyType).toLowerCase()
  const value = formatRate(row)
  if (partyType === 'consultant') {
    return { originator: 'Balance', partner: '—', consultant: value }
  }
  if (['agency', 'agent', 'developer', 'partner_referral'].includes(partyType)) {
    return { originator: 'Balance', partner: value, consultant: '—' }
  }
  if (['branch', 'region'].includes(partyType)) {
    return { originator: value, partner: '—', consultant: '—' }
  }
  return { originator: value, partner: '—', consultant: '—' }
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

function MetricCard({ label, value, trend, comparison = 'vs last month', icon: Icon, restricted = false }) {
  return (
    <article className="min-h-[132px] rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</p>
          <p className="mt-3 text-2xl font-semibold tracking-normal text-slate-950">{restricted ? 'Restricted' : value}</p>
        </div>
        {Icon ? (
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 text-slate-500 ring-1 ring-slate-200">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-sm font-semibold text-emerald-700">{restricted ? 'Visible to HQ and finance roles' : formatTrend(trend)}</p>
      {!restricted ? <p className="mt-1 text-xs text-slate-500">{formatComparison(comparison)}</p> : null}
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

function FlowNode({ node, isLast, restricted, flow }) {
  const grossNode = (flow?.nodes || []).find((item) => item.key === 'originator_gross_revenue')
  const totalNode = (flow?.nodes || [])[0]
  const grossAmount = Number(grossNode?.amount || 0)
  const totalBondAmount = Number(totalNode?.amount || 0)
  const amount = Number(node.amount || 0)
  const percent =
    node.key === 'bond_amount'
      ? 100
      : node.key === 'bank_commission_received' || node.key === 'originator_gross_revenue'
        ? (totalBondAmount ? (amount / totalBondAmount) * 100 : 0)
        : grossAmount ? (amount / grossAmount) * 100 : 0
  return (
    <div className="relative min-w-0">
      <article className={`min-h-[150px] rounded-xl border p-5 shadow-sm ${
        node.key === 'net_profit'
          ? 'border-emerald-200 bg-emerald-50/70'
          : 'border-slate-200 bg-white'
      }`}>
        <p className="text-sm font-semibold text-slate-600">{node.label}</p>
        <p className="mt-4 text-2xl font-semibold text-slate-950">{restricted && node.key === 'net_profit' ? 'Restricted' : formatMoney(node.amount, '—')}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs font-semibold">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">{formatPercent(percent)}</span>
          <span className="text-slate-500">{node.applications || 0} applications</span>
        </div>
      </article>
      {!isLast ? <ArrowRight className="absolute -right-3 top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 text-slate-400 2xl:block" aria-hidden="true" /> : null}
    </div>
  )
}

function AttributionChart({ rows = [] }) {
  const colors = ['#2563eb', '#8b5cf6', '#14b8a6', '#f59e0b', '#64748b']
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

function LeaderboardCard({ title, row, nameKey = 'name', revenueKey = 'revenueGenerated', growth = '0.0%' }) {
  const name = row?.[nameKey] || row?.name || row?.partnerName || row?.bank || 'No data yet'
  const revenue = row ? getPrimaryRevenue({ ...row, revenueGenerated: row?.[revenueKey] ?? row?.revenueGenerated }) : 0
  const applications = row ? getApplicationCount(row) : 0
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">{title}</p>
      <h3 className="mt-3 truncate text-lg font-semibold text-slate-950">{name}</h3>
      <p className="mt-3 text-2xl font-semibold text-slate-950">{formatMoney(revenue)}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">{formatTrend(growth)}</span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{applications} applications</span>
      </div>
    </article>
  )
}

function ForecastBars({ rows = [], totalRow = null }) {
  const maxValue = Math.max(...rows.map((row) => Number(row.expectedRevenue || 0)), 1)
  return (
    <div className="space-y-4">
      {rows.map((row) => {
        const width = Math.max(4, Math.round((Number(row.expectedRevenue || 0) / maxValue) * 100))
        return (
          <article key={row.id} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-[170px_minmax(0,1fr)_160px_100px_160px] md:items-center">
            <div>
              <p className="font-semibold text-slate-950">{row.pipelineStage}</p>
              <p className="mt-1 text-xs text-slate-500">{row.applications} applications</p>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-blue-500" style={{ width: `${width}%` }} />
            </div>
            <p className="text-sm font-semibold text-slate-700">{formatMoney(row.totalBondAmount)}</p>
            <p className="text-sm font-semibold text-slate-700">{formatPercent(row.weight)}</p>
            <p className="text-sm font-semibold text-slate-950">{formatMoney(row.expectedRevenue)}</p>
          </article>
        )
      })}
      {totalRow ? (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-slate-950 px-5 py-4 text-white">
          <div>
            <p className="text-sm font-semibold">Total Weighted Forecast</p>
            <p className="mt-1 text-sm text-slate-300">{totalRow.applications} applications · {formatMoney(totalRow.totalBondAmount)} bond value</p>
          </div>
          <p className="text-2xl font-semibold">{formatMoney(totalRow.expectedRevenue)}</p>
        </div>
      ) : null}
    </div>
  )
}

function PartnerRevenueCard({ rows = [], grossRevenue = 0 }) {
  const totalPayouts = rows.reduce((total, row) => total + Number(row.payoutAmount || 0), 0)
  const totalContribution = rows.reduce((total, row) => total + Number(row.revenueGenerated || row.revenue || 0), 0)
  const topPartner = [...rows].sort((left, right) => Number(right.payoutAmount || right.revenueGenerated || 0) - Number(left.payoutAmount || left.revenueGenerated || 0))[0]
  const percent = grossRevenue ? (totalPayouts / grossRevenue) * 100 : 0
  return (
    <Section title="Partner Revenue" subtitle="" icon={Users} action={<button type="button" className="text-sm font-semibold text-blue-700">View report</button>}>
      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="mx-auto flex h-48 w-48 items-center justify-center rounded-full bg-slate-100" style={{ background: `conic-gradient(#22c55e ${Math.min(100, percent)}%, #e2e8f0 0)` }}>
          <div className="flex h-32 w-32 flex-col items-center justify-center rounded-full bg-white text-center shadow-sm">
            <span className="text-xs font-semibold uppercase text-slate-500">Payouts</span>
            <strong className="mt-1 text-xl text-slate-950">{formatMoney(totalPayouts)}</strong>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <MetricCard label="Total Partner Payouts" value={formatMoney(totalPayouts)} trend="+0.0%" />
          <MetricCard label="Revenue Contribution" value={formatMoney(totalContribution)} trend="+0.0%" />
          <MetricCard label="Top Partner" value={topPartner?.partnerName || 'No data'} trend={`${topPartner?.applicationsSent || 0} applications`} />
          <MetricCard label="Growth" value={formatTrend(topPartner?.growth || '+0.0%')} trend="vs last month" />
        </div>
      </div>
    </Section>
  )
}

function BankRevenueCard({ rows = [], grossRevenue = 0 }) {
  return (
    <Section title="Bank Revenue" subtitle="" icon={Banknote} action={<button type="button" className="text-sm font-semibold text-blue-700">View report</button>}>
      <div className="space-y-3">
        {rows.length ? rows.slice(0, 6).map((row) => {
          const share = grossRevenue ? (Number(row.grossCommission || row.revenue || 0) / grossRevenue) * 100 : 0
          return (
            <article key={row.id || row.bank} className="grid gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 sm:grid-cols-[minmax(0,1fr)_90px_140px_90px] sm:items-center">
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-950">{row.bank}</p>
                <p className="mt-1 text-xs text-slate-500">{row.applications} applications</p>
              </div>
              <p className="text-sm font-semibold text-slate-700">{row.applications}</p>
              <p className="text-sm font-semibold text-slate-950">{formatMoney(row.grossCommission || row.revenue)}</p>
              <p className="text-sm font-semibold text-slate-500">{formatPercent(share)}</p>
            </article>
          )
        }) : (
          <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">Configured bank revenue will appear once bank-linked applications generate revenue.</p>
        )}
      </div>
    </Section>
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
  const grossRevenue = Number(dashboard?.kpis?.grossCommissionReceived?.value || dashboard?.summary?.grossCommissionReceived || 0)
  const topConsultant = dashboard?.rankings?.topRevenueConsultant || dashboard?.consultantEarnings?.[0] || null
  const topAgency = (dashboard?.partnerRevenue || []).find((row) => ['agency', 'agent', 'partner_referral'].includes(normalizeText(row.partnerType).toLowerCase())) || dashboard?.rankings?.topRevenuePartner || null
  const topDeveloper = (dashboard?.partnerRevenue || []).find((row) => normalizeText(row.partnerType).toLowerCase() === 'developer') || null
  const topBank = dashboard?.rankings?.mostProfitableBank || dashboard?.bankRevenue?.[0] || null
  const consultantSummary = {
    earningsThisMonth: (dashboard?.consultantEarnings || []).reduce((total, row) => total + Number(row.commissionEarned || 0), 0),
    payableBalance: (dashboard?.consultantEarnings || []).reduce((total, row) => total + Number(row.commissionOutstanding || 0), 0),
    paidThisMonth: (dashboard?.consultantEarnings || []).reduce((total, row) => total + Number(row.commissionPaid || 0), 0),
    topEarner: [...(dashboard?.consultantEarnings || [])].sort((left, right) => Number(right.commissionEarned || 0) - Number(left.commissionEarned || 0))[0] || null,
  }

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
          <h1 className="text-2xl font-semibold text-slate-950">Commercial Control Centre</h1>
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
            <h1 className="text-3xl font-semibold tracking-normal text-slate-950">Commercial Control Centre</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <PageButton icon={Clock3}>This Month</PageButton>
            <PageButton icon={Filter}>Filters</PageButton>
            <PageButton icon={Download} onClick={exportPortfolio}>Export</PageButton>
            <PageButton icon={RefreshCw} primary onClick={refresh}>Refresh</PageButton>
          </div>
        </header>

        {notice ? <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">{notice}</p> : null}

        <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          <MetricCard label="Gross Revenue" value={formatMoney(dashboard.kpis.grossCommissionReceived.value, '—')} trend={dashboard.kpis.grossCommissionReceived.trend} icon={Banknote} restricted={dashboard.kpis.grossCommissionReceived.value === null} />
          <MetricCard label="Consultant Commissions" value={formatMoney(dashboard.kpis.consultantCommissions.value)} trend={dashboard.kpis.consultantCommissions.trend} icon={Users} />
          <MetricCard label="Partner Payouts" value={formatMoney(dashboard.kpis.partnerPayouts.value, '—')} trend={dashboard.kpis.partnerPayouts.trend} icon={ReceiptText} restricted={dashboard.kpis.partnerPayouts.value === null} />
          <MetricCard label="Net Profit" value={formatMoney(dashboard.kpis.netProfit.value, '—')} trend={dashboard.kpis.netProfit.trend} icon={Gauge} restricted={!canViewProfit} />
          <MetricCard label="Pending Payouts" value={formatMoney(dashboard.kpis.pendingPayouts.value)} trend={dashboard.kpis.pendingPayouts.trend} icon={Wallet} />
          <MetricCard label="Margin %" value={formatPercent(dashboard.kpis.marginPercent.value)} trend={dashboard.kpis.marginPercent.trend} icon={ShieldCheck} restricted={!canViewProfit} />
        </section>

        <Section title="Revenue Flow" subtitle="" icon={LineChart}>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            {dashboard.revenueFlow.nodes.map((node, index) => (
              <FlowNode key={node.key} node={node} isLast={index === dashboard.revenueFlow.nodes.length - 1} restricted={!canViewProfit} flow={dashboard.revenueFlow} />
            ))}
          </div>
          <div className="mt-5 grid gap-3 border-t border-slate-200 pt-5 text-sm sm:grid-cols-3">
            <p><span className="font-semibold text-slate-900">Avg Originator Rate:</span> <span className="text-slate-500">{formatPercent(dashboard.revenueFlow.rates.averageOriginatorRate)}</span></p>
            <p><span className="font-semibold text-slate-900">Avg Consultant Split:</span> <span className="text-slate-500">{formatPercent(dashboard.revenueFlow.rates.averageConsultantSplit)}</span></p>
            <p><span className="font-semibold text-slate-900">Avg Partner Rate:</span> <span className="text-slate-500">{formatPercent(dashboard.revenueFlow.rates.averagePartnerRate)}</span></p>
          </div>
        </Section>

        <Section
          title="Commission Rules Engine"
          subtitle="Active commission rules used for revenue allocation, consultant splits and partner payouts."
          icon={ReceiptText}
          action={canManageCommissionRules ? <PageButton icon={Plus} primary onClick={() => openCommissionRuleEditor()}>Manage Rules</PageButton> : null}
        >
          <DataTable
            rows={dashboard.commissionRules}
            emptyTitle="No commission rules configured."
            emptyDescription="Add originator, consultant and partner commission rules to start calculating revenue automatically."
            columns={[
              { key: 'partyType', label: 'Applies To', render: (row) => formatPartyType(row.partyType) },
              { key: 'partyName', label: 'Partner / Role', render: (row) => row.partyName || row.name || 'Default rule' },
              { key: 'calculationBasis', label: 'Calculation Basis', render: (row) => formatBasis(row.calculationBasis) },
              { key: 'originatorShare', label: 'Originator Share', render: (row) => ruleShareCells(row).originator },
              { key: 'partnerShare', label: 'Partner Share', render: (row) => ruleShareCells(row).partner },
              { key: 'consultantShare', label: 'Consultant Share', render: (row) => ruleShareCells(row).consultant },
              { key: 'status', label: 'Status', render: (row) => <StatusPill status={row.status} /> },
            ]}
          />
          {dashboard.hasConfiguredCommissionRules ? null : (
            <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-500 ring-1 ring-slate-200">
              Default calculation rules are being used until organisation-specific commission rules are configured.
            </p>
          )}
        </Section>

        <Section title="Commercial Leaderboards" subtitle="Top performers this month." icon={BarChart3} action={<button type="button" className="text-sm font-semibold text-blue-700">View all leaderboards</button>}>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            <LeaderboardCard title="Top Consultant" row={topConsultant} nameKey="name" revenueKey="commissionEarned" growth={dashboard.kpis.consultantCommissions.trend} />
            <LeaderboardCard title="Top Agency" row={topAgency} nameKey="partnerName" revenueKey="revenueGenerated" growth={dashboard.kpis.partnerPayouts.trend} />
            <LeaderboardCard title="Top Developer" row={topDeveloper} nameKey="partnerName" revenueKey="revenueGenerated" growth={dashboard.kpis.partnerPayouts.trend} />
            <LeaderboardCard title="Top Bank" row={topBank} nameKey="bank" revenueKey="grossCommission" growth={dashboard.kpis.grossCommissionReceived.trend} />
          </div>
        </Section>

        <Section
          title="Revenue Attribution"
          subtitle="Where revenue originates across consultants, agencies, developers, internal share and adjustments."
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

        <Section title="Pipeline Forecast" subtitle="Weighted forecast based on application workflow stages." icon={LineChart}>
          <ForecastBars rows={primaryForecastRows} totalRow={totalForecastRow} />
          <div className="mt-6">
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
          </div>
        </Section>

        <Section
          title="Payout Centre"
          subtitle="Operational control for pending, approved, invoiced, paid and held payouts."
          icon={Wallet}
          action={<button type="button" className="text-sm font-semibold text-blue-700">View all payouts</button>}
        >
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
            emptyTitle={payoutTab === PAYOUT_STATUS_KEYS.readyToPay ? 'No payouts awaiting approval.' : 'No payouts in this status.'}
            emptyDescription={payoutTab === PAYOUT_STATUS_KEYS.readyToPay ? 'Payouts are automatically generated once applications reach Instruction Issued.' : 'Try another payout status tab.'}
            columns={[
              { key: 'application', label: 'Application', render: (row) => row.application || row.applicationId || 'Application pending' },
              { key: 'payeeName', label: 'Partner / Consultant', render: (row) => <div><p className="font-semibold text-slate-900">{row.payeeName || 'Payee pending'}</p><p className="text-xs text-slate-500">{formatPartyType(row.payeeType)}</p></div> },
              { key: 'amount', label: 'Amount', render: (row) => formatMoney(row.amount || row.partnerPayout || row.consultantCommission) },
              { key: 'type', label: 'Type', render: (row) => formatPartyType(row.payeeType) },
              { key: 'status', label: 'Status', render: (row) => <StatusPill status={row.status} /> },
              {
                key: 'actions',
                label: 'Actions',
                render: (row) => canManagePayouts ? (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => changePayout(row, PAYOUT_STATUSES.approved, 'Payout approved')} className="font-semibold text-slate-950 hover:underline">Approve</button>
                    <button type="button" onClick={() => changePayout(row, PAYOUT_STATUSES.invoiced, 'Invoice generated')} className="font-semibold text-slate-950 hover:underline">Generate Invoice</button>
                    <button type="button" onClick={() => changePayout(row, PAYOUT_STATUSES.paid, 'Payout marked paid')} className="font-semibold text-slate-950 hover:underline">Mark Paid</button>
                  </div>
                ) : <span className="text-slate-400">View</span>,
              },
            ]}
          />
        </Section>

        <div className="grid gap-8 xl:grid-cols-2">
          <PartnerRevenueCard rows={dashboard.partnerRevenue} grossRevenue={grossRevenue} />
          <BankRevenueCard rows={dashboard.bankRevenue} grossRevenue={grossRevenue} />
        </div>

        <Section title="Consultant Earnings" subtitle="Commission statements and payable balances." icon={FileSpreadsheet} action={<button type="button" className="text-sm font-semibold text-blue-700">View all statements</button>}>
          <div className="mb-6 grid gap-4 md:grid-cols-4">
            <MetricCard label="Earnings This Month" value={formatMoney(consultantSummary.earningsThisMonth)} trend={dashboard.kpis.consultantCommissions.trend} />
            <MetricCard label="Payable Balance" value={formatMoney(consultantSummary.payableBalance)} trend={`${dashboard.consultantEarnings.length} consultants`} />
            <MetricCard label="Paid This Month" value={formatMoney(consultantSummary.paidThisMonth)} trend={`${payoutCentre.tabs.find((tab) => tab.key === PAYOUT_STATUS_KEYS.paid)?.count || 0} payouts`} />
            <MetricCard label="Top Earner" value={consultantSummary.topEarner?.name || 'No data'} trend={consultantSummary.topEarner ? formatMoney(consultantSummary.topEarner.commissionEarned) : 'No earnings'} />
          </div>
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
