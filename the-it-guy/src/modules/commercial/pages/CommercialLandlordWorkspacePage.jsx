import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  Copy,
  DoorOpen,
  FileText,
  Globe2,
  Handshake,
  Home,
  LayoutGrid,
  Loader2,
  Mail,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  Send,
  UserRound,
  Users,
} from 'lucide-react'
import { createElement, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import CommercialDocumentLibrary from '../components/CommercialDocumentLibrary'
import CommercialEmptyState from '../components/CommercialEmptyState'
import CommercialFormModal from '../components/CommercialFormModal'
import CommercialLandlordOnboardingInviteModal from '../components/CommercialLandlordOnboardingInviteModal'
import CommercialStatusPill from '../components/CommercialStatusPill'
import { commercialCrudConfigs } from '../commercialCrudConfig'
import { createEmptyLandlordOnboardingForm } from '../commercialLandlordOnboardingModel'
import { formatCurrency, formatDate, formatNumber, titleize } from '../commercialFormatters'
import { buildCommercialDocumentGeneratorPath } from '../../../services/documents/commercialDocumentAdapterService'
import { useCommercialData } from '../hooks/useCommercialData'
import {
  createCommercialLandlordOnboarding,
  getCommercialLandlordWorkspaceData,
  markCommercialLandlordOnboardingComplete,
  resendCommercialLandlordOnboarding,
  saveCommercialLandlordContact,
  saveCommercialLandlordMandate,
} from '../services/commercialLandlordService'

const CARD_CLASS = 'rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]'
const INPUT_CLASS = 'h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-[#102236] outline-none transition focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe]'
const TEXTAREA_CLASS = 'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-[#102236] outline-none transition focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe]'

const TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'properties', label: 'Properties', icon: Home },
  { id: 'vacancies', label: 'Vacancies', icon: DoorOpen },
  { id: 'leases', label: 'Leases', icon: FileText },
  { id: 'mandates', label: 'Mandates', icon: Handshake },
  { id: 'contacts', label: 'Contacts', icon: Users },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'activity', label: 'Activity', icon: Activity },
]

function RowGrid({ rows = [] }) {
  return (
    <dl className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
          <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</dt>
          <dd className="mt-1 text-sm font-semibold text-[#102236]">{value || '-'}</dd>
        </div>
      ))}
    </dl>
  )
}

function KpiCard({ label, value, detail, icon: Icon = BarChart3, actionLabel = '', onAction = null }) {
  return (
    <article className="min-h-[128px] border-r border-slate-200 bg-white p-5 last:border-r-0">
      <div className="flex items-start gap-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
          {createElement(Icon, { size: 20 })}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#102236]">{label}</p>
          <p className="mt-1 text-3xl font-semibold tracking-[-0.05em] text-[#102236]">{value}</p>
          <p className="mt-1 text-sm leading-5 text-slate-500">{detail}</p>
          {actionLabel && onAction ? (
            <button type="button" onClick={onAction} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-blue-700">
              {actionLabel}
              <ArrowRight size={15} />
            </button>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function normalizeWorkspaceText(value) {
  return String(value || '').trim()
}

function workspaceNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function workspaceLower(value) {
  return normalizeWorkspaceText(value).toLowerCase()
}

function landlordInitials(value = 'Landlord') {
  return normalizeWorkspaceText(value)
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'LL'
}

function parseJsonObject(value) {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function primaryLocation(landlord = {}, properties = []) {
  const locations = Array.from(new Set(properties.map((property) => [property.suburb, property.city || property.province].filter(Boolean).join(', ')).filter(Boolean)))
  if (locations.length > 1) return 'Multiple Regions'
  return locations[0] || [landlord.suburb, landlord.city || landlord.province].filter(Boolean).join(', ') || landlord.registered_address || landlord.formatted_address || 'Location pending'
}

function getAboutText(landlord = {}, latestForm = null) {
  const metadata = parseJsonObject(landlord.metadata_json)
  return normalizeWorkspaceText(landlord.description)
    || normalizeWorkspaceText(landlord.about)
    || normalizeWorkspaceText(landlord.portfolio_notes)
    || normalizeWorkspaceText(metadata.onboarding_notes)
    || normalizeWorkspaceText(latestForm?.portfolio?.portfolio_notes)
    || 'No relationship summary has been captured yet.'
}

function buildPropertyTypeBreakdown(properties = []) {
  const total = properties.reduce((sum, property) => sum + workspaceNumber(property.gla_m2), 0)
  const groups = properties.reduce((map, property) => {
    const type = titleize(property.property_type || 'Other')
    map[type] = (map[type] || 0) + workspaceNumber(property.gla_m2)
    return map
  }, {})
  return Object.entries(groups)
    .map(([label, value]) => ({ label, value, percent: total ? Math.round((value / total) * 100) : 0 }))
    .sort((left, right) => right.value - left.value)
}

function buildTopLocations(properties = []) {
  const total = properties.reduce((sum, property) => sum + workspaceNumber(property.gla_m2), 0)
  const groups = properties.reduce((map, property) => {
    const location = [property.suburb, property.city || property.province].filter(Boolean).join(', ') || 'Unallocated'
    map[location] = (map[location] || 0) + workspaceNumber(property.gla_m2)
    return map
  }, {})
  return Object.entries(groups)
    .map(([label, value]) => ({ label, value, percent: total ? Math.round((value / total) * 100) : 0 }))
    .sort((left, right) => right.value - left.value)
    .slice(0, 5)
}

function deriveRecentActivity({ activity = [], properties = [], vacancies = [], leases = [], mandates = [], contacts = [], documents = [] } = {}) {
  const explicit = (activity || []).slice(0, 4).map((row) => ({
    id: `activity-${row.id}`,
    title: row.title || titleize(row.activity_type),
    detail: row.body || '',
    date: row.created_at,
    icon: Activity,
    tone: 'blue',
  }))
  const derived = [
    ...vacancies.slice(0, 2).map((row) => ({ id: `vacancy-${row.id}`, title: 'New vacancy added', detail: row.vacancy_name || row.unit_or_floor || 'Vacancy', date: row.updated_at || row.created_at, icon: DoorOpen, tone: 'green' })),
    ...leases.slice(0, 2).map((row) => ({ id: `lease-${row.id}`, title: 'Lease updated', detail: `Lease ${String(row.id || '').slice(0, 8)}`, date: row.updated_at || row.created_at, icon: FileText, tone: 'purple' })),
    ...contacts.slice(0, 2).map((row) => ({ id: `contact-${row.id}`, title: 'Contact added', detail: [row.full_name, row.position].filter(Boolean).join(' · '), date: row.updated_at || row.created_at, icon: Users, tone: 'blue' })),
    ...mandates.slice(0, 2).map((row) => ({ id: `mandate-${row.id}`, title: 'Mandate updated', detail: `${titleize(row.mandate_kind)} mandate`, date: row.updated_at || row.created_at, icon: Handshake, tone: 'orange' })),
    ...documents.slice(0, 2).map((row) => ({ id: `document-${row.id}`, title: 'Document uploaded', detail: row.document_name || row.file_name || 'Document', date: row.updated_at || row.created_at || row.uploaded_at, icon: FileText, tone: 'blue' })),
    ...properties.slice(0, 2).map((row) => ({ id: `property-${row.id}`, title: 'Property added', detail: row.property_name, date: row.updated_at || row.created_at, icon: Home, tone: 'green' })),
  ]
  return [...explicit, ...derived]
    .filter((row) => row.date || row.title)
    .sort((left, right) => new Date(right.date || 0) - new Date(left.date || 0))
    .slice(0, 5)
}

function PortfolioBreakdown({ rows = [], total = 0 }) {
  const colors = ['bg-[#123b61]', 'bg-blue-500', 'bg-amber-500', 'bg-violet-500', 'bg-emerald-500']
  return (
    <section className={CARD_CLASS}>
      <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Portfolio by Property Type</h2>
      <div className="mt-5 grid gap-5 sm:grid-cols-[180px,1fr] sm:items-center">
        <div className="grid h-40 w-40 place-items-center rounded-full border-[18px] border-[#123b61] bg-white text-center shadow-inner">
          <div>
            <p className="text-xl font-semibold tracking-[-0.04em] text-[#102236]">{formatNumber(total, 'm²')}</p>
            <p className="text-xs font-semibold text-slate-500">Total GLA</p>
          </div>
        </div>
        <div className="grid gap-3">
          {rows.length ? rows.map((row, index) => (
            <div key={row.label} className="grid grid-cols-[1fr,auto] items-center gap-3 text-sm">
              <span className="inline-flex min-w-0 items-center gap-2 text-slate-600">
                <span className={`h-2.5 w-2.5 rounded-full ${colors[index % colors.length]}`} />
                {row.label}
              </span>
              <span className="font-semibold text-[#102236]">{formatNumber(row.value, 'm²')} · {row.percent}%</span>
            </div>
          )) : <p className="text-sm text-slate-500">No property type data yet.</p>}
        </div>
      </div>
    </section>
  )
}

function TopLocations({ rows = [] }) {
  return (
    <section className={CARD_CLASS}>
      <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Top Locations</h2>
      <div className="mt-5 grid gap-3">
        {rows.length ? rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[1fr,auto,auto] items-center gap-3 border-b border-slate-100 pb-3 text-sm last:border-b-0 last:pb-0">
            <span className="inline-flex min-w-0 items-center gap-2 text-slate-600">
              <MapPin size={15} className="shrink-0 text-slate-400" />
              <span className="truncate">{row.label}</span>
            </span>
            <span className="font-semibold text-[#102236]">{formatNumber(row.value, 'm²')}</span>
            <span className="font-semibold text-slate-500">{row.percent}%</span>
          </div>
        )) : <p className="text-sm text-slate-500">No location data yet.</p>}
      </div>
    </section>
  )
}

function RecentActivityCard({ rows = [] }) {
  const toneClass = {
    green: 'bg-emerald-50 text-emerald-700',
    purple: 'bg-violet-50 text-violet-700',
    orange: 'bg-amber-50 text-amber-700',
    blue: 'bg-blue-50 text-blue-700',
  }
  return (
    <section className={CARD_CLASS}>
      <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Recent Activity</h2>
      <div className="mt-5 grid gap-4">
        {rows.length ? rows.map((row) => {
          const Icon = row.icon || Activity
          return (
            <article key={row.id} className="flex items-start gap-3">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${toneClass[row.tone] || toneClass.blue}`}>
                <Icon size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#102236]">{row.title}</p>
                <p className="mt-1 truncate text-sm text-slate-500">{row.detail || '-'}</p>
              </div>
              <span className="shrink-0 text-xs font-semibold text-slate-400">{formatDate(row.date)}</span>
            </article>
          )
        }) : <p className="text-sm text-slate-500">No recent activity yet.</p>}
      </div>
    </section>
  )
}

function LinkedList({ rows = [], empty, renderTitle, renderDetail, renderMeta = null, renderActions = null, to = null }) {
  if (!rows.length) return <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">{empty}</p>
  return (
    <div className="grid gap-3">
      {rows.map((row) => {
        const body = (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#102236]">{renderTitle(row)}</p>
              <p className="mt-1 text-sm text-slate-500">{renderDetail(row)}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              {renderMeta ? <span className="text-xs font-semibold text-slate-400">{renderMeta(row)}</span> : null}
              {renderActions ? <div className="flex flex-wrap justify-end gap-2">{renderActions(row)}</div> : null}
            </div>
          </div>
        )
        if (!to) return <article key={row.id} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">{body}</article>
        return (
          <Link key={row.id} to={typeof to === 'function' ? to(row) : to} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4 transition hover:border-blue-200 hover:bg-white">
            {body}
          </Link>
        )
      })}
    </div>
  )
}

function ActivityList({ rows = [] }) {
  if (!rows.length) return <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No landlord activity has been recorded yet.</p>
  return (
    <div className="grid gap-3">
      {rows.map((item) => (
        <article key={item.id} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
          <p className="text-sm font-semibold text-[#102236]">{item.title || titleize(item.activity_type)}</p>
          <p className="mt-1 text-sm text-slate-500">{item.body || '-'}</p>
          <p className="mt-2 text-xs font-semibold text-slate-400">{formatDate(item.created_at)}</p>
        </article>
      ))}
    </div>
  )
}

function ContactModal({ open = false, record = null, type = 'asset_manager', onClose = null, onSubmit = null }) {
  const [form, setForm] = useState({
    full_name: record?.full_name || '',
    position: record?.position || '',
    email: record?.email || '',
    mobile: record?.mobile || '',
    id_number: record?.id_number || '',
    signing_capacity: record?.signing_capacity || '',
    authority_confirmed: Boolean(record?.authority_confirmed),
    can_approve_mandates: Boolean(record?.can_approve_mandates),
    can_approve_leasing_terms: Boolean(record?.can_approve_leasing_terms),
    can_approve_sales_terms: Boolean(record?.can_approve_sales_terms),
    is_primary: Boolean(record?.is_primary),
    portfolio_region: record?.portfolio_region || '',
    responsibilities: Array.isArray(record?.responsibilities) ? record.responsibilities.join(', ') : '',
    notes: record?.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setForm({
      full_name: record?.full_name || '',
      position: record?.position || '',
      email: record?.email || '',
      mobile: record?.mobile || '',
      id_number: record?.id_number || '',
      signing_capacity: record?.signing_capacity || '',
      authority_confirmed: Boolean(record?.authority_confirmed),
      can_approve_mandates: Boolean(record?.can_approve_mandates),
      can_approve_leasing_terms: Boolean(record?.can_approve_leasing_terms),
      can_approve_sales_terms: Boolean(record?.can_approve_sales_terms),
      is_primary: Boolean(record?.is_primary),
      portfolio_region: record?.portfolio_region || '',
      responsibilities: Array.isArray(record?.responsibilities) ? record.responsibilities.join(', ') : '',
      notes: record?.notes || '',
    })
    setSaving(false)
    setError('')
  }, [record])

  if (!open) return null

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onSubmit?.({
        ...record,
        ...form,
        contact_type: type,
        responsibilities: form.responsibilities.split(',').map((item) => item.trim()).filter(Boolean),
      })
      onClose?.()
    } catch (submitError) {
      setError(submitError?.message || 'Contact could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  const isAssetManager = type === 'asset_manager'

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/35 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-[28px] border border-white/70 bg-[#f8fafc] shadow-[0_28px_88px_rgba(15,23,42,0.18)]">
        <form onSubmit={handleSubmit} className="grid gap-5 p-5 sm:p-6">
          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-slate-400">{isAssetManager ? 'Asset Manager' : 'Property Manager'}</p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.04em] text-[#102236]">{record?.id ? 'Edit contact' : `Add ${isAssetManager ? 'asset' : 'property'} manager`}</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-sm font-semibold text-[#102236]">
              Full Name
              <input value={form.full_name} onChange={(event) => setForm((previous) => ({ ...previous, full_name: event.target.value }))} className={INPUT_CLASS} required />
            </label>
            <label className="grid gap-1 text-sm font-semibold text-[#102236]">
              Position / Title
              <input value={form.position} onChange={(event) => setForm((previous) => ({ ...previous, position: event.target.value }))} className={INPUT_CLASS} />
            </label>
            <label className="grid gap-1 text-sm font-semibold text-[#102236]">
              Email
              <input type="email" value={form.email} onChange={(event) => setForm((previous) => ({ ...previous, email: event.target.value }))} className={INPUT_CLASS} />
            </label>
            <label className="grid gap-1 text-sm font-semibold text-[#102236]">
              Mobile
              <input value={form.mobile} onChange={(event) => setForm((previous) => ({ ...previous, mobile: event.target.value }))} className={INPUT_CLASS} />
            </label>
            {isAssetManager ? (
              <>
                <label className="grid gap-1 text-sm font-semibold text-[#102236]">
                  ID Number
                  <input value={form.id_number} onChange={(event) => setForm((previous) => ({ ...previous, id_number: event.target.value }))} className={INPUT_CLASS} />
                </label>
                <label className="grid gap-1 text-sm font-semibold text-[#102236]">
                  Signing Capacity
                  <input value={form.signing_capacity} onChange={(event) => setForm((previous) => ({ ...previous, signing_capacity: event.target.value }))} className={INPUT_CLASS} />
                </label>
              </>
            ) : (
              <label className="grid gap-1 text-sm font-semibold text-[#102236] md:col-span-2">
                Responsibilities
                <input value={form.responsibilities} onChange={(event) => setForm((previous) => ({ ...previous, responsibilities: event.target.value }))} className={INPUT_CLASS} placeholder="Vacancy updates, building access, operational approvals" />
              </label>
            )}
            {!isAssetManager ? (
              <label className="grid gap-1 text-sm font-semibold text-[#102236] md:col-span-2">
                Portfolio / Region
                <input value={form.portfolio_region} onChange={(event) => setForm((previous) => ({ ...previous, portfolio_region: event.target.value }))} className={INPUT_CLASS} />
              </label>
            ) : null}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-[#102236]">
              <input type="checkbox" checked={form.is_primary} onChange={(event) => setForm((previous) => ({ ...previous, is_primary: event.target.checked }))} />
              Primary contact
            </label>
            {isAssetManager ? (
              <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-[#102236]">
                <input type="checkbox" checked={form.authority_confirmed} onChange={(event) => setForm((previous) => ({ ...previous, authority_confirmed: event.target.checked }))} />
                Authority confirmed
              </label>
            ) : null}
            {isAssetManager ? (
              <>
                <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-[#102236]">
                  <input type="checkbox" checked={form.can_approve_mandates} onChange={(event) => setForm((previous) => ({ ...previous, can_approve_mandates: event.target.checked }))} />
                  Can approve mandates
                </label>
                <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-[#102236]">
                  <input type="checkbox" checked={form.can_approve_leasing_terms} onChange={(event) => setForm((previous) => ({ ...previous, can_approve_leasing_terms: event.target.checked }))} />
                  Can approve leasing terms
                </label>
                <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-[#102236] md:col-span-2">
                  <input type="checkbox" checked={form.can_approve_sales_terms} onChange={(event) => setForm((previous) => ({ ...previous, can_approve_sales_terms: event.target.checked }))} />
                  Can approve sales terms
                </label>
              </>
            ) : null}
          </div>
          <label className="grid gap-1 text-sm font-semibold text-[#102236]">
            Notes
            <textarea value={form.notes} onChange={(event) => setForm((previous) => ({ ...previous, notes: event.target.value }))} rows={3} className={TEXTAREA_CLASS} />
          </label>
          {error ? <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p> : null}
          <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-end">
            <button type="button" onClick={() => onClose?.()} className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#102236] transition hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#102b46] px-4 text-sm font-semibold text-white transition hover:bg-[#163a5b] disabled:opacity-60">
              {saving ? <Loader2 size={16} className="animate-spin" /> : null}
              Save Contact
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function MandateModal({ open = false, record = null, onClose = null, onSubmit = null }) {
  const [form, setForm] = useState({
    mandate_kind: record?.mandate_kind || 'leasing',
    mandate_type: record?.mandate_type || 'open',
    start_date: record?.start_date || '',
    expiry_date: record?.expiry_date || '',
    commission_structure: record?.commission_structure || '',
    brokerage_assigned: record?.brokerage_assigned || '',
    broker_assigned: record?.broker_assigned || '',
    notes: record?.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setForm({
      mandate_kind: record?.mandate_kind || 'leasing',
      mandate_type: record?.mandate_type || 'open',
      start_date: record?.start_date || '',
      expiry_date: record?.expiry_date || '',
      commission_structure: record?.commission_structure || '',
      brokerage_assigned: record?.brokerage_assigned || '',
      broker_assigned: record?.broker_assigned || '',
      notes: record?.notes || '',
    })
    setSaving(false)
    setError('')
  }, [record])

  if (!open) return null

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onSubmit?.({ ...record, ...form })
      onClose?.()
    } catch (submitError) {
      setError(submitError?.message || 'Mandate could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/35 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-[28px] border border-white/70 bg-[#f8fafc] shadow-[0_28px_88px_rgba(15,23,42,0.18)]">
        <form onSubmit={handleSubmit} className="grid gap-5 p-5 sm:p-6">
          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-slate-400">Commercial Mandate</p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.04em] text-[#102236]">{record?.id ? 'Edit mandate' : 'Create mandate'}</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-sm font-semibold text-[#102236]">
              Mandate Kind
              <select value={form.mandate_kind} onChange={(event) => setForm((previous) => ({ ...previous, mandate_kind: event.target.value }))} className={INPUT_CLASS}>
                <option value="leasing">Leasing Mandate</option>
                <option value="sales">Sales Mandate</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold text-[#102236]">
              Mandate Type
              <select value={form.mandate_type} onChange={(event) => setForm((previous) => ({ ...previous, mandate_type: event.target.value }))} className={INPUT_CLASS}>
                <option value="open">Open</option>
                <option value="sole">Sole</option>
                <option value="joint_sole">Joint Sole</option>
                <option value="exclusive">Exclusive</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold text-[#102236]">
              Start Date
              <input type="date" value={form.start_date} onChange={(event) => setForm((previous) => ({ ...previous, start_date: event.target.value }))} className={INPUT_CLASS} />
            </label>
            <label className="grid gap-1 text-sm font-semibold text-[#102236]">
              Expiry Date
              <input type="date" value={form.expiry_date} onChange={(event) => setForm((previous) => ({ ...previous, expiry_date: event.target.value }))} className={INPUT_CLASS} />
            </label>
            <label className="grid gap-1 text-sm font-semibold text-[#102236] md:col-span-2">
              Commission Structure
              <input value={form.commission_structure} onChange={(event) => setForm((previous) => ({ ...previous, commission_structure: event.target.value }))} className={INPUT_CLASS} placeholder="5% plus VAT" />
            </label>
            <label className="grid gap-1 text-sm font-semibold text-[#102236]">
              Brokerage Assigned
              <input value={form.brokerage_assigned} onChange={(event) => setForm((previous) => ({ ...previous, brokerage_assigned: event.target.value }))} className={INPUT_CLASS} />
            </label>
            <label className="grid gap-1 text-sm font-semibold text-[#102236]">
              Broker Assigned
              <input value={form.broker_assigned} onChange={(event) => setForm((previous) => ({ ...previous, broker_assigned: event.target.value }))} className={INPUT_CLASS} />
            </label>
          </div>
          <label className="grid gap-1 text-sm font-semibold text-[#102236]">
            Notes
            <textarea value={form.notes} onChange={(event) => setForm((previous) => ({ ...previous, notes: event.target.value }))} rows={3} className={TEXTAREA_CLASS} />
          </label>
          {error ? <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p> : null}
          <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-end">
            <button type="button" onClick={() => onClose?.()} className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#102236] transition hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#102b46] px-4 text-sm font-semibold text-white transition hover:bg-[#163a5b] disabled:opacity-60">
              {saving ? <Loader2 size={16} className="animate-spin" /> : null}
              Save Mandate
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CommercialLandlordWorkspacePage() {
  const { landlordId } = useParams()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('overview')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [contactModal, setContactModal] = useState({ open: false, type: 'asset_manager', record: null })
  const [mandateModal, setMandateModal] = useState({ open: false, record: null })
  const [editLandlordOpen, setEditLandlordOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [actionState, setActionState] = useState({ saving: false, error: '', notice: '' })
  const fetcher = useMemo(() => (organisationId) => getCommercialLandlordWorkspaceData(organisationId, landlordId), [landlordId])
  const { data, loading, error, organisationId } = useCommercialData(fetcher, [fetcher])
  const landlord = data?.landlord || null

  async function refresh() {
    navigate(0)
  }

  async function handleSendOnboarding(payload) {
    setActionState({ saving: true, error: '', notice: '' })
    try {
      await createCommercialLandlordOnboarding({ ...payload, landlordId: payload.landlordId || landlord?.id || '' })
      setActionState({ saving: false, error: '', notice: 'Landlord onboarding sent.' })
      await refresh()
    } catch (sendError) {
      setActionState({ saving: false, error: sendError?.message || 'Landlord onboarding could not be sent.', notice: '' })
      throw sendError
    }
  }

  async function handleResend(messageKind = 'reminder') {
    const latest = data?.summary?.latestOnboarding
    if (!latest?.id) return
    setActionState({ saving: true, error: '', notice: '' })
    try {
      await resendCommercialLandlordOnboarding(latest.id, messageKind)
      setActionState({ saving: false, error: '', notice: messageKind === 'missing_information' ? 'Missing information request sent.' : 'Onboarding link resent.' })
      await refresh()
    } catch (sendError) {
      setActionState({ saving: false, error: sendError?.message || 'Onboarding email could not be sent.', notice: '' })
    }
  }

  async function handleMarkComplete() {
    const latest = data?.summary?.latestOnboarding
    if (!latest?.id) return
    setActionState({ saving: true, error: '', notice: '' })
    try {
      await markCommercialLandlordOnboardingComplete(latest.id)
      setActionState({ saving: false, error: '', notice: 'Landlord onboarding marked complete.' })
      await refresh()
    } catch (markError) {
      setActionState({ saving: false, error: markError?.message || 'Landlord onboarding could not be marked complete.', notice: '' })
    }
  }

  async function handleCopyLink() {
    const token = data?.summary?.latestOnboarding?.secure_token
    if (!token || !navigator?.clipboard?.writeText) return
    await navigator.clipboard.writeText(`${window.location.origin}/commercial/landlord-onboarding/${token}`)
    setActionState((previous) => ({ ...previous, notice: 'Secure onboarding link copied.' }))
  }

  async function handleSaveContact(payload) {
    await saveCommercialLandlordContact(landlord.id, payload)
    await refresh()
  }

  async function handleSaveMandate(payload) {
    await saveCommercialLandlordMandate(landlord.id, payload)
    await refresh()
  }

  async function handleSaveLandlord(payload) {
    const updated = await commercialCrudConfigs.landlords.updateRecord(landlord.id, payload)
    setEditLandlordOpen(false)
    await refresh()
    return updated
  }

  async function handleArchiveLandlord() {
    const confirmed = window.confirm('Archive this landlord record?')
    if (!confirmed) return
    setActionState({ saving: true, error: '', notice: '' })
    try {
      await commercialCrudConfigs.landlords.archiveRecord(landlord.id)
      navigate('/commercial/landlords')
    } catch (archiveError) {
      setActionState({ saving: false, error: archiveError?.message || 'Landlord could not be archived.', notice: '' })
    }
  }

  if (error) return <CommercialEmptyState title="Commercial landlord could not be loaded" description={error} />
  if (loading) return <div className="h-72 animate-pulse rounded-3xl bg-slate-100" />
  if (!landlord) return <CommercialEmptyState title="Landlord not found" description="This commercial landlord may have been archived or sits outside your current scope." />

  const summary = data?.summary || {}
  const latestOnboarding = summary.latestOnboarding || null
  const latestForm = createEmptyLandlordOnboardingForm(latestOnboarding?.form_data || {})
  const contacts = data?.contacts || []
  const properties = data?.properties || []
  const vacancies = data?.vacancies || []
  const leases = data?.leases || []
  const mandates = data?.mandates || []
  const documents = data?.documents || []
  const activeVacancies = vacancies.filter((row) => !['occupied', 'withdrawn', 'archived'].includes(workspaceLower(row.status)))
  const activeLeases = leases.filter((row) => ['active', 'executed', 'pending_signature'].includes(workspaceLower(row.status)))
  const totalGla = summary.totalGla || properties.reduce((sum, property) => sum + workspaceNumber(property.gla_m2), 0)
  const availableArea = activeVacancies.reduce((sum, vacancy) => sum + workspaceNumber(vacancy.available_area_m2), 0)
    || properties.reduce((sum, property) => sum + workspaceNumber(property.available_space_m2), 0)
  const vacancyRate = totalGla ? Math.round((availableArea / totalGla) * 100) : 0
  const relationshipOwner = landlord.broker_id || properties.find((property) => property.broker_id)?.broker_id || ''
  const relationshipOwnerName = data?.lookups?.brokers?.find((broker) => String(broker.userId || broker.user_id || broker.id) === String(relationshipOwner))?.fullName
    || data?.lookups?.brokers?.find((broker) => String(broker.userId || broker.user_id || broker.id) === String(relationshipOwner))?.email
    || landlord.contact_person
    || 'Unassigned'
  const primaryContact = summary.mainContact || contacts.find((row) => row.is_primary) || contacts[0] || {}
  const locationLabel = primaryLocation(landlord, properties)
  const aboutText = getAboutText(landlord, latestForm)
  const propertyTypeBreakdown = buildPropertyTypeBreakdown(properties)
  const topLocations = buildTopLocations(properties)
  const recentActivity = deriveRecentActivity({ activity: data?.activity || [], properties, vacancies, leases, mandates, contacts, documents })
  const tabCounts = {
    overview: '',
    properties: properties.length,
    vacancies: activeVacancies.length,
    leases: activeLeases.length,
    mandates: mandates.length,
    contacts: contacts.length,
    documents: documents.length + (data?.documentRequests || []).length,
    activity: (data?.activity || []).length,
  }

  return (
    <div className="grid gap-5">
      <section className="grid gap-5">
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-500">
          <Link to="/commercial/properties" className="transition hover:text-[#102236]">Portfolio</Link>
          <span>›</span>
          <Link to="/commercial/landlords" className="transition hover:text-[#102236]">Landlords</Link>
          <span>›</span>
          <span className="text-[#102236]">{landlord.legal_name || landlord.name}</span>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1fr,380px] xl:items-start">
          <section className="rounded-[28px] border border-white/70 bg-white p-5 shadow-[0_14px_38px_rgba(15,23,42,0.05)]">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
              <span className="grid h-28 w-28 shrink-0 place-items-center rounded-full bg-[#2d1448] text-3xl font-bold text-white shadow-[0_18px_38px_rgba(15,23,42,0.16)]">
                {landlordInitials(landlord.legal_name || landlord.name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-3xl font-semibold tracking-[-0.055em] text-[#102236]">{landlord.legal_name || landlord.name}</h1>
                  <CommercialStatusPill value={landlord.status || 'active'} />
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  {titleize(landlord.entity_type || landlord.landlord_type || 'landlord')}
                  {landlord.registration_number ? ` · Reg: ${landlord.registration_number}` : ''}
                </p>
                <p className="mt-2 inline-flex items-center gap-2 text-sm text-slate-500">
                  <MapPin size={15} />
                  {locationLabel}
                </p>

                <div className="mt-7 grid gap-4 md:grid-cols-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-violet-100 text-sm font-bold text-violet-700">{landlordInitials(relationshipOwnerName)}</span>
                    <div>
                      <p className="text-xs font-medium text-slate-500">Relationship Owner</p>
                      <p className="text-sm font-semibold text-[#102236]">{relationshipOwnerName}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-sm font-bold text-slate-700">{landlordInitials(primaryContact.full_name || landlord.contact_person || landlord.name)}</span>
                    <div>
                      <p className="text-xs font-medium text-slate-500">Primary Contact</p>
                      <p className="text-sm font-semibold text-[#102236]">{primaryContact.full_name || landlord.contact_person || 'Not set'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    <div>
                      <p className="text-xs font-medium text-slate-500">Onboarding Status</p>
                      <p className="text-sm font-semibold text-[#102236]">{titleize(summary.onboardingStatus || landlord.onboarding_status || 'not_sent')}</p>
                      <p className="text-xs text-slate-500">{latestOnboarding?.approved_at || latestOnboarding?.submitted_at ? `Updated ${formatDate(latestOnboarding.approved_at || latestOnboarding.submitted_at)}` : 'Manual records supported'}</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="relative flex shrink-0 flex-wrap gap-2">
                <button type="button" onClick={() => setEditLandlordOpen(true)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#102236] transition hover:bg-slate-50">
                  <Pencil size={16} />
                  Edit Landlord
                </button>
                <button type="button" onClick={() => setMoreOpen((open) => !open)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#102236] transition hover:bg-slate-50">
                  More
                  <MoreHorizontal size={16} />
                </button>
                {moreOpen ? (
                  <div className="absolute right-0 top-12 z-20 grid w-64 gap-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_18px_45px_rgba(15,23,42,0.14)]">
                    <button type="button" onClick={() => { setInviteOpen(true); setMoreOpen(false) }} className="rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#102236] hover:bg-slate-50">Send Landlord Onboarding</button>
                    <button type="button" onClick={() => { setInviteOpen(true); setMoreOpen(false) }} className="rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#102236] hover:bg-slate-50">Link Onboarding Submission</button>
                    <Link
                      to={buildCommercialDocumentGeneratorPath({ packetType: 'commercial_lease', assetCategory: 'office', landlordId: landlord.id })}
                      onClick={() => setMoreOpen(false)}
                      className="rounded-xl px-3 py-2 text-sm font-semibold text-[#102236] hover:bg-slate-50"
                    >
                      Generate Document
                    </Link>
                    <button type="button" onClick={() => { void handleResend('reminder'); setMoreOpen(false) }} disabled={!latestOnboarding?.id} className="rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#102236] hover:bg-slate-50 disabled:opacity-40">Resend Reminder</button>
                    <button type="button" onClick={() => { void handleResend('missing_information'); setMoreOpen(false) }} disabled={!latestOnboarding?.id} className="rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#102236] hover:bg-slate-50 disabled:opacity-40">Request Missing Info</button>
                    <button type="button" onClick={() => { void handleCopyLink(); setMoreOpen(false) }} disabled={!latestOnboarding?.secure_token} className="rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#102236] hover:bg-slate-50 disabled:opacity-40">Copy Onboarding Link</button>
                    <button type="button" onClick={() => { void handleMarkComplete(); setMoreOpen(false) }} disabled={!latestOnboarding?.id} className="rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#102236] hover:bg-slate-50 disabled:opacity-40">Mark Onboarding Complete</button>
                    <Link to="/commercial/properties" state={{ openCommercialCreate: true, commercialCreateDraft: { landlord_id: landlord.id, property_name: '', property_type: 'commercial' } }} onClick={() => setMoreOpen(false)} className="rounded-xl px-3 py-2 text-sm font-semibold text-[#102236] hover:bg-slate-50">Add Property</Link>
                    <Link to="/commercial/vacancies" state={{ openCommercialCreate: true, commercialCreateDraft: { landlord_id: landlord.id } }} onClick={() => setMoreOpen(false)} className="rounded-xl px-3 py-2 text-sm font-semibold text-[#102236] hover:bg-slate-50">Add Vacancy</Link>
                    <button type="button" onClick={() => { setMandateModal({ open: true, record: null }); setMoreOpen(false) }} className="rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#102236] hover:bg-slate-50">Add Mandate</button>
                    <button type="button" onClick={() => { setContactModal({ open: true, type: 'property_manager', record: null }); setMoreOpen(false) }} className="rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#102236] hover:bg-slate-50">Add Contact</button>
                    <button type="button" onClick={() => { setActiveTab('documents'); setMoreOpen(false) }} className="rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#102236] hover:bg-slate-50">Upload Document</button>
                    <button type="button" onClick={() => { setMoreOpen(false); void handleArchiveLandlord() }} className="rounded-xl px-3 py-2 text-left text-sm font-semibold text-rose-700 hover:bg-rose-50">Archive Landlord</button>
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <aside className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_14px_38px_rgba(15,23,42,0.05)]">
            <h2 className="text-base font-semibold text-[#102236]">About {landlord.trading_name || landlord.name || 'Landlord'}</h2>
            <p className="mt-3 text-sm leading-6 text-[#102236]">{aboutText}</p>
            <div className="mt-5 flex items-center justify-between border-t border-slate-200 pt-4 text-sm">
              <span className="font-semibold text-[#102236]">Website</span>
              {landlord.website ? (
                <a href={landlord.website.startsWith('http') ? landlord.website : `https://${landlord.website}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 font-semibold text-blue-700">
                  {landlord.website}
                  <Globe2 size={16} />
                </a>
              ) : <span className="text-slate-500">Not captured</span>}
            </div>
          </aside>
        </div>
      </section>

      {actionState.error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{actionState.error}</div> : null}
      {actionState.notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{actionState.notice}</div> : null}
      {actionState.saving ? <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-500"><Loader2 size={16} className="animate-spin" /> Working...</div> : null}

      <nav className="flex gap-5 overflow-x-auto border-b border-slate-200 bg-white px-3">
        {TABS.map((tab) => {
          const TabIcon = tab.icon
          return (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`inline-flex min-h-12 shrink-0 items-center gap-2 border-b-2 px-1 text-sm font-semibold transition ${activeTab === tab.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-600 hover:text-[#102236]'}`}>
              <TabIcon size={15} />
              {tab.label}
              {tabCounts[tab.id] !== '' && tabCounts[tab.id] !== undefined ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{tabCounts[tab.id]}</span> : null}
            </button>
          )
        })}
      </nav>

      {activeTab === 'overview' ? (
        <section className="grid gap-5">
          <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
            <div className="grid md:grid-cols-2 xl:grid-cols-5">
              <KpiCard label="Properties" value={formatNumber(properties.length)} detail="Total properties" icon={Building2} actionLabel="View all properties" onAction={() => setActiveTab('properties')} />
              <KpiCard label="Total GLA" value={formatNumber(totalGla, 'm²')} detail="Across all properties" icon={Home} actionLabel="View portfolio" onAction={() => setActiveTab('properties')} />
              <KpiCard label="Vacancies" value={formatNumber(activeVacancies.length)} detail="Available spaces" icon={DoorOpen} actionLabel="View vacancies" onAction={() => setActiveTab('vacancies')} />
              <KpiCard label="Vacancy Rate" value={`${formatNumber(vacancyRate)}%`} detail="Portfolio average" icon={BarChart3} actionLabel="View analysis" onAction={() => setActiveTab('overview')} />
              <KpiCard label="Occupied Leases" value={formatNumber(activeLeases.length)} detail="Active leases" icon={FileText} actionLabel="View leases" onAction={() => setActiveTab('leases')} />
            </div>
          </section>

          <section className="grid gap-5 xl:grid-cols-[1fr,1fr,0.9fr]">
            <PortfolioBreakdown rows={propertyTypeBreakdown} total={totalGla} />
            <TopLocations rows={topLocations} />
            <RecentActivityCard rows={recentActivity} />
          </section>

          <section className={CARD_CLASS}>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Active Mandates ({mandates.length})</h2>
                <p className="mt-1 text-sm text-slate-500">Leasing, sales and portfolio instructions linked to this landlord.</p>
              </div>
              <button type="button" onClick={() => setMandateModal({ open: true, record: null })} className="inline-flex min-h-10 items-center gap-2 rounded-2xl bg-[#102b46] px-4 text-sm font-semibold text-white transition hover:bg-[#163a5b]">
                <Plus size={16} />
                Add Mandate
              </button>
            </div>
            {mandates.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Mandate Name</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Properties</th>
                      <th className="px-4 py-3">Start Date</th>
                      <th className="px-4 py-3">Expiry Date</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Owner</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {mandates.map((row) => (
                      <tr key={row.id}>
                        <td className="px-4 py-3 font-semibold text-[#102236]">{row.mandate_name || `${titleize(row.mandate_kind)} Mandate`}</td>
                        <td className="px-4 py-3">{titleize(row.mandate_kind || row.mandate_type)}</td>
                        <td className="px-4 py-3">{row.property_id ? '1' : properties.length || '-'}</td>
                        <td className="px-4 py-3">{formatDate(row.start_date)}</td>
                        <td className="px-4 py-3">{formatDate(row.expiry_date)}</td>
                        <td className="px-4 py-3"><CommercialStatusPill value={row.status || 'active'} /></td>
                        <td className="px-4 py-3">{row.broker_assigned || relationshipOwnerName}</td>
                        <td className="px-4 py-3 text-right">
                          <button type="button" onClick={() => setMandateModal({ open: true, record: row })} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#102236] transition hover:bg-slate-50">Edit</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <CommercialEmptyState title="No active mandates yet" description="Create a mandate when this landlord gives you leasing, sales, portfolio or management authority." primaryActionLabel="Add Mandate" onPrimaryAction={() => setMandateModal({ open: true, record: null })} />
            )}
          </section>
        </section>
      ) : null}

      {activeTab === 'asset_managers' ? (
        <section className={CARD_CLASS}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Asset Managers</h2>
              <p className="mt-1 text-sm text-slate-500">Commercial decision makers and mandate approvers linked to this landlord.</p>
            </div>
            <button type="button" onClick={() => setContactModal({ open: true, type: 'asset_manager', record: null })} className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[#102b46] px-4 text-sm font-semibold text-white transition hover:bg-[#163a5b]">
              <Plus size={16} />
              Add Asset Manager
            </button>
          </div>
          <LinkedList
            rows={(data?.contacts || []).filter((row) => row.contact_type === 'asset_manager')}
            empty="No asset managers linked yet."
            renderTitle={(row) => row.full_name}
            renderDetail={(row) => [row.position, row.email || row.mobile].filter(Boolean).join(' · ')}
            renderMeta={(row) => [row.is_primary ? 'Primary' : '', row.authority_confirmed ? 'Authority confirmed' : ''].filter(Boolean).join(' · ')}
            renderActions={(row) => (
              <button type="button" onClick={(event) => {
                event.preventDefault()
                setContactModal({ open: true, type: 'asset_manager', record: row })
              }} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#102236] transition hover:bg-slate-50">
                Edit
              </button>
            )}
          />
        </section>
      ) : null}

      {activeTab === 'property_managers' ? (
        <section className={CARD_CLASS}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Property Managers</h2>
              <p className="mt-1 text-sm text-slate-500">Operational property contacts responsible for the buildings and day-to-day space updates.</p>
            </div>
            <button type="button" onClick={() => setContactModal({ open: true, type: 'property_manager', record: null })} className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[#102b46] px-4 text-sm font-semibold text-white transition hover:bg-[#163a5b]">
              <Plus size={16} />
              Add Property Manager
            </button>
          </div>
          <LinkedList
            rows={(data?.contacts || []).filter((row) => row.contact_type === 'property_manager')}
            empty="No property managers linked yet."
            renderTitle={(row) => row.full_name}
            renderDetail={(row) => [row.position, row.email || row.mobile, row.portfolio_region].filter(Boolean).join(' · ')}
            renderMeta={(row) => row.is_primary ? 'Primary' : ''}
            renderActions={(row) => (
              <button type="button" onClick={(event) => {
                event.preventDefault()
                setContactModal({ open: true, type: 'property_manager', record: row })
              }} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#102236] transition hover:bg-slate-50">
                Edit
              </button>
            )}
          />
        </section>
      ) : null}

      {activeTab === 'properties' ? (
        <section className={CARD_CLASS}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Properties</h2>
              <p className="mt-1 text-sm text-slate-500">Portfolio properties owned by this landlord.</p>
            </div>
            <Link to="/commercial/properties" state={{ openCommercialCreate: true, commercialCreateDraft: { landlord_id: landlord.id, property_name: '', property_type: 'commercial' } }} className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[#102b46] px-4 text-sm font-semibold text-white transition hover:bg-[#163a5b]">
              <Plus size={16} />
              Add Property
            </Link>
          </div>
          <LinkedList
            rows={properties}
            empty="No properties linked to this landlord yet."
            renderTitle={(row) => row.property_name}
            renderDetail={(row) => {
              const propertyVacancies = vacancies.filter((vacancy) => vacancy.property_id === row.id && !['occupied', 'withdrawn', 'archived'].includes(workspaceLower(vacancy.status)))
              const propertyLeases = leases.filter((lease) => lease.property_id === row.id && ['active', 'executed', 'pending_signature'].includes(workspaceLower(lease.status)))
              return [
                titleize(row.property_type),
                [row.suburb, row.city].filter(Boolean).join(', '),
                formatNumber(row.gla_m2, 'm²'),
                `${row.vacancy_percentage || (row.gla_m2 ? Math.round((workspaceNumber(row.available_space_m2) / workspaceNumber(row.gla_m2)) * 100) : 0)}% vacancy`,
                `${propertyVacancies.length} active vacancies`,
                `${propertyLeases.length} occupied leases`,
              ].filter(Boolean).join(' · ')
            }}
            renderMeta={(row) => titleize(row.status || 'active')}
            renderActions={(row) => (
              <Link to="/commercial/vacancies" state={{ openCommercialCreate: true, commercialCreateDraft: { landlord_id: landlord.id, property_id: row.id } }} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#102236] transition hover:bg-slate-50">Add vacancy</Link>
            )}
            to={(row) => `/commercial/properties/${row.id}`}
          />
        </section>
      ) : null}

      {activeTab === 'vacancies' ? (
        <section className={CARD_CLASS}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Vacancies</h2>
              <p className="mt-1 text-sm text-slate-500">Live space available across the landlord portfolio.</p>
            </div>
            <Link to="/commercial/vacancies" state={{ openCommercialCreate: true, commercialCreateDraft: { landlord_id: landlord.id } }} className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[#102b46] px-4 text-sm font-semibold text-white transition hover:bg-[#163a5b]">
              <Plus size={16} />
              Add Vacancy
            </Link>
          </div>
          <LinkedList
            rows={vacancies}
            empty="No vacancies linked yet."
            renderTitle={(row) => row.vacancy_name || row.unit_or_floor || 'Commercial vacancy'}
            renderDetail={(row) => {
              const property = properties.find((propertyRow) => propertyRow.id === row.property_id)
              return [property?.property_name, row.unit_or_floor, titleize(property?.property_type || row.vacancy_type || 'Commercial'), formatNumber(row.available_area_m2, 'm²'), row.asking_rental ? formatCurrency(row.asking_rental) : '', formatDate(row.availability_date)].filter(Boolean).join(' · ')
            }}
            renderMeta={(row) => titleize(row.status)}
            to={(row) => `/commercial/vacancies/${row.id}`}
          />
        </section>
      ) : null}

      {activeTab === 'mandates' ? (
        <section className={CARD_CLASS}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Mandates</h2>
              <p className="mt-1 text-sm text-slate-500">Leasing and sales mandates captured for this landlord.</p>
            </div>
            <button type="button" onClick={() => setMandateModal({ open: true, record: null })} className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[#102b46] px-4 text-sm font-semibold text-white transition hover:bg-[#163a5b]">
              <Plus size={16} />
              Create Mandate
            </button>
          </div>
          <LinkedList
            rows={data?.mandates || []}
            empty="No mandates linked to this landlord yet."
            renderTitle={(row) => `${titleize(row.mandate_kind)} mandate`}
            renderDetail={(row) => [titleize(row.mandate_type), formatDate(row.start_date), formatDate(row.expiry_date), row.commission_structure].filter(Boolean).join(' · ')}
            renderMeta={(row) => titleize(row.status)}
            renderActions={(row) => (
              <button type="button" onClick={(event) => {
                event.preventDefault()
                setMandateModal({ open: true, record: row })
              }} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#102236] transition hover:bg-slate-50">
                Edit
              </button>
            )}
          />
        </section>
      ) : null}

      {activeTab === 'deals' ? (
        <section className={CARD_CLASS}>
          <LinkedList
            rows={data?.deals || []}
            empty="No deals linked to this landlord yet."
            renderTitle={(row) => row.deal_name || 'Commercial deal'}
            renderDetail={(row) => [titleize(row.deal_type), titleize(row.stage), row.deal_value ? formatCurrency(row.deal_value) : ''].filter(Boolean).join(' · ')}
            renderMeta={(row) => formatDate(row.updated_at)}
            to="/commercial/deals"
          />
        </section>
      ) : null}

      {activeTab === 'leases' ? (
        <section className={CARD_CLASS}>
          <LinkedList
            rows={leases}
            empty="No leases linked to this landlord yet."
            renderTitle={(row) => {
              const tenant = data?.lookups?.tenants?.find((tenantRow) => tenantRow.id === row.tenant_id)
              return tenant?.name || `Lease ${row.id?.slice(0, 8) || ''}`
            }}
            renderDetail={(row) => {
              const property = properties.find((propertyRow) => propertyRow.id === row.property_id)
              return [property?.property_name, row.unit_or_floor, formatDate(row.lease_start_date), formatDate(row.lease_end_date), row.monthly_rental ? `${formatCurrency(row.monthly_rental)}/month` : '', row.escalation_percentage ? `${formatNumber(row.escalation_percentage)}% escalation` : ''].filter(Boolean).join(' · ')
            }}
            renderMeta={(row) => titleize(row.status)}
            renderActions={(row) => (
              <Link to={row.property_id ? `/commercial/properties/${row.property_id}` : '/commercial/properties'} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#102236] transition hover:bg-slate-50">View property</Link>
            )}
          />
        </section>
      ) : null}

      {activeTab === 'contacts' ? (
        <section className={CARD_CLASS}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Contacts</h2>
              <p className="mt-1 text-sm text-slate-500">Manual and onboarding contacts linked to this landlord relationship.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setContactModal({ open: true, type: 'asset_manager', record: null })} className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#102236] transition hover:bg-slate-50">
                <Plus size={16} />
                Add Asset Manager
              </button>
              <button type="button" onClick={() => setContactModal({ open: true, type: 'property_manager', record: null })} className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[#102b46] px-4 text-sm font-semibold text-white transition hover:bg-[#163a5b]">
                <Plus size={16} />
                Add Contact
              </button>
            </div>
          </div>
          <LinkedList
            rows={contacts}
            empty="No contacts linked yet."
            renderTitle={(row) => row.full_name}
            renderDetail={(row) => [
              titleize(row.contact_type || 'contact'),
              row.position,
              row.email || row.mobile,
              row.signing_capacity,
            ].filter(Boolean).join(' · ')}
            renderMeta={(row) => [
              row.is_primary ? 'Primary' : '',
              row.authority_confirmed ? 'Signing authority' : '',
              row.can_approve_mandates ? 'Mandates' : '',
              row.can_approve_leasing_terms ? 'Leasing terms' : '',
              row.can_approve_sales_terms ? 'Sales terms' : '',
            ].filter(Boolean).join(' · ')}
            renderActions={(row) => (
              <button type="button" onClick={(event) => {
                event.preventDefault()
                setContactModal({ open: true, type: row.contact_type || 'property_manager', record: row })
              }} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#102236] transition hover:bg-slate-50">
                Edit
              </button>
            )}
          />
        </section>
      ) : null}

      {activeTab === 'documents' ? (
        <CommercialDocumentLibrary organisationId={organisationId} entityType="commercial_landlord" entityId={landlord.id} />
      ) : null}

      {activeTab === 'activity' ? (
        <section className={CARD_CLASS}>
          <ActivityList rows={data?.activity || []} />
        </section>
      ) : null}

      <CommercialFormModal
        open={editLandlordOpen}
        mode="edit"
        title="Landlords"
        fields={commercialCrudConfigs.landlords.fields}
        record={landlord}
        lookups={{
          brokers: (data?.lookups?.brokers || []).map((row) => ({
            value: row.userId || row.user_id || row.id,
            label: row.fullName || [row.firstName || row.first_name, row.lastName || row.last_name].filter(Boolean).join(' ') || row.email || 'Broker',
          })).filter((row) => row.value),
          branches: (data?.lookups?.branches || []).map((row) => ({ value: row.id, label: row.name || 'Commercial branch' })),
          teams: (data?.lookups?.teams || []).map((row) => ({ value: row.id, label: row.name || 'Commercial team' })),
        }}
        crossValidate={commercialCrudConfigs.landlords.crossValidate}
        onClose={() => setEditLandlordOpen(false)}
        onSubmit={handleSaveLandlord}
      />

      <CommercialLandlordOnboardingInviteModal
        open={inviteOpen}
        landlordOptions={[{
          value: landlord.id,
          label: landlord.legal_name || landlord.name,
          email: landlord.main_email || landlord.email,
          phone: landlord.main_phone || landlord.phone,
          contactPerson: landlord.contact_person,
        }]}
        defaultLandlordId={landlord.id}
        onClose={() => setInviteOpen(false)}
        onSubmit={handleSendOnboarding}
      />

      <ContactModal
        open={contactModal.open}
        type={contactModal.type}
        record={contactModal.record}
        onClose={() => setContactModal({ open: false, type: 'asset_manager', record: null })}
        onSubmit={handleSaveContact}
      />

      <MandateModal
        open={mandateModal.open}
        record={mandateModal.record}
        onClose={() => setMandateModal({ open: false, record: null })}
        onSubmit={handleSaveMandate}
      />
    </div>
  )
}

export default CommercialLandlordWorkspacePage
