import {
  ArrowLeft,
  Building2,
  CalendarDays,
  Camera,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  FileText,
  FolderKanban,
  HandCoins,
  Home,
  ImagePlus,
  Info,
  Loader2,
  MapPin,
  Plus,
  Copy,
  Link2,
  ShieldCheck,
  Star,
  Trash2,
  TrendingUp,
  Upload,
  UserRound,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import Field from '../components/ui/Field'
import { useWorkspace } from '../context/WorkspaceContext'
import {
  getListingReadinessSummary,
  getRequiredSellerDocuments,
  getSellerRequirementProfile,
} from '../lib/privateListingRequirementEngine'
import {
  createAppointmentAsync,
  listAppointmentsAsync,
} from '../lib/agencyPipelineService'
import {
  buildSellerClientPortalLink,
  deleteAgentPrivateListingCascade,
  generateId,
  readAgentPrivateListings,
  writeAgentPrivateListings,
} from '../lib/agentListingStorage'
import {
  completeViewingRequest,
  formatViewingStatusLabel,
  getViewingRequestsForListing,
  rescheduleViewingRequest,
  saveViewingFeedback,
  updateViewingParticipantResponse,
  VIEWING_RESPONSE_STATUS,
  VIEWING_STATUS,
} from '../lib/viewingWorkflow'
import {
  createOfferInvite,
  getOfferInvitesForListing,
  getOffersForListing,
  markOfferAgentAction,
  normalizeOfferWorkflowStatus,
  OFFER_WORKFLOW_STATUS,
} from '../lib/listingOffersService'
import {
  createCanonicalOffer,
  createOfferSellerReviewSession,
  createTransactionFromAcceptedCanonicalOffer,
  listCanonicalOffersForListing,
  recordBuyerLeadActivity,
  updateCanonicalOfferStatus,
} from '../lib/buyerLifecycleService'
import { invokeEdgeFunction, isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { isUnsafeFallbackAllowed } from '../lib/envValidation'
import {
  getPrivateListing,
  deletePrivateListing,
  updatePrivateListing,
  updatePrivateListingOnboardingFormData,
  uploadPrivateListingMediaAsset,
} from '../services/privateListingService'
import { fetchOrganisationSettings } from '../lib/settingsApi'
import { formatSouthAfricanWhatsAppNumber, sendWhatsAppNotification } from '../lib/whatsapp'

const PIPELINE_STORAGE_KEY = 'itg:pipeline-leads:v1'

const DETAIL_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'property_details', label: 'Property Details' },
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'offers', label: 'Offers' },
  { key: 'seller', label: 'Seller / Mandate' },
  { key: 'documents', label: 'Documents' },
  { key: 'role_players', label: 'Role Players' },
]

const SELLER_WORKSPACE_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'seller', label: 'Seller' },
  { key: 'documents', label: 'Documents' },
  { key: 'commission', label: 'Commission' },
  { key: 'activity', label: 'Activity' },
]

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(String(value || '').trim())
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

const ATTORNEY_OPTIONS = [
  'Bridge Conveyancing',
  'Hayley Appel',
  'Stonehouse Legal',
  'Transfer Desk Pretoria',
]

const BOND_ORIGINATOR_OPTIONS = [
  'Bridge Finance',
  'Sygnia Home Loans',
  'Mortgage Connect',
  'Prime Bond Desk',
]

const PROPERTY_TYPE_OPTIONS = ['House', 'Apartment', 'Townhouse', 'Cluster', 'Land', 'Commercial', 'Mixed-use']
const LISTING_STATUS_OPTIONS = ['mandate_signed', 'active', 'under_offer', 'sold', 'withdrawn']
const FEATURE_OPTIONS = ['Solar', 'Backup Water', 'Pool', 'Pet Friendly', 'Security', 'Garden', 'Fibre', 'Study', 'Staff Quarters', 'Entertainment Area']
const PORTAL_STATUS_OPTIONS = ['not_published', 'draft', 'published', 'paused', 'removed']

function mergeListingRecord(existing = {}, incoming = {}) {
  return {
    ...(existing || {}),
    ...(incoming || {}),
    marketing: {
      ...((existing || {}).marketing || {}),
      ...((incoming || {}).marketing || {}),
    },
    propertyDetails: {
      ...((existing || {}).propertyDetails || {}),
      ...((incoming || {}).propertyDetails || {}),
    },
    rolePlayers: {
      ...((existing || {}).rolePlayers || {}),
      ...((incoming || {}).rolePlayers || {}),
    },
  }
}

function upsertListingRecord(rows = [], incoming = null) {
  if (!incoming?.id) return rows
  let found = false
  const nextRows = rows.map((row) => {
    if (String(row?.id || '') !== String(incoming.id)) return row
    found = true
    return mergeListingRecord(row, incoming)
  })
  return found ? nextRows : [incoming, ...nextRows]
}

function firstDraftValue(...values) {
  for (const value of values) {
    if (value === 0 || value === false) return value
    const normalized = String(value ?? '').trim()
    if (normalized) return value
  }
  return ''
}

function mapAppointmentStatusToViewingStatus(status) {
  const normalized = String(status || '').trim().toLowerCase()
  if (['confirmed', 'accepted'].includes(normalized)) return VIEWING_STATUS.CONFIRMED
  if (normalized === 'completed') return VIEWING_STATUS.COMPLETED
  if (normalized === 'cancelled' || normalized === 'canceled') return VIEWING_STATUS.CANCELLED
  if (normalized === 'declined') return VIEWING_STATUS.DECLINED
  if (normalized === 'no_show' || normalized === 'no show') return VIEWING_STATUS.NO_SHOW
  if (normalized.includes('alternative') || normalized.includes('reschedule')) return VIEWING_STATUS.RESCHEDULE_REQUESTED
  return VIEWING_STATUS.PENDING_APPROVAL
}

function mapAppointmentParticipantToViewingParticipant(participant = {}) {
  const rsvpStatus = String(participant?.rsvpStatus || participant?.rsvp_status || '').trim().toLowerCase()
  return {
    participant_id: participant?.participantId || participant?.participant_id || participant?.userId || participant?.user_id || participant?.email || participant?.name || '',
    role: String(participant?.participantRole || participant?.participant_role || participant?.role || 'participant').trim().toLowerCase(),
    name: participant?.name || participant?.email || 'Participant',
    response_status:
      rsvpStatus === 'accepted'
        ? VIEWING_RESPONSE_STATUS.ACCEPTED
        : rsvpStatus === 'declined'
          ? VIEWING_RESPONSE_STATUS.DECLINED
          : rsvpStatus.includes('proposed')
            ? VIEWING_RESPONSE_STATUS.PROPOSED_NEW_TIME
            : VIEWING_RESPONSE_STATUS.PENDING,
    responded_at: participant?.respondedAt || participant?.responded_at || null,
  }
}

function mapAppointmentToViewingRecord(appointment = {}) {
  const participants = Array.isArray(appointment?.participants) ? appointment.participants : []
  const clientParticipant = participants.find((participant) => {
    const role = String(participant?.participantRole || participant?.participant_role || '').trim().toLowerCase()
    return role && role !== 'agent' && role !== 'principal'
  }) || participants.find((participant) => participant?.email || participant?.name) || null
  const dateTime = appointment?.dateTime || appointment?.date_time || ''
  const proposedDate = appointment?.date || appointment?.appointmentDate || appointment?.appointment_date || (dateTime ? String(dateTime).slice(0, 10) : '')
  const proposedTime = appointment?.startTime || appointment?.start_time || (dateTime ? String(dateTime).slice(11, 16) : '')
  return {
    viewing_id: appointment?.appointmentId || appointment?.appointment_id || appointment?.id,
    appointment_id: appointment?.appointmentId || appointment?.appointment_id || appointment?.id,
    listing_id: appointment?.listingId || appointment?.listing_id || '',
    listing_type: 'appointment',
    listing_title: appointment?.listingLabel || appointment?.title || 'Appointment',
    buyer_lead_id: appointment?.leadId || appointment?.lead_id || appointment?.contactId || appointment?.contact_id || '',
    buyer_name: clientParticipant?.name || clientParticipant?.email || appointment?.title || 'Participant',
    agent_id: appointment?.assignedAgentId || appointment?.agent_id || '',
    created_by: appointment?.createdBy || appointment?.created_by || '',
    created_by_role: 'agent',
    proposed_date: proposedDate,
    proposed_time: proposedTime,
    alternative_times: [],
    location: appointment?.location || '',
    notes: appointment?.notes || '',
    status: mapAppointmentStatusToViewingStatus(appointment?.status),
    participants: participants.map(mapAppointmentParticipantToViewingParticipant),
    feedback: appointment?.clientFeedback || appointment?.agentNotes || appointment?.outcomeSummary
      ? {
          interest_level: '',
          feedback_notes: appointment?.clientFeedback || appointment?.agentNotes || '',
          next_action: appointment?.nextStep || '',
          created_at: appointment?.updatedAt || appointment?.updated_at || appointment?.createdAt || appointment?.created_at || null,
        }
      : null,
    created_at: appointment?.createdAt || appointment?.created_at || dateTime || '',
    updated_at: appointment?.updatedAt || appointment?.updated_at || dateTime || '',
    source: 'appointments',
  }
}

function mergeAppointmentAndLocalViewings(appointmentRows = [], localRows = []) {
  const seen = new Set()
  const merged = []
  for (const row of [...appointmentRows, ...localRows]) {
    const key = String(row?.appointment_id || row?.viewing_id || '').trim()
    if (key && seen.has(key)) continue
    if (key) seen.add(key)
    merged.push(row)
  }
  return merged.sort((left, right) => new Date(right?.updated_at || right?.created_at || 0) - new Date(left?.updated_at || left?.created_at || 0))
}

function normalizeMediaItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item?.url || item?.signedUrl || item?.publicUrl)
    .map((item, index) => ({
      id: String(item.id || item.path || `media-${index + 1}`),
      name: String(item.name || item.fileName || `Image ${index + 1}`),
      url: String(item.url || item.signedUrl || item.publicUrl || ''),
      path: item.path || '',
      bucket: item.bucket || '',
      signedUrl: item.signedUrl || '',
      publicUrl: item.publicUrl || '',
      contentType: item.contentType || '',
      size: Number(item.size || 0) || 0,
      label: item.label || '',
    }))
}

function buildListingSnapshotFormData(draft = {}) {
  return {
    propertyAddress: String(draft.addressLine1 || '').trim(),
    suburb: String(draft.suburb || '').trim(),
    city: String(draft.city || '').trim(),
    province: String(draft.province || '').trim(),
    propertyType: draft.propertyType,
    bedrooms: draft.bedrooms,
    bathrooms: draft.bathrooms,
    garages: draft.garages,
    parkingCovered: draft.coveredParking,
    parkingOpen: draft.openParking,
    erfSize: draft.erfSize,
    floorSize: draft.floorSize,
    askingPrice: draft.price,
    levies: draft.leviesNotApplicable ? '' : draft.levies,
    leviesNotApplicable: Boolean(draft.leviesNotApplicable),
    ratesTaxes: draft.ratesTaxesNotApplicable ? '' : draft.ratesTaxes,
    ratesTaxesNotApplicable: Boolean(draft.ratesTaxesNotApplicable),
    saleType: String(draft.saleType || '').trim(),
    vatApplicable: String(draft.vatApplicable || '').trim(),
    offersFrom: draft.offersFrom,
    features: Array.isArray(draft.selectedFeatures) ? draft.selectedFeatures : [],
    propertyNotes: String(draft.description || '').trim(),
    listingPreviewDescription: String(draft.listingPreviewDescription || '').trim(),
    internalNotes: String(draft.notes || '').trim(),
    imageGallery: normalizeMediaItems(draft.galleryImages),
    coverImageId: draft.coverImageId || '',
    floorplans: normalizeMediaItems(draft.floorplans),
    mandateSignedDate: draft.mandateSignedDate || '',
    listingDate: draft.listingDate || '',
    expiryDate: draft.expiryDate || '',
    property24ListingUrl: String(draft.property24ListingUrl || '').trim(),
    property24Reference: String(draft.property24Reference || '').trim(),
    property24Status: String(draft.property24Status || 'not_published').trim(),
    privatePropertyListingUrl: String(draft.privatePropertyListingUrl || '').trim(),
    privatePropertyReference: String(draft.privatePropertyReference || '').trim(),
    privatePropertyStatus: String(draft.privatePropertyStatus || 'not_published').trim(),
    bridgeListingStatus: String(draft.bridgeListingStatus || 'not_published').trim(),
    bridgeListingPublicUrl: String(draft.bridgeListingPublicUrl || '').trim(),
  }
}

function formatCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return 'Price on request'
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatMoneyValue(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount)) return '—'
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function toCleanText(value) {
  return String(value || '').trim()
}

function isValidEmail(value) {
  const text = toCleanText(value)
  if (!text) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)
}

function getListingSellerFormData(listing = {}) {
  return listing?.sellerOnboarding?.formData && typeof listing.sellerOnboarding.formData === 'object'
    ? listing.sellerOnboarding.formData
    : {}
}

function resolveSellerEmailFromListing(listing = {}) {
  const formData = getListingSellerFormData(listing)
  return toCleanText(
    formData.sellerEmail ||
      formData.email ||
      formData.contactEmail ||
      listing?.sellerEmail ||
      listing?.seller_email ||
      listing?.seller?.email,
  ).toLowerCase()
}

function resolveSellerNameFromListing(listing = {}) {
  const formData = getListingSellerFormData(listing)
  return toCleanText(
    [formData.sellerFirstName || formData.firstName, formData.sellerSurname || formData.lastName].filter(Boolean).join(' ') ||
      formData.sellerName ||
      formData.fullName ||
      listing?.sellerName ||
      listing?.seller_name ||
      listing?.seller?.name,
  )
}

function extractSellerPortalTokenFromLink(link = '') {
  const text = toCleanText(link)
  if (!text) return ''
  const path = (() => {
    try {
      return new URL(text, typeof window !== 'undefined' ? window.location.origin : 'https://app.bridgenine.co.za').pathname
    } catch {
      return text
    }
  })()
  const clientMatch = path.match(/\/client\/([^/]+)/i)
  if (clientMatch?.[1]) return decodeURIComponent(clientMatch[1])
  const onboardingMatch = path.match(/\/seller\/onboarding\/([^/]+)/i)
  if (onboardingMatch?.[1]) return decodeURIComponent(onboardingMatch[1])
  return ''
}

function CompactActionButton({ active = false, disabled = false, className = '', children, ...props }) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition ${
        active
          ? 'border-[#1f4f78] bg-[#1f4f78] text-white shadow-[0_8px_14px_rgba(31,79,120,0.18)]'
          : 'border-[#dbe6f2] bg-white text-[#2f4862] hover:border-[#b7c8db] hover:bg-[#f7fbff]'
      } disabled:cursor-not-allowed disabled:border-[#dbe6f2] disabled:bg-[#f5f8fb] disabled:text-[#9aa9ba] ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

function formatDate(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleDateString('en-ZA')
}

function formatDateInputValue(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString().slice(0, 10)
}

function formatDateTime(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleString('en-ZA')
}

function formatStatusLabel(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return 'Requested'
  return normalized
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function statusClass(status) {
  const key = String(status || '').trim().toLowerCase()
  if (key === 'approved' || key === 'completed' || key === 'accepted') return 'border-[#d8eddf] bg-[#ecfaf1] text-[#1f7d44]'
  if (key === 'uploaded' || key === 'under_review' || key === 'agent_review' || key === 'sent_to_seller' || key === 'seller_viewed' || key === 'reviewed' || key === 'in_progress') {
    return 'border-[#d8e6f6] bg-[#f3f8fd] text-[#2c5a89]'
  }
  if (key === 'changes_requested' || key === 'countered') return 'border-[#f1dfb8] bg-[#fff8e8] text-[#8a641d]'
  if (key === 'rejected' || key === 'expired') return 'border-[#f6d7d7] bg-[#fff5f5] text-[#b42318]'
  if (key === 'submitted') return 'border-[#e6dcf7] bg-[#faf7ff] text-[#6d46a1]'
  return 'border-[#dbe4ef] bg-[#f8fbff] text-[#48627f]'
}

function getOnboardingStatusLabel(status) {
  const key = String(status || '').trim().toLowerCase()
  if (key === 'completed') return 'Completed'
  if (key === 'submitted') return 'Submitted'
  if (key === 'under_review') return 'Under Review'
  if (key === 'in_progress') return 'In Progress'
  return 'Not Started'
}

function getImageBlock(mediaUrl, title) {
  if (mediaUrl) {
    return <img src={mediaUrl} alt={title} className="h-full w-full object-cover" />
  }

  return (
    <div className="relative h-full w-full bg-[linear-gradient(130deg,#133654_0%,#1f4f78_52%,#a8c2dc_100%)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.24),transparent_52%)]" />
      <div className="absolute bottom-4 left-4 rounded-full border border-white/35 bg-white/20 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-white">
        Property image
      </div>
    </div>
  )
}

function CompletionBadge({ complete = false, label = '' }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${complete ? 'border-[#d8eddf] bg-[#ecfaf1] text-[#1f7d44]' : 'border-[#f5dbb0] bg-[#fff8ec] text-[#9a5b13]'}`}>
      {complete ? <CheckCircle2 size={12} /> : <CircleAlert size={12} />}
      {label || (complete ? 'Complete' : 'Missing info')}
    </span>
  )
}

function HubCard({ icon = Info, title, copy = '', complete = null, children, className = '' }) {
  const Icon = icon
  return (
    <section className={`rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)] ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] border border-[#dce6f2] bg-[#f7fbff] text-[#1f4f78]">
            <Icon size={17} />
          </div>
          <div className="min-w-0">
            <h4 className="text-[1rem] font-semibold text-[#142132]">{title}</h4>
            {copy ? <p className="mt-1 text-sm leading-5 text-[#607387]">{copy}</p> : null}
          </div>
        </div>
        {complete === null ? null : <CompletionBadge complete={complete} />}
      </div>
      {children}
    </section>
  )
}

function SnapshotRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#e7edf5] py-2.5 last:border-b-0">
      <span className="text-xs font-semibold text-[#6b7d93]">{label}</span>
      <span className="min-w-0 truncate text-right text-sm font-semibold text-[#142132]">{value || '—'}</span>
    </div>
  )
}

function CompactSnapshotRow({ label, value }) {
  return (
    <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] items-center gap-3 border-b border-[#edf2f7] py-2 last:border-b-0">
      <span className="min-w-0 text-[0.72rem] font-semibold leading-5 text-[#6b7d93]">{label}</span>
      <span className="min-w-0 break-words text-right text-[0.8rem] font-semibold leading-5 text-[#142132]">{value || '—'}</span>
    </div>
  )
}

function StatusPill({ status = '', label = '' }) {
  const normalized = String(status || label || '').trim().toLowerCase()
  const done = ['done', 'complete', 'completed', 'uploaded', 'signed', 'published', 'active'].includes(normalized)
  const pending = ['pending', 'in_progress', 'in progress', 'under_review', 'sent'].includes(normalized)
  const className = done
    ? 'border-[#d8eddf] bg-[#ecfaf1] text-[#1f7d44]'
    : pending
      ? 'border-[#d8e6f6] bg-[#f3f8fd] text-[#2c5a89]'
      : 'border-[#f5dbb0] bg-[#fff8ec] text-[#9a5b13]'
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold ${className}`}>
      {label || (done ? 'Done' : pending ? 'Pending' : 'Missing')}
    </span>
  )
}

function InfoTile({ icon = Info, label, value, status = '' }) {
  const Icon = icon
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-[16px] border border-[#e1e9f2] bg-[#fbfdff] px-3.5 py-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] bg-[#eef5fb] text-[#1f4f78]">
        <Icon size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#8294aa]">{label}</p>
        <p className="mt-1 break-words text-sm font-semibold leading-5 text-[#243d56]" title={String(value || '—')}>{value || '—'}</p>
      </div>
      {status ? <StatusPill status={status} /> : null}
    </div>
  )
}

function FieldDisplay({ label, value }) {
  return (
    <div className="min-w-0 rounded-[14px] border border-[#e5edf6] bg-[#fbfdff] px-3.5 py-3">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#8294aa]">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold leading-5 text-[#243d56]">{value || 'Not captured'}</p>
    </div>
  )
}

function formatFieldLabel(key = '') {
  return String(key || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatFieldValue(value) {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.filter(Boolean).join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function readPipelineLeads() {
  if (typeof window === 'undefined') return []
  if (!isUnsafeFallbackAllowed()) return []
  try {
    const raw = window.localStorage.getItem(PIPELINE_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function normalizeListingStatus(listing) {
  const raw = String(listing?.status || '').trim().toLowerCase()
  if (raw.includes('offer')) return 'under_offer'
  if (raw.includes('sold')) return 'sold'
  if (raw.includes('withdraw')) return 'withdrawn'
  return raw || 'active'
}

function getDaysOnMarket(createdAt) {
  if (!createdAt) return 0
  const delta = Date.now() - new Date(createdAt).getTime()
  if (!Number.isFinite(delta) || delta < 0) return 0
  return Math.max(0, Math.floor(delta / (1000 * 60 * 60 * 24)))
}

function getOfferAverage(offers = []) {
  const prices = offers.map((offer) => Number(offer?.offerPrice || 0)).filter((value) => Number.isFinite(value) && value > 0)
  if (!prices.length) return 0
  return prices.reduce((sum, value) => sum + value, 0) / prices.length
}

function getLeadStage(lead) {
  return String(lead?.journeyStage || lead?.status || '').trim().toLowerCase()
}

function getNextBestAction({ pendingOffers, missingDocuments, onboardingStatus }) {
  if (pendingOffers > 0) {
    return {
      title: `${pendingOffers} offer${pendingOffers === 1 ? '' : 's'} pending review`,
      copy: 'Review, compare, and decide whether to accept, reject, or counter before momentum drops.',
    }
  }
  if (missingDocuments > 0) {
    return {
      title: `${missingDocuments} seller document${missingDocuments === 1 ? '' : 's'} still missing`,
      copy: 'Push FICA and property compliance completion so the listing can move cleanly into offer-to-deal progression.',
    }
  }
  if (onboardingStatus !== 'Completed') {
    return {
      title: 'Seller onboarding still in progress',
      copy: 'Use the onboarding link and mandate review workflow to close outstanding seller steps.',
    }
  }
  return {
    title: 'Listing is in a healthy operating state',
    copy: 'Focus on buyer follow-up, keeping viewings moving, and converting interest into signed offers.',
  }
}

function MetricCard({ label, value, meta }) {
  return (
    <article className="rounded-[18px] border border-[#dce6f2] bg-[#fbfdff] p-4">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">{label}</p>
      <p className="mt-2 text-[1.25rem] font-semibold text-[#142132]">{value}</p>
      {meta ? <p className="mt-1 text-sm text-[#6b7d93]">{meta}</p> : null}
    </article>
  )
}

function buildDonutStyle(segments, fallback = '#dbe6f2') {
  const safeSegments = Array.isArray(segments) ? segments.filter((segment) => Number(segment?.value || 0) > 0) : []
  const total = safeSegments.reduce((sum, segment) => sum + Number(segment.value || 0), 0)
  if (!total) {
    return { background: `conic-gradient(${fallback} 0deg 360deg)` }
  }

  let current = 0
  const stops = safeSegments.map((segment) => {
    const angle = (Number(segment.value || 0) / total) * 360
    const start = current
    const end = current + angle
    current = end
    return `${segment.color} ${start}deg ${end}deg`
  })

  return { background: `conic-gradient(${stops.join(', ')})` }
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Unable to read file'))
    reader.readAsDataURL(file)
  })
}

function buildPropertyDraft(listingRecord) {
  const propertyDetails = listingRecord?.propertyDetails || {}
  const marketing = listingRecord?.marketing || {}
  const onboardingFormData =
    listingRecord?.sellerOnboarding?.formData && typeof listingRecord.sellerOnboarding.formData === 'object'
      ? listingRecord.sellerOnboarding.formData
      : {}
  const storedGallery = Array.isArray(marketing?.imageGallery) ? marketing.imageGallery : []
  const onboardingGallery = Array.isArray(onboardingFormData.imageGallery) ? onboardingFormData.imageGallery : []
  const fallbackGallery = marketing?.mediaUrl
    ? [
        {
          id: 'cover-image',
          name: 'Cover image',
          url: String(marketing.mediaUrl).trim(),
        },
      ]
    : []
  const galleryImages = normalizeMediaItems(storedGallery.length ? storedGallery : onboardingGallery.length ? onboardingGallery : fallbackGallery)
  const coverImageId =
    String(marketing?.coverImageId || propertyDetails?.coverImageId || onboardingFormData.coverImageId || '').trim() ||
    String(galleryImages[0]?.id || '').trim()

  const rawListingStatus = String(propertyDetails?.listingStatus || listingRecord?.status || 'active').trim().toLowerCase()
  const normalizedListingStatus = rawListingStatus === 'listing_active' ? 'active' : rawListingStatus

  const selectedFeatures = Array.isArray(propertyDetails?.selectedFeatures)
    ? propertyDetails.selectedFeatures
    : Array.isArray(onboardingFormData.features)
      ? onboardingFormData.features
      : String(marketing?.features || '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)

  return {
    listingCode: String(listingRecord?.listingCode || '').trim(),
    headline: String(firstDraftValue(propertyDetails?.headline, listingRecord?.listingTitle, onboardingFormData.propertyAddress)).trim(),
    propertyType: String(firstDraftValue(propertyDetails?.propertyType, listingRecord?.propertyType, onboardingFormData.propertyType, 'House')).trim(),
    listingStatus: normalizedListingStatus,
    source: String(firstDraftValue(marketing?.source, propertyDetails?.source, listingRecord?.listingSource, onboardingFormData.listingSource, 'seller_onboarding')).trim(),
    addressLine1: String(firstDraftValue(propertyDetails?.addressLine1, listingRecord?.addressLine1, onboardingFormData.propertyAddress, onboardingFormData.residentialAddress)).trim(),
    suburb: String(firstDraftValue(propertyDetails?.suburb, listingRecord?.suburb, onboardingFormData.suburb)).trim(),
    city: String(firstDraftValue(propertyDetails?.city, listingRecord?.city, onboardingFormData.city)).trim(),
    province: String(firstDraftValue(propertyDetails?.province, listingRecord?.province, onboardingFormData.province)).trim(),
    bedrooms: String(firstDraftValue(propertyDetails?.bedrooms, onboardingFormData.bedrooms)).trim(),
    bathrooms: String(firstDraftValue(propertyDetails?.bathrooms, onboardingFormData.bathrooms)).trim(),
    garages: String(firstDraftValue(propertyDetails?.garages, onboardingFormData.garages)).trim(),
    coveredParking: String(firstDraftValue(propertyDetails?.coveredParking, onboardingFormData.parkingCovered, onboardingFormData.coveredParking)).trim(),
    openParking: String(firstDraftValue(propertyDetails?.openParking, onboardingFormData.parkingOpen, onboardingFormData.openParking)).trim(),
    erfSize: String(firstDraftValue(propertyDetails?.erfSize, onboardingFormData.erfSize)).trim(),
    floorSize: String(firstDraftValue(propertyDetails?.floorSize, onboardingFormData.floorSize)).trim(),
    price: String(firstDraftValue(propertyDetails?.price, listingRecord?.askingPrice, onboardingFormData.askingPrice)).trim(),
    levies: String(firstDraftValue(propertyDetails?.levies, onboardingFormData.levies)).trim(),
    leviesNotApplicable: Boolean(propertyDetails?.leviesNotApplicable),
    ratesTaxes: String(firstDraftValue(propertyDetails?.ratesTaxes, onboardingFormData.ratesTaxes)).trim(),
    ratesTaxesNotApplicable: Boolean(propertyDetails?.ratesTaxesNotApplicable),
    saleType: String(firstDraftValue(propertyDetails?.saleType, onboardingFormData.saleType, 'For Sale')).trim(),
    vatApplicable: String(firstDraftValue(propertyDetails?.vatApplicable, onboardingFormData.vatApplicable, 'no')).trim(),
    offersFrom: String(firstDraftValue(propertyDetails?.offersFrom, onboardingFormData.offersFrom)).trim(),
    selectedFeatures,
    description: String(firstDraftValue(propertyDetails?.description, marketing?.description, onboardingFormData.propertyNotes)).trim(),
    listingPreviewDescription: String(firstDraftValue(propertyDetails?.listingPreviewDescription, onboardingFormData.listingPreviewDescription)).trim(),
    notes: String(firstDraftValue(propertyDetails?.notes, marketing?.notes, onboardingFormData.sellingReason, onboardingFormData.sellingTimeline)).trim(),
    galleryImages,
    coverImageId,
    floorplans: Array.isArray(propertyDetails?.floorplans)
      ? propertyDetails.floorplans
      : Array.isArray(onboardingFormData.floorplans)
        ? onboardingFormData.floorplans
      : Array.isArray(marketing?.floorplans)
        ? marketing.floorplans
        : [],
    mandateSignedDate: String(firstDraftValue(propertyDetails?.mandateSignedDate, onboardingFormData.mandateSignedDate)).trim(),
    listingDate: String(firstDraftValue(propertyDetails?.listingDate, onboardingFormData.listingDate)).trim(),
    expiryDate: String(firstDraftValue(propertyDetails?.expiryDate, onboardingFormData.expiryDate)).trim(),
    property24ListingUrl: String(firstDraftValue(propertyDetails?.property24ListingUrl, listingRecord?.property24ListingUrl, onboardingFormData.property24ListingUrl)).trim(),
    property24Reference: String(firstDraftValue(propertyDetails?.property24Reference, listingRecord?.property24Reference, onboardingFormData.property24Reference)).trim(),
    property24Status: String(firstDraftValue(propertyDetails?.property24Status, listingRecord?.property24Status, onboardingFormData.property24Status, 'not_published')).trim(),
    privatePropertyListingUrl: String(firstDraftValue(propertyDetails?.privatePropertyListingUrl, listingRecord?.privatePropertyListingUrl, onboardingFormData.privatePropertyListingUrl)).trim(),
    privatePropertyReference: String(firstDraftValue(propertyDetails?.privatePropertyReference, listingRecord?.privatePropertyReference, onboardingFormData.privatePropertyReference)).trim(),
    privatePropertyStatus: String(firstDraftValue(propertyDetails?.privatePropertyStatus, listingRecord?.privatePropertyStatus, onboardingFormData.privatePropertyStatus, 'not_published')).trim(),
    bridgeListingStatus: String(firstDraftValue(propertyDetails?.bridgeListingStatus, listingRecord?.bridgeListingStatus, onboardingFormData.bridgeListingStatus, 'not_published')).trim(),
    bridgeListingPublicUrl: String(firstDraftValue(propertyDetails?.bridgeListingPublicUrl, listingRecord?.bridgeListingPublicUrl, onboardingFormData.bridgeListingPublicUrl)).trim(),
  }
}

function AgentListingDetail() {
  const navigate = useNavigate()
  const { listingId: encodedListingId } = useParams()
  const { profile } = useWorkspace()
  const listingId = decodeURIComponent(String(encodedListingId || ''))

  const [activeTab, setActiveTab] = useState('seller')
  const [privateListings, setPrivateListings] = useState([])
  const [pipelineLeads, setPipelineLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeOrganisationId, setActiveOrganisationId] = useState('')
  const [offersRefreshTick, setOffersRefreshTick] = useState(0)
  const [showSendOfferLinkForm, setShowSendOfferLinkForm] = useState(false)
  const [offerInviteDraft, setOfferInviteDraft] = useState({
    buyerLeadId: '',
    expiresInDays: 7,
  })
  const [offerActionMessage, setOfferActionMessage] = useState('')
  const [offerActionError, setOfferActionError] = useState('')
  const [sendingOfferLink, setSendingOfferLink] = useState(false)
  const [copiedOfferToken, setCopiedOfferToken] = useState('')
  const [canonicalListingOffers, setCanonicalListingOffers] = useState([])
  const [canonicalOffersLoading, setCanonicalOffersLoading] = useState(false)
  const [canonicalOffersError, setCanonicalOffersError] = useState('')
  const [canonicalOfferActionId, setCanonicalOfferActionId] = useState('')
  const [detailMessage, setDetailMessage] = useState('')
  const [detailError, setDetailError] = useState('')
  const [deletingListing, setDeletingListing] = useState(false)
  const [gallerySaving, setGallerySaving] = useState(false)
  const [resendingSellerPortalLink, setResendingSellerPortalLink] = useState(false)
  const [showFullGallery, setShowFullGallery] = useState(false)
  const [offerNotesDraftById, setOfferNotesDraftById] = useState({})
  const [marketingDraft, setMarketingDraft] = useState(() => buildPropertyDraft(null))
  const [sellerWorkspaceTab, setSellerWorkspaceTab] = useState('overview')
  const [rolePlayersDraft, setRolePlayersDraft] = useState({
    attorney: 'Bridge Conveyancing',
    bondOriginator: 'Bridge Finance',
  })
  const [viewings, setViewings] = useState([])
  const [showViewingForm, setShowViewingForm] = useState(false)
  const [viewingForm, setViewingForm] = useState({
    buyerLeadId: '',
    proposedDate: '',
    proposedTime: '',
    alternativeTimeA: '',
    alternativeTimeB: '',
    notes: '',
  })
  const [feedbackDrafts, setFeedbackDrafts] = useState({})

  useEffect(() => {
    if (!listingId.startsWith('development-')) return
    const developmentId = listingId.replace('development-', '')
    navigate(`/developments/${developmentId}`, { replace: true })
  }, [listingId, navigate])

  const loadListingData = useCallback(async () => {
    setLoading(true)
    setDetailError('')
    const runtimeListings = readAgentPrivateListings()
    setPipelineLeads(readPipelineLeads())

    let nextListings = runtimeListings
    if (isSupabaseConfigured && listingId && !listingId.startsWith('development-')) {
      try {
        const dbListing = await getPrivateListing(listingId)
        if (dbListing?.id) {
          nextListings = upsertListingRecord(runtimeListings, dbListing)
        }
      } catch (error) {
        console.error('[AgentListingDetail] Supabase listing load failed', error)
        setDetailError(error?.message || 'Unable to load this listing from Supabase.')
      }
    }

    setPrivateListings(nextListings)
    setLoading(false)
  }, [listingId])

  useEffect(() => {
    void loadListingData()
  }, [loadListingData])

  useEffect(() => {
    const refreshListingData = () => {
      void loadListingData()
      setOffersRefreshTick((value) => value + 1)
    }

    window.addEventListener('itg:listings-updated', refreshListingData)
    window.addEventListener('itg:pipeline-updated', refreshListingData)
    return () => {
      window.removeEventListener('itg:listings-updated', refreshListingData)
      window.removeEventListener('itg:pipeline-updated', refreshListingData)
    }
  }, [loadListingData])

  const listingRecord = useMemo(() => {
    return privateListings.find((item) => String(item.id) === listingId) || null
  }, [listingId, privateListings])

  const listingOrganisationId = useMemo(
    () => String(listingRecord?.organisationId || listingRecord?.organisation_id || activeOrganisationId || '').trim(),
    [activeOrganisationId, listingRecord?.organisationId, listingRecord?.organisation_id],
  )

  useEffect(() => {
    if (!listingOrganisationId || !listingRecord?.id || !isSupabaseConfigured) {
      setCanonicalListingOffers([])
      setCanonicalOffersError('')
      setCanonicalOffersLoading(false)
      return
    }
    let cancelled = false
    setCanonicalOffersLoading(true)
    setCanonicalOffersError('')
    listCanonicalOffersForListing({
      organisationId: listingOrganisationId,
      listingId: listingRecord.id,
    })
      .then((offers) => {
        if (!cancelled) setCanonicalListingOffers(Array.isArray(offers) ? offers : [])
      })
      .catch((error) => {
        if (!cancelled) {
          setCanonicalListingOffers([])
          setCanonicalOffersError(error?.message || 'Unable to load canonical offers.')
        }
      })
      .finally(() => {
        if (!cancelled) setCanonicalOffersLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [listingOrganisationId, listingRecord?.id, offersRefreshTick])

  const refreshListingViewings = useCallback(async () => {
    if (!listingId) return
    const localRows = isUnsafeFallbackAllowed() ? getViewingRequestsForListing(listingId) : []
    let appointmentRows = []
    if (listingOrganisationId && isSupabaseConfigured) {
      try {
        const appointments = await listAppointmentsAsync(listingOrganisationId, {
          includeAll: true,
          listingId,
        })
        appointmentRows = (Array.isArray(appointments) ? appointments : [])
          .filter((appointment) => String(appointment?.listingId || appointment?.listing_id || '') === String(listingId))
          .map(mapAppointmentToViewingRecord)
      } catch (error) {
        console.warn('[AgentListingDetail] listing appointments load failed.', error)
      }
    }
    setViewings(mergeAppointmentAndLocalViewings(appointmentRows, localRows))
  }, [listingId, listingOrganisationId])

  useEffect(() => {
    if (!listingId) return undefined
    void refreshListingViewings()
    const refreshViewings = () => {
      void refreshListingViewings()
    }
    window.addEventListener('itg:viewings-updated', refreshViewings)
    window.addEventListener('itg:agency-crm-updated', refreshViewings)
    return () => {
      window.removeEventListener('itg:viewings-updated', refreshViewings)
      window.removeEventListener('itg:agency-crm-updated', refreshViewings)
    }
  }, [listingId, refreshListingViewings])

  useEffect(() => {
    if (!listingRecord) return
    setMarketingDraft(buildPropertyDraft(listingRecord))
    setRolePlayersDraft({
      attorney: String(listingRecord?.rolePlayers?.attorney || 'Bridge Conveyancing').trim(),
      bondOriginator: String(listingRecord?.rolePlayers?.bondOriginator || 'Bridge Finance').trim(),
    })
  }, [listingRecord])

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined
    let cancelled = false
    async function loadOrganisationContext() {
      try {
        const context = await fetchOrganisationSettings()
        if (!cancelled) {
          setActiveOrganisationId(String(context?.organisation?.id || '').trim())
        }
      } catch (error) {
        console.warn('[AgentListingDetail] organisation context load failed for appointments', error)
      }
    }
    void loadOrganisationContext()
    return () => {
      cancelled = true
    }
  }, [])

  function patchListing(updater) {
    if (!listingRecord) return null
    let updatedListing = null
    const nextRows = privateListings.map((item) => {
      if (String(item.id) !== String(listingRecord.id)) return item
      updatedListing = updater({ ...item })
      return updatedListing
    })
    setPrivateListings(nextRows)
    writeAgentPrivateListings(nextRows)
    return updatedListing
  }

  async function persistListingSnapshot(nextDraft, { message = '', persistCoreFields = false } = {}) {
    if (!listingRecord?.id || !nextDraft) return null
    const selectedCover = nextDraft.galleryImages.find((image) => String(image?.id) === String(nextDraft.coverImageId)) || nextDraft.galleryImages[0] || null
    const localListing = patchListing((row) => ({
      ...row,
      ...(persistCoreFields
        ? {
            listingCode: nextDraft.listingCode || row?.listingCode || '',
            listingTitle: nextDraft.headline.trim() || row?.listingTitle || '',
            propertyType: nextDraft.propertyType || row?.propertyType || 'House',
            status: nextDraft.listingStatus || row?.status || 'active',
            addressLine1: nextDraft.addressLine1.trim(),
            suburb: nextDraft.suburb.trim(),
            city: nextDraft.city.trim(),
            province: nextDraft.province.trim(),
            askingPrice: Number(nextDraft.price || 0),
          }
        : {}),
      marketing: {
        ...(row?.marketing || {}),
        mediaUrl: selectedCover?.url || '',
        source: nextDraft.source,
        status: nextDraft.listingStatus,
        description: nextDraft.description,
        features: nextDraft.selectedFeatures.join(', '),
        notes: nextDraft.notes,
        imageGallery: normalizeMediaItems(nextDraft.galleryImages),
        coverImageId: nextDraft.coverImageId,
        floorplans: nextDraft.floorplans,
      },
      propertyDetails: {
        ...(row?.propertyDetails || {}),
        listingCode: nextDraft.listingCode,
        headline: nextDraft.headline.trim(),
        propertyType: nextDraft.propertyType,
        listingStatus: nextDraft.listingStatus,
        source: nextDraft.source.trim(),
        addressLine1: nextDraft.addressLine1.trim(),
        suburb: nextDraft.suburb.trim(),
        city: nextDraft.city.trim(),
        province: nextDraft.province.trim(),
        bedrooms: nextDraft.bedrooms,
        bathrooms: nextDraft.bathrooms,
        garages: nextDraft.garages,
        coveredParking: nextDraft.coveredParking,
        openParking: nextDraft.openParking,
        erfSize: nextDraft.erfSize,
        floorSize: nextDraft.floorSize,
        price: Number(nextDraft.price || 0),
        levies: nextDraft.leviesNotApplicable ? 0 : Number(nextDraft.levies || 0),
        leviesNotApplicable: nextDraft.leviesNotApplicable,
        ratesTaxes: nextDraft.ratesTaxesNotApplicable ? 0 : Number(nextDraft.ratesTaxes || 0),
        ratesTaxesNotApplicable: nextDraft.ratesTaxesNotApplicable,
        saleType: nextDraft.saleType,
        vatApplicable: nextDraft.vatApplicable,
        offersFrom: Number(nextDraft.offersFrom || 0),
        selectedFeatures: nextDraft.selectedFeatures,
        description: nextDraft.description.trim(),
        listingPreviewDescription: nextDraft.listingPreviewDescription.trim(),
        notes: nextDraft.notes.trim(),
        floorplans: nextDraft.floorplans,
        coverImageId: nextDraft.coverImageId,
        mandateSignedDate: nextDraft.mandateSignedDate,
        listingDate: nextDraft.listingDate,
        expiryDate: nextDraft.expiryDate,
        property24ListingUrl: nextDraft.property24ListingUrl.trim(),
        property24Reference: nextDraft.property24Reference.trim(),
        property24Status: nextDraft.property24Status,
        privatePropertyListingUrl: nextDraft.privatePropertyListingUrl.trim(),
        privatePropertyReference: nextDraft.privatePropertyReference.trim(),
        privatePropertyStatus: nextDraft.privatePropertyStatus,
        bridgeListingStatus: nextDraft.bridgeListingStatus,
        bridgeListingPublicUrl: nextDraft.bridgeListingPublicUrl.trim(),
      },
      sellerOnboarding: {
        ...(row?.sellerOnboarding || {}),
        formData: {
          ...((row?.sellerOnboarding?.formData && typeof row.sellerOnboarding.formData === 'object') ? row.sellerOnboarding.formData : {}),
          ...buildListingSnapshotFormData(nextDraft),
        },
      },
    }))

    if (!isSupabaseConfigured) {
      if (message) setDetailMessage(message)
      return localListing
    }

    const savedOnboarding = await updatePrivateListingOnboardingFormData(listingRecord.id, buildListingSnapshotFormData(nextDraft)).catch((error) => {
      console.warn('[AgentListingDetail] listing snapshot save skipped', error)
      setDetailError(error?.message || 'Saved locally, but Supabase could not be updated.')
      return null
    })
    if (savedOnboarding?.form_data) {
      setPrivateListings((rows) => upsertListingRecord(rows, {
        ...localListing,
        sellerOnboarding: {
          ...(localListing?.sellerOnboarding || {}),
          status: savedOnboarding.status || localListing?.sellerOnboarding?.status,
          formData: savedOnboarding.form_data,
        },
      }))
    }
    if (message) setDetailMessage(message)
    return localListing
  }

  async function saveMarketingDraft() {
    setDetailMessage('')
    setDetailError('')
    const updatedListing = await persistListingSnapshot(marketingDraft, { persistCoreFields: true })
    if (!updatedListing?.id || !isSupabaseConfigured) {
      setDetailMessage('Listing details saved locally.')
      return
    }

    try {
      const savedListing = await updatePrivateListing(updatedListing.id, {
        title: marketingDraft.headline.trim() || updatedListing.listingTitle || '',
        propertyType: marketingDraft.propertyType || updatedListing.propertyType || '',
        listingStatus: marketingDraft.listingStatus || updatedListing.listingStatus || updatedListing.status || 'mandate_signed',
        listingSource: marketingDraft.source || updatedListing.listingSource || 'private_listing',
        description: marketingDraft.description.trim(),
        askingPrice: Number(marketingDraft.price || 0),
        addressLine1: marketingDraft.addressLine1.trim(),
        suburb: marketingDraft.suburb.trim(),
        city: marketingDraft.city.trim(),
        province: marketingDraft.province.trim(),
        isActive: String(marketingDraft.listingStatus || '').trim().toLowerCase() === 'active',
        property24ListingUrl: marketingDraft.property24ListingUrl.trim(),
        property24Reference: marketingDraft.property24Reference.trim(),
        property24Status: marketingDraft.property24Status,
        privatePropertyListingUrl: marketingDraft.privatePropertyListingUrl.trim(),
        privatePropertyReference: marketingDraft.privatePropertyReference.trim(),
        privatePropertyStatus: marketingDraft.privatePropertyStatus,
        bridgeListingStatus: marketingDraft.bridgeListingStatus,
        bridgeListingPublicUrl: marketingDraft.bridgeListingPublicUrl.trim(),
        listingPreviewDescription: marketingDraft.listingPreviewDescription.trim(),
        internalListingNotes: marketingDraft.notes.trim(),
      })
      if (savedListing?.id) {
        setPrivateListings((rows) => upsertListingRecord(rows, mergeListingRecord(updatedListing, savedListing)))
      }
      setDetailMessage('Listing details saved.')
    } catch (error) {
      console.error('[AgentListingDetail] Supabase listing save failed', error)
      setDetailError(error?.message || 'Saved locally, but Supabase could not be updated.')
    }
  }

  function saveRolePlayers() {
    patchListing((row) => ({
      ...row,
      rolePlayers: {
        attorney: rolePlayersDraft.attorney,
        bondOriginator: rolePlayersDraft.bondOriginator,
      },
    }))
    setDetailMessage('Role players saved locally.')
  }

  async function handleCreateOfferLink(event) {
    event.preventDefault()
    if (!listingRecord) return
    setOfferActionError('')
    setOfferActionMessage('')
    const selectedLead = listingLeads.find((lead) => String(lead?.id || '') === String(offerInviteDraft.buyerLeadId || ''))
    if (!selectedLead) {
      setOfferActionError('Select a buyer lead before generating an offer link.')
      return
    }

    try {
      setSendingOfferLink(true)
      const canonicalOffer = await createCanonicalOffer({
        organisationId: listingOrganisationId,
        buyerLeadId: selectedLead.leadId || selectedLead.id,
        buyerContactId: selectedLead.contactId,
        listingId: listingRecord.id,
        agentId: profile?.id || listingRecord?.agentId,
        status: 'draft',
      }, {
        actor: {
          id: profile?.id || listingRecord?.agentId || '',
          name: String(profile?.fullName || listingRecord?.assignedAgentName || listingRecord?.assignedAgent || 'Agent').trim(),
          email: String(profile?.email || listingRecord?.assignedAgentEmail || '').trim(),
        },
      })
      const { invite, link } = createOfferInvite({
        listingId: listingRecord.id,
        buyerLeadId: selectedLead.id,
        buyerLeadName: selectedLead.name || '',
        agentId: String(listingRecord?.agentId || listingRecord?.assignedAgentEmail || '').trim(),
        agentName: String(listingRecord?.assignedAgentName || listingRecord?.assignedAgent || 'Assigned Agent').trim(),
        agentEmail: String(listingRecord?.assignedAgentEmail || '').trim(),
        agencyName: String(listingRecord?.agencyOrganisation || '').trim(),
        sellerToken: String(listingRecord?.sellerOnboarding?.token || '').trim(),
        organisationId: listingOrganisationId,
        canonicalOfferId: canonicalOffer?.offerId || canonicalOffer?.id || '',
        expiresInDays: Math.max(1, Number(offerInviteDraft.expiresInDays || 7)),
      })

      const buyerName = String(selectedLead?.name || 'Buyer').trim()
      const propertyLabel = String(listingRecord?.listingTitle || listingRecord?.propertyAddress || 'property').trim()
      if (String(selectedLead?.email || '').trim()) {
        try {
          await invokeEdgeFunction('send-email', {
            body: {
              type: 'buyer_offer_link',
              to: String(selectedLead.email || '').trim(),
              buyerName,
              propertyTitle: propertyLabel,
              offerLink: link,
              expiresAt: invite?.expiresAt || '',
            },
          })
        } catch (error) {
          console.error('[Offers] buyer offer email notification failed', error)
        }
      }

      if (String(selectedLead?.phone || '').trim()) {
        try {
          await sendWhatsAppNotification({
            to: formatSouthAfricanWhatsAppNumber(selectedLead.phone),
            role: 'buyer',
            message: `Hi ${buyerName},\n\nYour viewing for ${propertyLabel} is complete.\n\nSubmit your secure offer here:\n${link}\n\nThis link expires on ${formatDate(invite?.expiresAt)}.\n\n- Bridge`,
          })
        } catch (error) {
          console.error('[Offers] buyer offer WhatsApp notification failed', error)
        }
      }

      setOfferActionMessage('Secure offer link generated and sent to the buyer.')
      setShowSendOfferLinkForm(false)
      setOfferInviteDraft({ buyerLeadId: '', expiresInDays: 7 })
      setOffersRefreshTick((value) => value + 1)
    } catch (error) {
      setOfferActionError(error?.message || 'Unable to generate offer link.')
    } finally {
      setSendingOfferLink(false)
    }
  }

  function handleCopyOfferLink(token) {
    if (!token) return
    const link = `${window.location.origin}/client/offer/${token}`
    navigator.clipboard.writeText(link).then(
      () => {
        setCopiedOfferToken(token)
        setTimeout(() => setCopiedOfferToken(''), 1800)
      },
      () => {
        setOfferActionError('Unable to copy offer link.')
      },
    )
  }

  function handleOfferAction(offerId, action) {
    setOfferActionError('')
    setOfferActionMessage('')
    try {
      const notes = String(offerNotesDraftById?.[offerId] || '').trim()
      markOfferAgentAction(offerId, action, notes)
      setOfferActionMessage('Offer updated successfully.')
      setOffersRefreshTick((value) => value + 1)
    } catch (error) {
      setOfferActionError(error?.message || 'Unable to update offer.')
    }
  }

  async function resolveSellerClientPortalInviteContext() {
    if (!listingRecord?.id) throw new Error('Listing is not available yet.')

    let token = toCleanText(
      listingRecord?.sellerOnboarding?.token ||
        listingRecord?.sellerOnboardingToken ||
        listingRecord?.seller_onboarding_token,
    )
    token = token || extractSellerPortalTokenFromLink(listingRecord?.sellerOnboarding?.clientPortalLink)
    token = token || extractSellerPortalTokenFromLink(listingRecord?.sellerOnboarding?.link)

    let sellerEmail = resolveSellerEmailFromListing(listingRecord)
    let sellerName = resolveSellerNameFromListing(listingRecord)
    let onboardingRow = null

    if (isSupabaseConfigured && supabase && (!token || !sellerEmail)) {
      const onboardingQuery = await supabase
        .from('private_listing_seller_onboarding')
        .select('token, status, form_data, updated_at')
        .eq('private_listing_id', listingRecord.id)
        .maybeSingle()

      if (onboardingQuery.error && String(onboardingQuery.error?.code || '') !== '42P01') {
        throw onboardingQuery.error
      }

      onboardingRow = onboardingQuery.data || null
      const formData = onboardingRow?.form_data && typeof onboardingRow.form_data === 'object' ? onboardingRow.form_data : {}
      token = token || toCleanText(onboardingRow?.token)
      sellerEmail = sellerEmail || toCleanText(formData.sellerEmail || formData.email || formData.contactEmail).toLowerCase()
      sellerName = sellerName || toCleanText(
        [formData.sellerFirstName || formData.firstName, formData.sellerSurname || formData.lastName].filter(Boolean).join(' ') ||
          formData.sellerName ||
          formData.fullName,
      )
    }

    if (!token) {
      throw new Error('No seller client portal token is linked to this listing yet. Send seller onboarding first so Bridge can create the portal link.')
    }
    if (!isValidEmail(sellerEmail)) {
      throw new Error('No seller email is linked to this listing yet. Add the seller email before resending the client portal link.')
    }

    const portalLink = buildSellerClientPortalLink(token)
    if (!portalLink) throw new Error('Seller client portal link could not be built from the saved token.')

    if (onboardingRow) {
      const existingFormData = onboardingRow.form_data && typeof onboardingRow.form_data === 'object' ? onboardingRow.form_data : {}
      setPrivateListings((rows) => upsertListingRecord(rows, {
        ...listingRecord,
        sellerOnboarding: {
          ...(listingRecord?.sellerOnboarding || {}),
          token,
          status: onboardingRow.status || listingRecord?.sellerOnboarding?.status,
          updatedAt: onboardingRow.updated_at || listingRecord?.sellerOnboarding?.updatedAt,
          link: listingRecord?.sellerOnboarding?.link || portalLink,
          clientPortalLink: portalLink,
          formData: {
            ...getListingSellerFormData(listingRecord),
            ...existingFormData,
          },
        },
      }))
    }

    return {
      token,
      portalLink,
      sellerEmail,
      sellerName: sellerName || 'Seller',
    }
  }

  async function handleResendSellerClientPortalLink() {
    setDetailError('')
    setDetailMessage('')
    try {
      setResendingSellerPortalLink(true)
      if (!isSupabaseConfigured) {
        throw new Error('Email sending requires Supabase to be configured.')
      }
      const { portalLink, sellerEmail, sellerName } = await resolveSellerClientPortalInviteContext()
      const agent = getCanonicalOfferActor()
      const emailResponse = await invokeEdgeFunction('send-email', {
        body: {
          type: 'seller_mandate_sent',
          to: sellerEmail,
          organisationId: listingOrganisationId,
          recipientRole: 'seller',
          recipientName: sellerName,
          sellerName,
          propertyTitle: listingRecord?.listingTitle || listingRecord?.title || listingRecord?.propertyAddress || 'your property',
          mandateType: 'Mandate',
          mandateStartDate: marketingDraft.listingDate || '',
          mandateEndDate: marketingDraft.expiryDate || '',
          askingPrice: formatCurrency(marketingDraft.price || listingRecord?.askingPrice || listingRecord?.estimatedValue),
          portalLink,
          agentName: agent.name,
        },
      })
      if (emailResponse?.error || emailResponse?.data?.error) {
        throw emailResponse.error || new Error(emailResponse.data.error)
      }
      if (typeof navigator !== 'undefined') {
        void navigator.clipboard?.writeText(portalLink)
      }
      setDetailMessage(`Seller client portal link resent to ${sellerEmail}. Link copied.`)
    } catch (error) {
      setDetailError(error?.message || 'Unable to resend the seller client portal link.')
    } finally {
      setResendingSellerPortalLink(false)
    }
  }

  function getCanonicalOfferActor() {
    return {
      id: String(profile?.id || listingRecord?.agentId || '').trim(),
      name: String(profile?.fullName || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || listingRecord?.assignedAgentName || listingRecord?.assignedAgent || 'Agent').trim(),
      email: String(profile?.email || listingRecord?.assignedAgentEmail || '').trim(),
    }
  }

  function buildCanonicalListingOfferPatch(offerRow, actionLabel, note = '') {
    const canonicalOffer = canonicalListingOffers.find((offer) => String(offer.id) === String(offerRow?.canonicalOfferId || ''))
    const conditions = canonicalOffer?.conditions || {}
    const trimmedNote = String(note || '').trim()
    return {
      conditions_json: {
        ...conditions,
        agentActionHistory: [
          ...(Array.isArray(conditions.agentActionHistory) ? conditions.agentActionHistory : []),
          {
            action: actionLabel,
            note: trimmedNote,
            at: new Date().toISOString(),
            actorId: getCanonicalOfferActor().id,
            actorName: getCanonicalOfferActor().name,
          },
        ],
        latestAgentNote: trimmedNote || conditions.latestAgentNote || '',
      },
    }
  }

  async function handleCanonicalListingOfferStatus(offerRow, nextStatus, actionLabel) {
    if (!listingOrganisationId || !offerRow?.canonicalOfferId) return
    const note = offerNotesDraftById?.[offerRow.id] || ''
    setOfferActionError('')
    setOfferActionMessage('')
    try {
      setCanonicalOfferActionId(`${offerRow.id}:${nextStatus}`)
      await updateCanonicalOfferStatus(offerRow.canonicalOfferId, nextStatus, {
        organisationId: listingOrganisationId,
        actor: getCanonicalOfferActor(),
        patch: buildCanonicalListingOfferPatch(offerRow, actionLabel || nextStatus, note),
      })
      setOfferNotesDraftById((previous) => ({ ...previous, [offerRow.id]: '' }))
      setOfferActionMessage(`Canonical offer moved to ${nextStatus.replaceAll('_', ' ')}.`)
      setOffersRefreshTick((value) => value + 1)
    } catch (error) {
      setOfferActionError(error?.message || 'Unable to update canonical offer.')
    } finally {
      setCanonicalOfferActionId('')
    }
  }

  async function handleCanonicalListingOfferSendToSeller(offerRow) {
    if (!listingOrganisationId || !offerRow?.canonicalOfferId || !listingRecord) return
    const canonicalOffer = canonicalListingOffers.find((offer) => String(offer.id) === String(offerRow.canonicalOfferId))
    const note = offerNotesDraftById?.[offerRow.id] || ''
    let createdReviewSession = null
    setOfferActionError('')
    setOfferActionMessage('')
    try {
      setCanonicalOfferActionId(`${offerRow.id}:sent_to_seller`)
      const sellerEmail = resolveSellerEmailFromListing(listingRecord)
      if (!isValidEmail(sellerEmail)) {
        throw new Error('No seller email is linked to this listing yet. Add the seller email before sending the offer for review.')
      }
      const sellerName = resolveSellerNameFromListing(listingRecord) || 'Seller'
      const { session } = await createOfferSellerReviewSession({
        organisationId: listingOrganisationId,
        offerId: offerRow.canonicalOfferId,
        offer: canonicalOffer,
        listingId: listingRecord.id,
        sellerLeadId: canonicalOffer?.sellerLeadId || listingRecord?.sellerLeadId || listingRecord?.leadId,
        sellerContactId: canonicalOffer?.sellerContactId || listingRecord?.sellerContactId,
        sellerEmail,
        sellerName,
        agentId: getCanonicalOfferActor().id,
        agentReviewNotes: note,
        metadata: {
          source: 'listing_offer_review',
          listingId: listingRecord.id,
          sellerEmail,
          sellerName,
        },
      }, {
        actor: getCanonicalOfferActor(),
      })
      createdReviewSession = session
      const reviewLink = session?.token && typeof window !== 'undefined'
        ? `${window.location.origin}/seller/offers/review/${encodeURIComponent(session.token)}`
        : ''
      if (reviewLink && typeof navigator !== 'undefined') {
        void navigator.clipboard?.writeText(reviewLink)
      }
      const emailResponse = await invokeEdgeFunction('send-email', {
        body: {
          type: 'seller_offer_review',
          to: sellerEmail,
          sellerName,
          propertyTitle: listingRecord?.listingTitle || listingRecord?.title || listingRecord?.propertyAddress || 'your property',
          buyerName: offerRow.buyerName || canonicalOffer?.conditions?.buyerName || 'Buyer',
          offerAmount: formatCurrency(offerRow.offerPrice || canonicalOffer?.offerAmount),
          reviewLink,
          expiresAt: session?.expiresAt || '',
          agentName: getCanonicalOfferActor().name,
          note,
        },
      })
      if (emailResponse?.error || emailResponse?.data?.error) {
        throw emailResponse.error || new Error(emailResponse.data.error)
      }
      setOfferNotesDraftById((previous) => ({ ...previous, [offerRow.id]: '' }))
      setOfferActionMessage(reviewLink ? `Offer emailed to ${sellerEmail}. Seller link copied.` : `Offer emailed to ${sellerEmail}.`)
      setOffersRefreshTick((value) => value + 1)
    } catch (error) {
      if (createdReviewSession?.id) {
        await updateCanonicalOfferStatus(offerRow.canonicalOfferId, 'agent_review', {
          organisationId: listingOrganisationId,
          actor: getCanonicalOfferActor(),
          patch: {
            conditions_json: {
              ...(canonicalOffer?.conditions || {}),
              latestAgentNote: error?.message || 'Seller email failed after review link creation.',
              agentActionHistory: [
                ...(Array.isArray(canonicalOffer?.conditions?.agentActionHistory) ? canonicalOffer.conditions.agentActionHistory : []),
                {
                  action: 'Seller email failed',
                  note: error?.message || 'Seller email failed after review link creation.',
                  at: new Date().toISOString(),
                  actorId: getCanonicalOfferActor().id,
                  actorName: getCanonicalOfferActor().name,
                },
              ],
            },
          },
        }).catch(() => null)
        setOffersRefreshTick((value) => value + 1)
      }
      setOfferActionError(error?.message || 'Unable to send this offer to seller review.')
    } finally {
      setCanonicalOfferActionId('')
    }
  }

  async function handleCanonicalListingOfferConversion(offerRow) {
    if (!listingOrganisationId || !offerRow?.canonicalOfferId || !listingRecord) return
    const canonicalOffer = canonicalListingOffers.find((offer) => String(offer.id) === String(offerRow.canonicalOfferId))
    const linkedLead = listingLeads.find((lead) =>
      String(lead?.leadId || lead?.id || '') === String(offerRow?.buyerLeadId || canonicalOffer?.buyerLeadId || ''),
    )
    const note = offerNotesDraftById?.[offerRow.id] || ''
    setOfferActionError('')
    setOfferActionMessage('')
    try {
      setCanonicalOfferActionId(`${offerRow.id}:convert`)
      const currentStatus = normalizeOfferWorkflowStatus(canonicalOffer?.status || offerRow.status)
      const acceptedOffer = [
          OFFER_WORKFLOW_STATUS.ACCEPTED,
          OFFER_WORKFLOW_STATUS.CONVERTED_TO_TRANSACTION,
        ].includes(currentStatus)
        ? canonicalOffer
        : await updateCanonicalOfferStatus(offerRow.canonicalOfferId, 'accepted', {
            organisationId: listingOrganisationId,
            actor: getCanonicalOfferActor(),
            patch: buildCanonicalListingOfferPatch(offerRow, 'Accepted for transaction conversion', note),
          })
      const createdTransaction = await createTransactionFromAcceptedCanonicalOffer({
        organisationId: listingOrganisationId,
        offerId: offerRow.canonicalOfferId,
        offer: acceptedOffer || canonicalOffer,
        lead: {
          ...(linkedLead || {}),
          leadId: linkedLead?.leadId || acceptedOffer?.buyerLeadId || canonicalOffer?.buyerLeadId,
          contactId: linkedLead?.contactId || acceptedOffer?.buyerContactId || canonicalOffer?.buyerContactId,
          email: linkedLead?.email || acceptedOffer?.conditions?.buyerEmail || canonicalOffer?.conditions?.buyerEmail,
          phone: linkedLead?.phone || acceptedOffer?.conditions?.buyerPhone || canonicalOffer?.conditions?.buyerPhone,
          firstName: linkedLead?.firstName || acceptedOffer?.conditions?.buyerName || canonicalOffer?.conditions?.buyerName,
          budget: acceptedOffer?.offerAmount || canonicalOffer?.offerAmount,
          assignedAgentId: getCanonicalOfferActor().id,
          assignedAgentName: getCanonicalOfferActor().name,
          assignedAgentEmail: getCanonicalOfferActor().email,
        },
        listing: listingRecord,
        actor: getCanonicalOfferActor(),
        payload: {
          listingId: listingRecord.id,
          buyerName: offerRow.buyerName,
          buyerEmail: linkedLead?.email || acceptedOffer?.conditions?.buyerEmail || canonicalOffer?.conditions?.buyerEmail,
          buyerPhone: linkedLead?.phone || acceptedOffer?.conditions?.buyerPhone || canonicalOffer?.conditions?.buyerPhone,
        },
      })
      const transactionId = String(createdTransaction?.transactionId || createdTransaction?.transactionRow?.transaction?.id || '').trim()
      const reusedTransaction = Boolean(createdTransaction?.alreadyConverted || (createdTransaction?.existing && transactionId))
      let onboardingSendWarning = ''
      if (transactionId && isSupabaseConfigured) {
        const onboardingEmail = await invokeEdgeFunction('send-email', {
          body: {
            type: 'client_onboarding',
            transactionId,
            source: 'accepted_offer_conversion',
          },
        })
        const onboardingEmailError = onboardingEmail?.error || onboardingEmail?.data?.error
        if (onboardingEmailError) {
          onboardingSendWarning = typeof onboardingEmailError === 'string'
            ? onboardingEmailError
            : onboardingEmailError?.message || 'Buyer onboarding email could not be sent.'
        }
      }
      if (transactionId) {
        await recordBuyerLeadActivity({
          organisationId: listingOrganisationId,
          leadId: acceptedOffer?.buyerLeadId || canonicalOffer?.buyerLeadId || linkedLead?.leadId,
          activityType: reusedTransaction ? 'Buyer Onboarding Resent' : 'Buyer Onboarding Sent',
          activityNote: onboardingSendWarning
            ? `Buyer onboarding email attempted for transaction ${transactionId}, but delivery needs attention: ${onboardingSendWarning}`
            : `${reusedTransaction ? 'Buyer onboarding resent' : 'Buyer onboarding sent'} for transaction ${transactionId}.`,
          outcome: onboardingSendWarning ? 'Delivery Warning' : 'Sent',
          actor: getCanonicalOfferActor(),
        }).catch(() => null)
      }
      setOfferNotesDraftById((previous) => ({ ...previous, [offerRow.id]: '' }))
      setOfferActionMessage(onboardingSendWarning
        ? `${reusedTransaction ? 'Buyer onboarding resend attempted' : 'Transaction created from accepted canonical offer'}. ${onboardingSendWarning}`
        : reusedTransaction
          ? 'Buyer onboarding was resent for the existing transaction.'
          : 'Transaction created from accepted canonical offer and buyer onboarding was sent.')
      setOffersRefreshTick((value) => value + 1)
    } catch (error) {
      setOfferActionError(error?.message || 'Unable to create a transaction from this offer.')
    } finally {
      setCanonicalOfferActionId('')
    }
  }

  const legacyOfferRows = useMemo(() => {
    void offersRefreshTick
    if (!listingRecord?.id) return []
    return getOffersForListing(listingRecord.id).map((record) => ({
      ...record,
      sourceSystem: 'legacy_listing_offer',
      buyerName: record?.buyer?.fullName || 'Buyer',
      offerPrice: Number(record?.offer?.offerAmount || 0) || 0,
      conditions: String(record?.offer?.specialConditions || record?.offer?.suspensiveConditions || '').trim(),
      supportingDocsUrl: String(record?.offer?.proofOfFundsUrl || '').trim(),
      offerDate: record?.submittedAt || '',
      expiryDate: record?.offer?.expiryDate || '',
      status: normalizeOfferWorkflowStatus(record?.status),
      financeType: String(record?.offer?.financeType || 'unknown').trim(),
      depositAmount: Number(record?.offer?.depositAmount || 0) || 0,
      submittedBy: record?.source || 'buyer_offer_link',
    }))
  }, [listingRecord?.id, offersRefreshTick])

  const canonicalOfferRows = useMemo(() => {
    return (Array.isArray(canonicalListingOffers) ? canonicalListingOffers : []).map((offer) => ({
      id: `canonical-${offer.id}`,
      canonicalOfferId: offer.id,
      sourceSystem: 'canonical_offer',
      buyerLeadId: offer.buyerLeadId,
      buyerContactId: offer.buyerContactId,
      buyerName: offer.conditions?.buyerName || offer.conditions?.fullName || 'Buyer',
      offerPrice: Number(offer.offerAmount || 0) || 0,
      conditions: String(offer.conditions?.specialConditions || offer.conditions?.suspensiveConditions || '').trim(),
      supportingDocsUrl: String(offer.conditions?.proofOfFundsUrl || '').trim(),
      offerDate: offer.submittedAt || offer.createdAt || '',
      expiryDate: offer.expiryDate || '',
      status: normalizeOfferWorkflowStatus(offer.status),
      financeType: String(offer.financeType || 'unknown').trim(),
      depositAmount: Number(offer.depositAmount || 0) || 0,
      submittedBy: 'canonical_offers',
      agentNotes: offer.conditions?.agentNotes || offer.conditions?.agentNoteToBuyer || '',
      viewingAppointmentId: offer.viewingAppointmentId,
      transactionId: offer.transactionId,
      sentToSellerAt: offer.sentToSellerAt,
      sellerViewedAt: offer.sellerViewedAt,
      sellerReviewSession: offer.sellerReviewSession,
      conditionsJson: offer.conditions || {},
    }))
  }, [canonicalListingOffers])

  const offerRows = useMemo(() => {
    const canonicalLeadKeys = new Set(canonicalOfferRows.map((offer) => `${offer.buyerLeadId || ''}:${offer.offerPrice || 0}:${offer.status || ''}`))
    const nonDuplicatedLegacyRows = legacyOfferRows.filter((offer) => {
      const key = `${offer.buyerLeadId || ''}:${offer.offerPrice || 0}:${offer.status || ''}`
      return !offer.buyerLeadId || !canonicalLeadKeys.has(key)
    })
    return [...canonicalOfferRows, ...nonDuplicatedLegacyRows]
      .sort((left, right) => new Date(right.offerDate || 0) - new Date(left.offerDate || 0))
  }, [canonicalOfferRows, legacyOfferRows])

  const offerInviteRows = useMemo(() => {
    void offersRefreshTick
    if (!listingRecord?.id) return []
    return getOfferInvitesForListing(listingRecord.id)
  }, [listingRecord?.id, offersRefreshTick])

  const offerSummary = useMemo(() => {
    const statusCount = (status) => offerRows.filter((offer) => normalizeOfferWorkflowStatus(offer?.status) === status).length
    return {
      total: offerRows.length,
      submitted: statusCount(OFFER_WORKFLOW_STATUS.SUBMITTED),
      sellerReview: statusCount(OFFER_WORKFLOW_STATUS.SELLER_REVIEW),
      accepted: offerRows.filter((offer) => [OFFER_WORKFLOW_STATUS.ACCEPTED, OFFER_WORKFLOW_STATUS.CONVERTED_TO_TRANSACTION].includes(normalizeOfferWorkflowStatus(offer?.status))).length,
      countered: statusCount(OFFER_WORKFLOW_STATUS.COUNTERED),
      highest: offerRows.reduce((highest, offer) => {
        const value = Number(offer?.offerPrice || 0)
        return Number.isFinite(value) && value > highest ? value : highest
      }, 0),
    }
  }, [offerRows])

  const listingLeads = useMemo(() => {
    if (!listingRecord) return []
    return pipelineLeads.filter((lead) => {
      return String(lead?.unitId || '') === String(listingRecord.id) || String(lead?.unitNumber || '') === String(listingRecord.listingTitle || '')
    })
  }, [listingRecord, pipelineLeads])

  const dynamicSellerRequirements = useMemo(() => {
    if (!listingRecord) return []
    const existingDynamic = Array.isArray(listingRecord?.documentRequirements) ? listingRecord.documentRequirements : []
    if (existingDynamic.length) return existingDynamic

    const profile = getSellerRequirementProfile(listingRecord)
    const generated = getRequiredSellerDocuments(profile)
    const legacyDocs = Array.isArray(listingRecord?.requiredDocuments) ? listingRecord.requiredDocuments : []
    const legacyMap = new Map(legacyDocs.map((doc) => [String(doc?.key || '').trim().toLowerCase(), doc]))
    return generated.map((row) => {
      const legacy = legacyMap.get(String(row?.requirement_key || '').trim().toLowerCase())
      return {
        ...row,
        key: row.requirement_key,
        label: row.requirement_name,
        status: legacy?.status || row.status || 'required',
        fileName: legacy?.fileName || '',
      }
    })
  }, [listingRecord])

  const sellerReadinessSummary = useMemo(() => {
    if (!listingRecord) return null
    const legacyDocuments = Array.isArray(listingRecord?.requiredDocuments)
      ? listingRecord.requiredDocuments.map((doc) => ({
          requirement_key: doc?.key,
          document_type: doc?.key,
          status: doc?.status,
          document_name: doc?.label,
        }))
      : []

    return getListingReadinessSummary({
      ...listingRecord,
      documentRequirements: dynamicSellerRequirements,
      documents: Array.isArray(listingRecord?.documents) && listingRecord.documents.length ? listingRecord.documents : legacyDocuments,
    })
  }, [dynamicSellerRequirements, listingRecord])

  const propertyDocuments = useMemo(
    () => dynamicSellerRequirements.filter((doc) => ['property', 'compliance', 'financial', 'occupancy'].includes(String(doc?.requirement_group || '').trim().toLowerCase())),
    [dynamicSellerRequirements],
  )

  const sellerDocuments = useMemo(
    () => dynamicSellerRequirements.filter((doc) => ['seller_identity', 'fica', 'marital', 'company', 'trust', 'deceased_estate', 'mandate'].includes(String(doc?.requirement_group || '').trim().toLowerCase())),
    [dynamicSellerRequirements],
  )

  const buyerDocuments = useMemo(() => {
    const accepted = offerRows.find((offer) =>
      [OFFER_WORKFLOW_STATUS.ACCEPTED, OFFER_WORKFLOW_STATUS.CONVERTED_TO_TRANSACTION].includes(normalizeOfferWorkflowStatus(offer?.status)),
    )
    if (!accepted) return []
    return [
      { key: 'buyer_otp', label: 'Offer Documentation Pack', status: 'requested', fileName: '' },
      { key: 'buyer_finance', label: 'Finance / Proof of Funds', status: accepted.conditions?.toLowerCase().includes('cash') ? 'uploaded' : 'requested', fileName: '' },
    ]
  }, [offerRows])

  const metrics = useMemo(() => {
    const pendingOffers = offerRows.filter((offer) => {
      const status = normalizeOfferWorkflowStatus(offer?.status)
      return [
        OFFER_WORKFLOW_STATUS.SUBMITTED,
        OFFER_WORKFLOW_STATUS.AGENT_REVIEW,
        OFFER_WORKFLOW_STATUS.SELLER_REVIEW,
        OFFER_WORKFLOW_STATUS.BUYER_REVIEW_COUNTER,
      ].includes(status)
    }).length
    const activeOffers = offerRows.filter((offer) => {
      const status = normalizeOfferWorkflowStatus(offer?.status)
      return [
        OFFER_WORKFLOW_STATUS.SUBMITTED,
        OFFER_WORKFLOW_STATUS.AGENT_REVIEW,
        OFFER_WORKFLOW_STATUS.SELLER_REVIEW,
        OFFER_WORKFLOW_STATUS.BUYER_REVIEW_COUNTER,
        OFFER_WORKFLOW_STATUS.COUNTERED,
        OFFER_WORKFLOW_STATUS.ACCEPTED,
      ].includes(status)
    }).length
    const daysOnMarket = getDaysOnMarket(listingRecord?.createdAt)
    const offerAverage = getOfferAverage(offerRows)
    const leadCount = listingLeads.length
    const viewingCount = viewings.filter((item) => [VIEWING_STATUS.CONFIRMED, VIEWING_STATUS.COMPLETED, VIEWING_STATUS.PENDING_APPROVAL, VIEWING_STATUS.RESCHEDULE_REQUESTED].includes(String(item?.status || '').trim().toLowerCase())).length
    const offerLeadCount = listingLeads.filter((lead) => getLeadStage(lead).includes('offer') || getLeadStage(lead).includes('negotiating')).length
    const acceptedCount = offerRows.filter((offer) =>
      [OFFER_WORKFLOW_STATUS.ACCEPTED, OFFER_WORKFLOW_STATUS.CONVERTED_TO_TRANSACTION].includes(normalizeOfferWorkflowStatus(offer?.status)),
    ).length
    const estimatedViews = leadCount * 6 + activeOffers * 8 + 12
    return {
      pendingOffers,
      activeOffers,
      daysOnMarket,
      offerAverage,
      highestOffer: Math.max(0, ...offerRows.map((offer) => Number(offer?.offerPrice || 0))),
      leadCount,
      viewingCount,
      offerLeadCount,
      acceptedCount,
      estimatedViews,
    }
  }, [listingLeads, listingRecord?.createdAt, offerRows, viewings])

  const sourceBreakdown = useMemo(() => {
    const counts = new Map([
      ['Property24', 0],
      ['Private Property', 0],
      ['Direct / Manual', 0],
    ])

    for (const lead of listingLeads) {
      const source = String(lead?.source || '').trim().toLowerCase()
      if (source === 'property24') {
        counts.set('Property24', counts.get('Property24') + 1)
      } else if (source === 'private property') {
        counts.set('Private Property', counts.get('Private Property') + 1)
      } else {
        counts.set('Direct / Manual', counts.get('Direct / Manual') + 1)
      }
    }

    const colors = {
      'Property24': '#1f4f78',
      'Private Property': '#2f8f6b',
      'Direct / Manual': '#c58b35',
    }
    const total = Array.from(counts.values()).reduce((sum, value) => sum + value, 0)
    return Array.from(counts.entries()).map(([label, value]) => ({
      label,
      value,
      color: colors[label],
      share: total ? Math.round((value / total) * 100) : 0,
    }))
  }, [listingLeads])

  const pricingInsight = useMemo(() => {
    const asking = Number(listingRecord?.askingPrice || 0)
    const averageOffer = Number(metrics.offerAverage || 0)
    if (!asking || !averageOffer) {
      return {
        varianceValue: 0,
        varianceLabel: 'No offer variance yet',
        askingFill: asking ? 100 : 0,
        offerFill: averageOffer ? 100 : 0,
      }
    }
    const variance = averageOffer - asking
    return {
      varianceValue: variance,
      varianceLabel: variance >= 0 ? 'Average offer above asking' : 'Average offer below asking',
      askingFill: 100,
      offerFill: Math.max(12, Math.min(100, (averageOffer / asking) * 100)),
    }
  }, [listingRecord?.askingPrice, metrics.offerAverage])

  const onboardingStatusLabel = getOnboardingStatusLabel(listingRecord?.sellerOnboarding?.status)
  const missingDocuments = useMemo(
    () =>
      (listingRecord?.requiredDocuments || []).filter((doc) => {
        const status = String(doc?.status || '').trim().toLowerCase()
        return status === 'requested' || status === 'missing' || status === 'pending'
      }).length,
    [listingRecord?.requiredDocuments],
  )
  const nextBestAction = useMemo(
    () =>
      getNextBestAction({
        pendingOffers: metrics.pendingOffers,
        missingDocuments,
        onboardingStatus: onboardingStatusLabel,
      }),
    [metrics.pendingOffers, missingDocuments, onboardingStatusLabel],
  )

  const activityItems = useMemo(() => {
    const items = []
    if (listingRecord?.createdAt) {
      items.push({
        title: 'Listing created',
        timestamp: listingRecord.createdAt,
        copy: `${listingRecord.listingTitle} was captured and is now active in the agent workspace.`,
      })
    }
    for (const offer of offerRows.slice(0, 2)) {
      items.push({
        title: `Offer from ${offer.buyerName || 'buyer'}`,
        timestamp: offer.offerDate,
        copy: `${formatCurrency(offer.offerPrice)} • ${formatStatusLabel(offer.status)}`,
      })
    }
    for (const viewing of viewings.slice(0, 2)) {
      items.push({
        title: `Viewing ${formatViewingStatusLabel(viewing.status).toLowerCase()}`,
        timestamp: viewing.updated_at || viewing.created_at,
        copy: `${viewing.buyer_name || 'Buyer'} • ${viewing.proposed_date || 'Date pending'} ${viewing.proposed_time || ''}`.trim(),
      })
    }
    for (const document of (listingRecord?.requiredDocuments || []).slice(0, 2)) {
      items.push({
        title: `Document: ${document.label}`,
        timestamp: listingRecord?.createdAt,
        copy: `Current status: ${formatStatusLabel(document.status)}`,
      })
    }
    return items
      .sort((left, right) => new Date(right.timestamp || 0) - new Date(left.timestamp || 0))
      .slice(0, 5)
  }, [listingRecord?.createdAt, listingRecord?.listingTitle, listingRecord?.requiredDocuments, offerRows, viewings])

  const mandateWorkspace = useMemo(() => {
    const mandate = listingRecord?.mandate || {}
    const mandateDocument = (Array.isArray(listingRecord?.documents) ? listingRecord.documents : []).find((document) => {
      const searchable = [
        document?.document_type,
        document?.documentType,
        document?.category,
        document?.document_name,
        document?.documentName,
        document?.fileName,
        document?.name,
      ].map((value) => normalizeKey(value)).join(' ')
      const hasUrl = Boolean(document?.url || document?.fileUrl || document?.file_url || document?.signedUrl || document?.signed_url)
      return searchable.includes('mandate') && hasUrl
    }) || null
    const status = String(
      listingRecord?.mandateStatus ||
        mandate?.status ||
        (marketingDraft.mandateSignedDate || mandate?.signedAt || mandate?.signed ? 'signed' : '') ||
        (mandate?.sentAt ? 'sent' : '') ||
        'draft',
    ).trim().toLowerCase()
    const signedDate = firstDraftValue(marketingDraft.mandateSignedDate, mandate?.signedAt, listingRecord?.mandateSignedDate)
    const expiryDate = firstDraftValue(marketingDraft.expiryDate, listingRecord?.mandateEndDate, mandate?.endDate)
    const expiryTime = expiryDate ? new Date(expiryDate).getTime() : NaN
    const daysUntilExpiry = Number.isFinite(expiryTime)
      ? Math.ceil((expiryTime - Date.now()) / (1000 * 60 * 60 * 24))
      : null
    const signedUrl = String(
      mandate?.signedUrl ||
        mandate?.signedFileUrl ||
        mandate?.signedDocumentUrl ||
        listingRecord?.signedMandateUrl ||
        listingRecord?.mandateSignedUrl ||
        mandateDocument?.url ||
        mandateDocument?.fileUrl ||
        mandateDocument?.file_url ||
        mandateDocument?.signedUrl ||
        mandateDocument?.signed_url ||
        '',
    ).trim()
    const viewUrl = String(
      mandate?.url ||
        mandate?.documentUrl ||
        listingRecord?.mandateUrl ||
        mandateDocument?.url ||
        mandateDocument?.fileUrl ||
        mandateDocument?.file_url ||
        mandateDocument?.signedUrl ||
        mandateDocument?.signed_url ||
        listingRecord?.mandateSigningLink ||
        (listingRecord?.sellerOnboarding?.link ? `${listingRecord.sellerOnboarding.link}/mandate` : '') ||
        '',
    ).trim()
    return {
      status,
      label: formatStatusLabel(status),
      signedDate,
      expiryDate,
      daysUntilExpiry,
      lastUpdated: firstDraftValue(mandate?.updatedAt, listingRecord?.updatedAt, listingRecord?.createdAt),
      signedUrl,
      viewUrl,
      isSigned: ['signed', 'completed', 'fully_signed', 'uploaded_signed', 'mandate_signed'].includes(status) || Boolean(signedDate || signedUrl),
      isExpired: daysUntilExpiry !== null && daysUntilExpiry < 0,
    }
  }, [listingRecord, marketingDraft.expiryDate, marketingDraft.mandateSignedDate])

  const sellerDocumentTrackerRows = useMemo(() => {
    const sourceRequirements = Array.isArray(dynamicSellerRequirements) ? dynamicSellerRequirements : []
    const uploadedDocuments = Array.isArray(listingRecord?.documents) ? listingRecord.documents : []
    const suggested = [
      { key: 'id_document', label: 'ID Document', match: /id|identity|seller/i },
      { key: 'proof_of_address', label: 'Proof of Address', match: /address|residence|proof/i },
      { key: 'title_deed', label: 'Title Deed / Reference', match: /title|deed/i },
      { key: 'rates_account', label: 'Rates Account', match: /rates/i },
      { key: 'fica_documents', label: 'FICA Documents', match: /fica/i },
      { key: 'mandate_signed', label: 'Signed Mandate', match: /mandate|mandate_signature|signed_mandate/i },
    ]
    return suggested.map((item) => {
      const requirement = sourceRequirements.find((row) =>
        item.match.test(`${row?.key || ''} ${row?.requirement_key || ''} ${row?.label || ''} ${row?.requirement_name || ''} ${row?.document_type || ''} ${row?.category || ''}`),
      )
      const requirementId = String(requirement?.id || requirement?.requirement_id || '').trim()
      const requirementKey = normalizeKey(requirement?.key || requirement?.requirement_key || item.key)
      const upload = uploadedDocuments.find((document) => {
        const documentRequirementId = String(document?.requirement_id || document?.requirementId || '').trim()
        if (requirementId && documentRequirementId && requirementId === documentRequirementId) return true
        const searchable = normalizeKey([
          document?.document_type,
          document?.documentType,
          document?.category,
          document?.document_name,
          document?.documentName,
          document?.fileName,
          document?.name,
          document?.requirement_key,
          document?.requirementKey,
        ].filter(Boolean).join(' '))
        return item.match.test(searchable) || (requirementKey && searchable.includes(requirementKey))
      }) || null
      const status = String(upload?.status || requirement?.status || '').trim().toLowerCase()
      const hasUpload = Boolean(
        upload?.storage_path ||
          upload?.file_path ||
          upload?.fileUrl ||
          upload?.file_url ||
          upload?.url ||
          upload?.signedUrl ||
          upload?.uploaded_at ||
          upload?.uploadedAt,
      )
      return {
        ...item,
        required: requirement?.is_required !== false,
        uploaded: hasUpload,
        status: hasUpload ? (status || 'uploaded') : status || 'missing',
        uploadedOn: upload?.uploadedAt || upload?.uploaded_at || upload?.createdAt || upload?.created_at || '',
        fileName: upload?.document_name || upload?.fileName || upload?.file_name || requirement?.fileName || requirement?.file_name || '',
        url: upload?.url || upload?.fileUrl || upload?.file_url || upload?.signedUrl || '',
      }
    })
  }, [dynamicSellerRequirements, listingRecord?.documents])

  const sellerReadinessChecklist = useMemo(() => {
    const documentsReady = sellerDocumentTrackerRows.filter((doc) => ['uploaded', 'complete', 'approved'].includes(String(doc.status || '').toLowerCase())).length >= 3
    return [
      { key: 'seller', label: 'Seller onboarded', complete: onboardingStatusLabel === 'Completed' || String(listingRecord?.sellerOnboarding?.status || '').toLowerCase().includes('complete') },
      { key: 'mandate', label: 'Mandate signed', complete: mandateWorkspace.isSigned },
      { key: 'documents', label: 'Documents uploaded', complete: documentsReady },
      { key: 'photos', label: 'Photos uploaded', complete: marketingDraft.galleryImages.length > 0 },
      { key: 'description', label: 'Description completed', complete: Boolean(marketingDraft.description.trim()) },
      { key: 'price', label: 'Price approved', complete: Boolean(Number(marketingDraft.price || listingRecord?.askingPrice || 0)) },
      { key: 'published', label: 'Listing published', complete: ['active', 'published'].includes(String(marketingDraft.listingStatus || listingRecord?.status || '').toLowerCase()) || marketingDraft.bridgeListingStatus === 'published' },
    ]
  }, [listingRecord, mandateWorkspace.isSigned, marketingDraft, onboardingStatusLabel, sellerDocumentTrackerRows])

  const sellerReadinessPercent = useMemo(() => {
    if (!sellerReadinessChecklist.length) return 0
    return Math.round((sellerReadinessChecklist.filter((item) => item.complete).length / sellerReadinessChecklist.length) * 100)
  }, [sellerReadinessChecklist])

  const sellerFormData = useMemo(() => getListingSellerFormData(listingRecord), [listingRecord])

  const sellerOnboardingSections = useMemo(() => {
    const usedKeys = new Set()
    const valueFor = (...keys) => firstDraftValue(...keys.map((key) => sellerFormData?.[key]))
    const field = (label, keys, fallback = '') => {
      keys.forEach((key) => usedKeys.add(key))
      return { label, value: formatFieldValue(firstDraftValue(valueFor(...keys), fallback)) }
    }
    const section = (title, rows) => ({ title, rows })
    const sections = [
      section('Seller Identity', [
        field('Seller Name', ['sellerName', 'fullName'], resolveSellerNameFromListing(listingRecord)),
        field('First Name', ['sellerFirstName', 'firstName']),
        field('Surname', ['sellerSurname', 'lastName']),
        field('Seller Type', ['sellerType', 'type'], listingRecord?.seller?.sellerType || listingRecord?.seller?.type || 'Individual'),
        field('ID / Registration', ['idNumber', 'sellerIdNumber', 'companyRegistrationNumber', 'trustRegistrationNumber'], listingRecord?.seller?.idNumber || listingRecord?.seller?.companyNumber || listingRecord?.seller?.trustNumber),
      ]),
      section('Contact Details', [
        field('Email', ['sellerEmail', 'email', 'contactEmail'], resolveSellerEmailFromListing(listingRecord)),
        field('Phone', ['sellerPhone', 'phone', 'contactNumber', 'mobile'], listingRecord?.seller?.phone),
        field('Alternative Contact', ['alternativeContact', 'alternateContact', 'secondaryPhone']),
        field('Preferred Contact Method', ['preferredContactMethod', 'contactPreference']),
      ]),
      section('Address Details', [
        field('Residential Address', ['residentialAddress', 'sellerAddress', 'address'], listingRecord?.seller?.address),
        field('Property Address', ['propertyAddress', 'addressLine1'], marketingDraft.addressLine1 || listingRecord?.addressLine1),
        field('Suburb', ['suburb'], marketingDraft.suburb || listingRecord?.suburb),
        field('City', ['city'], marketingDraft.city || listingRecord?.city),
        field('Province', ['province'], marketingDraft.province || listingRecord?.province),
      ]),
      section('Ownership Details', [
        field('Ownership Type', ['ownershipType', 'ownerType']),
        field('Title Deed Number', ['titleDeedNumber', 'deedNumber', 'titleReference']),
        field('Bond Holder', ['bondHolder', 'bondBank', 'mortgageBank']),
        field('Outstanding Bond', ['outstandingBond', 'bondSettlementAmount']),
        field('Co-owner Details', ['coOwnerDetails', 'coOwners']),
      ]),
      section('FICA / Compliance Details', [
        field('FICA Status', ['ficaStatus']),
        field('Tax Number', ['taxNumber', 'sellerTaxNumber']),
        field('Marital Status', ['maritalStatus']),
        field('POPI Consent', ['popiConsent', 'privacyConsent']),
        field('Compliance Notes', ['complianceNotes', 'ficaNotes']),
      ]),
      section('Mandate Preferences', [
        field('Mandate Type', ['mandateType'], listingRecord?.mandateType || listingRecord?.mandate?.type),
        field('Preferred Start Date', ['mandateStartDate', 'startDate']),
        field('Expiry Date', ['expiryDate', 'mandateEndDate'], mandateWorkspace.expiryDate),
        field('Asking Price', ['askingPrice', 'price'], marketingDraft.price || listingRecord?.askingPrice),
        field('Commission Preference', ['commissionPreference', 'commissionPercentage', 'commission_percent']),
      ]),
      section('Notes / Special Conditions', [
        field('Selling Reason', ['sellingReason']),
        field('Selling Timeline', ['sellingTimeline']),
        field('Special Conditions', ['specialConditions', 'conditions']),
        field('Notes', ['notes', 'sellerNotes', 'propertyNotes'], marketingDraft.notes),
      ]),
    ]
    const additionalRows = Object.entries(sellerFormData || {})
      .filter(([key, value]) => !usedKeys.has(key) && formatFieldValue(value))
      .map(([key, value]) => ({ label: formatFieldLabel(key), value: formatFieldValue(value) }))
    if (additionalRows.length) {
      sections.push(section('Additional Captured Fields', additionalRows))
    }
    return sections
  }, [listingRecord, mandateWorkspace.expiryDate, marketingDraft, sellerFormData])

  const keyInformationItems = useMemo(() => {
    const listingStatus = String(marketingDraft.listingStatus || listingRecord?.status || '').toLowerCase()
    const bridgeStatus = String(marketingDraft.bridgeListingStatus || listingRecord?.bridgeListingStatus || '').toLowerCase()
    const published = ['active', 'published', 'live'].includes(listingStatus) || bridgeStatus === 'published'
    return [
      { icon: MapPin, label: 'Location', value: [marketingDraft.suburb, marketingDraft.city].filter(Boolean).join(', ') || 'Location pending' },
      { icon: TrendingUp, label: 'Pipeline Value', value: formatCurrency(marketingDraft.price || listingRecord?.askingPrice) },
      { icon: Home, label: 'Property Type', value: marketingDraft.propertyType || listingRecord?.propertyType || 'Not captured' },
      { icon: UserRound, label: 'Assigned Agent', value: listingRecord?.assignedAgentName || listingRecord?.assignedAgent || listingRecord?.assignedAgentEmail || 'Unassigned' },
      { icon: ExternalLink, label: 'Listing Published', value: published ? 'Published' : 'Not published', status: published ? 'done' : 'pending' },
      { icon: HandCoins, label: 'Price Approved', value: Number(marketingDraft.price || listingRecord?.askingPrice || 0) ? 'Price captured' : 'No price', status: Number(marketingDraft.price || listingRecord?.askingPrice || 0) ? 'done' : 'missing' },
      { icon: Camera, label: 'Photos Uploaded', value: `${marketingDraft.galleryImages.length} photo${marketingDraft.galleryImages.length === 1 ? '' : 's'}`, status: marketingDraft.galleryImages.length ? 'done' : 'missing' },
      { icon: FileText, label: 'Description Complete', value: marketingDraft.description.trim() ? 'Description ready' : 'Description missing', status: marketingDraft.description.trim() ? 'done' : 'missing' },
    ]
  }, [listingRecord, marketingDraft])

  const sellerOnboardingSteps = useMemo(() => {
    const listingStatus = String(marketingDraft.listingStatus || listingRecord?.status || '').toLowerCase()
    const published = ['active', 'published', 'live'].includes(listingStatus) || marketingDraft.bridgeListingStatus === 'published'
    const sentStatuses = ['sent', 'sent_for_signature', 'viewed', 'signed', 'completed', 'fully_signed', 'mandate_signed']
    const steps = [
      { key: 'contacted', label: 'Contacted', complete: Boolean(listingRecord?.createdAt || resolveSellerEmailFromListing(listingRecord)), date: listingRecord?.createdAt },
      { key: 'appointment', label: 'Appointment', complete: viewings.length > 0, date: viewings[0]?.proposed_date || viewings[0]?.created_at },
      { key: 'valuation', label: 'Valuation', complete: Boolean(Number(marketingDraft.price || listingRecord?.askingPrice || 0)), date: listingRecord?.updatedAt },
      { key: 'mandate_sent', label: 'Mandate Sent', complete: sentStatuses.includes(mandateWorkspace.status) || mandateWorkspace.isSigned, date: listingRecord?.mandate?.sentAt || mandateWorkspace.lastUpdated },
      { key: 'mandate_signed', label: 'Mandate Signed', complete: mandateWorkspace.isSigned, date: mandateWorkspace.signedDate },
      { key: 'listing_ready', label: 'Listing Ready', complete: sellerReadinessPercent >= 85, inProgress: sellerReadinessPercent > 40, date: marketingDraft.listingDate || listingRecord?.updatedAt },
      { key: 'listing_published', label: 'Listing Published', complete: published, date: marketingDraft.listingDate || listingRecord?.updatedAt },
    ]
    return steps.map((step) => ({
      ...step,
      state: step.complete ? 'completed' : step.inProgress ? 'in_progress' : 'pending',
    }))
  }, [listingRecord, mandateWorkspace, marketingDraft, sellerReadinessPercent, viewings])

  const sellerOnboardingCompletedCount = sellerOnboardingSteps.filter((step) => step.state === 'completed').length

  const commissionWorkspace = useMemo(() => {
    const commission = listingRecord?.commission || {}
    const percentage = Number(firstDraftValue(
      commission?.commission_percentage,
      commission?.percentage,
      sellerFormData?.commissionPercentage,
      sellerFormData?.commission_percent,
      sellerFormData?.mandateCommissionPercentage,
      0,
    )) || 0
    const amount = Number(firstDraftValue(
      commission?.commission_amount,
      commission?.amount,
      sellerFormData?.commissionAmount,
      sellerFormData?.commission_amount,
      0,
    )) || 0
    const price = Number(marketingDraft.price || listingRecord?.askingPrice || 0) || 0
    const estimatedExVat = amount || (price && percentage ? (price * percentage) / 100 : 0)
    const vatHandling = String(firstDraftValue(commission?.vat, commission?.vat_handling, sellerFormData?.vatHandling, sellerFormData?.vatApplicable, '')).trim()
    const vatIncluded = vatHandling.toLowerCase().includes('incl') || vatHandling.toLowerCase() === 'yes'
    const estimatedInclVat = vatIncluded ? estimatedExVat : estimatedExVat ? estimatedExVat * 1.15 : 0
    const mandateTerms = firstDraftValue(commission?.mandate_terms, commission?.mandateTerms, sellerFormData?.mandateTerms, sellerFormData?.specialConditions)
    const paymentResponsibility = firstDraftValue(commission?.payment_responsibility, commission?.paymentResponsibility, sellerFormData?.paymentResponsibility)
    const notes = firstDraftValue(commission?.commission_notes, commission?.notes, sellerFormData?.commissionNotes, sellerFormData?.notes, '')
    const lastUpdated = firstDraftValue(commission?.updated_at, commission?.updatedAt, listingRecord?.mandate?.updatedAt, listingRecord?.updatedAt)
    const hasData = Boolean(percentage || amount || vatHandling || mandateTerms || paymentResponsibility || notes)
    return {
      type: listingRecord?.mandateType || listingRecord?.mandate?.type || 'sole',
      percentage,
      amount,
      estimatedInclVat,
      hasData,
      estimatedExVat,
      vatHandling: vatHandling || 'Not captured',
      vatIncluded,
      split: commission?.commission_split || commission?.split || 'Not captured',
      coAgentSplit: commission?.co_agent_split || commission?.coAgentSplit || 'Not captured',
      referralSplit: commission?.referral_split || commission?.referralSplit || 'Not captured',
      mandateTerms: mandateTerms || '',
      paymentResponsibility: paymentResponsibility || '',
      notes,
      lastUpdatedSource: lastUpdated ? `Updated ${formatDate(lastUpdated)}` : 'No captured source',
    }
  }, [listingRecord, marketingDraft.price, sellerFormData])

  const mandateActivityItems = useMemo(() => {
    const items = []
    const add = (title, timestamp, copy, icon = FolderKanban) => {
      if (!timestamp) return
      items.push({ title, timestamp, copy, icon })
    }
    add('Listing workspace created', listingRecord?.createdAt, `${listingRecord?.listingTitle || 'Listing'} was created.`, Home)
    add('Seller portal sent', listingRecord?.sellerOnboarding?.sentAt || listingRecord?.sellerOnboarding?.createdAt, 'Seller onboarding portal link was issued.', ExternalLink)
    add('Seller completed onboarding', listingRecord?.sellerOnboarding?.submittedAt || listingRecord?.sellerOnboarding?.completedAt, 'Seller onboarding form was submitted.', CheckCircle2)
    ;(Array.isArray(listingRecord?.documents) ? listingRecord.documents : []).forEach((document) => {
      add(
        `Document uploaded: ${document?.document_name || document?.documentName || document?.fileName || document?.name || formatStatusLabel(document?.document_type || 'document')}`,
        document?.uploadedAt || document?.uploaded_at || document?.createdAt || document?.created_at,
        formatStatusLabel(document?.document_type || document?.category || 'Seller document'),
        FileText,
      )
    })
    add('Mandate generated', listingRecord?.mandate?.generatedAt || listingRecord?.mandate?.createdAt, 'Mandate PDF was generated for seller review.', FileText)
    add('Mandate signed', mandateWorkspace.signedDate, 'All required mandate signatures were completed.', CheckCircle2)
    add('Mandate viewed', listingRecord?.mandate?.viewedAt, 'Signed mandate was viewed from the workspace.', ExternalLink)
    add('Mandate downloaded', listingRecord?.mandate?.downloadedAt, 'Signed mandate was downloaded.', ExternalLink)
    const publishedAt = ['active', 'published', 'live'].includes(String(marketingDraft.listingStatus || listingRecord?.status || '').toLowerCase()) || marketingDraft.bridgeListingStatus === 'published'
      ? marketingDraft.listingDate || listingRecord?.updatedAt
      : ''
    add('Listing published', publishedAt, 'Listing publication status is active.', ExternalLink)
    add('Commission updated', commissionWorkspace.hasData ? listingRecord?.commission?.updated_at || listingRecord?.commission?.updatedAt || listingRecord?.updatedAt : '', 'Commission structure was captured or updated.', HandCoins)
    return items.sort((left, right) => new Date(left.timestamp || 0) - new Date(right.timestamp || 0))
  }, [commissionWorkspace.hasData, listingRecord, mandateWorkspace.signedDate, marketingDraft.bridgeListingStatus, marketingDraft.listingDate, marketingDraft.listingStatus])

  const coverImage = useMemo(() => {
    return marketingDraft.galleryImages.find((image) => String(image?.id) === String(marketingDraft.coverImageId)) || marketingDraft.galleryImages[0] || null
  }, [marketingDraft.coverImageId, marketingDraft.galleryImages])

  const sectionStatuses = useMemo(() => {
    const basicComplete = Boolean(marketingDraft.headline.trim() && marketingDraft.propertyType && marketingDraft.suburb.trim() && marketingDraft.city.trim())
    const specsComplete = Boolean(marketingDraft.bedrooms || marketingDraft.bathrooms || marketingDraft.erfSize || marketingDraft.floorSize)
    const financialComplete = Boolean(marketingDraft.price && (marketingDraft.leviesNotApplicable || marketingDraft.levies) && (marketingDraft.ratesTaxesNotApplicable || marketingDraft.ratesTaxes))
    const featuresComplete = marketingDraft.selectedFeatures.length > 0
    const descriptionComplete = Boolean(marketingDraft.description.trim())
    const floorplansComplete = marketingDraft.floorplans.length > 0
    const galleryComplete = marketingDraft.galleryImages.length > 0 && Boolean(coverImage?.url)
    const portalComplete = Boolean(
      (marketingDraft.property24Status !== 'published' || marketingDraft.property24ListingUrl.trim() || marketingDraft.property24Reference.trim()) &&
      (marketingDraft.privatePropertyStatus !== 'published' || marketingDraft.privatePropertyListingUrl.trim() || marketingDraft.privatePropertyReference.trim()) &&
      (marketingDraft.property24Status !== 'not_published' || marketingDraft.privatePropertyStatus !== 'not_published' || marketingDraft.bridgeListingStatus !== 'not_published'),
    )
    return [
      { key: 'basic', label: 'Basic Information', complete: basicComplete },
      { key: 'specs', label: 'Property Specs', complete: specsComplete },
      { key: 'financial', label: 'Financial Details', complete: financialComplete },
      { key: 'features', label: 'Features & Amenities', complete: featuresComplete },
      { key: 'description', label: 'Description', complete: descriptionComplete },
      { key: 'portal', label: 'Portal Listings', complete: portalComplete },
      { key: 'floorplans', label: 'Floor Plans', complete: floorplansComplete },
      { key: 'gallery', label: 'Image Gallery', complete: galleryComplete },
    ]
  }, [coverImage?.url, marketingDraft])

  const sectionStatusByKey = useMemo(() => {
    return sectionStatuses.reduce((map, item) => ({ ...map, [item.key]: item }), {})
  }, [sectionStatuses])

  const galleryPreviewImages = useMemo(() => {
    return showFullGallery ? marketingDraft.galleryImages : marketingDraft.galleryImages.slice(0, 4)
  }, [marketingDraft.galleryImages, showFullGallery])

  const propertySummaryFacts = useMemo(() => [
    marketingDraft.propertyType || 'Property',
    marketingDraft.bedrooms ? `${marketingDraft.bedrooms} Beds` : '',
    marketingDraft.bathrooms ? `${marketingDraft.bathrooms} Baths` : '',
    marketingDraft.garages ? `${marketingDraft.garages} Garages` : '',
    marketingDraft.floorSize ? `${marketingDraft.floorSize} m² floor` : '',
    marketingDraft.erfSize ? `${marketingDraft.erfSize} m² erf` : '',
  ].filter(Boolean), [marketingDraft])

  const viewingGroups = useMemo(() => ({
    pending: viewings.filter((item) => [VIEWING_STATUS.PENDING_APPROVAL, VIEWING_STATUS.RESCHEDULE_REQUESTED, VIEWING_STATUS.VIEWING_REQUESTED].includes(String(item?.status || '').trim().toLowerCase())),
    confirmed: viewings.filter((item) => String(item?.status || '').trim().toLowerCase() === VIEWING_STATUS.CONFIRMED),
    completed: viewings.filter((item) => [VIEWING_STATUS.COMPLETED, VIEWING_STATUS.NO_SHOW, VIEWING_STATUS.CANCELLED, VIEWING_STATUS.DECLINED].includes(String(item?.status || '').trim().toLowerCase())),
  }), [viewings])

  function updateMarketingDraft(key, value) {
    setMarketingDraft((previous) => ({ ...previous, [key]: value }))
  }

  function updateViewingForm(key, value) {
    setViewingForm((previous) => ({ ...previous, [key]: value }))
  }

  async function submitViewingRequest(event) {
    event.preventDefault()
    if (!listingRecord || !viewingForm.buyerLeadId || !viewingForm.proposedDate || !viewingForm.proposedTime) return
    const lead = listingLeads.find((item) => String(item?.id || '') === String(viewingForm.buyerLeadId))
    const fallbackViewingPayload = {
      listingId: listingRecord.id,
      listingType: 'private_listing',
      listingTitle: listingRecord.listingTitle,
      buyerLeadId: lead?.id || '',
      buyerName: lead?.name || 'Buyer',
      createdBy: 'agent',
      createdByRole: 'agent',
      proposedDate: viewingForm.proposedDate,
      proposedTime: viewingForm.proposedTime,
      alternativeTimes: [viewingForm.alternativeTimeA, viewingForm.alternativeTimeB].filter(Boolean),
      notes: viewingForm.notes.trim(),
      location: [listingRecord.listingTitle, listingRecord.suburb, listingRecord.city].filter(Boolean).join(', '),
      agentName: 'Agent',
      sellerName: listingRecord?.seller?.name || 'Seller',
    }
    let createdInAppointments = false
    if (listingOrganisationId && isSupabaseConfigured) {
      try {
        const participantSeed = []
        const buyerEmail = String(lead?.email || lead?.buyerEmail || '').trim().toLowerCase()
        if (buyerEmail) {
          participantSeed.push({
            name: lead?.name || buyerEmail,
            email: buyerEmail,
            phone: lead?.phone || '',
            participantRole: 'Buyer',
            isRequired: true,
            rsvpStatus: 'Pending',
          })
        }
        const sellerEmail = String(listingRecord?.seller?.email || '').trim().toLowerCase()
        if (sellerEmail) {
          participantSeed.push({
            name: listingRecord?.seller?.name || sellerEmail,
            email: sellerEmail,
            phone: listingRecord?.seller?.phone || '',
            participantRole: 'Seller',
            isRequired: false,
            rsvpStatus: 'Pending',
          })
        }
        const currentAgent = {
          id: String(profile?.id || '').trim(),
          name: String(profile?.fullName || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || profile?.email || 'Agent').trim(),
          email: String(profile?.email || '').trim().toLowerCase(),
        }
        await createAppointmentAsync(
          listingOrganisationId,
          {
            appointmentType: 'viewing',
            title: `Viewing: ${listingRecord.listingTitle || 'Listing'}`,
            date: viewingForm.proposedDate,
            startTime: viewingForm.proposedTime,
            timezone: 'Africa/Johannesburg',
            locationType: 'physical_address',
            location: fallbackViewingPayload.location,
            status: 'requested',
            leadId: lead?.leadId || lead?.id || null,
            contactId: lead?.contactId || null,
            listingId: listingRecord.id,
            relatedEntityType: lead?.leadId || lead?.id ? 'lead' : 'listing',
            relatedEntityId: lead?.leadId || lead?.id || null,
            notes: viewingForm.notes.trim(),
            participants: participantSeed,
            assignedAgent: currentAgent,
            sendInviteEmails: participantSeed.some((participant) => participant.email),
            attachCalendarInvite: true,
          },
          {
            actor: currentAgent,
          },
        )
        createdInAppointments = true
      } catch (error) {
        console.warn('[AgentListingDetail] appointment module viewing create failed', error)
        setDetailError(error?.message || 'Viewing could not be created in the canonical appointment system.')
      }
    }
    if (!createdInAppointments) {
      setDetailError('Viewing scheduling now requires the canonical appointment system. Please try again when the workspace database is available.')
      return
    }
    setViewingForm({
      buyerLeadId: '',
      proposedDate: '',
      proposedTime: '',
      alternativeTimeA: '',
      alternativeTimeB: '',
      notes: '',
    })
    setShowViewingForm(false)
    await refreshListingViewings()
  }

  function saveFeedback(viewingId) {
    const draft = feedbackDrafts[viewingId]
    if (!draft?.interestLevel) return
    saveViewingFeedback(viewingId, draft)
    setFeedbackDrafts((previous) => {
      const next = { ...previous }
      delete next[viewingId]
      return next
    })
  }

  function toggleFeature(feature) {
    setMarketingDraft((previous) => {
      const exists = previous.selectedFeatures.includes(feature)
      return {
        ...previous,
        selectedFeatures: exists
          ? previous.selectedFeatures.filter((item) => item !== feature)
          : [...previous.selectedFeatures, feature],
      }
    })
  }

  async function applyMarketingDraftAndPersist(updater, { message = '', showSaving = false } = {}) {
    const nextDraft = typeof updater === 'function' ? updater(marketingDraft) : updater
    if (!nextDraft) return null
    if (showSaving) setGallerySaving(true)
    setDetailMessage('')
    setDetailError('')
    setMarketingDraft(nextDraft)
    try {
      return await persistListingSnapshot(nextDraft, { message })
    } finally {
      if (showSaving) setGallerySaving(false)
    }
  }

  async function buildUploadedAsset(file, type, index = 0) {
    const fallbackId = generateId(type === 'floorplans' ? 'floorplan' : 'gallery')
    try {
      const asset = await uploadPrivateListingMediaAsset(file, { listingId: listingRecord?.id, type })
      return {
        id: asset.path || fallbackId,
        name: asset.fileName || file.name,
        label: type === 'floorplans' ? `Plan ${marketingDraft.floorplans.length + index + 1}` : '',
        url: asset.url || asset.signedUrl || asset.publicUrl || '',
        signedUrl: asset.signedUrl || '',
        publicUrl: asset.publicUrl || '',
        bucket: asset.bucket || '',
        path: asset.path || '',
        contentType: asset.contentType || file.type || '',
        size: asset.size || file.size || 0,
      }
    } catch (error) {
      console.warn('[AgentListingDetail] storage upload failed; falling back to local data url', error)
      return {
        id: fallbackId,
        name: file.name,
        label: type === 'floorplans' ? `Plan ${marketingDraft.floorplans.length + index + 1}` : '',
        url: await readAsDataUrl(file),
        contentType: file.type || '',
        size: file.size || 0,
        uploadWarning: error?.message || 'Storage upload failed.',
      }
    }
  }

  async function handleGalleryUpload(event) {
    const files = Array.from(event.target.files || [])
    if (!files.length) return
    setGallerySaving(true)
    setDetailMessage('')
    setDetailError('')
    try {
      const uploads = await Promise.all(files.map((file, index) => buildUploadedAsset(file, 'gallery', index)))
      const hadFallback = uploads.some((asset) => asset.uploadWarning)
      const nextDraft = {
        ...marketingDraft,
        galleryImages: [...marketingDraft.galleryImages, ...uploads],
        coverImageId: marketingDraft.coverImageId || uploads[0]?.id || '',
      }
      setMarketingDraft(nextDraft)
      await persistListingSnapshot(nextDraft, {
        message: hadFallback ? 'Images saved locally. Storage upload needs attention.' : 'Images uploaded and saved.',
      })
      if (hadFallback) {
        setDetailError('One or more images could not be uploaded to Supabase Storage, so they were kept as local previews. Try uploading again after checking storage permissions.')
      }
    } finally {
      setGallerySaving(false)
      event.target.value = ''
    }
  }

  async function setCoverImage(imageId) {
    await applyMarketingDraftAndPersist(
      (previous) => ({ ...previous, coverImageId: imageId }),
      { message: 'Cover image saved.', showSaving: true },
    )
  }

  async function moveGalleryImage(imageId, direction) {
    await applyMarketingDraftAndPersist(
      (previous) => {
        const currentIndex = previous.galleryImages.findIndex((image) => String(image.id) === String(imageId))
        if (currentIndex < 0) return previous
        const nextIndex = direction === 'left' ? currentIndex - 1 : currentIndex + 1
        if (nextIndex < 0 || nextIndex >= previous.galleryImages.length) return previous
        const nextGallery = [...previous.galleryImages]
        const [item] = nextGallery.splice(currentIndex, 1)
        nextGallery.splice(nextIndex, 0, item)
        return { ...previous, galleryImages: nextGallery }
      },
      { message: 'Gallery order saved.', showSaving: true },
    )
  }

  async function removeGalleryImage(imageId) {
    await applyMarketingDraftAndPersist(
      (previous) => {
        const nextGallery = previous.galleryImages.filter((image) => String(image.id) !== String(imageId))
        return {
          ...previous,
          galleryImages: nextGallery,
          coverImageId:
            String(previous.coverImageId) === String(imageId)
              ? String(nextGallery[0]?.id || '')
              : previous.coverImageId,
        }
      },
      { message: 'Image removed from gallery.', showSaving: true },
    )
  }

  async function handleFloorplanUpload(event) {
    const files = Array.from(event.target.files || [])
    if (!files.length) return
    setGallerySaving(true)
    setDetailMessage('')
    setDetailError('')
    try {
      const uploads = await Promise.all(files.map((file, index) => buildUploadedAsset(file, 'floorplans', index)))
      const hadFallback = uploads.some((asset) => asset.uploadWarning)
      const nextDraft = { ...marketingDraft, floorplans: [...marketingDraft.floorplans, ...uploads] }
      setMarketingDraft(nextDraft)
      await persistListingSnapshot(nextDraft, {
        message: hadFallback ? 'Floor plans saved locally. Storage upload needs attention.' : 'Floor plans uploaded and saved.',
      })
      if (hadFallback) {
        setDetailError('One or more floor plans could not be uploaded to Supabase Storage, so they were kept as local previews.')
      }
    } finally {
      setGallerySaving(false)
      event.target.value = ''
    }
  }

  function updateFloorplanLabel(id, label) {
    setMarketingDraft((previous) => ({
      ...previous,
      floorplans: previous.floorplans.map((plan) => (String(plan.id) === String(id) ? { ...plan, label } : plan)),
    }))
  }

  function removeFloorplan(id) {
    setMarketingDraft((previous) => ({
      ...previous,
      floorplans: previous.floorplans.filter((plan) => String(plan.id) !== String(id)),
    }))
  }

  async function handleDeleteListing() {
    const listingTitle = String(listingRecord?.listingTitle || 'this listing').trim()
    const confirmed = window.confirm(
      `Permanently delete "${listingTitle}"?\n\nThis removes the listing from Bridge, local fallback storage, seller workflow drafts, onboarding-linked listing records, documents, and activity. This cannot be undone.`,
    )
    if (!confirmed) return

    setDeletingListing(true)
    setDetailError('')
    setDetailMessage('')

    try {
      if (isSupabaseConfigured && isUuidLike(listingId)) {
        const remoteDelete = await deletePrivateListing(listingId, { organisationId: listingOrganisationId })
        if (!remoteDelete?.deleted) {
          throw new Error('Could not delete listing. Please try again.')
        }
      }
      deleteAgentPrivateListingCascade(listingRecord || listingId)
      window.dispatchEvent(new Event('itg:listings-updated'))
      navigate('/listings', {
        replace: true,
        state: { message: `"${listingTitle}" was permanently deleted.` },
      })
    } catch (error) {
      setDetailError(error?.message || 'Unable to delete this listing.')
    } finally {
      setDeletingListing(false)
    }
  }

  if (loading || listingId.startsWith('development-')) {
    return (
      <section className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
        <p className="text-sm text-[#6b7d93]">{listingId.startsWith('development-') ? 'Redirecting to development workspace…' : 'Loading listing…'}</p>
      </section>
    )
  }

  if (!listingRecord) {
    return (
      <section className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
        <p className="text-sm text-[#6b7d93]">{detailError || 'Listing not found.'}</p>
        <div className="mt-4">
          <Button variant="secondary" onClick={() => navigate('/listings')}>
            Back to Listings
          </Button>
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-5">
      {detailError ? (
        <div className="rounded-[14px] border border-[#f3d2cc] bg-[#fef3f2] px-4 py-3 text-sm font-medium text-[#b42318]">{detailError}</div>
      ) : null}
      {detailMessage ? (
        <div className="rounded-[14px] border border-[#d8eddf] bg-[#ecfaf1] px-4 py-3 text-sm font-medium text-[#1f7d44]">{detailMessage}</div>
      ) : null}
      {activeTab !== 'seller' ? (
        <>
          <section className="overflow-hidden rounded-[24px] border border-[#dde4ee] bg-white shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
            <div className="h-[280px] w-full border-b border-[#e5edf6]">
              {getImageBlock(coverImage?.url || '', listingRecord.listingTitle)}
            </div>
            <div className="space-y-4 p-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => navigate('/listings')}
                      className="inline-flex items-center gap-1 rounded-full border border-[#dbe6f2] bg-white px-2.5 py-1 text-[0.74rem] font-semibold text-[#35546c]"
                    >
                      <ArrowLeft size={13} />
                      Back
                    </button>
                    <span className="inline-flex rounded-full border border-[#dbe6f2] bg-[#f7fbff] px-2.5 py-1 text-[0.72rem] font-semibold text-[#35546c]">
                      Private Listing
                    </span>
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${statusClass(normalizeListingStatus(listingRecord))}`}>
                      {formatStatusLabel(normalizeListingStatus(listingRecord))}
                    </span>
                    <span className="inline-flex rounded-full border border-[#dbe6f2] bg-white px-2.5 py-1 text-[0.72rem] font-semibold text-[#35546c]">
                      {formatStatusLabel(marketingDraft.listingStatus)}
                    </span>
                  </div>
                  <h2 className="mt-3 text-[1.4rem] font-semibold tracking-[-0.03em] text-[#142132]">{listingRecord.listingTitle}</h2>
                  <p className="mt-1 text-sm text-[#607387]">{[listingRecord.suburb, listingRecord.city].filter(Boolean).join(', ') || 'Location pending'}</p>
                  <p className="mt-3 text-[1.45rem] font-semibold text-[#1f4f78]">{formatCurrency(listingRecord.askingPrice)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="secondary" onClick={handleDeleteListing} disabled={deletingListing}>
                    {deletingListing ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                    Delete Listing
                  </Button>
                  <Button variant="secondary" onClick={() => setActiveTab('property_details')}>
                    Edit Listing
                  </Button>
                  <Button
                    onClick={() => {
                      setActiveTab('offers')
                      setShowSendOfferLinkForm(true)
                    }}
                  >
                    <Link2 size={15} />
                    Send Offer Link
                  </Button>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Listing Workspace</p>
                <p className="mt-1 text-sm text-[#607387]">Manage this property across seller onboarding, buyer interest, offers, and deal preparation.</p>
              </div>
              <span className="inline-flex items-center self-start rounded-full border border-[#dbe6f2] bg-[#f7fbff] px-4 py-2 text-[0.92rem] font-semibold text-[#5f748a]">
                {DETAIL_TABS.length} sections
              </span>
            </div>

            <div className="mt-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              {DETAIL_TABS.map((tab) => {
                const active = tab.key === activeTab
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`min-h-[56px] rounded-[16px] border px-2.5 py-2.5 text-center transition xl:px-2 ${
                      active
                        ? 'border-[#1f4f78] bg-[#2b5577] text-white shadow-[0_18px_32px_rgba(31,79,120,0.24)]'
                        : 'border-[#dbe6f2] bg-white text-[#47627c] hover:border-[#b7c8db] hover:shadow-[0_10px_20px_rgba(15,23,42,0.06)]'
                    }`}
                  >
                    <span className={`block text-[0.78rem] font-semibold leading-tight tracking-[-0.01em] xl:text-[0.74rem] ${active ? 'text-white' : 'text-[#47627c]'}`}>
                      {tab.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        </>
      ) : null}

      {activeTab === 'overview' ? (
        <section className="space-y-5">
          <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <p className="text-[1.08rem] font-semibold text-[#142132]">{listingRecord.listingTitle}</p>
                <p className="mt-1 text-sm text-[#607387]">{[listingRecord.listingTitle, listingRecord.suburb, listingRecord.city].filter(Boolean).join(', ')}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-full border border-[#dbe6f2] bg-[#f7fbff] px-3 py-1 text-[0.74rem] font-semibold text-[#35546c]">
                  {listingRecord.propertyType || 'House'}
                </span>
                <span className={`inline-flex rounded-full border px-3 py-1 text-[0.74rem] font-semibold ${statusClass(normalizeListingStatus(listingRecord))}`}>
                  {formatStatusLabel(normalizeListingStatus(listingRecord))}
                </span>
                <span className="inline-flex rounded-full border border-[#dbe6f2] bg-white px-3 py-1 text-[0.74rem] font-semibold text-[#35546c]">
                  {marketingDraft.source || 'Direct / manual'}
                </span>
                <Button size="sm" onClick={() => { setActiveTab('pipeline'); setShowViewingForm(true) }}>
                  Request / Schedule Viewing
                </Button>
              </div>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {[
              { label: 'Leads', value: metrics.leadCount, meta: 'Interested buyers' },
              { label: 'Viewings', value: metrics.viewingCount, meta: 'Scheduled / completed' },
              { label: 'Days on Market', value: metrics.daysOnMarket, meta: `Live since ${formatDate(listingRecord.createdAt)}` },
              { label: 'Offers', value: offerRows.length, meta: `${metrics.pendingOffers} active / pending` },
              { label: 'Highest Offer', value: metrics.highestOffer ? formatCurrency(metrics.highestOffer) : '—', meta: 'Top current offer' },
            ].map((card) => (
              <article key={card.label} className="flex h-full min-h-[132px] flex-col justify-between rounded-[20px] border border-[#dde4ee] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">{card.label}</p>
                <p className="text-[1.45rem] font-semibold text-[#142132]">{card.value}</p>
                <p className="text-sm text-[#607387]">{card.meta}</p>
              </article>
            ))}
          </section>

          <section className="grid gap-5 xl:grid-cols-3">
            <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[1rem] font-semibold text-[#142132]">Lead Source Breakdown</h3>
                  <p className="mt-1 text-sm text-[#607387]">Where current buyer interest is originating.</p>
                </div>
                <div className="relative h-[104px] w-[104px] shrink-0 rounded-full" style={buildDonutStyle(sourceBreakdown)}>
                  <div className="absolute inset-[18px] grid place-items-center rounded-full bg-white text-center">
                    <span className="text-lg font-semibold text-[#142132]">{metrics.leadCount}</span>
                    <span className="text-[0.68rem] uppercase tracking-[0.08em] text-[#7b8ca2]">leads</span>
                  </div>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                {sourceBreakdown.map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-3 rounded-[14px] border border-[#dce6f2] bg-[#fbfdff] px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-sm font-medium text-[#22374d]">{item.label}</span>
                    </div>
                    <span className="text-sm font-semibold text-[#48627f]">{item.share}%</span>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <h3 className="text-[1rem] font-semibold text-[#142132]">Buyer Engagement</h3>
              <p className="mt-1 text-sm text-[#607387]">How interest is converting into real buyer movement.</p>
              <div className="mt-5 space-y-3">
                {[
                  { label: 'Leads', value: metrics.leadCount, fill: 100 },
                  { label: 'Viewings', value: metrics.viewingCount, fill: metrics.leadCount ? Math.max(12, (metrics.viewingCount / metrics.leadCount) * 100) : 0 },
                  { label: 'Offers', value: offerRows.length, fill: metrics.leadCount ? Math.max(12, (offerRows.length / metrics.leadCount) * 100) : 0 },
                ].map((step) => (
                  <div key={step.label} className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-[#22374d]">{step.label}</span>
                      <span className="text-sm font-semibold text-[#142132]">{step.value}</span>
                    </div>
                    <div className="mt-3 h-3 overflow-hidden rounded-full bg-[#dbe6f2]">
                      <div className="h-full rounded-full bg-[#1f4f78]" style={{ width: `${Math.min(100, Math.max(0, step.fill))}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <h3 className="text-[1rem] font-semibold text-[#142132]">Pricing Insight</h3>
              <p className="mt-1 text-sm text-[#607387]">Asking price versus current average buyer position.</p>
              <div className="mt-5 space-y-4">
                <div className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-[#22374d]">Asking Price</span>
                    <span className="text-sm font-semibold text-[#142132]">{formatCurrency(listingRecord.askingPrice)}</span>
                  </div>
                  <div className="mt-3 h-3 overflow-hidden rounded-full bg-[#dbe6f2]">
                    <div className="h-full rounded-full bg-[#1f4f78]" style={{ width: `${pricingInsight.askingFill}%` }} />
                  </div>
                </div>
                <div className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-[#22374d]">Average Offer</span>
                    <span className="text-sm font-semibold text-[#142132]">{metrics.offerAverage ? formatCurrency(metrics.offerAverage) : '—'}</span>
                  </div>
                  <div className="mt-3 h-3 overflow-hidden rounded-full bg-[#dbe6f2]">
                    <div className="h-full rounded-full bg-[#2f8f6b]" style={{ width: `${pricingInsight.offerFill}%` }} />
                  </div>
                </div>
                <div className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                  <p className="text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Variance</p>
                  <p className="mt-2 text-[1.2rem] font-semibold text-[#142132]">
                    {pricingInsight.varianceValue ? `${pricingInsight.varianceValue > 0 ? '+' : ''}${formatCurrency(pricingInsight.varianceValue)}` : '—'}
                  </p>
                  <p className="mt-1 text-sm text-[#607387]">{pricingInsight.varianceLabel}</p>
                </div>
              </div>
            </article>
          </section>

          <section className="grid items-stretch gap-5 xl:grid-cols-2">
            <section className="flex h-full flex-col rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Next Best Action</p>
                  <h3 className="mt-2 text-[1.02rem] font-semibold text-[#142132]">{nextBestAction.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#607387]">{nextBestAction.copy}</p>
                </div>
                <div className="rounded-[16px] border border-[#dce6f2] bg-[#f7fbff] p-3 text-[#1f4f78]">
                  <TrendingUp size={20} />
                </div>
              </div>
              <div className="mt-auto pt-5">
                <Button onClick={() => setActiveTab(metrics.pendingOffers > 0 ? 'offers' : missingDocuments > 0 ? 'documents' : 'pipeline')}>
                  {metrics.pendingOffers > 0 ? 'Review Offers' : missingDocuments > 0 ? 'Open Documents' : 'Open Pipeline'}
                </Button>
              </div>
            </section>

            <section className="flex h-full flex-col rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-[1rem] font-semibold text-[#142132]">Activity Feed</h3>
                  <p className="mt-1 text-sm text-[#607387]">Latest offers, uploads, and listing changes.</p>
                </div>
                <span className="rounded-full border border-[#dbe6f2] bg-[#f7fbff] px-3 py-1 text-[0.72rem] font-semibold text-[#35546c]">
                  {activityItems.length} updates
                </span>
              </div>
              <div className="mt-4 flex-1 space-y-3">
                {activityItems.map((item, index) => (
                  <article key={`${item.title}-${index}`} className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#22374d]">{item.title}</p>
                        <p className="mt-1 text-sm text-[#607387]">{item.copy}</p>
                      </div>
                      <span className="text-[0.74rem] text-[#7b8ca2]">{formatDateTime(item.timestamp)}</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </section>
        </section>
      ) : null}

      {activeTab === 'property_details' ? (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="min-w-0 space-y-5">
            <section className="overflow-hidden rounded-[24px] border border-[#dde4ee] bg-white shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <div className="grid gap-0 lg:grid-cols-[320px_minmax(0,1fr)]">
                <div className="relative h-[260px] border-b border-[#e5edf6] bg-[#eef4fa] lg:h-full lg:border-b-0 lg:border-r">
                  {getImageBlock(coverImage?.url || '', marketingDraft.headline || listingRecord.listingTitle)}
                  <span className="absolute bottom-4 left-4 inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/95 px-3 py-1.5 text-xs font-semibold text-[#142132] shadow-sm">
                    <Camera size={14} />
                    {marketingDraft.galleryImages.length || 0} image{marketingDraft.galleryImages.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="min-w-0 p-5 lg:p-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${statusClass(marketingDraft.listingStatus)}`}>
                          {formatStatusLabel(marketingDraft.listingStatus)}
                        </span>
                        <span className="inline-flex rounded-full border border-[#dbe6f2] bg-[#f7fbff] px-2.5 py-1 text-[0.72rem] font-semibold text-[#35546c]">
                          {marketingDraft.source || 'Seller Onboarding'}
                        </span>
                      </div>
                      <h3 className="mt-3 truncate text-[1.35rem] font-semibold tracking-[-0.03em] text-[#142132]">{marketingDraft.headline || listingRecord.listingTitle || 'Listing headline pending'}</h3>
                      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-[#607387]">
                        <MapPin size={14} />
                        {[marketingDraft.suburb, marketingDraft.city, marketingDraft.province].filter(Boolean).join(', ') || 'Location pending'}
                      </p>
                    </div>
                    <Button size="sm" onClick={saveMarketingDraft}>Save Property Details</Button>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {propertySummaryFacts.map((fact) => (
                      <span key={fact} className="inline-flex rounded-full border border-[#dbe6f2] bg-[#fbfdff] px-3 py-1.5 text-xs font-semibold text-[#35546c]">
                        {fact}
                      </span>
                    ))}
                  </div>

                  <div className="mt-5 grid gap-4 border-t border-[#e7edf5] pt-5 sm:grid-cols-2 xl:grid-cols-4">
                    <SnapshotRow label="Listing ID" value={marketingDraft.listingCode || listingRecord.listingReference || 'Pending'} />
                    <SnapshotRow label="Assigned Agent" value={listingRecord?.assignedAgentName || listingRecord?.assignedAgent || 'Agent pending'} />
                    <SnapshotRow label="Last Updated" value={formatDate(listingRecord?.updatedAt || listingRecord?.createdAt)} />
                    <SnapshotRow label="Source" value={marketingDraft.source || 'Seller Onboarding'} />
                  </div>
                </div>
              </div>
            </section>

            <HubCard icon={Home} title="Basic Information" copy="Core public listing fields pulled from seller onboarding and refined for publishing." complete={sectionStatusByKey.basic?.complete}>
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <label className="grid gap-2 xl:col-span-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Headline</span>
                  <Field value={marketingDraft.headline} onChange={(event) => updateMarketingDraft('headline', event.target.value)} placeholder="House, Olympus" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Property Type</span>
                  <Field as="select" value={marketingDraft.propertyType} onChange={(event) => updateMarketingDraft('propertyType', event.target.value)}>
                    {PROPERTY_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </Field>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Listing Status</span>
                  <Field as="select" value={marketingDraft.listingStatus} onChange={(event) => updateMarketingDraft('listingStatus', event.target.value)}>
                    {LISTING_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{formatStatusLabel(option)}</option>)}
                  </Field>
                </label>
                <label className="grid gap-2 xl:col-span-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Address</span>
                  <Field value={marketingDraft.addressLine1} onChange={(event) => updateMarketingDraft('addressLine1', event.target.value)} placeholder="Property address" />
                </label>
                {[
                  ['suburb', 'Suburb'],
                  ['city', 'City'],
                  ['province', 'Province'],
                  ['source', 'Listing Source'],
                  ['mandateSignedDate', 'Mandate Signed Date', 'date'],
                ].map(([key, label, type]) => (
                  <label key={key} className="grid gap-2">
                    <span className="text-sm font-semibold text-[#2d445e]">{label}</span>
                    <Field type={type || 'text'} value={type === 'date' ? formatDateInputValue(marketingDraft[key]) : marketingDraft[key]} onChange={(event) => updateMarketingDraft(key, event.target.value)} />
                  </label>
                ))}
              </div>
            </HubCard>

            <HubCard icon={Building2} title="Property Specs" copy="The key measurable details buyers and downstream portals compare first." complete={sectionStatusByKey.specs?.complete}>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ['bedrooms', 'Bedrooms'],
                  ['bathrooms', 'Bathrooms'],
                  ['garages', 'Garages'],
                  ['coveredParking', 'Covered Parking'],
                  ['openParking', 'Open Parking'],
                  ['erfSize', 'Erf Size (m²)'],
                  ['floorSize', 'Floor Size (m²)'],
                ].map(([key, label]) => (
                  <label key={key} className="grid gap-2">
                    <span className="text-sm font-semibold text-[#2d445e]">{label}</span>
                    <Field type="number" min="0" value={marketingDraft[key]} onChange={(event) => updateMarketingDraft(key, event.target.value)} placeholder="0" />
                  </label>
                ))}
              </div>
            </HubCard>

            <HubCard icon={HandCoins} title="Price & Financial Details" copy="Structured pricing, recurring costs and offer positioning for portals and reporting." complete={sectionStatusByKey.financial?.complete}>
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Asking Price</span>
                  <Field type="number" min="0" step="1000" value={marketingDraft.price} onChange={(event) => updateMarketingDraft('price', event.target.value)} placeholder="0" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Levies</span>
                  <Field type="number" min="0" step="100" value={marketingDraft.levies} onChange={(event) => updateMarketingDraft('levies', event.target.value)} placeholder="0" disabled={marketingDraft.leviesNotApplicable} />
                  <span className="inline-flex items-center gap-2 text-xs text-[#607387]">
                    <input type="checkbox" checked={marketingDraft.leviesNotApplicable} onChange={(event) => updateMarketingDraft('leviesNotApplicable', event.target.checked)} />
                    Not applicable
                  </span>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Rates & Taxes</span>
                  <Field type="number" min="0" step="100" value={marketingDraft.ratesTaxes} onChange={(event) => updateMarketingDraft('ratesTaxes', event.target.value)} placeholder="0" disabled={marketingDraft.ratesTaxesNotApplicable} />
                  <span className="inline-flex items-center gap-2 text-xs text-[#607387]">
                    <input type="checkbox" checked={marketingDraft.ratesTaxesNotApplicable} onChange={(event) => updateMarketingDraft('ratesTaxesNotApplicable', event.target.checked)} />
                    Not applicable
                  </span>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Sale Type</span>
                  <Field as="select" value={marketingDraft.saleType} onChange={(event) => updateMarketingDraft('saleType', event.target.value)}>
                    <option value="For Sale">For Sale</option>
                    <option value="Auction">Auction</option>
                    <option value="Tender">Tender</option>
                    <option value="POA">Price on Application</option>
                  </Field>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">VAT Applicable</span>
                  <Field as="select" value={marketingDraft.vatApplicable} onChange={(event) => updateMarketingDraft('vatApplicable', event.target.value)}>
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                    <option value="unknown">Unknown</option>
                  </Field>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Offers From</span>
                  <Field type="number" min="0" step="1000" value={marketingDraft.offersFrom} onChange={(event) => updateMarketingDraft('offersFrom', event.target.value)} placeholder="0" />
                </label>
              </div>
            </HubCard>

            <HubCard icon={CheckCircle2} title="Features & Amenities" copy="Public-facing feature chips for Bridge Listings and external portal copy." complete={sectionStatusByKey.features?.complete}>
              <div className="mt-5 flex flex-wrap gap-2">
                {FEATURE_OPTIONS.map((feature) => {
                  const active = marketingDraft.selectedFeatures.includes(feature)
                  return (
                    <button
                      key={feature}
                      type="button"
                      onClick={() => toggleFeature(feature)}
                      className={`rounded-full border px-3.5 py-2 text-sm font-semibold transition ${
                        active
                          ? 'border-[#1f4f78] bg-[#1f4f78] text-white shadow-[0_10px_18px_rgba(31,79,120,0.14)]'
                          : 'border-[#dbe6f2] bg-white text-[#47627c] hover:border-[#b7c8db] hover:bg-[#f7fbff]'
                      }`}
                    >
                      {feature}
                    </button>
                  )
                })}
              </div>
            </HubCard>

            <HubCard icon={FileText} title="Property Description" copy="Separate public listing copy from internal-only notes so publishing stays safe." complete={sectionStatusByKey.description?.complete}>
              <div className="mt-5 grid gap-4">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Full Description</span>
                  <Field as="textarea" rows={6} value={marketingDraft.description} onChange={(event) => updateMarketingDraft('description', event.target.value)} placeholder="Public-facing listing description." />
                  <span className="text-xs text-[#607387]">Public-facing field. This can feed Bridge Listings and portal exports later.</span>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Short Description / Listing Preview Copy</span>
                  <Field as="textarea" rows={3} value={marketingDraft.listingPreviewDescription} onChange={(event) => updateMarketingDraft('listingPreviewDescription', event.target.value)} placeholder="Short preview copy for listing cards and snippets." />
                </label>
                <label className="grid gap-2 rounded-[16px] border border-[#f1d8bd] bg-[#fffaf4] p-3">
                  <span className="text-sm font-semibold text-[#7a4b16]">Internal Notes</span>
                  <Field as="textarea" rows={3} value={marketingDraft.notes} onChange={(event) => updateMarketingDraft('notes', event.target.value)} placeholder="Private agent notes, campaign angle, seller context." />
                  <span className="text-xs font-semibold text-[#9a5b13]">Internal-only. Do not publish this field to public listing sites.</span>
                </label>
              </div>
            </HubCard>

            <HubCard icon={FolderKanban} title="Floor Plans" copy="Optional plan files for the listing pack and future buyer-facing downloads." complete={sectionStatusByKey.floorplans?.complete}>
              <div className="mt-5 rounded-[16px] border border-dashed border-[#c9d8e8] bg-[#fbfdff] p-3">
                <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-[#dbe6f2] bg-white px-3 text-xs font-semibold text-[#35546c] hover:border-[#b7c8db] hover:bg-[#f7fbff]">
                  <Upload size={16} />
                  Upload Floor Plans
                  <input type="file" accept=".pdf,image/*" multiple className="hidden" onChange={handleFloorplanUpload} disabled={gallerySaving} />
                </label>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {marketingDraft.floorplans.length ? (
                  marketingDraft.floorplans.map((plan) => (
                    <div key={plan.id} className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[#22374d]">{plan.name}</p>
                          <a href={plan.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#1f4f78]">
                            <ExternalLink size={12} />
                            Open file
                          </a>
                        </div>
                        <button type="button" onClick={() => removeFloorplan(plan.id)} className="rounded-full border border-[#dbe6f2] p-1 text-[#6b7d93] hover:text-[#22374d]">
                          <X size={14} />
                        </button>
                      </div>
                      <label className="mt-3 grid gap-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Plan Label</span>
                        <Field value={plan.label || ''} onChange={(event) => updateFloorplanLabel(plan.id, event.target.value)} placeholder="Ground Floor" />
                      </label>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[16px] border border-dashed border-[#d3deea] bg-[#fbfcfe] p-4 text-sm text-[#6b7d93]">
                    No floor plans uploaded yet.
                  </div>
                )}
              </div>
            </HubCard>
          </div>

          <aside className="min-w-0 space-y-5 xl:sticky xl:top-4 xl:self-start">
            <HubCard icon={ExternalLink} title="Portal Listings" copy="Track external portal references without turning this into a bulky admin form." complete={sectionStatusByKey.portal?.complete}>
              <div className="mt-5 space-y-4">
                {[
                  {
                    name: 'Property24',
                    prefix: 'property24',
                    urlKey: 'property24ListingUrl',
                    referenceKey: 'property24Reference',
                    statusKey: 'property24Status',
                    accent: 'text-[#d12c2c]',
                  },
                  {
                    name: 'Private Property',
                    prefix: 'privateProperty',
                    urlKey: 'privatePropertyListingUrl',
                    referenceKey: 'privatePropertyReference',
                    statusKey: 'privatePropertyStatus',
                    accent: 'text-[#2f8f6b]',
                  },
                ].map((portal) => (
                  <div key={portal.name} className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className={`text-sm font-semibold ${portal.accent}`}>{portal.name}</p>
                      <Field as="select" value={marketingDraft[portal.statusKey]} onChange={(event) => updateMarketingDraft(portal.statusKey, event.target.value)} className="max-w-[150px]">
                        {PORTAL_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{formatStatusLabel(option)}</option>)}
                      </Field>
                    </div>
                    <div className="mt-3 grid gap-3">
                      <Field value={marketingDraft[portal.referenceKey]} onChange={(event) => updateMarketingDraft(portal.referenceKey, event.target.value)} placeholder={`${portal.name} reference`} />
                      <Field value={marketingDraft[portal.urlKey]} onChange={(event) => updateMarketingDraft(portal.urlKey, event.target.value)} placeholder={`${portal.name} listing link`} />
                      {marketingDraft[portal.urlKey] ? (
                        <a href={marketingDraft[portal.urlKey]} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-[#1f4f78]">
                          Open listing
                          <ExternalLink size={12} />
                        </a>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </HubCard>

            <HubCard icon={Info} title="Listing Snapshot">
              <div className="mt-4">
                <SnapshotRow label="Asking Price" value={formatCurrency(marketingDraft.price)} />
                <SnapshotRow label="Property Type" value={marketingDraft.propertyType || '—'} />
                <SnapshotRow label="Erf Size" value={marketingDraft.erfSize ? `${marketingDraft.erfSize} m²` : '—'} />
                <SnapshotRow label="Floor Size" value={marketingDraft.floorSize ? `${marketingDraft.floorSize} m²` : '—'} />
                <SnapshotRow label="Bedrooms" value={marketingDraft.bedrooms || '—'} />
                <SnapshotRow label="Bathrooms" value={marketingDraft.bathrooms || '—'} />
                <SnapshotRow label="Garages" value={marketingDraft.garages || '—'} />
                <SnapshotRow label="Rates & Taxes" value={marketingDraft.ratesTaxesNotApplicable ? 'N/A' : formatMoneyValue(marketingDraft.ratesTaxes)} />
                <SnapshotRow label="Levy" value={marketingDraft.leviesNotApplicable ? 'N/A' : formatMoneyValue(marketingDraft.levies)} />
              </div>
            </HubCard>

            <HubCard icon={ImagePlus} title="Image Gallery" copy={`${marketingDraft.galleryImages.length || 0} images saved. ${coverImage?.url ? 'Cover image selected.' : 'Cover image pending.'}`} complete={sectionStatusByKey.gallery?.complete}>
              <div className="mt-4 overflow-hidden rounded-[18px] border border-[#dce6f2]">
                <div className="h-[150px] border-b border-[#e5edf6] bg-[#eef4fa]">{getImageBlock(coverImage?.url || '', marketingDraft.headline || listingRecord.listingTitle)}</div>
                <div className="p-3">
                  <div className="grid grid-cols-4 gap-2">
                    {galleryPreviewImages.length ? galleryPreviewImages.map((image) => (
                      <button key={image.id} type="button" onClick={() => setCoverImage(image.id)} className={`relative h-14 overflow-hidden rounded-[10px] border ${String(image.id) === String(marketingDraft.coverImageId) ? 'border-[#1f4f78]' : 'border-[#dce6f2]'}`}>
                        <img src={image.url} alt={image.name} className="h-full w-full object-cover" />
                      </button>
                    )) : (
                      <div className="col-span-4 rounded-[12px] border border-dashed border-[#d3deea] bg-[#fbfcfe] p-3 text-xs text-[#6b7d93]">No images uploaded yet.</div>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <label className={`inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 text-xs font-semibold transition ${gallerySaving ? 'border-[#dbe6f2] bg-[#f5f8fb] text-[#9aa9ba]' : 'border-[#1f4f78] bg-[#1f4f78] text-white hover:bg-[#183f61]'}`}>
                      {gallerySaving ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                      Upload Images
                      <input type="file" accept="image/*" multiple className="hidden" onChange={handleGalleryUpload} disabled={gallerySaving} />
                    </label>
                    {marketingDraft.galleryImages.length > 4 ? (
                      <button type="button" onClick={() => setShowFullGallery((value) => !value)} className="inline-flex h-9 items-center justify-center rounded-lg border border-[#dbe6f2] bg-white px-3 text-xs font-semibold text-[#35546c] hover:bg-[#f7fbff]">
                        {showFullGallery ? 'Show Less' : 'View All Images'}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </HubCard>

            <HubCard icon={CalendarDays} title="Important Dates">
              <div className="mt-4 grid gap-3">
                {[
                  ['mandateSignedDate', 'Mandate Signed Date'],
                  ['listingDate', 'Listing Date'],
                  ['expiryDate', 'Expiry Date'],
                ].map(([key, label]) => (
                  <label key={key} className="grid gap-2">
                    <span className="text-sm font-semibold text-[#2d445e]">{label}</span>
                    <Field type="date" value={formatDateInputValue(marketingDraft[key])} onChange={(event) => updateMarketingDraft(key, event.target.value)} />
                  </label>
                ))}
                <SnapshotRow label="Last Updated" value={formatDate(listingRecord?.updatedAt || listingRecord?.createdAt)} />
              </div>
            </HubCard>

            <HubCard icon={Plus} title="Quick Actions">
              <div className="mt-4 grid gap-2">
                {[
                  ['Preview Listing', marketingDraft.bridgeListingPublicUrl],
                  ['Share with Client', ''],
                  ['Duplicate Listing', ''],
                  ['Open Property24 Link', marketingDraft.property24ListingUrl],
                  ['Open Private Property Link', marketingDraft.privatePropertyListingUrl],
                  ['Publish to Bridge Listings', ''],
                  ['View Public Listing', marketingDraft.bridgeListingPublicUrl],
                ].map(([label, href]) => (
                  href ? (
                    <a key={label} href={href} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-between rounded-lg border border-[#dbe6f2] bg-white px-3 text-sm font-semibold text-[#22374d] hover:bg-[#f7fbff]">
                      {label}
                      <ExternalLink size={14} />
                    </a>
                  ) : (
                    <button key={label} type="button" disabled className="inline-flex h-10 items-center justify-between rounded-lg border border-[#e1e8f0] bg-[#f8fafc] px-3 text-sm font-semibold text-[#9aa9ba]" title="Coming soon">
                      {label}
                      <span className="text-[0.68rem] uppercase tracking-[0.08em]">Soon</span>
                    </button>
                  )
                ))}
              </div>
            </HubCard>
          </aside>
        </section>
      ) : null}

      {activeTab === 'property_details_legacy' ? (
        <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-5">
            <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h3 className="text-[1.08rem] font-semibold text-[#142132]">Property Details</h3>
                  <p className="mt-1 text-sm text-[#607387]">Structured listing data for stronger presentation, cleaner reporting, and better downstream conversion.</p>
                </div>
                <Button size="sm" onClick={saveMarketingDraft}>Save Property Details</Button>
              </div>
              <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                <div className="rounded-[18px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Listing ID</p>
                  <p className="mt-2 text-[1.02rem] font-semibold text-[#142132]">{marketingDraft.listingCode || 'Pending'}</p>
                  <p className="mt-1 text-sm text-[#607387]">System-generated and read-only for matching, reporting, and future portal integrations.</p>
                </div>
                <div className="rounded-[18px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Section Completion</p>
                  <div className="mt-3 space-y-2">
                    {sectionStatuses.map((section) => (
                      <div key={section.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-[12px] border border-[#dce6f2] bg-white px-3 py-2.5">
                        <span className="text-sm font-medium leading-5 text-[#22374d]">{section.label}</span>
                        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[0.72rem] font-semibold ${section.complete ? 'border-[#d8eddf] bg-[#ecfaf1] text-[#1f7d44]' : 'border-[#f5dbb0] bg-[#fff8ec] text-[#9a5b13]'}`}>
                          {section.complete ? <CheckCircle2 size={12} /> : <CircleAlert size={12} />}
                          {section.complete ? 'Complete' : 'Missing'}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-[#6f8197]">Each section updates as soon as required fields are completed and saved.</p>
                </div>
              </div>
            </section>

            <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-[1rem] font-semibold text-[#142132]">Basic Information</h4>
                  <p className="mt-1 text-sm text-[#607387]">Anchor the listing with clean headline, location, type, and live status.</p>
                </div>
                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${sectionStatuses.find((item) => item.key === 'basic')?.complete ? 'border-[#d8eddf] bg-[#ecfaf1] text-[#1f7d44]' : 'border-[#f5dbb0] bg-[#fff8ec] text-[#9a5b13]'}`}>
                  {sectionStatuses.find((item) => item.key === 'basic')?.complete ? 'Complete' : 'Missing info'}
                </span>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 md:col-span-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Headline</span>
                  <Field value={marketingDraft.headline} onChange={(event) => updateMarketingDraft('headline', event.target.value)} placeholder="4 Bedroom Apartment - Midrand" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Property Type</span>
                  <Field as="select" value={marketingDraft.propertyType} onChange={(event) => updateMarketingDraft('propertyType', event.target.value)}>
                    {PROPERTY_TYPE_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </Field>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Listing Status</span>
                  <Field as="select" value={marketingDraft.listingStatus} onChange={(event) => updateMarketingDraft('listingStatus', event.target.value)}>
                    {LISTING_STATUS_OPTIONS.map((option) => (
                      <option key={option} value={option}>{formatStatusLabel(option)}</option>
                    ))}
                  </Field>
                </label>
                <label className="grid gap-2 md:col-span-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Address</span>
                  <Field value={marketingDraft.addressLine1} onChange={(event) => updateMarketingDraft('addressLine1', event.target.value)} placeholder="12 Riverside Drive" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Suburb</span>
                  <Field value={marketingDraft.suburb} onChange={(event) => updateMarketingDraft('suburb', event.target.value)} placeholder="Sandton" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">City</span>
                  <Field value={marketingDraft.city} onChange={(event) => updateMarketingDraft('city', event.target.value)} placeholder="Johannesburg" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Province</span>
                  <Field value={marketingDraft.province} onChange={(event) => updateMarketingDraft('province', event.target.value)} placeholder="Gauteng" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Listing Source</span>
                  <Field value={marketingDraft.source} onChange={(event) => updateMarketingDraft('source', event.target.value)} placeholder="Property24 / Bridge Listings / Referral" />
                </label>
              </div>
            </section>

            <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-[1rem] font-semibold text-[#142132]">Property Specs</h4>
                  <p className="mt-1 text-sm text-[#607387]">Capture the core data points buyers compare first.</p>
                </div>
                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${sectionStatuses.find((item) => item.key === 'specs')?.complete ? 'border-[#d8eddf] bg-[#ecfaf1] text-[#1f7d44]' : 'border-[#f5dbb0] bg-[#fff8ec] text-[#9a5b13]'}`}>
                  {sectionStatuses.find((item) => item.key === 'specs')?.complete ? 'Complete' : 'Missing info'}
                </span>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                {[
                  ['bedrooms', 'Bedrooms'],
                  ['bathrooms', 'Bathrooms'],
                  ['garages', 'Garages'],
                  ['coveredParking', 'Covered Parking'],
                  ['openParking', 'Open Parking'],
                  ['erfSize', 'Erf Size (m²)'],
                  ['floorSize', 'Floor Size (m²)'],
                ].map(([key, label]) => (
                  <label key={key} className="grid gap-2">
                    <span className="text-sm font-semibold text-[#2d445e]">{label}</span>
                    <Field type="number" min="0" value={marketingDraft[key]} onChange={(event) => updateMarketingDraft(key, event.target.value)} placeholder="0" />
                  </label>
                ))}
              </div>
            </section>

            <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-[1rem] font-semibold text-[#142132]">Financial Details</h4>
                  <p className="mt-1 text-sm text-[#607387]">Price the property cleanly and keep recurring cost inputs structured for buyers.</p>
                </div>
                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${sectionStatuses.find((item) => item.key === 'financial')?.complete ? 'border-[#d8eddf] bg-[#ecfaf1] text-[#1f7d44]' : 'border-[#f5dbb0] bg-[#fff8ec] text-[#9a5b13]'}`}>
                  {sectionStatuses.find((item) => item.key === 'financial')?.complete ? 'Complete' : 'Missing info'}
                </span>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Price</span>
                  <Field type="number" min="0" step="1000" value={marketingDraft.price} onChange={(event) => updateMarketingDraft('price', event.target.value)} placeholder="2450000" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Levies</span>
                  <Field type="number" min="0" step="100" value={marketingDraft.levies} onChange={(event) => updateMarketingDraft('levies', event.target.value)} placeholder="0" disabled={marketingDraft.leviesNotApplicable} />
                  <span className="inline-flex items-center gap-2 text-xs text-[#607387]">
                    <input type="checkbox" checked={marketingDraft.leviesNotApplicable} onChange={(event) => updateMarketingDraft('leviesNotApplicable', event.target.checked)} />
                    Not applicable
                  </span>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Rates & Taxes</span>
                  <Field type="number" min="0" step="100" value={marketingDraft.ratesTaxes} onChange={(event) => updateMarketingDraft('ratesTaxes', event.target.value)} placeholder="0" disabled={marketingDraft.ratesTaxesNotApplicable} />
                  <span className="inline-flex items-center gap-2 text-xs text-[#607387]">
                    <input type="checkbox" checked={marketingDraft.ratesTaxesNotApplicable} onChange={(event) => updateMarketingDraft('ratesTaxesNotApplicable', event.target.checked)} />
                    Not applicable
                  </span>
                </label>
              </div>
            </section>

            <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-[1rem] font-semibold text-[#142132]">Features & Amenities</h4>
                  <p className="mt-1 text-sm text-[#607387]">Use quick tags to keep feature capture fast and listing presentation consistent.</p>
                </div>
                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${sectionStatuses.find((item) => item.key === 'features')?.complete ? 'border-[#d8eddf] bg-[#ecfaf1] text-[#1f7d44]' : 'border-[#f5dbb0] bg-[#fff8ec] text-[#9a5b13]'}`}>
                  {sectionStatuses.find((item) => item.key === 'features')?.complete ? 'Complete' : 'Missing info'}
                </span>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                {FEATURE_OPTIONS.map((feature) => {
                  const active = marketingDraft.selectedFeatures.includes(feature)
                  return (
                    <button
                      key={feature}
                      type="button"
                      onClick={() => toggleFeature(feature)}
                      className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                        active
                          ? 'border-[#1f4f78] bg-[#2b5577] text-white shadow-[0_10px_18px_rgba(31,79,120,0.18)]'
                          : 'border-[#dbe6f2] bg-white text-[#47627c] hover:border-[#b7c8db]'
                      }`}
                    >
                      {feature}
                    </button>
                  )
                })}
              </div>
            </section>

            <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-[1rem] font-semibold text-[#142132]">Description</h4>
                  <p className="mt-1 text-sm text-[#607387]">What makes this property special? Capture the story clearly so the listing converts faster.</p>
                </div>
                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${sectionStatuses.find((item) => item.key === 'description')?.complete ? 'border-[#d8eddf] bg-[#ecfaf1] text-[#1f7d44]' : 'border-[#f5dbb0] bg-[#fff8ec] text-[#9a5b13]'}`}>
                  {sectionStatuses.find((item) => item.key === 'description')?.complete ? 'Complete' : 'Missing info'}
                </span>
              </div>
              <div className="mt-5 grid gap-4">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Full Description</span>
                  <Field as="textarea" rows={6} value={marketingDraft.description} onChange={(event) => updateMarketingDraft('description', event.target.value)} placeholder="Position the property clearly, highlight lifestyle, and give buyers a reason to book a viewing." />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Internal Notes</span>
                  <Field as="textarea" rows={3} value={marketingDraft.notes} onChange={(event) => updateMarketingDraft('notes', event.target.value)} placeholder="Campaign angle, positioning notes, or agent-only context." />
                </label>
              </div>
            </section>

            <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-[1rem] font-semibold text-[#142132]">Floor Plans</h4>
                  <p className="mt-1 text-sm text-[#607387]">Upload labelled plans so buyers and internal teams can work from the same property pack.</p>
                </div>
                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${sectionStatuses.find((item) => item.key === 'floorplans')?.complete ? 'border-[#d8eddf] bg-[#ecfaf1] text-[#1f7d44]' : 'border-[#f5dbb0] bg-[#fff8ec] text-[#9a5b13]'}`}>
                  {sectionStatuses.find((item) => item.key === 'floorplans')?.complete ? 'Complete' : 'Missing info'}
                </span>
              </div>
              <div className="mt-5 rounded-[16px] border border-dashed border-[#c9d8e8] bg-[#fbfdff] p-3">
                <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-[#dbe6f2] bg-white px-3 text-xs font-semibold text-[#35546c] hover:border-[#b7c8db] hover:bg-[#f7fbff]">
                  <Upload size={16} />
                  Upload Floor Plans
                  <input type="file" accept=".pdf,image/*" multiple className="hidden" onChange={handleFloorplanUpload} disabled={gallerySaving} />
                </label>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {marketingDraft.floorplans.length ? (
                  marketingDraft.floorplans.map((plan) => (
                    <div key={plan.id} className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[#22374d]">{plan.name}</p>
                          <a href={plan.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#1f4f78]">
                            <ExternalLink size={12} />
                            Open file
                          </a>
                        </div>
                        <button type="button" onClick={() => removeFloorplan(plan.id)} className="rounded-full border border-[#dbe6f2] p-1 text-[#6b7d93] hover:text-[#22374d]">
                          <X size={14} />
                        </button>
                      </div>
                      <label className="mt-3 grid gap-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Plan Label</span>
                        <Field value={plan.label || ''} onChange={(event) => updateFloorplanLabel(plan.id, event.target.value)} placeholder="Ground Floor" />
                      </label>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[16px] border border-dashed border-[#d3deea] bg-[#fbfcfe] p-4 text-sm text-[#6b7d93]">
                    No floor plans uploaded yet.
                  </div>
                )}
              </div>
            </section>
          </div>

          <div className="space-y-5">
            <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <div className="flex items-center gap-3">
                <div className="rounded-[14px] border border-[#dce6f2] bg-[#f7fbff] p-2 text-[#1f4f78]">
                  <MapPin size={18} />
                </div>
                <div>
                  <h4 className="text-[1rem] font-semibold text-[#142132]">Listing Snapshot</h4>
                  <p className="text-sm text-[#607387]">Quick read on how this property will present across the platform.</p>
                </div>
              </div>
              <div className="mt-4 overflow-hidden rounded-[20px] border border-[#dce6f2]">
                <div className="h-[220px] border-b border-[#e5edf6]">{getImageBlock(coverImage?.url || '', marketingDraft.headline || listingRecord.listingTitle)}</div>
                <div className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${statusClass(marketingDraft.listingStatus)}`}>
                      {formatStatusLabel(marketingDraft.listingStatus)}
                    </span>
                    <span className="inline-flex rounded-full border border-[#dbe6f2] bg-white px-2.5 py-1 text-[0.72rem] font-semibold text-[#35546c]">
                      {marketingDraft.propertyType || 'Property type pending'}
                    </span>
                    <span className="inline-flex rounded-full border border-[#dbe6f2] bg-white px-2.5 py-1 text-[0.72rem] font-semibold text-[#35546c]">
                      {marketingDraft.source || 'Source pending'}
                    </span>
                  </div>
                  <p className="text-[1rem] font-semibold text-[#142132]">{marketingDraft.headline || 'Headline pending'}</p>
                  <p className="text-sm text-[#607387]">{[marketingDraft.addressLine1, marketingDraft.suburb, marketingDraft.city, marketingDraft.province].filter(Boolean).join(', ') || 'Address not fully captured yet.'}</p>
                  <p className="text-[1rem] font-semibold text-[#1f4f78]">{formatCurrency(marketingDraft.price)}</p>
                  <p className="text-sm leading-6 text-[#607387]">{marketingDraft.description || 'No listing description captured yet.'}</p>
                </div>
              </div>
            </section>

            <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-[1rem] font-semibold text-[#142132]">Image Gallery</h4>
                  <p className="mt-1 text-sm text-[#607387]">Bulk upload, select a cover image, and keep the listing gallery clean and consistent.</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  {gallerySaving ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-[#dbe6f2] bg-[#f7fbff] px-2.5 py-1 text-[0.72rem] font-semibold text-[#35546c]">
                      <Loader2 size={12} className="animate-spin" />
                      Saving
                    </span>
                  ) : null}
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${sectionStatuses.find((item) => item.key === 'gallery')?.complete ? 'border-[#d8eddf] bg-[#ecfaf1] text-[#1f7d44]' : 'border-[#f5dbb0] bg-[#fff8ec] text-[#9a5b13]'}`}>
                    {sectionStatuses.find((item) => item.key === 'gallery')?.complete ? 'Complete' : 'Missing info'}
                  </span>
                </div>
              </div>
              <div className="mt-5 rounded-[18px] border border-dashed border-[#c9d8e8] bg-[#fbfdff] p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#dbe6f2] bg-white text-[#1f4f78]">
                      <ImagePlus size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#22374d]">{marketingDraft.galleryImages.length ? `${marketingDraft.galleryImages.length} image${marketingDraft.galleryImages.length === 1 ? '' : 's'} saved` : 'No images saved yet'}</p>
                      <p className="text-xs text-[#7b8ca2]">Cover, order, and removals save automatically.</p>
                    </div>
                  </div>
                  <label className={`inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 text-xs font-semibold transition ${gallerySaving ? 'border-[#dbe6f2] bg-[#f5f8fb] text-[#9aa9ba]' : 'border-[#1f4f78] bg-[#1f4f78] text-white shadow-[0_8px_14px_rgba(31,79,120,0.16)] hover:bg-[#183f61]'}`}>
                    {gallerySaving ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    Upload images
                    <input type="file" accept="image/*" multiple className="hidden" onChange={handleGalleryUpload} disabled={gallerySaving} />
                  </label>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {marketingDraft.galleryImages.length ? (
                  marketingDraft.galleryImages.map((image, index) => {
                    const active = String(image.id) === String(marketingDraft.coverImageId)
                    return (
                      <div key={image.id} className="overflow-hidden rounded-[16px] border border-[#dce6f2] bg-white">
                        <div className="relative h-[150px] border-b border-[#e5edf6] bg-[#eef4fa]">
                          <img src={image.url} alt={image.name} className="h-full w-full object-cover" />
                          {active ? (
                            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-[0.68rem] font-semibold text-[#1f4f78] shadow-sm">
                              <Star size={11} fill="currentColor" />
                              Cover
                            </span>
                          ) : null}
                          <button type="button" onClick={() => removeGalleryImage(image.id)} disabled={gallerySaving} className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#dbe6f2] bg-white/95 text-[#6b7d93] shadow-sm hover:text-[#22374d] disabled:cursor-not-allowed disabled:opacity-60" aria-label={`Remove ${image.name}`}>
                            <X size={14} />
                          </button>
                        </div>
                        <div className="space-y-3 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-[#22374d]">{image.name}</p>
                              <p className="mt-1 text-xs text-[#7b8ca2]">{image.path ? 'Stored in Supabase' : 'Local preview'} - Image {index + 1}</p>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <CompactActionButton active={active} onClick={() => setCoverImage(image.id)} disabled={gallerySaving || active}>
                              <Star size={13} fill={active ? 'currentColor' : 'none'} />
                              {active ? 'Cover' : 'Set cover'}
                            </CompactActionButton>
                            <CompactActionButton onClick={() => moveGalleryImage(image.id, 'left')} disabled={gallerySaving || index === 0} aria-label={`Move ${image.name} left`}>
                              <ChevronLeft size={14} />
                              Left
                            </CompactActionButton>
                            <CompactActionButton onClick={() => moveGalleryImage(image.id, 'right')} disabled={gallerySaving || index === marketingDraft.galleryImages.length - 1} aria-label={`Move ${image.name} right`}>
                              Right
                              <ChevronRight size={14} />
                            </CompactActionButton>
                          </div>
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="rounded-[16px] border border-dashed border-[#d3deea] bg-[#fbfcfe] p-4 text-sm text-[#6b7d93] sm:col-span-2">
                    No gallery images uploaded yet.
                  </div>
                )}
              </div>
            </section>
          </div>
        </section>
      ) : null}

      {activeTab === 'pipeline' ? (
        <section className="space-y-5">
          <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h3 className="text-[1.05rem] font-semibold text-[#142132]">Pipeline For This Listing</h3>
                <p className="mt-1 text-sm text-[#607387]">Lead movement from first interest to offer activity.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                <MetricCard label="Leads" value={metrics.leadCount} meta="Initial interest" />
                <MetricCard label="Viewings" value={metrics.viewingCount} meta="Scheduled / held" />
                <MetricCard label="Offers" value={metrics.offerLeadCount || offerRows.length} meta="Negotiation stage" />
                <MetricCard label="Accepted" value={metrics.acceptedCount} meta="Converted to deal" />
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              {[
                { label: 'Leads', value: metrics.leadCount, fill: 100 },
                { label: 'Viewings', value: metrics.viewingCount, fill: metrics.leadCount ? Math.max(12, (metrics.viewingCount / metrics.leadCount) * 100) : 0 },
                { label: 'Offers', value: offerRows.length, fill: metrics.leadCount ? Math.max(12, (offerRows.length / metrics.leadCount) * 100) : 0 },
                { label: 'Accepted', value: metrics.acceptedCount, fill: offerRows.length ? Math.max(12, (metrics.acceptedCount / offerRows.length) * 100) : 0 },
              ].map((step, index) => (
                <article key={step.label} className="rounded-[18px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-[#22374d]">{step.label}</span>
                    <span className="text-[1rem] font-semibold text-[#142132]">{step.value}</span>
                  </div>
                  <div className="mt-4 h-3 overflow-hidden rounded-full bg-[#dbe6f2]">
                    <div className="h-full rounded-full bg-[#1f4f78]" style={{ width: `${Math.min(100, Math.max(0, step.fill))}%` }} />
                  </div>
                  {index < 3 ? <p className="mt-3 text-xs text-[#6b7d93]">Progressing toward {['viewings', 'offers', 'accepted'][index]}</p> : null}
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-[1.05rem] font-semibold text-[#142132]">Viewings</h3>
                <p className="mt-1 text-sm text-[#607387]">Appointment requests, confirmations, and post-viewing feedback linked to this listing.</p>
              </div>
              <Button onClick={() => setShowViewingForm((current) => !current)}>
                <Plus size={15} />
                {showViewingForm ? 'Hide Viewing Form' : 'Request / Schedule Viewing'}
              </Button>
            </div>

            {showViewingForm ? (
              <form className="mt-5 rounded-[18px] border border-[#dce6f2] bg-[#fbfdff] p-4" onSubmit={submitViewingRequest}>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <label className="grid gap-2 xl:col-span-3">
                    <span className="text-sm font-semibold text-[#2d445e]">Buyer Lead</span>
                    <Field as="select" value={viewingForm.buyerLeadId} onChange={(event) => updateViewingForm('buyerLeadId', event.target.value)}>
                      <option value="">Select buyer lead</option>
                      {listingLeads.map((lead) => (
                        <option key={lead.id} value={lead.id}>{lead.name}</option>
                      ))}
                    </Field>
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-[#2d445e]">Proposed Date</span>
                    <Field type="date" value={viewingForm.proposedDate} onChange={(event) => updateViewingForm('proposedDate', event.target.value)} />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-[#2d445e]">Proposed Time</span>
                    <Field type="time" value={viewingForm.proposedTime} onChange={(event) => updateViewingForm('proposedTime', event.target.value)} />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-[#2d445e]">Alternative Time 1</span>
                    <Field type="datetime-local" value={viewingForm.alternativeTimeA} onChange={(event) => updateViewingForm('alternativeTimeA', event.target.value)} />
                  </label>
                  <label className="grid gap-2 xl:col-span-3">
                    <span className="text-sm font-semibold text-[#2d445e]">Notes</span>
                    <Field as="textarea" rows={3} value={viewingForm.notes} onChange={(event) => updateViewingForm('notes', event.target.value)} placeholder="Access notes, parking, or preferred alternatives." />
                  </label>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={() => setShowViewingForm(false)}>Cancel</Button>
                  <Button type="submit">Create Viewing Request</Button>
                </div>
              </form>
            ) : null}

            <div className="mt-5 space-y-5">
              {[
                { key: 'pending', label: 'Pending', rows: viewingGroups.pending },
                { key: 'confirmed', label: 'Confirmed', rows: viewingGroups.confirmed },
                { key: 'completed', label: 'Completed', rows: viewingGroups.completed },
              ].map((group) => (
                <section key={group.key}>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h4 className="text-[0.92rem] font-semibold text-[#22374d]">{group.label}</h4>
                    <span className="rounded-full border border-[#dbe6f2] bg-[#f7fbff] px-2.5 py-1 text-[0.72rem] font-semibold text-[#35546c]">
                      {group.rows.length}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {group.rows.length ? group.rows.map((viewing) => (
                      <article key={viewing.viewing_id} className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-[#22374d]">{viewing.buyer_name || 'Buyer'}</p>
                            <p className="mt-1 text-sm text-[#607387]">{viewing.proposed_date || 'Date pending'} {viewing.proposed_time || ''}</p>
                            <p className="mt-1 text-xs text-[#6b7d93]">{viewing.notes || 'No notes captured yet.'}</p>
                          </div>
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${statusClass(viewing.status)}`}>
                            {formatViewingStatusLabel(viewing.status)}
                          </span>
                        </div>
                        <div className="mt-3 grid gap-2 md:grid-cols-3">
                          {(viewing.participants || []).map((participant) => (
                            <div key={participant.participant_id} className="rounded-[12px] border border-[#dce6f2] bg-white px-3 py-2">
                              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">{participant.role}</p>
                              <p className="mt-1 text-sm font-medium text-[#22374d]">{participant.name}</p>
                              <p className="mt-1 text-xs text-[#607387]">{formatViewingStatusLabel(participant.response_status)}</p>
                              {group.key !== 'completed' ? (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  <button type="button" className="rounded-full border border-[#dce6f2] px-2 py-1 text-[0.68rem] font-semibold text-[#35546c]" onClick={() => updateViewingParticipantResponse(viewing.viewing_id, participant.role, VIEWING_RESPONSE_STATUS.ACCEPTED)}>
                                    Accept
                                  </button>
                                  <button type="button" className="rounded-full border border-[#dce6f2] px-2 py-1 text-[0.68rem] font-semibold text-[#35546c]" onClick={() => updateViewingParticipantResponse(viewing.viewing_id, participant.role, VIEWING_RESPONSE_STATUS.DECLINED)}>
                                    Decline
                                  </button>
                                  <button type="button" className="rounded-full border border-[#dce6f2] px-2 py-1 text-[0.68rem] font-semibold text-[#35546c]" onClick={() => rescheduleViewingRequest(viewing.viewing_id, { proposedByRole: participant.role, proposedDate: viewing.proposed_date, proposedTime: viewing.proposed_time, notes: `Reschedule requested by ${participant.role}.` })}>
                                    Propose New Time
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {String(viewing.status || '').toLowerCase() === VIEWING_STATUS.CONFIRMED ? (
                            <Button size="sm" type="button" onClick={() => completeViewingRequest(viewing.viewing_id)}>Mark Completed</Button>
                          ) : null}
                        </div>
                        {String(viewing.status || '').toLowerCase() === VIEWING_STATUS.COMPLETED ? (
                          <div className="mt-4 rounded-[14px] border border-[#dce6f2] bg-white p-3">
                            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Feedback</p>
                            {viewing.feedback ? (
                              <div className="mt-2 text-sm text-[#607387]">
                                <p><span className="font-semibold text-[#22374d]">Interest:</span> {viewing.feedback.interest_level || '—'}</p>
                                <p className="mt-1"><span className="font-semibold text-[#22374d]">Next Action:</span> {viewing.feedback.next_action || '—'}</p>
                                <p className="mt-1">{viewing.feedback.feedback_notes || 'No notes captured.'}</p>
                              </div>
                            ) : (
                              <div className="mt-3 grid gap-3 md:grid-cols-3">
                                <Field as="select" value={feedbackDrafts[viewing.viewing_id]?.interestLevel || ''} onChange={(event) => setFeedbackDrafts((prev) => ({ ...prev, [viewing.viewing_id]: { ...(prev[viewing.viewing_id] || {}), interestLevel: event.target.value } }))}>
                                  <option value="">Interest Level</option>
                                  <option value="interested">Interested</option>
                                  <option value="not_interested">Not interested</option>
                                  <option value="second_viewing">Wants second viewing</option>
                                  <option value="ready_to_offer">Ready to offer</option>
                                  <option value="follow_up_later">Follow up later</option>
                                </Field>
                                <Field value={feedbackDrafts[viewing.viewing_id]?.nextAction || ''} onChange={(event) => setFeedbackDrafts((prev) => ({ ...prev, [viewing.viewing_id]: { ...(prev[viewing.viewing_id] || {}), nextAction: event.target.value } }))} placeholder="Next action" />
                                <Field value={feedbackDrafts[viewing.viewing_id]?.feedbackNotes || ''} onChange={(event) => setFeedbackDrafts((prev) => ({ ...prev, [viewing.viewing_id]: { ...(prev[viewing.viewing_id] || {}), feedbackNotes: event.target.value } }))} placeholder="Feedback notes" />
                                <div className="md:col-span-3">
                                  <Button size="sm" type="button" onClick={() => saveFeedback(viewing.viewing_id)}>Save Feedback</Button>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : null}
                      </article>
                    )) : (
                      <div className="rounded-[16px] border border-dashed border-[#d3deea] bg-[#fbfcfe] p-4 text-sm text-[#6b7d93]">
                        No {group.label.toLowerCase()} viewings for this listing yet.
                      </div>
                    )}
                  </div>
                </section>
              ))}
            </div>
          </section>

          <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
            <h3 className="text-[1rem] font-semibold text-[#142132]">Lead Register</h3>
            <p className="mt-1 text-sm text-[#607387]">Buyers currently interested in this listing.</p>
            <div className="mt-4 space-y-3">
              {listingLeads.length ? (
                listingLeads.map((lead) => (
                  <article key={lead.id} className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-[#22374d]">{lead.name}</p>
                        <p className="mt-1 text-sm text-[#607387]">{lead.email || 'Email pending'} • {lead.phone || 'Phone pending'}</p>
                        <p className="mt-1 text-xs text-[#6b7d93]">{lead.notes || 'No lead notes captured.'}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex rounded-full border border-[#dbe6f2] bg-white px-2.5 py-1 text-[0.72rem] font-semibold text-[#35546c]">
                          {lead.journeyStage || lead.status || 'Lead'}
                        </span>
                        <span className="inline-flex rounded-full border border-[#dbe6f2] bg-[#f7fbff] px-2.5 py-1 text-[0.72rem] font-semibold text-[#35546c]">
                          {formatCurrency(lead.budget)}
                        </span>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <div className="rounded-[16px] border border-dashed border-[#d3deea] bg-[#fbfcfe] p-5 text-sm text-[#6b7d93]">
                  No listing-specific leads yet. Pipeline signals will appear here once this property starts attracting buyer activity.
                </div>
              )}
            </div>
          </section>
        </section>
      ) : null}

      {activeTab === 'offers' ? (
        <section className="space-y-5">
          <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-[1.05rem] font-semibold text-[#142132]">Offer Management</h3>
                <p className="mt-1 text-sm text-[#607387]">Send secure buyer offer links, review submissions, and route valid offers to seller review.</p>
              </div>
              <Button onClick={() => setShowSendOfferLinkForm((current) => !current)}>
                <Link2 size={15} />
                {showSendOfferLinkForm ? 'Hide Offer Link Setup' : 'Send Offer Link'}
              </Button>
            </div>

            {offerActionError ? (
              <div className="mt-4 rounded-[14px] border border-[#f4d4d4] bg-[#fff5f5] px-3 py-2 text-sm text-[#b42318]">{offerActionError}</div>
            ) : null}
            {offerActionMessage ? (
              <div className="mt-4 rounded-[14px] border border-[#d8eddf] bg-[#ecfaf1] px-3 py-2 text-sm text-[#1f7d44]">{offerActionMessage}</div>
            ) : null}
            {canonicalOffersError ? (
              <div className="mt-4 rounded-[14px] border border-[#f4d4d4] bg-[#fff5f5] px-3 py-2 text-sm text-[#b42318]">{canonicalOffersError}</div>
            ) : null}

            {showSendOfferLinkForm ? (
              <form className="mt-5 rounded-[18px] border border-[#dce6f2] bg-[#fbfdff] p-4" onSubmit={handleCreateOfferLink}>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-[#2d445e]">Buyer lead</span>
                    <Field as="select" value={offerInviteDraft.buyerLeadId} onChange={(event) => setOfferInviteDraft((prev) => ({ ...prev, buyerLeadId: event.target.value }))}>
                      <option value="">Select buyer lead</option>
                      {listingLeads.map((lead) => (
                        <option key={lead.id} value={lead.id}>
                          {lead.name || 'Buyer'} • {lead.email || lead.phone || 'No contact'}
                        </option>
                      ))}
                    </Field>
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-[#2d445e]">Link expiry (days)</span>
                    <Field
                      type="number"
                      min="1"
                      max="30"
                      value={offerInviteDraft.expiresInDays}
                      onChange={(event) => setOfferInviteDraft((prev) => ({ ...prev, expiresInDays: Number(event.target.value || 7) }))}
                    />
                  </label>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={() => setShowSendOfferLinkForm(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={sendingOfferLink}>{sendingOfferLink ? 'Sending...' : 'Generate & Send Link'}</Button>
                </div>
              </form>
            ) : null}

            <div className="mt-4 space-y-2">
              {canonicalOffersLoading ? (
                <div className="rounded-[14px] border border-[#d8e6f6] bg-[#f3f8fd] px-3 py-2 text-sm text-[#2c5a89]">
                  Loading canonical offers...
                </div>
              ) : null}
              {offerInviteRows.length ? offerInviteRows.slice(0, 4).map((invite) => (
                <article key={invite.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] border border-[#dce6f2] bg-[#fbfdff] px-3 py-2.5">
                  <div>
                    <p className="text-sm font-semibold text-[#22374d]">{invite.buyerLeadName || 'Buyer lead'}</p>
                    <p className="text-xs text-[#607387]">Status: {formatStatusLabel(invite.status)} • Expires {formatDate(invite.expiresAt)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyOfferLink(invite.token)}
                    className="inline-flex items-center gap-1 rounded-full border border-[#dbe6f2] bg-white px-3 py-1 text-xs font-semibold text-[#35546c]"
                  >
                    <Copy size={12} />
                    {copiedOfferToken === invite.token ? 'Copied' : 'Copy Link'}
                  </button>
                </article>
              )) : (
                <div className="rounded-[14px] border border-dashed border-[#d3deea] bg-[#fbfcfe] px-3 py-3 text-sm text-[#6b7d93]">
                  No secure offer links sent yet.
                </div>
              )}
            </div>
          </section>

          <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-3">
              {offerRows.length ? (
                offerRows.map((offer) => {
                  const statusKey = normalizeOfferWorkflowStatus(offer.status)
                  const sellerReviewSession = offer.sellerReviewSession || {}
                  const sellerReviewToken = String(sellerReviewSession.token || offer.conditionsJson?.sellerReviewSessionToken || '').trim()
                  const sellerReviewLink = sellerReviewToken && typeof window !== 'undefined'
                    ? `${window.location.origin}/seller/offers/review/${encodeURIComponent(sellerReviewToken)}`
                    : ''
                  const sellerReviewRecipient = String(
                    offer.conditionsJson?.sellerReviewRecipientEmail ||
                      offer.conditionsJson?.sellerEmail ||
                      sellerReviewSession.metadata?.sellerEmail ||
                      '',
                  ).trim()
                  const sellerReviewSentAt = String(sellerReviewSession.sentAt || offer.sentToSellerAt || offer.conditionsJson?.sellerReviewSentAt || '').trim()
                  const sellerReviewViewedAt = String(sellerReviewSession.viewedAt || offer.sellerViewedAt || '').trim()
                  const hasSellerReview = Boolean(sellerReviewToken || sellerReviewSentAt || [
                    OFFER_WORKFLOW_STATUS.SELLER_REVIEW,
                    OFFER_WORKFLOW_STATUS.SELLER_VIEWED,
                  ].includes(statusKey))
                  return (
                  <article key={offer.id} className="rounded-[18px] border border-[#dce6f2] bg-white p-4 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-[1rem] font-semibold text-[#22374d]">{offer.buyerName || 'Buyer pending'}</p>
                        <p className="mt-1 text-sm text-[#607387]">{formatCurrency(offer.offerPrice)} • {offer.conditions || 'Conditions not set'}</p>
                        <p className="mt-1 text-xs text-[#6b7d93]">
                          Offer date: {formatDate(offer.offerDate)} • Expiry: {formatDate(offer.expiryDate)}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold ${
                            offer.sourceSystem === 'canonical_offer'
                              ? 'border-[#d8e6f6] bg-[#f3f8fd] text-[#2c5a89]'
                              : 'border-[#dbe6f2] bg-white text-[#35546c]'
                          }`}>
                            {offer.sourceSystem === 'canonical_offer' ? 'Canonical offer' : 'Legacy listing offer'}
                          </span>
                          {offer.viewingAppointmentId ? (
                            <span className="inline-flex rounded-full border border-[#dbe6f2] bg-white px-2.5 py-1 text-[0.7rem] font-semibold text-[#35546c]">
                              Viewing linked
                            </span>
                          ) : null}
                        </div>
                        {offer.supportingDocsUrl ? (
                          <a href={offer.supportingDocsUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-[#1f4f78]">
                            <ExternalLink size={14} />
                            Open supporting docs
                          </a>
                        ) : null}
                      </div>
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${statusClass(offer.status)}`}>
                        {formatStatusLabel(offer.status)}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-[#607387]">{offer.agentNotes || 'No agent notes logged yet.'}</p>
                    {hasSellerReview ? (
                      <div className="mt-3 grid gap-2 rounded-[14px] border border-[#d8e6f6] bg-[#f6faff] p-3 text-sm text-[#35546c] md:grid-cols-[1fr_1fr_1fr_auto]">
                        <div>
                          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-[#7d91a8]">Seller review</p>
                          <p className="mt-1 font-semibold text-[#203a54]">{sellerReviewViewedAt ? 'Viewed by seller' : 'Sent to seller'}</p>
                        </div>
                        <div>
                          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-[#7d91a8]">Recipient</p>
                          <p className="mt-1 truncate font-semibold text-[#203a54]">{sellerReviewRecipient || 'Seller email pending'}</p>
                        </div>
                        <div>
                          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-[#7d91a8]">{sellerReviewViewedAt ? 'Viewed' : 'Sent'}</p>
                          <p className="mt-1 font-semibold text-[#203a54]">{formatDate(sellerReviewViewedAt || sellerReviewSentAt)}</p>
                        </div>
                        {sellerReviewLink ? (
                          <Button size="sm" type="button" variant="secondary" onClick={() => {
                            if (typeof navigator !== 'undefined') void navigator.clipboard?.writeText(sellerReviewLink)
                            setOfferActionMessage('Seller review link copied.')
                          }}>
                            Copy Seller Link
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                    <label className="mt-3 grid gap-1">
                      <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Internal note</span>
                      <Field
                        value={offerNotesDraftById?.[offer.id] || ''}
                        onChange={(event) => setOfferNotesDraftById((previous) => ({ ...previous, [offer.id]: event.target.value }))}
                        placeholder="Optional note for this action"
                      />
                    </label>
                    {[
                      OFFER_WORKFLOW_STATUS.SUBMITTED,
                      OFFER_WORKFLOW_STATUS.AGENT_REVIEW,
                    ].includes(normalizeOfferWorkflowStatus(offer.status)) && offer.sourceSystem !== 'canonical_offer' ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button size="sm" type="button" onClick={() => handleOfferAction(offer.id, 'forward_to_seller')}>Forward to Seller</Button>
                        <Button size="sm" variant="secondary" type="button" onClick={() => handleOfferAction(offer.id, 'request_clarification')}>Request Clarification</Button>
                        <Button size="sm" variant="secondary" type="button" onClick={() => handleOfferAction(offer.id, 'reject_invalid')}>Reject Invalid</Button>
                      </div>
                    ) : null}
                    {offer.sourceSystem === 'canonical_offer' ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {[
                          OFFER_WORKFLOW_STATUS.SUBMITTED,
                          OFFER_WORKFLOW_STATUS.DRAFT,
                          OFFER_WORKFLOW_STATUS.BUYER_VIEWED,
                        ].includes(normalizeOfferWorkflowStatus(offer.status)) ? (
                          <Button
                            size="sm"
                            type="button"
                            variant="secondary"
                            disabled={canonicalOfferActionId === `${offer.id}:agent_review`}
                            onClick={() => void handleCanonicalListingOfferStatus(offer, 'agent_review', 'Agent review started')}
                          >
                            Start Agent Review
                          </Button>
                        ) : null}
                        {![
                          OFFER_WORKFLOW_STATUS.ACCEPTED,
                          OFFER_WORKFLOW_STATUS.CONVERTED_TO_TRANSACTION,
                          OFFER_WORKFLOW_STATUS.REJECTED,
                          OFFER_WORKFLOW_STATUS.WITHDRAWN,
                          OFFER_WORKFLOW_STATUS.EXPIRED,
                        ].includes(normalizeOfferWorkflowStatus(offer.status)) ? (
                          <>
                            {[
                              OFFER_WORKFLOW_STATUS.SUBMITTED,
                              OFFER_WORKFLOW_STATUS.AGENT_REVIEW,
                              OFFER_WORKFLOW_STATUS.CHANGES_REQUESTED,
                              OFFER_WORKFLOW_STATUS.COUNTERED,
                              OFFER_WORKFLOW_STATUS.SELLER_REVIEW,
                              OFFER_WORKFLOW_STATUS.SELLER_VIEWED,
                            ].includes(normalizeOfferWorkflowStatus(offer.status)) ? (
                              <Button
                                size="sm"
                                type="button"
                                disabled={canonicalOfferActionId === `${offer.id}:sent_to_seller`}
                                onClick={() => void handleCanonicalListingOfferSendToSeller(offer)}
                              >
                                {[OFFER_WORKFLOW_STATUS.SELLER_REVIEW, OFFER_WORKFLOW_STATUS.SELLER_VIEWED].includes(statusKey) ? 'Resend to Seller' : 'Send to Seller'}
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              type="button"
                              variant="secondary"
                              disabled={canonicalOfferActionId === `${offer.id}:changes_requested`}
                              onClick={() => void handleCanonicalListingOfferStatus(offer, 'changes_requested', 'Buyer changes requested')}
                            >
                              Request Buyer Changes
                            </Button>
                            <Button
                              size="sm"
                              type="button"
                              variant="secondary"
                              className="border-[#f1d0ca] text-[#9f3a2f] hover:bg-[#fff6f4]"
                              disabled={canonicalOfferActionId === `${offer.id}:rejected`}
                              onClick={() => void handleCanonicalListingOfferStatus(offer, 'rejected', 'Offer rejected')}
                            >
                              Reject
                            </Button>
                          </>
                        ) : null}
                        {normalizeOfferWorkflowStatus(offer.status) === OFFER_WORKFLOW_STATUS.ACCEPTED || (
                          normalizeOfferWorkflowStatus(offer.status) === OFFER_WORKFLOW_STATUS.CONVERTED_TO_TRANSACTION && offer.transactionId
                        ) ? (
                          <Button
                            size="sm"
                            type="button"
                            disabled={canonicalOfferActionId === `${offer.id}:convert`}
                            onClick={() => void handleCanonicalListingOfferConversion(offer)}
                          >
                            {normalizeOfferWorkflowStatus(offer.status) === OFFER_WORKFLOW_STATUS.CONVERTED_TO_TRANSACTION
                              ? 'Resend Buyer Onboarding'
                              : 'Create Transaction & Send Onboarding'}
                          </Button>
                        ) : null}
                        {offer.buyerLeadId ? (
                          <Button size="sm" type="button" variant="secondary" onClick={() => navigate(`/pipeline/leads/${offer.buyerLeadId}`)}>Open Buyer Lead</Button>
                        ) : null}
                        {offer.transactionId ? (
                          <Button size="sm" type="button" variant="secondary" onClick={() => navigate(`/transactions/${offer.transactionId}`)}>Open Transaction</Button>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                  )
                })
              ) : (
                <div className="rounded-[16px] border border-dashed border-[#d3deea] bg-[#fbfcfe] p-5 text-sm text-[#6b7d93]">
                  No offers captured for this listing yet.
                </div>
              )}
            </div>

            <aside className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <h3 className="text-[1rem] font-semibold text-[#142132]">Offer Comparison</h3>
              <p className="mt-1 text-sm text-[#607387]">Fast read on current offer quality and seller options.</p>
              <div className="mt-4 space-y-3">
                <MetricCard label="Highest Offer" value={formatCurrency(offerSummary.highest)} meta="Top current buyer position" />
                <MetricCard label="Average Offer" value={offerRows.length ? formatCurrency(metrics.offerAverage) : '—'} meta="Mean offer level" />
                <MetricCard label="Submitted" value={offerSummary.submitted} meta="Awaiting internal review" />
                <MetricCard label="Seller Review" value={offerSummary.sellerReview} meta="Offers with seller" />
                <MetricCard label="Accepted" value={metrics.acceptedCount} meta="Converted or ready to convert" />
              </div>
            </aside>
          </section>
        </section>
      ) : null}

      {activeTab === 'seller' ? (
        <section className="mx-auto w-full max-w-[1600px] space-y-5 px-1 sm:px-2">
          <nav className="rounded-[22px] border border-[#dde4ee] bg-white p-2 shadow-[0_10px_24px_rgba(15,23,42,0.05)]" aria-label="Seller mandate workspace tabs">
            <div className="overflow-x-auto">
              <div className="grid min-w-[640px] grid-cols-5 gap-1">
                {SELLER_WORKSPACE_TABS.map((tab) => {
                  const active = sellerWorkspaceTab === tab.key
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      className={`min-h-[42px] rounded-[14px] px-4 text-sm font-semibold transition ${
                        active
                          ? 'bg-[#123955] text-white shadow-[0_10px_22px_rgba(18,57,85,0.16)]'
                          : 'text-[#5f7288] hover:bg-[#f7fbff] hover:text-[#263b4f]'
                      }`}
                      onClick={() => setSellerWorkspaceTab(tab.key)}
                    >
                      {tab.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </nav>

          {sellerWorkspaceTab === 'overview' ? (
            <section className="space-y-5">
              <div className="grid gap-5 min-[1680px]:grid-cols-[minmax(0,1fr)_minmax(400px,440px)]">
                <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
                  <div className="grid gap-5 min-[1280px]:grid-cols-[minmax(0,1fr)_clamp(150px,18vw,240px)] min-[1280px]:items-start">
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => navigate('/listings')}
                        className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#5f7894] hover:text-[#1f4f78]"
                      >
                        <ArrowLeft size={13} />
                        Back to Listings
                      </button>
                      <h2 className="mt-4 truncate text-2xl font-semibold tracking-[-0.035em] text-[#142132]">{listingRecord.listingTitle}</h2>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-medium text-[#607387]">
                        <span>{[marketingDraft.suburb, marketingDraft.city].filter(Boolean).join(', ') || 'Location pending'}</span>
                        <span className="text-[#c0cad5]">•</span>
                        <span>{marketingDraft.propertyType || listingRecord.propertyType || 'Property type pending'}</span>
                      </div>
                      <div className="mt-5 grid gap-x-6 gap-y-3 min-[820px]:grid-cols-2">
                        <CompactSnapshotRow label="Pipeline Value" value={formatCurrency(marketingDraft.price || listingRecord.askingPrice)} />
                        <CompactSnapshotRow label="Listing ID" value={marketingDraft.listingCode || listingRecord.listingReference || listingRecord.id} />
                        <CompactSnapshotRow label="Assigned Agent" value={listingRecord.assignedAgentName || listingRecord.assignedAgent || listingRecord.assignedAgentEmail || 'Unassigned'} />
                        <CompactSnapshotRow label="Mandate Status" value={mandateWorkspace.label} />
                        <CompactSnapshotRow label="Signed Date" value={formatDate(mandateWorkspace.signedDate)} />
                        <CompactSnapshotRow label="Expiry Date" value={formatDate(mandateWorkspace.expiryDate)} />
                        <CompactSnapshotRow
                          label="Days Until Expiry"
                          value={
                            mandateWorkspace.daysUntilExpiry === null
                              ? 'Not captured'
                              : mandateWorkspace.daysUntilExpiry < 0
                                ? `${Math.abs(mandateWorkspace.daysUntilExpiry)} days expired`
                                : `${mandateWorkspace.daysUntilExpiry} days`
                          }
                        />
                        <CompactSnapshotRow label="Last Updated" value={formatDate(mandateWorkspace.lastUpdated)} />
                      </div>
                    </div>
                    <div className="h-32 min-h-0 w-full overflow-hidden rounded-[18px] border border-[#dfe8f2] bg-[#eef4fa] min-[1280px]:h-full min-[1280px]:max-h-44">
                      {getImageBlock(coverImage?.url || '', listingRecord.listingTitle)}
                    </div>
                  </div>
                </article>

                <article className="flex flex-col rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Mandate Status</p>
                      <StatusPill status={mandateWorkspace.isSigned ? 'done' : mandateWorkspace.isExpired ? 'missing' : 'pending'} label={mandateWorkspace.label} />
                    </div>
                    <FileText className="h-5 w-5 text-[#41627f]" />
                  </div>
                  <div className="mt-4">
                    <CompactSnapshotRow label="Signed Date" value={formatDate(mandateWorkspace.signedDate)} />
                    <CompactSnapshotRow label="Expiry Date" value={formatDate(mandateWorkspace.expiryDate)} />
                    <CompactSnapshotRow
                      label="Days Until Expiry"
                      value={
                        mandateWorkspace.daysUntilExpiry === null
                          ? 'Not captured'
                          : mandateWorkspace.daysUntilExpiry < 0
                            ? `${Math.abs(mandateWorkspace.daysUntilExpiry)} days expired`
                            : `${mandateWorkspace.daysUntilExpiry} days`
                      }
                    />
                    <CompactSnapshotRow label="Last Updated" value={formatDate(mandateWorkspace.lastUpdated)} />
                  </div>
                  <div className="mt-auto grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2 pt-5">
                    {mandateWorkspace.signedUrl ? (
                      <a href={mandateWorkspace.signedUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[#123955] px-3 py-2 text-center text-sm font-semibold leading-5 text-white shadow-[0_10px_22px_rgba(18,57,85,0.14)]">
                        Download Mandate
                      </a>
                    ) : (
                      <Button size="sm" disabled title="No signed mandate file is linked yet.">Download Mandate</Button>
                    )}
                    {mandateWorkspace.viewUrl ? (
                      <a href={mandateWorkspace.viewUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center justify-center rounded-lg border border-[#dbe6f2] bg-white px-3 py-2 text-center text-sm font-semibold leading-5 text-[#2f4862]">
                        View Mandate
                      </a>
                    ) : (
                      <Button size="sm" variant="secondary" disabled>View Mandate</Button>
                    )}
                    <Button size="sm" variant="secondary" onClick={() => void handleResendSellerClientPortalLink()} disabled={resendingSellerPortalLink}>
                      {resendingSellerPortalLink ? 'Sending...' : 'Resend Portal Link'}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={mandateWorkspace.isSigned}
                      onClick={() => setDetailMessage('Regenerate Mandate is available from the mandate generation workflow.')}
                      title={mandateWorkspace.isSigned ? 'A signed mandate already exists, so regeneration is disabled.' : 'Regenerate the mandate from the mandate generation workflow.'}
                    >
                      Regenerate Mandate
                    </Button>
                  </div>
                </article>
              </div>

              <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
                <h3 className="text-base font-semibold text-[#142132]">Key Information</h3>
                <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-3">
                  {keyInformationItems.map((item) => (
                    <InfoTile key={item.label} icon={item.icon} label={item.label} value={item.value} status={item.status} />
                  ))}
                </div>
              </article>

              <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
                <div className="grid gap-5 min-[1500px]:grid-cols-[minmax(240px,300px)_minmax(0,1fr)] min-[1500px]:items-center">
                  <div className="flex flex-wrap items-center gap-4">
                    <div
                      className="grid h-20 w-20 shrink-0 place-items-center rounded-full sm:h-24 sm:w-24"
                      style={{ background: `conic-gradient(#1f7d44 ${sellerReadinessPercent * 3.6}deg, #e5edf6 0deg)` }}
                    >
                      <div className="grid h-14 w-14 place-items-center rounded-full bg-white text-base font-semibold text-[#142132] sm:h-16 sm:w-16 sm:text-lg">
                        {sellerReadinessPercent}%
                      </div>
                    </div>
                    <div className="min-w-[180px]">
                      <h3 className="text-base font-semibold text-[#142132]">Seller Onboarding Progress</h3>
                      <p className="mt-1 text-sm text-[#607387]">{sellerOnboardingCompletedCount} of {sellerOnboardingSteps.length} completed</p>
                    </div>
                  </div>
                  <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(128px,1fr))] gap-2">
                    {sellerOnboardingSteps.map((step) => (
                      <div key={step.key} className="min-h-[118px] rounded-[16px] border border-[#e1e9f2] bg-[#fbfdff] p-3">
                        <div className={`grid h-7 w-7 place-items-center rounded-full ${
                          step.state === 'completed'
                            ? 'bg-[#ecfaf1] text-[#1f7d44]'
                            : step.state === 'in_progress'
                              ? 'bg-[#eef5fb] text-[#1f4f78]'
                              : 'bg-[#f4f7fb] text-[#8aa0b6]'
                        }`}>
                          {step.state === 'completed' ? <CheckCircle2 size={15} /> : <span className="h-2 w-2 rounded-full bg-current" />}
                        </div>
                        <p className="mt-2 text-sm font-semibold leading-5 text-[#243d56]">{step.label}</p>
                        <p className="mt-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#8294aa]">{formatStatusLabel(step.state)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            </section>
          ) : null}

          {sellerWorkspaceTab === 'seller' ? (
            <section className="grid gap-5 xl:grid-cols-2">
              {sellerOnboardingSections.map((section) => (
                <article key={section.title} className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
                  <h3 className="text-base font-semibold text-[#142132]">{section.title}</h3>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {section.rows.map((row) => (
                      <FieldDisplay key={`${section.title}-${row.label}`} label={row.label} value={row.value} />
                    ))}
                  </div>
                </article>
              ))}
            </section>
          ) : null}

          {sellerWorkspaceTab === 'documents' ? (
            <article className="overflow-hidden rounded-[24px] border border-[#dde4ee] bg-white shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] table-fixed text-left text-sm">
                  <thead className="bg-[#f8fbfd] text-[0.66rem] uppercase tracking-[0.1em] text-[#7b8ca2]">
                    <tr className="border-b border-[#e5edf6]">
                      <th className="w-[34%] px-5 py-3">Document</th>
                      <th className="w-[18%] px-5 py-3">Source</th>
                      <th className="w-[16%] px-5 py-3">Status</th>
                      <th className="w-[18%] px-5 py-3">Uploaded On</th>
                      <th className="w-[14%] px-5 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf2f7]">
                    {sellerDocumentTrackerRows.map((doc) => (
                      <tr key={doc.key} className="text-[#425970] transition hover:bg-[#fbfdff]">
                        <td className="px-5 py-4">
                          <p className="truncate font-semibold text-[#243d56]" title={doc.label}>{doc.label}</p>
                          <p className="mt-1 text-xs text-[#74879d]">{doc.required ? 'Required seller document' : 'Optional seller document'}</p>
                        </td>
                        <td className="px-5 py-4 text-sm text-[#607387]">{doc.uploaded ? 'Seller portal / linked document' : 'Requirement checklist'}</td>
                        <td className="px-5 py-4"><StatusPill status={doc.uploaded ? 'uploaded' : 'missing'} label={doc.uploaded ? 'Uploaded' : 'Missing'} /></td>
                        <td className="px-5 py-4">{doc.uploadedOn ? formatDate(doc.uploadedOn) : '—'}</td>
                        <td className="px-5 py-4 text-right">
                          {doc.url ? (
                            <a href={doc.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-[#1f4f78]">
                              <ExternalLink size={14} />
                              Download
                            </a>
                          ) : (
                            <span className="text-xs text-[#9aa9b8]">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ) : null}

          {sellerWorkspaceTab === 'commission' ? (
            <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
              {commissionWorkspace.hasData ? (
                <>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <FieldDisplay label="Commission Percentage" value={commissionWorkspace.percentage ? `${commissionWorkspace.percentage}%` : 'Not captured'} />
                    <FieldDisplay label="Commission Amount" value={commissionWorkspace.amount ? formatMoneyValue(commissionWorkspace.amount) : commissionWorkspace.estimatedExVat ? formatMoneyValue(commissionWorkspace.estimatedExVat) : 'Not captured'} />
                    <FieldDisplay label="VAT Handling" value={commissionWorkspace.vatHandling} />
                    <FieldDisplay label="Mandate Terms" value={commissionWorkspace.mandateTerms} />
                    <FieldDisplay label="Payment Responsibility" value={commissionWorkspace.paymentResponsibility} />
                    <FieldDisplay label="Last Updated Source" value={commissionWorkspace.lastUpdatedSource} />
                  </div>
                  <div className="mt-4 rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                    <p className="text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Notes or Special Conditions</p>
                    <p className="mt-2 text-sm leading-6 text-[#607387]">{commissionWorkspace.notes || 'No notes captured.'}</p>
                  </div>
                </>
              ) : (
                <div className="flex flex-col gap-4 rounded-[18px] border border-dashed border-[#d3deea] bg-[#fbfcfe] p-6 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-[#142132]">No commission structure captured yet.</h3>
                    <p className="mt-1 text-sm text-[#607387]">Commission can be captured from onboarding, mandate terms, or the listing record.</p>
                  </div>
                  <Button variant="secondary" onClick={() => setActiveTab('property_details')}>Capture Commission Details</Button>
                </div>
              )}
            </article>
          ) : null}

          {sellerWorkspaceTab === 'activity' ? (
            <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
              <div className="space-y-3">
                {mandateActivityItems.length ? mandateActivityItems.map((item) => {
                  const Icon = item.icon || FolderKanban
                  return (
                    <div key={`${item.title}-${item.timestamp}`} className="flex gap-3 rounded-[16px] border border-[#e5edf6] bg-[#fbfdff] px-4 py-3">
                      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[11px] bg-[#eaf3fb] text-[#1f4f78]">
                        <Icon size={15} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#243d56]">{item.title}</p>
                        <p className="mt-0.5 text-sm text-[#607387]">{item.copy}</p>
                        <p className="mt-1 text-xs text-[#91a2b5]">{formatDate(item.timestamp)}</p>
                      </div>
                    </div>
                  )
                }) : (
                  <div className="rounded-[16px] border border-dashed border-[#d3deea] bg-[#fbfcfe] p-5 text-sm text-[#6b7d93]">
                    No activity has been recorded for this mandate workspace yet.
                  </div>
                )}
              </div>
            </article>
          ) : null}
        </section>
      ) : null}

      {activeTab === 'documents' ? (
        <section className="space-y-5">
          {sellerReadinessSummary ? (
            <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <h3 className="text-[1rem] font-semibold text-[#142132]">Seller Requirement Summary</h3>
              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <MetricCard label="Completion" value={`${sellerReadinessSummary.requirementCompletionPct}%`} meta="Dynamic seller requirement progress" />
                <MetricCard label="Missing" value={sellerReadinessSummary.missingRequirementsCount} meta="Outstanding requirement count" />
                <MetricCard label="Mandate Ready" value={sellerReadinessSummary.mandateReady ? 'Yes' : 'No'} meta="Based on onboarding + mandate inputs" />
                <MetricCard label="Active Ready" value={sellerReadinessSummary.activeReady ? 'Yes' : 'No'} meta="Ready for activation checks" />
              </div>
              {sellerReadinessSummary.blockedBy?.length ? (
                <div className="mt-4 rounded-[14px] border border-[#f3d9b0] bg-[#fff9ee] px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#8f5c18]">Readiness Blockers</p>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-[#8f5c18]">
                    {sellerReadinessSummary.blockedBy.slice(0, 5).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="grid gap-5 xl:grid-cols-3">
          {[
            { title: 'Property Documents', icon: Building2, rows: propertyDocuments },
            { title: 'Seller Documents', icon: ShieldCheck, rows: sellerDocuments },
            { title: 'Buyer Documents', icon: FileText, rows: buyerDocuments },
          ].map((group) => (
            <section key={group.title} className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <div className="flex items-center gap-3">
                <div className="rounded-[14px] border border-[#dce6f2] bg-[#f7fbff] p-2 text-[#1f4f78]">
                  <group.icon size={18} />
                </div>
                <div>
                  <h3 className="text-[1rem] font-semibold text-[#142132]">{group.title}</h3>
                  <p className="text-sm text-[#607387]">{group.rows.length} item{group.rows.length === 1 ? '' : 's'}</p>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {group.rows.length ? (
                  group.rows.map((doc) => (
                    <article key={doc.key || doc.requirement_key} className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[#22374d]">{doc.label || doc.requirement_name}</p>
                          <p className="mt-1 text-xs text-[#6b7d93]">{doc.fileName || 'No file linked yet'}</p>
                          {doc.requirement_description ? (
                            <p className="mt-1 text-xs text-[#6b7d93]">{doc.requirement_description}</p>
                          ) : null}
                        </div>
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${statusClass(doc.status)}`}>
                          {formatStatusLabel(doc.status)}
                        </span>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="rounded-[16px] border border-dashed border-[#d3deea] bg-[#fbfcfe] p-4 text-sm text-[#6b7d93]">
                    No documents in this group yet.
                  </div>
                )}
              </div>
            </section>
          ))}
          </section>
        </section>
      ) : null}

      {activeTab === 'role_players' ? (
        <section className="grid gap-5 xl:grid-cols-[1fr_0.8fr]">
          <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
            <h3 className="text-[1.05rem] font-semibold text-[#142132]">Assign Deal Role Players</h3>
            <p className="mt-1 text-sm text-[#607387]">Choose the downstream attorney and preferred bond originator for when this listing converts into a live transaction.</p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-[#2d445e]">Attorney</span>
                <Field as="select" value={rolePlayersDraft.attorney} onChange={(event) => setRolePlayersDraft((prev) => ({ ...prev, attorney: event.target.value }))}>
                  {ATTORNEY_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </Field>
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-[#2d445e]">Preferred Bond Originator</span>
                <Field as="select" value={rolePlayersDraft.bondOriginator} onChange={(event) => setRolePlayersDraft((prev) => ({ ...prev, bondOriginator: event.target.value }))}>
                  {BOND_ORIGINATOR_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </Field>
              </label>
            </div>
            <div className="mt-5 flex justify-end">
              <Button onClick={saveRolePlayers}>Save Role Players</Button>
            </div>
          </section>

          <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
            <h3 className="text-[1rem] font-semibold text-[#142132]">Current Assignment State</h3>
            <div className="mt-4 space-y-3">
              <article className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-[14px] border border-[#dce6f2] bg-white p-2 text-[#1f4f78]"><FolderKanban size={18} /></div>
                  <div>
                    <p className="text-sm font-semibold text-[#22374d]">{rolePlayersDraft.attorney}</p>
                    <p className="text-sm text-[#607387]">Transfer / legal delivery</p>
                  </div>
                </div>
              </article>
              <article className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-[14px] border border-[#dce6f2] bg-white p-2 text-[#1f4f78]"><HandCoins size={18} /></div>
                  <div>
                    <p className="text-sm font-semibold text-[#22374d]">{rolePlayersDraft.bondOriginator}</p>
                    <p className="text-sm text-[#607387]">Finance workflow partner</p>
                  </div>
                </div>
              </article>
              <div className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4 text-sm leading-6 text-[#607387]">
                When this listing progresses to a formal deal, these role players become the default participants for transaction workflow access.
              </div>
            </div>
          </section>
        </section>
      ) : null}
    </section>
  )
}

export default AgentListingDetail
