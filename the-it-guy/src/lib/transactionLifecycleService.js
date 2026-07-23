import { generateId } from './agentListingStorage'
import { isUnsafeFallbackAllowed } from './envValidation'
import { assertMvpAtomicTransactionCreation } from '../core/transactions/mvpAtomicTransactionCreation'
import { isSupabaseConfigured, supabase } from './supabaseClient'
import { resolveTransactionRoutingProfile } from '../services/transactionRoutingProfileService.js'
import { WorkspaceContextError, logUnsafeFallbackBlocked } from '../services/workspaceResolutionService'
import { prepareMvpTransactionCreationCommand } from '../core/transactions/mvpTransactionCreationCommand.js'
import { buildMvpTransactionParticipantBootstrap, MVP_CONTROLLED_TEST_ROLE_SET } from '../core/transactions/mvpTransactionParticipantBootstrap.js'
import { buildMvpTransactionDocumentBootstrap } from '../core/transactions/mvpTransactionDocumentBootstrap.js'
import { buildMvpTransactionWorkflowBootstrap } from '../core/transactions/mvpTransactionWorkflowBootstrap.js'
import { assessMvpTestDataProtection, assertMvpTestDataProtection } from '../core/transactions/mvpTestDataProtection.js'
import { assertMvpPilotCreationAllowed } from './mvpPilotCreationFreeze.js'

const KEY_AGENT_DEMO_TRANSACTIONS = 'itg:agent-demo-transactions:v1'
const KEY_TRANSACTION_LIFECYCLE_EVENTS = 'itg:transaction-lifecycle-events:v1'

const DEFAULT_AGENT_SPLIT_PERCENTAGE = 70
const CLIENT_INTAKE_PREFERENCE = {
  DIGITAL_PORTAL: 'digital_portal',
  AGENT_ASSISTED: 'agent_assisted',
  HARD_COPY: 'hard_copy',
}

function readJson(key, fallback) {
  if (typeof window === 'undefined') return fallback
  if (!isUnsafeFallbackAllowed()) {
    logUnsafeFallbackBlocked({
      service: 'transactionLifecycleService.readJson',
      missingContextType: 'transaction_persistence',
      attemptedFallbackType: 'local_transaction_snapshot',
      metadata: { storageKey: key },
    })
    return fallback
  }
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  if (typeof window === 'undefined') return
  if (!isUnsafeFallbackAllowed()) {
    logUnsafeFallbackBlocked({
      service: 'transactionLifecycleService.writeJson',
      missingContextType: 'transaction_persistence',
      attemptedFallbackType: 'local_transaction_snapshot_write',
      metadata: { storageKey: key },
    })
    return
  }
  window.localStorage.setItem(key, JSON.stringify(value))
}

function normalize(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalize(value).toLowerCase()
}

const TRANSACTION_IDENTITY_SELECT = 'id, organisation_id, accepted_offer_id, listing_id, originating_lead_id, originating_buyer_lead_id, stage, current_main_stage, finance_type, assigned_agent_email, buyer_id, created_at, updated_at'

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalize(value))
}

function isMissingColumnError(error, columnName = '') {
  const code = String(error?.code || '').trim()
  const message = String(error?.message || '').toLowerCase()
  const detail = String(error?.details || '').toLowerCase()
  const hint = String(error?.hint || '').toLowerCase()
  const token = normalizeLower(columnName)

  if (!token) {
    return code === '42703' || message.includes('column') && message.includes('does not exist')
  }

  return (
    code === '42703' ||
    message.includes(`column "${token}"`) ||
    message.includes(`column ${token}`) ||
    detail.includes(`column "${token}"`) ||
    detail.includes(`column ${token}`) ||
    hint.includes(`column "${token}"`) ||
    hint.includes(`column ${token}`)
  )
}

function isMissingTableError(error, tableName = '') {
  const code = String(error?.code || '').trim()
  const message = String(error?.message || '').toLowerCase()
  const token = normalizeLower(tableName)
  if (!token) {
    return code === '42P01'
  }
  return code === '42P01' || message.includes(`relation "${token}"`) || message.includes(`relation ${token}`)
}

function isInvalidTextRepresentation(error) {
  return String(error?.code || '').trim() === '22P02'
}

function asNumber(value) {
  const next = Number(value)
  return Number.isFinite(next) ? next : null
}

function money(value) {
  const amount = Number(value || 0)
  return Number.isFinite(amount) ? Math.max(0, amount) : 0
}

function normalizeFinanceType(value) {
  const key = normalize(value).toLowerCase()
  if (key === 'hybrid') return 'combination'
  if (key === 'bond') return 'bond'
  if (key === 'cash') return 'cash'
  if (key === 'combination') return 'combination'
  return 'unknown'
}

function normalizePurchaserType(value) {
  const key = normalize(value).toLowerCase().replace(/[\s-]+/g, '_')
  if (['company', 'pty_ltd', 'pty', 'business'].includes(key)) return 'company'
  if (['trust', 'family_trust'].includes(key)) return 'trust'
  return 'individual'
}

function normalizeClientIntakePreference(value) {
  const key = normalize(value).toLowerCase().replace(/[\s-]+/g, '_')
  if (['agent', 'assisted', 'agent_assisted', 'assisted_capture'].includes(key)) {
    return CLIENT_INTAKE_PREFERENCE.AGENT_ASSISTED
  }
  if (['hard_copy', 'hardcopy', 'paper', 'printed'].includes(key)) {
    return CLIENT_INTAKE_PREFERENCE.HARD_COPY
  }
  return CLIENT_INTAKE_PREFERENCE.DIGITAL_PORTAL
}

function getClientIntakePreferenceLabel(value) {
  const normalized = normalizeClientIntakePreference(value)
  if (normalized === CLIENT_INTAKE_PREFERENCE.AGENT_ASSISTED) return 'Agent Assisted'
  if (normalized === CLIENT_INTAKE_PREFERENCE.HARD_COPY) return 'Hard Copy'
  return 'Digital Portal'
}

function resolveOnboardingStatusForPreference(value) {
  const normalized = normalizeClientIntakePreference(value)
  if (normalized === CLIENT_INTAKE_PREFERENCE.AGENT_ASSISTED) return 'agent_assisted_pending'
  if (normalized === CLIENT_INTAKE_PREFERENCE.HARD_COPY) return 'hard_copy_pending'
  return 'awaiting_client_onboarding'
}

function resolveNextActionForPreference(value) {
  const normalized = normalizeClientIntakePreference(value)
  if (normalized === CLIENT_INTAKE_PREFERENCE.AGENT_ASSISTED) return 'Capture buyer onboarding with the client and prepare OTP intake'
  if (normalized === CLIENT_INTAKE_PREFERENCE.HARD_COPY) return 'Prepare hard-copy onboarding pack and capture OTP intake manually'
  return 'Send buyer onboarding and prepare OTP intake'
}

function compactObject(value = {}) {
  return Object.fromEntries(
    Object.entries(value || {}).filter(([, item]) => item !== undefined),
  )
}

function toPersistedFinanceType(value) {
  const normalized = normalize(value).toLowerCase()
  if (normalized === 'combination') return 'hybrid'
  if (['cash', 'bond', 'hybrid', 'developer', 'unknown'].includes(normalized)) return normalized
  return normalizeFinanceType(value)
}

function buildTransactionRoutingProfileContext({ listing = null, offerRecord = null, lead = null, payload = {} } = {}) {
  return {
    transaction: payload?.transaction || {},
    listing,
    offer: {
      ...(offerRecord || {}),
      financeType: payload?.financeType || offerRecord?.offer?.financeType || offerRecord?.financeType,
      offer: offerRecord?.offer || {},
    },
    buyerLead: lead,
    sellerLead: payload?.sellerLead || listing?.sellerLead || null,
    sellerOnboarding: listing?.sellerOnboarding || payload?.sellerOnboarding || null,
    financeType: payload?.financeType,
    transactionType: payload?.transactionType || payload?.transaction_type,
    propertyTenure: payload?.propertyTenure || payload?.property_tenure,
    vatTreatment: payload?.vatTreatment || payload?.vat_treatment,
    buyerEntityType: payload?.buyerEntityType || payload?.purchaserType || payload?.purchaser_type,
    sellerEntityType: payload?.sellerEntityType || payload?.sellerType || payload?.seller_type,
    sellerHasExistingBond: payload?.sellerHasExistingBond ?? payload?.seller_has_existing_bond,
    cancellationRequired: payload?.cancellationRequired ?? payload?.cancellation_required,
  }
}

function resolveRoutingProfileForTransaction({ listing = null, offerRecord = null, lead = null, payload = {} } = {}) {
  if (payload?.routingProfile && typeof payload.routingProfile === 'object') return payload.routingProfile
  if (payload?.routing_profile && typeof payload.routing_profile === 'object') return payload.routing_profile
  return resolveTransactionRoutingProfile(buildTransactionRoutingProfileContext({ listing, offerRecord, lead, payload }))
}

function buildRoutingProfileTransactionFields(profile = {}) {
  const financeType = toPersistedFinanceType(profile.financeType)
  return compactObject({
    finance_type: financeType || null,
    transaction_type: profile.transactionType && profile.transactionType !== 'unknown' ? profile.transactionType : undefined,
    property_type: profile.propertyTenure && profile.propertyTenure !== 'unknown' ? profile.propertyTenure : undefined,
    property_tenure: profile.propertyTenure && profile.propertyTenure !== 'unknown' ? profile.propertyTenure : undefined,
    purchaser_type: profile.buyerEntityType && profile.buyerEntityType !== 'unknown' ? profile.buyerEntityType : undefined,
    seller_type: profile.sellerEntityType && profile.sellerEntityType !== 'unknown' ? profile.sellerEntityType : undefined,
    seller_has_existing_bond: Boolean(profile.sellerHasExistingBond),
    existing_bond: Boolean(profile.sellerHasExistingBond),
    cancellation_required: Boolean(profile.cancellationRequired),
    vat_treatment: profile.vatTreatment && profile.vatTreatment !== 'unknown' ? profile.vatTreatment : undefined,
    routing_profile_version: profile.version || undefined,
    routing_profile_json: profile,
  })
}

function removeRoutingProfileTransactionFields(payload = {}) {
  const next = { ...payload }
  for (const key of [
    'property_tenure',
    'seller_type',
    'seller_has_existing_bond',
    'existing_bond',
    'cancellation_required',
    'vat_treatment',
    'routing_profile_version',
    'routing_profile_json',
  ]) {
    delete next[key]
  }
  return next
}

function resolveInitialMainStage(stageValue) {
  const normalized = normalize(stageValue).toLowerCase()
  if (!normalized || normalized === 'available') return 'AVAIL'
  if (normalized === 'registered') return 'REG'
  if (normalized.includes('otp') || normalized.includes('onboarding')) return 'OTP'
  return 'DEP'
}

function getOrganisationId(input = {}) {
  return normalize(input?.organisationId || input?.listing?.organisationId || input?.offerRecord?.organisationId || null) || null
}

function resolveCommissionSnapshot({
  offerAmount = 0,
  listing = null,
  payload = {},
} = {}) {
  const grossCommissionPercentage =
    asNumber(payload?.grossCommissionPercentage) ??
    asNumber(payload?.gross_commission_percentage) ??
    asNumber(listing?.commission?.commission_percentage) ??
    null

  const grossCommissionAmount =
    asNumber(payload?.grossCommissionAmount) ??
    asNumber(payload?.gross_commission_amount) ??
    (grossCommissionPercentage !== null ? Number(((offerAmount * grossCommissionPercentage) / 100).toFixed(2)) : null)

  const agentSplitPercentage =
    asNumber(payload?.agentSplitPercentage) ??
    asNumber(payload?.agent_split_percentage_snapshot) ??
    asNumber(listing?.commission?.agent_split_percentage) ??
    DEFAULT_AGENT_SPLIT_PERCENTAGE

  const normalizedAgentSplit = Math.max(0, Math.min(100, Number(agentSplitPercentage || 0)))
  const agencySplitPercentage =
    asNumber(payload?.agencySplitPercentage) ??
    asNumber(payload?.agency_split_percentage_snapshot) ??
    Math.max(0, Number((100 - normalizedAgentSplit).toFixed(2)))

  const agentCommissionAmount =
    asNumber(payload?.agentCommissionAmount) ??
    asNumber(payload?.agent_commission_amount) ??
    (grossCommissionAmount !== null ? Number(((grossCommissionAmount * normalizedAgentSplit) / 100).toFixed(2)) : null)

  const agencyCommissionAmount =
    asNumber(payload?.agencyCommissionAmount) ??
    asNumber(payload?.agency_commission_amount) ??
    (grossCommissionAmount !== null ? Number((grossCommissionAmount - (agentCommissionAmount || 0)).toFixed(2)) : null)

  return {
    gross_commission_percentage: grossCommissionPercentage,
    gross_commission_amount: grossCommissionAmount,
    agent_split_percentage_snapshot: normalizedAgentSplit,
    agency_split_percentage_snapshot: agencySplitPercentage,
    agent_commission_amount: agentCommissionAmount,
    agency_commission_amount: agencyCommissionAmount,
    commission_snapshot_source: grossCommissionAmount !== null ? 'snapshot' : 'missing',
  }
}

function appendTransactionRow(transactionRow) {
  const existing = readJson(KEY_AGENT_DEMO_TRANSACTIONS, [])
  const rows = Array.isArray(existing) ? existing : []
  const nextRows = [transactionRow, ...rows.filter((row) => String(row?.transaction?.id || '') !== String(transactionRow?.transaction?.id || ''))]
  writeJson(KEY_AGENT_DEMO_TRANSACTIONS, nextRows)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('itg:transaction-updated'))
    window.dispatchEvent(new Event('itg:transaction-created'))
  }
}

function appendLifecycleEvent(event) {
  const existing = readJson(KEY_TRANSACTION_LIFECYCLE_EVENTS, [])
  const rows = Array.isArray(existing) ? existing : []
  writeJson(KEY_TRANSACTION_LIFECYCLE_EVENTS, [event, ...rows].slice(0, 1000))
}

function buildTransactionRow({
  listing = null,
  offerRecord = null,
  lead = null,
  actor = null,
  payload = {},
  source = 'manual_override',
} = {}) {
  const transactionId = generateId('transaction')
  const onboardingToken = `buyer-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
  const onboardingUrl = `${typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://app.arch9.co.za'}/client/onboarding/${onboardingToken}`

  const offerAmount = money(
    payload?.offerAmount ??
      payload?.purchasePrice ??
      payload?.dealValue ??
      offerRecord?.offer?.offerAmount ??
      listing?.askingPrice ??
      lead?.estimatedValue ??
      lead?.budget ??
      0,
  )
  const commissionSnapshot = resolveCommissionSnapshot({
    offerAmount,
    listing,
    payload,
  })

  const nowIso = new Date().toISOString()
  const matterNumber = `MAT-${new Date(nowIso).getFullYear()}-${String(Date.now()).slice(-6)}`
  const stage = normalize(payload?.stage || '') || 'Reserved'
  const mainStage = resolveInitialMainStage(stage)
  const organisationId = getOrganisationId({ organisationId: payload?.organisationId, listing, offerRecord })
  const routingProfile = resolveRoutingProfileForTransaction({ listing, offerRecord, lead, payload })
  const routingFields = buildRoutingProfileTransactionFields(routingProfile)
  const clientIntakePreference = normalizeClientIntakePreference(payload?.clientIntakePreference || payload?.deliveryMode)
  const onboardingStatus = resolveOnboardingStatusForPreference(clientIntakePreference)
  const onboardingNextAction = resolveNextActionForPreference(clientIntakePreference)
  const onboardingLabel = getClientIntakePreferenceLabel(clientIntakePreference)

  const assignedAgentId = normalize(
    payload?.assignedAgentId || listing?.assignedAgentId || lead?.assignedAgentId || actor?.id || offerRecord?.agentId || null,
  )
  const assignedAgentName = normalize(
    payload?.assignedAgentName || listing?.assignedAgentName || lead?.assignedAgentName || actor?.name || listing?.assignedAgent || 'Agent',
  )
  const assignedAgentEmail = normalize(
    payload?.assignedAgentEmail || listing?.assignedAgentEmail || lead?.assignedAgentEmail || actor?.email || null,
  ).toLowerCase()

  const buyerName = normalize(
    payload?.buyerName || offerRecord?.buyer?.fullName || lead?.contactName || `${lead?.firstName || ''} ${lead?.lastName || ''}`,
  ) || 'Buyer pending'

  const workflowHealthIssues = []
  if (!normalize(offerRecord?.id || payload?.acceptedOfferId)) {
    workflowHealthIssues.push('missing_accepted_offer')
  }
  if (!normalize(listing?.id || payload?.listingId)) {
    workflowHealthIssues.push('missing_listing')
  }
  if (!commissionSnapshot.gross_commission_amount) {
    workflowHealthIssues.push('missing_commission_snapshot')
  }

  const transactionRow = {
    unit: {
      id: String(listing?.id || payload?.listingId || ''),
      development_id: listing?.developmentId || null,
      unit_number: listing?.listingTitle || payload?.listingTitle || 'Listing',
      price: offerAmount,
      list_price: money(listing?.askingPrice || offerAmount),
      status: stage,
      created_at: nowIso,
      updated_at: nowIso,
    },
    development: listing?.developmentId
      ? {
          id: listing?.developmentId,
          name: listing?.developmentName || 'Development',
          location: listing?.suburb || '',
        }
      : null,
    transaction: {
      id: transactionId,
      matter_number: matterNumber,
      transaction_reference: `AG-${String(transactionId).slice(-6).toUpperCase()}`,
      transaction_type: routingProfile.transactionType && routingProfile.transactionType !== 'unknown'
        ? routingProfile.transactionType
        : listing?.developmentId ? 'development_sale' : 'private_sale',
      development_id: listing?.developmentId || null,
      unit_id: listing?.id || payload?.listingId || null,
      buyer_id: offerRecord?.buyerLeadId || payload?.originatingBuyerLeadId || lead?.leadId || null,
      property_address_line_1: listing?.propertyAddress || listing?.listingTitle || payload?.propertyAddress || null,
      suburb: listing?.suburb || payload?.suburb || null,
      city: listing?.city || payload?.city || null,
      province: listing?.province || payload?.province || null,
      property_description: listing?.listingTitle || payload?.propertyDescription || null,
      sales_price: offerAmount,
      purchase_price: offerAmount,
      finance_type: routingFields.finance_type || normalizeFinanceType(payload?.financeType || offerRecord?.offer?.financeType || null),
      purchaser_type: routingFields.purchaser_type || 'individual',
      property_type: routingFields.property_type || listing?.propertyType || payload?.propertyType || null,
      property_tenure: routingFields.property_tenure || null,
      seller_type: routingFields.seller_type || null,
      seller_has_existing_bond: routingFields.seller_has_existing_bond || false,
      existing_bond: routingFields.existing_bond || false,
      cancellation_required: routingFields.cancellation_required || false,
      vat_treatment: routingFields.vat_treatment || null,
      routing_profile_version: routingFields.routing_profile_version || null,
      routing_profile_json: routingProfile,
      stage,
      current_main_stage: mainStage,
      next_action: workflowHealthIssues.length ? 'Resolve workflow health warnings' : onboardingNextAction,
      comment:
        source === 'accepted_offer'
          ? `Transaction auto-created from accepted offer. Client intake mode: ${onboardingLabel}.`
          : 'Transaction created from lead with manual override (accepted offer missing).',
      assigned_agent: assignedAgentName || null,
      assigned_agent_email: assignedAgentEmail || null,
      lifecycle_state: 'active',
      is_active: true,
      onboarding_status: onboardingStatus,
      onboarding_token: onboardingToken,
      onboarding_url: onboardingUrl,
      transaction_workflow_stage: 'created',
      organisation_id: organisationId,
      listing_id: listing?.id || payload?.listingId || null,
      originating_buyer_lead_id: offerRecord?.buyerLeadId || payload?.originatingBuyerLeadId || lead?.leadId || null,
      originating_seller_lead_id: listing?.sellerLeadId || payload?.originatingSellerLeadId || null,
      accepted_offer_id: offerRecord?.id || payload?.acceptedOfferId || null,
      assigned_agent_id: assignedAgentId || null,
      buyer_contact_id: payload?.buyerContactId || null,
      seller_contact_id: payload?.sellerContactId || null,
      otp_packet_id: payload?.otpPacketId || null,
      mandate_packet_id: payload?.mandatePacketId || listing?.mandatePacketId || null,
      commission_snapshot_id: payload?.commissionSnapshotId || null,
      originating_lead_id: payload?.originatingLeadId || payload?.originatingBuyerLeadId || lead?.leadId || null,
      gross_commission_percentage: commissionSnapshot.gross_commission_percentage,
      gross_commission_amount: commissionSnapshot.gross_commission_amount,
      agent_split_percentage_snapshot: commissionSnapshot.agent_split_percentage_snapshot,
      agency_split_percentage_snapshot: commissionSnapshot.agency_split_percentage_snapshot,
      agent_commission_amount: commissionSnapshot.agent_commission_amount,
      agency_commission_amount: commissionSnapshot.agency_commission_amount,
      commission_snapshot_source: commissionSnapshot.commission_snapshot_source,
      workflow_health_issues: workflowHealthIssues,
      client_intake_preference: clientIntakePreference,
      created_at: nowIso,
      updated_at: nowIso,
    },
    buyer: {
      id: offerRecord?.buyerLeadId || payload?.originatingBuyerLeadId || lead?.leadId || `buyer-${String(offerRecord?.id || transactionId).slice(-8)}`,
      name: buyerName,
      phone: offerRecord?.buyer?.phone || payload?.buyerPhone || '',
      email: offerRecord?.buyer?.email || payload?.buyerEmail || '',
    },
    seller: listing?.seller || null,
    stage,
    mainStage,
    onboarding: {
      status: 'not_started',
      deliveryMode: clientIntakePreference,
    },
    documentSummary: {
      uploadedCount: 0,
      totalRequired: 0,
      missingCount: 0,
    },
  }

  return {
    transactionRow,
    onboardingToken,
    onboardingUrl,
    transactionId,
  }
}

export function createTransactionFromAcceptedOffer({
  listing,
  offerRecord,
  actor = null,
  payload = {},
} = {}) {
  assertMvpPilotCreationAllowed({ operation: 'create a transaction from an accepted offer' })
  if (!listing) {
    throw new Error('Listing not found.')
  }
  if (!offerRecord) {
    throw new Error('Offer record not found.')
  }

  const routingProfile = resolveRoutingProfileForTransaction({ listing, offerRecord, payload })
  prepareMvpTransactionCreationCommand({
    routingProfile,
    organisationId: getOrganisationId({ listing, offerRecord, payload }),
    listingId: listing?.id || payload?.listingId,
    leadId: offerRecord?.buyerLeadId || payload?.originatingBuyerLeadId,
    acceptedOfferId: offerRecord?.id || payload?.acceptedOfferId,
    assignedAgentId: payload?.assignedAgentId || listing?.assignedAgentId || offerRecord?.agentId || actor?.id,
    assignedAgentEmail: payload?.assignedAgentEmail || listing?.assignedAgentEmail || actor?.email,
    idempotencyKey: payload?.idempotencyKey,
  })

  const created = buildTransactionRow({
    listing,
    offerRecord,
    actor,
    payload,
    source: 'accepted_offer',
  })
  appendTransactionRow(created.transactionRow)
  appendLifecycleEvent({
    id: generateId('tx_event'),
    eventType: 'offer_accepted_transaction_created',
    transactionId: created.transactionId,
    organisationId: created.transactionRow?.transaction?.organisation_id || null,
    listingId: listing?.id || null,
    offerId: offerRecord?.id || null,
    agentId: created.transactionRow?.transaction?.assigned_agent_id || null,
    createdAt: new Date().toISOString(),
  })
  return created
}

function mapSupabaseTransactionRowToRuntimeShape({
  transaction,
  listing = null,
  lead = null,
  payload = {},
  buyer = null,
} = {}) {
  const stage = normalize(transaction?.stage || payload?.stage || 'Reserved') || 'Reserved'
  const mainStage = resolveInitialMainStage(stage)
  return {
    unit: {
      id: String(transaction?.unit_id || payload?.listingId || listing?.id || ''),
      development_id: transaction?.development_id || listing?.developmentId || null,
      unit_number: listing?.listingTitle || payload?.listingTitle || payload?.propertyAddress || 'Listing',
      price: money(transaction?.sales_price || payload?.dealValue || lead?.estimatedValue || lead?.budget || 0),
      list_price: money(listing?.askingPrice || transaction?.purchase_price || transaction?.sales_price || 0),
      status: stage,
      created_at: transaction?.created_at || new Date().toISOString(),
      updated_at: transaction?.updated_at || new Date().toISOString(),
    },
    development: listing?.developmentId
      ? {
          id: listing?.developmentId,
          name: listing?.developmentName || 'Development',
          location: listing?.suburb || '',
        }
      : null,
    transaction: {
      ...transaction,
    },
    buyer: buyer
      ? {
          id: buyer.id || transaction?.buyer_id || null,
          name: buyer.name || payload?.buyerName || lead?.contactName || 'Buyer pending',
          phone: buyer.phone || payload?.buyerPhone || '',
          email: buyer.email || payload?.buyerEmail || '',
        }
      : {
          id: transaction?.buyer_id || null,
          name: payload?.buyerName || lead?.contactName || 'Buyer pending',
          phone: payload?.buyerPhone || '',
          email: payload?.buyerEmail || '',
        },
    seller: listing?.seller || null,
    stage,
    mainStage,
    onboarding: { status: 'not_started' },
    documentSummary: {
      uploadedCount: 0,
      totalRequired: 0,
      missingCount: 0,
    },
  }
}

async function findBuyerForTransaction({ buyerName = '', buyerEmail = '', buyerPhone = '' } = {}) {
  if (!supabase) return null
  const normalizedEmail = normalizeLower(buyerEmail)
  if (normalizedEmail) {
    const byEmail = await supabase
      .from('buyers')
      .select('id, name, phone, email')
      .eq('email', normalizedEmail)
      .maybeSingle()
    if (byEmail.error && !isMissingTableError(byEmail.error, 'buyers')) {
      throw byEmail.error
    }
    if (byEmail.data?.id) {
      const patch = {}
      const nextName = normalize(buyerName)
      const nextPhone = normalize(buyerPhone)
      if (nextName && (!normalize(byEmail.data.name) || normalizeLower(byEmail.data.name) === 'buyer pending')) patch.name = nextName
      if (nextPhone && !normalize(byEmail.data.phone)) patch.phone = nextPhone
      if (Object.keys(patch).length) {
        const updated = await supabase
          .from('buyers')
          .update(patch)
          .eq('id', byEmail.data.id)
          .select('id, name, phone, email')
          .maybeSingle()
        if (!updated.error && updated.data?.id) return updated.data
      }
      return byEmail.data
    }
  }

  const nextName = normalize(buyerName) || 'Buyer pending'
  const insertPayload = {
    name: nextName,
    phone: normalize(buyerPhone) || null,
    email: normalizedEmail || null,
  }
  const inserted = await supabase
    .from('buyers')
    .insert(insertPayload)
    .select('id, name, phone, email')
    .single()

  if (inserted.error) {
    if (isMissingTableError(inserted.error, 'buyers')) {
      return null
    }
    throw inserted.error
  }

  return inserted.data || null
}

async function findExistingTransactionForLead({
  organisationId = '',
  leadId = '',
  convertedTransactionId = '',
} = {}) {
  if (!supabase || !organisationId) return null

  const normalizedLeadId = normalize(leadId)
  const normalizedConvertedId = normalize(convertedTransactionId)
  if (isUuidLike(normalizedConvertedId)) {
    const byId = await supabase
      .from('transactions')
      .select('id, organisation_id, stage, finance_type, assigned_agent_email, buyer_id, created_at, updated_at')
      .eq('id', normalizedConvertedId)
      .maybeSingle()
    if (byId.error && !isMissingColumnError(byId.error)) {
      throw byId.error
    }
    if (byId.data?.id) return byId.data
  }

  if (!normalizedLeadId) return null

  const candidateQueries = [
    { column: 'originating_lead_id', value: normalizedLeadId },
    { column: 'originating_buyer_lead_id', value: normalizedLeadId },
    ...(isUuidLike(normalizedLeadId) ? [{ column: 'buyer_id', value: normalizedLeadId }] : []),
  ]

  for (const candidate of candidateQueries) {
    const query = await supabase
      .from('transactions')
      .select('id, organisation_id, stage, finance_type, assigned_agent_email, buyer_id, created_at, updated_at')
      .eq('organisation_id', organisationId)
      .eq(candidate.column, candidate.value)
      .order('created_at', { ascending: false })
      .limit(1)

    if (query.error) {
      if (isMissingColumnError(query.error, candidate.column) || isInvalidTextRepresentation(query.error)) {
        continue
      }
      throw query.error
    }

    const row = (query.data || [])[0] || null
    if (row?.id) {
      return row
    }
  }

  return null
}

export async function findExistingTransactionForAcceptedOffer({
  organisationId = '',
  acceptedOfferId = '',
} = {}) {
  if (!supabase || !organisationId) return null

  const normalizedOfferId = normalize(acceptedOfferId)
  if (!isUuidLike(normalizedOfferId)) return null

  const query = await supabase
    .from('transactions')
    .select(TRANSACTION_IDENTITY_SELECT)
    .eq('organisation_id', organisationId)
    .eq('accepted_offer_id', normalizedOfferId)
    .order('created_at', { ascending: false })
    .limit(1)

  if (query.error) {
    if (isMissingColumnError(query.error, 'accepted_offer_id') || isMissingTableError(query.error, 'transactions')) {
      return null
    }
    throw query.error
  }

  return (query.data || [])[0] || null
}

async function insertAgentParticipant({
  transactionId = '',
  organisationId = '',
  assignedAgentId = '',
  assignedAgentName = '',
  assignedAgentEmail = '',
} = {}) {
  if (!supabase || !transactionId || !organisationId) return
  const payload = {
    transaction_id: transactionId,
    user_id: isUuidLike(assignedAgentId) ? assignedAgentId : null,
    role_type: 'agent',
    legal_role: 'none',
    transaction_role: 'listing_agent',
    status: 'active',
    accepted_at: new Date().toISOString(),
    visibility_scope: 'shared',
    participant_name: normalize(assignedAgentName) || 'Assigned Agent',
    participant_email: normalize(assignedAgentEmail).toLowerCase() || null,
    can_view: true,
    can_comment: true,
    can_upload_documents: true,
    can_edit_finance_workflow: false,
    can_edit_attorney_workflow: false,
    can_edit_core_transaction: false,
  }

  const result = await supabase
    .from('transaction_participants')
    .upsert(payload, { onConflict: 'transaction_id,role_type,legal_role' })
    .select('id')
    .maybeSingle()

  if (result.error) {
    if (
      isMissingTableError(result.error, 'transaction_participants') ||
      isMissingColumnError(result.error) ||
      String(result.error?.code || '') === '23505'
    ) {
      return
    }
    throw result.error
  }
}

async function updateLeadConversionLinkage({
  leadId = '',
  transactionId = '',
  organisationId = '',
} = {}) {
  if (!supabase || !transactionId || !isUuidLike(leadId)) return { updated: false }
  const updatePayload = {
    converted_transaction_id: transactionId,
    converted_at: new Date().toISOString(),
    current_stage: 'Onboarding',
    stage: 'Onboarding',
    status: 'Onboarding',
    updated_at: new Date().toISOString(),
  }

  let result = await supabase
    .from('leads')
    .update(updatePayload)
    .eq('lead_id', leadId)
    .eq('organisation_id', organisationId)
    .select('lead_id')
    .maybeSingle()

  if (result.error && isMissingColumnError(result.error)) {
    const fallbackPayload = { ...updatePayload }
    delete fallbackPayload.current_stage
    delete fallbackPayload.converted_at
    result = await supabase
      .from('leads')
      .update(fallbackPayload)
      .eq('lead_id', leadId)
      .eq('organisation_id', organisationId)
      .select('lead_id')
      .maybeSingle()
  }

  if (result.error) {
    if (isMissingTableError(result.error, 'leads') || isMissingColumnError(result.error)) {
      return { updated: false, reason: 'lead_table_or_columns_missing' }
    }
    throw result.error
  }

  return { updated: Boolean(result.data?.lead_id) }
}

export async function createTransactionFromLeadOverride({
  lead,
  listing = null,
  actor = null,
  payload = {},
  options = {},
} = {}) {
  assertMvpPilotCreationAllowed({ operation: 'create a transaction from a lead' })
  if (!lead) {
    throw new Error('Lead not found.')
  }

  const created = buildTransactionRow({
    listing,
    offerRecord: null,
    lead,
    actor,
    payload,
    source: 'manual_override',
  })

  const nextOrganisationId = normalize(payload?.organisationId || created?.transactionRow?.transaction?.organisation_id)
  const nextLeadId = normalize(payload?.originatingLeadId || payload?.originatingBuyerLeadId || lead?.leadId)
  const nextAssignedAgentId = normalize(payload?.assignedAgentId || lead?.assignedAgentId || actor?.id)
  const nextAssignedAgentEmail = normalize(payload?.assignedAgentEmail || lead?.assignedAgentEmail || actor?.email).toLowerCase()
  const nextListingId = normalize(payload?.listingId || listing?.id || created?.transactionRow?.transaction?.unit_id)
  const acceptedOfferId = normalize(payload?.acceptedOfferId || payload?.accepted_offer_id || options?.acceptedOfferId)
  const allowDirectLeadConversion = options?.allowDirectLeadConversion === true
  const unsafeFallbackAllowed = isUnsafeFallbackAllowed()
  const explicitMockMode = unsafeFallbackAllowed && (payload?.mockMode === true || options?.mockMode === true)
  const allowRuntimeFallback = unsafeFallbackAllowed && Boolean(options?.allowRuntimeFallback || explicitMockMode || !isSupabaseConfigured || !supabase)
  const canPersistToSupabase = Boolean(isSupabaseConfigured && supabase && !explicitMockMode)

  if (!nextOrganisationId) {
    throw new Error('Organisation id is required before converting a lead into a transaction.')
  }
  if (!nextListingId) {
    throw new Error('A listing or property context is required for manual override transaction creation.')
  }
  if (!acceptedOfferId && !allowDirectLeadConversion) {
    throw new Error('Buyer transactions must be created from an accepted offer. Create and accept an offer before conversion.')
  }

  const resolvedRoutingProfile = resolveRoutingProfileForTransaction({ listing, lead, payload })
  const testDataProtection = assessMvpTestDataProtection({ payload, listing, lead })
  assertMvpTestDataProtection(testDataProtection, {
    testMode: payload?.testMode === true || payload?.test_mode === true,
    controlledTestRoleSet: payload?.controlledTestRoleSet || payload?.controlled_test_role_set,
  })
  const routingProfile = {
    ...resolvedRoutingProfile,
    testDataProtection,
  }
  const creationCommand = prepareMvpTransactionCreationCommand({
    routingProfile,
    organisationId: nextOrganisationId,
    listingId: nextListingId,
    leadId: nextLeadId,
    acceptedOfferId,
    assignedAgentId: nextAssignedAgentId,
    assignedAgentEmail: nextAssignedAgentEmail,
    idempotencyKey: payload?.idempotencyKey || payload?.idempotency_key,
    requireAcceptedOffer: !allowDirectLeadConversion,
  })

  if (!canPersistToSupabase) {
    if (!allowRuntimeFallback) {
      throw new WorkspaceContextError('unsafe_local_fallback_blocked', {
        service: 'transactionLifecycleService.convertLeadToTransaction',
        attemptedFallbackType: 'mock_transaction_persistence',
      })
    }
    return createTransactionFromLeadManualOverride({ lead, listing, actor, payload })
  }

  try {
    const duplicateByAcceptedOffer = acceptedOfferId
      ? await findExistingTransactionForAcceptedOffer({
        organisationId: nextOrganisationId,
        acceptedOfferId,
      })
      : null

    if (duplicateByAcceptedOffer?.id) {
      let leadLinkageResult = { updated: false, reason: null }
      try {
        leadLinkageResult = await updateLeadConversionLinkage({
          leadId: nextLeadId,
          transactionId: duplicateByAcceptedOffer.id,
          organisationId: nextOrganisationId,
        })
      } catch (linkageError) {
        leadLinkageResult = {
          updated: false,
          reason: normalize(linkageError?.message || linkageError?.code || 'lead_linkage_failed'),
        }
      }

      return {
        ...created,
        transactionId: duplicateByAcceptedOffer.id,
        existing: true,
        persisted: true,
        transactionRow: mapSupabaseTransactionRowToRuntimeShape({
          transaction: duplicateByAcceptedOffer,
          listing,
          lead,
          payload,
        }),
        leadLinkageUpdated: leadLinkageResult?.updated === true,
        warning: !leadLinkageResult?.updated
          ? leadLinkageResult?.reason || 'existing_offer_transaction_reused'
          : 'existing_offer_transaction_reused',
      }
    }

    const duplicate = await findExistingTransactionForLead({
      organisationId: nextOrganisationId,
      leadId: nextLeadId,
      convertedTransactionId: lead?.convertedTransactionId || lead?.convertedDealId,
    })

    if (duplicate?.id) {
      let leadLinkageResult = { updated: false, reason: null }
      try {
        leadLinkageResult = await updateLeadConversionLinkage({
          leadId: nextLeadId,
          transactionId: duplicate.id,
          organisationId: nextOrganisationId,
        })
      } catch (linkageError) {
        leadLinkageResult = {
          updated: false,
          reason: normalize(linkageError?.message || linkageError?.code || 'lead_linkage_failed'),
        }
      }

      return {
        ...created,
        transactionId: duplicate.id,
        existing: true,
        persisted: true,
        transactionRow: mapSupabaseTransactionRowToRuntimeShape({
          transaction: duplicate,
          listing,
          lead,
          payload,
        }),
        leadLinkageUpdated: leadLinkageResult?.updated === true,
        warning: !leadLinkageResult?.updated
          ? leadLinkageResult?.reason || 'existing_transaction_reused'
          : 'existing_transaction_reused',
      }
    }

    // Buyer resolution is deliberately performed inside the database command
    // with the transaction and its source links, so a failed conversion cannot
    // leave behind an orphaned buyer record.
    const buyer = null

    const nextMainStage = resolveInitialMainStage(created?.transactionRow?.transaction?.stage || payload?.stage || 'Reserved')
    const routingFields = buildRoutingProfileTransactionFields(routingProfile)
    const clientIntakePreference = normalizeClientIntakePreference(payload?.clientIntakePreference || payload?.deliveryMode)
    const onboardingStatus = resolveOnboardingStatusForPreference(clientIntakePreference)
    const onboardingNextAction = resolveNextActionForPreference(clientIntakePreference)
    const onboardingLabel = getClientIntakePreferenceLabel(clientIntakePreference)
    const baseInsertPayload = {
      id: created.transactionId,
      organisation_id: nextOrganisationId,
      development_id: normalize(payload?.developmentId || listing?.developmentId) || null,
      unit_id: nextListingId || null,
      buyer_id: null,
      buyer_name: normalize(payload?.buyerName || `${lead?.firstName || ''} ${lead?.lastName || ''}` || lead?.contactName) || 'Buyer pending',
      buyer_email: normalize(payload?.buyerEmail || lead?.email).toLowerCase() || null,
      buyer_phone: normalize(payload?.buyerPhone || lead?.phone) || null,
      seller_name: normalize(payload?.sellerName || listing?.seller?.name || listing?.sellerName) || null,
      seller_email: normalize(payload?.sellerEmail || listing?.seller?.email || listing?.sellerEmail).toLowerCase() || null,
      transaction_reference: created?.transactionRow?.transaction?.transaction_reference || null,
      transaction_type: routingFields.transaction_type || created?.transactionRow?.transaction?.transaction_type || 'private_sale',
      property_type: routingFields.property_type || normalize(payload?.propertyType || payload?.property_type || listing?.propertyType || listing?.property_type) || null,
      property_tenure: routingFields.property_tenure || null,
      property_address_line_1: normalize(payload?.propertyAddress || listing?.propertyAddress) || null,
      suburb: normalize(payload?.suburb || listing?.suburb) || null,
      city: normalize(payload?.city || listing?.city) || null,
      province: normalize(payload?.province || listing?.province) || null,
      property_description: normalize(payload?.propertyDescription || listing?.listingTitle) || null,
      sales_price: money(payload?.dealValue || payload?.purchasePrice || lead?.estimatedValue || lead?.budget || 0),
      purchase_price: money(payload?.dealValue || payload?.purchasePrice || lead?.estimatedValue || lead?.budget || 0),
      finance_type: routingFields.finance_type || normalizeFinanceType(payload?.financeType || 'cash'),
      cash_amount: asNumber(payload?.cashAmount ?? payload?.cash_amount),
      bond_amount: asNumber(payload?.bondAmount ?? payload?.bond_amount),
      deposit_amount: asNumber(payload?.depositAmount ?? payload?.deposit_amount),
      purchaser_type: routingFields.purchaser_type || normalizePurchaserType(payload?.purchaserType || payload?.purchaser_type),
      seller_type: routingFields.seller_type || null,
      seller_has_existing_bond: routingFields.seller_has_existing_bond || false,
      existing_bond: routingFields.existing_bond || false,
      cancellation_required: routingFields.cancellation_required || false,
      vat_treatment: routingFields.vat_treatment || null,
      routing_profile_version: routingFields.routing_profile_version || null,
      routing_profile_json: routingProfile,
      stage: normalize(payload?.stage || 'Reserved') || 'Reserved',
      current_main_stage: nextMainStage,
      next_action: onboardingNextAction,
      comment: acceptedOfferId
        ? `Transaction created from accepted buyer offer. Client intake mode: ${onboardingLabel}.`
        : 'Transaction created from lead with manual override (accepted offer missing).',
      onboarding_status: onboardingStatus,
      assigned_agent: normalize(payload?.assignedAgentName || lead?.assignedAgentName || actor?.name) || null,
      assigned_agent_email: nextAssignedAgentEmail || null,
      assigned_agent_id: isUuidLike(nextAssignedAgentId) ? nextAssignedAgentId : null,
      is_active: true,
      lifecycle_state: 'active',
      owner_user_id: isUuidLike(nextAssignedAgentId) ? nextAssignedAgentId : null,
      listing_id: nextListingId || null,
      originating_lead_id: nextLeadId || null,
      originating_buyer_lead_id: nextLeadId || null,
      accepted_offer_id: acceptedOfferId || null,
      buyer_contact_id: normalize(payload?.buyerContactId) || null,
      seller_contact_id: normalize(payload?.sellerContactId) || null,
      otp_packet_id: normalize(payload?.otpPacketId) || null,
      mandate_packet_id: normalize(payload?.mandatePacketId || listing?.mandatePacketId) || null,
      commission_snapshot_id: normalize(payload?.commissionSnapshotId) || null,
      creation_idempotency_key: creationCommand.idempotencyKey,
      gross_commission_percentage: asNumber(payload?.grossCommissionPercentage),
      gross_commission_amount: asNumber(payload?.grossCommissionAmount),
      agent_split_percentage_snapshot: asNumber(payload?.agentSplitPercentage),
      agency_split_percentage_snapshot: asNumber(payload?.agencySplitPercentage),
      agent_commission_amount: asNumber(payload?.agentCommissionAmount),
      agency_commission_amount: asNumber(payload?.agencyCommissionAmount),
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    }

    baseInsertPayload.participant_bootstrap = buildMvpTransactionParticipantBootstrap({
      routingProfile,
      buyer: { name: baseInsertPayload.buyer_name, email: baseInsertPayload.buyer_email },
      seller: { name: baseInsertPayload.seller_name, email: baseInsertPayload.seller_email },
      agent: {
        id: nextAssignedAgentId,
        name: baseInsertPayload.assigned_agent,
        email: nextAssignedAgentEmail,
      },
      controlledTestRoleSet: payload?.testMode === true && payload?.controlledTestRoleSet === MVP_CONTROLLED_TEST_ROLE_SET
        ? MVP_CONTROLLED_TEST_ROLE_SET
        : null,
    })
    baseInsertPayload.document_bootstrap = buildMvpTransactionDocumentBootstrap(routingProfile)
    baseInsertPayload.workflow_bootstrap = buildMvpTransactionWorkflowBootstrap(routingProfile)

    const atomicResult = await supabase.rpc('bridge_create_mvp_transaction', {
      p_payload: baseInsertPayload,
    })
    if (atomicResult.error) throw atomicResult.error

    const atomicCreation = assertMvpAtomicTransactionCreation({
      result: atomicResult.data,
      organisationId: nextOrganisationId,
      listingId: nextListingId,
      leadId: nextLeadId,
      acceptedOfferId,
      idempotencyKey: creationCommand.idempotencyKey,
    })

    const insertedRow = atomicResult.data?.transaction || null
    if (!insertedRow?.id) {
      throw new Error('The transaction creation command did not return a transaction.')
    }
    const existing = atomicResult.data?.existing === true

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('itg:transaction-updated'))
      window.dispatchEvent(new Event('itg:transaction-created'))
    }

    appendLifecycleEvent({
      id: generateId('tx_event'),
      eventType: 'lead_manual_override_transaction_created',
      transactionId: insertedRow.id,
      organisationId: nextOrganisationId,
      leadId: nextLeadId || null,
      listingId: nextListingId || null,
      warning: existing ? 'existing_transaction_reused' : 'created_by_mvp_transaction_command',
      agentId: isUuidLike(nextAssignedAgentId) ? nextAssignedAgentId : null,
      createdAt: new Date().toISOString(),
      source: 'supabase',
    })

    return {
      ...created,
      transactionId: insertedRow.id,
      transactionRow: mapSupabaseTransactionRowToRuntimeShape({
        transaction: insertedRow,
        listing,
        lead,
        payload,
        buyer,
      }),
      persisted: true,
      existing,
      atomicCreation,
      warning: existing ? 'existing_transaction_reused' : null,
    }
  } catch (error) {
    if (allowRuntimeFallback) {
      return createTransactionFromLeadManualOverride({ lead, listing, actor, payload })
    }
    throw error
  }
}

export function createTransactionFromLeadManualOverride({
  lead,
  listing = null,
  actor = null,
  payload = {},
} = {}) {
  assertMvpPilotCreationAllowed({ operation: 'create a manual fallback transaction' })
  if (!lead) {
    throw new Error('Lead not found.')
  }
  const created = buildTransactionRow({
    listing,
    offerRecord: null,
    lead,
    actor,
    payload,
    source: 'manual_override',
  })
  appendTransactionRow(created.transactionRow)
  appendLifecycleEvent({
    id: generateId('tx_event'),
    eventType: 'lead_manual_override_transaction_created',
    transactionId: created.transactionId,
    organisationId: created.transactionRow?.transaction?.organisation_id || null,
    leadId: lead?.leadId || null,
    listingId: listing?.id || payload?.listingId || null,
    warning: 'missing_accepted_offer',
    agentId: created.transactionRow?.transaction?.assigned_agent_id || null,
    createdAt: new Date().toISOString(),
  })
  return created
}

export function listTransactionLifecycleEvents() {
  const rows = readJson(KEY_TRANSACTION_LIFECYCLE_EVENTS, [])
  return Array.isArray(rows) ? rows : []
}
