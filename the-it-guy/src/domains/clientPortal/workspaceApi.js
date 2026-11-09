// clientPortal owns these operations and their existing recovery behavior.
import { getOrCreateTransactionOnboardingRecord } from '../onboarding/workflow.js'
import { ensureTransactionRequiredDocuments } from '../documents/requirementActions.js'
import { logTransactionEventIfPossible } from '../transactions/eventActions.js'
import { normalizeStakeholderStatus } from '../developments/participantReadApi.js'
import { getDefaultOccupationalRentRecord } from '../transactions/workspaceReadApi.js'
import { loadSharedDocuments, getSignedUrl, isStorageBucketNotFoundError } from '../documents/listReadApi.js'
import { fetchTransactionEvents } from '../transactions/activityReadApi.js'
import { normalizeNullableUuid, normalizeNullableText, normalizeOptionalDate, requireClient, isMissingTableError, isMissingColumnError, isMissingSchemaError, isPermissionDeniedError, normalizeTextValue, normalizeOptionalNumber } from '../../lib/api/shared/readHelpers.js'
import { normalizeStage, normalizeMainStage, getDefaultHandoverRecord } from '../../core/transactions/legacyReadModel.js'
import { normalizeDocumentRequestRow, normalizeRequestRoleScope, buildRequiredChecklistFromRows } from '../documents/requirementReadModel.js'
import { ensureDevelopmentSettings, DEFAULT_DEVELOPMENT_SETTINGS, normalizeDevelopmentRolePlayerDefaults } from '../developments/configurationApi.js'
import { normalizeEmailAddress } from '../developments/profileNormalization.js'
import { hydrateBuyerOnboardingCapture } from '../../core/transactions/buyerOnboardingCapture.js'
import { DOCUMENTS_BUCKET_CANDIDATES } from '../../lib/supabaseClient'
import { resolveClientPortalFinalSignedArtifactAccess } from '../../core/documents/finalSignedArtifactAccess'
import { deriveOnboardingConfiguration, getPurchaserTypeLabel, getTransactionPurchaserTypeValue, normalizePurchaserType } from '../../lib/purchaserPersonas'
import { resolveBuyerOnboardingFlow } from '../../lib/buyerOnboardingFlow.js'
import { resolveOnboardingBranding } from '../../lib/onboardingBranding.js'
import { PLATFORM_FEE_CONSENT_TYPE } from '../../lib/platformFeeConsent'
import { getBuyerFicaReadiness as getBuyerFicaReadinessFromProfile, getBuyerFinanceReadiness as getBuyerFinanceReadinessFromProfile, getBuyerRequirementProfile, getMissingBuyerRequirements as getMissingBuyerRequirementsFromProfile, getTransferReadinessFromBuyerDocs as getTransferReadinessFromBuyerDocsFromProfile, getRequiredTransactionActions, getRoleFilteredRequirements } from '../../lib/buyerRequirementEngine'
import { isBondFinanceType, normalizeFinanceType } from '../../core/transactions/financeType'
import { BOND_APPLICATION_PROGRESS_STATUSES, getBondApplicationProgress } from '../../core/transactions/bondIntakeSelectors'
import { BOND_APPLICATION_PARTICIPANT_ROLES, buildNormalizedBondApplicationFromState } from '../../modules/bond/application/index.js'
import { normalizeRoleType } from '../../core/transactions/permissions'
import { respondToPortalAppointment } from '../../services/clientAppointmentResponseService.js'
import { BOND_NOTIFICATION_EVENTS, checkAndNotifyBondApplicationReadyForReview, notifyBondIntakeEvent } from '../../services/bondIntakeNotificationService'
import { fetchSharedMatterJourney, fetchSellerSharedMatterJourney } from '../../services/sharedMatterJourneyReader.js'
import { postMatterMessage } from '../../services/matterConversationService.js'
import { loadTransactionWorkflowRollup } from '../transactions/progressApi.js'
import { REVIEW_ELIGIBLE_STAGES, FUNDING_SOURCE_STATUSES } from '../shared/constants.js'
import { requireClientPortalTokenClient, fetchTrustInvestmentFormForTransaction, fetchTransactionAppointments } from './appointmentRead.js'
import { isMissingFunctionError, fetchOnboardingFormDataForTransaction, createTransactionNotificationIfPossible } from '../transactions/participantInfrastructure.js'
import { fetchTransactionHandover, getOccupationalRentRecordFromEvents } from '../transactions/workspaceHydration.js'
import { ensureTransactionSubprocesses } from '../transactions/subprocessApi.js'
import { getTransactionFinanceWorkflow, fetchNormalizedBondApplicationBundle } from '../bond/financeRead.js'
import { computeTransactionReadinessSnapshot } from '../documents/readinessSupport.js'
import { resolveAdditionalDocumentRequestAudience } from '../documents/requestApi.js'
import { isMissingRpcFunctionError } from '../finance/schemaCompatibility.js'
import { fetchTransactionDiscussion, addTransactionDiscussionComment } from '../transactions/discussionApi.js'
import { fetchClientVisibleAttorneyLaneUpdates, resolveClientPortalLinkByToken } from './originatorFinanceRead.js'
import { toBoolean, getOnboardingFinanceSnapshot } from '../finance/onboardingSnapshot.js'
import { deriveOnboardingFinanceManagedBy, resolveTransactionAndContext, fetchDevelopmentBrandContext, fetchOrganisationBrandContext } from '../onboarding/contextRead.js'
import { createClientPortalDocumentSignedUrl } from './documentApi.js'
import { fetchBondApplicationPortalSubmissionContext, saveClientPortalBondApplicationSection } from '../bond/portalApi.js'

const HOMEOWNER_DOCUMENT_CATALOG = [
  {
    key: 'nhbrc_documents',
    label: 'NHBRC Documents',
    description: 'NHBRC enrolment and warranty certificates for your home.',
    keywords: ['nhbrc'],
  },
  {
    key: 'roof_warranty_documents',
    label: 'Warranty Documents (Roof)',
    description: 'Roof covering and workmanship warranty information.',
    keywords: ['roof', 'warranty'],
  },
  {
    key: 'body_corporate_info',
    label: 'Body Corporate Info',
    description: 'Body corporate rules, contacts, and governance pack.',
    keywords: ['body corporate', 'bc', 'rules'],
  },
  {
    key: 'whatsapp_group',
    label: 'WhatsApp Group',
    description: 'Community group links and communication channels.',
    keywords: ['whatsapp', 'group', 'community link'],
  },
  {
    key: 'occupancy_certificates',
    label: 'Occupancy Certificates',
    description: 'Occupation and compliance certificates for handover.',
    keywords: ['occupancy', 'occupation certificate'],
  },
]

export function normalizeFundingSourceStatus(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return FUNDING_SOURCE_STATUSES.includes(normalized) ? normalized : 'planned'
}

export function normalizeFundingSourceType(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')

  if (!normalized) {
    return 'other'
  }

  return normalized
}

function normalizeFundingSources(input = []) {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .map((item) => ({
      id: item?.id || null,
      sourceType: normalizeFundingSourceType(item?.sourceType ?? item?.source_type),
      amount: normalizeOptionalNumber(item?.amount),
      expectedPaymentDate: normalizeOptionalDate(item?.expectedPaymentDate ?? item?.expected_payment_date),
      actualPaymentDate: normalizeOptionalDate(item?.actualPaymentDate ?? item?.actual_payment_date),
      proofDocument: normalizeNullableText(item?.proofDocument ?? item?.proof_document),
      status: normalizeFundingSourceStatus(item?.status),
      notes: normalizeNullableText(item?.notes),
    }))
    .filter((item) => item.amount !== null || item.proofDocument || item.expectedPaymentDate || item.actualPaymentDate)
}

function mapHomeownerDocuments(documents = []) {
  return HOMEOWNER_DOCUMENT_CATALOG.map((item) => {
    const matches = documents.filter((document) => {
      const haystack = `${document?.category || ''} ${document?.name || ''}`.toLowerCase()
      return item.keywords.some((keyword) => haystack.includes(keyword))
    })

    return {
      ...item,
      availableCount: matches.length,
      latestDocument: matches[0] || null,
      documents: matches,
    }
  })
}

export function normalizeBuyerBondOriginatorPolicy(settings = {}) {
  const defaults =
    settings?.rolePlayerDefaults ||
    settings?.role_player_defaults ||
    settings?.stakeholderTeams?.rolePlayerDefaults ||
    settings?.stakeholderTeams?.role_player_defaults ||
    settings?.stakeholder_teams?.rolePlayerDefaults ||
    settings?.stakeholder_teams?.role_player_defaults ||
    {}
  const normalized = normalizeDevelopmentRolePlayerDefaults(defaults)
  return {
    buyerAppointedBondOriginatorAllowed: Boolean(normalized.buyerAppointedBondOriginatorAllowed),
    buyerAppointedBondOriginatorRequiresApproval:
      Boolean(normalized.buyerAppointedBondOriginatorAllowed) &&
      Boolean(normalized.buyerAppointedBondOriginatorRequiresApproval),
    autoInviteSelectedBondOriginator: Boolean(normalized.autoInviteSelectedBondOriginator),
  }
}

function deriveClientPortalSettingsFromTransaction(transaction = {}) {
  const reservationRequired = Boolean(transaction.reservation_required)
  return {
    ...DEFAULT_DEVELOPMENT_SETTINGS,
    // Private-property transactions have no development feature record. Their
    // transaction is the source of truth for the buyer-facing capabilities.
    client_portal_enabled: true,
    snag_reporting_enabled: false,
    alteration_requests_enabled: false,
    service_reviews_enabled: Boolean(transaction.unit_id),
    reservation_deposit_enabled_by_default: reservationRequired,
    reservation_deposit_amount: reservationRequired
      ? normalizeOptionalNumber(transaction.reservation_amount)
      : null,
    reservation_deposit_amount_type:
      transaction.reservation_amount_type || DEFAULT_DEVELOPMENT_SETTINGS.reservation_deposit_amount_type,
    reservation_deposit_treatment:
      transaction.reservation_treatment || DEFAULT_DEVELOPMENT_SETTINGS.reservation_deposit_treatment,
    reservation_deposit_payable_to:
      transaction.reservation_payable_to || DEFAULT_DEVELOPMENT_SETTINGS.reservation_deposit_payable_to,
    reservation_deposit_payment_details:
      transaction.reservation_payment_details && typeof transaction.reservation_payment_details === 'object'
        ? transaction.reservation_payment_details
        : DEFAULT_DEVELOPMENT_SETTINGS.reservation_deposit_payment_details,
    enabledModules: {
      ...DEFAULT_DEVELOPMENT_SETTINGS.enabledModules,
      bond_originator: isBondFinanceType(transaction.finance_type),
    },
    source: 'transaction',
  }
}

async function resolveClientPortalSettings(client, link, transaction) {
  const developmentId = normalizeNullableUuid(transaction?.development_id || link?.development_id)
  if (!developmentId) {
    return deriveClientPortalSettingsFromTransaction(transaction)
  }
  return ensureDevelopmentSettings(client, developmentId, { createIfMissing: false })
}

async function fetchClientVisibleAdditionalDocumentRequests(client, transactionId) {
  if (!transactionId) {
    return []
  }

  let query = await client
    .from('document_requests')
    .select(
      'id, transaction_id, category, document_type, title, description, priority, due_date, assigned_to_role, assigned_to_user_id, request_group_id, status, requires_review, requested_document_id, created_by, created_by_role, completed_at, rejected_reason, resend_count, last_resent_at, requested_from, visibility_scope, request_type, notes, created_at, updated_at',
    )
    .eq('transaction_id', transactionId)
    .eq('visibility_scope', 'client_visible')
    .order('created_at', { ascending: false })

  if (
    query.error &&
    (isMissingColumnError(query.error, 'visibility_scope') ||
      isMissingColumnError(query.error, 'requested_from') ||
      isMissingColumnError(query.error, 'request_type') ||
      isMissingColumnError(query.error, 'notes'))
  ) {
    query = await client
      .from('document_requests')
      .select(
        'id, transaction_id, category, document_type, title, description, priority, due_date, assigned_to_role, status, created_by_role, requested_from, created_at',
      )
      .eq('transaction_id', transactionId)
      .order('created_at', { ascending: false })
  }

  if (query.error) {
    if (
      isMissingTableError(query.error, 'document_requests') ||
      isMissingSchemaError(query.error) ||
      isPermissionDeniedError(query.error)
    ) {
      return []
    }
    throw query.error
  }

  return (query.data || [])
    .map((row) => normalizeDocumentRequestRow(row))
    .filter((request) => {
      const category = String(request.category || '')
        .trim()
        .toLowerCase()
      const clientScopedRole = ['client', 'buyer', 'seller'].includes(
        normalizeRequestRoleScope(request.assignedToRole, 'client'),
      )
      return (
        (request.requestType === 'additional_document_request' || category === 'additional requests') &&
        (request.clientVisible || clientScopedRole)
      )
    })
    .map((request) => ({
      ...request,
      audience: resolveAdditionalDocumentRequestAudience(request.requestedFrom),
    }))
}

export async function fetchClientPortalBankApplicationsByToken(token) {
  const client = requireClientPortalTokenClient(token)
  const link = await resolveClientPortalLinkByToken(client, token)
  const { data, error } = await client.rpc('bridge_read_buyer_bank_applications', {
    p_transaction_id: link.transaction_id,
  })
  if (error) throw error
  return Array.isArray(data) ? data : []
}

export async function resolveClientPortalQuotePdf({ token, offerId }) {
  const client = requireClientPortalTokenClient(token)
  const link = await resolveClientPortalLinkByToken(client, token)
  const { data, error } = await client.rpc('bridge_read_buyer_quote_document', {
    p_transaction_id: link.transaction_id, p_offer_id: offerId,
  })
  if (error || !data?.filePath) throw new Error('This quote PDF is not available. Ask your consultant to share it with you.')
  const url = await createClientPortalDocumentSignedUrl({
    token, filePath: data.filePath, fileBucket: data.fileBucket, expiresInSeconds: 60,
  })
  return { url, name: data.name || 'Bank quote.pdf' }
}

export async function fetchClientPortalAttorneyLaneUpdatesByToken(token, clientRole = 'buyer', options = {}) {
  const client = requireClientPortalTokenClient(token)
  const link = await resolveClientPortalLinkByToken(client, token)
  const existing = await fetchClientVisibleAttorneyLaneUpdates(client, link.transaction_id, clientRole, options)
  if (clientRole !== 'buyer') return existing
  const { data, error } = await client.rpc('bridge_read_buyer_transfer_journey_updates', {
    p_transaction_id: link.transaction_id,
  })
  if (error && error.code !== 'PGRST202' && error.code !== '42883') throw error
  const journeyUpdates = Array.isArray(data) ? data : []
  const byId = new Map([...existing, ...journeyUpdates].map(row => [row.id, row]))
  return [...byId.values()].sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0))
}

async function fetchClientPortalBondOriginatorOfferGrantPackage(client) {
  const rpc = await client.rpc('bridge_client_portal_bond_originator_offer_grant_package')

  if (rpc.error) {
    if (
      isMissingRpcFunctionError(rpc.error, 'bridge_client_portal_bond_originator_offer_grant_package') ||
      isMissingSchemaError(rpc.error) ||
      isPermissionDeniedError(rpc.error)
    ) {
      return null
    }

    throw rpc.error
  }

  if (!rpc.data || typeof rpc.data !== 'object') {
    return null
  }

  return rpc.data
}

function mapTransactionPlatformFeeConsent(row = {}) {
  return {
    id: row.id || '',
    transactionId: row.transaction_id || '',
    partyId: row.party_id || '',
    partyType: row.party_type || '',
    consentType: row.consent_type || '',
    status: row.consent_status || '',
    feeAmount: row.fee_amount || null,
    currency: row.currency || 'ZAR',
    wordingVersion: row.wording_version || '',
    wordingSnapshot: row.wording_snapshot || '',
    acceptedAt: row.accepted_at || null,
    acceptedByName: row.accepted_by_name || '',
    acceptedByEmail: row.accepted_by_email || '',
    acceptedByPhone: row.accepted_by_phone || '',
    source: row.source || '',
    relatedDocumentId: row.related_document_id || '',
    metadata: row.metadata_json && typeof row.metadata_json === 'object' ? row.metadata_json : {},
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }
}

function mapTransactionPlatformFeeCharge(row = {}) {
  return {
    id: row.id || '',
    transactionId: row.transaction_id || '',
    partyId: row.party_id || '',
    partyType: row.party_type || '',
    consentId: row.consent_id || '',
    attorneyOrganisationId: row.attorney_organisation_id || '',
    amount: row.amount || null,
    currency: row.currency || 'ZAR',
    chargeType: row.charge_type || '',
    chargeStatus: row.charge_status || '',
    collectionStatus: row.collection_status || '',
    invoiceId: row.invoice_id || '',
    invoicedAt: row.invoiced_at || null,
    paidAt: row.paid_at || null,
    collectedAt: row.collected_at || null,
    remittedAt: row.remitted_at || null,
    reconciledAt: row.reconciled_at || null,
    waivedAt: row.waived_at || null,
    waiverReason: row.waiver_reason || '',
    metadata: row.metadata_json && typeof row.metadata_json === 'object' ? row.metadata_json : {},
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }
}

async function fetchTransactionPlatformFeeSummary(client, transactionId) {
  const normalizedTransactionId = normalizeNullableUuid(transactionId)
  const emptySummary = {
    consents: [],
    charges: [],
    buyerConsent: null,
    sellerConsent: null,
    buyerCharge: null,
    sellerCharge: null,
  }
  if (!normalizedTransactionId) return emptySummary

  const [consentsQuery, chargesQuery] = await Promise.all([
    client
      .from('transaction_consents')
      .select(
        'id, transaction_id, party_id, party_type, consent_type, consent_status, fee_amount, currency, wording_version, wording_snapshot, accepted_at, accepted_by_name, accepted_by_email, accepted_by_phone, source, related_document_id, metadata_json, created_at, updated_at',
      )
      .eq('transaction_id', normalizedTransactionId)
      .eq('consent_type', PLATFORM_FEE_CONSENT_TYPE)
      .order('accepted_at', { ascending: false, nullsFirst: false }),
    client
      .from('transaction_platform_charges')
      .select(
        'id, transaction_id, party_id, party_type, consent_id, attorney_organisation_id, amount, currency, charge_type, charge_status, collection_status, invoice_id, invoiced_at, paid_at, collected_at, remitted_at, reconciled_at, waived_at, waiver_reason, metadata_json, created_at, updated_at',
      )
      .eq('transaction_id', normalizedTransactionId)
      .eq('charge_type', PLATFORM_FEE_CONSENT_TYPE)
      .order('created_at', { ascending: false }),
  ])

  if (consentsQuery.error) {
    if (isMissingTableError(consentsQuery.error, 'transaction_consents') || isMissingSchemaError(consentsQuery.error)) {
      return emptySummary
    }
    throw consentsQuery.error
  }

  if (chargesQuery.error) {
    if (isMissingTableError(chargesQuery.error, 'transaction_platform_charges') || isMissingSchemaError(chargesQuery.error)) {
      return emptySummary
    }
    throw chargesQuery.error
  }

  const consents = (consentsQuery.data || []).map((row) => mapTransactionPlatformFeeConsent(row))
  const charges = (chargesQuery.data || []).map((row) => mapTransactionPlatformFeeCharge(row))
  const findAcceptedConsent = (partyType) =>
    consents.find((item) => item.partyType === partyType && item.status === 'accepted') || null
  const findActiveCharge = (partyType) =>
    charges.find((item) => item.partyType === partyType && item.chargeStatus === 'active') || null

  return {
    consents,
    charges,
    buyerConsent: findAcceptedConsent('buyer'),
    sellerConsent: findAcceptedConsent('seller'),
    buyerCharge: findActiveCharge('buyer'),
    sellerCharge: findActiveCharge('seller'),
  }
}

export function buildBuyerOnboardingFlowSnapshot(formData = {}, transaction = {}, purchaserType = 'individual') {
  const normalizedPurchaserType = normalizePurchaserType(
    formData?.purchaser_type || purchaserType || transaction?.purchaser_type || 'individual',
  )
  const normalizedFinanceType = normalizeFinanceType(
    formData?.purchase_finance_type || transaction?.finance_type || 'cash',
  )
  const flow = resolveBuyerOnboardingFlow(formData, transaction, {
    purchaserType: normalizedPurchaserType,
    financeType: normalizedFinanceType,
  })

  return {
    buyer_onboarding_flow: flow,
    onboarding_flow: flow,
    buyer_onboarding_flow_version: flow.version || null,
    onboarding_flow_version: flow.version || null,
    buyer_branch: flow.buyer_branch || null,
    buyer_branch_label: flow.buyer_branch_label || null,
    buyer_purchase_mode: flow.buyer_purchase_mode || null,
    buyer_purchase_mode_label: flow.buyer_purchase_mode_label || null,
    buyer_finance_branch: flow.buyer_finance_branch || null,
    buyer_finance_branch_label: flow.buyer_finance_branch_label || null,
    buyer_finance_support_mode: flow.buyer_finance_support_mode || null,
    buyer_finance_support_mode_label: flow.buyer_finance_support_mode_label || null,
    buyer_legal_type: flow.buyer_legal_type || null,
  }
}

export function getOnboardingFundingSources(formData = {}) {
  const directList = Array.isArray(formData?.funding_sources) ? formData.funding_sources : []
  return normalizeFundingSources(directList)
}

export async function fetchTransactionFundingSources(client, transactionId) {
  if (!transactionId) {
    return []
  }

  const query = await client
    .from('transaction_funding_sources')
    .select(
      'id, transaction_id, source_type, amount, expected_payment_date, actual_payment_date, proof_document, status, notes, created_at, updated_at',
    )
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: true })

  if (query.error) {
    if (isMissingTableError(query.error, 'transaction_funding_sources')) {
      return []
    }
    throw query.error
  }

  return (query.data || []).map((row) => ({
    id: row.id,
    transactionId: row.transaction_id,
    sourceType: row.source_type,
    amount: row.amount,
    expectedPaymentDate: row.expected_payment_date,
    actualPaymentDate: row.actual_payment_date,
    proofDocument: row.proof_document,
    status: normalizeFundingSourceStatus(row.status),
    notes: row.notes || '',
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }))
}

export async function syncOnboardingTransactionFinanceSnapshot(
  client,
  {
    transaction,
    formData = {},
    purchaserType = 'individual',
    onboardingStatus = 'awaiting_client_onboarding',
    onboardingCompletedAt = null,
    externalOnboardingSubmittedAt = null,
    fundingSources = [],
    submit = false,
    nextAction = null,
  },
) {
  if (!transaction?.id) {
    return null
  }

  const snapshot = getOnboardingFinanceSnapshot({ formData, transaction })
  const financeManagedBy = deriveOnboardingFinanceManagedBy({
    formData,
    transaction,
  })
  const payload = {
    finance_type: snapshot.financeType,
    finance_managed_by: financeManagedBy,
    sales_price: snapshot.purchasePrice,
    purchase_price: snapshot.purchasePrice,
    cash_amount: snapshot.cashAmount,
    bond_amount: snapshot.bondAmount,
    deposit_amount: snapshot.depositAmount,
    reservation_required: snapshot.reservationRequired,
    reservation_amount: snapshot.reservationAmount,
    reservation_status: snapshot.reservationStatus,
    reservation_paid_date: snapshot.reservationPaidDate,
    purchaser_type: getTransactionPurchaserTypeValue(purchaserType || transaction?.purchaser_type),
    onboarding_status: onboardingStatus,
    onboarding_completed_at: onboardingCompletedAt,
    external_onboarding_submitted_at: externalOnboardingSubmittedAt,
  }

  // Browser bearer tokens must never receive broad UPDATE/DELETE rights on a
  // transaction.  The RPC derives the transaction from the token and writes
  // only this allowlisted finance/onboarding snapshot and its funding rows.
  const { data, error } = await client.rpc('bridge_save_buyer_onboarding_snapshot', {
    p_form_data: formData && typeof formData === 'object' && !Array.isArray(formData) ? formData : {},
    p_snapshot: payload,
    p_funding_sources: Array.isArray(fundingSources) ? fundingSources : [],
    p_submit: Boolean(submit),
    p_next_action: normalizeNullableText(nextAction),
  })

  if (error) {
    if (isMissingFunctionError(error, 'bridge_save_buyer_onboarding_snapshot') || isMissingSchemaError(error)) {
      throw new Error('Buyer onboarding save is not ready yet. Apply the buyer onboarding portal handoff migration.')
    }

    throw error
  }

  return data && typeof data === 'object' && !Array.isArray(data) ? data : null
}

function normalizeOnboardingBrandingRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function getOrganisationOnboardingBrandingSources(organisation = null) {
  const settingsJson = normalizeOnboardingBrandingRecord(organisation?.settingsJson || organisation?.settings_json)
  const agencyOnboarding = normalizeOnboardingBrandingRecord(
    settingsJson.agencyOnboarding || settingsJson.agency_onboarding,
  )
  const agencyBranding = normalizeOnboardingBrandingRecord(
    agencyOnboarding.branding || agencyOnboarding.portalBranding || agencyOnboarding.portal_branding,
  )
  const settingsBranding = normalizeOnboardingBrandingRecord(settingsJson.branding)

  return [agencyBranding, settingsBranding, settingsJson]
}

export function normalizeBuyerOnboardingBranding({
  organisation = null,
  transaction = null,
  unit = null,
  development = null,
  brandingSource = 'transaction_organisation',
} = {}) {
  const unitDevelopment = Array.isArray(unit?.development) ? unit.development[0] : unit?.development
  const resolvedDevelopment = development || unitDevelopment || null
  const [agencyBranding, settingsBranding, settingsJson] = getOrganisationOnboardingBrandingSources(organisation)
  const organisationBranding = resolveOnboardingBranding(agencyBranding, settingsBranding, settingsJson, organisation)
  const contextBranding = resolveOnboardingBranding(
    agencyBranding,
    settingsBranding,
    settingsJson,
    organisation,
    transaction,
    resolvedDevelopment,
  )
  const organisationName = normalizeNullableText(organisationBranding.organisationName)
  const senderName = organisationName || normalizeNullableText(contextBranding.organisationName) || 'Your property team'
  const logoUrl = normalizeNullableText(
    contextBranding.logoDarkUrl || contextBranding.logoLightUrl || contextBranding.logoIconUrl,
  )

  return {
    organisationId: normalizeNullableUuid(organisation?.id || transaction?.organisation_id),
    transactionOrganisationId: normalizeNullableUuid(transaction?.organisation_id),
    developmentOrganisationId: normalizeNullableUuid(resolvedDevelopment?.organisation_id),
    brandingSource,
    organisationName,
    agencyName: organisationName,
    senderName,
    logoUrl,
    logoDarkUrl: normalizeNullableText(contextBranding.logoDarkUrl) || logoUrl,
    logoLightUrl: normalizeNullableText(contextBranding.logoLightUrl),
    logoIconUrl: normalizeNullableText(contextBranding.logoIconUrl),
    primaryColour: normalizeNullableText(contextBranding.primaryColour),
    secondaryColour: normalizeNullableText(contextBranding.secondaryColour),
    accentColour: normalizeNullableText(contextBranding.accentColour),
  }
}

export async function hydrateSharedBuyerCapture(client, formData, buyerTarget = {}) {
  const captureResult = await client.rpc('bridge_get_buyer_onboarding_capture', {
    p_participant_id: buyerTarget.buyerParticipantId || buyerTarget.buyer_participant_id || null,
    p_buyer_id: buyerTarget.buyerPartyId || buyerTarget.buyer_party_id || null,
    p_target_nonce: buyerTarget.buyerTargetNonce || buyerTarget.buyer_target_nonce || null,
  })
  if (captureResult.error) {
    if (!isMissingFunctionError(captureResult.error, 'bridge_get_buyer_onboarding_capture') && !isMissingSchemaError(captureResult.error)) throw captureResult.error
  } else {
    return hydrateBuyerOnboardingCapture(formData, captureResult.data)
  }
  return formData
}

async function upsertClientPortalOnboardingForm({ token, formData = {} }) {
  const client = requireClientPortalTokenClient(token)
  const link = await resolveClientPortalLinkByToken(client, token)
  const { transaction } = await resolveTransactionAndContext(client, link.transaction_id)
  const purchaserType = normalizePurchaserType(formData.purchaser_type || transaction.purchaser_type || 'individual')
  const normalizedFormData = {
    ...formData,
    purchaser_type: purchaserType,
  }
  const previousFormDataRow = await fetchOnboardingFormDataForTransaction(client, transaction.id, purchaserType)
  const previousBondProgress = getBondApplicationProgress({
    transaction,
    onboardingFormData: previousFormDataRow?.formData || {},
  })
  const nextBondProgress = getBondApplicationProgress({
    transaction,
    onboardingFormData: normalizedFormData,
  })
  const fundingSources = getOnboardingFundingSources(normalizedFormData)
  const now = new Date().toISOString()
  const financeManagedBy = deriveOnboardingFinanceManagedBy({
    formData: normalizedFormData,
    transaction,
  })
  const formDataForPersistence = {
    ...normalizedFormData,
    ...buildBuyerOnboardingFlowSnapshot(normalizedFormData, transaction, purchaserType),
    finance_managed_by: financeManagedBy,
    financeManagedBy,
    finance: {
      ...(normalizedFormData.finance && typeof normalizedFormData.finance === 'object'
        ? normalizedFormData.finance
        : {}),
      finance_managed_by: financeManagedBy,
      financeManagedBy,
    },
    funding_sources: fundingSources,
  }

  const onboardingRecord = await getOrCreateTransactionOnboardingRecord(
    client,
    {
      transactionId: transaction.id,
      purchaserType,
    },
    { createIfMissing: true },
  )
  const existingOnboardingStatus = normalizeTextValue(transaction?.onboarding_status).toLowerCase()
  const existingOnboardingRecordStatus = normalizeTextValue(onboardingRecord?.status).toLowerCase()
  const onboardingAlreadyCompleted =
    ['client_onboarding_complete', 'awaiting_signed_otp', 'signed_otp_received'].includes(existingOnboardingStatus) ||
    Boolean(transaction?.onboarding_completed_at || transaction?.external_onboarding_submitted_at) ||
    ['submitted', 'reviewed', 'approved'].includes(existingOnboardingRecordStatus)
  const preservedCompletedAt =
    transaction?.onboarding_completed_at ||
    transaction?.external_onboarding_submitted_at ||
    onboardingRecord?.submittedAt ||
    onboardingRecord?.updatedAt ||
    now

  await syncOnboardingTransactionFinanceSnapshot(client, {
    transaction,
    formData: formDataForPersistence,
    purchaserType,
    onboardingStatus: existingOnboardingStatus || (onboardingAlreadyCompleted ? 'awaiting_signed_otp' : 'awaiting_client_onboarding'),
    onboardingCompletedAt: onboardingAlreadyCompleted ? preservedCompletedAt : null,
    externalOnboardingSubmittedAt: onboardingAlreadyCompleted ? preservedCompletedAt : null,
    fundingSources,
    submit: false,
  })

  const financeSnapshot = getOnboardingFinanceSnapshot({
    formData: formDataForPersistence,
    transaction,
  })

  await ensureTransactionRequiredDocuments(client, {
    transactionId: transaction.id,
    purchaserType,
    financeType: financeSnapshot.financeType,
    reservationRequired: financeSnapshot.reservationRequired,
    cashAmount: financeSnapshot.cashAmount,
    bondAmount: financeSnapshot.bondAmount,
    formData: formDataForPersistence,
  })

  if (
    isBondFinanceType(financeSnapshot.financeType || transaction.finance_type) &&
    financeManagedBy === 'bond_originator'
  ) {
    const transactionForNotification = {
      ...transaction,
      finance_type: financeSnapshot.financeType || transaction.finance_type,
      finance_managed_by: financeManagedBy,
    }
    try {
      const wasStarted =
        previousBondProgress.status === BOND_APPLICATION_PROGRESS_STATUSES.IN_PROGRESS ||
        previousBondProgress.status === BOND_APPLICATION_PROGRESS_STATUSES.SUBMITTED
      const isStarted =
        nextBondProgress.status === BOND_APPLICATION_PROGRESS_STATUSES.IN_PROGRESS ||
        nextBondProgress.status === BOND_APPLICATION_PROGRESS_STATUSES.SUBMITTED
      if (!wasStarted && isStarted) {
        await notifyBondIntakeEvent({
          eventType: BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_STARTED,
          transaction: transactionForNotification,
          actor: { roleType: 'client' },
          metadata: {
            source: 'client_portal_bond_application_save',
            financeManagedBy,
            onboardingFormData: formDataForPersistence,
          },
          client,
        })
      }

      if (
        previousBondProgress.status !== BOND_APPLICATION_PROGRESS_STATUSES.SUBMITTED &&
        nextBondProgress.status === BOND_APPLICATION_PROGRESS_STATUSES.SUBMITTED
      ) {
        await notifyBondIntakeEvent({
          eventType: BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_SUBMITTED,
          transaction: transactionForNotification,
          actor: { roleType: 'client' },
          metadata: {
            source: 'client_portal_bond_application_submit',
            submittedAt: nextBondProgress.submittedAt || now,
            financeManagedBy,
            onboardingFormData: formDataForPersistence,
          },
          client,
        })

        const readiness = await computeTransactionReadinessSnapshot(client, transaction.id)
        await checkAndNotifyBondApplicationReadyForReview({
          transaction: transactionForNotification,
          previousReadyForReview: false,
          currentReadyForReview: Boolean(readiness?.docsComplete),
          actor: { roleType: 'client' },
          metadata: {
            source: 'client_portal_bond_application_submit',
            submittedAt: nextBondProgress.submittedAt || now,
            financeManagedBy,
            onboardingFormData: formDataForPersistence,
            documentStatus: readiness?.docsComplete ? 'Buyer onboarding completed' : 'Required documents outstanding',
          },
          client,
        })
      }
    } catch (bondNotificationError) {
      console.warn('Bond application notification failed', bondNotificationError)
    }
  }

  return fetchOnboardingFormDataForTransaction(client, transaction.id, purchaserType)
}

export async function saveClientPortalOnboardingDraft({ token, formData }) {
  const result = await upsertClientPortalOnboardingForm({ token, formData })
  if (formData?.bond_application?._meta?.originator_correction_id) {
    const client = requireClientPortalTokenClient(token)
    const context = await fetchBondApplicationPortalSubmissionContext(client, token)
    const application = await fetchNormalizedBondApplicationBundle(client, context.transaction.id)
    if (application?.activeChangeRequestId) {
      // Sync only the buyer's own sections and shared answers. Other participants retain their private answers.
      const draft = buildNormalizedBondApplicationFromState({ applicationState: context.applicationState })
      const primary = application.participants.find((item) => item.role === BOND_APPLICATION_PARTICIPANT_ROLES.primaryApplicant)
      const draftPrimary = draft.participants.find((item) => item.role === BOND_APPLICATION_PARTICIPANT_ROLES.primaryApplicant)
      for (const [sectionKey, answers] of Object.entries(draft.sharedSections || {})) {
        if (JSON.stringify(answers) !== JSON.stringify(application.sharedSections?.[sectionKey])) {
          await saveClientPortalBondApplicationSection({ token, scope: 'application', sectionKey, answers })
        }
      }
      for (const [sectionKey, answers] of Object.entries(draft.participantSections?.[draftPrimary?.participantKey] || {})) {
        if (JSON.stringify(answers) !== JSON.stringify(application.participantSections?.[primary?.participantKey]?.[sectionKey])) {
          await saveClientPortalBondApplicationSection({ token, participantKey: primary?.participantKey, sectionKey, answers })
        }
      }
    }
  }
  return result
}

export async function submitClientPortalComment({ token, commentText, sellerPortalAccessToken = '', commandId = crypto.randomUUID() }) {
  if (String(token || '').toLowerCase().startsWith('seller-')) {
    const journey = await fetchSellerSharedMatterJourney(requireClient(), token, sellerPortalAccessToken)
    if (!journey?.snapshot?.transactionId) throw new Error('A linked matter is required.')
    return postMatterMessage({ transactionId: journey.snapshot.transactionId, token,
      sellerSession: sellerPortalAccessToken, commandId, body: commentText, audience: 'everyone' })
  }
  const client = requireClientPortalTokenClient(token)
  const link = await resolveClientPortalLinkByToken(client, token)

  if (!link?.transaction_id) {
    throw new Error('Client portal link is missing a transaction.')
  }

  const normalizedText = String(commentText || '').trim()

  if (!normalizedText) {
    throw new Error('Please enter a comment before posting.')
  }

  return postMatterMessage({ transactionId: link.transaction_id, token, commandId,
    body: normalizedText, audience: 'everyone', client })
}

export async function respondToClientPortalAppointment(input = {}) {
  const client = String(input.token || '').toLowerCase().startsWith('seller-')
    ? requireClient() : requireClientPortalTokenClient(input.token)
  return respondToPortalAppointment(client, { ...input, onLegacyResponse: async receipt => {
    const { notifyAppointmentParticipants, scheduleAppointmentReminders } = await import("../../services/appointmentNotificationService.js")
    await notifyAppointmentParticipants(receipt.appointmentId, receipt.notificationEvent, {
      metadata: { trigger: 'client_portal_appointment_response' },
    })
    if (receipt.status === 'Confirmed') await scheduleAppointmentReminders(receipt.appointmentId)
  } })
}

async function resolveClientPortalBranding(client, transaction = {}, link = {}) {
  const development = await fetchDevelopmentBrandContext(
    client,
    transaction.development_id || link.development_id,
  )
  const organisationId = development?.organisation_id || transaction.organisation_id
  const organisation = await fetchOrganisationBrandContext(client, organisationId)
  if (!organisation) return null

  return normalizeBuyerOnboardingBranding({
    organisation,
    transaction,
    development,
    brandingSource: development?.organisation_id
      ? 'development_organisation'
      : 'transaction_organisation',
  })
}

export async function fetchClientPortalByToken(token) {
  const client = requireClientPortalTokenClient(token)
  const link = await resolveClientPortalLinkByToken(client, token)

  let transactionQuery = await client
    .from('transactions')
    .select(
      'property_address_line_1, property_address_line_2, suburb, city, province, postal_code, property_description, lifecycle_state, registered_at, completed_at, archived_at, cancelled_at, ' +
      'id, organisation_id, development_id, unit_id, buyer_id, transaction_type, sale_route, sale_channel, seller_party_type, lead_owner, ownership_model, source_agency_org_id, sales_price, purchase_price, finance_type, cash_amount, bond_amount, deposit_amount, reservation_required, reservation_amount, reservation_amount_type, reservation_treatment, reservation_payable_to, reservation_status, reservation_paid_date, reservation_payment_details, reservation_requested_at, reservation_email_sent_at, reservation_proof_document, alteration_charge_treatment, onboarding_status, purchaser_type, stage, current_main_stage, current_sub_stage_summary, assigned_agent, assigned_agent_email, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, next_action, updated_at, created_at',
    )
    .eq('id', link.transaction_id)
    .maybeSingle()

  if (
    transactionQuery.error &&
    (isMissingColumnError(transactionQuery.error, 'development_id') ||
      isMissingColumnError(transactionQuery.error, 'transaction_type') ||
      isMissingColumnError(transactionQuery.error, 'sale_route') ||
      isMissingColumnError(transactionQuery.error, 'sale_channel') ||
      isMissingColumnError(transactionQuery.error, 'seller_party_type') ||
      isMissingColumnError(transactionQuery.error, 'lead_owner') ||
      isMissingColumnError(transactionQuery.error, 'ownership_model') ||
      isMissingColumnError(transactionQuery.error, 'source_agency_org_id') ||
      isMissingColumnError(transactionQuery.error, 'assigned_agent') ||
      isMissingColumnError(transactionQuery.error, 'assigned_agent_email') ||
      isMissingColumnError(transactionQuery.error, 'current_main_stage') ||
      isMissingColumnError(transactionQuery.error, 'current_sub_stage_summary') ||
      isMissingColumnError(transactionQuery.error, 'purchase_price') ||
      isMissingColumnError(transactionQuery.error, 'cash_amount') ||
      isMissingColumnError(transactionQuery.error, 'bond_amount') ||
      isMissingColumnError(transactionQuery.error, 'deposit_amount') ||
      isMissingColumnError(transactionQuery.error, 'reservation_required') ||
      isMissingColumnError(transactionQuery.error, 'reservation_amount') ||
      isMissingColumnError(transactionQuery.error, 'reservation_amount_type') ||
      isMissingColumnError(transactionQuery.error, 'reservation_treatment') ||
      isMissingColumnError(transactionQuery.error, 'reservation_payable_to') ||
      isMissingColumnError(transactionQuery.error, 'reservation_status') ||
      isMissingColumnError(transactionQuery.error, 'reservation_paid_date') ||
      isMissingColumnError(transactionQuery.error, 'reservation_payment_details') ||
      isMissingColumnError(transactionQuery.error, 'reservation_requested_at') ||
      isMissingColumnError(transactionQuery.error, 'reservation_email_sent_at') ||
      isMissingColumnError(transactionQuery.error, 'reservation_proof_document') ||
      isMissingColumnError(transactionQuery.error, 'alteration_charge_treatment') ||
      isMissingColumnError(transactionQuery.error, 'onboarding_status') ||
      isMissingColumnError(transactionQuery.error, 'purchaser_type') ||
      isMissingColumnError(transactionQuery.error, 'assigned_attorney_email') ||
      isMissingColumnError(transactionQuery.error, 'assigned_bond_originator_email'))
  ) {
    transactionQuery = await client
      .from('transactions')
      .select(
        'id, organisation_id, development_id, unit_id, buyer_id, sales_price, finance_type, purchaser_type, reservation_required, reservation_amount, reservation_amount_type, reservation_treatment, reservation_payable_to, reservation_status, reservation_paid_date, reservation_payment_details, reservation_requested_at, reservation_email_sent_at, reservation_proof_document, alteration_charge_treatment, onboarding_status, stage, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, next_action, updated_at, created_at',
      )
      .eq('id', link.transaction_id)
      .maybeSingle()

    if (
      transactionQuery.error &&
      (isMissingColumnError(transactionQuery.error, 'reservation_required') ||
        isMissingColumnError(transactionQuery.error, 'reservation_amount') ||
        isMissingColumnError(transactionQuery.error, 'reservation_amount_type') ||
        isMissingColumnError(transactionQuery.error, 'reservation_treatment') ||
        isMissingColumnError(transactionQuery.error, 'reservation_payable_to') ||
        isMissingColumnError(transactionQuery.error, 'reservation_status') ||
        isMissingColumnError(transactionQuery.error, 'reservation_paid_date') ||
        isMissingColumnError(transactionQuery.error, 'reservation_payment_details') ||
        isMissingColumnError(transactionQuery.error, 'reservation_requested_at') ||
        isMissingColumnError(transactionQuery.error, 'reservation_email_sent_at') ||
        isMissingColumnError(transactionQuery.error, 'reservation_proof_document') ||
        isMissingColumnError(transactionQuery.error, 'alteration_charge_treatment') ||
        isMissingColumnError(transactionQuery.error, 'onboarding_status') ||
        isMissingColumnError(transactionQuery.error, 'purchaser_type') ||
        isMissingColumnError(transactionQuery.error, 'assigned_attorney_email') ||
        isMissingColumnError(transactionQuery.error, 'assigned_bond_originator_email'))
    ) {
      transactionQuery = await client
        .from('transactions')
        .select(
          'id, organisation_id, development_id, unit_id, buyer_id, sales_price, finance_type, stage, attorney, bond_originator, next_action, updated_at, created_at',
        )
        .eq('id', link.transaction_id)
        .maybeSingle()
    }
  }

  const { data: transaction, error: transactionError } = transactionQuery

  if (transactionError) {
    throw transactionError
  }

  if (!transaction) {
    throw new Error('Transaction not found.')
  }

  const [settings, branding] = await Promise.all([
    resolveClientPortalSettings(client, link, transaction),
    resolveClientPortalBranding(client, transaction, link),
  ])
  const rolePlayerPolicy = normalizeBuyerBondOriginatorPolicy(settings)
  if (!settings.client_portal_enabled) {
    throw new Error('Client portal is currently disabled for this transaction.')
  }

  let unit = null
  if (transaction.unit_id) {
    const { data: unitData, error: unitError } = await client
      .from('units')
      .select('id, development_id, unit_number, phase, status, development:developments(id, name)')
      .eq('id', transaction.unit_id)
      .maybeSingle()

    if (unitError) {
      throw unitError
    }

    unit = unitData
  }

  let buyer = null
  if (transaction.buyer_id) {
    const { data: buyerData, error: buyerError } = await client
      .from('buyers')
      .select('id, name, phone, email')
      .eq('id', transaction.buyer_id)
      .maybeSingle()

    if (buyerError) {
      throw buyerError
    }

    buyer = buyerData
  }

  const [documents, additionalDocumentRequests] = await Promise.all([
    loadSharedDocuments(client, {
      transactionIds: [transaction.id],
      viewer: 'client',
      clientPortalFinalArtifactDescriptors: true,
    }),
    fetchClientVisibleAdditionalDocumentRequests(client, transaction.id),
  ])
  let appointments = []
  let transactionDiscussion = []
  let transactionSubprocesses = []
  let transactionEvents = []
  let transactionFinanceWorkflow = null
  try {
    transactionDiscussion = await fetchTransactionDiscussion(transaction.id, {
      client,
      unitId: link.unit_id,
      viewer: 'client',
    })
  } catch (discussionError) {
    if (!isMissingSchemaError(discussionError)) {
      throw discussionError
    }
  }
  try {
    transactionSubprocesses = await ensureTransactionSubprocesses(client, transaction.id, {
      createIfMissing: false,
    })
  } catch (subprocessError) {
    if (!isMissingSchemaError(subprocessError)) {
      throw subprocessError
    }
  }
  if (isBondFinanceType(transaction.finance_type)) {
    try {
      transactionFinanceWorkflow = await getTransactionFinanceWorkflow(transaction.id, {
        client,
        createIfMissing: false,
      })
    } catch (financeWorkflowError) {
      if (!isMissingSchemaError(financeWorkflowError) && !isPermissionDeniedError(financeWorkflowError)) {
        throw financeWorkflowError
      }
    }
  }
  try {
    transactionEvents = await fetchTransactionEvents(transaction.id, {
      limit: 250,
      client,
    })
  } catch (transactionEventsError) {
    if (!isMissingSchemaError(transactionEventsError)) {
      throw transactionEventsError
    }
  }
  try {
    const appointmentsByTransactionId = await fetchTransactionAppointments(client, [transaction.id], {
      viewer: 'client',
    })
    appointments = appointmentsByTransactionId[transaction.id] || []
  } catch (appointmentsError) {
    if (!isMissingSchemaError(appointmentsError)) {
      throw appointmentsError
    }
  }
  const handover = await fetchTransactionHandover(client, {
    developmentId: link.development_id,
    unitId: link.unit_id,
    transaction,
    buyer,
  })
  const occupationalRent = getOccupationalRentRecordFromEvents(
    transactionEvents,
    getDefaultOccupationalRentRecord({
      developmentId: link.development_id,
      unitId: link.unit_id,
      transaction,
      buyer,
    }),
  )
  const homeownerDocuments = mapHomeownerDocuments(documents)
  const homeownerDashboardEnabled = handover.status === 'completed'

  let issues = []
  if (settings.snag_reporting_enabled && transaction.unit_id) {
    const { data: clientIssuesData, error: clientIssuesError } = await client
      .from('client_issues')
      .select('id, category, description, location, priority, photo_path, status, created_at, updated_at')
      .eq('unit_id', transaction.unit_id)
      .order('created_at', { ascending: false })

    if (clientIssuesError && clientIssuesError.code !== '42P01') {
      throw clientIssuesError
    }

    issues = await Promise.all(
      (clientIssuesData || []).map(async (item) => ({
        ...item,
        photo_url: item.photo_path ? await getSignedUrl(item.photo_path, { client }) : null,
      })),
    )
  }

  let alterations = []
  if (settings.alteration_requests_enabled && transaction.unit_id) {
    let { data: alterationData, error: alterationError } = await client
      .from('alteration_requests')
      .select(
        'id, title, category, description, budget_range, preferred_timing, reference_image_path, amount_inc_vat, charge_treatment, invoice_path, proof_of_payment_path, status, created_at, updated_at',
      )
      .eq('unit_id', transaction.unit_id)
      .order('created_at', { ascending: false })

    if (alterationError && isMissingColumnError(alterationError, 'charge_treatment')) {
      const fallbackQuery = await client
        .from('alteration_requests')
        .select(
          'id, title, category, description, budget_range, preferred_timing, reference_image_path, amount_inc_vat, invoice_path, proof_of_payment_path, status, created_at, updated_at',
        )
        .eq('unit_id', transaction.unit_id)
        .order('created_at', { ascending: false })

      if (fallbackQuery.error && fallbackQuery.error.code !== '42P01') {
        throw fallbackQuery.error
      }

      alterationData = fallbackQuery.data || []
    } else if (alterationError && alterationError.code !== '42P01') {
      throw alterationError
    }

    alterations = await Promise.all(
      (alterationData || []).map(async (item) => ({
        ...item,
        reference_image_url: item.reference_image_path
          ? await getSignedUrl(item.reference_image_path, { client })
          : null,
        invoice_url: item.invoice_path ? await getSignedUrl(item.invoice_path, { client }) : null,
        proof_url: item.proof_of_payment_path ? await getSignedUrl(item.proof_of_payment_path, { client }) : null,
      })),
    )
  }

  let reviews = []
  if (settings.service_reviews_enabled && transaction.unit_id) {
    const { data: reviewsData, error: reviewsError } = await client
      .from('service_reviews')
      .select('id, rating, review_text, positives, improvements, allow_marketing_use, created_at, updated_at')
      .eq('unit_id', transaction.unit_id)
      .order('created_at', { ascending: false })

    if (reviewsError && reviewsError.code !== '42P01') {
      throw reviewsError
    }

    reviews = reviewsData || []
  }

  const trustInvestmentForm = await fetchTrustInvestmentFormForTransaction(client, {
    developmentId: link.development_id,
    unitId: link.unit_id,
    transaction,
    buyer,
  })

  const onboarding = await getOrCreateTransactionOnboardingRecord(
    client,
    {
      transactionId: transaction.id,
      purchaserType: transaction.purchaser_type,
    },
    { createIfMissing: false },
  )
  const onboardingFormData = await fetchOnboardingFormDataForTransaction(
    client,
    transaction.id,
    transaction.purchaser_type,
  )
  if (onboardingFormData) onboardingFormData.formData = await hydrateSharedBuyerCapture(client, onboardingFormData.formData || {})
  const onboardingFormValues = onboardingFormData?.formData || {}
  const buyerBondOriginatorRequest =
    onboardingFormValues.buyer_bond_originator_request || onboardingFormValues.buyerBondOriginatorRequest || null
  const resolvedPurchaserType = normalizePurchaserType(
    onboardingFormValues.purchaser_type || transaction.purchaser_type,
  )
  const financeSnapshot = getOnboardingFinanceSnapshot({
    formData: onboardingFormValues,
    transaction,
  })
  const reservationRequiredFromOnboardingForm = toBoolean(onboardingFormValues.reservation_required, false)
  const reservationRequiredFromEvents = (transactionEvents || []).some((event) => {
    const eventType = String(event?.eventType || '')
      .trim()
      .toLowerCase()
    if (eventType.includes('reservation')) {
      return true
    }

    const eventData = event?.eventData && typeof event.eventData === 'object' ? event.eventData : {}
    if (typeof eventData.reservationRequired === 'boolean') {
      return eventData.reservationRequired
    }

    const trigger = String(eventData.trigger || eventData.source || '')
      .trim()
      .toLowerCase()
    return trigger.includes('reservation_deposit')
  })
  const resolvedReservationRequired = Boolean(
    financeSnapshot.reservationRequired || reservationRequiredFromOnboardingForm || reservationRequiredFromEvents,
  )
  const fundingSources = await fetchTransactionFundingSources(client, transaction.id)
  const platformFee = await fetchTransactionPlatformFeeSummary(client, transaction.id)
  const requiredDocuments = await ensureTransactionRequiredDocuments(
    client,
    {
      transactionId: transaction.id,
      purchaserType: resolvedPurchaserType,
      financeType: financeSnapshot.financeType,
      reservationRequired: resolvedReservationRequired,
      cashAmount: financeSnapshot.cashAmount,
      bondAmount: financeSnapshot.bondAmount,
      formData: {
        ...onboardingFormValues,
        reservation_required:
          onboardingFormValues.reservation_required !== undefined
            ? onboardingFormValues.reservation_required
            : resolvedReservationRequired,
      },
    },
    { sync: false },
  )
  const requiredDocumentChecklistResult = buildRequiredChecklistFromRows(requiredDocuments, documents)
  const requiredDocumentSummary = requiredDocumentChecklistResult.summary
  const onboardingDerivedConfiguration = deriveOnboardingConfiguration(
    {
      ...onboardingFormValues,
      funding_sources: onboardingFormValues.funding_sources || fundingSources,
    },
    { transaction },
  )
  const buyerRequirementProfile = getBuyerRequirementProfile({
    transaction,
    onboardingFormData,
    requiredDocumentChecklist: requiredDocumentChecklistResult.checklist,
  })
  const missingBuyerRequirements = getMissingBuyerRequirementsFromProfile(
    buyerRequirementProfile,
    requiredDocumentChecklistResult.checklist,
  )
  const requiredTransactionActions = getRequiredTransactionActions(
    buyerRequirementProfile,
    requiredDocumentChecklistResult.checklist,
  )
  const buyerFicaReadiness = getBuyerFicaReadinessFromProfile(
    {
      ...buyerRequirementProfile,
      onboardingStatus: onboarding?.status || onboardingFormData?.status || null,
      onboarding: onboarding || null,
    },
    requiredDocumentChecklistResult.checklist,
  )
  const buyerFinanceReadiness = getBuyerFinanceReadinessFromProfile(
    buyerRequirementProfile,
    requiredDocumentChecklistResult.checklist,
  )
  const transferReadinessFromBuyerDocs = getTransferReadinessFromBuyerDocsFromProfile(
    {
      ...buyerRequirementProfile,
      onboardingStatus: onboarding?.status || onboardingFormData?.status || null,
      onboarding: onboarding || null,
    },
    requiredDocumentChecklistResult.checklist,
  )
  const clientVisibleBuyerRequirements = getRoleFilteredRequirements(buyerRequirementProfile, 'client')

  const stage = normalizeStage(transaction.stage, unit?.status)
  const mainStage = normalizeMainStage(transaction.current_main_stage, stage)
  const reviewEligible = REVIEW_ELIGIBLE_STAGES.has(stage)
  const otpPacket = await resolveClientPortalOtpPacketSummary(client, {
    transactionId: transaction.id,
    buyerEmail: buyer?.email || '',
    portalToken: token,
  })
  const attorneyRolePlayers = await resolveClientPortalAttorneyRolePlayers(client, {
    transactionId: transaction.id,
    transferFallbackName: transaction?.attorney || '',
    transferFallbackEmail: transaction?.assigned_attorney_email || '',
    bondFallbackName: transaction?.bond_originator || '',
    bondFallbackEmail: transaction?.assigned_bond_originator_email || '',
  })
  const originatorIntakePackage = await fetchClientPortalBondOriginatorOfferGrantPackage(client)

  return {
    link,
    settings,
    rolePlayerPolicy,
    unit,
    transaction,
    buyer,
    branding,
    appointments,
    stage,
    mainStage,
    lastUpdated: transaction.updated_at || transaction.created_at,
    documents,
    additionalDocumentRequests,
    discussion: transactionDiscussion,
    events: transactionEvents,
    issues,
    alterations,
    reviews,
    trustInvestmentForm,
    handover,
    occupationalRent,
    homeownerDocuments,
    homeownerDashboardEnabled,
    onboarding,
    onboardingFormData,
    buyerBondOriginatorRequest,
    onboardingDerivedConfiguration,
    purchaserType: resolvedPurchaserType,
    purchaserTypeLabel: getPurchaserTypeLabel(resolvedPurchaserType),
    subprocesses: transactionSubprocesses,
    transactionFinanceWorkflow,
    requiredDocuments,
    requiredDocumentChecklist: requiredDocumentChecklistResult.checklist,
    requiredDocumentSummary,
    buyerRequirementProfile,
    clientVisibleBuyerRequirements,
    missingBuyerRequirements,
    requiredTransactionActions,
    buyerReadiness: {
      fica: buyerFicaReadiness,
      finance: buyerFinanceReadiness,
      transfer: transferReadinessFromBuyerDocs,
    },
    otpPacket,
    attorneyRolePlayers,
    originatorIntakePackage,
    bondOriginatorIntakePackage: originatorIntakePackage,
    fundingSources,
    platformFee,
    featureAvailability: {
      snag: settings.snag_reporting_enabled,
      alteration: settings.alteration_requests_enabled,
      review: settings.service_reviews_enabled && reviewEligible,
      reviewLockedByStage: settings.service_reviews_enabled && !reviewEligible,
      homeownerDashboard: homeownerDashboardEnabled,
    },
  }
}

export async function fetchClientPortalJourneySnapshotByToken(token, actorRole = 'buyer', options = {}) {
  if (String(token || '').trim().toLowerCase().startsWith('seller-')) {
    const legalJourney = await fetchSellerSharedMatterJourney(requireClient(), token, options.sellerPortalAccessToken)
    return legalJourney ? { schemaVersion: 1, transactionId: legalJourney.snapshot.transactionId, milestones: [], legalOnly: true, legalJourney } : null
  }
  const client = requireClientPortalTokenClient(token)
  const link = await resolveClientPortalLinkByToken(client, token)
  if (!link?.transaction_id) return null

  if (options.legalOnly) return {
    schemaVersion: 1, transactionId: link.transaction_id, milestones: [], legalOnly: true,
    legalJourney: await fetchSharedMatterJourney(client, link.transaction_id),
  }

  const { resolveTransactionRollup } = await loadTransactionWorkflowRollup()
  const rollup = await resolveTransactionRollup(link.transaction_id, {
    client,
    actorRole: normalizeRoleType(actorRole || 'buyer'),
    preferLegacy: true,
  }).catch(() => null)
  if (!rollup) return { schemaVersion: 1, transactionId: link.transaction_id, milestones: [],
    legalJourney: await fetchSharedMatterJourney(client, link.transaction_id) }
  return rollup?.transactionJourneySnapshot || null
}

export async function fetchClientPortalCoreByToken(token) {
  const client = requireClientPortalTokenClient(token)
  const link = await resolveClientPortalLinkByToken(client, token)

  let transactionQuery = await client
    .from('transactions')
    .select(
      'property_address_line_1, property_address_line_2, suburb, city, province, postal_code, property_description, lifecycle_state, registered_at, completed_at, archived_at, cancelled_at, ' +
      'id, organisation_id, development_id, unit_id, buyer_id, transaction_type, sale_route, sale_channel, seller_party_type, lead_owner, ownership_model, source_agency_org_id, sales_price, purchase_price, finance_type, cash_amount, bond_amount, deposit_amount, reservation_required, reservation_amount, reservation_amount_type, reservation_treatment, reservation_payable_to, reservation_status, reservation_paid_date, reservation_payment_details, reservation_requested_at, reservation_email_sent_at, reservation_proof_document, alteration_charge_treatment, onboarding_status, purchaser_type, stage, current_main_stage, current_sub_stage_summary, assigned_agent, assigned_agent_email, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, next_action, updated_at, created_at',
    )
    .eq('id', link.transaction_id)
    .maybeSingle()

  if (
    transactionQuery.error &&
    (isMissingColumnError(transactionQuery.error, 'development_id') ||
      isMissingColumnError(transactionQuery.error, 'transaction_type') ||
      isMissingColumnError(transactionQuery.error, 'sale_route') ||
      isMissingColumnError(transactionQuery.error, 'sale_channel') ||
      isMissingColumnError(transactionQuery.error, 'seller_party_type') ||
      isMissingColumnError(transactionQuery.error, 'lead_owner') ||
      isMissingColumnError(transactionQuery.error, 'ownership_model') ||
      isMissingColumnError(transactionQuery.error, 'source_agency_org_id') ||
      isMissingColumnError(transactionQuery.error, 'assigned_agent') ||
      isMissingColumnError(transactionQuery.error, 'assigned_agent_email') ||
      isMissingColumnError(transactionQuery.error, 'current_main_stage') ||
      isMissingColumnError(transactionQuery.error, 'current_sub_stage_summary') ||
      isMissingColumnError(transactionQuery.error, 'purchase_price') ||
      isMissingColumnError(transactionQuery.error, 'cash_amount') ||
      isMissingColumnError(transactionQuery.error, 'bond_amount') ||
      isMissingColumnError(transactionQuery.error, 'deposit_amount') ||
      isMissingColumnError(transactionQuery.error, 'reservation_required') ||
      isMissingColumnError(transactionQuery.error, 'reservation_amount') ||
      isMissingColumnError(transactionQuery.error, 'reservation_amount_type') ||
      isMissingColumnError(transactionQuery.error, 'reservation_treatment') ||
      isMissingColumnError(transactionQuery.error, 'reservation_payable_to') ||
      isMissingColumnError(transactionQuery.error, 'reservation_status') ||
      isMissingColumnError(transactionQuery.error, 'reservation_paid_date') ||
      isMissingColumnError(transactionQuery.error, 'reservation_payment_details') ||
      isMissingColumnError(transactionQuery.error, 'reservation_requested_at') ||
      isMissingColumnError(transactionQuery.error, 'reservation_email_sent_at') ||
      isMissingColumnError(transactionQuery.error, 'reservation_proof_document') ||
      isMissingColumnError(transactionQuery.error, 'alteration_charge_treatment') ||
      isMissingColumnError(transactionQuery.error, 'onboarding_status') ||
      isMissingColumnError(transactionQuery.error, 'purchaser_type') ||
      isMissingColumnError(transactionQuery.error, 'assigned_attorney_email') ||
      isMissingColumnError(transactionQuery.error, 'assigned_bond_originator_email'))
  ) {
    transactionQuery = await client
      .from('transactions')
      .select(
        'id, organisation_id, development_id, unit_id, buyer_id, sales_price, finance_type, purchaser_type, reservation_required, reservation_amount, reservation_amount_type, reservation_treatment, reservation_payable_to, reservation_status, reservation_paid_date, reservation_payment_details, reservation_requested_at, reservation_email_sent_at, reservation_proof_document, alteration_charge_treatment, onboarding_status, stage, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, next_action, updated_at, created_at',
      )
      .eq('id', link.transaction_id)
      .maybeSingle()

    if (
      transactionQuery.error &&
      (isMissingColumnError(transactionQuery.error, 'reservation_required') ||
        isMissingColumnError(transactionQuery.error, 'reservation_amount') ||
        isMissingColumnError(transactionQuery.error, 'reservation_amount_type') ||
        isMissingColumnError(transactionQuery.error, 'reservation_treatment') ||
        isMissingColumnError(transactionQuery.error, 'reservation_payable_to') ||
        isMissingColumnError(transactionQuery.error, 'reservation_status') ||
        isMissingColumnError(transactionQuery.error, 'reservation_paid_date') ||
        isMissingColumnError(transactionQuery.error, 'reservation_payment_details') ||
        isMissingColumnError(transactionQuery.error, 'reservation_requested_at') ||
        isMissingColumnError(transactionQuery.error, 'reservation_email_sent_at') ||
        isMissingColumnError(transactionQuery.error, 'reservation_proof_document') ||
        isMissingColumnError(transactionQuery.error, 'alteration_charge_treatment') ||
        isMissingColumnError(transactionQuery.error, 'onboarding_status') ||
        isMissingColumnError(transactionQuery.error, 'purchaser_type') ||
        isMissingColumnError(transactionQuery.error, 'assigned_attorney_email') ||
        isMissingColumnError(transactionQuery.error, 'assigned_bond_originator_email'))
    ) {
      transactionQuery = await client
        .from('transactions')
        .select(
          'id, organisation_id, development_id, unit_id, buyer_id, sales_price, finance_type, stage, attorney, bond_originator, next_action, updated_at, created_at',
        )
        .eq('id', link.transaction_id)
        .maybeSingle()
    }
  }

  const { data: transaction, error: transactionError } = transactionQuery
  if (transactionError) {
    throw transactionError
  }
  if (!transaction) {
    throw new Error('Transaction not found.')
  }

  const [settings, branding] = await Promise.all([
    resolveClientPortalSettings(client, link, transaction),
    resolveClientPortalBranding(client, transaction, link),
  ])
  const rolePlayerPolicy = normalizeBuyerBondOriginatorPolicy(settings)
  if (!settings.client_portal_enabled) {
    throw new Error('Client portal is currently disabled for this transaction.')
  }

  const [unitQuery, buyerQuery] = await Promise.all([
    transaction.unit_id
      ? client
          .from('units')
          .select('id, development_id, unit_number, phase, status, development:developments(id, name)')
          .eq('id', transaction.unit_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    transaction.buyer_id
      ? client.from('buyers').select('id, name, phone, email').eq('id', transaction.buyer_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  if (unitQuery.error) {
    throw unitQuery.error
  }
  if (buyerQuery.error) {
    throw buyerQuery.error
  }

  const [documents, additionalDocumentRequests] = await Promise.all([
    loadSharedDocuments(client, {
      transactionIds: [transaction.id],
      viewer: 'client',
      clientPortalFinalArtifactDescriptors: true,
    }),
    fetchClientVisibleAdditionalDocumentRequests(client, transaction.id),
  ])
  let appointments = []
  try {
    const appointmentsByTransactionId = await fetchTransactionAppointments(client, [transaction.id], {
      viewer: 'client',
    })
    appointments = appointmentsByTransactionId[transaction.id] || []
  } catch (appointmentsError) {
    if (!isMissingSchemaError(appointmentsError)) {
      throw appointmentsError
    }
  }

  const stage = normalizeStage(transaction.stage, unitQuery.data?.status)
  const mainStage = normalizeMainStage(transaction.current_main_stage, stage)
  const minimalChecklist = buildRequiredChecklistFromRows([], documents)
  const buyerRequirementProfile = getBuyerRequirementProfile({
    transaction,
    requiredDocumentChecklist: minimalChecklist.checklist,
  })
  const missingBuyerRequirements = getMissingBuyerRequirementsFromProfile(
    buyerRequirementProfile,
    minimalChecklist.checklist,
  )
  const requiredTransactionActions = getRequiredTransactionActions(buyerRequirementProfile, minimalChecklist.checklist)
  const buyerFicaReadiness = getBuyerFicaReadinessFromProfile(buyerRequirementProfile, minimalChecklist.checklist)
  const buyerFinanceReadiness = getBuyerFinanceReadinessFromProfile(buyerRequirementProfile, minimalChecklist.checklist)
  const transferReadinessFromBuyerDocs = getTransferReadinessFromBuyerDocsFromProfile(
    {
      ...buyerRequirementProfile,
      onboardingStatus: transaction?.onboarding_status || null,
      onboarding: null,
    },
    minimalChecklist.checklist,
  )
  const clientVisibleBuyerRequirements = getRoleFilteredRequirements(buyerRequirementProfile, 'client')
  const attorneyRolePlayers = await resolveClientPortalAttorneyRolePlayers(client, {
    transactionId: transaction.id,
    transferFallbackName: transaction?.attorney || '',
    transferFallbackEmail: transaction?.assigned_attorney_email || '',
    bondFallbackName: transaction?.bond_originator || '',
    bondFallbackEmail: transaction?.assigned_bond_originator_email || '',
  })

  return {
    link,
    settings,
    rolePlayerPolicy,
    unit: unitQuery.data || null,
    transaction,
    buyer: buyerQuery.data || null,
    branding,
    appointments,
    stage,
    mainStage,
    lastUpdated: transaction.updated_at || transaction.created_at,
    documents,
    additionalDocumentRequests,
    discussion: [],
    issues: [],
    alterations: [],
    reviews: [],
    trustInvestmentForm: null,
    handover: getDefaultHandoverRecord({
      developmentId: link.development_id,
      unitId: link.unit_id,
      transaction,
      buyer: buyerQuery.data || null,
    }),
    occupationalRent: getDefaultOccupationalRentRecord({
      developmentId: link.development_id,
      unitId: link.unit_id,
      transaction,
      buyer: buyerQuery.data || null,
    }),
    homeownerDocuments: mapHomeownerDocuments(documents),
    homeownerDashboardEnabled: false,
    onboarding: null,
    onboardingFormData: null,
    onboardingDerivedConfiguration: deriveOnboardingConfiguration({}, { transaction }),
    purchaserType: normalizePurchaserType(transaction.purchaser_type),
    purchaserTypeLabel: getPurchaserTypeLabel(transaction.purchaser_type),
    subprocesses: [],
    requiredDocuments: [],
    requiredDocumentChecklist: minimalChecklist.checklist,
    requiredDocumentSummary: minimalChecklist.summary,
    buyerRequirementProfile,
    clientVisibleBuyerRequirements,
    missingBuyerRequirements,
    requiredTransactionActions,
    buyerReadiness: {
      fica: buyerFicaReadiness,
      finance: buyerFinanceReadiness,
      transfer: transferReadinessFromBuyerDocs,
    },
    otpPacket: null,
    attorneyRolePlayers,
    fundingSources: [],
    featureAvailability: {
      snag: settings.snag_reporting_enabled,
      alteration: settings.alteration_requests_enabled,
      review: false,
      reviewLockedByStage: settings.service_reviews_enabled,
      homeownerDashboard: false,
    },
    __isCore: true,
  }
}

function mapClientPortalContextRow(row = {}) {
  return {
    id: row?.id || null,
    organisationId: normalizeNullableText(row?.organisation_id),
    clientEmail: normalizeEmailAddress(row?.client_email),
    clientContactId: normalizeNullableText(row?.client_contact_id),
    contextType:
      String(row?.context_type || 'buying')
        .trim()
        .toLowerCase() === 'selling'
        ? 'selling'
        : 'buying',
    transactionId: normalizeNullableText(row?.transaction_id),
    sellerLeadId: normalizeNullableText(row?.seller_lead_id),
    listingId: normalizeNullableText(row?.listing_id),
    mandatePacketId: normalizeNullableText(row?.mandate_packet_id),
    status: String(row?.status || 'active')
      .trim()
      .toLowerCase(),
    sellerWorkspaceToken: normalizeNullableText(row?.seller_workspace_token),
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
  }
}

function buildDefaultBuyingPortalContext(link = {}, buyer = null) {
  return {
    id: null,
    organisationId: null,
    clientEmail: normalizeEmailAddress(buyer?.email),
    clientContactId: normalizeNullableText(link?.buyer_id),
    contextType: 'buying',
    transactionId: normalizeNullableText(link?.transaction_id),
    sellerLeadId: null,
    listingId: normalizeNullableText(link?.unit_id),
    mandatePacketId: null,
    status: 'active',
    sellerWorkspaceToken: null,
    createdAt: null,
    updatedAt: null,
  }
}

async function decorateClientPortalContextsWithMandateState(client, contexts = [], buyerEmail = '', portalToken = '') {
  return Promise.all(
    contexts.map(async (context) => {
      if (context.contextType !== 'selling') {
        return context
      }

      const mandatePacket = await resolveClientPortalMandatePacketSummary(client, {
        mandatePacketId: context.mandatePacketId,
        sellerLeadId: context.sellerLeadId,
        clientEmail: context.clientEmail || buyerEmail,
        portalToken,
      })

      return {
        ...context,
        mandatePacket,
      }
    }),
  )
}

async function fetchSellerClientPortalContextsByToken(client, token) {
  const normalizedToken = normalizeTextValue(token)
  if (!normalizedToken.toLowerCase().startsWith('seller-')) return null

  const { data, error } = await client
    .from('client_portal_contexts')
    .select(
      'id, organisation_id, client_email, client_contact_id, context_type, transaction_id, seller_lead_id, listing_id, mandate_packet_id, status, seller_workspace_token, created_at, updated_at',
    )
    .eq('seller_workspace_token', normalizedToken)

  if (error) {
    if (
      isMissingTableError(error, 'client_portal_contexts') ||
      isMissingSchemaError(error) ||
      isPermissionDeniedError(error)
    ) {
      return null
    }
    throw error
  }

  const contexts = (data || []).map((row) => mapClientPortalContextRow(row))
  const activeSellingContexts = contexts.filter((context) => {
    if (context.contextType !== 'selling') return false
    return ['active', 'pending'].includes(String(context.status || '').toLowerCase())
  })
  if (!activeSellingContexts.length) return null

  return {
    contexts: await decorateClientPortalContextsWithMandateState(client, activeSellingContexts, '', token),
    hasBuyingContext: false,
    hasSellingContext: true,
  }
}

function normalizePacketSignerRole(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function isPacketSignerRoleClientFacing(value = '') {
  const normalized = normalizePacketSignerRole(value)
  return ['purchaser_1', 'purchaser_2', 'buyer_spouse'].includes(normalized)
}

function isPacketSignerRoleSellerFacing(value = '') {
  return ['seller', 'seller_spouse'].includes(normalizePacketSignerRole(value))
}

function isPacketSignerStatusSigned(value = '') {
  return (
    String(value || '')
      .trim()
      .toLowerCase() === 'signed'
  )
}

function isPacketSignerStatusReadyForClient(value = '') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return ['pending', 'ready_to_send', 'sent', 'viewed'].includes(normalized)
}

function isPacketTokenExpired(value = '') {
  const text = String(value || '').trim()
  if (!text) return false
  const timestamp = Date.parse(text)
  if (Number.isNaN(timestamp)) return false
  return timestamp <= Date.now()
}

async function createClientPortalSignedUrlByBucketCandidates(
  client,
  filePath,
  preferredBucket = '',
  expiresInSeconds = 60,
) {
  const normalizedPath = String(filePath || '').trim()
  if (!normalizedPath) {
    return ''
  }

  const candidateBuckets = Array.from(
    new Set([String(preferredBucket || '').trim(), ...DOCUMENTS_BUCKET_CANDIDATES, 'signed-documents'].filter(Boolean)),
  )

  for (const bucketName of candidateBuckets) {
    const { data, error } = await client.storage.from(bucketName).createSignedUrl(normalizedPath, expiresInSeconds)

    if (!error && data?.signedUrl) {
      return data.signedUrl
    }

    if (error && isStorageBucketNotFoundError(error)) {
      continue
    }
  }

  return ''
}

async function resolveClientPortalPacketSummary(
  client,
  {
    packet = null,
    packetId = '',
    portalToken = '',
    expectedPacketType = '',
    clientEmail = '',
    clientSignerRoleMatcher = null,
    generatedPreviewFallbackName = 'Document',
    finalSignedFallbackName = 'signed-document.pdf',
  } = {},
) {
  const normalizedPacketId = normalizeNullableText(packet?.id || packetId)
  let resolvedPacket = packet

  if (!resolvedPacket && normalizedPacketId) {
    const packetQuery = await client
      .from('document_packets')
      .select(
        'id, organisation_id, packet_type, status, title, transaction_id, lead_id, unit_id, created_at, updated_at',
      )
      .eq('id', normalizedPacketId)
      .maybeSingle()

    if (packetQuery.error) {
      if (
        isMissingTableError(packetQuery.error, 'document_packets') ||
        isMissingSchemaError(packetQuery.error) ||
        isPermissionDeniedError(packetQuery.error)
      ) {
        return null
      }
      throw packetQuery.error
    }
    resolvedPacket = packetQuery.data || null
  }

  const normalizedExpectedPacketType = String(expectedPacketType || '')
    .trim()
    .toLowerCase()
  if (!resolvedPacket?.id) {
    return {
      state: 'not_generated',
      packet: null,
      version: null,
      clientSigner: null,
      allRequiredSigned: false,
      signPath: '',
      generatedPreviewFilePath: '',
      generatedPreviewFileName: generatedPreviewFallbackName,
      generatedPreviewUrl: '',
      finalSignedFilePath: '',
      finalSignedFileName: finalSignedFallbackName,
      finalSignedFileBucket: '',
      finalSignedDownloadUrl: '',
      finalSignedAccess: {
        available: false,
        state: 'not_ready',
        message: 'The final signed document is not ready yet.',
        finalArtifact: null,
      },
    }
  }

  if (
    normalizedExpectedPacketType &&
    String(resolvedPacket?.packet_type || '')
      .trim()
      .toLowerCase() !== normalizedExpectedPacketType
  ) {
    return null
  }

  const [versionQuery, signerQuery] = await Promise.all([
    client
      .from('document_packet_versions')
      .select(
        // A portal can use the rendered preview, but it must never receive
        // final-artifact storage coordinates. The trusted resolver is the
        // sole source of final-signature state and download URLs.
        'id, packet_id, version_number, render_status, rendered_file_path, rendered_file_name, finalised_at, generated_at, created_at',
      )
      .eq('packet_id', resolvedPacket.id)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from('document_packet_signers')
      .select(
        'id, signer_role, signer_name, signer_email, status, signing_token, token_expires_at, viewed_at, signed_at, created_at, updated_at',
      )
      .eq('packet_id', resolvedPacket.id)
      .order('created_at', { ascending: true }),
  ])

  if (versionQuery.error) {
    if (
      !isMissingTableError(versionQuery.error, 'document_packet_versions') &&
      !isMissingSchemaError(versionQuery.error) &&
      !isPermissionDeniedError(versionQuery.error)
    ) {
      throw versionQuery.error
    }
  }

  if (signerQuery.error) {
    if (
      !isMissingTableError(signerQuery.error, 'document_packet_signers') &&
      !isMissingSchemaError(signerQuery.error) &&
      !isPermissionDeniedError(signerQuery.error)
    ) {
      throw signerQuery.error
    }
  }

  const version = versionQuery.data || null
  const signers = Array.isArray(signerQuery.data) ? signerQuery.data : []
  const normalizedClientEmail = normalizeEmailAddress(clientEmail)
  const matcher = typeof clientSignerRoleMatcher === 'function' ? clientSignerRoleMatcher : () => false
  const matchingRoleSigners = signers.filter((signer) => matcher(signer?.signer_role))
  const requiredSigners = signers.filter((signer) => {
    const role = normalizePacketSignerRole(signer?.signer_role)
    return [
      'purchaser_1',
      'purchaser_2',
      'buyer_spouse',
      'seller',
      'seller_spouse',
      'agent',
      'contractor',
      'witness_1',
      'witness_2',
    ].includes(role)
  })
  const allRequiredSigned =
    requiredSigners.length > 0 && requiredSigners.every((signer) => isPacketSignerStatusSigned(signer?.status))

  let clientSigner =
    (normalizedClientEmail
      ? matchingRoleSigners.find((signer) => normalizeEmailAddress(signer?.signer_email) === normalizedClientEmail) ||
        null
      : null) ||
    matchingRoleSigners[0] ||
    null

  if (!clientSigner && signers.length === 1 && matcher(signers[0]?.signer_role)) {
    clientSigner = signers[0]
  }

  const generatedPreviewFilePath = String(version?.rendered_file_path || '').trim()
  const finalSignedAccess = resolvedPacket?.id && version?.id
    ? await resolveClientPortalFinalSignedArtifactAccess({
        portalToken,
        packetId: resolvedPacket.id,
        packetVersionId: version.id,
        download: false,
      })
    : {
        available: false,
        state: 'not_ready',
        message: 'The final signed document is not ready yet.',
        finalArtifact: null,
      }
  const hasFinalSignedArtifact = finalSignedAccess.available === true
  const hasRecordedFinalArtifact = ['pending_evidence', 'pending_publication', 'published'].includes(
    String(finalSignedAccess?.state || '').trim().toLowerCase(),
  )
  const hasGeneratedArtifact = Boolean(
    generatedPreviewFilePath ||
    String(version?.render_status || '')
      .trim()
      .toLowerCase() === 'generated',
  )
  const signerToken = String(clientSigner?.signing_token || '').trim()
  const signerTokenExpired = isPacketTokenExpired(clientSigner?.token_expires_at)
  const canClientSign = Boolean(
    clientSigner && signerToken && !signerTokenExpired && isPacketSignerStatusReadyForClient(clientSigner?.status),
  )
  const clientSigned = Boolean(clientSigner && isPacketSignerStatusSigned(clientSigner?.status))
  const signPath = canClientSign ? `/sign/${signerToken}` : ''

  let state = 'preparing'
  if (hasFinalSignedArtifact) {
    state = 'fully_signed'
  } else if (hasRecordedFinalArtifact) {
    state = 'finalisation_pending'
  } else if (clientSigned && !allRequiredSigned) {
    state = 'awaiting_other_signatures'
  } else if (canClientSign) {
    state = 'ready_for_client_signature'
  } else if (!hasGeneratedArtifact) {
    state = 'preparing'
  } else {
    state = 'generated_not_ready'
  }

  const generatedPreviewUrl = generatedPreviewFilePath
    ? await createClientPortalSignedUrlByBucketCandidates(client, generatedPreviewFilePath, '', 120)
    : ''

  return {
    state,
    packet: resolvedPacket,
    version: version || null,
    clientSigner,
    allRequiredSigned,
    signPath,
    generatedPreviewFilePath,
    generatedPreviewFileName: String(
      version?.rendered_file_name || resolvedPacket?.title || generatedPreviewFallbackName,
    ).trim(),
    generatedPreviewUrl,
    finalSignedFilePath: '',
    finalSignedFileName: String(finalSignedAccess?.finalArtifact?.fileName || finalSignedFallbackName).trim(),
    finalSignedFileBucket: '',
    finalSignedDownloadUrl: '',
    finalSignedAccess,
  }
}

async function resolveClientPortalOtpPacketSummary(client, { transactionId = null, buyerEmail = '', portalToken = '' } = {}) {
  const normalizedTransactionId = normalizeNullableText(transactionId)
  if (!normalizedTransactionId) {
    return null
  }

  const packetQuery = await client
    .from('document_packets')
    .select(
      'id, organisation_id, packet_type, status, title, transaction_id, current_version_number, created_at, updated_at',
    )
    .eq('transaction_id', normalizedTransactionId)
    .eq('packet_type', 'otp')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (packetQuery.error) {
    if (
      isMissingTableError(packetQuery.error, 'document_packets') ||
      isMissingSchemaError(packetQuery.error) ||
      isPermissionDeniedError(packetQuery.error)
    ) {
      return null
    }
    throw packetQuery.error
  }

  const packet = packetQuery.data || null
  return resolveClientPortalPacketSummary(client, {
    packet,
    portalToken,
    expectedPacketType: 'otp',
    clientEmail: buyerEmail,
    clientSignerRoleMatcher: isPacketSignerRoleClientFacing,
    generatedPreviewFallbackName: 'Offer to Purchase (OTP)',
    finalSignedFallbackName: 'signed-otp.pdf',
  })
}

export async function fetchClientPortalMandatePacketSummaryByToken(
  token,
  { mandatePacketId = null, sellerLeadId = null, clientEmail = '' } = {},
) {
  const client = requireClientPortalTokenClient(token)
  return resolveClientPortalMandatePacketSummary(client, {
    mandatePacketId,
    sellerLeadId,
    clientEmail,
    portalToken: token,
  })
}

async function resolveClientPortalMandatePacketSummary(
  client,
  { mandatePacketId = null, sellerLeadId = null, clientEmail = '', portalToken = '' } = {},
) {
  let packet = null

  const normalizedPacketId = normalizeNullableText(mandatePacketId)
  if (normalizedPacketId) {
    const packetQuery = await client
      .from('document_packets')
      .select(
        'id, organisation_id, packet_type, status, title, transaction_id, lead_id, unit_id, created_at, updated_at',
      )
      .eq('id', normalizedPacketId)
      .eq('packet_type', 'mandate')
      .maybeSingle()

    if (packetQuery.error) {
      if (
        !isMissingTableError(packetQuery.error, 'document_packets') &&
        !isMissingSchemaError(packetQuery.error) &&
        !isPermissionDeniedError(packetQuery.error)
      ) {
        throw packetQuery.error
      }
    } else {
      packet = packetQuery.data || null
    }
  }

  if (!packet?.id) {
    const normalizedLeadId = normalizeNullableText(sellerLeadId)
    if (normalizedLeadId) {
      const packetByLeadQuery = await client
        .from('document_packets')
        .select(
          'id, organisation_id, packet_type, status, title, transaction_id, lead_id, unit_id, created_at, updated_at',
        )
        .eq('packet_type', 'mandate')
        .eq('lead_id', normalizedLeadId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (packetByLeadQuery.error) {
        if (
          !isMissingTableError(packetByLeadQuery.error, 'document_packets') &&
          !isMissingSchemaError(packetByLeadQuery.error) &&
          !isPermissionDeniedError(packetByLeadQuery.error)
        ) {
          throw packetByLeadQuery.error
        }
      } else {
        packet = packetByLeadQuery.data || null
      }
    }
  }

  return resolveClientPortalPacketSummary(client, {
    packet,
    portalToken,
    expectedPacketType: 'mandate',
    clientEmail,
    clientSignerRoleMatcher: isPacketSignerRoleSellerFacing,
    generatedPreviewFallbackName: 'Mandate',
    finalSignedFallbackName: 'signed-mandate.pdf',
  })
}

function mapClientPortalAttorneyRolePlayer({
  assignment = null,
  firm = null,
  profilesById = {},
  fallbackName = '',
  fallbackEmail = '',
} = {}) {
  if (!assignment) return null

  const primaryProfile = assignment?.primary_attorney_id ? profilesById[assignment.primary_attorney_id] || null : null
  const secretaryProfile = assignment?.secretary_id ? profilesById[assignment.secretary_id] || null : null

  const primaryName = normalizeNullableText(primaryProfile?.name || fallbackName || '')
  const primaryEmail = normalizeEmailAddress(primaryProfile?.email || fallbackEmail || '')
  const secretaryName = normalizeNullableText(secretaryProfile?.name || '')
  const secretaryEmail = normalizeEmailAddress(secretaryProfile?.email || '')

  return {
    assignmentId: assignment.id || null,
    assignmentType: assignment.assignment_type || '',
    assignmentTypeLabel:
      assignment.assignment_type === 'bond'
        ? 'Bond Attorney'
        : assignment.assignment_type === 'transfer'
          ? 'Transfer Attorney'
          : 'Transfer & Bond Attorney',
    status: String(assignment.status || 'active')
      .trim()
      .toLowerCase(),
    firm: firm
      ? {
          id: firm.id,
          name: normalizeNullableText(firm.name || 'Attorney Firm') || 'Attorney Firm',
          logoUrl: normalizeNullableText(firm.logo_url),
          primaryColour: normalizeNullableText(firm.primary_colour),
          secondaryColour: normalizeNullableText(firm.secondary_colour),
          email: normalizeEmailAddress(firm.email),
          phone: normalizeNullableText(firm.phone),
          website: normalizeNullableText(firm.website),
          address: [
            normalizeNullableText(firm.address_line_1),
            normalizeNullableText(firm.address_line_2),
            [normalizeNullableText(firm.city), normalizeNullableText(firm.province)].filter(Boolean).join(', '),
            [normalizeNullableText(firm.postal_code), normalizeNullableText(firm.country || 'South Africa')]
              .filter(Boolean)
              .join(' '),
          ]
            .filter(Boolean)
            .join('\n'),
        }
      : null,
    primaryAttorney:
      primaryName || primaryEmail
        ? {
            id: assignment.primary_attorney_id || null,
            name: primaryName || primaryEmail || 'Assigned Attorney',
            email: primaryEmail || '',
          }
        : null,
    secretary:
      secretaryName || secretaryEmail
        ? {
            id: assignment.secretary_id || null,
            name: secretaryName || secretaryEmail || 'Assigned Secretary',
            email: secretaryEmail || '',
          }
        : null,
  }
}

async function resolveClientPortalAttorneyRolePlayers(
  client,
  {
    transactionId = '',
    transferFallbackName = '',
    transferFallbackEmail = '',
    bondFallbackName = '',
    bondFallbackEmail = '',
  } = {},
) {
  const normalizedTransactionId = normalizeNullableText(transactionId)
  if (!normalizedTransactionId) {
    return {
      transferAttorney: null,
      bondAttorney: null,
    }
  }

  const assignmentsQuery = await client
    .from('transaction_attorney_assignments')
    .select('id, transaction_id, firm_id, assignment_type, primary_attorney_id, secretary_id, status, updated_at')
    .eq('transaction_id', normalizedTransactionId)
    .neq('status', 'removed')
    .order('updated_at', { ascending: false })

  if (assignmentsQuery.error) {
    if (
      isMissingTableError(assignmentsQuery.error, 'transaction_attorney_assignments') ||
      isMissingSchemaError(assignmentsQuery.error) ||
      isPermissionDeniedError(assignmentsQuery.error)
    ) {
      return {
        transferAttorney: null,
        bondAttorney: null,
      }
    }
    throw assignmentsQuery.error
  }

  const assignments = Array.isArray(assignmentsQuery.data) ? assignmentsQuery.data : []
  if (!assignments.length) {
    return {
      transferAttorney: null,
      bondAttorney: null,
    }
  }

  const transferAssignment =
    assignments.find((item) => item.assignment_type === 'transfer') ||
    assignments.find((item) => item.assignment_type === 'transfer_and_bond') ||
    null
  const bondAssignment =
    assignments.find((item) => item.assignment_type === 'bond') ||
    assignments.find((item) => item.assignment_type === 'transfer_and_bond') ||
    null

  const firmIds = [...new Set([transferAssignment?.firm_id, bondAssignment?.firm_id].filter(Boolean))]
  const userIds = [
    ...new Set(
      [
        transferAssignment?.primary_attorney_id,
        transferAssignment?.secretary_id,
        bondAssignment?.primary_attorney_id,
        bondAssignment?.secretary_id,
      ].filter(Boolean),
    ),
  ]

  const [firmsQuery, profilesQuery] = await Promise.all([
    firmIds.length
      ? client
          .from('attorney_firms')
          .select(
            'id, name, logo_url, primary_colour, secondary_colour, email, phone, website, address_line_1, address_line_2, city, province, postal_code, country',
          )
          .in('id', firmIds)
      : Promise.resolve({ data: [], error: null }),
    userIds.length
      ? client.from('profiles').select('id, full_name, first_name, last_name, email').in('id', userIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (
    firmsQuery.error &&
    !isMissingTableError(firmsQuery.error, 'attorney_firms') &&
    !isMissingSchemaError(firmsQuery.error) &&
    !isPermissionDeniedError(firmsQuery.error)
  ) {
    throw firmsQuery.error
  }

  const profilesById = {}
  if (!profilesQuery.error) {
    for (const row of profilesQuery.data || []) {
      const fullName =
        normalizeNullableText(row.full_name) ||
        [normalizeNullableText(row.first_name), normalizeNullableText(row.last_name)].filter(Boolean).join(' ').trim()
      profilesById[row.id] = {
        id: row.id,
        name: fullName || normalizeEmailAddress(row.email) || 'Team Member',
        email: normalizeEmailAddress(row.email),
      }
    }
  } else if (
    !isMissingTableError(profilesQuery.error, 'profiles') &&
    !isMissingSchemaError(profilesQuery.error) &&
    !isPermissionDeniedError(profilesQuery.error)
  ) {
    throw profilesQuery.error
  }

  const firmsById = (firmsQuery.data || []).reduce((accumulator, firm) => {
    accumulator[firm.id] = firm
    return accumulator
  }, {})

  return {
    transferAttorney: mapClientPortalAttorneyRolePlayer({
      assignment: transferAssignment,
      firm: transferAssignment?.firm_id ? firmsById[transferAssignment.firm_id] || null : null,
      profilesById,
      fallbackName: transferFallbackName,
      fallbackEmail: transferFallbackEmail,
    }),
    bondAttorney: mapClientPortalAttorneyRolePlayer({
      assignment: bondAssignment,
      firm: bondAssignment?.firm_id ? firmsById[bondAssignment.firm_id] || null : null,
      profilesById,
      fallbackName: bondFallbackName,
      fallbackEmail: bondFallbackEmail,
    }),
  }
}

export async function fetchClientPortalContextsByToken(token) {
  const client = requireClientPortalTokenClient(token)
  const sellerContexts = await fetchSellerClientPortalContextsByToken(client, token)
  if (sellerContexts) return sellerContexts

  const link = await resolveClientPortalLinkByToken(client, token)

  let buyer = null
  if (link?.buyer_id) {
    const { data: buyerData, error: buyerError } = await client
      .from('buyers')
      .select('id, name, email')
      .eq('id', link.buyer_id)
      .maybeSingle()
    if (buyerError && !isMissingSchemaError(buyerError) && !isPermissionDeniedError(buyerError)) {
      throw buyerError
    }
    buyer = buyerData || null
  }

  const defaultBuyingContext = buildDefaultBuyingPortalContext(link, buyer)
  let contexts = [defaultBuyingContext]

  const buyerEmail = normalizeEmailAddress(buyer?.email)
  let contextQuery = client
    .from('client_portal_contexts')
    .select(
      'id, organisation_id, client_email, client_contact_id, context_type, transaction_id, seller_lead_id, listing_id, mandate_packet_id, status, seller_workspace_token, created_at, updated_at',
    )
    .eq('transaction_id', link.transaction_id)
  if (buyerEmail) {
    contextQuery = contextQuery.or(`client_email.is.null,client_email.eq.${buyerEmail}`)
  }

  const { data: contextRows, error: contextError } = await contextQuery
  if (contextError) {
    if (
      !isMissingTableError(contextError, 'client_portal_contexts') &&
      !isMissingSchemaError(contextError) &&
      !isPermissionDeniedError(contextError)
    ) {
      throw contextError
    }
  } else {
    const mapped = (contextRows || []).map((row) => mapClientPortalContextRow(row))
    if (mapped.length) {
      const hasBuying = mapped.some((row) => row.contextType === 'buying')
      contexts = hasBuying ? mapped : [defaultBuyingContext, ...mapped]
    }
  }

  const hasBuyingContext = contexts.some((context) => context.contextType === 'buying')
  const hasSellingContext = contexts.some((context) => {
    if (context.contextType !== 'selling') return false
    return ['active', 'pending'].includes(String(context.status || '').toLowerCase())
  })

  const contextsWithPacketState = await decorateClientPortalContextsWithMandateState(client, contexts, buyerEmail, token)

  return {
    contexts: contextsWithPacketState,
    hasBuyingContext,
    hasSellingContext,
  }
}

export async function submitClientSellerInterestRequest({
  token,
  propertyAddress = '',
  message = '',
  preferredContactMethod = '',
} = {}) {
  const client = requireClientPortalTokenClient(token)
  const link = await resolveClientPortalLinkByToken(client, token)

  if (!link?.transaction_id) {
    throw new Error('Client portal link is missing a transaction.')
  }

  let transactionPromise = client
    .from('transactions')
    .select('id, organisation_id, unit_id, assigned_agent, assigned_agent_email')
    .eq('id', link.transaction_id)
    .maybeSingle()
  const buyerPromise = link?.buyer_id
    ? client.from('buyers').select('id, name, email').eq('id', link.buyer_id).maybeSingle()
    : Promise.resolve({ data: null, error: null })

  let [transactionQuery, buyerQuery] = await Promise.all([
    transactionPromise,
    link?.buyer_id ? buyerPromise : Promise.resolve({ data: null, error: null }),
  ])

  if (transactionQuery.error && isMissingColumnError(transactionQuery.error, 'organisation_id')) {
    ;[transactionQuery, buyerQuery] = await Promise.all([
      client
        .from('transactions')
        .select('id, unit_id, assigned_agent, assigned_agent_email')
        .eq('id', link.transaction_id)
        .maybeSingle(),
      buyerPromise,
    ])
  }

  if (transactionQuery.error) {
    throw transactionQuery.error
  }
  if (!transactionQuery.data) {
    throw new Error('Transaction not found.')
  }
  if (buyerQuery.error && !isMissingSchemaError(buyerQuery.error) && !isPermissionDeniedError(buyerQuery.error)) {
    throw buyerQuery.error
  }

  const propertyAddressText = normalizeNullableText(propertyAddress)
  const messageText = normalizeNullableText(message)
  if (!propertyAddressText && !messageText) {
    throw new Error('Please add a property address or short message before submitting your request.')
  }

  const buyerName = normalizeTextValue(buyerQuery.data?.name) || 'Client'
  const buyerEmail = normalizeEmailAddress(buyerQuery.data?.email)
  const preferredContact = normalizeNullableText(preferredContactMethod) || 'email'
  const nowIso = new Date().toISOString()

  let createdRequest = null
  const { data: requestRow, error: requestError } = await client
    .from('client_seller_interest_requests')
    .insert({
      organisation_id: normalizeNullableText(transactionQuery.data?.organisation_id),
      client_email: buyerEmail,
      client_contact_id: normalizeNullableText(link?.buyer_id),
      transaction_id: normalizeNullableText(link?.transaction_id),
      property_address: propertyAddressText,
      message: messageText,
      preferred_contact_method: preferredContact,
      status: 'submitted',
      assigned_agent_id: null,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('id, status, created_at')
    .maybeSingle()

  if (requestError) {
    if (
      !isMissingTableError(requestError, 'client_seller_interest_requests') &&
      !isMissingSchemaError(requestError) &&
      !isPermissionDeniedError(requestError)
    ) {
      throw requestError
    }
  } else {
    createdRequest = requestRow || null
  }

  const summary = [
    'Client requested seller assistance',
    propertyAddressText ? `Property: ${propertyAddressText}` : null,
    messageText ? `Message: ${messageText}` : null,
    `Preferred contact: ${preferredContact}`,
  ]
    .filter(Boolean)
    .join(' • ')

  await addTransactionDiscussionComment({
    transactionId: link.transaction_id,
    authorName: buyerName,
    authorRole: 'client',
    commentText: summary,
    unitId: link.unit_id || transactionQuery.data?.unit_id || null,
    client,
  })

  await logTransactionEventIfPossible(client, {
    transactionId: link.transaction_id,
    eventType: 'TransactionUpdated',
    createdByRole: 'client',
    eventData: {
      trigger: 'seller_assistance_requested',
      propertyAddress: propertyAddressText,
      message: messageText,
      preferredContactMethod: preferredContact,
      requestId: createdRequest?.id || null,
    },
  })

  let assignedAgentUserId = null
  const participantQuery = await client
    .from('transaction_participants')
    .select('user_id, role_type, status, removed_at')
    .eq('transaction_id', link.transaction_id)
    .is('removed_at', null)

  if (!participantQuery.error) {
    const participantRow = (participantQuery.data || []).find(
      (row) =>
        normalizeRoleType(row?.role_type) === 'agent' &&
        normalizeStakeholderStatus(row?.status, 'active') === 'active' &&
        row?.user_id,
    )
    assignedAgentUserId = normalizeNullableText(participantRow?.user_id)
  }

  if (assignedAgentUserId) {
    await createTransactionNotificationIfPossible(client, {
      transactionId: link.transaction_id,
      userId: assignedAgentUserId,
      roleType: 'agent',
      notificationType: 'readiness_updated',
      title: 'Seller assistance requested',
      message: `${buyerName} requested seller onboarding support from the client portal.`,
      eventType: 'TransactionUpdated',
      eventData: {
        trigger: 'seller_assistance_requested',
        requestId: createdRequest?.id || null,
      },
      dedupeKey: `seller-assistance:${link.transaction_id}:${createdRequest?.id || nowIso}`,
    })
  }

  return {
    requestId: createdRequest?.id || null,
    status: createdRequest?.status || 'submitted',
    createdAt: createdRequest?.created_at || nowIso,
    fallback: !createdRequest,
  }
}
