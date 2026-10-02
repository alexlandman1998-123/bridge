import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Copy,
  Filter,
  MapPin,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserRound,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import BranchCoverImage from '../../components/agency/BranchCoverImage'
import AddressAutocomplete from '../../components/location/AddressAutocomplete'
import Button from '../../components/ui/Button'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Field from '../../components/ui/Field'
import Modal from '../../components/ui/Modal'
import { upsertAreaFromAddress } from '../../lib/location/upsertArea'
import { createBranch, deleteBranch, getAgencyBranchOverview } from '../../services/agencyBranchService'
import { createPrincipalClaimInvite } from '../../services/workspaceUserInviteService'

const PERIOD_OPTIONS = [
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: '90_days', label: '90 Days' },
]

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'healthy', label: 'Healthy' },
  { value: 'watch', label: 'Watch' },
  { value: 'needs_attention', label: 'Needs Attention' },
  { value: 'inactive', label: 'Inactive' },
]

const SORT_OPTIONS = [
  { value: 'pipeline', label: 'Pipeline Value' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'listings', label: 'Listings' },
  { value: 'agents', label: 'Sales Agents' },
  { value: 'health', label: 'Health' },
  { value: 'name', label: 'A-Z' },
]

const EMPTY_OVERVIEW = {
  totals: {
    branches: 0,
    agents: 0,
    salesAgents: 0,
    operationalTeam: 0,
    companyPipeline: 0,
    activeTransactions: 0,
    projectedCommission: 0,
    hasProjectedCommissionData: false,
    companyHealth: 0,
    companyHealthChangePercent: null,
  },
  periodMetrics: {
    pipeline: { value: 0, previousValue: 0, changePercent: null, sparkline: [] },
    transactions: { value: 0, previousValue: 0, changePercent: null, sparkline: [] },
    listings: { value: 0, previousValue: 0, changePercent: null, sparkline: [] },
    agents: { value: 0, previousValue: 0, changePercent: null, sparkline: [] },
  },
  branches: [],
}

function normalizeText(value) {
  return String(value || '').trim()
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function buildBranchAddressValue(branch = {}) {
  const formattedAddress = String(
    branch.formattedAddress ||
      [branch.address, branch.suburb, branch.city, branch.province].filter(Boolean).join(', '),
  ).trim()
  if (!formattedAddress) return null

  return {
    formattedAddress,
    streetAddress: String(branch.address || '').trim(),
    suburb: String(branch.suburb || '').trim(),
    city: String(branch.city || '').trim(),
    province: String(branch.province || '').trim(),
    country: String(branch.country || 'South Africa').trim(),
    postalCode: String(branch.postalCode || '').trim(),
    latitude: typeof branch.latitude === 'number' ? branch.latitude : Number(branch.latitude) || undefined,
    longitude: typeof branch.longitude === 'number' ? branch.longitude : Number(branch.longitude) || undefined,
    placeId: String(branch.googlePlaceId || '').trim(),
  }
}

function mergeBranchAddress(previous = {}, value = null) {
  if (!value) {
    return {
      ...previous,
      address: '',
      formattedAddress: '',
      suburb: '',
      city: '',
      province: '',
      country: 'South Africa',
      postalCode: '',
      latitude: null,
      longitude: null,
      googlePlaceId: '',
    }
  }

  return {
    ...previous,
    address: value.streetAddress || value.formattedAddress || '',
    formattedAddress: value.formattedAddress || '',
    suburb: value.suburb || '',
    city: value.city || '',
    province: value.province || '',
    country: value.country || 'South Africa',
    postalCode: value.postalCode || '',
    latitude: value.latitude ?? null,
    longitude: value.longitude ?? null,
    googlePlaceId: value.placeId || '',
  }
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 }).format(toNumber(value))
}

function formatCurrency(value) {
  const amount = toNumber(value)
  if (amount <= 0) return 'R0'
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(amount)
}

function formatCompactCurrency(value) {
  const amount = toNumber(value)
  if (amount <= 0) return 'R0'
  if (amount >= 1000000000) return `R${(amount / 1000000000).toFixed(1).replace(/\.0$/, '')}bn`
  if (amount >= 1000000) return `R${(amount / 1000000).toFixed(1).replace(/\.0$/, '')}m`
  if (amount >= 1000) return `R${(amount / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return formatCurrency(amount)
}

function formatChange(value) {
  if (value === null || value === undefined) return 'No history yet'
  const numeric = toNumber(value)
  if (numeric === 0) return '0%'
  return `${numeric > 0 ? '+' : ''}${numeric}%`
}

function getChangeTone(value) {
  if (value === null || value === undefined || toNumber(value) === 0) return 'text-[#64748b]'
  return toNumber(value) > 0 ? 'text-[#0f8f52]' : 'text-[#c2410c]'
}

function MiniSparkline({ values = [], tone = 'blue', className = 'h-9 w-24' }) {
  const safeValues = values.length ? values.map(toNumber) : [0, 0, 0, 0, 0, 0, 0, 0]
  const max = Math.max(...safeValues, 1)
  const min = Math.min(...safeValues, 0)
  const range = Math.max(max - min, 1)
  const points = safeValues.map((value, index) => {
    const x = safeValues.length === 1 ? 100 : (index / (safeValues.length - 1)) * 100
    const y = 34 - ((value - min) / range) * 28 + 3
    return `${x},${y}`
  }).join(' ')
  const stroke = {
    blue: '#2563eb',
    green: '#16a34a',
    gold: '#d97706',
    red: '#dc2626',
    slate: '#94a3b8',
  }[tone] || '#2563eb'

  return (
    <svg viewBox="0 0 100 40" className={className} aria-hidden="true" focusable="false">
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ChangeLabel({ value, suffix = '' }) {
  const numeric = toNumber(value)
  const Icon = numeric < 0 ? ArrowDownRight : ArrowUpRight

  if (value === null || value === undefined) {
    return <span className="text-[0.78rem] font-semibold text-[#64748b]">No history yet</span>
  }

  return (
    <span className={`inline-flex items-center gap-1 text-[0.78rem] font-semibold ${getChangeTone(value)}`}>
      <Icon size={14} />
      {formatChange(value)}{suffix ? ` ${suffix}` : ''}
    </span>
  )
}

function StatusBadge({ children, tone = 'slate' }) {
  const toneClass = {
    green: 'border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]',
    gold: 'border-[#fed7aa] bg-[#fff7ed] text-[#9a3412]',
    red: 'border-[#fecaca] bg-[#fef2f2] text-[#991b1b]',
    slate: 'border-[#e2e8f0] bg-[#f8fafc] text-[#475569]',
  }[tone] || 'border-[#e2e8f0] bg-[#f8fafc] text-[#475569]'

  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${toneClass}`}>{children}</span>
}

function PerformanceMetric({ label, value, changePercent, sparkline, tone = 'blue' }) {
  return (
    <article className="min-w-0 rounded-lg border border-[#e2e8f0] bg-[#fbfdff] p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#64748b]">{label}</p>
          <strong className="mt-2 block truncate text-[1.35rem] font-semibold tracking-[-0.035em] text-[#0f172a] tabular-nums">{value}</strong>
        </div>
        <MiniSparkline values={sparkline} tone={tone} className="hidden h-9 w-24 shrink-0 lg:block" />
      </div>
      <div className="mt-3">
        <ChangeLabel value={changePercent} suffix="vs previous" />
      </div>
    </article>
  )
}

function BranchActionMenu({ branch, onView, onManageAgents, onDelete }) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const triggerRef = useRef(null)
  const menuRef = useRef(null)

  useLayoutEffect(() => {
    if (!open) return
    const trigger = triggerRef.current.getBoundingClientRect()
    const menu = menuRef.current.getBoundingClientRect()
    const margin = 8
    const top = trigger.bottom + margin + menu.height <= window.innerHeight - margin
      ? trigger.bottom + margin
      : trigger.top - menu.height - margin
    setPosition({
      top: Math.max(margin, top),
      left: Math.max(margin, Math.min(trigger.right - menu.width, window.innerWidth - menu.width - margin)),
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    function dismiss(event) {
      if (!triggerRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false)
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    function closeOnMove(event) {
      if (!menuRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('scroll', closeOnMove, true)
    window.addEventListener('resize', closeOnMove)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', closeOnMove, true)
      window.removeEventListener('resize', closeOnMove)
    }
  }, [open])

  function runAction(event, action) {
    event.stopPropagation()
    setOpen(false)
    action?.()
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        className="grid h-9 w-9 place-items-center rounded-lg border border-[#dbe4ee] bg-white text-[#64748b] transition hover:bg-[#f8fafc]"
        aria-label={`More actions for ${branch?.name || 'branch'}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation()
          setOpen((previous) => !previous)
        }}
      >
        <MoreHorizontal size={17} />
      </button>
      {open ? createPortal(
        <div ref={menuRef} style={position} className="fixed z-50 max-h-[calc(100dvh-16px)] w-48 max-w-[calc(100vw-16px)] overflow-y-auto rounded-lg border border-[#dbe4ee] bg-white p-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.16)]" role="menu">
          <button type="button" className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-[#1f3448] hover:bg-[#f8fafc]" onClick={(event) => runAction(event, onView)}>
            <ArrowRight size={15} />View
          </button>
          <button type="button" className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-[#1f3448] hover:bg-[#f8fafc]" onClick={(event) => runAction(event, onManageAgents)}>
            <UserRound size={15} />Manage agents
          </button>
          <button type="button" className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-[#b42318] hover:bg-[#fef2f2]" onClick={(event) => runAction(event, onDelete)}>
            <Trash2 size={15} />Delete branch
          </button>
        </div>,
        document.body,
      ) : null}
    </div>
  )
}

function BranchCardGrid({ rows, onView, onManageAgents, onDelete }) {
  const location = useLocation()
  return (
    <div className="grid items-start gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((branch) => (
        <article key={branch.id} className="relative isolate overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)] transition hover:shadow-[0_12px_32px_rgba(15,23,42,0.08)]">
          <Link
            to={`/agency/branches/${encodeURIComponent(branch.id)}`}
            state={{ returnTo: `${location.pathname}${location.search}` }}
            aria-label={`Open ${branch.name} branch`}
            className="absolute inset-0 z-10 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[#176b50]"
          />
          <div className="relative">
            <BranchCoverImage src={branch.coverImageUrl} name={branch.name} className="aspect-[16/9] w-full" />
            <div className="absolute left-4 top-4 flex flex-wrap gap-2">
              <span className="rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-[#334155]">#{branch.rank}</span>
              {branch.isHeadOffice ? <span className="rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-[#176b50]">Head office</span> : null}
            </div>
            <div className="absolute right-4 top-4 z-20">
              <BranchActionMenu branch={branch} onView={() => onView(branch.id)} onManageAgents={() => onManageAgents(branch.id)} onDelete={() => onDelete(branch)} />
            </div>
          </div>
          <div className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-lg font-semibold tracking-[-0.025em] text-[#0f172a]">{branch.name}</h3>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-[#64748b]">
                  <MapPin size={14} className="shrink-0" /><span className="truncate">{branch.location || 'Location pending'}</span>
                </p>
              </div>
              <StatusBadge tone={branch.health?.tone}>{branch.health?.label || 'Watch'}</StatusBadge>
            </div>
            <div className="mt-5 flex items-center justify-between gap-3 border-y border-[#edf2f7] py-4">
              <div>
                <p className="text-xs font-medium text-[#64748b]">Pipeline value</p>
                <p className="mt-1 text-xl font-semibold tracking-tight text-[#0f172a] tabular-nums">{formatCompactCurrency(branch.pipelineValue)}</p>
              </div>
              <div className="text-right">
                <MiniSparkline values={branch.trend?.sparkline} tone={branch.health?.tone === 'red' ? 'red' : branch.health?.tone === 'gold' ? 'gold' : 'green'} className="ml-auto h-6 w-20" />
                <span className={`text-xs font-medium ${getChangeTone(branch.trend?.changePercent)}`}>{formatChange(branch.trend?.changePercent)}</span>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3">
              {[['Transactions', branch.activeTransactions], ['Listings', branch.activeListings], ['Sales agents', branch.activeAgents], ['Team', branch.activeOperationalTeam]].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-2 text-sm">
                  <dt className="text-[#64748b]">{label}</dt><dd className="font-semibold text-[#0f172a] tabular-nums">{formatNumber(value)}</dd>
                </div>
              ))}
            </dl>
            <Button variant="secondary" size="sm" className="relative z-20 mt-5 w-full" onClick={() => onView(branch.id)}>View Branch <ArrowRight size={15} /></Button>
          </div>
        </article>
      ))}
    </div>
  )
}

function EmptyState({ onCreate }) {
  return (
    <div className="rounded-lg border border-dashed border-[#cbd5e1] bg-[#fbfdff] px-6 py-10 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-[#eef6ff] text-[#1d4ed8]">
        <Filter size={20} />
      </div>
      <h3 className="mt-4 text-[1.05rem] font-semibold text-[#0f172a]">No branches match these filters</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#64748b]">Adjust the filters or add a branch to start tracking company-wide performance.</p>
      <div className="mt-5 flex justify-center">
        <Button onClick={onCreate}><Plus size={16} />New Branch</Button>
      </div>
    </div>
  )
}

function NewBranchModal({ open, onClose, onCreated }) {
  const createInitialForm = () => ({
    name: '',
    city: '',
    province: '',
    address: '',
    formattedAddress: '',
    suburb: '',
    country: 'South Africa',
    postalCode: '',
    latitude: null,
    longitude: null,
    googlePlaceId: '',
    managerName: '',
    email: '',
    phone: '',
  })
  const [form, setForm] = useState(createInitialForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function resetModal() {
    setForm(createInitialForm())
    setSaving(false)
    setError('')
  }

  function handleClose() {
    if (saving) return
    resetModal()
    onClose?.()
  }

  async function handleCreate() {
    setSaving(true)
    setError('')
    try {
      const created = await createBranch(form)
      await upsertAreaFromAddress(buildBranchAddressValue(form), { incrementListingCount: false })
      if (typeof onCreated === 'function') {
        onCreated(created)
      }
      resetModal()
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
      onClose={saving ? undefined : handleClose}
      title="Create New Branch"
      subtitle="Add a new office, franchise, or team branch to your agency structure."
      footer={(
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="secondary" onClick={handleClose} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={handleCreate} disabled={saving}>{saving ? 'Creating...' : 'Create Branch'}</Button>
        </div>
      )}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1.5 md:col-span-2">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#64748b]">Branch Name</span>
          <Field value={form.name} onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))} placeholder="e.g. Samlin Realty Bartlett" />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#64748b]">City</span>
          <Field value={form.city} onChange={(event) => setForm((previous) => ({ ...previous, city: event.target.value }))} placeholder="e.g. Boksburg" />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#64748b]">Province</span>
          <Field value={form.province} onChange={(event) => setForm((previous) => ({ ...previous, province: event.target.value }))} placeholder="e.g. Gauteng" />
        </label>
        <div className="md:col-span-2">
          <AddressAutocomplete
            label="Address"
            value={buildBranchAddressValue(form)}
            onChange={(nextAddress) => setForm((previous) => mergeBranchAddress(previous, nextAddress))}
            placeholder="12 Main Road Bedfordview"
            description="Used for branch location quality, reporting, and local search."
          />
        </div>
        <label className="grid gap-1.5">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#64748b]">Suburb</span>
          <Field value={form.suburb} onChange={(event) => setForm((previous) => ({ ...previous, suburb: event.target.value }))} placeholder="e.g. Bedfordview" />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#64748b]">Postal Code</span>
          <Field value={form.postalCode} onChange={(event) => setForm((previous) => ({ ...previous, postalCode: event.target.value }))} placeholder="e.g. 2007" />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#64748b]">Principal / Manager</span>
          <Field value={form.managerName} onChange={(event) => setForm((previous) => ({ ...previous, managerName: event.target.value }))} placeholder="Name" />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#64748b]">Branch Email</span>
          <Field type="email" value={form.email} onChange={(event) => setForm((previous) => ({ ...previous, email: event.target.value }))} placeholder="branch@agency.com" />
        </label>
        <label className="grid gap-1.5 md:col-span-2">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#64748b]">Branch Phone</span>
          <Field value={form.phone} onChange={(event) => setForm((previous) => ({ ...previous, phone: event.target.value }))} placeholder="Contact number" />
        </label>
      </div>
      {error ? <p className="mt-4 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-sm text-[#991b1b]">{error}</p> : null}
    </Modal>
  )
}

function PrincipalManagerInviteModal({ open, onClose }) {
  const createInitialForm = () => ({
    firstName: '',
    lastName: '',
    email: '',
    mobile: '',
    notes: '',
  })
  const [form, setForm] = useState(createInitialForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [createdInvite, setCreatedInvite] = useState(null)
  const [copyMessage, setCopyMessage] = useState('')

  function resetModal() {
    setForm(createInitialForm())
    setSaving(false)
    setError('')
    setCreatedInvite(null)
    setCopyMessage('')
  }

  function handleClose() {
    if (saving) return
    resetModal()
    onClose?.()
  }

  function updateField(key, value) {
    setForm((previous) => ({ ...previous, [key]: value }))
  }

  async function handleInvite() {
    if (!normalizeText(form.email)) {
      setError('Email is required before sending this principal claim.')
      return
    }

    try {
      setSaving(true)
      setError('')
      setCopyMessage('')
      const result = await createPrincipalClaimInvite({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        mobile: form.mobile,
        notes: form.notes,
        source: 'residential_branches_principal_manager_invite',
      })
      setCreatedInvite(result)
    } catch (inviteError) {
      setError(inviteError?.message || 'Unable to send this principal claim right now.')
    } finally {
      setSaving(false)
    }
  }

  async function handleCopyLink() {
    const inviteLink = createdInvite?.inviteLink || createdInvite?.onboardingUrl || ''
    if (!inviteLink) {
      setError('The principal claim link is not available yet.')
      return
    }

    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopyMessage('Claim link copied.')
      setError('')
    } catch {
      setError('Unable to copy the claim link from this browser.')
    }
  }

  const inviteLink = createdInvite?.inviteLink || createdInvite?.onboardingUrl || ''

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : handleClose}
      title="Invite Principal / Manager"
      subtitle="Send a principal claim link without leaving the branches workspace."
      className="max-w-2xl"
      footer={(
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button type="button" variant="secondary" onClick={handleClose} disabled={saving}>Close</Button>
          {createdInvite ? (
            <Button type="button" onClick={handleCopyLink}>
              <Copy size={15} />Copy Link
            </Button>
          ) : (
            <Button type="button" onClick={handleInvite} disabled={saving}>
              <Users size={15} />{saving ? 'Sending...' : 'Send Claim'}
            </Button>
          )}
        </div>
      )}
    >
      <div className="space-y-4">
        {createdInvite ? (
          <section className="rounded-lg border border-[#cfe8d7] bg-[#f3fbf5] p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-[#1d7d45]">
                <CheckCircle2 size={18} />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-[#123824]">
                  {createdInvite.reusedExistingInvite ? 'Existing claim resent' : 'Principal claim sent'}
                </h3>
                <p className="mt-1 text-sm leading-6 text-[#2f6b45]">
                  The invitee will complete onboarding before principal access becomes active.
                </p>
              </div>
            </div>
          </section>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#64748b]">First Name</span>
              <Field value={form.firstName} onChange={(event) => updateField('firstName', event.target.value)} placeholder="First name" />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#64748b]">Last Name</span>
              <Field value={form.lastName} onChange={(event) => updateField('lastName', event.target.value)} placeholder="Last name" />
            </label>
            <label className="grid gap-1.5 md:col-span-2">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#64748b]">Email</span>
              <Field type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} placeholder="principal@agency.com" />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#64748b]">Mobile</span>
              <Field value={form.mobile} onChange={(event) => updateField('mobile', event.target.value)} placeholder="Optional" />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#64748b]">Access</span>
              <Field value="Principal claim" disabled />
            </label>
            <label className="grid gap-1.5 md:col-span-2">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#64748b]">Note</span>
              <Field as="textarea" value={form.notes} onChange={(event) => updateField('notes', event.target.value)} placeholder="Optional context for this invite" />
            </label>
          </div>
        )}

        {inviteLink ? (
          <section className="rounded-lg border border-[#dfe8f1] bg-white p-4">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Claim Link</p>
            <p className="mt-2 break-all rounded-lg border border-[#e2eaf3] bg-[#f8fbff] px-3 py-2 text-sm text-[#35546c]">
              {inviteLink}
            </p>
          </section>
        ) : null}

        {copyMessage ? <p className="rounded-lg border border-[#cfe8d7] bg-[#f3fbf5] px-3 py-2 text-sm text-[#1d7d45]">{copyMessage}</p> : null}
        {error ? <p className="rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-sm text-[#991b1b]">{error}</p> : null}
      </div>
    </Modal>
  )
}

export default function AgencyBranchesPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [overview, setOverview] = useState(EMPTY_OVERVIEW)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [period, setPeriod] = useState(() => searchParams.get('period') || 'this_month')
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get('search') || '')
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status') || 'all')
  const [provinceFilter, setProvinceFilter] = useState(() => searchParams.get('province') || 'all')
  const [sortBy, setSortBy] = useState(() => searchParams.get('sort') || 'pipeline')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showPrincipalInviteModal, setShowPrincipalInviteModal] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState({ open: false, branch: null, error: '' })
  const [deletingBranchId, setDeletingBranchId] = useState('')

  const loadOverview = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const nextOverview = await getAgencyBranchOverview('', period)
      setOverview(nextOverview || EMPTY_OVERVIEW)
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load branches right now.')
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadOverview()
    }, 0)
    return () => clearTimeout(timer)
  }, [loadOverview])

  useEffect(() => {
    const nextParams = new URLSearchParams()
    if (period !== 'this_month') nextParams.set('period', period)
    if (searchTerm) nextParams.set('search', searchTerm)
    if (statusFilter !== 'all') nextParams.set('status', statusFilter)
    if (provinceFilter !== 'all') nextParams.set('province', provinceFilter)
    if (sortBy !== 'pipeline') nextParams.set('sort', sortBy)
    const nextSearch = nextParams.toString()
    const currentSearch = typeof window === 'undefined' ? searchParams.toString() : window.location.search.replace(/^\?/, '')
    if (nextSearch === currentSearch || typeof window === 'undefined') return

    // These controls only refine the branch list. Updating them through the
    // router remounts the route shell in some workspace configurations, which
    // looks like a full-page refresh. Keep the shareable URL without navigating.
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash || ''}`
    window.history.replaceState(window.history.state, '', nextUrl)
  }, [period, provinceFilter, searchParams, searchTerm, sortBy, statusFilter])

  const provinceOptions = useMemo(() => {
    const values = [...new Set((overview.branches || []).map((row) => normalizeText(row?.province)).filter(Boolean))]
    return values.sort((left, right) => left.localeCompare(right))
  }, [overview.branches])

  const filteredRows = useMemo(() => {
    const query = normalizeText(searchTerm).toLowerCase()
    const rows = (overview.branches || []).filter((row) => {
      const statusMatch = statusFilter === 'all' || row?.health?.statusKey === statusFilter
      const provinceMatch = provinceFilter === 'all' || normalizeText(row?.province).toLowerCase() === provinceFilter.toLowerCase()
      const searchMatch = !query
        ? true
        : `${row?.name || ''} ${row?.location || ''} ${row?.city || ''} ${row?.province || ''} ${row?.principalName || ''}`.toLowerCase().includes(query)
      return statusMatch && provinceMatch && searchMatch
    })

    return [...rows].sort((left, right) => {
      if (sortBy === 'transactions') return toNumber(right.activeTransactions) - toNumber(left.activeTransactions) || left.rank - right.rank
      if (sortBy === 'listings') return toNumber(right.activeListings) - toNumber(left.activeListings) || left.rank - right.rank
      if (sortBy === 'agents') return toNumber(right.activeAgents) - toNumber(left.activeAgents) || left.rank - right.rank
      if (sortBy === 'health') return toNumber(right.health?.score) - toNumber(left.health?.score) || left.rank - right.rank
      if (sortBy === 'name') return normalizeText(left.name).localeCompare(normalizeText(right.name))
      return toNumber(right.pipelineValue) - toNumber(left.pipelineValue) || left.rank - right.rank
    })
  }, [overview.branches, provinceFilter, searchTerm, sortBy, statusFilter])

  function openBranch(branchId) {
    navigate(`/agency/branches/${branchId}`, {
      state: { returnTo: `${location.pathname}${location.search}` },
    })
  }

  function openManageAgents(branchId) {
    navigate('/agency/agents', { state: { branchId } })
  }

  function openPrincipalManagerInvite() {
    setShowPrincipalInviteModal(true)
  }

  function openDeleteBranch(branch) {
    setDeleteDialog({ open: true, branch, error: '' })
  }

  async function handleDeleteBranch() {
    const branch = deleteDialog.branch
    if (!branch?.id) return

    setDeletingBranchId(branch.id)
    setDeleteDialog((previous) => ({ ...previous, error: '' }))
    try {
      await deleteBranch(branch.id)
      setDeleteDialog({ open: false, branch: null, error: '' })
      void loadOverview()
    } catch (deleteError) {
      const message = deleteError?.message || 'Unable to delete this branch right now.'
      setDeleteDialog((previous) => ({ ...previous, error: message }))
      setError(message)
    } finally {
      setDeletingBranchId('')
    }
  }

  const periodMetrics = overview.periodMetrics || EMPTY_OVERVIEW.periodMetrics

  return (
    <section className="flex flex-col gap-5 pb-8">

      {error ? <p className="rounded-lg border border-[#fecaca] bg-[#fef2f2] px-5 py-4 text-sm text-[#991b1b]">{error}</p> : null}
      {loading ? <p className="rounded-lg border border-[#e2e8f0] bg-white px-5 py-4 text-sm text-[#64748b]">Loading company branch overview...</p> : null}

      {!loading ? (
        <>
          <section className="rounded-lg border border-[#e2e8f0] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h1 className="text-xl font-semibold tracking-[-0.03em] text-[#0f172a]">Company Performance</h1>
                <p className="mt-1 text-sm text-[#64748b]">A view of performance across your organisation.</p>
              </div>
              <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-[#dbe4ee] bg-[#f8fafc] p-1">
                {PERIOD_OPTIONS.map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    onClick={() => setPeriod(option.value)}
                    className={`min-h-[34px] rounded-md px-3 text-sm font-semibold transition ${period === option.value ? 'bg-white text-[#0f172a] shadow-[0_6px_16px_rgba(15,23,42,0.08)]' : 'text-[#64748b] hover:text-[#0f172a]'}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
              <PerformanceMetric label="Pipeline Value" value={formatCompactCurrency(periodMetrics.pipeline?.value)} changePercent={periodMetrics.pipeline?.changePercent} sparkline={periodMetrics.pipeline?.sparkline} tone="gold" />
              <PerformanceMetric label="Transactions" value={formatNumber(periodMetrics.transactions?.value)} changePercent={periodMetrics.transactions?.changePercent} sparkline={periodMetrics.transactions?.sparkline} tone="green" />
              <PerformanceMetric label="Listings" value={formatNumber(periodMetrics.listings?.value)} changePercent={periodMetrics.listings?.changePercent} sparkline={periodMetrics.listings?.sparkline} tone="blue" />
              <PerformanceMetric label="Sales Agents" value={formatNumber(periodMetrics.agents?.value)} changePercent={periodMetrics.agents?.changePercent} sparkline={periodMetrics.agents?.sparkline} tone="slate" />
            </div>
          </section>

          <section className="rounded-lg border border-[#e2e8f0] bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="text-lg font-semibold text-[#0f172a]">Branches</h2><p className="mt-0.5 text-sm text-[#64748b]">{filteredRows.length} branch{filteredRows.length === 1 ? '' : 'es'}</p></div>
              <Button variant="secondary" size="sm" onClick={openPrincipalManagerInvite}><Users size={15} />Invite Principal / Manager</Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <label className="flex h-[42px] min-w-0 items-center gap-3 rounded-lg border border-[#dbe4ee] bg-white px-3">
                <Search size={16} className="shrink-0 text-[#94a3b8]" />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  aria-label="Search branches"
                  placeholder="Search branches"
                  className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-[#0f172a] outline-none placeholder:text-[#94a3b8]"
                />
              </label>
              <Button onClick={() => setShowCreateModal(true)}><Plus size={16} />Add Branch</Button>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-[160px_180px_200px_auto]">
              <Field aria-label="Branch status" as="select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-[42px]">
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Field>
              <Field aria-label="Province" as="select" value={provinceFilter} onChange={(event) => setProvinceFilter(event.target.value)} className="h-[42px]">
                <option value="all">Province</option>
                {provinceOptions.map((province) => (
                  <option key={province} value={province}>{province}</option>
                ))}
              </Field>
              <Field aria-label="Sort branches" as="select" value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="h-[42px]">
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>Sort: {option.label}</option>
                ))}
              </Field>
              <Button variant="secondary" size="sm" className="lg:justify-self-start" onClick={loadOverview} disabled={loading}>
                <RefreshCw size={15} />Refresh
              </Button>
            </div>
          </section>

          <section>
            {filteredRows.length ? (
              <BranchCardGrid rows={filteredRows} onView={openBranch} onManageAgents={openManageAgents} onDelete={openDeleteBranch} />
            ) : (
              <EmptyState onCreate={() => setShowCreateModal(true)} />
            )}
          </section>
        </>
      ) : null}

      <NewBranchModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={() => {
          void loadOverview()
        }}
      />
      <PrincipalManagerInviteModal
        open={showPrincipalInviteModal}
        onClose={() => setShowPrincipalInviteModal(false)}
      />
      <ConfirmDialog
        open={deleteDialog.open}
        title="Delete Branch?"
        description={
          deleteDialog.error ||
          `Delete ${deleteDialog.branch?.name || 'this branch'}? Linked agents, listings, leads, and transactions will keep their records but lose this branch assignment. This cannot be undone.`
        }
        confirmLabel="Delete Branch"
        cancelLabel="Keep Branch"
        variant="destructive"
        confirming={Boolean(deletingBranchId)}
        confirmDisabled={!deleteDialog.branch?.id}
        onConfirm={handleDeleteBranch}
        onCancel={() => {
          if (deletingBranchId) return
          setDeleteDialog({ open: false, branch: null, error: '' })
        }}
      />
    </section>
  )
}
