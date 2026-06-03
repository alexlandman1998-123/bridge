import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  FileText,
  Home,
  Mail,
  MessageSquarePlus,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Tag,
  UserRound,
} from 'lucide-react'
import { createElement, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import LoadingSkeleton from '../components/LoadingSkeleton'
import { useWorkspace } from '../context/WorkspaceContext'
import { createAgencyCrmLeadActivity, createAgencyCrmLeadTask } from '../lib/agencyCrmRepository'
import {
  fetchAgentLeadWorkspace,
  filterAgentLeadRows,
  getLeadFilterOptions,
  listAgentLeadWorkspaceRows,
} from '../services/agentLeadWorkspaceService'
import {
  dismissLeadListingInterest,
  listSearchablePrivateListings,
  markLeadListingInterestSent,
  markLeadListingInterestViewed,
  scheduleViewingFromLeadListingInterest,
  updateLeadListingInterestNotes,
  updateLeadListingInterestStatus,
  upsertLeadListingInterest,
} from '../services/leadListingInterestService'
import {
  activateLeadRequirement,
  archiveLeadRequirement,
  buildRequirementFromLeadFallback,
  buildRequirementSummary,
  createLeadRequirement,
  LEAD_REQUIREMENT_FINANCE_STATUSES,
  LEAD_REQUIREMENT_INTENT_TYPES,
  LEAD_REQUIREMENT_STATUSES,
  LEAD_REQUIREMENT_TIMELINES,
  LEAD_REQUIREMENT_URGENCIES,
  pauseLeadRequirement,
  setPrimaryLeadRequirement,
  updateLeadRequirement,
} from '../services/leadRequirementService'
import {
  addMatchesToLead,
  findListingsForRequirement,
} from '../services/leadMatchingService'

const pageShell = 'mx-auto flex w-full max-w-[1480px] flex-col gap-5'
const panelClass = 'rounded-2xl border border-slate-200 bg-white shadow-sm'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function formatDate(value, fallback = '—') {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateTime(value, fallback = '—') {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleString('en-ZA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function formatCurrency(value) {
  const number = Number(value || 0)
  if (!number) return '—'
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(number)
}

function parseListInput(value) {
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean)
  return normalizeText(value).split(/[,;\n]/).map(normalizeText).filter(Boolean)
}

function listToInput(value) {
  return Array.isArray(value) ? value.join(', ') : normalizeText(value)
}

function formatList(value) {
  const items = parseListInput(value)
  return items.length ? items.join(', ') : '—'
}

function makeRequirementDraft(requirement = null, lead = null) {
  const source = requirement || buildRequirementFromLeadFallback(lead || {})
  return {
    title: source.title || '',
    intentType: source.intentType || 'buy',
    propertyCategory: source.propertyCategory || '',
    propertyTypes: listToInput(source.propertyTypes),
    areas: listToInput(source.areas),
    suburbs: listToInput(source.suburbs),
    city: source.city || '',
    province: source.province || '',
    budgetMin: source.budgetMin ?? '',
    budgetMax: source.budgetMax ?? '',
    bedroomsMin: source.bedroomsMin ?? '',
    bathroomsMin: source.bathroomsMin ?? '',
    garagesMin: source.garagesMin ?? '',
    parkingMin: source.parkingMin ?? '',
    erfSizeMin: source.erfSizeMin ?? '',
    floorSizeMin: source.floorSizeMin ?? '',
    mustHaves: listToInput(source.mustHaves),
    niceToHaves: listToInput(source.niceToHaves),
    dealBreakers: listToInput(source.dealBreakers),
    financeStatus: source.financeStatus || 'unknown',
    financeType: source.financeType || '',
    preApproved: source.preApproved === null || source.preApproved === undefined ? '' : String(Boolean(source.preApproved)),
    depositAvailable: source.depositAvailable === null || source.depositAvailable === undefined ? '' : String(Boolean(source.depositAvailable)),
    timeline: source.timeline || '',
    urgency: source.urgency || '',
    communicationPreference: source.communicationPreference || '',
    consentToReceiveMatches: Boolean(source.consentToReceiveMatches),
    notes: source.notes || '',
    status: source.status || 'active',
    isPrimary: Boolean(source.isPrimary),
  }
}

function draftToRequirementPayload(draft = {}, lead = {}, organisationId = '', actor = {}) {
  return {
    organisationId,
    lead,
    leadId: lead.leadId,
    contactId: lead.contactId,
    title: draft.title,
    intentType: draft.intentType || 'buy',
    propertyCategory: draft.propertyCategory,
    propertyTypes: parseListInput(draft.propertyTypes),
    areas: parseListInput(draft.areas),
    suburbs: parseListInput(draft.suburbs),
    city: draft.city,
    province: draft.province,
    budgetMin: draft.budgetMin,
    budgetMax: draft.budgetMax,
    bedroomsMin: draft.bedroomsMin,
    bathroomsMin: draft.bathroomsMin,
    garagesMin: draft.garagesMin,
    parkingMin: draft.parkingMin,
    erfSizeMin: draft.erfSizeMin,
    floorSizeMin: draft.floorSizeMin,
    mustHaves: parseListInput(draft.mustHaves),
    niceToHaves: parseListInput(draft.niceToHaves),
    dealBreakers: parseListInput(draft.dealBreakers),
    financeStatus: draft.financeStatus || 'unknown',
    financeType: draft.financeType,
    preApproved: draft.preApproved,
    depositAvailable: draft.depositAvailable,
    timeline: draft.timeline,
    urgency: draft.urgency,
    communicationPreference: draft.communicationPreference,
    consentToReceiveMatches: draft.consentToReceiveMatches,
    notes: draft.notes,
    status: draft.status || 'active',
    isPrimary: draft.isPrimary,
    createdBy: actor?.id,
  }
}

function getOrganisationId(workspaceContext = {}) {
  return normalizeText(workspaceContext.currentWorkspace?.id || workspaceContext.workspace?.id)
}

function getActor(profile = {}) {
  return {
    id: normalizeText(profile?.id || profile?.user_id || profile?.email),
    userId: normalizeText(profile?.id || profile?.user_id || profile?.email),
    email: normalizeText(profile?.email).toLowerCase(),
    name: normalizeText(profile?.fullName || profile?.full_name || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ')),
    fullName: normalizeText(profile?.fullName || profile?.full_name || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ')),
  }
}

function StatusPill({ children, tone = 'slate' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-rose-50 text-rose-700',
  }
  return <span className={`inline-flex min-h-7 items-center rounded-full px-2.5 text-xs font-semibold ${tones[tone] || tones.slate}`}>{children}</span>
}

function getStageTone(stage = '') {
  const normalized = stage.toLowerCase()
  if (normalized.includes('lost')) return 'red'
  if (normalized.includes('converted') || normalized.includes('accepted') || normalized.includes('registered')) return 'green'
  if (normalized.includes('offer') || normalized.includes('viewing') || normalized.includes('appointment')) return 'amber'
  if (normalized.includes('new') || normalized.includes('contacted') || normalized.includes('qualified')) return 'blue'
  return 'slate'
}

function EmptyState({ title, copy }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">{copy}</p>
    </div>
  )
}

function Field({ label, value }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">{label}</dt>
      <dd className="mt-1 truncate text-sm font-semibold text-slate-900">{value || '—'}</dd>
    </div>
  )
}

function Metric({ label, value, icon }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</span>
        {icon ? createElement(icon, { size: 16, className: 'text-slate-500' }) : null}
      </div>
      <strong className="mt-3 block text-2xl font-semibold tracking-[-0.04em] text-slate-950">{value}</strong>
    </div>
  )
}

function ContactLines({ row }) {
  return (
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-slate-500">
      <span className="inline-flex items-center gap-1"><Phone size={12} />{row.phone || 'No phone'}</span>
      <span className="inline-flex items-center gap-1"><Mail size={12} />{row.email || 'No email'}</span>
    </div>
  )
}

function RequirementForm({ organisationId, lead, actor, requirement = null, onCancel, onSaved }) {
  const [draft, setDraft] = useState(() => makeRequirementDraft(requirement, lead))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function updateField(field, value) {
    setDraft((previous) => ({ ...previous, [field]: value }))
  }

  async function submit(event) {
    event.preventDefault()
    try {
      setSaving(true)
      setError('')
      const payload = draftToRequirementPayload(draft, lead, organisationId, actor)
      if (requirement?.requirementId) {
        await updateLeadRequirement({ requirementId: requirement.requirementId, updates: payload }, { actor })
      } else {
        await createLeadRequirement(payload, { actor })
      }
      await onSaved()
      onCancel()
    } catch (saveError) {
      setError(saveError?.message || 'Unable to save requirement.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <input value={draft.title} onChange={(event) => updateField('title', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Title" />
        <select value={draft.intentType} onChange={(event) => updateField('intentType', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
          {LEAD_REQUIREMENT_INTENT_TYPES.map((option) => <option key={option} value={option}>{option.replace(/_/g, ' ')}</option>)}
        </select>
        <input value={draft.propertyCategory} onChange={(event) => updateField('propertyCategory', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Property category" />
        <input value={draft.propertyTypes} onChange={(event) => updateField('propertyTypes', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Property types" />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <input value={draft.areas} onChange={(event) => updateField('areas', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Areas" />
        <input value={draft.suburbs} onChange={(event) => updateField('suburbs', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Suburbs" />
        <input value={draft.city} onChange={(event) => updateField('city', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="City" />
        <input value={draft.province} onChange={(event) => updateField('province', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Province" />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <input value={draft.budgetMin} onChange={(event) => updateField('budgetMin', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Budget min" />
        <input value={draft.budgetMax} onChange={(event) => updateField('budgetMax', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Budget max" />
        <input value={draft.bedroomsMin} onChange={(event) => updateField('bedroomsMin', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Bedrooms min" />
        <input value={draft.bathroomsMin} onChange={(event) => updateField('bathroomsMin', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Bathrooms min" />
        <input value={draft.garagesMin} onChange={(event) => updateField('garagesMin', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Garages min" />
        <input value={draft.parkingMin} onChange={(event) => updateField('parkingMin', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Parking min" />
        <input value={draft.erfSizeMin} onChange={(event) => updateField('erfSizeMin', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Erf size min" />
        <input value={draft.floorSizeMin} onChange={(event) => updateField('floorSizeMin', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Floor size min" />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <input value={draft.mustHaves} onChange={(event) => updateField('mustHaves', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Must-haves" />
        <input value={draft.niceToHaves} onChange={(event) => updateField('niceToHaves', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Nice-to-haves" />
        <input value={draft.dealBreakers} onChange={(event) => updateField('dealBreakers', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Deal-breakers" />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <select value={draft.financeStatus} onChange={(event) => updateField('financeStatus', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
          {LEAD_REQUIREMENT_FINANCE_STATUSES.map((option) => <option key={option} value={option}>{option.replace(/_/g, ' ')}</option>)}
        </select>
        <input value={draft.financeType} onChange={(event) => updateField('financeType', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Finance type" />
        <select value={draft.preApproved} onChange={(event) => updateField('preApproved', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
          <option value="">Pre-approved unknown</option>
          <option value="true">Pre-approved</option>
          <option value="false">Not pre-approved</option>
        </select>
        <select value={draft.depositAvailable} onChange={(event) => updateField('depositAvailable', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
          <option value="">Deposit unknown</option>
          <option value="true">Deposit available</option>
          <option value="false">No deposit captured</option>
        </select>
        <select value={draft.timeline} onChange={(event) => updateField('timeline', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
          <option value="">Timeline unknown</option>
          {LEAD_REQUIREMENT_TIMELINES.map((option) => <option key={option} value={option}>{option.replace(/_/g, ' ')}</option>)}
        </select>
        <select value={draft.urgency} onChange={(event) => updateField('urgency', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
          <option value="">Urgency unknown</option>
          {LEAD_REQUIREMENT_URGENCIES.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <input value={draft.communicationPreference} onChange={(event) => updateField('communicationPreference', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Communication preference" />
        <select value={draft.status} onChange={(event) => updateField('status', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
          {LEAD_REQUIREMENT_STATUSES.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-center">
        <textarea value={draft.notes} onChange={(event) => updateField('notes', event.target.value)} className="min-h-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" placeholder="Notes" />
        <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={draft.consentToReceiveMatches} onChange={(event) => updateField('consentToReceiveMatches', event.target.checked)} />
          Consent to matches
        </label>
        <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={draft.isPrimary} onChange={(event) => updateField('isPrimary', event.target.checked)} />
          Primary
        </label>
      </div>

      {error ? <p className="mt-3 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancel} className="min-h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700">Cancel</button>
        <button type="submit" disabled={saving} className="min-h-10 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:bg-slate-300">{saving ? 'Saving...' : 'Save Requirement'}</button>
      </div>
    </form>
  )
}

function MatchReasonList({ reasons = [] }) {
  const visibleReasons = Array.isArray(reasons) ? reasons.slice(0, 5) : []
  if (!visibleReasons.length) return <p className="text-xs text-slate-500">No scoring reasons available.</p>
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {visibleReasons.map((reason, index) => {
        const type = reason?.type || 'match'
        const text = typeof reason === 'string' ? reason : reason?.text
        const tone = type === 'match'
          ? 'bg-emerald-50 text-emerald-700'
          : type === 'missing'
            ? 'bg-amber-50 text-amber-700'
            : 'bg-rose-50 text-rose-700'
        return <span key={`match-reason-${index}`} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{text}</span>
      })}
    </div>
  )
}

function RequirementMatchPanel({ organisationId, lead, requirement, actor, onSaved }) {
  const [loading, setLoading] = useState(true)
  const [matches, setMatches] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadMatches = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const result = await findListingsForRequirement({ organisationId, requirementId: requirement.requirementId })
      setMatches(result.matches || [])
    } catch (loadError) {
      setMatches([])
      setError(loadError?.message || 'Unable to find matches.')
    } finally {
      setLoading(false)
    }
  }, [organisationId, requirement.requirementId])

  useEffect(() => {
    void loadMatches()
  }, [loadMatches])

  function toggleListing(listingId) {
    setSelectedIds((previous) => previous.includes(listingId)
      ? previous.filter((id) => id !== listingId)
      : [...previous, listingId])
  }

  async function addSelected() {
    try {
      setSaving(true)
      setError('')
      const saved = await addMatchesToLead(
        {
          organisationId,
          leadId: lead.leadId,
          requirementId: requirement.requirementId,
          listingIds: selectedIds,
        },
        { actor },
      )
      setMessage(`${saved.length} listing${saved.length === 1 ? '' : 's'} added to Interested Listings.`)
      setSelectedIds([])
      await onSaved()
      await loadMatches()
    } catch (saveError) {
      setError(saveError?.message || 'Unable to add selected matches.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h4 className="text-sm font-semibold text-slate-950">Matching Listings</h4>
          <p className="mt-1 text-sm text-slate-500">Deterministic scoring from existing private listings. Agents choose what gets linked.</p>
        </div>
        <button type="button" onClick={addSelected} disabled={saving || !selectedIds.length} className="min-h-10 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:bg-slate-300">
          {saving ? 'Adding...' : `Add Selected (${selectedIds.length})`}
        </button>
      </div>
      {message ? <p className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="mt-3 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {loading ? <LoadingSkeleton lines={5} className="mt-4 rounded-2xl border border-slate-200 bg-white" /> : null}
      {!loading ? (
        <div className="mt-4 grid gap-3">
          {matches.length ? matches.map((match) => {
            const selected = selectedIds.includes(match.id)
            const hasMissingData = match.matchReasons?.some((reason) => reason?.type === 'missing')
            return (
              <article key={match.id} className={`rounded-2xl border bg-white p-4 shadow-sm ${selected ? 'border-blue-300 ring-2 ring-blue-100' : 'border-slate-200'}`}>
                <div className="grid gap-4 lg:grid-cols-[auto_120px_1fr_auto] lg:items-start">
                  <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <input type="checkbox" checked={selected} onChange={() => toggleListing(match.id)} />
                    Select
                  </label>
                  <div className="flex h-24 items-center justify-center overflow-hidden rounded-2xl bg-slate-100 text-slate-400">
                    {match.imageUrl ? <img src={match.imageUrl} alt="" className="h-full w-full object-cover" /> : <Home size={22} />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h5 className="truncate text-sm font-semibold text-slate-950">{match.title || 'Untitled listing'}</h5>
                      {match.alreadyLinked ? <StatusPill tone="amber">Already linked</StatusPill> : null}
                      {hasMissingData ? <StatusPill tone="amber">Missing data</StatusPill> : null}
                      <StatusPill>{match.status || 'Status unknown'}</StatusPill>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{[match.address, match.suburb, match.city].filter(Boolean).join(', ') || 'Address pending'}</p>
                    <p className="mt-2 text-sm font-semibold text-blue-700">{formatCurrency(match.price)}</p>
                    <ListingSpecs listing={match} />
                    <MatchReasonList reasons={match.matchReasons} />
                    {match.id ? <Link to={`/agent/listings/${match.id}`} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-blue-700">Open listing <ExternalLink size={13} /></Link> : null}
                  </div>
                  <div className="rounded-2xl bg-slate-900 px-4 py-3 text-center text-white">
                    <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-300">Score</span>
                    <strong className="mt-1 block text-2xl font-semibold">{match.matchScore}</strong>
                  </div>
                </div>
              </article>
            )
          }) : <EmptyState title="No listing matches found" copy="Create or activate listings with price, location, and property details before matching this requirement." />}
        </div>
      ) : null}
    </section>
  )
}

function RequirementCard({ requirement, lead, organisationId, actor, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [showMatches, setShowMatches] = useState(false)
  const [working, setWorking] = useState('')
  const summary = buildRequirementSummary(requirement)

  async function runAction(action) {
    try {
      setWorking(action)
      if (action === 'primary') await setPrimaryLeadRequirement({ leadId: lead.leadId, requirementId: requirement.requirementId }, { actor })
      if (action === 'pause') await pauseLeadRequirement({ requirementId: requirement.requirementId }, { actor })
      if (action === 'archive') await archiveLeadRequirement({ requirementId: requirement.requirementId }, { actor })
      if (action === 'activate') await activateLeadRequirement({ requirementId: requirement.requirementId }, { actor })
      await onSaved()
    } finally {
      setWorking('')
    }
  }

  if (editing) {
    return <RequirementForm organisationId={organisationId} lead={lead} actor={actor} requirement={requirement} onCancel={() => setEditing(false)} onSaved={onSaved} />
  }

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-slate-950">{requirement.title || summary}</h3>
            {requirement.isPrimary ? <StatusPill tone="green">Primary</StatusPill> : null}
            <StatusPill tone={requirement.status === 'active' ? 'blue' : 'slate'}>{requirement.status}</StatusPill>
            <StatusPill>{requirement.intentType}</StatusPill>
          </div>
          <p className="mt-2 text-sm font-semibold text-blue-700">{summary}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!requirement.isPrimary && requirement.status !== 'archived' ? <button type="button" onClick={() => runAction('primary')} disabled={Boolean(working)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">Set Primary</button> : null}
          {requirement.status === 'active' ? <button type="button" onClick={() => runAction('pause')} disabled={Boolean(working)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">Pause</button> : <button type="button" onClick={() => runAction('activate')} disabled={Boolean(working)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">Activate</button>}
          {requirement.status !== 'archived' ? <button type="button" onClick={() => runAction('archive')} disabled={Boolean(working)} className="rounded-xl border border-rose-100 px-3 py-2 text-xs font-semibold text-rose-700">Archive</button> : null}
          {requirement.status === 'active' ? <button type="button" onClick={() => setShowMatches((value) => !value)} className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">Find Matches</button> : null}
          <button type="button" onClick={() => setEditing(true)} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white">Edit</button>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Property Types" value={formatList(requirement.propertyTypes)} />
        <Field label="Areas" value={formatList(requirement.areas)} />
        <Field label="Suburbs" value={formatList(requirement.suburbs)} />
        <Field label="Budget" value={requirement.budgetMin || requirement.budgetMax ? `${requirement.budgetMin ? formatCurrency(requirement.budgetMin) : 'No min'} - ${requirement.budgetMax ? formatCurrency(requirement.budgetMax) : 'No max'}` : '—'} />
        <Field label="Bedrooms Min" value={requirement.bedroomsMin} />
        <Field label="Bathrooms Min" value={requirement.bathroomsMin} />
        <Field label="Must-Haves" value={formatList(requirement.mustHaves)} />
        <Field label="Finance" value={requirement.financeStatus} />
        <Field label="Timeline" value={requirement.timeline} />
        <Field label="Urgency" value={requirement.urgency} />
        <Field label="Consent" value={requirement.consentToReceiveMatches ? 'Yes' : 'No'} />
        <Field label="Updated" value={formatDateTime(requirement.updatedAt)} />
      </dl>
      {requirement.notes ? <p className="mt-4 whitespace-pre-wrap rounded-2xl bg-slate-50 p-3 text-sm leading-6 text-slate-600">{requirement.notes}</p> : null}
      {showMatches ? (
        <RequirementMatchPanel
          organisationId={organisationId}
          lead={lead}
          requirement={requirement}
          actor={actor}
          onSaved={onSaved}
        />
      ) : null}
    </article>
  )
}

function LeadRequirementsPanel({ organisationId, lead, requirements = [], actor, onSaved }) {
  const [showForm, setShowForm] = useState(false)
  const [creatingFromLegacy, setCreatingFromLegacy] = useState(false)
  const hasLegacy = Boolean(lead.budget || lead.areaInterest || lead.area_interest || lead.propertyInterest || lead.property_interest)

  async function createFromLegacy() {
    try {
      setCreatingFromLegacy(true)
      await createLeadRequirement(buildRequirementFromLeadFallback({ ...lead, organisationId }), { actor })
      await onSaved()
    } finally {
      setCreatingFromLegacy(false)
    }
  }

  return (
    <section className={`${panelClass} p-5`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">Requirements</h2>
          <p className="mt-1 text-sm text-slate-500">Structured lead intent for manual matching later. Existing loose lead fields are preserved as fallback context.</p>
        </div>
        <button type="button" onClick={() => setShowForm((value) => !value)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white">
          <Plus size={15} />
          {showForm ? 'Close' : 'Add Requirement'}
        </button>
      </div>

      {showForm ? (
        <div className="mt-5">
          <RequirementForm organisationId={organisationId} lead={lead} actor={actor} onCancel={() => setShowForm(false)} onSaved={onSaved} />
        </div>
      ) : null}

      {!requirements.length && hasLegacy ? (
        <div className="mt-5 rounded-2xl border border-amber-100 bg-amber-50 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-amber-950">Legacy lead details</h3>
              <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                <Field label="Budget" value={lead.budget ? formatCurrency(lead.budget) : '—'} />
                <Field label="Area Interest" value={lead.areaInterest || lead.area_interest} />
                <Field label="Property Interest" value={lead.propertyInterest || lead.property_interest} />
              </dl>
            </div>
            <button type="button" onClick={createFromLegacy} disabled={creatingFromLegacy} className="min-h-10 rounded-xl bg-amber-900 px-4 text-sm font-semibold text-white disabled:bg-amber-300">
              {creatingFromLegacy ? 'Creating...' : 'Create structured requirement from existing lead details'}
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4">
        {requirements.length ? requirements.map((requirement) => (
          <RequirementCard
            key={requirement.requirementId}
            requirement={requirement}
            lead={lead}
            organisationId={organisationId}
            actor={actor}
            onSaved={onSaved}
          />
        )) : <EmptyState title="No structured requirements yet" copy="Capture what this lead is looking for before manual matching is introduced." />}
      </div>
    </section>
  )
}

function ListingSpecs({ listing }) {
  const specs = [
    listing?.bedrooms ? `${listing.bedrooms} bed` : '',
    listing?.bathrooms ? `${listing.bathrooms} bath` : '',
    listing?.garages ? `${listing.garages} garage` : '',
    listing?.coveredParking || listing?.openParking ? `${Number(listing.coveredParking || 0) + Number(listing.openParking || 0)} parking` : '',
  ].filter(Boolean)
  return specs.length ? <p className="mt-1 text-xs text-slate-500">{specs.join(' • ')}</p> : null
}

function InterestStatusActions({ interest, onAction }) {
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => onAction('sent', interest)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Mark Sent</button>
      <button type="button" onClick={() => onAction('viewed', interest)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Mark Viewed</button>
      <button type="button" onClick={() => onAction('viewing_scheduled', interest)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Viewing Scheduled</button>
      <button type="button" onClick={() => onAction('dismissed', interest)} className="rounded-xl border border-rose-100 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50">Dismiss</button>
    </div>
  )
}

function AddListingToLeadPanel({ organisationId, lead, requirements = [], actor, onSaved }) {
  const [open, setOpen] = useState(false)
  const primaryRequirement = requirements.find((requirement) => requirement.isPrimary) || requirements[0] || null
  const [filters, setFilters] = useState({ search: '', status: 'all', minPrice: '', maxPrice: '', requirementId: primaryRequirement?.requirementId || '' })
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState('')

  const searchListings = useCallback(async () => {
    if (!open) return
    try {
      setLoading(true)
      setError('')
      const result = await listSearchablePrivateListings({ organisationId, ...filters })
      setRows(result.slice(0, 30))
    } catch (loadError) {
      setRows([])
      setError(loadError?.message || 'Unable to search listings.')
    } finally {
      setLoading(false)
    }
  }, [filters, open, organisationId])

  useEffect(() => {
    void searchListings()
  }, [searchListings])

  async function addListing(listing) {
    try {
      setSavingId(listing.id)
      await upsertLeadListingInterest(
        {
          organisationId,
          lead,
          contactId: lead.contactId,
          listing,
          requirementId: filters.requirementId,
          source: 'manual',
          status: 'interested',
          isAgentSelected: true,
          createdBy: actor?.id,
        },
        { actor },
      )
      await onSaved()
      setOpen(false)
    } finally {
      setSavingId('')
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">Add Listing</h3>
          <p className="mt-1 text-sm text-slate-500">Search current private listings and link one to this lead.</p>
        </div>
        <button type="button" onClick={() => setOpen((value) => !value)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white">
          <Plus size={15} />
          {open ? 'Close' : 'Add Listing'}
        </button>
      </div>
      {open ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-2 md:grid-cols-[1fr_150px_140px_140px]">
            <input value={filters.search} onChange={(event) => setFilters((previous) => ({ ...previous, search: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300" placeholder="Search address, title, suburb" />
            <select value={filters.status} onChange={(event) => setFilters((previous) => ({ ...previous, status: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="seller_lead">Seller lead</option>
              <option value="under_offer">Under offer</option>
              <option value="sold">Sold</option>
            </select>
            <input value={filters.minPrice} onChange={(event) => setFilters((previous) => ({ ...previous, minPrice: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Min price" />
            <input value={filters.maxPrice} onChange={(event) => setFilters((previous) => ({ ...previous, maxPrice: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Max price" />
          </div>
          {requirements.length ? (
            <select value={filters.requirementId} onChange={(event) => setFilters((previous) => ({ ...previous, requirementId: event.target.value }))} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm">
              <option value="">No requirement link</option>
              {requirements.map((requirement) => <option key={requirement.requirementId} value={requirement.requirementId}>{buildRequirementSummary(requirement)}</option>)}
            </select>
          ) : null}
          {error ? <p className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
          <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
            {loading ? <LoadingSkeleton lines={4} className="rounded-2xl border border-slate-200 bg-white" /> : null}
            {!loading && rows.length ? rows.map((listing) => (
              <article key={listing.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 gap-3">
                  <div className="flex h-20 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-slate-400">
                    {listing.imageUrl ? <img src={listing.imageUrl} alt="" className="h-full w-full object-cover" /> : <Home size={20} />}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">{listing.title}</p>
                    <p className="mt-1 truncate text-sm text-slate-500">{[listing.address, listing.suburb, listing.city].filter(Boolean).join(', ') || 'Address pending'}</p>
                    <p className="mt-1 text-sm font-semibold text-blue-700">{formatCurrency(listing.price)}</p>
                    <ListingSpecs listing={listing} />
                  </div>
                </div>
                <button type="button" onClick={() => addListing(listing)} disabled={savingId === listing.id} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white disabled:bg-slate-300">
                  {savingId === listing.id ? 'Adding...' : 'Link'}
                </button>
              </article>
            )) : null}
            {!loading && !rows.length ? <EmptyState title="No listings found" copy="Try a broader address, suburb, price, or status filter." /> : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}

function LeadListingInterestsPanel({ organisationId, lead, interests = [], requirements = [], actor, onSaved }) {
  const [noteDrafts, setNoteDrafts] = useState({})
  const [scheduleDrafts, setScheduleDrafts] = useState({})
  const [workingId, setWorkingId] = useState('')
  const [error, setError] = useState('')
  const requirementById = useMemo(() => new Map(requirements.map((requirement) => [requirement.requirementId, requirement])), [requirements])

  async function handleAction(action, interest) {
    try {
      setWorkingId(interest.interestId)
      setError('')
      if (action === 'sent') await markLeadListingInterestSent({ interestId: interest.interestId }, { actor })
      else if (action === 'viewed') await markLeadListingInterestViewed({ interestId: interest.interestId }, { actor })
      else if (action === 'dismissed') await dismissLeadListingInterest({ interestId: interest.interestId, reason: noteDrafts[interest.interestId] || 'Dismissed by agent.' }, { actor })
      else await updateLeadListingInterestStatus({ interestId: interest.interestId, status: action }, { actor })
      await onSaved()
    } catch (actionError) {
      setError(actionError?.message || 'Unable to update listing interest.')
    } finally {
      setWorkingId('')
    }
  }

  async function saveNote(interest) {
    try {
      setWorkingId(interest.interestId)
      setError('')
      await updateLeadListingInterestNotes({ interestId: interest.interestId, notes: noteDrafts[interest.interestId] ?? interest.notes ?? '' }, { actor })
      await onSaved()
    } catch (noteError) {
      setError(noteError?.message || 'Unable to save note.')
    } finally {
      setWorkingId('')
    }
  }

  async function scheduleViewing(interest) {
    const draft = scheduleDrafts[interest.interestId] || {}
    if (!draft.date || !draft.time) {
      setError('Choose a viewing date and time first.')
      return
    }
    try {
      setWorkingId(interest.interestId)
      setError('')
      await scheduleViewingFromLeadListingInterest({
        organisationId,
        interest,
        date: draft.date,
        time: draft.time,
        notes: draft.notes || interest.notes || '',
        actor,
      })
      await onSaved()
    } catch (scheduleError) {
      setError(scheduleError?.message || 'Unable to schedule viewing.')
    } finally {
      setWorkingId('')
    }
  }

  return (
    <section className={`${panelClass} p-5`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">Interested Listings</h2>
          <p className="mt-1 text-sm text-slate-500">Canonical lead-to-listing relationships. No matching or transaction creation happens here.</p>
        </div>
        <StatusPill>{interests.length} linked</StatusPill>
      </div>
      <div className="mt-5">
        <AddListingToLeadPanel organisationId={organisationId} lead={lead} requirements={requirements} actor={actor} onSaved={onSaved} />
      </div>
      {error ? <p className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      <div className="mt-5 grid gap-4">
        {interests.length ? interests.map((interest) => {
          const listing = interest.listing || {}
          const draft = scheduleDrafts[interest.interestId] || {}
          const requirement = requirementById.get(interest.requirementId) || null
          return (
            <article key={interest.interestId} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="grid gap-4 lg:grid-cols-[160px_1fr]">
                <div className="flex h-36 items-center justify-center overflow-hidden rounded-2xl bg-slate-100 text-slate-400">
                  {listing.imageUrl ? <img src={listing.imageUrl} alt="" className="h-full w-full object-cover" /> : <Home size={24} />}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-semibold text-slate-950">{listing.title || 'Listing details unavailable'}</h3>
                      <p className="mt-1 text-sm text-slate-500">{[listing.address, listing.suburb, listing.city].filter(Boolean).join(', ') || 'Address pending'}</p>
                      <p className="mt-2 text-sm font-semibold text-blue-700">{formatCurrency(listing.price)}</p>
                      <ListingSpecs listing={listing} />
                    </div>
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <StatusPill tone={getStageTone(interest.status)}>{interest.status.replace(/_/g, ' ')}</StatusPill>
                      <StatusPill>{interest.source}</StatusPill>
                      {interest.isOriginalEnquiry ? <StatusPill tone="blue">Original enquiry</StatusPill> : null}
                      {interest.isAgentSelected ? <StatusPill tone="blue">Agent selected</StatusPill> : null}
                      {requirement ? <StatusPill tone="blue">Requirement linked</StatusPill> : null}
                      {interest.matchScore !== null && interest.matchScore !== undefined ? <StatusPill tone="green">{interest.matchScore}% match</StatusPill> : null}
                    </div>
                  </div>
                  {requirement ? <p className="mt-2 text-xs font-semibold text-slate-500">Requirement: {buildRequirementSummary(requirement)}</p> : null}
                  {interest.matchReasons?.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {interest.matchReasons.map((reason, index) => (
                        <span key={`${interest.interestId}-reason-${index}`} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{typeof reason === 'string' ? reason : reason?.text || JSON.stringify(reason)}</span>
                      ))}
                    </div>
                  ) : null}
                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="Created" value={formatDate(interest.createdAt)} />
                    <Field label="Updated" value={formatDateTime(interest.updatedAt)} />
                    <Field label="Sent" value={formatDateTime(interest.sentAt)} />
                    <Field label="Viewed" value={formatDateTime(interest.viewedAt)} />
                  </dl>
                  <div className="mt-4">
                    <InterestStatusActions interest={interest} onAction={handleAction} />
                  </div>
                  <div className="mt-4 grid gap-2 lg:grid-cols-[1fr_auto]">
                    <input
                      value={noteDrafts[interest.interestId] ?? interest.notes ?? ''}
                      onChange={(event) => setNoteDrafts((previous) => ({ ...previous, [interest.interestId]: event.target.value }))}
                      className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-300"
                      placeholder="Add note"
                    />
                    <button type="button" onClick={() => saveNote(interest)} disabled={workingId === interest.interestId} className="rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">Save Note</button>
                  </div>
                  <div className="mt-3 grid gap-2 lg:grid-cols-[150px_130px_1fr_auto]">
                    <input type="date" value={draft.date || ''} onChange={(event) => setScheduleDrafts((previous) => ({ ...previous, [interest.interestId]: { ...draft, date: event.target.value } }))} className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm" />
                    <input type="time" value={draft.time || ''} onChange={(event) => setScheduleDrafts((previous) => ({ ...previous, [interest.interestId]: { ...draft, time: event.target.value } }))} className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm" />
                    <input value={draft.notes || ''} onChange={(event) => setScheduleDrafts((previous) => ({ ...previous, [interest.interestId]: { ...draft, notes: event.target.value } }))} className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm" placeholder="Viewing notes" />
                    <button type="button" onClick={() => scheduleViewing(interest)} disabled={workingId === interest.interestId} className="rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white disabled:bg-slate-300">Schedule</button>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    {listing.id ? <Link to={`/agent/listings/${listing.id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700">Open listing <ExternalLink size={13} /></Link> : null}
                    {interest.offers?.length ? <span className="text-sm font-semibold text-slate-600">{interest.offers.length} existing offer{interest.offers.length === 1 ? '' : 's'} linked</span> : <span className="text-sm text-slate-500">No existing offer linked</span>}
                  </div>
                </div>
              </div>
            </article>
          )
        }) : <EmptyState title="No interested listings yet" copy="Use Add Listing to create the first canonical lead-listing relationship." />}
      </div>
    </section>
  )
}

function AgentLeadList() {
  const workspaceContext = useWorkspace()
  const navigate = useNavigate()
  const organisationId = getOrganisationId(workspaceContext)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rows, setRows] = useState([])
  const [filters, setFilters] = useState({ search: '', stage: 'all', source: 'all', agent: 'all', createdFrom: '', createdTo: '' })

  const loadRows = useCallback(async () => {
    if (!organisationId) {
      setRows([])
      setLoading(false)
      setError('Select an agency workspace before loading leads.')
      return
    }
    try {
      setLoading(true)
      setError('')
      const result = await listAgentLeadWorkspaceRows({ organisationId })
      setRows(result.rows)
    } catch (loadError) {
      setRows([])
      setError(loadError?.message || 'Unable to load leads right now.')
    } finally {
      setLoading(false)
    }
  }, [organisationId])

  useEffect(() => {
    void loadRows()
  }, [loadRows])

  const options = useMemo(() => getLeadFilterOptions(rows), [rows])
  const visibleRows = useMemo(() => filterAgentLeadRows(rows, filters), [rows, filters])
  const kpis = useMemo(() => ({
    total: rows.length,
    openTasks: rows.reduce((sum, row) => sum + row.tasks.filter((task) => !['completed', 'cancelled'].includes(String(task.status || '').toLowerCase())).length, 0),
    viewings: rows.reduce((sum, row) => sum + row.appointmentCount, 0),
    converted: rows.filter((row) => row.transactionCount || row.convertedTransactionId || String(row.stage || '').toLowerCase().includes('converted')).length,
  }), [rows])

  return (
    <main className={pageShell}>
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Agent Workspace</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.045em] text-slate-950">Leads</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">Existing CRM leads, contacts, activities, tasks, appointments, offers, and transaction links in one operational view.</p>
        </div>
        <button type="button" onClick={loadRows} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
          <RefreshCw size={15} />
          Refresh
        </button>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Visible Leads" value={visibleRows.length} icon={UserRound} />
        <Metric label="All Leads" value={kpis.total} icon={Tag} />
        <Metric label="Linked Appointments" value={kpis.viewings} icon={CalendarDays} />
        <Metric label="Converted / Tx" value={kpis.converted} icon={CheckCircle2} />
      </section>

      <section className={`${panelClass} p-4`}>
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1.4fr)_repeat(4,minmax(150px,1fr))]">
          <label className="relative block">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={filters.search}
              onChange={(event) => setFilters((previous) => ({ ...previous, search: event.target.value }))}
              className="min-h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-300"
              placeholder="Search name, phone, email"
            />
          </label>
          <select value={filters.stage} onChange={(event) => setFilters((previous) => ({ ...previous, stage: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700">
            <option value="all">All stages</option>
            {options.stages.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <select value={filters.source} onChange={(event) => setFilters((previous) => ({ ...previous, source: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700">
            <option value="all">All sources</option>
            {options.sources.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <select value={filters.agent} onChange={(event) => setFilters((previous) => ({ ...previous, agent: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700">
            <option value="all">All agents</option>
            {options.agents.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={filters.createdFrom} onChange={(event) => setFilters((previous) => ({ ...previous, createdFrom: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700" aria-label="Created from" />
            <input type="date" value={filters.createdTo} onChange={(event) => setFilters((previous) => ({ ...previous, createdTo: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700" aria-label="Created to" />
          </div>
        </div>
      </section>

      {loading ? <LoadingSkeleton lines={10} className={panelClass} /> : null}
      {error && !loading ? <EmptyState title="Leads could not be loaded" copy={error} /> : null}
      {!loading && !error ? (
        <section className={`${panelClass} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1280px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-semibold">Lead</th>
                  <th className="px-4 py-3 font-semibold">Requirement</th>
                  <th className="px-4 py-3 font-semibold">Source</th>
                  <th className="px-4 py-3 font-semibold">Status / Stage</th>
                  <th className="px-4 py-3 font-semibold">Owner</th>
                  <th className="px-4 py-3 font-semibold">Latest Activity</th>
                  <th className="px-4 py-3 font-semibold">Next Follow-up</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                  <th className="px-4 py-3 font-semibold">Links</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRows.map((row) => (
                  <tr key={row.leadId} className="align-top hover:bg-slate-50/80">
                    <td className="px-4 py-4">
                      <button type="button" onClick={() => navigate(`/pipeline/leads/${row.leadId}`)} className="text-left">
                        <span className="block font-semibold text-slate-950">{row.name}</span>
                        <ContactLines row={row} />
                      </button>
                    </td>
                    <td className="px-4 py-4">
                      <span className="block max-w-[230px] text-sm font-medium text-slate-700">{row.requirementSummary || 'No structured requirement'}</span>
                    </td>
                    <td className="px-4 py-4 text-slate-700">{row.source}</td>
                    <td className="px-4 py-4"><StatusPill tone={getStageTone(row.stage)}>{row.stage}</StatusPill></td>
                    <td className="px-4 py-4 text-slate-700">{row.assignedAgent}</td>
                    <td className="px-4 py-4 text-slate-600">
                      <span className="block font-medium text-slate-800">{row.latestActivity?.activityType || row.latestActivity?.activity_type || 'No activity'}</span>
                      <span className="mt-1 block max-w-[220px] truncate text-xs text-slate-500">{row.latestActivity?.activityNote || row.latestActivity?.activity_note || formatDateTime(row.latestActivity?.activityDate || row.latestActivity?.activity_date, '')}</span>
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      <span className="block font-medium text-slate-800">{row.nextTask?.title || 'No task'}</span>
                      <span className="mt-1 block text-xs text-slate-500">{row.nextTask?.dueDate || row.nextTask?.due_date ? formatDate(row.nextTask.dueDate || row.nextTask.due_date) : '—'}</span>
                    </td>
                    <td className="px-4 py-4 text-slate-600">{formatDate(row.createdAt)}</td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        <StatusPill>{row.listingCount} listing</StatusPill>
                        <StatusPill>{row.appointmentCount} appt</StatusPill>
                        <StatusPill tone={row.offerCount ? 'amber' : 'slate'}>{row.offerCount} offer</StatusPill>
                        <StatusPill tone={row.transactionCount ? 'green' : 'slate'}>{row.transactionCount} tx</StatusPill>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <button type="button" onClick={() => navigate(`/pipeline/leads/${row.leadId}`)} className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-700">
                        Open <ExternalLink size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!visibleRows.length ? <div className="p-5"><EmptyState title="No leads match these filters" copy="Existing leads will remain visible even when contact details or source values are incomplete." /></div> : null}
        </section>
      ) : null}
    </main>
  )
}

function ActivityForm({ organisationId, leadId, actor, onSaved }) {
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event) {
    event.preventDefault()
    if (!normalizeText(note)) return
    try {
      setSaving(true)
      await createAgencyCrmLeadActivity(organisationId, leadId, { activityType: 'Note', activityNote: note, outcome: 'Logged from Lead Workspace' }, { actor })
      setNote('')
      await onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-2 sm:flex-row">
      <input value={note} onChange={(event) => setNote(event.target.value)} className="min-h-11 flex-1 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-300" placeholder="Add an activity note" />
      <button type="submit" disabled={saving || !normalizeText(note)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300">
        <MessageSquarePlus size={15} />
        Add Activity
      </button>
    </form>
  )
}

function TaskForm({ organisationId, leadId, actor, onSaved }) {
  const [draft, setDraft] = useState({ title: '', dueDate: '' })
  const [saving, setSaving] = useState(false)

  async function submit(event) {
    event.preventDefault()
    if (!normalizeText(draft.title)) return
    try {
      setSaving(true)
      await createAgencyCrmLeadTask(organisationId, leadId, { title: draft.title, dueDate: draft.dueDate || null, status: 'Pending', priority: 'Medium' }, { actor })
      setDraft({ title: '', dueDate: '' })
      await onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 grid gap-2 sm:grid-cols-[1fr_170px_auto]">
      <input value={draft.title} onChange={(event) => setDraft((previous) => ({ ...previous, title: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-300" placeholder="New follow-up task" />
      <input type="date" value={draft.dueDate} onChange={(event) => setDraft((previous) => ({ ...previous, dueDate: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-300" />
      <button type="submit" disabled={saving || !normalizeText(draft.title)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300">
        <Plus size={15} />
        Add Task
      </button>
    </form>
  )
}

function TimelineList({ items = [] }) {
  if (!items.length) return <EmptyState title="No activity yet" copy="Calls, notes, WhatsApps, emails, and system lead events will appear here when they are logged." />
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <article key={item.activityId || item.activity_id || `${item.activityType}-${item.activityDate}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <strong className="text-sm text-slate-950">{item.activityType || item.activity_type || 'Activity'}</strong>
            <span className="text-xs font-semibold text-slate-500">{formatDateTime(item.activityDate || item.activity_date || item.createdAt || item.created_at)}</span>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{item.activityNote || item.activity_note || item.outcome || 'No note captured.'}</p>
        </article>
      ))}
    </div>
  )
}

function TaskList({ items = [] }) {
  if (!items.length) return <EmptyState title="No tasks linked" copy="Open and completed follow-ups linked to this lead will appear here." />
  return (
    <div className="divide-y divide-slate-100">
      {items.map((item) => (
        <div key={item.taskId || item.task_id || item.title} className="grid gap-3 py-3 sm:grid-cols-[1fr_130px_120px]">
          <div>
            <p className="text-sm font-semibold text-slate-950">{item.title || 'Follow-up'}</p>
            <p className="mt-1 text-xs text-slate-500">{item.description || 'No description'}</p>
          </div>
          <span className="text-sm font-medium text-slate-600">{formatDate(item.dueDate || item.due_date)}</span>
          <StatusPill tone={String(item.status || '').toLowerCase() === 'completed' ? 'green' : 'amber'}>{item.status || 'Pending'}</StatusPill>
        </div>
      ))}
    </div>
  )
}

function AppointmentList({ items = [] }) {
  if (!items.length) return <EmptyState title="No appointments linked" copy="Lead, contact, listing, and converted transaction appointments will appear here when related by existing ids." />
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {items.map((item) => (
        <article key={item.appointmentId || item.appointment_id || item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-950">{item.title || item.appointmentType || item.appointment_type || 'Appointment'}</p>
              <p className="mt-1 text-xs text-slate-500">{formatDateTime(item.startTime || item.start_time || item.date)}</p>
            </div>
            <StatusPill>{item.status || 'scheduled'}</StatusPill>
          </div>
          <p className="mt-3 text-sm text-slate-600">{item.location || item.locationAddress || item.location_address || 'No location captured'}</p>
        </article>
      ))}
    </div>
  )
}

function OfferTransactionList({ offers = [], transactions = [], convertedTransactionId = '' }) {
  if (!offers.length && !transactions.length && !convertedTransactionId) {
    return <EmptyState title="No offers or transaction link" copy="Submitted offers and converted transactions will appear here from the existing offer and transaction fields." />
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section>
        <h3 className="mb-3 text-sm font-semibold text-slate-950">Offers</h3>
        <div className="space-y-3">
          {offers.length ? offers.map((offer) => (
            <article key={offer.id || offer.offerId} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <strong className="text-sm text-slate-950">{formatCurrency(offer.amount || offer.offerAmount || offer.offer_amount)}</strong>
                <StatusPill tone={String(offer.status || '').includes('accepted') ? 'green' : 'amber'}>{offer.status || 'draft'}</StatusPill>
              </div>
              <p className="mt-2 text-xs text-slate-500">Updated {formatDateTime(offer.updatedAt || offer.updated_at || offer.createdAt || offer.created_at)}</p>
            </article>
          )) : <p className="text-sm text-slate-500">No offers linked.</p>}
        </div>
      </section>
      <section>
        <h3 className="mb-3 text-sm font-semibold text-slate-950">Transactions</h3>
        <div className="space-y-3">
          {transactions.length ? transactions.map((transaction) => (
            <article key={transaction.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <strong className="text-sm text-slate-950">Transaction</strong>
                <StatusPill tone="green">{transaction.status || 'Linked'}</StatusPill>
              </div>
              <Link to={`/transactions/${transaction.id}`} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-blue-700">
                Open transaction <ExternalLink size={13} />
              </Link>
            </article>
          )) : convertedTransactionId ? (
            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <strong className="text-sm text-slate-950">Converted transaction</strong>
              <Link to={`/transactions/${convertedTransactionId}`} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-blue-700">
                Open transaction <ExternalLink size={13} />
              </Link>
            </article>
          ) : <p className="text-sm text-slate-500">No transaction linked.</p>}
        </div>
      </section>
    </div>
  )
}

function AgentLeadWorkspace() {
  const { leadId } = useParams()
  const navigate = useNavigate()
  const workspaceContext = useWorkspace()
  const organisationId = getOrganisationId(workspaceContext)
  const actor = useMemo(() => getActor(workspaceContext.profile), [workspaceContext.profile])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')

  const loadWorkspace = useCallback(async () => {
    if (!organisationId || !leadId) return
    try {
      setLoading(true)
      setError('')
      const result = await fetchAgentLeadWorkspace({ organisationId, leadId })
      setData(result)
    } catch (loadError) {
      setData(null)
      setError(loadError?.message || 'Unable to load this lead.')
    } finally {
      setLoading(false)
    }
  }, [leadId, organisationId])

  useEffect(() => {
    void loadWorkspace()
  }, [loadWorkspace])

  const row = data?.row || null
  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'requirements', label: 'Requirements' },
    { key: 'listings', label: 'Listings' },
    { key: 'activity', label: 'Notes & Activity' },
    { key: 'tasks', label: 'Tasks' },
    { key: 'appointments', label: 'Appointments' },
    { key: 'offers', label: 'Offers / Transactions' },
  ]

  return (
    <main className={pageShell}>
      <button type="button" onClick={() => navigate('/pipeline/leads')} className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-950">
        <ArrowLeft size={15} />
        Back to leads
      </button>
      {loading ? <LoadingSkeleton lines={10} className={panelClass} /> : null}
      {error && !loading ? <EmptyState title="Lead workspace could not be loaded" copy={error} /> : null}
      {!loading && !error && !row ? <EmptyState title="Lead not found" copy="This lead was not returned by the existing lead repository for the selected workspace." /> : null}
      {row ? (
        <>
          <header className={`${panelClass} p-5`}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Lead Workspace</p>
                <h1 className="mt-1 text-3xl font-semibold tracking-[-0.045em] text-slate-950">{row.name}</h1>
                <ContactLines row={row} />
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusPill tone={getStageTone(row.stage)}>{row.stage}</StatusPill>
                <StatusPill>{row.source}</StatusPill>
                {row.transactionCount || row.convertedTransactionId ? <StatusPill tone="green">Converted</StatusPill> : null}
              </div>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-5">
              <Metric label="Requirements" value={row.requirements?.length || 0} icon={ClipboardList} />
              <Metric label="Listings" value={row.listingInterests?.length || row.listingCount || 0} icon={Home} />
              <Metric label="Appointments" value={row.appointmentCount} icon={CalendarDays} />
              <Metric label="Offers" value={row.offerCount} icon={FileText} />
              <Metric label="Transactions" value={row.transactionCount || (row.convertedTransactionId ? 1 : 0)} icon={CheckCircle2} />
            </div>
          </header>

          <nav className={`${panelClass} flex gap-2 overflow-x-auto p-2`} aria-label="Lead workspace tabs">
            {tabs.map((tab) => (
              <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className={`min-h-10 shrink-0 rounded-xl px-3 text-sm font-semibold ${activeTab === tab.key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                {tab.label}
              </button>
            ))}
          </nav>

          {activeTab === 'overview' ? (
            <section className={`${panelClass} p-5`}>
              <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">Overview</h2>
              <dl className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Phone" value={row.phone || 'No phone'} />
                <Field label="Email" value={row.email || 'No email'} />
                <Field label="Source" value={row.source} />
                <Field label="Status" value={row.status} />
                <Field label="Assigned Agent" value={row.assignedAgent} />
                <Field label="Created" value={formatDate(row.createdAt)} />
                <Field label="Last Updated" value={formatDateTime(row.updatedAt)} />
                <Field label="Contact Id" value={row.contactId || 'No contact link'} />
                <Field label="Listing Id" value={row.listingId || 'No listing link'} />
                <Field label="Converted Transaction" value={row.convertedTransactionId || 'Not converted'} />
                <Field label="Legacy Budget" value={row.budget ? formatCurrency(row.budget) : '—'} />
                <Field label="Area Interest" value={row.areaInterest || row.area_interest} />
                <Field label="Property Interest" value={row.propertyInterest || row.property_interest} />
              </dl>
              {row.notes ? <p className="mt-5 whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">{row.notes}</p> : null}
            </section>
          ) : null}

          {activeTab === 'requirements' ? (
            <LeadRequirementsPanel
              organisationId={organisationId}
              lead={row}
              requirements={data?.requirements || row.requirements || []}
              actor={actor}
              onSaved={loadWorkspace}
            />
          ) : null}

          {activeTab === 'activity' ? (
            <section className={`${panelClass} p-5`}>
              <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">Notes & Activity</h2>
              <ActivityForm organisationId={organisationId} leadId={row.leadId} actor={actor} onSaved={loadWorkspace} />
              <div className="mt-5"><TimelineList items={row.activities} /></div>
            </section>
          ) : null}

          {activeTab === 'tasks' ? (
            <section className={`${panelClass} p-5`}>
              <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">Tasks</h2>
              <TaskForm organisationId={organisationId} leadId={row.leadId} actor={actor} onSaved={loadWorkspace} />
              <div className="mt-5"><TaskList items={row.tasks} /></div>
            </section>
          ) : null}

          {activeTab === 'listings' ? (
            <LeadListingInterestsPanel
              organisationId={organisationId}
              lead={row}
              interests={data?.listingInterests || row.listingInterests || []}
              requirements={data?.requirements || row.requirements || []}
              actor={actor}
              onSaved={loadWorkspace}
            />
          ) : null}

          {activeTab === 'appointments' ? (
            <section className={`${panelClass} p-5`}>
              <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">Appointments</h2>
              <div className="mt-5"><AppointmentList items={row.appointments} /></div>
            </section>
          ) : null}

          {activeTab === 'offers' ? (
            <section className={`${panelClass} p-5`}>
              <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">Offers / Transactions</h2>
              <div className="mt-5"><OfferTransactionList offers={row.offers} transactions={row.transactions} convertedTransactionId={row.convertedTransactionId} /></div>
            </section>
          ) : null}
        </>
      ) : null}
    </main>
  )
}

export default function AgentLeadsPage() {
  const { leadId } = useParams()
  return leadId ? <AgentLeadWorkspace /> : <AgentLeadList />
}
