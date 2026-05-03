import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  FileText,
  FolderKanban,
  HandCoins,
  ImagePlus,
  MapPin,
  Plus,
  ShieldCheck,
  TrendingUp,
  Upload,
  UserRound,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import Field from '../components/ui/Field'
import {
  generateId,
  OFFER_STATUS,
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
const LISTING_STATUS_OPTIONS = ['draft', 'active', 'sold']
const FEATURE_OPTIONS = ['Solar', 'Backup Water', 'Pool', 'Pet Friendly', 'Security', 'Garden', 'Fibre']

function formatCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return 'Price on request'
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDate(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleDateString('en-ZA')
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

function getDerivedMarketingStatus(listing) {
  return String(listing?.marketing?.status || listing?.marketing?.marketingStatus || '').trim().toLowerCase() || 'draft'
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
  const storedGallery = Array.isArray(marketing?.imageGallery) ? marketing.imageGallery : []
  const fallbackGallery = marketing?.mediaUrl
    ? [
        {
          id: 'cover-image',
          name: 'Cover image',
          url: String(marketing.mediaUrl).trim(),
        },
      ]
    : []
  const galleryImages = (storedGallery.length ? storedGallery : fallbackGallery).filter((item) => item?.url)
  const coverImageId =
    String(marketing?.coverImageId || propertyDetails?.coverImageId || '').trim() ||
    String(galleryImages[0]?.id || '').trim()

  return {
    listingCode: String(listingRecord?.listingCode || '').trim(),
    headline: String(propertyDetails?.headline || listingRecord?.listingTitle || '').trim(),
    propertyType: String(propertyDetails?.propertyType || listingRecord?.propertyType || 'House').trim(),
    listingStatus: String(propertyDetails?.listingStatus || listingRecord?.status || 'active').trim().toLowerCase(),
    source: String(marketing?.source || '').trim(),
    addressLine1: String(propertyDetails?.addressLine1 || listingRecord?.addressLine1 || '').trim(),
    suburb: String(propertyDetails?.suburb || listingRecord?.suburb || '').trim(),
    city: String(propertyDetails?.city || listingRecord?.city || '').trim(),
    province: String(propertyDetails?.province || listingRecord?.province || '').trim(),
    bedrooms: String(propertyDetails?.bedrooms || '').trim(),
    bathrooms: String(propertyDetails?.bathrooms || '').trim(),
    garages: String(propertyDetails?.garages || '').trim(),
    coveredParking: String(propertyDetails?.coveredParking || '').trim(),
    openParking: String(propertyDetails?.openParking || '').trim(),
    erfSize: String(propertyDetails?.erfSize || '').trim(),
    floorSize: String(propertyDetails?.floorSize || '').trim(),
    price: String(propertyDetails?.price || listingRecord?.askingPrice || '').trim(),
    levies: String(propertyDetails?.levies || '').trim(),
    leviesNotApplicable: Boolean(propertyDetails?.leviesNotApplicable),
    ratesTaxes: String(propertyDetails?.ratesTaxes || '').trim(),
    ratesTaxesNotApplicable: Boolean(propertyDetails?.ratesTaxesNotApplicable),
    selectedFeatures: Array.isArray(propertyDetails?.selectedFeatures)
      ? propertyDetails.selectedFeatures
      : String(marketing?.features || '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
    description: String(propertyDetails?.description || marketing?.description || '').trim(),
    notes: String(propertyDetails?.notes || marketing?.notes || '').trim(),
    galleryImages,
    coverImageId,
    floorplans: Array.isArray(propertyDetails?.floorplans)
      ? propertyDetails.floorplans
      : Array.isArray(marketing?.floorplans)
        ? marketing.floorplans
        : [],
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
  const [showOfferForm, setShowOfferForm] = useState(false)
  const [offerForm, setOfferForm] = useState({
    buyerName: '',
    offerPrice: '',
    conditions: '',
    supportingDocsUrl: '',
  })
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

  useEffect(() => {
    setLoading(true)
    setPrivateListings(readAgentPrivateListings())
    setPipelineLeads(readPipelineLeads())
    setLoading(false)
  }, [])

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

  function saveMarketingDraft() {
    const selectedCover = marketingDraft.galleryImages.find((image) => String(image?.id) === String(marketingDraft.coverImageId)) || marketingDraft.galleryImages[0] || null
    patchListing((row) => ({
      ...row,
      listingCode: marketingDraft.listingCode || row?.listingCode || '',
      listingTitle: marketingDraft.headline.trim() || row?.listingTitle || '',
      propertyType: marketingDraft.propertyType || row?.propertyType || 'House',
      status: marketingDraft.listingStatus || row?.status || 'active',
      addressLine1: marketingDraft.addressLine1.trim(),
      suburb: marketingDraft.suburb.trim(),
      city: marketingDraft.city.trim(),
      province: marketingDraft.province.trim(),
      askingPrice: Number(marketingDraft.price || 0),
      marketing: {
        ...(row?.marketing || {}),
        mediaUrl: selectedCover?.url || '',
        source: marketingDraft.source,
        status: marketingDraft.listingStatus,
        description: marketingDraft.description,
        features: marketingDraft.selectedFeatures.join(', '),
        notes: marketingDraft.notes,
        imageGallery: marketingDraft.galleryImages,
        coverImageId: marketingDraft.coverImageId,
        floorplans: marketingDraft.floorplans,
      },
      propertyDetails: {
        listingCode: marketingDraft.listingCode,
        headline: marketingDraft.headline.trim(),
        propertyType: marketingDraft.propertyType,
        listingStatus: marketingDraft.listingStatus,
        source: marketingDraft.source.trim(),
        addressLine1: marketingDraft.addressLine1.trim(),
        suburb: marketingDraft.suburb.trim(),
        city: marketingDraft.city.trim(),
        province: marketingDraft.province.trim(),
        bedrooms: marketingDraft.bedrooms,
        bathrooms: marketingDraft.bathrooms,
        garages: marketingDraft.garages,
        coveredParking: marketingDraft.coveredParking,
        openParking: marketingDraft.openParking,
        erfSize: marketingDraft.erfSize,
        floorSize: marketingDraft.floorSize,
        price: Number(marketingDraft.price || 0),
        levies: marketingDraft.leviesNotApplicable ? 0 : Number(marketingDraft.levies || 0),
        leviesNotApplicable: marketingDraft.leviesNotApplicable,
        ratesTaxes: marketingDraft.ratesTaxesNotApplicable ? 0 : Number(marketingDraft.ratesTaxes || 0),
        ratesTaxesNotApplicable: marketingDraft.ratesTaxesNotApplicable,
        selectedFeatures: marketingDraft.selectedFeatures,
        description: marketingDraft.description.trim(),
        notes: marketingDraft.notes.trim(),
        floorplans: marketingDraft.floorplans,
        coverImageId: marketingDraft.coverImageId,
      },
    }))
  }

  function saveRolePlayers() {
    patchListing((row) => ({
      ...row,
      rolePlayers: {
        attorney: rolePlayersDraft.attorney,
        bondOriginator: rolePlayersDraft.bondOriginator,
      },
    }))
  }

  function handleOfferDecision(offerId, nextStatus) {
    patchListing((row) => ({
      ...row,
      offers: (row.offers || []).map((offer) =>
        String(offer.id) === String(offerId)
          ? { ...offer, status: nextStatus, decidedAt: new Date().toISOString() }
          : nextStatus === OFFER_STATUS.ACCEPTED && String(offer.status || '').toLowerCase() === OFFER_STATUS.ACCEPTED
            ? { ...offer, status: OFFER_STATUS.REJECTED }
            : offer,
      ),
      status: nextStatus === OFFER_STATUS.ACCEPTED ? 'under_offer' : row.status,
    }))
  }

  function handleCounterOffer(offerId) {
    patchListing((row) => ({
      ...row,
      offers: (row.offers || []).map((offer) =>
        String(offer.id) === String(offerId)
          ? {
              ...offer,
              status: OFFER_STATUS.PENDING,
              agentNotes: [offer.agentNotes, 'Counter requested by seller.'].filter(Boolean).join(' '),
              counterRequestedAt: new Date().toISOString(),
            }
          : offer,
      ),
    }))
  }

  function submitOffer(event) {
    event.preventDefault()
    if (!offerForm.buyerName.trim() || Number(offerForm.offerPrice || 0) <= 0) return
    patchListing((row) => ({
      ...row,
      offers: [
        {
          id: generateId('offer'),
          buyerName: offerForm.buyerName.trim(),
          offerPrice: Number(offerForm.offerPrice || 0),
          conditions: offerForm.conditions.trim(),
          supportingDocsUrl: offerForm.supportingDocsUrl.trim(),
          offerDate: new Date().toISOString(),
          expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          agentNotes: 'Offer submitted via listing workspace.',
          status: OFFER_STATUS.PENDING,
        },
        ...(row.offers || []),
      ],
    }))
    setOfferForm({
      buyerName: '',
      offerPrice: '',
      conditions: '',
      supportingDocsUrl: '',
    })
    setShowOfferForm(false)
  }

  const offerRows = useMemo(() => {
    const rows = Array.isArray(listingRecord?.offers) ? listingRecord.offers : []
    return [...rows].sort((left, right) => new Date(right?.offerDate || 0) - new Date(left?.offerDate || 0))
  }, [listingRecord?.offers])

  const listingLeads = useMemo(() => {
    if (!listingRecord) return []
    return pipelineLeads.filter((lead) => {
      return String(lead?.unitId || '') === String(listingRecord.id) || String(lead?.unitNumber || '') === String(listingRecord.listingTitle || '')
    })
  }, [listingRecord, pipelineLeads])

  const propertyDocuments = useMemo(() => {
    if (!listingRecord) return []
    return [
      {
        key: 'rates_account',
        label: 'Rates Account',
        status: listingRecord?.requiredDocuments?.find((doc) => doc.key === 'rates_account')?.status || 'requested',
        fileName: listingRecord?.requiredDocuments?.find((doc) => doc.key === 'rates_account')?.fileName || '',
      },
      {
        key: 'levies_statement',
        label: 'Levies Statement',
        status: listingRecord?.requiredDocuments?.find((doc) => doc.key === 'levies_statement')?.status || 'requested',
        fileName: listingRecord?.requiredDocuments?.find((doc) => doc.key === 'levies_statement')?.fileName || '',
      },
      {
        key: 'bond_statement',
        label: 'Bond Statement',
        status: listingRecord?.requiredDocuments?.find((doc) => doc.key === 'bond_statement')?.status || 'requested',
        fileName: listingRecord?.requiredDocuments?.find((doc) => doc.key === 'bond_statement')?.fileName || '',
      },
    ]
  }, [listingRecord])

  const sellerDocuments = useMemo(() => {
    return (listingRecord?.requiredDocuments || []).filter((doc) =>
      ['mandate_to_sell', 'id_document', 'proof_of_address', 'entity_documents', 'utility_bill'].includes(doc.key),
    )
  }, [listingRecord?.requiredDocuments])

  const buyerDocuments = useMemo(() => {
    const accepted = offerRows.find((offer) => String(offer?.status || '').toLowerCase() === OFFER_STATUS.ACCEPTED)
    if (!accepted) return []
    return [
      { key: 'buyer_otp', label: 'Offer Documentation Pack', status: 'requested', fileName: '' },
      { key: 'buyer_finance', label: 'Finance / Proof of Funds', status: accepted.conditions?.toLowerCase().includes('cash') ? 'uploaded' : 'requested', fileName: '' },
    ]
  }, [offerRows])

  const metrics = useMemo(() => {
    const pendingOffers = offerRows.filter((offer) => String(offer?.status || '').toLowerCase() === OFFER_STATUS.PENDING).length
    const activeOffers = offerRows.filter((offer) => {
      const status = String(offer?.status || '').toLowerCase()
      return status === OFFER_STATUS.PENDING || status === OFFER_STATUS.ACCEPTED
    }).length
    const daysOnMarket = getDaysOnMarket(listingRecord?.createdAt)
    const offerAverage = getOfferAverage(offerRows)
    const leadCount = listingLeads.length
    const viewingCount = viewings.filter((item) => [VIEWING_STATUS.CONFIRMED, VIEWING_STATUS.COMPLETED, VIEWING_STATUS.PENDING_APPROVAL, VIEWING_STATUS.RESCHEDULE_REQUESTED].includes(String(item?.status || '').trim().toLowerCase())).length
    const offerLeadCount = listingLeads.filter((lead) => getLeadStage(lead).includes('offer') || getLeadStage(lead).includes('negotiating')).length
    const acceptedCount = offerRows.filter((offer) => String(offer?.status || '').toLowerCase() === OFFER_STATUS.ACCEPTED).length
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
    return [
      { key: 'basic', label: 'Basic Information', complete: basicComplete },
      { key: 'specs', label: 'Property Specs', complete: specsComplete },
      { key: 'financial', label: 'Financial Details', complete: financialComplete },
      { key: 'features', label: 'Features & Amenities', complete: featuresComplete },
      { key: 'description', label: 'Description', complete: descriptionComplete },
      { key: 'floorplans', label: 'Floor Plans', complete: floorplansComplete },
      { key: 'gallery', label: 'Image Gallery', complete: galleryComplete },
    ]
  }, [coverImage?.url, marketingDraft])

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

  async function handleGalleryUpload(event) {
    const files = Array.from(event.target.files || [])
    if (!files.length) return
    const uploads = await Promise.all(
      files.map(async (file) => ({
        id: generateId('gallery'),
        name: file.name,
        url: await readAsDataUrl(file),
      })),
    )
    setMarketingDraft((previous) => {
      const nextGallery = [...previous.galleryImages, ...uploads]
      return {
        ...previous,
        galleryImages: nextGallery,
        coverImageId: previous.coverImageId || uploads[0]?.id || '',
      }
    })
    event.target.value = ''
  }

  function setCoverImage(imageId) {
    setMarketingDraft((previous) => ({ ...previous, coverImageId: imageId }))
  }

  function moveGalleryImage(imageId, direction) {
    setMarketingDraft((previous) => {
      const currentIndex = previous.galleryImages.findIndex((image) => String(image.id) === String(imageId))
      if (currentIndex < 0) return previous
      const nextIndex = direction === 'left' ? currentIndex - 1 : currentIndex + 1
      if (nextIndex < 0 || nextIndex >= previous.galleryImages.length) return previous
      const nextGallery = [...previous.galleryImages]
      const [item] = nextGallery.splice(currentIndex, 1)
      nextGallery.splice(nextIndex, 0, item)
      return { ...previous, galleryImages: nextGallery }
    })
  }

  function removeGalleryImage(imageId) {
    setMarketingDraft((previous) => {
      const nextGallery = previous.galleryImages.filter((image) => String(image.id) !== String(imageId))
      return {
        ...previous,
        galleryImages: nextGallery,
        coverImageId:
          String(previous.coverImageId) === String(imageId)
            ? String(nextGallery[0]?.id || '')
            : previous.coverImageId,
      }
    })
  }

  async function handleFloorplanUpload(event) {
    const files = Array.from(event.target.files || [])
    if (!files.length) return
    const uploads = await Promise.all(
      files.map(async (file, index) => ({
        id: generateId('floorplan'),
        name: file.name,
        label: `Plan ${marketingDraft.floorplans.length + index + 1}`,
        url: await readAsDataUrl(file),
      })),
    )
    setMarketingDraft((previous) => ({ ...previous, floorplans: [...previous.floorplans, ...uploads] }))
    event.target.value = ''
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
        <p className="text-sm text-[#6b7d93]">Listing not found.</p>
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
              <Button onClick={() => setShowOfferForm(true)}>
                <Plus size={15} />
                Submit Offer
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
        <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-5">
            <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h3 className="text-[1.08rem] font-semibold text-[#142132]">Property Details</h3>
                  <p className="mt-1 text-sm text-[#607387]">Structured listing data for stronger presentation, cleaner reporting, and better downstream conversion.</p>
                </div>
                <Button onClick={saveMarketingDraft}>Save Property Details</Button>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-[18px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Listing ID</p>
                  <p className="mt-2 text-[1.02rem] font-semibold text-[#142132]">{marketingDraft.listingCode || 'Pending'}</p>
                  <p className="mt-1 text-sm text-[#607387]">System-generated and read-only for matching, reporting, and future portal integrations.</p>
                </div>
                <div className="rounded-[18px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Section Completion</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {sectionStatuses.map((section) => (
                      <div key={section.key} className="flex items-center justify-between rounded-[12px] border border-[#dce6f2] bg-white px-3 py-2">
                        <span className="text-sm font-medium text-[#22374d]">{section.label}</span>
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[0.72rem] font-semibold ${section.complete ? 'border-[#d8eddf] bg-[#ecfaf1] text-[#1f7d44]' : 'border-[#f5dbb0] bg-[#fff8ec] text-[#9a5b13]'}`}>
                          {section.complete ? <CheckCircle2 size={12} /> : <CircleAlert size={12} />}
                          {section.complete ? 'Complete' : 'Missing info'}
                        </span>
                      </div>
                    ))}
                  </div>
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
              <div className="mt-5 rounded-[18px] border border-dashed border-[#c9d8e8] bg-[#fbfdff] p-4">
                <label className="flex cursor-pointer items-center gap-3 rounded-[14px] border border-[#dbe6f2] bg-white px-4 py-3 text-sm font-semibold text-[#35546c] hover:border-[#b7c8db]">
                  <Upload size={16} />
                  Upload Floor Plans
                  <input type="file" accept=".pdf,image/*" multiple className="hidden" onChange={handleFloorplanUpload} />
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
                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${sectionStatuses.find((item) => item.key === 'gallery')?.complete ? 'border-[#d8eddf] bg-[#ecfaf1] text-[#1f7d44]' : 'border-[#f5dbb0] bg-[#fff8ec] text-[#9a5b13]'}`}>
                  {sectionStatuses.find((item) => item.key === 'gallery')?.complete ? 'Complete' : 'Missing info'}
                </span>
              </div>
              <div className="mt-5 rounded-[18px] border border-dashed border-[#c9d8e8] bg-[#fbfdff] p-4">
                <label className="flex cursor-pointer items-center gap-3 rounded-[14px] border border-[#dbe6f2] bg-white px-4 py-3 text-sm font-semibold text-[#35546c] hover:border-[#b7c8db]">
                  <ImagePlus size={16} />
                  Upload Listing Images
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handleGalleryUpload} />
                </label>
                <p className="mt-2 text-xs text-[#7b8ca2]">The first uploaded image becomes the cover by default. You can change it anytime.</p>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {marketingDraft.galleryImages.length ? (
                  marketingDraft.galleryImages.map((image, index) => {
                    const active = String(image.id) === String(marketingDraft.coverImageId)
                    return (
                      <div key={image.id} className="overflow-hidden rounded-[18px] border border-[#dce6f2] bg-white">
                        <div className="h-[160px] border-b border-[#e5edf6]">
                          <img src={image.url} alt={image.name} className="h-full w-full object-cover" />
                        </div>
                        <div className="space-y-3 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-[#22374d]">{image.name}</p>
                              <p className="mt-1 text-xs text-[#7b8ca2]">{active ? 'Current cover image' : `Image ${index + 1}`}</p>
                            </div>
                            <button type="button" onClick={() => removeGalleryImage(image.id)} className="rounded-full border border-[#dbe6f2] p-1 text-[#6b7d93] hover:text-[#22374d]">
                              <X size={14} />
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" type="button" variant={active ? 'primary' : 'secondary'} onClick={() => setCoverImage(image.id)}>
                              {active ? 'Cover Image' : 'Set as Cover'}
                            </Button>
                            <Button size="sm" type="button" variant="secondary" onClick={() => moveGalleryImage(image.id, 'left')} disabled={index === 0}>
                              Move Left
                            </Button>
                            <Button size="sm" type="button" variant="secondary" onClick={() => moveGalleryImage(image.id, 'right')} disabled={index === marketingDraft.galleryImages.length - 1}>
                              Move Right
                            </Button>
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
                <p className="mt-1 text-sm text-[#607387]">Compare incoming offers, manage seller decisions, and track negotiation status.</p>
              </div>
              <Button onClick={() => setShowOfferForm((current) => !current)}>
                <Plus size={15} />
                {showOfferForm ? 'Hide Offer Form' : 'Submit Offer'}
              </Button>
            </div>

            {showOfferForm ? (
              <form className="mt-5 rounded-[18px] border border-[#dce6f2] bg-[#fbfdff] p-4" onSubmit={submitOffer}>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-[#2d445e]">Buyer name</span>
                    <Field value={offerForm.buyerName} onChange={(event) => setOfferForm((prev) => ({ ...prev, buyerName: event.target.value }))} placeholder="Buyer or submitting agent" />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-[#2d445e]">Offer amount</span>
                    <Field type="number" min="0" step="1000" value={offerForm.offerPrice} onChange={(event) => setOfferForm((prev) => ({ ...prev, offerPrice: event.target.value }))} placeholder="2450000" />
                  </label>
                  <label className="grid gap-2 md:col-span-2">
                    <span className="text-sm font-semibold text-[#2d445e]">Conditions</span>
                    <Field as="textarea" rows={3} value={offerForm.conditions} onChange={(event) => setOfferForm((prev) => ({ ...prev, conditions: event.target.value }))} placeholder="Cash / bond conditions / occupation requirements" />
                  </label>
                  <label className="grid gap-2 md:col-span-2">
                    <span className="text-sm font-semibold text-[#2d445e]">Supporting docs URL</span>
                    <Field value={offerForm.supportingDocsUrl} onChange={(event) => setOfferForm((prev) => ({ ...prev, supportingDocsUrl: event.target.value }))} placeholder="Optional link to supporting docs" />
                  </label>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={() => setShowOfferForm(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">Capture Offer</Button>
                </div>
              </form>
            ) : null}
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
                    {String(offer.status || '').toLowerCase() === OFFER_STATUS.PENDING ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button size="sm" type="button" onClick={() => handleOfferDecision(offer.id, OFFER_STATUS.ACCEPTED)}>Accept</Button>
                        <Button size="sm" variant="secondary" type="button" onClick={() => handleOfferDecision(offer.id, OFFER_STATUS.REJECTED)}>Reject</Button>
                        <Button size="sm" variant="secondary" type="button" onClick={() => handleCounterOffer(offer.id)}>Counter</Button>
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
                <MetricCard label="Highest Offer" value={formatCurrency(Math.max(0, ...offerRows.map((offer) => Number(offer.offerPrice || 0))))} meta="Top current buyer position" />
                <MetricCard label="Average Offer" value={offerRows.length ? formatCurrency(metrics.offerAverage) : '—'} meta="Mean offer level" />
                <MetricCard label="Accepted" value={metrics.acceptedCount} meta="Offers already converted" />
              </div>
            </aside>
          </section>
        </section>
      ) : null}

      {activeTab === 'seller' ? (
        <section className="grid gap-5 xl:grid-cols-2">
          <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
            <h3 className="text-[1.05rem] font-semibold text-[#142132]">Seller Details</h3>
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-3 rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                <div className="rounded-full bg-[#eef4fb] p-2 text-[#1f4f78]"><UserRound size={18} /></div>
                <div>
                  <p className="text-sm font-semibold text-[#22374d]">{listingRecord?.seller?.name || 'Seller pending'}</p>
                  <p className="text-sm text-[#607387]">{listingRecord?.seller?.email || 'Email pending'}</p>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <MetricCard label="Phone" value={listingRecord?.seller?.phone || 'Pending'} meta="Primary seller contact" />
                <MetricCard label="Onboarding" value={onboardingStatusLabel} meta={listingRecord?.sellerOnboarding?.link ? 'Seller link is active' : 'Onboarding link unavailable'} />
              </div>
              {listingRecord?.sellerOnboarding?.link ? (
                <a href={listingRecord.sellerOnboarding.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-[#1f4f78]">
                  <ExternalLink size={14} />
                  Open Seller Onboarding
                </a>
              ) : null}
            </div>
          </section>

          <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
            <h3 className="text-[1.05rem] font-semibold text-[#142132]">Mandate & Commission</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <MetricCard label="Mandate Type" value={formatStatusLabel(listingRecord?.mandateType || 'sole')} meta={`${formatDate(listingRecord?.mandateStartDate)} → ${formatDate(listingRecord?.mandateEndDate)}`} />
              <MetricCard label="Commission" value={listingRecord?.commission?.commission_type === 'fixed' ? formatCurrency(listingRecord?.commission?.commission_amount) : `${Number(listingRecord?.commission?.commission_percentage || 0)}%`} meta="Current agreement structure" />
            </div>
            <div className="mt-4 rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4">
              <p className="text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Commission Notes</p>
              <p className="mt-2 text-sm leading-6 text-[#607387]">{listingRecord?.commission?.commission_notes || 'No special commission notes captured.'}</p>
            </div>
          </section>
        </section>
      ) : null}

      {activeTab === 'documents' ? (
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
                    <article key={doc.key} className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[#22374d]">{doc.label}</p>
                          <p className="mt-1 text-xs text-[#6b7d93]">{doc.fileName || 'No file linked yet'}</p>
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
