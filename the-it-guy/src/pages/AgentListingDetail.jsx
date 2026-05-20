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
  TrendingUp,
  Upload,
  UserRound,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import Field from '../components/ui/Field'
import {
  getListingReadinessSummary,
  getRequiredSellerDocuments,
  getSellerRequirementProfile,
} from '../lib/privateListingRequirementEngine'
import {
  generateId,
  readAgentPrivateListings,
  writeAgentPrivateListings,
} from '../lib/agentListingStorage'
import {
  completeViewingRequest,
  createViewingRequest,
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
  getOfferSummaryCards,
  markOfferAgentAction,
  normalizeOfferWorkflowStatus,
  OFFER_WORKFLOW_STATUS,
} from '../lib/listingOffersService'
import { invokeEdgeFunction, isSupabaseConfigured } from '../lib/supabaseClient'
import {
  getPrivateListing,
  updatePrivateListing,
  updatePrivateListingOnboardingFormData,
  uploadPrivateListingMediaAsset,
} from '../services/privateListingService'
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
  if (key === 'uploaded' || key === 'under_review' || key === 'reviewed' || key === 'in_progress') {
    return 'border-[#d8e6f6] bg-[#f3f8fd] text-[#2c5a89]'
  }
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

function readPipelineLeads() {
  if (typeof window === 'undefined') return []
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
  const listingId = decodeURIComponent(String(encodedListingId || ''))

  const [activeTab, setActiveTab] = useState('overview')
  const [privateListings, setPrivateListings] = useState([])
  const [pipelineLeads, setPipelineLeads] = useState([])
  const [loading, setLoading] = useState(true)
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
  const [detailMessage, setDetailMessage] = useState('')
  const [detailError, setDetailError] = useState('')
  const [gallerySaving, setGallerySaving] = useState(false)
  const [showFullGallery, setShowFullGallery] = useState(false)
  const [offerNotesDraftById, setOfferNotesDraftById] = useState({})
  const [marketingDraft, setMarketingDraft] = useState(() => buildPropertyDraft(null))
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

  useEffect(() => {
    if (!listingId) return undefined
    const refreshViewings = () => setViewings(getViewingRequestsForListing(listingId))
    refreshViewings()
    window.addEventListener('itg:viewings-updated', refreshViewings)
    return () => window.removeEventListener('itg:viewings-updated', refreshViewings)
  }, [listingId])

  const listingRecord = useMemo(() => {
    return privateListings.find((item) => String(item.id) === listingId) || null
  }, [listingId, privateListings])

  useEffect(() => {
    if (!listingRecord) return
    setMarketingDraft(buildPropertyDraft(listingRecord))
    setRolePlayersDraft({
      attorney: String(listingRecord?.rolePlayers?.attorney || 'Bridge Conveyancing').trim(),
      bondOriginator: String(listingRecord?.rolePlayers?.bondOriginator || 'Bridge Finance').trim(),
    })
  }, [listingRecord])

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
      const { invite, link } = createOfferInvite({
        listingId: listingRecord.id,
        buyerLeadId: selectedLead.id,
        buyerLeadName: selectedLead.name || '',
        agentId: String(listingRecord?.agentId || listingRecord?.assignedAgentEmail || '').trim(),
        agentName: String(listingRecord?.assignedAgentName || listingRecord?.assignedAgent || 'Assigned Agent').trim(),
        agentEmail: String(listingRecord?.assignedAgentEmail || '').trim(),
        agencyName: String(listingRecord?.agencyOrganisation || '').trim(),
        sellerToken: String(listingRecord?.sellerOnboarding?.token || '').trim(),
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

  const offerRows = useMemo(() => {
    if (!listingRecord?.id) return []
    return getOffersForListing(listingRecord.id).map((record) => ({
      ...record,
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

  const offerInviteRows = useMemo(() => {
    if (!listingRecord?.id) return []
    return getOfferInvitesForListing(listingRecord.id)
  }, [listingRecord?.id, offersRefreshTick])

  const offerSummary = useMemo(() => {
    if (!listingRecord?.id) {
      return { total: 0, submitted: 0, sellerReview: 0, accepted: 0, countered: 0, highest: 0 }
    }
    return getOfferSummaryCards(listingRecord.id)
  }, [listingRecord?.id, offersRefreshTick])

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
        '',
    ).trim()
    const viewUrl = String(
      mandate?.url ||
        mandate?.documentUrl ||
        listingRecord?.mandateUrl ||
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
      isSigned: ['signed', 'completed', 'uploaded_signed', 'mandate_signed'].includes(status) || Boolean(signedDate || signedUrl),
      isExpired: daysUntilExpiry !== null && daysUntilExpiry < 0,
    }
  }, [listingRecord, marketingDraft.expiryDate, marketingDraft.mandateSignedDate])

  const sellerDocumentTrackerRows = useMemo(() => {
    const sourceDocs = Array.isArray(sellerDocuments) ? sellerDocuments : []
    const suggested = [
      { key: 'id_document', label: 'ID Document', match: /id|identity|seller/i },
      { key: 'proof_of_address', label: 'Proof of Address', match: /address|residence/i },
      { key: 'title_deed', label: 'Title Deed / Reference', match: /title|deed/i },
      { key: 'rates_account', label: 'Rates Account', match: /rates/i },
      { key: 'fica_documents', label: 'FICA Documents', match: /fica/i },
      { key: 'mandate_signed', label: 'Mandate Signed', match: /mandate/i },
    ]
    return suggested.map((item) => {
      const doc = sourceDocs.find((row) => item.match.test(`${row?.key || ''} ${row?.requirement_key || ''} ${row?.label || ''} ${row?.requirement_name || ''}`))
      const status = String(doc?.status || '').trim().toLowerCase()
      const hasUpload = Boolean(doc?.fileName || doc?.file_name || doc?.uploadedAt || doc?.uploaded_at || doc?.url || doc?.fileUrl)
      return {
        ...item,
        required: doc?.is_required !== false,
        uploaded: hasUpload,
        status: doc ? (hasUpload && !status ? 'uploaded' : status || 'missing') : 'missing',
        uploadedOn: doc?.uploadedAt || doc?.uploaded_at || doc?.createdAt || '',
        fileName: doc?.fileName || doc?.file_name || '',
        url: doc?.url || doc?.fileUrl || doc?.signedUrl || '',
      }
    })
  }, [sellerDocuments])

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

  const sellerAttentionItems = useMemo(() => {
    const missingDocs = sellerDocumentTrackerRows
      .filter((doc) => !['uploaded', 'complete', 'approved'].includes(String(doc.status || '').toLowerCase()))
      .map((doc) => `${doc.label} missing`)
    const blockers = Array.isArray(sellerReadinessSummary?.blockedBy) ? sellerReadinessSummary.blockedBy : []
    const commission = listingRecord?.commission || {}
    return [
      ...blockers,
      ...missingDocs,
      mandateWorkspace.isSigned ? '' : 'Mandate unsigned',
      (commission.commission_percentage || commission.commission_amount) ? '' : 'Commission incomplete',
      ['active', 'published'].includes(String(marketingDraft.listingStatus || listingRecord?.status || '').toLowerCase()) ? '' : 'Listing not published',
    ].filter(Boolean).slice(0, 7)
  }, [listingRecord?.commission, listingRecord?.status, mandateWorkspace.isSigned, marketingDraft.listingStatus, sellerDocumentTrackerRows, sellerReadinessSummary?.blockedBy])

  const commissionWorkspace = useMemo(() => {
    const commission = listingRecord?.commission || {}
    const percentage = Number(commission?.commission_percentage || commission?.percentage || 0) || 0
    const amount = Number(commission?.commission_amount || 0) || 0
    const price = Number(marketingDraft.price || listingRecord?.askingPrice || 0) || 0
    const estimatedExVat = amount || (price && percentage ? (price * percentage) / 100 : 0)
    const vatIncluded = String(commission?.vat || commission?.vat_handling || '').toLowerCase().includes('incl')
    const estimatedInclVat = vatIncluded ? estimatedExVat : estimatedExVat ? estimatedExVat * 1.15 : 0
    return {
      type: listingRecord?.mandateType || listingRecord?.mandate?.type || 'sole',
      percentage,
      amount,
      estimatedInclVat,
      vatIncluded,
      split: commission?.commission_split || commission?.split || 'Not captured',
      coAgentSplit: commission?.co_agent_split || commission?.coAgentSplit || 'Not captured',
      referralSplit: commission?.referral_split || commission?.referralSplit || 'Not captured',
      notes: commission?.commission_notes || commission?.notes || '',
    }
  }, [listingRecord, marketingDraft.price])

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

  function submitViewingRequest(event) {
    event.preventDefault()
    if (!listingRecord || !viewingForm.buyerLeadId || !viewingForm.proposedDate || !viewingForm.proposedTime) return
    const lead = listingLeads.find((item) => String(item?.id || '') === String(viewingForm.buyerLeadId))
    createViewingRequest({
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
    })
    setViewingForm({
      buyerLeadId: '',
      proposedDate: '',
      proposedTime: '',
      alternativeTimeA: '',
      alternativeTimeB: '',
      notes: '',
    })
    setShowViewingForm(false)
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
                offerRows.map((offer) => (
                  <article key={offer.id} className="rounded-[18px] border border-[#dce6f2] bg-white p-4 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-[1rem] font-semibold text-[#22374d]">{offer.buyerName || 'Buyer pending'}</p>
                        <p className="mt-1 text-sm text-[#607387]">{formatCurrency(offer.offerPrice)} • {offer.conditions || 'Conditions not set'}</p>
                        <p className="mt-1 text-xs text-[#6b7d93]">
                          Offer date: {formatDate(offer.offerDate)} • Expiry: {formatDate(offer.expiryDate)}
                        </p>
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
                    ].includes(normalizeOfferWorkflowStatus(offer.status)) ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button size="sm" type="button" onClick={() => handleOfferAction(offer.id, 'forward_to_seller')}>Forward to Seller</Button>
                        <Button size="sm" variant="secondary" type="button" onClick={() => handleOfferAction(offer.id, 'request_clarification')}>Request Clarification</Button>
                        <Button size="sm" variant="secondary" type="button" onClick={() => handleOfferAction(offer.id, 'reject_invalid')}>Reject Invalid</Button>
                      </div>
                    ) : null}
                  </article>
                ))
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
        <section className="space-y-5">
          <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() => navigate('/listings')}
                  className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#5f7894] hover:text-[#1f4f78]"
                >
                  <ArrowLeft size={13} />
                  Back to Listings
                </button>
                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">Mandate Workspace</p>
                <h3 className="mt-1 text-2xl font-semibold tracking-[-0.035em] text-[#142132]">{listingRecord.listingTitle}</h3>
                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-5">
                  {[
                    ['Listing ID', marketingDraft.listingCode || listingRecord.listingReference || listingRecord.id],
                    ['Property Type', marketingDraft.propertyType || listingRecord.propertyType || 'Pending'],
                    ['Pipeline Value', formatCurrency(marketingDraft.price || listingRecord.askingPrice)],
                    ['Assigned Agent', listingRecord.assignedAgentName || listingRecord.assignedAgent || listingRecord.assignedAgentEmail || 'Unassigned'],
                    ['Location', [marketingDraft.suburb, marketingDraft.city].filter(Boolean).join(', ') || 'Location pending'],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-[14px] border border-[#e5edf6] bg-[#fbfdff] px-3 py-2.5">
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#8294aa]">{label}</p>
                      <p className="mt-1 truncate font-semibold text-[#243d56]" title={String(value)}>{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <aside className="w-full rounded-[20px] border border-[#dfe8f2] bg-[#f8fbff] p-4 xl:max-w-[360px]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Mandate Status</p>
                    <span className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                      mandateWorkspace.isSigned
                        ? 'border-[#cde8d6] bg-[#eef9f2] text-[#237345]'
                        : mandateWorkspace.isExpired
                          ? 'border-[#f2c9c3] bg-[#fff2f0] text-[#a33a2d]'
                          : 'border-[#f4d7ab] bg-[#fff7ea] text-[#9a5b13]'
                    }`}>
                      {mandateWorkspace.label}
                    </span>
                  </div>
                  <FileText className="h-5 w-5 text-[#41627f]" />
                </div>
                <div className="mt-4 grid gap-2 text-xs">
                  <SnapshotRow label="Signed Date" value={formatDate(mandateWorkspace.signedDate)} />
                  <SnapshotRow label="Expiry Date" value={formatDate(mandateWorkspace.expiryDate)} />
                  <SnapshotRow
                    label="Days Until Expiry"
                    value={
                      mandateWorkspace.daysUntilExpiry === null
                        ? 'Not captured'
                        : mandateWorkspace.daysUntilExpiry < 0
                          ? `${Math.abs(mandateWorkspace.daysUntilExpiry)} days expired`
                          : `${mandateWorkspace.daysUntilExpiry} days`
                    }
                  />
                  <SnapshotRow label="Last Updated" value={formatDate(mandateWorkspace.lastUpdated)} />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {mandateWorkspace.signedUrl ? (
                    <a href={mandateWorkspace.signedUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center justify-center rounded-xl bg-[#123955] px-3 text-xs font-semibold text-white shadow-[0_10px_22px_rgba(18,57,85,0.18)]">
                      Download Signed Mandate
                    </a>
                  ) : (
                    <Button size="sm" disabled title="No signed mandate file is linked yet.">Download Signed Mandate</Button>
                  )}
                  {mandateWorkspace.viewUrl ? (
                    <a href={mandateWorkspace.viewUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center justify-center rounded-xl border border-[#dbe6f2] bg-white px-3 text-xs font-semibold text-[#2f4862]">
                      View Mandate
                    </a>
                  ) : (
                    <Button size="sm" variant="secondary" disabled>View Mandate</Button>
                  )}
                  <Button size="sm" variant="secondary" disabled title="Resend is available from the mandate generation workflow.">Resend to Seller</Button>
                  <Button size="sm" variant="secondary" disabled title="Regeneration is available from the mandate generation workflow.">Regenerate Mandate</Button>
                  <Button size="sm" variant="secondary" disabled>More actions</Button>
                </div>
              </aside>
            </div>
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-5">
              <section className="grid gap-5 lg:grid-cols-2">
                <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                  <div className="flex items-start gap-4">
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#eaf3fb] text-[#1f4f78]">
                      <UserRound size={20} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-lg font-semibold text-[#142132]">{listingRecord?.seller?.name || 'Seller pending'}</h4>
                        <span className="rounded-full border border-[#dbe6f2] bg-[#f7fbff] px-2.5 py-1 text-[0.7rem] font-semibold text-[#35546c]">Primary Seller</span>
                      </div>
                      <p className="mt-1 text-sm text-[#607387]">{listingRecord?.seller?.email || 'Email pending'} · {listingRecord?.seller?.phone || 'Phone pending'}</p>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {[
                      ['Seller Type', listingRecord?.seller?.sellerType || listingRecord?.seller?.type || 'Individual'],
                      ['ID / Registration', listingRecord?.seller?.idNumber || listingRecord?.seller?.companyNumber || listingRecord?.seller?.trustNumber || 'Not captured'],
                      ['FICA Status', sellerDocumentTrackerRows.some((doc) => doc.key === 'fica_documents' && ['uploaded', 'complete', 'approved'].includes(doc.status)) ? 'In progress' : 'Missing'],
                      ['Address / Suburb', listingRecord?.seller?.address || marketingDraft.suburb || 'Not captured'],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-[14px] border border-[#e5edf6] bg-[#fbfdff] px-3 py-2.5">
                        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#8294aa]">{label}</p>
                        <p className="mt-1 text-sm font-semibold text-[#243d56]">{value}</p>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                  <h4 className="text-lg font-semibold text-[#142132]">Seller Onboarding Timeline</h4>
                  <div className="mt-5 space-y-3">
                    {[
                      ['Contacted', true, listingRecord.createdAt],
                      ['Appointment', viewings.length > 0, viewings[0]?.proposed_date || viewings[0]?.created_at],
                      ['Valuation', Boolean(marketingDraft.price || listingRecord.askingPrice), listingRecord.updatedAt],
                      ['Mandate Sent', ['sent', 'sent_for_signature', 'viewed', 'signed', 'completed'].includes(mandateWorkspace.status), listingRecord?.mandate?.sentAt],
                      ['Mandate Signed', mandateWorkspace.isSigned, mandateWorkspace.signedDate],
                      ['Listing Ready', sellerReadinessPercent >= 85, marketingDraft.listingDate],
                    ].map(([label, done, date], index) => (
                      <div key={label} className="flex items-center gap-3">
                        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border text-xs font-semibold ${
                          done ? 'border-[#cde8d6] bg-[#eef9f2] text-[#237345]' : 'border-[#dbe6f2] bg-[#f7fbff] text-[#7b8ca2]'
                        }`}>
                          {done ? <CheckCircle2 size={15} /> : index + 1}
                        </span>
                        <div className="min-w-0 flex-1 border-b border-[#edf2f7] py-2">
                          <p className="text-sm font-semibold text-[#243d56]">{label}</p>
                          <p className="text-xs text-[#74879d]">{done ? formatDate(date) : 'Pending'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 rounded-[14px] bg-[#f7fbff] px-3 py-2 text-sm text-[#607387]">
                    {onboardingStatusLabel === 'Completed' ? 'Seller onboarding completed.' : 'Seller onboarding still has outstanding readiness items.'}
                  </p>
                </article>
              </section>

              <section className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
                <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="text-lg font-semibold text-[#142132]">Seller Document Tracker</h4>
                      <p className="mt-1 text-sm text-[#607387]">Readiness state from existing seller document requirements.</p>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => setActiveTab('documents')}>
                      <Upload size={14} />
                      Upload Documents
                    </Button>
                  </div>
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[720px] text-left text-sm">
                      <thead className="text-[0.68rem] uppercase tracking-[0.1em] text-[#7b8ca2]">
                        <tr className="border-b border-[#e5edf6]">
                          <th className="py-2 pr-3">Document</th>
                          <th className="py-2 pr-3">Required</th>
                          <th className="py-2 pr-3">Uploaded by Seller</th>
                          <th className="py-2 pr-3">Status</th>
                          <th className="py-2 pr-3">Uploaded On</th>
                          <th className="py-2 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#edf2f7]">
                        {sellerDocumentTrackerRows.map((doc) => (
                          <tr key={doc.key} className="text-[#425970]">
                            <td className="py-3 pr-3 font-semibold text-[#243d56]">{doc.label}</td>
                            <td className="py-3 pr-3">{doc.required ? 'Yes' : 'No'}</td>
                            <td className="py-3 pr-3">{doc.uploaded ? 'Yes' : 'No'}</td>
                            <td className="py-3 pr-3">
                              <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${statusClass(doc.status)}`}>
                                {formatStatusLabel(doc.status)}
                              </span>
                            </td>
                            <td className="py-3 pr-3">{doc.uploadedOn ? formatDate(doc.uploadedOn) : '—'}</td>
                            <td className="py-3 text-right">
                              {doc.url ? (
                                <a href={doc.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-[#1f4f78]">
                                  <ExternalLink size={13} />
                                  Open
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

                <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                  <h4 className="text-lg font-semibold text-[#142132]">Commission Structure</h4>
                  <div className="mt-4 grid gap-3">
                    <SnapshotRow label="Mandate Type" value={formatStatusLabel(commissionWorkspace.type)} />
                    <SnapshotRow label="Commission excl. VAT" value={commissionWorkspace.percentage ? `${commissionWorkspace.percentage}%` : formatMoneyValue(commissionWorkspace.amount)} />
                    <SnapshotRow label="VAT" value={commissionWorkspace.vatIncluded ? 'Included' : 'Excluded / not captured'} />
                    <SnapshotRow label="Total Commission %" value={commissionWorkspace.percentage ? `${commissionWorkspace.percentage}%` : 'Not captured'} />
                    <SnapshotRow label="Commission Split" value={commissionWorkspace.split} />
                    <SnapshotRow label="Co-agent Split" value={commissionWorkspace.coAgentSplit} />
                    <SnapshotRow label="Referral Split" value={commissionWorkspace.referralSplit} />
                  </div>
                  <div className="mt-4 rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                    <p className="text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Estimated Commission Incl. VAT</p>
                    <p className="mt-2 text-xl font-semibold text-[#142132]">{commissionWorkspace.estimatedInclVat ? formatMoneyValue(commissionWorkspace.estimatedInclVat) : 'Not available'}</p>
                    <p className="mt-2 text-sm leading-6 text-[#607387]">{commissionWorkspace.notes || 'No special commission notes captured.'}</p>
                  </div>
                </article>
              </section>

              <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-lg font-semibold text-[#142132]">Recent Activity</h4>
                    <p className="mt-1 text-sm text-[#607387]">Latest mandate, seller, document, and listing movement.</p>
                  </div>
                  <span className="rounded-full bg-[#eef5fb] px-2.5 py-1 text-xs font-semibold text-[#315b7a]">{activityItems.length}</span>
                </div>
                <div className="mt-4 space-y-3">
                  {activityItems.length ? activityItems.map((item) => (
                    <div key={`${item.title}-${item.timestamp}`} className="flex gap-3 rounded-[16px] border border-[#e5edf6] bg-[#fbfdff] px-4 py-3">
                      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#eaf3fb] text-[#1f4f78]">
                        <FolderKanban size={15} />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-[#243d56]">{item.title}</p>
                        <p className="mt-0.5 text-sm text-[#607387]">{item.copy}</p>
                        <p className="mt-1 text-xs text-[#91a2b5]">{formatDate(item.timestamp)}</p>
                      </div>
                    </div>
                  )) : (
                    <div className="rounded-[16px] border border-dashed border-[#d3deea] bg-[#fbfcfe] p-5 text-sm text-[#6b7d93]">
                      No recent activity yet.
                    </div>
                  )}
                </div>
              </article>
            </div>

            <aside className="space-y-5">
              <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Listing Readiness</p>
                <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#142132]">{sellerReadinessPercent}%</p>
                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[#e5edf6]">
                  <span className="block h-full rounded-full bg-[#1f6f9f]" style={{ width: `${sellerReadinessPercent}%` }} />
                </div>
                <div className="mt-4 space-y-2">
                  {sellerReadinessChecklist.map((item) => (
                    <div key={item.key} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-[#52687f]">{item.label}</span>
                      <CompletionBadge complete={item.complete} label={item.complete ? 'Done' : 'Missing'} />
                    </div>
                  ))}
                </div>
              </article>

              <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Attention Required</p>
                <div className="mt-3 space-y-2">
                  {sellerAttentionItems.length ? sellerAttentionItems.map((item) => (
                    <div key={item} className="rounded-[14px] border border-[#f2dfbf] bg-[#fff8ec] px-3 py-2 text-sm font-semibold text-[#8a5b1f]">
                      {item}
                    </div>
                  )) : (
                    <div className="rounded-[14px] border border-[#d8eddf] bg-[#ecfaf1] px-3 py-2 text-sm font-semibold text-[#1f7d44]">
                      No major blockers detected.
                    </div>
                  )}
                </div>
              </article>

              <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Quick Actions</p>
                <div className="mt-3 grid gap-2">
                  {listingRecord?.sellerOnboarding?.link ? (
                    <a href={listingRecord.sellerOnboarding.link} target="_blank" rel="noreferrer" className="inline-flex items-center justify-between rounded-[14px] border border-[#dbe6f2] bg-white px-3 py-2 text-sm font-semibold text-[#2f4862]">
                      Open Seller Onboarding
                      <ExternalLink size={14} />
                    </a>
                  ) : null}
                  <Button variant="secondary" onClick={() => setActiveTab('documents')}>Upload Document</Button>
                  <Button variant="secondary" onClick={() => setActiveTab('overview')}>View Listing</Button>
                  <Button variant="secondary" onClick={() => setActiveTab('property_details')}>Edit Commission</Button>
                </div>
              </article>

              <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Important Dates</p>
                <div className="mt-3">
                  <SnapshotRow label="Mandate Signed" value={formatDate(mandateWorkspace.signedDate)} />
                  <SnapshotRow label="Mandate Expiry" value={formatDate(mandateWorkspace.expiryDate)} />
                  <SnapshotRow label="Listing Target" value={formatDate(marketingDraft.listingDate)} />
                  <SnapshotRow label="Last Seller Update" value={formatDate(listingRecord?.sellerOnboarding?.updatedAt || listingRecord?.updatedAt)} />
                  <SnapshotRow
                    label="Last Document Upload"
                    value={formatDate(sellerDocumentTrackerRows.find((doc) => doc.uploadedOn)?.uploadedOn)}
                  />
                </div>
              </article>
            </aside>
          </section>
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
