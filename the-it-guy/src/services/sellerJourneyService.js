import { inferLeadCategoryFromRecord } from '../lib/leadCategory.js'
import {
  filterMandateSigningRows,
  mandateRequiresSpouseSignature,
  resolveMandateSpouseRequirementFromFields,
} from '../lib/mandateSignatureRules.js'
import {
  buildSellerDocumentRequirementRows,
  normalizeSellerDocumentRequirementStatus,
} from './sellerDocumentRequirementsService.js'
import { hasDirectListingPortalIntake } from '../lib/directListingSellerPortalBridge.js'

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
  { key: 'new_lead', label: 'New Lead' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'seller_onboarding_sent', label: 'Onboarding Sent' },
  { key: 'seller_onboarding_submitted', label: 'Onboarding Submitted' },
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
  ['lead', 'new_lead'],
  ['new', 'new_lead'],
  ['new_lead', 'new_lead'],
  ['seller_lead', 'new_lead'],
  ['lead_created', 'new_lead'],
  ['appointment_valuation', 'contacted'],
  ['valuation', 'contacted'],
  ['seller_valuation', 'contacted'],
  ['seller_consultation', 'contacted'],
  ['converted_to_listing', 'listing_created'],
  ['converted_listing', 'listing_created'],
  ['onboarding_sent', 'seller_onboarding_sent'],
  ['seller_onboarding_sent', 'seller_onboarding_sent'],
  ['onboarding_completed', 'seller_onboarding_submitted'],
  ['seller_onboarding_completed', 'seller_onboarding_submitted'],
  ['onboarding_submitted', 'seller_onboarding_submitted'],
  ['seller_onboarding_submitted', 'seller_onboarding_submitted'],
  ['mandate_generated', 'seller_onboarding_submitted'],
  ['mandate_ready', 'seller_onboarding_submitted'],
  ['mandate_sent', 'seller_onboarding_submitted'],
  ['all_documents_submitted', 'documents_submitted'],
  ['documents_submitted', 'documents_submitted'],
])

const SELLER_JOURNEY_STATUS_RANKS = {
  new_lead: { new: 1, created: 1, lead: 1, active: 1 },
  contacted: { active: 1, contacted: 1, initial: 1, start: 1 },
  seller_onboarding_sent: { draft: 1, pending: 1, sent: 2, opened: 2, in_progress: 3, active: 3 },
  seller_onboarding_submitted: { sent: 1, in_progress: 1, submitted: 2, completed: 2, under_review: 2 },
  mandate_signed: { draft: 1, sent: 1, signed: 2, completed: 2 },
  listing_created: { draft: 1, created: 2, active: 2, published: 2 },
  listing_live: { draft: 1, active: 2, live: 3, published: 3, complete: 3 },
  documents_submitted: { pending: 1, partial: 1, submitted: 2, approved: 3, completed: 3 },
}

const SELLER_JOURNEY_DEFAULT_STATUS_BY_STAGE = {
  new_lead: 'New',
  contacted: 'Active',
  seller_onboarding_sent: 'Sent',
  seller_onboarding_submitted: 'Submitted',
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
  const stageKey = resolveSellerJourneyStageKey(stage) || normalizeSellerJourneyToken(stage) || 'new_lead'
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

function sellerJourneyStageSnapshot(stageKey, status = '') {
  const index = STAGE_INDEX.get(stageKey)
  const stage = Number.isInteger(index) ? SELLER_JOURNEY_STAGES[index] : SELLER_JOURNEY_STAGES[0]
  return { ...stage, status }
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
    key: SELLER_JOURNEY_STAGES[stageIndex]?.key || 'new_lead',
    label: SELLER_JOURNEY_STAGES[stageIndex]?.label || 'New Lead',
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
    stage: next?.label || SELLER_JOURNEY_STAGES[targetIndex]?.label || 'New Lead',
    status: targetStatus || normalizeSellerJourneyDefaultStatus(targetKey),
  }
}

export function resolveSellerJourneyStageFromToken(value = '') {
  return resolveSellerJourneyStageKey(value)
}
const SELLER_ONBOARDING_SUBMITTED_STATUSES = new Set(['submitted', 'completed', 'complete', 'under_review', 'onboarding_completed', 'seller_onboarding_completed'])
const SELLER_ONBOARDING_SENT_STATUSES = new Set(['sent', 'in_progress', ...SELLER_ONBOARDING_SUBMITTED_STATUSES])
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
  'under_offer',
  'transaction_created',
  'sold',
])
const PRE_LISTING_LIFECYCLE_STATUSES = new Set([
  'seller_lead',
  'onboarding_sent',
  'seller_onboarding_sent',
  'onboarding_pending',
  'seller_onboarding_pending',
  'onboarding_completed',
  'seller_onboarding_completed',
])
const LIVE_LISTING_LIFECYCLE_STATUSES = new Set([
  'active',
  'listing_active',
  'listing_live',
  'active_market',
  'live',
])
const LISTING_CREATED_LIFECYCLE_STATUSES = new Set([
  'draft',
  'created',
  'listing_created',
  'listing_review',
  'mandate_signed',
  ...LIVE_LISTING_LIFECYCLE_STATUSES,
  'published',
  'under_offer',
  'transaction_created',
  'sold',
])

function firstPresent(...values) {
  return values.map(normalizeText).find(Boolean) || ''
}

function isPreSendMandateState(value = '') {
  const state = normalizeKey(value)
  return [
    'draft',
    'mandate_draft',
    'draft_ready',
    'mandate_draft_ready',
    'generated',
    'pdf_generated',
    'mandate_generated',
    'ready',
    'ready_to_send',
    'ready_for_generation',
    'signing_prep',
    'signing_prepared',
  ].includes(state)
}

function hasConfirmedMandateSendJob(job = null) {
  if (!job || typeof job !== 'object') return false
  const jobType = normalizeKey(job?.jobType || job?.job_type || job?.type)
  if (jobType !== 'send_for_signature') return false
  const status = normalizeKey(job?.status || job?.jobStatus || job?.job_status)
  const result = job?.result && typeof job.result === 'object' ? job.result : {}
  const metadata = job?.metadata && typeof job.metadata === 'object' ? job.metadata : {}
  const delivery = result?.delivery && typeof result.delivery === 'object'
    ? result.delivery
    : metadata?.delivery && typeof metadata.delivery === 'object'
      ? metadata.delivery
      : {}
  const deliveryStatus = normalizeKey(delivery?.status || result?.deliveryStatus || metadata?.deliveryStatus)
  return Boolean(
    ['succeeded', 'success', 'completed', 'complete', 'sent', 'delivered'].includes(status) &&
      (
        result?.emailConfirmed === true ||
        metadata?.emailConfirmed === true ||
        normalizeText(result?.emailId || result?.deliveryId || metadata?.emailId || metadata?.deliveryId || delivery?.id || delivery?.providerMessageId || delivery?.provider_message_id) ||
        ['sent', 'delivered', 'accepted', 'queued'].includes(deliveryStatus)
      ),
  )
}

function hasMandateSignerDeliveryEvidence(signer = null) {
  if (!signer || typeof signer !== 'object') return false
  const status = normalizeKey(signer?.status || signer?.statusRaw)
  return Boolean(
    ['sent', 'viewed', 'signed', 'completed', 'complete'].includes(status) ||
      normalizeText(signer?.sent_at || signer?.sentAt || signer?.viewed_at || signer?.viewedAt || signer?.signed_at || signer?.signedAt || signer?.token_used_at || signer?.tokenUsedAt),
  )
}

function hasSellerOnboardingDurableSubmissionEvidence({ lead = {}, listing = {} } = {}) {
  const onboarding = listing?.sellerOnboarding && typeof listing.sellerOnboarding === 'object'
    ? listing.sellerOnboarding
    : lead?.sellerOnboarding && typeof lead.sellerOnboarding === 'object'
      ? lead.sellerOnboarding
      : {}
  const leadStatus = normalizeKey(lead?.sellerOnboardingStatus || lead?.seller_onboarding_status)
  const onboardingStatus = normalizeKey(onboarding?.status || onboarding?.onboardingStatus || onboarding?.onboarding_status)
  const listingStatus = normalizeKey(listing?.seller_onboarding_status || listing?.sellerOnboardingStatus)
  const submittedAt = firstPresent(
    lead?.sellerOnboardingSubmittedAt,
    lead?.seller_onboarding_submitted_at,
    lead?.sellerOnboardingCompletedAt,
    lead?.seller_onboarding_completed_at,
    onboarding?.submittedAt,
    onboarding?.submitted_at,
    onboarding?.completedAt,
    onboarding?.completed_at,
    listing?.seller_onboarding_submitted_at,
    listing?.sellerOnboardingSubmittedAt,
  )
  if (submittedAt) return true
  if (onboardingStatus && !SELLER_ONBOARDING_SUBMITTED_STATUSES.has(onboardingStatus)) return false
  if (listingStatus && !SELLER_ONBOARDING_SUBMITTED_STATUSES.has(listingStatus)) return false
  return Boolean(
    SELLER_ONBOARDING_SUBMITTED_STATUSES.has(onboardingStatus) ||
      SELLER_ONBOARDING_SUBMITTED_STATUSES.has(listingStatus) ||
      SELLER_ONBOARDING_SUBMITTED_STATUSES.has(leadStatus),
  )
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

function getCanonicalListingLifecycleStatus(listing = {}) {
  return normalizeKey(listing?.listingStatus || listing?.listing_status || listing?.lifecycleStatus || listing?.lifecycle_status)
}

function getListingLifecycleStatus(listing = {}) {
  return getCanonicalListingLifecycleStatus(listing) || normalizeKey(listing?.status)
}

function getListingSource(listing = {}) {
  return normalizeKey(listing?.source || listing?.listingSource || listing?.listing_source || listing?.createdFrom || listing?.created_from)
}

function isPreListingLifecycleStatus(status = '') {
  return PRE_LISTING_LIFECYCLE_STATUSES.has(normalizeKey(status))
}

function isOnboardingOnlyListingShell({ lead = {}, listing = {} } = {}) {
  const source = getListingSource(listing)
  const lifecycleStatus = getCanonicalListingLifecycleStatus(listing)
  const onboardingStatus = normalizeKey(
    listing?.sellerOnboarding?.status ||
      listing?.seller_onboarding?.status ||
      listing?.sellerOnboardingStatus ||
      listing?.seller_onboarding_status ||
      lead?.sellerOnboardingStatus ||
      lead?.seller_onboarding_status,
  )
  return Boolean(
    source === 'pipeline_seller_lead' ||
      (isPreListingLifecycleStatus(lifecycleStatus) && onboardingStatus && !SELLER_ONBOARDING_SUBMITTED_STATUSES.has(onboardingStatus)),
  )
}

export function isSellerLead(lead = {}) {
  return inferLeadCategoryFromRecord(lead, 'other') === 'seller'
}

function getSellerOnboardingSignals({ lead = {}, listing = {} } = {}) {
  const listingScopedStatus = normalizeKey(
    listing?.sellerOnboarding?.status ||
      listing?.seller_onboarding?.status ||
      listing?.sellerOnboardingStatus ||
      listing?.seller_onboarding_status,
  )
  const leadScopedStatus = normalizeKey(
    lead?.sellerOnboardingStatus ||
      lead?.seller_onboarding_status ||
      lead?.sellerOnboarding?.status ||
      lead?.seller_onboarding?.status,
  )
  const status = listingScopedStatus || leadScopedStatus
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
  const durableSubmitted = hasSellerOnboardingDurableSubmissionEvidence({ lead, listing })
  const listingLifecycleImpliesSubmitted = durableSubmitted && ['onboarding_completed', 'listing_review', 'mandate_ready', 'mandate_sent', 'mandate_signed', 'active', 'under_offer', 'transaction_created', 'sold'].includes(listingLifecycle)
  const sent = Boolean(
    token ||
      SELLER_ONBOARDING_SENT_STATUSES.has(status) ||
      leadJourneySignals.some((signal) => SELLER_ONBOARDING_SENT_STAGE_SIGNALS.has(signal) || signal === 'sent' || signal === 'in_progress') ||
      leadJourneySignals.some((signal) => SELLER_ONBOARDING_SUBMITTED_STAGE_SIGNALS.has(signal)) ||
      ['onboarding_sent', 'onboarding_completed', 'listing_review', 'mandate_ready', 'mandate_sent', 'mandate_signed', 'active', 'under_offer', 'transaction_created', 'sold'].includes(listingLifecycle),
  )
  const submitted = Boolean(
    durableSubmitted ||
      listingLifecycleImpliesSubmitted,
  )
  return {
    sent,
    submitted,
    status,
    token,
    pending: sent && !submitted && Boolean(status || token),
  }
}

function leadStageImpliesSubmittedOnboarding(leadStageIndex = 0, onboardingSignals = {}) {
  const submittedIndex = STAGE_INDEX.get('seller_onboarding_submitted') ?? 0
  if (leadStageIndex < submittedIndex) return false
  if (onboardingSignals.pending && !onboardingSignals.submitted) return false
  // Once a portal token/status exists, the portal row is the source of truth.
  // Do not use a stale CRM stage to convert "sent" into "submitted".
  if ((onboardingSignals.token || onboardingSignals.status) && !onboardingSignals.submitted) return false
  return true
}

function getMandateStatus({ lead = {}, listing = {}, mandatePacketStatus = {}, mandatePacket = null } = {}) {
  const packet = mandatePacket || mandatePacketStatus?.packet || lead?.mandatePacket || null
  const sourceContext = packet?.source_context_json && typeof packet.source_context_json === 'object'
    ? packet.source_context_json
    : mandatePacketStatus?.sourceContext && typeof mandatePacketStatus.sourceContext === 'object'
      ? mandatePacketStatus.sourceContext
    : {}
  const leadMandateStageSignals = [lead?.stage, lead?.status]
    .map(normalizeKey)
    .filter((status) => status.includes('mandate') || status.includes('signing') || status.includes('signature'))
  const mandateScopedStatuses = [
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
  ].map(normalizeKey)
  const statuses = [
    ...mandateScopedStatuses,
    ...leadMandateStageSignals,
  ]
  const onboardingStatus = normalizeKey(
    lead?.sellerOnboardingStatus ||
      lead?.seller_onboarding_status ||
      listing?.sellerOnboarding?.status ||
      listing?.seller_onboarding_status,
  )
  const onboardingStatusBlocksStatusOnlyMandate = Boolean(onboardingStatus && !SELLER_ONBOARDING_SUBMITTED_STATUSES.has(onboardingStatus))

  const rawSigners = mandatePacketStatus?.signingSummary?.signers || mandatePacketStatus?.signers || []
  const spouseRequirement = resolveMandateSpouseRequirementFromFields(mandatePacketStatus?.signingSummary?.fields || [])
  const signers = filterMandateSigningRows(rawSigners, {
    requiresSpouse: spouseRequirement ?? mandateRequiresSpouseSignature({ packet, sourceContext }),
  })
  const allSignersSigned = Boolean(mandatePacketStatus?.signingSummary?.allSignersSigned) ||
    (Array.isArray(signers) && signers.length > 0 && signers.every((signer) => normalizeKey(signer?.status || signer?.statusRaw).includes('signed')))
  const hasFinalArtifact = (Array.isArray(mandatePacketStatus?.versions) ? mandatePacketStatus.versions : []).some((version) =>
    firstPresent(version?.final_signed_file_path, version?.final_signed_file_url, version?.final_signed_file_access_url),
  )
  const mandatePacketRef = firstPresent(lead?.mandatePacketId, lead?.mandate_packet_id, listing?.mandatePacketId, listing?.mandate_packet_id, packet?.id)
  const allowStatusOnlyMandate = !onboardingStatusBlocksStatusOnlyMandate || Boolean(mandatePacketRef)
  const convertedToListing = statuses.some((status) => status.includes('converted_to_listing'))
  const hasExplicitSentEvidence = Boolean(
    firstPresent(
      lead?.mandateSentAt,
      lead?.mandate_sent_at,
      lead?.mandateSigningLink,
      lead?.mandateSignerLink,
      sourceContext?.emailDeliveryId,
      sourceContext?.email_delivery_id,
      sourceContext?.deliveryId,
      sourceContext?.delivery_id,
      sourceContext?.mandateSentAt,
      sourceContext?.mandate_sent_at,
      sourceContext?.mandateSigningLink,
      sourceContext?.mandate_signing_link,
      packet?.sentAt,
      packet?.sent_at,
      packet?.completedAt,
      packet?.completed_at,
    ) ||
      hasConfirmedMandateSendJob(mandatePacketStatus?.legalDocumentJob) ||
      (Array.isArray(signers) && signers.some(hasMandateSignerDeliveryEvidence)),
  )
  if (
    allSignersSigned ||
    hasFinalArtifact ||
    (mandatePacketRef && convertedToListing) ||
    (allowStatusOnlyMandate && statuses.some((status) => ['signed', 'signed_uploaded', 'completed', 'fully_signed', 'uploaded_signed'].includes(status) || status.includes('mandate_signed')))
  ) {
    return 'signed'
  }
  if (
    mandatePacketRef ||
    (allowStatusOnlyMandate && statuses.some((status) => ['sent', 'generated', 'ready', 'ready_for_generation', 'partially_signed', 'sent_to_seller', 'sent_to_agent'].includes(status) || status.includes('mandate_sent')))
  ) {
    if (
      mandatePacketRef &&
      mandateScopedStatuses.some(isPreSendMandateState) &&
      !hasExplicitSentEvidence
    ) return 'draft'
    return hasExplicitSentEvidence ? 'sent' : 'draft'
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
  const canonicalStatus = getCanonicalListingLifecycleStatus(listing)
  if (isPreListingLifecycleStatus(canonicalStatus)) return false
  const status = canonicalStatus || normalizeKey(listing?.status)
  const visibility = normalizeKey(listing?.listingVisibility || listing?.listing_visibility)
  return Boolean(
    LIVE_LISTING_LIFECYCLE_STATUSES.has(status) ||
      visibility === 'active_market' ||
      listing?.isActive ||
      listing?.is_active,
  )
}

function hasListingShell({ lead = {}, listing = {} } = {}) {
  if (listing && readListingId(listing)) return listingBelongsToLead(listing, lead) || Boolean(firstPresent(lead?.listingId, lead?.listing_id))
  return Boolean(firstPresent(lead?.listingId, lead?.listing_id, lead?.privateListingId, lead?.private_listing_id))
}

function hasListingCreated({ lead = {}, listing = {}, mandateStatus = '' } = {}) {
  if (!hasListingShell({ lead, listing })) return false
  if (hasDirectListingPortalIntake(listing)) return true
  if (isOnboardingOnlyListingShell({ lead, listing })) return false
  const status = getListingLifecycleStatus(listing)
  const source = getListingSource(listing)
  const explicitListingSource = [
    'pipeline_seller_conversion',
    'direct_listing',
    'private_listing',
    'agent_listing',
    'manual_listing',
  ].includes(source)
  const listingStatusShowsDraft = LISTING_CREATED_LIFECYCLE_STATUSES.has(status)
  return Boolean(mandateStatus === 'signed' || explicitListingSource || listingStatusShowsDraft)
}

function laterSellerJourneyStage(left = null, right = null) {
  const leftIndex = STAGE_INDEX.get(left?.key) ?? 0
  const rightIndex = STAGE_INDEX.get(right?.key) ?? 0
  return rightIndex > leftIndex ? right : left
}

export function getSellerJourneyStage({ lead = {}, listing = null, mandatePacketStatus = null, mandatePacket = null } = {}) {
  if (!isSellerLead(lead)) return null
  const leadStage = getSellerJourneyStageFromLead(lead)
  const onboardingSignals = getSellerOnboardingSignals({ lead, listing })
  const mandateStatus = getMandateStatus({ lead, listing, mandatePacketStatus, mandatePacket })
  const listingCreated = hasListingCreated({ lead, listing, mandateStatus })
  const documentsSubmitted = areSellerJourneyDocumentsSubmitted({
    listing,
    documents: [
      ...(Array.isArray(listing?.documents) ? listing.documents : []),
    ],
  })

  let derivedStage = null
  if (listingCreated && isListingLive(listing || lead) && documentsSubmitted) derivedStage = sellerJourneyStageSnapshot('documents_submitted', 'Submitted')
  else if (listingCreated && isListingLive(listing || lead)) derivedStage = sellerJourneyStageSnapshot('listing_live', 'Live')
  else if (listingCreated) derivedStage = sellerJourneyStageSnapshot('listing_created', 'Draft')
  else if (mandateStatus === 'signed') derivedStage = sellerJourneyStageSnapshot('mandate_signed', 'Signed')
  if (!derivedStage && ['sent', 'draft'].includes(mandateStatus)) derivedStage = sellerJourneyStageSnapshot('seller_onboarding_submitted', 'Submitted')
  if (!derivedStage && onboardingSignals.submitted) derivedStage = sellerJourneyStageSnapshot('seller_onboarding_submitted', 'Submitted')
  if (!derivedStage && onboardingSignals.sent) derivedStage = sellerJourneyStageSnapshot('seller_onboarding_sent', onboardingSignals.status === 'in_progress' ? 'In Progress' : 'Sent')
  const evidenceStage = derivedStage || sellerJourneyStageSnapshot('new_lead', 'New')
  const leadStageIndex = STAGE_INDEX.get(leadStage?.key) ?? 0
  const listingCreatedIndex = STAGE_INDEX.get('listing_created') ?? 0
  const onboardingSubmittedIndex = STAGE_INDEX.get('seller_onboarding_submitted') ?? 0
  if (onboardingSignals.pending && !onboardingSignals.submitted && leadStageIndex >= onboardingSubmittedIndex) {
    return evidenceStage
  }
  const resolvedListingCreated = Boolean(
    listing &&
      readListingId(listing) &&
      hasListingCreated({ lead, listing, mandateStatus }),
  )
  const canUseLeadStageAsProgressFloor =
    (leadStageIndex < listingCreatedIndex || resolvedListingCreated)
  return canUseLeadStageAsProgressFloor ? laterSellerJourneyStage(evidenceStage, leadStage) : evidenceStage
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
  const normalized = normalizeSellerDocumentRequirementStatus(status)
  if (normalized === 'approved') return 'Approved'
  if (normalized === 'completed') return 'Completed'
  if (normalized === 'uploaded') return 'Uploaded'
  if (normalized === 'under_review') return 'Under Review'
  if (normalized === 'requested') return 'Requested'
  if (normalized === 'rejected') return 'Rejected'
  if (normalized === 'required') return 'Outstanding'
  if (normalized === 'not_applicable') return 'Not Applicable'
  if (!normalized) return 'Outstanding'
  return normalizeText(status).replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function isDocumentOutstanding(document = {}) {
  if (document?.required === false || document?.applicable === false) return false
  const status = normalizeSellerDocumentRequirementStatus(document?.status || document?.documentStatus || document?.document_status)
  if (status === 'not_applicable') return false
  if (['approved', 'completed', 'uploaded', 'under_review'].includes(status)) return false
  if (status === 'rejected') return true
  return !document?.url
}

function resolveSellerStageStartedAt({ stageKey = '', lead = {}, mandatePacketStatus = {}, mandatePacket = null, listing = null } = {}) {
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
  return firstDate(lead?.firstContactedAt, lead?.first_contacted_at, lead?.createdAt, lead?.created_at)
}

export function buildSellerDocuments({ listing = {}, documents = [] } = {}) {
  const rows = buildSellerDocumentRequirementRows({ listing, documents })
  return rows.map((row) => {
    const key = normalizeKey(row?.key || row?.requirementKey || row?.requirement_key)
    const displayLabel = key === 'title_deed_copy' ? 'Title Deed' : row?.label || row?.title
    return {
      ...row,
      title: displayLabel || row?.title,
      label: displayLabel || row?.label,
      status: normalizeDocumentStatusLabel(row?.status),
      statusLabel: row?.statusLabel || normalizeDocumentStatusLabel(row?.status),
    }
  })
}

export function areSellerJourneyDocumentsSubmitted({ listing = {}, documents = [] } = {}) {
  const rows = buildSellerDocuments({ listing, documents })
  const applicableRequiredRows = rows.filter((document) => document?.required !== false && document?.applicable !== false)
  if (!applicableRequiredRows.length) return false
  return applicableRequiredRows.every((document) => !isDocumentOutstanding(document))
}

export function buildListingJourney(listing = {}) {
  const canonicalStatus = getCanonicalListingLifecycleStatus(listing)
  const status = canonicalStatus || normalizeKey(listing?.status)
  const visibility = normalizeKey(listing?.listingVisibility || listing?.listing_visibility)
  const isPreListing = isPreListingLifecycleStatus(canonicalStatus)
  const published = !isPreListing && (visibility === 'active_market' || ['active', 'under_offer', 'transaction_created', 'sold'].includes(status))
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

export function getSellerJourneyActions({ lead = {}, contact = {}, listing = null, mandatePacketStatus = null } = {}) {
  const onboardingSignals = getSellerOnboardingSignals({ lead, listing })
  const mandateStatus = getMandateStatus({ lead, listing, mandatePacketStatus })
  const leadStage = getSellerJourneyStageFromLead(lead)
  const leadStageIndex = STAGE_INDEX.get(leadStage?.key) ?? 0
  const listingCreated = hasListingCreated({ lead, listing, mandateStatus })
  const onboardingSubmittedForProgress = onboardingSignals.submitted ||
    leadStageImpliesSubmittedOnboarding(leadStageIndex, onboardingSignals) ||
    mandateStatus !== 'not_started'
  const live = listingCreated && isListingLive(listing || lead)
  const sellerPortalToken = firstPresent(lead?.sellerOnboardingToken, lead?.seller_onboarding_token, listing?.sellerOnboarding?.token)
  const canContact = Boolean(firstPresent(contact?.phone, lead?.phone, contact?.email, lead?.email, lead?.sellerPhone, lead?.sellerEmail))
  return [
    { id: 'contact_seller', label: 'Contact Seller', enabled: canContact },
    { id: 'send_onboarding', label: 'Send Seller Onboarding', enabled: !onboardingSignals.sent },
    { id: 'open_documents', label: 'Open Documents', enabled: onboardingSubmittedForProgress || mandateStatus !== 'not_started' },
    { id: 'create_listing', label: 'Create Listing', enabled: !listingCreated },
    { id: 'open_listing', label: 'Open Listing', enabled: listingCreated },
    { id: 'activate_listing', label: 'Activate Listing', enabled: listingCreated && !live && mandateStatus === 'signed' },
    { id: 'open_seller_portal', label: 'Track Seller Onboarding', enabled: Boolean(sellerPortalToken) },
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

export function buildSellerJourney({ lead = {}, contact = {}, listing = null, mandatePacketStatus = null, mandatePacket = null, documents = [] } = {}) {
  const stage = getSellerJourneyStage({ lead, listing, mandatePacketStatus, mandatePacket }) || { key: 'new_lead', label: 'New Lead', status: '' }
  const onboardingSignals = getSellerOnboardingSignals({ lead, listing })
  const mandateStatus = getMandateStatus({ lead, listing, mandatePacketStatus, mandatePacket })
  const listingCreated = hasListingCreated({ lead, listing, mandateStatus })
  const listingLive = listingCreated && isListingLive(listing || lead)
  const sellerDocuments = buildSellerDocuments({ listing, documents })
  const documentsOutstanding = sellerDocuments.filter(isDocumentOutstanding).length
  const documentsSubmitted = sellerDocuments.length > 0 && documentsOutstanding === 0
  const leadStage = getSellerJourneyStageFromLead(lead)
  const leadStageIndex = STAGE_INDEX.get(leadStage?.key) ?? 0
  const contactedIndex = STAGE_INDEX.get('contacted') ?? 1
  const leadIsExplicitlyNew = leadStage?.key === 'new_lead' && ['new', 'created', 'lead'].includes(normalizeKey(leadStage?.status))
  const onboardingSubmittedForProgress = onboardingSignals.submitted ||
    leadStageImpliesSubmittedOnboarding(leadStageIndex, onboardingSignals) ||
    mandateStatus !== 'not_started'
  const contactedForProgress = Boolean(
    (!leadIsExplicitlyNew && leadStageIndex >= contactedIndex) ||
      onboardingSignals.sent ||
      mandateStatus !== 'not_started' ||
      listingCreated,
  )
  const evidence = {
    new_lead: isSellerLead(lead),
    new_leadStatus: 'Created',
    contacted: contactedForProgress,
    contactedStatus: contactedForProgress ? 'Active' : '',
    seller_onboarding_sent: onboardingSignals.sent,
    seller_onboarding_sentStatus: onboardingSignals.status === 'in_progress' ? 'In Progress' : onboardingSignals.sent ? 'Sent' : '',
    seller_onboarding_submitted: onboardingSubmittedForProgress,
    seller_onboarding_submittedStatus: onboardingSubmittedForProgress ? 'Submitted' : '',
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
  const actions = getSellerJourneyActions({ lead, contact, listing, mandatePacketStatus })
  const nextRecommendedAction = actions.find((action) => action.enabled && !['contact_seller', 'open_seller_portal'].includes(action.id)) ||
    actions.find((action) => action.enabled) ||
    null
  const currentStageStartedAt = resolveSellerStageStartedAt({
    stageKey: stage.key,
    lead,
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
    status: getSellerJourneyStatus({ lead, listing, mandatePacketStatus, mandatePacket }),
    steps,
    mandateStatus,
    onboardingSent: onboardingSignals.sent,
    onboardingSubmitted: onboardingSubmittedForProgress,
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
    sellerPortalStatus,
    kpis,
    workspaceKpis,
    actions,
  }
}

function matchingListingForLead(lead = {}, listings = []) {
  return (Array.isArray(listings) ? listings : []).find((listing) => listingBelongsToLead(listing, lead)) || null
}

export function getSellerJourneyMetrics({ leads = [], listings = [], mandatePacketsByLeadId = new Map() } = {}) {
  const sellerLeads = (Array.isArray(leads) ? leads : []).filter(isSellerLead)
  const journeys = sellerLeads.map((lead) => {
    const leadId = readLeadId(lead)
    return buildSellerJourney({
      lead,
      listing: matchingListingForLead(lead, listings),
      mandatePacketStatus: mandatePacketsByLeadId instanceof Map ? mandatePacketsByLeadId.get(leadId) : null,
    })
  })
  return {
    sellerLeads: sellerLeads.length,
    mandatesSent: journeys.filter((journey) => ['sent', 'signed'].includes(journey.mandateStatus)).length,
    mandatesSigned: journeys.filter((journey) => journey.mandateStatus === 'signed').length,
    listingsCreated: journeys.filter((journey) => journey.listingCreated).length,
    listingsLive: journeys.filter((journey) => journey.listingLive).length,
  }
}

export const __sellerJourneyServiceTestUtils = {
  buildJourneySteps,
  getMandateStatus,
  hasListingCreated,
  isListingLive,
  listingBelongsToLead,
  resolveSellerStageStartedAt,
}
