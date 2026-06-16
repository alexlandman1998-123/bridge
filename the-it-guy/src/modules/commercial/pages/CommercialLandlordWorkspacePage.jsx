import {
  Activity,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Copy,
  DoorOpen,
  FileText,
  Handshake,
  Home,
  LayoutGrid,
  Loader2,
  Mail,
  Plus,
  Send,
  UserRound,
  Users,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import CommercialDocumentLibrary from '../components/CommercialDocumentLibrary'
import CommercialEmptyState from '../components/CommercialEmptyState'
import CommercialLandlordOnboardingInviteModal from '../components/CommercialLandlordOnboardingInviteModal'
import CommercialStatusPill from '../components/CommercialStatusPill'
import { buildLandlordOnboardingSummary, createEmptyLandlordOnboardingForm } from '../commercialLandlordOnboardingModel'
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
  { id: 'asset_managers', label: 'Asset Managers', icon: UserRound },
  { id: 'property_managers', label: 'Property Managers', icon: Users },
  { id: 'properties', label: 'Properties', icon: Home },
  { id: 'vacancies', label: 'Vacancies', icon: DoorOpen },
  { id: 'mandates', label: 'Mandates', icon: Handshake },
  { id: 'deals', label: 'Deals', icon: Building2 },
  { id: 'leases', label: 'Leases', icon: FileText },
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

function KpiCard({ label, value, detail }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</p>
      <p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-[#102236]">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
    </article>
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

  if (error) return <CommercialEmptyState title="Commercial landlord could not be loaded" description={error} />
  if (loading) return <div className="h-72 animate-pulse rounded-3xl bg-slate-100" />
  if (!landlord) return <CommercialEmptyState title="Landlord not found" description="This commercial landlord may have been archived or sits outside your current scope." />

  const summary = data?.summary || {}
  const latestOnboarding = summary.latestOnboarding || null
  const latestForm = createEmptyLandlordOnboardingForm(latestOnboarding?.form_data || {})
  const onboardingSummaryRows = latestOnboarding ? buildLandlordOnboardingSummary(latestForm) : []

  return (
    <div className="grid gap-5">
      <section className={CARD_CLASS}>
        <Link to="/commercial/landlords" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-[#102236]">
          <ArrowLeft size={16} />
          Landlords
        </Link>
        <div className="mt-4 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <CommercialStatusPill value={landlord.status} />
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">{titleize(landlord.entity_type || landlord.landlord_type || 'landlord')}</span>
              <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{titleize(summary.onboardingStatus || landlord.onboarding_status || 'not_sent')}</span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.055em] text-[#102236]">{landlord.legal_name || landlord.name}</h1>
            <p className="mt-2 text-sm text-slate-500">{landlord.trading_name || landlord.contact_person || 'Commercial landlord workspace'} · {landlord.main_email || landlord.email || 'Email pending'}</p>
          </div>
          <div className="grid min-w-[300px] gap-3 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
            <Link
              to={buildCommercialDocumentGeneratorPath({
                packetType: 'commercial_lease',
                assetCategory: 'office',
                landlordId: landlord.id,
              })}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#102236] transition hover:bg-slate-50"
            >
              <FileText size={16} />
              Generate document
            </Link>
            <button type="button" onClick={() => setInviteOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#102b46] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#163a5b]">
              <Send size={16} />
              {latestOnboarding ? 'Resend Onboarding' : 'Send Onboarding'}
            </button>
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => handleResend('reminder')} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#102236] transition hover:bg-slate-50">
                <Mail size={16} />
                Reminder
              </button>
              <button type="button" onClick={handleCopyLink} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#102236] transition hover:bg-slate-50">
                <Copy size={16} />
                Copy Link
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => handleResend('missing_information')} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#102236] transition hover:bg-slate-50">
                <Mail size={16} />
                Request Missing Info
              </button>
              <button type="button" onClick={handleMarkComplete} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#102236] transition hover:bg-slate-50">
                <CheckCircle2 size={16} />
                Mark Complete
              </button>
            </div>
          </div>
        </div>
      </section>

      {actionState.error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{actionState.error}</div> : null}
      {actionState.notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{actionState.notice}</div> : null}
      {actionState.saving ? <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-500"><Loader2 size={16} className="animate-spin" /> Working...</div> : null}

      <nav className="flex gap-2 overflow-x-auto rounded-3xl border border-slate-200 bg-white p-2 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
        {TABS.map((tab) => (
          <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-2xl px-4 text-sm font-semibold transition ${activeTab === tab.id ? 'bg-[#102b46] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
            <tab.icon size={15} />
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'overview' ? (
        <section className="grid gap-5">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Total Properties" value={formatNumber(summary.totalProperties)} detail="Portfolio assets linked to this landlord." />
            <KpiCard label="Total GLA" value={formatNumber(summary.totalGla, 'm²')} detail="Combined tracked GLA across linked properties." />
            <KpiCard label="Active Vacancies" value={formatNumber(summary.activeVacancies)} detail="Vacancies still open across the portfolio." />
            <KpiCard label="Active Deals" value={formatNumber(summary.activeDeals)} detail="Leasing and sales execution work in flight." />
            <KpiCard label="Leasing Mandates" value={formatNumber(summary.activeLeasingMandates)} detail="Active leasing mandates linked to this landlord." />
            <KpiCard label="Sales Mandates" value={formatNumber(summary.activeSalesMandates)} detail="Active sales mandates linked to this landlord." />
            <KpiCard label="Active Leases" value={formatNumber(summary.activeLeases)} detail="Live lease records associated with the portfolio." />
            <KpiCard label="Onboarding" value={titleize(summary.onboardingStatus || 'not_sent')} detail={latestOnboarding ? `${latestOnboarding.completion_percentage || 0}% complete` : 'No onboarding has been issued yet.'} />
          </section>

          <section className="grid gap-5 xl:grid-cols-[1.2fr,0.8fr]">
            <section className={CARD_CLASS}>
              <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Primary Contacts</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">Primary Asset Manager</p>
                  <p className="mt-1 text-sm font-semibold text-[#102236]">{summary.primaryAssetManager?.full_name || 'Not set'}</p>
                  <p className="mt-1 text-sm text-slate-500">{[summary.primaryAssetManager?.position, summary.primaryAssetManager?.email || summary.primaryAssetManager?.mobile].filter(Boolean).join(' · ') || '-'}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">Primary Property Manager</p>
                  <p className="mt-1 text-sm font-semibold text-[#102236]">{summary.primaryPropertyManager?.full_name || 'Not set'}</p>
                  <p className="mt-1 text-sm text-slate-500">{[summary.primaryPropertyManager?.position, summary.primaryPropertyManager?.email || summary.primaryPropertyManager?.mobile].filter(Boolean).join(' · ') || '-'}</p>
                </div>
              </div>
              <section className="mt-5 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                <h3 className="text-sm font-semibold text-[#102236]">Landlord Details</h3>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">Main Contact</p>
                    <p className="mt-1 text-sm font-semibold text-[#102236]">{summary.mainContact?.full_name || landlord.contact_person || landlord.name}</p>
                  </div>
                  <div>
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">Last Activity</p>
                    <p className="mt-1 text-sm font-semibold text-[#102236]">{formatDate(data?.activity?.[0]?.created_at) || '-'}</p>
                  </div>
                </div>
              </section>
            </section>

            <section className={CARD_CLASS}>
              <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Onboarding Review</h2>
              {latestOnboarding ? (
                <>
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">Status</p>
                        <p className="mt-1 text-sm font-semibold text-[#102236]">{titleize(latestOnboarding.status)}</p>
                      </div>
                      <p className="text-lg font-semibold tracking-[-0.04em] text-[#102236]">{latestOnboarding.completion_percentage || 0}%</p>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-slate-200">
                      <div className="h-2 rounded-full bg-[#102b46]" style={{ width: `${Math.max(6, latestOnboarding.completion_percentage || 0)}%` }} />
                    </div>
                    <p className="mt-3 text-sm text-slate-500">Last email sent {formatDate(latestOnboarding.last_email_sent_at) || 'not yet'}.</p>
                  </div>
                  {latestOnboarding.progress?.missingFieldKeys?.length ? (
                    <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                      <h3 className="text-sm font-semibold text-amber-900">Missing Fields</h3>
                      <p className="mt-2 text-sm leading-6 text-amber-800">{latestOnboarding.progress.missingFieldKeys.slice(0, 8).join(', ')}</p>
                    </section>
                  ) : null}
                  {latestOnboarding.progress?.missingDocumentKeys?.length ? (
                    <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                      <h3 className="text-sm font-semibold text-amber-900">Missing Documents</h3>
                      <p className="mt-2 text-sm leading-6 text-amber-800">{latestOnboarding.progress.missingDocumentKeys.slice(0, 8).join(', ')}</p>
                    </section>
                  ) : null}
                  <section className="mt-4">
                    <RowGrid rows={onboardingSummaryRows.slice(0, 6)} />
                  </section>
                </>
              ) : (
                <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No onboarding has been sent for this landlord yet.</p>
              )}
            </section>
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
            rows={data?.properties || []}
            empty="No properties linked to this landlord yet."
            renderTitle={(row) => row.property_name}
            renderDetail={(row) => [titleize(row.property_type), [row.suburb, row.city].filter(Boolean).join(', '), formatNumber(row.gla_m2, 'm²')].filter(Boolean).join(' · ')}
            renderMeta={(row) => `${(data?.vacancies || []).filter((vacancy) => vacancy.property_id === row.id).length} vacancies`}
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
            rows={data?.vacancies || []}
            empty="No vacancies linked yet."
            renderTitle={(row) => row.vacancy_name || row.unit_or_floor || 'Commercial vacancy'}
            renderDetail={(row) => {
              const property = (data?.properties || []).find((propertyRow) => propertyRow.id === row.property_id)
              return [property?.property_name, formatNumber(row.available_area_m2, 'm²'), row.asking_rental ? formatCurrency(row.asking_rental) : '', formatDate(row.availability_date)].filter(Boolean).join(' · ')
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
            rows={data?.leases || []}
            empty="No leases linked to this landlord yet."
            renderTitle={(row) => `Lease ${row.id?.slice(0, 8) || ''}`}
            renderDetail={(row) => [formatDate(row.lease_start_date), formatDate(row.lease_end_date), row.monthly_rental ? formatCurrency(row.monthly_rental) : ''].filter(Boolean).join(' · ')}
            renderMeta={(row) => titleize(row.status)}
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
