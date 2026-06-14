import { inferLeadCategoryFromRecord } from '../lib/leadCategory.js'
import {
  buildSellerRequirementProfile,
  generateSellerDocumentRequirements,
} from '../lib/sellerDocumentRequirementEngine.js'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function toNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function readDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function daysBetween(start, end = new Date()) {
  const date = readDate(start)
  if (!date) return 0
  return Math.max(0, Math.floor((end.getTime() - date.getTime()) / 86_400_000))
}

function firstDate(...values) {
  for (const value of values) {
    const date = readDate(value)
    if (date) return date.toISOString()
  }
  return null
}

export const SELLER_JOURNEY_STAGES = [
  { key: 'contacted', label: 'Contacted' },
  { key: 'appointment_valuation', label: 'Appointment / Valuation' },
  { key: 'seller_onboarding_sent', label: 'Seller Onboarding Sent' },
  { key: 'seller_onboarding_submitted', label: 'Seller Onboarding Submitted' },
  { key: 'mandate_sent', label: 'Mandate Sent' },
  { key: 'mandate_signed', label: 'Mandate Signed' },
  { key: 'listing_created', label: 'Listing Created' },
  { key: 'listing_live', label: 'Listing Live' },
  { key: 'documents_submitted', label: 'All Documents Submitted' },
]

const STAGE_INDEX = new Map(SELLER_JOURNEY_STAGES.map((stage, index) => [stage.key, index]))
const STAGE_TOKEN_INDEX = new Map(
  SELLER_JOURNEY_STAGES.map((stage, index) => [normalizeText(stage.key).toLowerCase(), index]),
)
const STAGE_LABEL_INDEX = new Map(
  SELLER_JOURNEY_STAGES.map((stage, index) => [normalizeText(stage.label).toLowerCase(), index]),
)
const STAGE_KEY_BY_TOKEN = new Map(SELLER_JOURNEY_STAGES.map((stage) => [normalizeText(stage.key).toLowerCase(), stage.key]))
const STAGE_KEY_BY_LABEL = new Map(SELLER_JOURNEY_STAGES.map((stage) => [normalizeText(stage.label).toLowerCase(), stage.key]))
const SELLER_JOURNEY_STAGE_ALIASES = new Map([
  ['onboarding_sent', 'seller_onboarding_sent'],
  ['seller_onboarding_sent', 'seller_onboarding_sent'],
  ['onboarding_completed', 'seller_onboarding_submitted'],
  ['seller_onboarding_completed', 'seller_onboarding_submitted'],
  ['onboarding_submitted', 'seller_onboarding_submitted'],
  ['seller_onboarding_submitted', 'seller_onboarding_submitted'],
  ['all_documents_submitted', 'documents_submitted'],
  ['documents_submitted', 'documents_submitted'],
])

const SELLER_JOURNEY_STATUS_RANKS = {
  contacted: { active: 1, contacted: 1, initial: 1, start: 1 },
  appointment_valuation: { upcoming: 1, scheduled: 1, active: 1, completed: 2 },
  seller_onboarding_sent: { draft: 1, pending: 1, sent: 2, opened: 2, in_progress: 3, active: 3 },
  seller_onboarding_submitted: { sent: 1, in_progress: 1, submitted: 2, completed: 2, under_review: 2 },
  mandate_sent: { draft: 1, pending: 1, sent: 2, scheduled: 2, completed: 2 },
  mandate_signed: { draft: 1, sent: 1, signed: 2, completed: 2 },
  listing_created: { draft: 1, created: 2, active: 2, published: 2 },
  listing_live: { draft: 1, active: 2, live: 3, published: 3, complete: 3 },
  documents_submitted: { pending: 1, partial: 1, submitted: 2, approved: 3, completed: 3 },
}

const SELLER_JOURNEY_DEFAULT_STATUS_BY_STAGE = {
  contacted: 'Active',
  appointment_valuation: 'Upcoming',
  seller_onboarding_sent: 'Sent',
  seller_onboarding_submitted: 'Submitted',
  mandate_sent: 'Sent',
  mandate_signed: 'Signed',
  listing_created: 'Draft',
  listing_live: 'Live',
  documents_submitted: 'Submitted',
}

function normalizeSellerJourneyToken(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function resolveSellerJourneyStageKey(value = '') {
  const token = normalizeSellerJourneyToken(value)
  if (!token) return null
  if (SELLER_JOURNEY_STAGE_ALIASES.has(token)) return SELLER_JOURNEY_STAGE_ALIASES.get(token)
  return STAGE_KEY_BY_TOKEN.get(token)
    || STAGE_KEY_BY_LABEL.get(token)
    || STAGE_KEY_BY_LABEL.get(token.replace(/-/g, '_'))
    || STAGE_KEY_BY_LABEL.get(token.replace(/_/g, '-'))
    || STAGE_KEY_BY_LABEL.get(token.replace(/_/g, ' '))
}

function normalizeSellerStageRank(stage = '', text = '') {
  const stageKey = resolveSellerJourneyStageKey(stage) || normalizeSellerJourneyToken(stage) || 'contacted'
  const statusMap = SELLER_JOURNEY_STATUS_RANKS[stageKey]
  const normalized = normalizeSellerJourneyToken(text)
  if (!statusMap || !normalized) return 1
  const keys = Object.keys(statusMap)
  for (const key of keys) {
    if (normalized.includes(key)) return statusMap[key]
  }
  return 1
}

function normalizeSellerJourneyDefaultStatus(stageKey) {
  return SELLER_JOURNEY_DEFAULT_STATUS_BY_STAGE[stageKey] || 'Active'
}

export function getSellerJourneyStageFromLead(lead = {}) {
  const stageText = resolveSellerJourneyStageKey(lead?.stage)
  const statusText = resolveSellerJourneyStageKey(lead?.status)
  const stageValue = stageText || statusText
  const stageIndex = Number.isInteger(STAGE_INDEX.get(stageValue))
    ? STAGE_INDEX.get(stageValue)
    : STAGE_LABEL_INDEX.get(normalizeSellerJourneyToken(lead?.stage || '').toLowerCase())
      ?? STAGE_TOKEN_INDEX.get(normalizeSellerJourneyToken(lead?.stage || '').toLowerCase())
      ?? STAGE_LABEL_INDEX.get(normalizeSellerJourneyToken(lead?.status || '').toLowerCase())
      ?? STAGE_TOKEN_INDEX.get(normalizeSellerJourneyToken(lead?.status || '').toLowerCase())
      ?? 0
  return {
    key: SELLER_JOURNEY_STAGES[stageIndex]?.key || 'contacted',
    label: SELLER_JOURNEY_STAGES[stageIndex]?.label || 'Contacted',
    status: normalizeText(lead?.status || lead?.stage || ''),
    index: stageIndex,
  }
}

export function buildSellerJourneyProgressPatch({ lead = {}, targetStage = '', targetStatus = '' } = {}) {
  const normalizedLead = lead || {}
  const targetKey = resolveSellerJourneyStageKey(targetStage)
  if (!targetKey) return null

  const targetIndex = STAGE_INDEX.get(targetKey)
  if (!Number.isInteger(targetIndex)) return null

  const current = getSellerJourneyStageFromLead(normalizedLead)
  const currentIndex = Number.isInteger(current?.index) ? current.index : 0
  const currentStatusRank = normalizeSellerStageRank(current?.key, current?.status || '')
  const nextStatusRank = normalizeSellerStageRank(targetKey, targetStatus || normalizeSellerJourneyDefaultStatus(targetKey))

  if (targetIndex < currentIndex) return null

  if (targetIndex === currentIndex && nextStatusRank <= currentStatusRank) return null

  const next = SELLER_JOURNEY_STAGES[targetIndex]
  return {
    stage: next?.label || SELLER_JOURNEY_STAGES[targetIndex]?.label || 'Contacted',
    status: targetStatus || normalizeSellerJourneyDefaultStatus(targetKey),
  }
}

export function resolveSellerJourneyStageFromToken(value = '') {
  return resolveSellerJourneyStageKey(value)
}
const SELLER_ONBOARDING_SUBMITTED_STATUSES = new Set(['submitted', 'completed', 'complete', 'under_review', 'onboarding_completed', 'seller_onboarding_completed'])
const SELLER_ONBOARDING_SENT_STATUSES = new Set(['sent', 'in_progress', ...SELLER_ONBOARDING_SUBMITTED_STATUSES])
const LISTING_CREATED_STATUS_KEYS = new Set(['mandate_signed', 'active', 'under_offer', 'transaction_created', 'sold'])
const SELLER_ONBOARDING_SENT_STAGE_SIGNALS = new Set([
  'seller_onboarding_sent',
  'onboarding_sent',
])
const SELLER_ONBOARDING_SUBMITTED_STAGE_SIGNALS = new Set([
  'seller_onboarding_submitted',
  'seller_onboarding_completed',
  'onboarding_submitted',
  'onboarding_completed',
  'listing_review',
  'mandate_ready',
  'mandate_sent',
  'mandate_signed',
  'listing_created',
  'listing_live',
  'all_documents_submitted',
  'documents_submitted',
  'active',
  'under_offer',
  'transaction_created',
  'sold',
])

function firstPresent(...values) {
  return values.map(normalizeText).find(Boolean) || ''
}

function readListingId(listing = {}) {
  return firstPresent(listing?.id, listing?.listingId, listing?.listing_id, listing?.privateListingId, listing?.private_listing_id)
}

function readLeadId(lead = {}) {
  return firstPresent(lead?.leadId, lead?.lead_id, lead?.id)
}

function readLinkedLeadIds(listing = {}) {
  return [
    listing?.sellerLeadId,
    listing?.seller_lead_id,
    listing?.originatingCrmLeadId,
    listing?.originating_crm_lead_id,
    listing?.leadId,
    listing?.lead_id,
  ].map(normalizeText).filter(Boolean)
}

export function isSellerLead(lead = {}) {
  return inferLeadCategoryFromRecord(lead, 'other') === 'seller'
}

export function isSellerValuationAppointment(appointment = {}) {
  const signal = normalizeKey([
    appointment?.appointmentType,
    appointment?.appointment_type,
    appointment?.customTypeLabel,
    appointment?.custom_type_label,
    appointment?.title,
    appointment?.linkedWorkflow,
    appointment?.linked_workflow,
    appointment?.linkedWorkflowStage,
    appointment?.linked_workflow_stage,
  ].map(normalizeText).join(' '))
  return (
    signal.includes('seller_consultation') ||
    signal.includes('seller_valuation') ||
    signal.includes('seller_appointment') ||
    signal.includes('appointment_valuation') ||
    signal.includes('valuation') ||
    signal.includes('appraisal') ||
    signal.includes('mandate_consultation')
  )
}

function getSellerOnboardingSignals({ lead = {}, listing = {} } = {}) {
  const status = normalizeKey(
    lead?.sellerOnboardingStatus ||
      lead?.seller_onboarding_status ||
      listing?.sellerOnboarding?.status ||
      listing?.seller_onboarding_status,
  )
  const leadJourneySignals = [
    lead?.stage,
    lead?.status,
    lead?.currentStage,
    lead?.current_stage,
  ].map(normalizeKey).filter(Boolean)
  const token = firstPresent(
    lead?.sellerOnboardingToken,
    lead?.seller_onboarding_token,
    listing?.sellerOnboarding?.token,
    listing?.seller_onboarding_token,
  )
  const listingLifecycle = normalizeKey(
    listing?.listingStatus ||
      listing?.listing_status ||
      listing?.status ||
      listing?.lifecycleStatus ||
      listing?.lifecycle_status,
  )
  const sent = Boolean(
    token ||
      SELLER_ONBOARDING_SENT_STATUSES.has(status) ||
      leadJourneySignals.some((signal) => SELLER_ONBOARDING_SENT_STAGE_SIGNALS.has(signal) || signal === 'sent' || signal === 'in_progress') ||
      leadJourneySignals.some((signal) => SELLER_ONBOARDING_SUBMITTED_STAGE_SIGNALS.has(signal)) ||
      ['onboarding_sent', 'onboarding_completed', 'listing_review', 'mandate_ready', 'mandate_sent', 'mandate_signed', 'active', 'under_offer', 'transaction_created', 'sold'].includes(listingLifecycle),
  )
  const submitted = Boolean(
    SELLER_ONBOARDING_SUBMITTED_STATUSES.has(status) ||
      leadJourneySignals.some((signal) => SELLER_ONBOARDING_SUBMITTED_STAGE_SIGNALS.has(signal) || signal === 'submitted' || signal === 'completed') ||
      ['onboarding_completed', 'listing_review', 'mandate_ready', 'mandate_sent', 'mandate_signed', 'active', 'under_offer', 'transaction_created', 'sold'].includes(listingLifecycle),
  )
  return {
    sent,
    submitted,
    status,
    token,
  }
}

function appointmentStatus(appointment = null) {
  if (!appointment) return ''
  const status = normalizeKey(appointment?.status || appointment?.appointmentStatus || appointment?.appointment_status)
  if (status.includes('cancel')) return 'Cancelled'
  if (status.includes('complete') || appointment?.completedAt || appointment?.completed_at) return 'Completed'
  if (status.includes('declin')) return 'Cancelled'
  return 'Scheduled'
}

function appointmentCompleted(appointment = null) {
  if (!appointment) return false
  const status = normalizeKey(appointment?.status || appointment?.appointmentStatus || appointment?.appointment_status)
  return status.includes('complete') || Boolean(appointment?.completedAt || appointment?.completed_at)
}

function findValuationAppointment(appointments = []) {
  return (Array.isArray(appointments) ? appointments : [])
    .filter(isSellerValuationAppointment)
    .sort((left, right) => {
      const leftDate = readDate(left?.dateTime || left?.date_time || left?.startTime || left?.start_time || left?.createdAt || left?.created_at)
      const rightDate = readDate(right?.dateTime || right?.date_time || right?.startTime || right?.start_time || right?.createdAt || right?.created_at)
      return (rightDate?.getTime() || 0) - (leftDate?.getTime() || 0)
    })[0] || null
}

function getMandateStatus({ lead = {}, listing = {}, mandatePacketStatus = {}, mandatePacket = null } = {}) {
  const packet = mandatePacket || mandatePacketStatus?.packet || lead?.mandatePacket || null
  const sourceContext = packet?.source_context_json && typeof packet.source_context_json === 'object'
    ? packet.source_context_json
    : {}
  const leadMandateStageSignals = [lead?.stage, lead?.status]
    .map(normalizeKey)
    .filter((status) => status.includes('mandate') || status.includes('signing') || status.includes('signature'))
  const statuses = [
    listing?.mandateStatus,
    listing?.mandate_status,
    listing?.mandate?.status,
    lead?.mandateStatus,
    lead?.mandate_status,
    packet?.status,
    mandatePacketStatus?.state,
    mandatePacketStatus?.signingStatus,
    sourceContext?.mandateStatus,
    sourceContext?.mandate_status,
    sourceContext?.signingStatus,
    sourceContext?.signing_status,
    ...leadMandateStageSignals,
  ].map(normalizeKey)
  const onboardingStatus = normalizeKey(
    lead?.sellerOnboardingStatus ||
      lead?.seller_onboarding_status ||
      listing?.sellerOnboarding?.status ||
      listing?.seller_onboarding_status,
  )
  const onboardingStatusBlocksStatusOnlyMandate = Boolean(onboardingStatus && !SELLER_ONBOARDING_SUBMITTED_STATUSES.has(onboardingStatus))

  const signers = mandatePacketStatus?.signingSummary?.signers || mandatePacketStatus?.signers || []
  const allSignersSigned = Boolean(mandatePacketStatus?.signingSummary?.allSignersSigned) ||
    (Array.isArray(signers) && signers.length > 0 && signers.every((signer) => normalizeKey(signer?.status || signer?.statusRaw).includes('signed')))
  const hasFinalArtifact = (Array.isArray(mandatePacketStatus?.versions) ? mandatePacketStatus.versions : []).some((version) =>
    firstPresent(version?.final_signed_file_path, version?.final_signed_file_url, version?.final_signed_file_access_url),
  )
  const mandatePacketRef = firstPresent(lead?.mandatePacketId, lead?.mandate_packet_id, listing?.mandatePacketId, listing?.mandate_packet_id, packet?.id)
  const allowStatusOnlyMandate = !onboardingStatusBlocksStatusOnlyMandate || Boolean(mandatePacketRef)
  if (
    allSignersSigned ||
    hasFinalArtifact ||
    (allowStatusOnlyMandate && statuses.some((status) => ['signed', 'completed', 'fully_signed', 'uploaded_signed'].includes(status) || status.includes('mandate_signed')))
  ) {
    return 'signed'
  }
  if (
    mandatePacketRef ||
    (allowStatusOnlyMandate && statuses.some((status) => ['sent', 'generated', 'ready', 'ready_for_generation', 'partially_signed', 'sent_to_seller', 'sent_to_agent'].includes(status) || status.includes('mandate_sent')))
  ) {
    return statuses.some((status) => status.includes('sent') || status.includes('partially_signed')) ? 'sent' : 'draft'
  }
  return 'not_started'
}

function listingBelongsToLead(listing = {}, lead = {}) {
  const listingId = readListingId(listing)
  const leadListingId = firstPresent(lead?.listingId, lead?.listing_id, lead?.privateListingId, lead?.private_listing_id)
  if (listingId && leadListingId && listingId === leadListingId) return true
  const leadId = readLeadId(lead)
  return Boolean(leadId && readLinkedLeadIds(listing).includes(leadId))
}

function isListingLive(listing = {}) {
  const status = normalizeKey(listing?.listingStatus || listing?.listing_status || listing?.status || listing?.lifecycleStatus || listing?.lifecycle_status)
  const visibility = normalizeKey(listing?.listingVisibility || listing?.listing_visibility)
  return Boolean(
    status === 'active' ||
    status === 'listing_active' ||
    status === 'active_market' ||
    status === 'live' ||
    visibility === 'active_market' ||
    listing?.isActive ||
    listing?.is_active,
  )
}

function listingHasCreationLifecycle(listing = {}) {
  const status = normalizeKey(listing?.listingStatus || listing?.listing_status || listing?.status || listing?.lifecycleStatus || listing?.lifecycle_status)
  return isListingLive(listing) || LISTING_CREATED_STATUS_KEYS.has(status)
}

function hasListingShell({ lead = {}, listing = {} } = {}) {
  if (listing && readListingId(listing)) return listingBelongsToLead(listing, lead) || Boolean(firstPresent(lead?.listingId, lead?.listing_id))
  return Boolean(firstPresent(lead?.listingId, lead?.listing_id, lead?.privateListingId, lead?.private_listing_id))
}

function hasListingCreated({ lead = {}, listing = {}, mandateStatus = '' } = {}) {
  if (!hasListingShell({ lead, listing })) return false
  return listingHasCreationLifecycle(listing || lead) || mandateStatus === 'signed'
}

export function getSellerJourneyStage({ lead = {}, appointments = [], listing = null, mandatePacketStatus = null, mandatePacket = null } = {}) {
  if (!isSellerLead(lead)) return null
  const valuationAppointment = findValuationAppointment(appointments)
  const onboardingSignals = getSellerOnboardingSignals({ lead, listing })
  const mandateStatus = getMandateStatus({ lead, listing, mandatePacketStatus, mandatePacket })
  const listingCreated = hasListingCreated({ lead, listing, mandateStatus })
  const documentsSubmitted = areSellerJourneyDocumentsSubmitted({
    listing,
    documents: [
      ...(Array.isArray(listing?.documents) ? listing.documents : []),
    ],
  })

  if (listingCreated && isListingLive(listing || lead) && documentsSubmitted) return { ...SELLER_JOURNEY_STAGES[8], status: 'Submitted' }
  if (listingCreated && isListingLive(listing || lead)) return { ...SELLER_JOURNEY_STAGES[7], status: 'Live' }
  if (listingCreated) return { ...SELLER_JOURNEY_STAGES[6], status: 'Draft' }
  if (mandateStatus === 'signed') return { ...SELLER_JOURNEY_STAGES[5], status: 'Signed' }
  if (['sent', 'draft'].includes(mandateStatus)) {
    return { ...SELLER_JOURNEY_STAGES[4], status: mandateStatus === 'sent' ? 'Sent' : 'Draft' }
  }
  if (onboardingSignals.submitted) return { ...SELLER_JOURNEY_STAGES[3], status: 'Submitted' }
  if (onboardingSignals.sent) return { ...SELLER_JOURNEY_STAGES[2], status: onboardingSignals.status === 'in_progress' ? 'In Progress' : 'Sent' }
  if (valuationAppointment) return { ...SELLER_JOURNEY_STAGES[1], status: appointmentStatus(valuationAppointment) }
  return { ...SELLER_JOURNEY_STAGES[0], status: 'Active' }
}

function buildJourneySteps(stageKey, evidence = {}) {
  const currentIndex = STAGE_INDEX.get(stageKey) ?? 0
  return SELLER_JOURNEY_STAGES.map((stage, index) => {
    const evidenceDone = Boolean(evidence[stage.key])
    const isCurrent = index === currentIndex
    return {
      ...stage,
      completed: evidenceDone,
      current: isCurrent,
      upcoming: !isCurrent && !evidenceDone,
      state: isCurrent ? 'current' : evidenceDone ? 'completed' : 'upcoming',
      status: evidence[`${stage.key}Status`] || '',
    }
  })
}

function labelMandate(status) {
  if (status === 'signed') return 'Signed'
  if (status === 'sent') return 'Sent'
  if (status === 'draft') return 'Draft'
  return 'Not started'
}

function labelListing(listing = null, hasListing = false) {
  if (!hasListing) return 'Not created'
  if (isListingLive(listing || {})) return 'Live'
  return 'Draft'
}

function labelPortalStatus({ lead = {}, listing = {} } = {}) {
  const token = firstPresent(lead?.sellerOnboardingToken, lead?.seller_onboarding_token, listing?.sellerOnboarding?.token, listing?.seller_onboarding_token)
  const status = normalizeKey(lead?.sellerOnboardingStatus || lead?.seller_onboarding_status || listing?.sellerOnboarding?.status || listing?.seller_onboarding_status)
  if (!token) return 'Not opened'
  if (['completed', 'submitted', 'complete'].includes(status)) return 'Completed'
  if (status) return status.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
  return 'Available'
}

function normalizeDocumentStatusLabel(status = '') {
  const normalized = normalizeKey(status)
  if (['approved', 'verified', 'accepted'].includes(normalized)) return 'Approved'
  if (['uploaded', 'received', 'submitted', 'pending_review', 'pending'].includes(normalized)) return 'Uploaded'
  if (['required', 'missing', 'not_uploaded', 'outstanding', 'rejected'].includes(normalized)) return 'Outstanding'
  if (!normalized) return 'Outstanding'
  return normalizeText(status).replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function isDocumentOutstanding(document = {}) {
  const status = normalizeKey(document?.status || document?.documentStatus || document?.document_status)
  return !document?.url && (!status || ['required', 'missing', 'not_uploaded', 'outstanding', 'rejected'].includes(status))
}

function resolveSellerStageStartedAt({ stageKey = '', lead = {}, appointment = null, mandatePacketStatus = {}, mandatePacket = null, listing = null } = {}) {
  const packet = mandatePacket || mandatePacketStatus?.packet || lead?.mandatePacket || null
  const sourceContext = packet?.source_context_json && typeof packet.source_context_json === 'object'
    ? packet.source_context_json
    : {}
  const onboarding = listing?.sellerOnboarding || listing?.seller_onboarding || lead?.sellerOnboarding || lead?.seller_onboarding || {}
  if (stageKey === 'listing_live') {
    return firstDate(
      listing?.activatedAt,
      listing?.activated_at,
      listing?.publishedAt,
      listing?.published_at,
      listing?.liveAt,
      listing?.live_at,
      listing?.updatedAt,
      listing?.updated_at,
    )
  }
  if (stageKey === 'listing_created') {
    return firstDate(listing?.createdAt, listing?.created_at, lead?.listingCreatedAt, lead?.listing_created_at, lead?.updatedAt, lead?.updated_at)
  }
  if (stageKey === 'documents_submitted') {
    const uploadedRows = (Array.isArray(listing?.documents) ? listing.documents : [])
      .map((document) => firstDate(document?.uploadedAt, document?.uploaded_at, document?.createdAt, document?.created_at, document?.updatedAt, document?.updated_at))
      .filter(Boolean)
      .sort()
    return uploadedRows.at(-1) || firstDate(listing?.updatedAt, listing?.updated_at, lead?.updatedAt, lead?.updated_at)
  }
  if (stageKey === 'mandate_signed') {
    return firstDate(
      packet?.signed_at,
      packet?.signedAt,
      mandatePacketStatus?.signedAt,
      mandatePacketStatus?.signed_at,
      sourceContext?.mandateSignedAt,
      sourceContext?.mandate_signed_at,
      packet?.updated_at,
      packet?.updatedAt,
    )
  }
  if (stageKey === 'mandate_sent') {
    return firstDate(
      packet?.sent_at,
      packet?.sentAt,
      mandatePacketStatus?.sentAt,
      mandatePacketStatus?.sent_at,
      sourceContext?.mandateSentAt,
      sourceContext?.mandate_sent_at,
      packet?.created_at,
      packet?.createdAt,
      lead?.updatedAt,
      lead?.updated_at,
    )
  }
  if (stageKey === 'seller_onboarding_submitted') {
    return firstDate(
      onboarding?.submittedAt,
      onboarding?.submitted_at,
      onboarding?.completedAt,
      onboarding?.completed_at,
      lead?.updatedAt,
      lead?.updated_at,
      listing?.updatedAt,
      listing?.updated_at,
    )
  }
  if (stageKey === 'seller_onboarding_sent') {
    return firstDate(
      onboarding?.sentAt,
      onboarding?.sent_at,
      onboarding?.createdAt,
      onboarding?.created_at,
      lead?.updatedAt,
      lead?.updated_at,
      listing?.updatedAt,
      listing?.updated_at,
    )
  }
  if (stageKey === 'appointment_valuation') {
    return firstDate(
      appointment?.completedAt,
      appointment?.completed_at,
      appointment?.dateTime,
      appointment?.date_time,
      appointment?.startTime,
      appointment?.start_time,
      appointment?.scheduledAt,
      appointment?.scheduled_at,
      appointment?.createdAt,
      appointment?.created_at,
    )
  }
  return firstDate(lead?.firstContactedAt, lead?.first_contacted_at, lead?.createdAt, lead?.created_at)
}

function normalizeDocumentLabel(document = {}) {
  const raw = firstPresent(
    document?.requirementName,
    document?.requirement_name,
    document?.requirementKey,
    document?.requirement_key,
    document?.documentName,
    document?.document_name,
    document?.documentType,
    document?.document_type,
    document?.name,
    document?.title,
  )
  if (!raw) return 'Seller Upload'
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function documentSignals(document = {}) {
  return [
    document?.id,
    document?.documentId,
    document?.document_id,
    document?.requirementId,
    document?.requirement_id,
    document?.requirementKey,
    document?.requirement_key,
    document?.canonicalRequirementInstanceId,
    document?.canonical_requirement_instance_id,
    document?.documentType,
    document?.document_type,
    document?.category,
    document?.documentName,
    document?.document_name,
    document?.name,
    document?.title,
    document?.fileName,
    document?.file_name,
  ].map(normalizeKey).filter(Boolean)
}

function requirementSignals(requirement = {}) {
  return [
    requirement?.id,
    requirement?.requirementId,
    requirement?.requirement_id,
    requirement?.key,
    requirement?.requirementKey,
    requirement?.requirement_key,
    requirement?.canonicalRequirementInstanceId,
    requirement?.canonical_requirement_instance_id,
    requirement?.label,
    requirement?.requirementName,
    requirement?.requirement_name,
    requirement?.name,
    requirement?.documentType,
    requirement?.document_type,
    requirement?.category,
  ].map(normalizeKey).filter(Boolean)
}

function requirementIdentity(requirement = {}) {
  return firstPresent(
    requirement?.requirementKey,
    requirement?.requirement_key,
    requirement?.key,
    requirement?.canonicalRequirementInstanceId,
    requirement?.canonical_requirement_instance_id,
    normalizeRequirementLabel(requirement),
  ).toLowerCase()
}

function requirementIsActive(requirement = {}) {
  const status = normalizeKey(requirement?.status || requirement?.requiredDocumentStatus || requirement?.required_document_status)
  return requirement?.isRequired !== false &&
    requirement?.is_required !== false &&
    !['not_required', 'waived', 'cancelled', 'archived'].includes(status)
}

function normalizeRequirementLabel(requirement = {}) {
  return normalizeDocumentLabel({
    requirementName: requirement?.label || requirement?.requirementName || requirement?.requirement_name || requirement?.name,
    requirementKey: requirement?.key || requirement?.requirementKey || requirement?.requirement_key,
  })
}

function documentMatchesRequirement(document = {}, requirement = {}) {
  const documentKeys = documentSignals(document)
  const requirementKeys = requirementSignals(requirement)
  return requirementKeys.some((requirementKey) =>
    documentKeys.some((documentKey) =>
      documentKey === requirementKey ||
      documentKey.includes(requirementKey) ||
      requirementKey.includes(documentKey),
    ),
  )
}

function documentHasFile(document = {}) {
  return Boolean(firstPresent(
    document?.url,
    document?.fileUrl,
    document?.file_url,
    document?.publicUrl,
    document?.public_url,
    document?.signedUrl,
    document?.signed_url,
    document?.storagePath,
    document?.storage_path,
    document?.filePath,
    document?.file_path,
  ))
}

function normalizeSellerDocumentRow(document = {}, index = 0, overrides = {}) {
  const status = firstPresent(
    overrides.status,
    document?.status,
    document?.documentStatus,
    document?.document_status,
    documentHasFile(document) ? 'uploaded' : '',
  )
  return {
    id: firstPresent(overrides.id, document?.id, document?.documentId, document?.document_id) || `seller-doc-${index}`,
    label: overrides.label || normalizeDocumentLabel(document),
    status: normalizeDocumentStatusLabel(status),
    url: firstPresent(document?.url, document?.fileUrl, document?.file_url, document?.publicUrl, document?.public_url, document?.signedUrl, document?.signed_url),
    original: overrides.original || document,
  }
}

function onboardingFactsForListing(listing = {}) {
  const onboarding = listing?.sellerOnboarding || listing?.seller_onboarding || {}
  return onboarding?.formData ||
    onboarding?.form_data ||
    listing?.sellerOnboardingFormData ||
    listing?.seller_onboarding_form_data ||
    {}
}

function hasSellerOnboardingFacts(listing = {}) {
  const onboarding = listing?.sellerOnboarding || listing?.seller_onboarding || {}
  const formData = onboardingFactsForListing(listing)
  return Boolean(
    (formData && typeof formData === 'object' && Object.keys(formData).length) ||
      firstPresent(
        listing?.sellerType,
        listing?.seller_type,
        listing?.ownershipStructure,
        listing?.ownership_structure,
        onboarding?.sellerType,
        onboarding?.seller_type,
        onboarding?.ownershipStructure,
        onboarding?.ownership_structure,
      ),
  )
}

function deriveSellerDocumentRequirements(listing = {}) {
  if (!hasSellerOnboardingFacts(listing)) return []
  const onboarding = listing?.sellerOnboarding || listing?.seller_onboarding || {}
  const formData = onboardingFactsForListing(listing)
  const currentStatus = normalizeKey(listing?.listingStatus || listing?.listing_status || listing?.status || listing?.lifecycleStatus || listing?.lifecycle_status)
  const listingForRequirements = {
    ...listing,
    listingStatus: ['seller_lead', 'onboarding_sent'].includes(currentStatus) ? 'onboarding_completed' : listing?.listingStatus || listing?.listing_status || listing?.status,
    sellerOnboardingStatus: firstPresent(listing?.sellerOnboardingStatus, listing?.seller_onboarding_status, onboarding?.status) || 'completed',
    sellerOnboarding: {
      ...onboarding,
      status: firstPresent(onboarding?.status, listing?.sellerOnboardingStatus, listing?.seller_onboarding_status) || 'completed',
      formData,
    },
  }
  const profile = buildSellerRequirementProfile(listingForRequirements)
  return generateSellerDocumentRequirements(profile).filter(requirementIsActive)
}

function mergeSellerDocumentRequirements(...requirementLists) {
  const merged = []
  const seen = new Set()
  for (const requirement of requirementLists.flat()) {
    if (!requirementIsActive(requirement)) continue
    const identity = requirementIdentity(requirement)
    if (identity && seen.has(identity)) continue
    if (identity) seen.add(identity)
    merged.push(requirement)
  }
  return merged
}

export function buildSellerDocuments({ listing = {}, documents = [] } = {}) {
  const existingDocs = [
    ...(Array.isArray(documents) ? documents : []),
    ...(Array.isArray(listing?.documents) ? listing.documents : []),
  ]
  const activeRequirements = mergeSellerDocumentRequirements(
    Array.isArray(listing?.documentRequirements) ? listing.documentRequirements : [],
    deriveSellerDocumentRequirements(listing),
  )
  if (activeRequirements.length) {
    const matchedIndexes = new Set()
    const requirementRows = activeRequirements.map((requirement, index) => {
      const matchIndex = existingDocs.findIndex((document) => documentMatchesRequirement(document, requirement))
      const match = matchIndex >= 0 ? existingDocs[matchIndex] : null
      if (matchIndex >= 0) matchedIndexes.add(matchIndex)
      return match
        ? normalizeSellerDocumentRow(match, index, {
          id: firstPresent(requirement?.id, requirement?.requirementId, requirement?.requirement_id, match?.id) || `seller-requirement-${index}`,
          label: normalizeRequirementLabel(requirement),
          original: { requirement, document: match },
        })
        : {
          id: firstPresent(requirement?.id, requirement?.requirementId, requirement?.requirement_id) || `seller-requirement-${index}`,
          label: normalizeRequirementLabel(requirement),
          status: 'Outstanding',
          url: '',
          original: { requirement, document: null },
        }
    })
    const extraRows = existingDocs
      .filter((_, index) => !matchedIndexes.has(index))
      .map((document, index) => normalizeSellerDocumentRow(document, index + requirementRows.length))
    return [...requirementRows, ...extraRows]
  }

  const rows = existingDocs.map((document, index) => normalizeSellerDocumentRow(document, index))
  const mandateUrl = firstPresent(listing?.mandateUrl, listing?.mandate?.documentUrl, listing?.mandate?.signedUrl, listing?.signedMandateUrl)
  if (mandateUrl && !rows.some((row) => normalizeKey(row.label).includes('mandate'))) {
    rows.push({ id: 'mandate-document', label: 'Mandate', status: labelMandate(normalizeKey(listing?.mandateStatus || listing?.mandate?.status)), url: mandateUrl, original: listing?.mandate || {} })
  }
  const expected = ['ID', 'Proof Of Address', 'Title Deed', 'Rates Account', 'Mandate', 'Seller Uploads']
  return expected.map((label) => {
    const match = rows.find((row) => normalizeKey(row.label).includes(normalizeKey(label)) || normalizeKey(label).includes(normalizeKey(row.label)))
    return match || { id: `expected-${normalizeKey(label)}`, label, status: 'Outstanding', url: '', original: null }
  })
}

export function areSellerJourneyDocumentsSubmitted({ listing = {}, documents = [] } = {}) {
  const rows = buildSellerDocuments({ listing, documents })
  if (!rows.length) return false
  return rows.every((document) => !isDocumentOutstanding(document))
}

export function buildListingJourney(listing = {}) {
  const status = normalizeKey(listing?.listingStatus || listing?.listing_status || listing?.status || listing?.lifecycleStatus || listing?.lifecycle_status)
  const visibility = normalizeKey(listing?.listingVisibility || listing?.listing_visibility)
  const published = visibility === 'active_market' || ['active', 'under_offer', 'transaction_created', 'sold'].includes(status)
  const active = isListingLive(listing)
  const archived = ['archived', 'withdrawn', 'sold'].includes(status) || visibility === 'archived'
  const paused = ['paused', 'on_hold', 'suspended'].includes(status)
  return [
    { key: 'draft', label: 'Listing Draft', completed: Boolean(readListingId(listing)), current: Boolean(readListingId(listing)) && !published && !archived && !paused },
    { key: 'published', label: 'Listing Published', completed: published, current: published && !active },
    { key: 'active', label: 'Listing Active', completed: active, current: active },
    { key: 'paused', label: 'Listing Paused', completed: paused, current: paused },
    { key: 'archived', label: 'Listing Archived', completed: archived, current: archived },
  ].map((step) => ({
    ...step,
    state: step.current ? 'current' : step.completed ? 'completed' : 'upcoming',
  }))
}

export function getSellerJourneyActions({ lead = {}, contact = {}, appointments = [], listing = null, mandatePacketStatus = null } = {}) {
  const appointment = findValuationAppointment(appointments)
  const onboardingSignals = getSellerOnboardingSignals({ lead, listing })
  const mandateStatus = getMandateStatus({ lead, listing, mandatePacketStatus })
  const listingCreated = hasListingCreated({ lead, listing })
  const live = listingCreated && isListingLive(listing || lead)
  const sellerPortalToken = firstPresent(lead?.sellerOnboardingToken, lead?.seller_onboarding_token, listing?.sellerOnboarding?.token)
  const canContact = Boolean(firstPresent(contact?.phone, lead?.phone, contact?.email, lead?.email, lead?.sellerPhone, lead?.sellerEmail))
  return [
    { id: 'contact_seller', label: 'Contact Seller', enabled: canContact },
    { id: 'schedule_valuation', label: appointment ? 'Open Appointment' : 'Schedule Valuation', enabled: true },
    { id: 'generate_mandate', label: 'Generate Mandate', enabled: onboardingSignals.submitted && (mandateStatus === 'not_started' || mandateStatus === 'draft') },
    { id: 'send_mandate', label: 'Send Mandate', enabled: onboardingSignals.submitted && mandateStatus === 'draft' },
    { id: 'view_signing_status', label: 'View Signing Status', enabled: mandateStatus !== 'not_started' },
    { id: 'create_listing', label: 'Create Listing', enabled: !listingCreated },
    { id: 'open_listing', label: 'Open Listing', enabled: listingCreated },
    { id: 'activate_listing', label: 'Activate Listing', enabled: listingCreated && !live && mandateStatus === 'signed' },
    { id: 'open_seller_portal', label: 'Open Seller Portal', enabled: Boolean(sellerPortalToken) },
  ].map((action) => ({
    ...action,
    disabled: !action.enabled,
    reason: action.enabled ? '' : 'Not available yet',
  }))
}

export function getSellerJourneyStatus(args = {}) {
  const stage = getSellerJourneyStage(args)
  if (!stage) return { label: 'Not a seller lead', key: 'not_seller', status: '' }
  return {
    key: stage.key,
    label: stage.label,
    status: stage.status,
    summary: [stage.label, stage.status].filter(Boolean).join(' · '),
  }
}

export function buildSellerJourney({ lead = {}, contact = {}, appointments = [], listing = null, mandatePacketStatus = null, mandatePacket = null, documents = [] } = {}) {
  const stage = getSellerJourneyStage({ lead, appointments, listing, mandatePacketStatus, mandatePacket }) || { key: 'contacted', label: 'Contacted', status: '' }
  const valuationAppointment = findValuationAppointment(appointments)
  const onboardingSignals = getSellerOnboardingSignals({ lead, listing })
  const mandateStatus = getMandateStatus({ lead, listing, mandatePacketStatus, mandatePacket })
  const listingCreated = hasListingCreated({ lead, listing, mandateStatus })
  const listingLive = listingCreated && isListingLive(listing || lead)
  const sellerDocuments = buildSellerDocuments({ listing, documents })
  const documentsOutstanding = sellerDocuments.filter(isDocumentOutstanding).length
  const documentsSubmitted = sellerDocuments.length > 0 && documentsOutstanding === 0
  const appointmentSatisfied = Boolean(valuationAppointment)
  const valuationStatus = valuationAppointment
    ? appointmentStatus(valuationAppointment)
    : 'Not scheduled'
  const evidence = {
    contacted: isSellerLead(lead),
    contactedStatus: 'Active',
    appointment_valuation: appointmentSatisfied,
    appointment_valuationStatus: valuationStatus,
    seller_onboarding_sent: onboardingSignals.sent,
    seller_onboarding_sentStatus: onboardingSignals.status === 'in_progress' ? 'In Progress' : onboardingSignals.sent ? 'Sent' : '',
    seller_onboarding_submitted: onboardingSignals.submitted,
    seller_onboarding_submittedStatus: onboardingSignals.submitted ? 'Submitted' : '',
    mandate_sent: ['sent', 'signed'].includes(mandateStatus),
    mandate_sentStatus: labelMandate(mandateStatus),
    mandate_signed: mandateStatus === 'signed',
    mandate_signedStatus: labelMandate(mandateStatus),
    listing_created: listingCreated,
    listing_createdStatus: labelListing(listing, listingCreated),
    listing_live: listingLive,
    listing_liveStatus: listingLive ? 'Live' : '',
    documents_submitted: documentsSubmitted,
    documents_submittedStatus: documentsSubmitted ? 'Submitted' : '',
  }
  const steps = buildJourneySteps(stage.key, evidence)
  const propertyAddress = firstPresent(
    listing?.propertyAddress,
    listing?.address,
    listing?.addressLine1,
    listing?.address_line_1,
    lead?.sellerPropertyAddress,
    lead?.seller_property_address,
    lead?.propertyInterest,
    lead?.property_interest,
  )
  const estimatedValue = toNumber(listing?.estimatedValue || listing?.estimated_value || listing?.askingPrice || listing?.asking_price || lead?.estimatedValue || lead?.estimated_value)
  const actions = getSellerJourneyActions({ lead, contact, appointments, listing, mandatePacketStatus })
  const nextRecommendedAction = actions.find((action) => action.enabled && !['contact_seller', 'open_seller_portal'].includes(action.id)) ||
    actions.find((action) => action.enabled) ||
    null
  const currentStageStartedAt = resolveSellerStageStartedAt({
    stageKey: stage.key,
    lead,
    appointment: valuationAppointment,
    mandatePacketStatus,
    mandatePacket,
    listing,
  })
  const daysInCurrentStage = daysBetween(currentStageStartedAt || lead?.createdAt || lead?.created_at)
  const sellerPortalStatus = labelPortalStatus({ lead, listing })
  const kpis = [
    { key: 'property', label: 'Property', value: propertyAddress || 'Not captured' },
    { key: 'estimated_value', label: 'Estimated Value', value: estimatedValue ? estimatedValue : 0, type: 'currency' },
    { key: 'mandate', label: 'Mandate', value: labelMandate(mandateStatus) },
    { key: 'listing', label: 'Listing', value: labelListing(listing, listingCreated) },
    { key: 'documents', label: 'Documents', value: documentsSubmitted ? 'Submitted' : documentsOutstanding ? `${documentsOutstanding} Outstanding` : 'Pending' },
    { key: 'lead_age', label: 'Lead Age', value: daysBetween(lead?.createdAt || lead?.created_at), suffix: 'days' },
  ]
  const workspaceKpis = [
    { key: 'current_stage', label: 'Current Stage', value: stage.label },
    { key: 'days_in_stage', label: 'Days In Stage', value: daysInCurrentStage, suffix: 'days' },
    { key: 'next_action', label: 'Next Action', value: nextRecommendedAction?.label || 'Review seller journey' },
    { key: 'mandate', label: 'Mandate', value: labelMandate(mandateStatus) },
    { key: 'listing', label: 'Listing', value: labelListing(listing, listingCreated) },
    { key: 'seller_portal', label: 'Seller Portal', value: sellerPortalStatus },
    { key: 'documents_outstanding', label: 'Documents Outstanding', value: documentsOutstanding },
  ]
  return {
    isSeller: isSellerLead(lead),
    stage,
    status: getSellerJourneyStatus({ lead, appointments, listing, mandatePacketStatus, mandatePacket }),
    steps,
    valuationAppointment,
    mandateStatus,
    onboardingSent: onboardingSignals.sent,
    onboardingSubmitted: onboardingSignals.submitted,
    listing,
    listingCreated,
    listingLive,
    documentsSubmitted,
    listingJourney: buildListingJourney(listing || {}),
    documents: sellerDocuments,
    documentsOutstanding,
    currentStageStartedAt,
    daysInCurrentStage,
    nextRecommendedAction,
    valuationStatus,
    sellerPortalStatus,
    kpis,
    workspaceKpis,
    actions,
  }
}

function matchingListingForLead(lead = {}, listings = []) {
  return (Array.isArray(listings) ? listings : []).find((listing) => listingBelongsToLead(listing, lead)) || null
}

export function getSellerJourneyMetrics({ leads = [], appointments = [], listings = [], mandatePacketsByLeadId = new Map() } = {}) {
  const sellerLeads = (Array.isArray(leads) ? leads : []).filter(isSellerLead)
  const journeys = sellerLeads.map((lead) => {
    const leadId = readLeadId(lead)
    return buildSellerJourney({
      lead,
      appointments: (Array.isArray(appointments) ? appointments : []).filter((appointment) => firstPresent(appointment?.leadId, appointment?.lead_id, appointment?.relatedEntityId, appointment?.related_entity_id) === leadId),
      listing: matchingListingForLead(lead, listings),
      mandatePacketStatus: mandatePacketsByLeadId instanceof Map ? mandatePacketsByLeadId.get(leadId) : null,
    })
  })
  return {
    sellerLeads: sellerLeads.length,
    valuationsScheduled: journeys.filter((journey) => journey.steps.find((step) => step.key === 'appointment_valuation')?.completed).length,
    valuationsCompleted: journeys.filter((journey) => appointmentCompleted(journey.valuationAppointment)).length,
    mandatesSent: journeys.filter((journey) => ['sent', 'signed'].includes(journey.mandateStatus)).length,
    mandatesSigned: journeys.filter((journey) => journey.mandateStatus === 'signed').length,
    listingsCreated: journeys.filter((journey) => journey.listingCreated).length,
    listingsLive: journeys.filter((journey) => journey.listingLive).length,
  }
}

export const __sellerJourneyServiceTestUtils = {
  appointmentCompleted,
  appointmentStatus,
  buildJourneySteps,
  getMandateStatus,
  hasListingCreated,
  isListingLive,
  listingBelongsToLead,
  resolveSellerStageStartedAt,
}
