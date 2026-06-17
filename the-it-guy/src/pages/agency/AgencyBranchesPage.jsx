import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowRightLeft,
  ArrowUpRight,
  Banknote,
  Building2,
  CheckCircle2,
  Clock3,
  Filter,
  Gauge,
  MapPin,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Trophy,
  UserRound,
  Users,
} from 'lucide-react'
import { createElement, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../../components/ui/Button'
import Field from '../../components/ui/Field'
import Modal from '../../components/ui/Modal'
import { createBranch, getBranches } from '../../services/agencyBranchService'

const PERFORMANCE_FILTERS = [
  { key: 'all', label: 'All Branches' },
]

function normalizeText(value) {
  return String(value || '').trim()
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function getValidDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return 'R 0'
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(amount)
}

function formatCompactCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return 'R 0'
  if (amount >= 1000000000) return `R ${(amount / 1000000000).toFixed(1).replace(/\.0$/, '')}bn`
  if (amount >= 1000000) return `R ${(amount / 1000000).toFixed(1).replace(/\.0$/, '')}m`
  if (amount >= 1000) return `R ${(amount / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return formatCurrency(amount)
}

function formatPercent(value) {
  const numeric = Number(value || 0)
  if (!Number.isFinite(numeric)) return '0%'
  return `${Math.round(numeric * 10) / 10}%`
}

function getInitials(value = '') {
  const parts = normalizeText(value).split(/\s+/).filter(Boolean)
  if (!parts.length) return 'BR'
  return parts.slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase()
}

function isThisMonth(value) {
  const date = getValidDate(value)
  if (!date) return false
  const now = new Date()
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
}

function getMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function getRecentMonthKeys(count = 6) {
  const keys = []
  const cursor = new Date()
  cursor.setDate(1)
  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(cursor.getFullYear(), cursor.getMonth() - index, 1)
    keys.push(getMonthKey(date))
  }
  return keys
}

function buildMonthlySeries(rows = [], valueGetter = () => 1) {
  const keys = getRecentMonthKeys(6)
  const bucket = new Map(keys.map((key) => [key, 0]))
  for (const row of rows) {
    const date = getValidDate(row?.created_at || row?.createdAt || row?.updated_at || row?.updatedAt)
    if (!date) continue
    const key = getMonthKey(date)
    if (!bucket.has(key)) continue
    bucket.set(key, bucket.get(key) + Math.max(0, toNumber(valueGetter(row))))
  }
  const values = keys.map((key) => bucket.get(key) || 0)
  return values.some((value) => value > 0) ? values : [1, 1, 1, 1, 1, 1]
}

function calculateMonthDelta(rows = [], valueGetter = () => 1) {
  const now = new Date()
  const currentKey = getMonthKey(now)
  const previousKey = getMonthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1))
  let current = 0
  let previous = 0

  for (const row of rows) {
    const date = getValidDate(row?.created_at || row?.createdAt || row?.updated_at || row?.updatedAt)
    if (!date) continue
    const value = Math.max(0, toNumber(valueGetter(row)))
    const key = getMonthKey(date)
    if (key === currentKey) current += value
    if (key === previousKey) previous += value
  }

  if (!current && !previous) return 0
  if (!previous) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 100)
}

function getLatestActivityDate(branch = {}) {
  const dates = [
    branch.updatedAt,
    branch.createdAt,
    ...(branch.members || []).map((row) => row.updated_at || row.created_at),
    ...(branch.transactions || []).map((row) => row.updated_at || row.created_at),
    ...(branch.listings || []).map((row) => row.updated_at || row.created_at),
    ...(branch.leads || []).map((row) => row.updated_at || row.created_at),
  ]
    .map(getValidDate)
    .filter(Boolean)

  if (!dates.length) return null
  return dates.sort((left, right) => right.getTime() - left.getTime())[0]
}

function getDaysSince(date) {
  if (!date) return 999
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000))
}

function getHealthStatus(score, isActive = true) {
  if (!isActive) return { label: 'Inactive', tone: 'slate' }
  if (score >= 90) return { label: 'Excellent', tone: 'green' }
  if (score >= 75) return { label: 'Good', tone: 'green' }
  if (score >= 60) return { label: 'Fair', tone: 'gold' }
  if (score >= 45) return { label: 'Needs Attention', tone: 'orange' }
  if (score >= 25) return { label: 'Poor', tone: 'red' }
  return { label: 'Critical', tone: 'red' }
}

function deriveBranchHealth(branch = {}, maxPipeline = 0) {
  if (branch?.isActive === false) {
    return { score: 0, label: 'Inactive', tone: 'slate', needsAttention: true }
  }

  const kpis = branch.kpis || {}
  const pipelineValue = toNumber(kpis.pipelineValue)
  const latestActivity = getLatestActivityDate(branch)
  const daysSinceActivity = getDaysSince(latestActivity)
  const activityScore = daysSinceActivity <= 30 ? 10 : daysSinceActivity <= 90 ? 6 : 2
  const pipelineScore = maxPipeline > 0 ? Math.min(pipelineValue / maxPipeline, 1) * 28 : 0
  const agentScore = Math.min(toNumber(kpis.activeAgents) / 3, 1) * 18
  const listingScore = Math.min(toNumber(kpis.activeListings) / 6, 1) * 16
  const transactionScore = Math.min(toNumber(kpis.activeTransactions) / 5, 1) * 18
  const conversionScore = Math.min(toNumber(kpis.conversionRate) / 25, 1) * 10
  const score = Math.max(0, Math.min(100, Math.round(pipelineScore + agentScore + listingScore + transactionScore + conversionScore + activityScore)))
  const status = getHealthStatus(score, true)

  return {
    score,
    ...status,
    needsAttention: score < 60 || toNumber(kpis.activeAgents) === 0 || (toNumber(kpis.activeListings) === 0 && toNumber(kpis.activeTransactions) === 0),
  }
}

function buildBranchTrend(branch = {}) {
  const activityRows = [
    ...(branch.transactions || []).map((row) => ({ ...row, trendValue: toNumber(row.sales_price || row.purchase_price) })),
    ...(branch.listings || []).map((row) => ({ ...row, trendValue: toNumber(row.asking_price) })),
    ...(branch.leads || []).map((row) => ({ ...row, trendValue: toNumber(row.estimated_value || row.budget) })),
  ]
  return buildMonthlySeries(activityRows, (row) => row.trendValue || 1)
}

function getTrendTone(delta) {
  if (delta > 0) return 'text-[#0f9f5f]'
  if (delta < 0) return 'text-[#d14343]'
  return 'text-[#7b8ca2]'
}

function MiniSparkline({ values = [], tone = 'blue' }) {
  const safeValues = values.length ? values : [1, 1, 1, 1, 1, 1]
  const max = Math.max(...safeValues, 1)
  const min = Math.min(...safeValues, 0)
  const range = Math.max(max - min, 1)
  const points = safeValues.map((value, index) => {
    const x = safeValues.length === 1 ? 100 : (index / (safeValues.length - 1)) * 100
    const y = 40 - ((value - min) / range) * 34 + 3
    return `${x},${y}`
  }).join(' ')
  const stroke = {
    blue: '#2874dc',
    green: '#12a05c',
    gold: '#f59e0b',
    red: '#d14343',
    slate: '#7b8ca2',
    purple: '#7c3aed',
  }[tone] || '#2874dc'

  return (
    <svg viewBox="0 0 100 46" className="h-10 w-24 overflow-visible" aria-hidden="true" focusable="false">
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function TrendLabel({ value, suffix = 'MoM' }) {
  const numeric = Number(value || 0)
  const Icon = numeric < 0 ? ArrowDownRight : ArrowUpRight
  return (
    <span className={`inline-flex items-center gap-1 text-[0.78rem] font-semibold ${getTrendTone(numeric)}`}>
      <Icon size={14} />
      {numeric > 0 ? '+' : ''}{numeric}% {suffix}
    </span>
  )
}

function ExecutiveKpiCard({ label, value, context, icon, tone = 'blue', trendValues = [], trend = null }) {
  const toneClass = {
    blue: 'bg-[#edf5ff] text-[#1769d1]',
    green: 'bg-[#edfdf3] text-[#0f8f52]',
    purple: 'bg-[#f4f0ff] text-[#7046d6]',
    gold: 'bg-[#fff7e8] text-[#b7791f]',
    slate: 'bg-[#f3f6fa] text-[#4d6178]',
  }[tone] || 'bg-[#edf5ff] text-[#1769d1]'

  return (
    <article className="min-w-0 rounded-[18px] border border-[#dfe7f1] bg-white px-4 py-4 shadow-[0_12px_28px_rgba(15,35,55,0.055)]">
      <div className="flex items-start justify-between gap-3">
        <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] ${toneClass}`}>
          {icon ? createElement(icon, { size: 18 }) : null}
        </span>
        <MiniSparkline values={trendValues} tone={tone} />
      </div>
      <p className="mt-3 text-[0.68rem] font-semibold uppercase tracking-[0.13em] text-[#74879e]">{label}</p>
      <strong className="mt-1 block truncate text-[1.75rem] font-semibold leading-none tracking-[-0.045em] text-[#0f2135] tabular-nums">{value}</strong>
      <div className="mt-2 flex min-h-[20px] items-center gap-2 text-[0.78rem] font-medium text-[#62778f]">
        {trend !== null ? <TrendLabel value={trend} suffix="this month" /> : <span>{context}</span>}
      </div>
    </article>
  )
}

function StatusBadge({ children, tone = 'slate' }) {
  const toneClass = {
    green: 'border-[#ccebd8] bg-[#edfdf3] text-[#167444]',
    blue: 'border-[#cfe0ff] bg-[#edf5ff] text-[#1f63c4]',
    gold: 'border-[#f7dda5] bg-[#fff8e8] text-[#a16207]',
    orange: 'border-[#fed7aa] bg-[#fff7ed] text-[#c05621]',
    red: 'border-[#f8c7c7] bg-[#fff4f4] text-[#c23434]',
    slate: 'border-[#dbe4ee] bg-[#f7f9fc] text-[#5f7186]',
  }[tone] || 'border-[#dbe4ee] bg-[#f7f9fc] text-[#5f7186]'

  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${toneClass}`}>{children}</span>
}

function HealthRing({ score, label, size = 'lg' }) {
  const value = Math.max(0, Math.min(100, Number(score || 0)))
  const dimensionClass = size === 'sm' ? 'h-16 w-16' : size === 'md' ? 'h-20 w-20' : 'h-24 w-24'
  const labelClass = size === 'sm' ? 'text-[1.05rem]' : size === 'md' ? 'text-[1.45rem]' : 'text-[1.8rem]'
  const color = value >= 75 ? '#1fb86a' : value >= 60 ? '#f59e0b' : value >= 45 ? '#f97316' : '#ef4444'

  return (
    <div
      className={`grid shrink-0 place-items-center rounded-full ${dimensionClass}`}
      style={{ background: `conic-gradient(${color} ${value * 3.6}deg, #edf2f7 0deg)` }}
      aria-label={`${value} health score`}
    >
      <div className="grid h-[78%] w-[78%] place-items-center rounded-full bg-white text-center shadow-[inset_0_0_0_1px_rgba(216,226,238,0.75)]">
        <div>
          <strong className={`block font-semibold leading-none tracking-[-0.05em] text-[#102236] tabular-nums ${labelClass}`}>{value}</strong>
          {label ? <span className="mt-1 block text-[0.62rem] font-semibold text-[#17814d]">{label}</span> : null}
        </div>
      </div>
    </div>
  )
}

function BranchKpiTile({ label, value, trend = null }) {
  return (
    <article className="min-w-0 border-r border-[#e7edf5] px-3 py-1 last:border-r-0">
      <span className="block text-[0.64rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">{label}</span>
      <strong className="mt-1 block truncate text-[1.05rem] font-semibold tracking-[-0.03em] text-[#142132] tabular-nums">{value}</strong>
      <span className={`mt-1 inline-flex items-center gap-1 text-[0.72rem] font-semibold ${trend === null ? 'text-[#8aa0b5]' : getTrendTone(trend)}`}>
        {trend === null ? '-' : (
          <>
            {trend < 0 ? <ArrowDownRight size={12} /> : <ArrowUpRight size={12} />}
            {trend > 0 ? '+' : ''}{trend}%
          </>
        )}
      </span>
    </article>
  )
}

function PrincipalAvatar({ name }) {
  return (
    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#102236] text-sm font-semibold text-white shadow-[0_8px_18px_rgba(16,34,54,0.18)]">
      {getInitials(name)}
    </span>
  )
}

function RankingTable({ rows, onOpenBranch }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[640px] w-full text-left text-sm">
        <thead>
          <tr className="border-b border-[#e6edf5] text-[0.64rem] font-semibold uppercase tracking-[0.13em] text-[#7b8ca2]">
            <th className="px-3 py-3">Rank</th>
            <th className="px-3 py-3">Branch</th>
            <th className="px-3 py-3">Pipeline</th>
            <th className="px-3 py-3">Transactions</th>
            <th className="px-3 py-3">Agents</th>
            <th className="px-3 py-3">Trend</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#eef3f8]">
          {rows.map((branch) => (
            <tr key={branch.id} className="cursor-pointer transition hover:bg-[#f8fbff]" onClick={() => onOpenBranch(branch.id)}>
              <td className="px-3 py-4 text-xs font-semibold text-[#687b91]">#{branch.rank}</td>
              <td className="px-3 py-4">
                <p className="font-semibold text-[#142132]">{branch.name}</p>
                <p className="mt-1 text-xs text-[#70859a]">{branch.location}</p>
              </td>
              <td className="px-3 py-4 font-semibold text-[#142132]">{formatCompactCurrency(branch.kpis.pipelineValue)}</td>
              <td className="px-3 py-4 text-[#20364d]">{branch.kpis.activeTransactions}</td>
              <td className="px-3 py-4 text-[#20364d]">{branch.kpis.activeAgents}</td>
              <td className="px-3 py-4">
                <MiniSparkline values={branch.trendValues} tone={branch.health.tone === 'red' ? 'red' : 'green'} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function BranchHealthList({ rows, onOpenBranch }) {
  return (
    <div className="space-y-3">
      {rows.map((branch) => (
        <button
          type="button"
          key={branch.id}
          onClick={() => onOpenBranch(branch.id)}
          className="w-full rounded-[14px] border border-[#e4ebf3] bg-white px-3 py-3 text-left transition hover:border-[#c9d9e8] hover:bg-[#fbfdff]"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-sm font-semibold text-[#162334]">{branch.name}</span>
            <span className="shrink-0 text-sm font-semibold text-[#162334] tabular-nums">{branch.health.score}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#edf2f7]">
            <div
              className={`h-full rounded-full ${branch.health.tone === 'green' ? 'bg-[#19aa61]' : branch.health.tone === 'gold' ? 'bg-[#f59e0b]' : branch.health.tone === 'orange' ? 'bg-[#f97316]' : branch.health.tone === 'red' ? 'bg-[#ef4444]' : 'bg-[#94a3b8]'}`}
              style={{ width: `${Math.max(branch.health.score, 3)}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-[#6d8299]">{branch.health.label}</span>
            {branch.health.needsAttention ? <StatusBadge tone="red">Attention</StatusBadge> : <StatusBadge tone="green">On track</StatusBadge>}
          </div>
        </button>
      ))}
    </div>
  )
}

function NewBranchModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '',
    city: '',
    province: '',
    address: '',
    managerName: '',
    email: '',
    phone: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) {
      setForm({ name: '', city: '', province: '', address: '', managerName: '', email: '', phone: '' })
      setSaving(false)
      setError('')
    }
  }, [open])

  async function handleCreate() {
    setSaving(true)
    setError('')
    try {
      const created = await createBranch(form)
      if (typeof onCreated === 'function') {
        onCreated(created)
      }
      onClose?.()
    } catch (creationError) {
      setError(creationError?.message || 'Unable to create branch right now.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create New Branch"
      subtitle="Add a new office, franchise, or team branch to your agency structure."
      footer={(
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={handleCreate} disabled={saving}>{saving ? 'Creating…' : 'Create Branch'}</Button>
        </div>
      )}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1.5 md:col-span-2">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Branch Name</span>
          <Field value={form.name} onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))} placeholder="e.g. Samlin Realty — Bartlett" />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">City</span>
          <Field value={form.city} onChange={(event) => setForm((previous) => ({ ...previous, city: event.target.value }))} placeholder="e.g. Boksburg" />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Province</span>
          <Field value={form.province} onChange={(event) => setForm((previous) => ({ ...previous, province: event.target.value }))} placeholder="e.g. Gauteng" />
        </label>
        <label className="grid gap-1.5 md:col-span-2">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Address</span>
          <Field value={form.address} onChange={(event) => setForm((previous) => ({ ...previous, address: event.target.value }))} placeholder="Street address" />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Principal / Manager</span>
          <Field value={form.managerName} onChange={(event) => setForm((previous) => ({ ...previous, managerName: event.target.value }))} placeholder="Name" />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Branch Email</span>
          <Field type="email" value={form.email} onChange={(event) => setForm((previous) => ({ ...previous, email: event.target.value }))} placeholder="branch@agency.com" />
        </label>
        <label className="grid gap-1.5 md:col-span-2">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Branch Phone</span>
          <Field value={form.phone} onChange={(event) => setForm((previous) => ({ ...previous, phone: event.target.value }))} placeholder="Contact number" />
        </label>
      </div>
      {error ? <p className="mt-4 rounded-[12px] border border-[#f2d7d7] bg-[#fff6f6] px-3 py-2 text-sm text-[#b42318]">{error}</p> : null}
    </Modal>
  )
}

export default function AgencyBranchesPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [organisationFilter, setOrganisationFilter] = useState('all')
  const [provinceFilter, setProvinceFilter] = useState('all')
  const [performanceFilter, setPerformanceFilter] = useState('all')
  const [showCreateModal, setShowCreateModal] = useState(false)

  const loadBranches = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const branchRows = await getBranches()
      setRows(branchRows)
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load branches right now.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadBranches()
  }, [loadBranches])

  const organisationOptions = useMemo(() => {
    const map = new Map()
    for (const row of rows) {
      const id = normalizeText(row?.organisationId)
      if (!id) continue
      if (!map.has(id)) {
        map.set(id, id)
      }
    }
    return [...map.entries()].map(([id, label]) => ({ id, label }))
  }, [rows])

  const provinceOptions = useMemo(() => {
    const values = [...new Set(rows.map((row) => normalizeText(row?.province)).filter(Boolean))]
    return values.sort((left, right) => left.localeCompare(right))
  }, [rows])

  const enrichedRows = useMemo(() => {
    const maxPipeline = rows.reduce((max, row) => Math.max(max, toNumber(row?.kpis?.pipelineValue)), 0)
    const mapped = rows.map((branch) => {
      const trendValues = buildBranchTrend(branch)
      return {
        ...branch,
        trendValues,
        health: deriveBranchHealth(branch, maxPipeline),
        pipelineDelta: calculateMonthDelta(branch.transactions || [], (row) => toNumber(row.sales_price || row.purchase_price)),
        listingDelta: calculateMonthDelta(branch.listings || []),
        transactionDelta: calculateMonthDelta(branch.transactions || []),
        agentDelta: calculateMonthDelta(branch.members || []),
      }
    })

    return [...mapped]
      .sort((left, right) =>
        toNumber(right?.kpis?.pipelineValue) - toNumber(left?.kpis?.pipelineValue) ||
        toNumber(right?.kpis?.activeTransactions) - toNumber(left?.kpis?.activeTransactions) ||
        toNumber(right?.kpis?.activeListings) - toNumber(left?.kpis?.activeListings) ||
        left.name.localeCompare(right.name),
      )
      .map((branch, index) => ({ ...branch, rank: index + 1 }))
  }, [rows])

  const network = useMemo(() => {
    const branches = enrichedRows
    const transactions = branches.flatMap((branch) => branch.transactions || [])
    const listings = branches.flatMap((branch) => branch.listings || [])
    const leads = branches.flatMap((branch) => branch.leads || [])
    const members = branches.flatMap((branch) => branch.members || [])
    const activeBranches = branches.filter((row) => row?.isActive !== false).length
    const activeAgents = branches.reduce((sum, row) => sum + toNumber(row?.kpis?.activeAgents), 0)
    const activeTransactions = branches.reduce((sum, row) => sum + toNumber(row?.kpis?.activeTransactions), 0)
    const pipelineValue = branches.reduce((sum, row) => sum + toNumber(row?.kpis?.pipelineValue), 0)
    const registeredDeals = branches.reduce((sum, row) => sum + toNumber(row?.kpis?.registeredDeals), 0)
    const conversionRate = leads.length ? (registeredDeals / leads.length) * 100 : 0
    const listingCycleRows = listings
      .map((listing) => {
        const start = getValidDate(listing.created_at || listing.createdAt)
        const end = getValidDate(listing.updated_at || listing.updatedAt)
        if (!start || !end || end < start) return null
        return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000))
      })
      .filter((value) => Number.isFinite(value))
    const avgListingDays = listingCycleRows.length
      ? Math.round(listingCycleRows.reduce((sum, value) => sum + value, 0) / listingCycleRows.length)
      : 0
    const avgHealth = branches.length
      ? Math.round(branches.reduce((sum, row) => sum + toNumber(row.health?.score), 0) / branches.length)
      : 0
    const agencyHealth = Math.round(Math.min(100, (avgHealth * 0.72) + (activeBranches ? 10 : 0) + (activeAgents ? 10 : 0) + (activeTransactions ? 8 : 0)))
    const topBranches = branches.filter((row) => row.health.score >= 75).length
    const stableBranches = branches.filter((row) => row.health.score >= 60 && row.health.score < 75).length
    const attentionBranches = branches.filter((row) => row.health.needsAttention).length

    return {
      activeBranches,
      activeAgents,
      activeTransactions,
      pipelineValue,
      conversionRate,
      avgListingDays,
      agencyHealth,
      topBranches,
      stableBranches,
      attentionBranches,
      branchGrowth: rows.filter((row) => isThisMonth(row.createdAt)).length,
      agentGrowth: members.filter((row) => isThisMonth(row.created_at || row.createdAt)).length,
      transactionGrowth: transactions.filter((row) => isThisMonth(row.created_at || row.createdAt)).length,
      pipelineTrend: calculateMonthDelta(transactions, (row) => toNumber(row.sales_price || row.purchase_price)),
      conversionTrend: calculateMonthDelta(leads),
      listingTimeTrend: -calculateMonthDelta(listings),
      branchTrendValues: buildMonthlySeries(rows),
      agentTrendValues: buildMonthlySeries(members),
      transactionTrendValues: buildMonthlySeries(transactions),
      pipelineTrendValues: buildMonthlySeries(transactions, (row) => toNumber(row.sales_price || row.purchase_price)),
      conversionTrendValues: buildMonthlySeries(leads),
      listingTimeTrendValues: buildMonthlySeries(listings),
    }
  }, [enrichedRows, rows])

  const topBranch = enrichedRows[0] || null
  const attentionBranch = useMemo(() => {
    return [...enrichedRows]
      .filter((row) => row.health?.needsAttention)
      .sort((left, right) => toNumber(left.health?.score) - toNumber(right.health?.score))[0] || null
  }, [enrichedRows])

  const filteredRows = useMemo(() => {
    const query = normalizeText(searchTerm).toLowerCase()
    return enrichedRows.filter((row) => {
      const organisationMatch = organisationFilter === 'all' ? true : normalizeText(row?.organisationId) === organisationFilter
      const provinceMatch = provinceFilter === 'all' ? true : normalizeText(row?.province).toLowerCase() === provinceFilter.toLowerCase()
      const performanceMatch =
        performanceFilter === 'all' ||
        (performanceFilter === 'top' && row.health.score >= 75) ||
        (performanceFilter === 'stable' && row.health.score >= 60 && row.health.score < 75) ||
        (performanceFilter === 'attention' && row.health.needsAttention)
      const searchMatch = !query
        ? true
        : `${row?.name || ''} ${row?.city || ''} ${row?.province || ''} ${row?.principalName || ''}`.toLowerCase().includes(query)
      return organisationMatch && provinceMatch && performanceMatch && searchMatch
    })
  }, [enrichedRows, organisationFilter, performanceFilter, provinceFilter, searchTerm])

  function openBranch(branchId) {
    navigate(`/agency/branches/${branchId}`)
  }

  function openManageAgents(branchId) {
    navigate('/agency/agents', { state: { branchId } })
  }

  function openPrincipalManagerInvite() {
    navigate('/settings/users', {
      state: {
        openInvite: true,
        inviteIntent: 'residential_principal_manager',
        inviteRole: 'principal',
        inviteSource: 'residential_branches_principal_manager_invite',
      },
    })
  }

  return (
    <section className="flex flex-col gap-5 pb-8">
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={openPrincipalManagerInvite}>
          <Users size={16} />Invite Principal / Manager
        </Button>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus size={16} />New Branch
        </Button>
      </div>

      {error ? <p className="rounded-[16px] border border-[#f3d2cc] bg-[#fef3f2] px-5 py-4 text-sm text-[#b42318]">{error}</p> : null}
      {loading ? <p className="rounded-[16px] border border-[#dde4ee] bg-white px-5 py-4 text-sm text-[#6b7d93]">Loading branch performance...</p> : null}

      {!loading ? (
        <>
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6" aria-label="Executive branch metrics">
            <ExecutiveKpiCard label="Branches" value={network.activeBranches} context="Active branches" icon={Building2} tone="blue" trend={network.branchGrowth} trendValues={network.branchTrendValues} />
            <ExecutiveKpiCard label="Agents" value={network.activeAgents} context="Active agents" icon={Users} tone="purple" trend={network.agentGrowth} trendValues={network.agentTrendValues} />
            <ExecutiveKpiCard label="Transactions" value={network.activeTransactions} context="Active transactions" icon={ArrowRightLeft} tone="green" trend={network.transactionGrowth} trendValues={network.transactionTrendValues} />
            <ExecutiveKpiCard label="Pipeline Value" value={formatCompactCurrency(network.pipelineValue)} context="Total pipeline" icon={Banknote} tone="gold" trend={network.pipelineTrend} trendValues={network.pipelineTrendValues} />
            <ExecutiveKpiCard label="Conversion Rate" value={formatPercent(network.conversionRate)} context="Network conversion" icon={Gauge} tone="blue" trend={network.conversionTrend} trendValues={network.conversionTrendValues} />
            <ExecutiveKpiCard label="Avg Listing Time" value={network.avgListingDays ? `${network.avgListingDays} Days` : 'No cycle'} context="Lead to live" icon={Clock3} tone="slate" trend={network.listingTimeTrend} trendValues={network.listingTimeTrendValues} />
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
            <article className="rounded-[20px] border border-[#cfeedd] bg-[#f7fffb] p-5 shadow-[0_14px_34px_rgba(17,94,89,0.07)]">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="inline-flex items-center gap-2 text-[0.72rem] font-semibold uppercase tracking-[0.13em] text-[#09864f]"><Trophy size={15} />Top Performing Branch</p>
                  <h2 className="mt-4 text-[1.18rem] font-semibold tracking-[-0.03em] text-[#0f3428]">{topBranch?.name || 'No branch data yet'}</h2>
                  <p className="mt-2 text-[1rem] font-semibold text-[#123427]">{formatCompactCurrency(topBranch?.kpis?.pipelineValue)} Pipeline</p>
                  <div className="mt-2"><TrendLabel value={topBranch?.pipelineDelta || 0} suffix="vs last month" /></div>
                </div>
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[#fff8e8] text-[#d89412] shadow-[inset_0_0_0_1px_rgba(245,158,11,0.24)]">
                  <Trophy size={26} />
                </span>
              </div>
              <Button size="sm" variant="secondary" className="mt-5" onClick={() => topBranch && openBranch(topBranch.id)} disabled={!topBranch}>View Branch</Button>
            </article>

            <article className="rounded-[20px] border border-[#f3dfc6] bg-[#fffaf1] p-5 shadow-[0_14px_34px_rgba(146,64,14,0.07)]">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="inline-flex items-center gap-2 text-[0.72rem] font-semibold uppercase tracking-[0.13em] text-[#b45309]"><AlertTriangle size={15} />Attention Required</p>
                  <h2 className="mt-4 text-[1.18rem] font-semibold tracking-[-0.03em] text-[#102236]">{attentionBranch?.name || 'No branches need attention'}</h2>
                  <p className="mt-2 text-sm font-semibold text-[#24384e]">
                    {attentionBranch?.kpis?.activeAgents ? `${attentionBranch.kpis.activeAgents} active agents` : 'No active agents'}
                  </p>
                  <p className="mt-1 text-sm text-[#61758d]">{attentionBranch?.kpis?.activeListings || 0} listings • {attentionBranch?.kpis?.activeTransactions || 0} transactions</p>
                </div>
                <HealthRing score={attentionBranch?.health?.score || 0} size="sm" />
              </div>
              <Button size="sm" variant="secondary" className="mt-5 border-[#f4c5a6] text-[#8a3b12]" onClick={() => attentionBranch && openBranch(attentionBranch.id)} disabled={!attentionBranch}>Take Action</Button>
            </article>

            <article className="rounded-[20px] border border-[#cfe0ff] bg-[#f8fbff] p-5 shadow-[0_14px_34px_rgba(40,116,220,0.08)]">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <HealthRing score={network.agencyHealth} label={network.agencyHealth >= 75 ? 'Good' : network.agencyHealth >= 60 ? 'Fair' : 'Watch'} size="md" />
                <div className="min-w-0">
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.13em] text-[#2874dc]">Agency Health Score</p>
                  <h2 className="mt-2 text-[1rem] font-semibold text-[#102236]">{network.agencyHealth >= 75 ? 'Your network is performing well' : network.agencyHealth >= 60 ? 'Your network is stable' : 'Your network needs intervention'}</h2>
                  <div className="mt-3 grid gap-2 text-sm text-[#50667e]">
                    <span className="inline-flex items-center gap-2"><CheckCircle2 size={15} className="text-[#12a05c]" />{network.activeBranches} active branches</span>
                    <span className="inline-flex items-center gap-2"><CheckCircle2 size={15} className="text-[#12a05c]" />{network.activeAgents} active agents</span>
                    <span className="inline-flex items-center gap-2"><CheckCircle2 size={15} className="text-[#12a05c]" />{network.attentionBranches} branch{network.attentionBranches === 1 ? '' : 'es'} need attention</span>
                  </div>
                </div>
              </div>
            </article>
          </section>

          <section className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]">
            <article className="flex h-full flex-col rounded-[20px] border border-[#dfe7f1] bg-white p-5 shadow-[0_14px_32px_rgba(15,35,55,0.06)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.13em] text-[#7b8ca2]">Branch Performance</p>
                  <h2 className="mt-1 text-[1.12rem] font-semibold tracking-[-0.03em] text-[#102236]">Ranked by pipeline value</h2>
                </div>
                <StatusBadge tone="blue">{enrichedRows.length} branches</StatusBadge>
              </div>
              <div className="mt-4 flex-1">
                {enrichedRows.length ? <RankingTable rows={enrichedRows} onOpenBranch={openBranch} /> : (
                  <div className="rounded-[16px] border border-dashed border-[#d8e4f0] bg-[#fbfdff] p-8 text-center text-sm text-[#66758b]">No branch performance data yet.</div>
                )}
              </div>
              <Button variant="secondary" className="mt-4 w-full" onClick={() => navigate('/agency/analytics')}>View Full Analytics <ArrowRight size={15} /></Button>
            </article>

            <article className="flex h-full flex-col rounded-[20px] border border-[#dfe7f1] bg-white p-5 shadow-[0_14px_32px_rgba(15,35,55,0.06)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.13em] text-[#7b8ca2]">Branch Health</p>
                  <h2 className="mt-1 text-[1.12rem] font-semibold tracking-[-0.03em] text-[#102236]">Intervention order</h2>
                </div>
                <Gauge size={20} className="text-[#315f8f]" />
              </div>
              <div className="mt-4 flex-1">
                {enrichedRows.length ? (
                  <BranchHealthList rows={[...enrichedRows].sort((left, right) => left.health.score - right.health.score)} onOpenBranch={openBranch} />
                ) : (
                  <div className="rounded-[16px] border border-dashed border-[#d8e4f0] bg-[#fbfdff] p-8 text-center text-sm text-[#66758b]">Health scores will appear once branches exist.</div>
                )}
              </div>
            </article>
          </section>

          <section className="rounded-[20px] border border-[#dfe7f1] bg-white p-4 shadow-[0_14px_32px_rgba(15,35,55,0.06)]">
            <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
              <div className="flex min-w-0 flex-wrap gap-2">
                {PERFORMANCE_FILTERS.map((filter) => {
                  const count = filter.key === 'all'
                    ? enrichedRows.length
                    : filter.key === 'top'
                      ? network.topBranches
                      : filter.key === 'stable'
                        ? network.stableBranches
                        : network.attentionBranches
                  return (
                    <button
                      type="button"
                      key={filter.key}
                      onClick={() => setPerformanceFilter(filter.key)}
                      className={`rounded-[11px] border px-4 py-2 text-sm font-semibold transition ${performanceFilter === filter.key ? 'border-[#17324d] bg-[#17324d] text-white shadow-[0_10px_18px_rgba(23,50,77,0.16)]' : 'border-[#dce6f0] bg-white text-[#38536d] hover:bg-[#f7faff]'}`}
                    >
                      {filter.label} ({count})
                    </button>
                  )
                })}
              </div>

              <div className="grid min-w-0 gap-2 lg:grid-cols-[minmax(220px,1fr)_minmax(160px,0.6fr)_minmax(160px,0.6fr)_auto]">
                <label className="flex h-[42px] min-w-0 items-center gap-3 rounded-[12px] border border-[#dce6f0] bg-white px-3 shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
                  <Search size={16} className="shrink-0 text-[#8ca0b6]" />
                  <input
                    type="search"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search branches..."
                    className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-[#162334] outline-none placeholder:text-[#96a6b8]"
                  />
                </label>
                <Field as="select" value={provinceFilter} onChange={(event) => setProvinceFilter(event.target.value)} className="h-[42px]">
                  <option value="all">All Provinces</option>
                  {provinceOptions.map((province) => (
                    <option key={province} value={province}>{province}</option>
                  ))}
                </Field>
                <Field as="select" value={organisationFilter} onChange={(event) => setOrganisationFilter(event.target.value)} className="h-[42px]">
                  <option value="all">All Organisations</option>
                  {organisationOptions.map((item) => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                </Field>
                <Button variant="ghost" size="sm" onClick={loadBranches} disabled={loading}><RefreshCw size={15} />Refresh</Button>
              </div>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
            {!filteredRows.length ? (
              <div className="rounded-[20px] border border-dashed border-[#d7e1ec] bg-[#fbfdff] p-10 text-center xl:col-span-2 2xl:col-span-3">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-[16px] bg-[#edf5ff] text-[#315f8f]">
                  <Filter size={20} />
                </div>
                <h3 className="mt-4 text-[1.04rem] font-semibold text-[#1a2a3d]">No branches match these filters</h3>
                <p className="mt-2 text-sm text-[#66758b]">Widen the search or create a branch to start tracking network performance.</p>
                <div className="mt-4 flex justify-center">
                  <Button onClick={() => setShowCreateModal(true)}><Plus size={16} />New Branch</Button>
                </div>
              </div>
            ) : filteredRows.map((branch) => {
              const needsAttention = branch.health.needsAttention
              return (
                <article
                  key={branch.id}
                  className={`rounded-[20px] border bg-white p-5 shadow-[0_12px_30px_rgba(15,35,55,0.055)] transition duration-150 ease-out hover:-translate-y-[1px] hover:shadow-[0_18px_34px_rgba(15,35,55,0.08)] ${needsAttention ? 'border-[#f3c7c7] bg-[#fffafa]' : 'border-[#dfe7f1]'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-semibold ${branch.rank <= 3 ? 'bg-[#fff2d4] text-[#b7791f]' : 'bg-[#eef3f8] text-[#63758b]'}`}>#{branch.rank}</span>
                        <StatusBadge tone={branch.isActive ? 'green' : 'slate'}>{branch.isActive ? 'Active' : 'Suspended'}</StatusBadge>
                        {needsAttention ? <StatusBadge tone="red">Attention</StatusBadge> : null}
                      </div>
                      <h3 className="mt-3 truncate text-[1.05rem] font-semibold tracking-[-0.03em] text-[#142132]">{branch.name}</h3>
                      <p className="mt-1 inline-flex min-w-0 items-center gap-2 text-sm text-[#60758d]"><MapPin size={14} className="shrink-0" /><span className="truncate">{branch.location}</span></p>
                    </div>
                    <button type="button" className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] border border-[#dde6f0] bg-white text-[#60758d] transition hover:bg-[#f7faff]" aria-label="Branch actions">
                      <MoreHorizontal size={17} />
                    </button>
                  </div>

                  <div className="mt-5 flex items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <PrincipalAvatar name={branch.principalName} />
                      <div className="min-w-0">
                        <p className="text-[0.64rem] font-semibold uppercase tracking-[0.13em] text-[#7b8ca2]">Principal</p>
                        <p className="truncate text-sm font-semibold text-[#142132]">{branch.principalName}</p>
                      </div>
                    </div>
                    <div className="min-w-[132px] text-right">
                      <p className="text-[0.64rem] font-semibold uppercase tracking-[0.13em] text-[#7b8ca2]">Pipeline Value</p>
                      <p className="mt-1 text-[1.05rem] font-semibold text-[#142132]">{formatCompactCurrency(branch.kpis.pipelineValue)}</p>
                      <MiniSparkline values={branch.trendValues} tone={needsAttention ? 'red' : 'green'} />
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-4 overflow-hidden rounded-[15px] border border-[#e4ebf3] bg-[#fbfcfe] py-3">
                    <BranchKpiTile label="Agents" value={branch.kpis.activeAgents} trend={branch.agentDelta} />
                    <BranchKpiTile label="Listings" value={branch.kpis.activeListings} trend={branch.listingDelta} />
                    <BranchKpiTile label="Transactions" value={branch.kpis.activeTransactions} trend={branch.transactionDelta} />
                    <BranchKpiTile label="Conversion" value={formatPercent(branch.kpis.conversionRate)} trend={branch.pipelineDelta} />
                  </div>

                  <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[#e5ebf4] pt-4">
                    <Button size="sm" variant="secondary" onClick={() => openBranch(branch.id)}>View Branch <ArrowRight size={15} /></Button>
                    {needsAttention ? (
                      <Button size="sm" variant="secondary" className="border-[#f1bebe] text-[#b42318]" onClick={() => openBranch(branch.id)}>Take Action <ArrowUpRight size={15} /></Button>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => openManageAgents(branch.id)}><UserRound size={15} />Manage Agents</Button>
                    )}
                    <button type="button" className="ml-auto grid h-10 w-10 place-items-center rounded-[12px] border border-[#dde6f0] bg-white text-[#60758d] transition hover:bg-[#f7faff]" aria-label="More branch actions">
                      <MoreHorizontal size={17} />
                    </button>
                  </div>
                </article>
              )
            })}
          </section>
        </>
      ) : null}

      <NewBranchModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={() => {
          void loadBranches()
        }}
      />
    </section>
  )
}
