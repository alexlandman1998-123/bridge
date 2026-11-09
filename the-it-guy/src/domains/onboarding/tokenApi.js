// onboarding owns these operations and their existing recovery behavior.
import { uploadToDocumentsBucket } from '../../lib/api/shared/storage.js'
import { getOrCreateTransactionOnboardingRecord } from './workflow.js'
import { updateRecordByIdWithMissingColumnFallback } from '../../lib/api/shared/schemaCompatibility.js'
import { ensureTransactionRequiredDocuments } from '../documents/requirementActions.js'
import { logTransactionEventIfPossible } from '../transactions/eventActions.js'
import { resolveActiveProfileContext } from '../access/actorContext.js'
import { normalizeStakeholderStatus } from '../developments/participantReadApi.js'
import { normalizeOnboardingRow } from '../transactions/readinessReadApi.js'
import { loadSharedDocuments } from '../documents/listReadApi.js'
import { normalizeNullableUuid, normalizeNullableText, requireClient, isMissingTableError, isMissingColumnError, isMissingSchemaError, isPermissionDeniedError, normalizeTextValue, normalizeOptionalNumber } from '../../lib/api/shared/readHelpers.js'
import { buildRequiredChecklistFromRows } from '../documents/requirementReadModel.js'
import { ensureDevelopmentSettings, DEFAULT_DEVELOPMENT_SETTINGS } from '../developments/configurationApi.js'
import { normalizeEmailAddress } from '../developments/profileNormalization.js'
import { runRecoverableDocumentUpload, readSavedUploadByPath } from '../../lib/documentUploadRecovery.js'
import { DOCUMENTS_BUCKET_CANDIDATES } from '../../lib/supabaseClient'
import { validateDocumentUploadFile } from '../../lib/documentUploadPolicy'
import { deriveOnboardingConfiguration, getOnboardingStepDefinitions, getPersonaFormConfig, getPurchaserTypeLabel, normalizePurchaserType, validateOnboardingSubmission } from '../../lib/purchaserPersonas'
import { resolveBuyerOnboardingFlow } from '../../lib/buyerOnboardingFlow.js'
import { isBuyerFicaDeclarationSigned } from '../../core/documents/buyerFicaDeclarationSigning.js'
import { getPlatformFeeConsentConfig, isPlatformFeeConsentAccepted } from '../../lib/platformFeeConsent'
import { normalizePortalDocumentType } from '../../core/documents/portalDocumentMetadata'
import { isBondFinanceType, normalizeFinanceType } from '../../core/transactions/financeType'
import { buildBuyerOnboardingCompletionHook } from '../../core/transactions/buyerOnboardingCompletionHook.js'
import { buildBuyerOnboardingCompletionParticipantPatch, resolveBuyerOnboardingCompletionTarget } from '../../core/transactions/transactionBuyerCompletion.js'
import { buildTransactionBuyerOperationalAudit } from '../../core/transactions/transactionBuyerOperationalAudit.js'
import { buildBondFallbackQueueCandidate } from '../../core/transactions/bondFallbackQueue.js'
import { buildBondAssistanceRoutingDecision } from '../../core/transactions/bondAssistanceRouting.js'
import { buildAttorneyHandoffRepairQueueCandidate } from '../../core/transactions/attorneyHandoffRepairQueue.js'
import { INFORMATION_SHEET_DOCUMENT_KEY, buildOnboardingInformationSheetCapture } from '../../core/transactions/documentCaptureEvidence.js'
import { BOND_APPLICATION_PROGRESS_STATUSES, getBondApplicationProgress } from '../../core/transactions/bondIntakeSelectors'
import { buildFinanceReadinessPayload } from '../../core/finance/financeReadinessSelectors'
import { normalizeRoleType } from '../../core/transactions/permissions'
import { checkAndNotifyBondApplicationReadyForReview, checkAndNotifyBondDocumentsComplete } from '../../services/bondIntakeNotificationService'
import { TRANSACTION_CANONICAL_PERSISTENCE_MODES, resolveTransactionDocumentRequirements } from '../../services/documents/transactionCanonicalDocumentRequirementService'
import { syncAttorneyIncomingInstructionStatus } from '../../services/attorneyIncomingMatterInstructionSync'
import { ATTORNEY_INCOMING_INSTRUCTION_STATUSES } from '../../core/transactions/attorneyIncomingMatterContract'
import { requireScopedClient } from '../transactions/contactSupport.js'
import { isMissingFunctionError, fetchOnboardingFormDataForTransaction, TRANSACTION_PARTICIPANT_FULL_SELECT, TRANSACTION_PARTICIPANT_LEGACY_SELECT, isMissingTransactionParticipantExtendedColumn, normalizeTransactionParticipantRow } from '../transactions/participantInfrastructure.js'
import { normalizeBuyerBondOriginatorPolicy, buildBuyerOnboardingFlowSnapshot, getOnboardingFundingSources, fetchTransactionFundingSources, syncOnboardingTransactionFinanceSnapshot, normalizeBuyerOnboardingBranding, hydrateSharedBuyerCapture } from '../clientPortal/workspaceApi.js'
import { processWorkflowEvidenceIfPossible, notifyRolesForTransaction, fetchTransactionRolePlayersIfPossible } from '../bond/financeRead.js'
import { computeTransactionReadinessSnapshot, notifyAttorneysForBondDocumentsComplete } from '../documents/readinessSupport.js'
import { runDocumentAutomationIfPossible } from '../documents/uploadAutomation.js'
import { isBondActivationRequestedForOnboarding } from '../access/roleplayerActivation.js'
import { updateTransactionBondOriginatorFromBuyerRequest } from '../transactions/detailApi.js'
import { getOnboardingFinanceSnapshot } from '../finance/onboardingSnapshot.js'
import { deriveOnboardingFinanceManagedBy, resolveTransactionAndContext } from './contextRead.js'
import { removeDocumentUploadObjectAfterFailedPersistence } from '../documents/uploadWorkflow.js'

const CLIENT_INTAKE_PREFERENCE_ALIASES = {
  digital: 'digital_portal',
  portal: 'digital_portal',
  digital_portal: 'digital_portal',
  email: 'digital_portal',
  agent: 'agent_assisted',
  assisted: 'agent_assisted',
  agent_assisted: 'agent_assisted',
  assisted_capture: 'agent_assisted',
  manual: 'agent_assisted',
  hard_copy: 'hard_copy',
  hardcopy: 'hard_copy',
  printed: 'hard_copy',
  paper: 'hard_copy',
}

export function requireOnboardingTokenClient(token) {
  return requireScopedClient({
    'x-bridge-onboarding-token': String(token || '').trim(),
  })
}

function normalizeClientIntakePreference(value = '') {
  return CLIENT_INTAKE_PREFERENCE_ALIASES[normalizeTextValue(value).toLowerCase()] || 'digital_portal'
}

function resolveClientIntakePreferenceFromFormData(formData = {}) {
  const normalized = normalizeClientIntakePreference(
    formData?.bridge_client_intake_preference ||
      formData?.client_intake_preference ||
      formData?.delivery_mode ||
      formData?.deliveryMode ||
      formData?.__bridge_onboarding_mode,
  )
  if (normalized === 'digital_portal' && formData?.bridge_hard_copy_preferred === 'yes') return 'hard_copy'
  if (normalized === 'digital_portal' && formData?.bridge_agent_assisted_onboarding === 'yes') return 'agent_assisted'
  return normalized
}

function resolveAwaitingSignedOtpNextAction(formData = {}) {
  const preference = resolveClientIntakePreferenceFromFormData(formData)
  if (preference === 'hard_copy') {
    return 'Prepare hard-copy OTP pack, obtain signatures, and upload the signed OTP before finance or attorney handoff.'
  }
  if (preference === 'agent_assisted') {
    return 'Prepare the OTP for assisted signing, obtain signatures, and upload the signed OTP before finance or attorney handoff.'
  }
  return 'Generate or release the OTP for signature, then upload the signed OTP before finance or attorney handoff.'
}

function extractEmailFromText(value = '') {
  const match = String(value || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  return match ? normalizeEmailAddress(match[0]) : ''
}

export async function prepareBuyerOnboardingDocumentWorkspace(transactionId) {
  if (!normalizeNullableUuid(transactionId)) throw new Error('A saved transaction is required for buyer document setup.')
  const result = await resolveTransactionDocumentRequirements({
    transactionId, client: requireClient(), writeLegacyProjection: false,
    persistenceMode: TRANSACTION_CANONICAL_PERSISTENCE_MODES.creationRpc,
  })
  if (!result?.canonicalSync?.instances?.length || !result?.requirements?.length) {
    throw new Error('Buyer document requirements could not be prepared. Please retry before sharing the buyer portal.')
  }
  return result
}

export async function resolveOnboardingTokenContext(client, token) {
  const normalizedToken = String(token || '').trim()
  if (!normalizedToken) {
    throw new Error('Onboarding token is required.')
  }

  const rowSelect = 'id, transaction_id, token, status, purchaser_type, submitted_at, is_active, created_at, updated_at'
  const { data, error } = await client
    .from('transaction_onboarding')
    .select(rowSelect)
    .eq('token', normalizedToken)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error, 'transaction_onboarding')) {
      throw new Error('Transaction onboarding is not set up yet. Run sql/schema.sql first.')
    }

    throw error
  }

  if (data) {
    const onboarding = normalizeOnboardingRow(data)
    if (!onboarding?.transactionId) {
      throw new Error(
        'Onboarding link is missing its linked transaction. Please ask your agent to resend the onboarding link.',
      )
    }
    return onboarding
  }

  throw new Error('Onboarding link is invalid or inactive.')
}

function getBuyerAppointedBondOriginatorRequest({
  formData = {},
  transaction = {},
  buyer = null,
  policy = {},
  now = new Date().toISOString(),
} = {}) {
  const finance = formData?.finance && typeof formData.finance === 'object' ? formData.finance : {}
  const selectionSource = normalizeTextValue(
    finance.bond_assistance_selection || formData.bond_assistance_selection || '',
  )
  const contactConsent = String(
    finance.bond_assistance_contact_consent || formData.bond_assistance_contact_consent || '',
  ).trim().toLowerCase() === 'yes'
  const consentVersion = normalizeTextValue(
    finance.bond_assistance_consent_version || formData.bond_assistance_consent_version || 'bond-assistance-v1',
  )
  const companyName = normalizeTextValue(
    finance.bond_originator_name || formData.bond_originator_name || formData.bondOriginatorName || '',
  )
  const contactDetails = normalizeTextValue(
    finance.bond_originator_contact || formData.bond_originator_contact || formData.bondOriginatorContact || '',
  )
  const bondActivationRequested = isBondActivationRequestedForOnboarding({
      financeType: normalizeFinanceType(formData.purchase_finance_type || transaction?.finance_type || ''),
      formData,
    })
  const externallyNominated = ['buyer_nominated', 'third_party'].includes(selectionSource)
  const requested = bondActivationRequested && contactConsent && (selectionSource === 'agency_partner' || (externallyNominated && Boolean(companyName || contactDetails)))
  const allowed = selectionSource === 'agency_partner' || policy?.buyerAppointedBondOriginatorAllowed !== false
  const requiresApproval = selectionSource === 'agency_partner' ? false : Boolean(policy?.buyerAppointedBondOriginatorRequiresApproval)
  let status = 'not_requested'
  if (requested && !allowed) {
    status = 'not_allowed'
  } else if (requested && requiresApproval) {
    status = 'pending_approval'
  } else if (requested) {
    status = 'approved'
  }

  return {
    requested,
    allowed,
    requiresApproval,
    status,
    companyName,
    contactDetails,
    email: extractEmailFromText(contactDetails),
    selectionSource: selectionSource || null,
    contactConsent,
    consentVersion,
    consentedAt: contactConsent ? now : null,
    buyerName: normalizeTextValue(buyer?.name || formData.full_name || ''),
    requestedAt: requested ? now : null,
    source: 'buyer_onboarding',
  }
}

function clearBuyerAppointedBondOriginatorFields(formData = {}) {
  return {
    ...formData,
    bond_originator_name: '',
    bond_originator_contact: '',
    finance: {
      ...(formData.finance && typeof formData.finance === 'object' ? formData.finance : {}),
      bond_originator_name: '',
      bond_originator_contact: '',
    },
  }
}

async function upsertBondApplicationConsent(client, { transaction = {}, request = {}, actorRole = 'client' } = {}) {
  if (!request?.requested || !request?.contactConsent || !request?.selectionSource) return null
  const transactionId = normalizeTextValue(transaction?.id || transaction?.transaction_id)
  if (!transactionId) return null
  const now = request.consentedAt || new Date().toISOString()
  const result = await client
    .from('bond_application_consents')
    .upsert({
      transaction_id: transactionId,
      organisation_id: transaction?.organisation_id || transaction?.organization_id || null,
      selection_source: request.selectionSource,
      nominated_originator_name: request.companyName || null,
      nominated_originator_contact: request.contactDetails || null,
      consent_version: request.consentVersion || 'bond-assistance-v1',
      consented_at: now,
      consented_by_role: actorRole,
      consent_snapshot: {
        contactConsent: true,
        selectionSource: request.selectionSource,
        buyerName: request.buyerName || null,
        recordedAt: now,
      },
      updated_at: now,
    }, { onConflict: 'transaction_id' })
    .select('id, transaction_id, selection_source, consent_version, consented_at')
    .maybeSingle()
  if (result.error) {
    if (isMissingTableError(result.error, 'bond_application_consents') || isPermissionDeniedError(result.error)) return null
    throw result.error
  }
  return result.data || null
}

async function processBuyerAppointedBondOriginatorRequest(
  client,
  { transaction, buyer = null, formData = {}, policy = {}, request = null, source = 'buyer_onboarding_completed' } = {},
) {
  const transactionId = normalizeTextValue(transaction?.id || transaction?.transaction_id)
  if (!transactionId) return { processed: false, reason: 'missing_transaction' }
  const resolvedRequest =
    request ||
    getBuyerAppointedBondOriginatorRequest({
      formData,
      transaction,
      buyer,
      policy,
    })
  if (!resolvedRequest.requested)
    return {
      processed: false,
      reason: 'not_requested',
      request: resolvedRequest,
    }

  await logTransactionEventIfPossible(client, {
    transactionId,
    eventType: 'buyer_bond_originator_request',
    createdByRole: 'client',
    eventData: {
      source,
      status: resolvedRequest.status,
      allowed: resolvedRequest.allowed,
      requiresApproval: resolvedRequest.requiresApproval,
      companyName: resolvedRequest.companyName || null,
      contactDetails: resolvedRequest.contactDetails || null,
      email: resolvedRequest.email || null,
      buyerName: resolvedRequest.buyerName || buyer?.name || null,
      selectionSource: resolvedRequest.selectionSource || null,
      contactConsent: Boolean(resolvedRequest.contactConsent),
      consentVersion: resolvedRequest.consentVersion || null,
    },
  })

  if (resolvedRequest.status === 'approved') {
    if (resolvedRequest.selectionSource === 'agency_partner') {
      return { applied: false, reason: 'agency_partner_routing_preserved', transactionId }
    }
    return updateTransactionBondOriginatorFromBuyerRequest(client, {
      transaction,
      request: resolvedRequest,
      actorProfile: { userId: null, role: 'client' },
      actorRole: 'client',
    })
  }

  if (resolvedRequest.status === 'pending_approval') {
    await notifyRolesForTransaction(client, {
      transactionId,
      roleTypes: ['agent', 'developer'],
      title: 'Buyer bond originator request',
      message: `${resolvedRequest.buyerName || 'Buyer'} nominated ${resolvedRequest.companyName || 'a bond originator'} for approval.`,
      notificationType: 'roleplayer_change_requested',
      eventType: 'buyer_bond_originator_request',
      eventData: {
        source,
        requestedRoleType: 'bond_originator',
        companyName: resolvedRequest.companyName || null,
        contactDetails: resolvedRequest.contactDetails || null,
        email: resolvedRequest.email || null,
        requiresApproval: true,
      },
      dedupePrefix: 'buyer-bond-originator-request',
    })
  }

  return {
    processed: true,
    status: resolvedRequest.status,
    request: resolvedRequest,
  }
}

function normalizeBuyerOnboardingPortalAccess(value) {
  const access = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const available = access.available === true
  const token = normalizeNullableText(access.token)

  if (!available || !token) {
    return {
      available: false,
      reason: normalizeNullableText(access.reason),
      clientPortalLink: null,
      clientPortalPath: '',
    }
  }

  const clientPortalLink = {
    id: normalizeNullableUuid(access.id),
    development_id: normalizeNullableUuid(access.developmentId || access.development_id),
    unit_id: normalizeNullableUuid(access.unitId || access.unit_id),
    transaction_id: normalizeNullableUuid(access.transactionId || access.transaction_id),
    buyer_id: normalizeNullableUuid(access.buyerId || access.buyer_id),
    token,
    is_active: access.isActive !== false && access.is_active !== false,
    created_at: access.createdAt || access.created_at || null,
    updated_at: access.updatedAt || access.updated_at || null,
  }

  return {
    available: true,
    reason: null,
    clientPortalLink,
    clientPortalPath: normalizeNullableText(access.path) || `/client/${token}`,
  }
}

async function getBuyerOnboardingPortalAccess(client) {
  const { data, error } = await client.rpc('bridge_buyer_onboarding_portal_access')

  if (error) {
    if (isMissingFunctionError(error, 'bridge_buyer_onboarding_portal_access') || isMissingSchemaError(error)) {
      throw new Error('Buyer portal access is not ready yet. Apply the buyer onboarding portal handoff migration.')
    }

    throw error
  }

  return normalizeBuyerOnboardingPortalAccess(data)
}

function isCapturedOnboardingValue(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'boolean') return true
  return false
}

function getOnboardingPurchaserEntries(formData = {}) {
  if (Array.isArray(formData.purchasers) && formData.purchasers.length) {
    return formData.purchasers.filter((entry) => entry && typeof entry === 'object')
  }

  const primary = {}
  const secondary = {}
  Object.entries(formData || {}).forEach(([key, value]) => {
    if (key.startsWith('co_')) {
      secondary[key.slice(3)] = value
    } else {
      primary[key] = value
    }
  })

  const entries = []
  if (Object.values(primary).some(isCapturedOnboardingValue)) entries.push(primary)
  if (Object.values(secondary).some(isCapturedOnboardingValue)) entries.push(secondary)
  return entries
}

function sumOnboardingPurchaserNumbers(entries = [], keys = []) {
  return entries.reduce((total, entry) => {
    const value = keys.map((key) => entry?.[key]).find(isCapturedOnboardingValue)
    return total + (normalizeOptionalNumber(value) || 0)
  }, 0)
}

function firstOnboardingPurchaserValue(entries = [], keys = []) {
  for (const entry of entries) {
    for (const key of keys) {
      if (isCapturedOnboardingValue(entry?.[key])) return entry[key]
    }
  }
  return ''
}

function firstCapturedOnboardingValue(candidates = []) {
  for (const candidate of candidates) {
    if (isCapturedOnboardingValue(candidate)) return candidate
  }
  return ''
}

function normalizeOnboardingChoice(value) {
  return normalizeTextValue(value).toLowerCase()
}

function isOnboardingYes(value) {
  return ['yes', 'true', '1'].includes(normalizeOnboardingChoice(value))
}

function isOnboardingNo(value) {
  return ['no', 'false', '0'].includes(normalizeOnboardingChoice(value))
}

function getOnboardingReadinessRiskFlags(formData = {}) {
  const purchasers = getOnboardingPurchaserEntries(formData)
  const finance = formData.finance && typeof formData.finance === 'object' ? formData.finance : {}
  const flags = []
  const anyPurchaserYes = (keys = []) => purchasers.some((entry) => keys.some((key) => isOnboardingYes(entry?.[key])))

  if (anyPurchaserYes(['under_debt_review', 'underDebtReview'])) flags.push('Debt review declared')
  if (anyPurchaserYes(['under_administration', 'underAdministration'])) flags.push('Administration declared')
  if (anyPurchaserYes(['ever_declared_insolvent', 'everDeclaredInsolvent'])) flags.push('Prior insolvency declared')
  if (anyPurchaserYes(['surety_obligations', 'suretyObligations'])) flags.push('Surety obligations declared')

  const bankStatementsAvailable = firstCapturedOnboardingValue([
    finance.bank_statements_available,
    finance.bankStatementsAvailable,
    formData.bank_statements_available,
    formData.bankStatementsAvailable,
  ])
  if (isOnboardingNo(bankStatementsAvailable)) flags.push('Bank statements not confirmed')

  const consent = firstCapturedOnboardingValue([
    finance.bond_readiness_consent,
    finance.bondReadinessConsent,
    formData.bond_readiness_consent,
    formData.bondReadinessConsent,
  ])
  if (isOnboardingNo(consent)) flags.push('Bond readiness sharing consent not granted')

  return flags
}

function monthsSinceOnboardingDate(value) {
  const normalized = normalizeTextValue(value)
  if (!normalized) return 0
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return 0
  const now = new Date()
  return Math.max(0, (now.getFullYear() - parsed.getFullYear()) * 12 + (now.getMonth() - parsed.getMonth()))
}

function getOnboardingEmploymentDurationMonths(entries = []) {
  return entries.reduce((maxMonths, entry) => {
    const fromStartDate = monthsSinceOnboardingDate(entry?.employment_start_date || entry?.employmentStartDate)
    const fromBusinessYears = (normalizeOptionalNumber(entry?.years_in_business || entry?.yearsInBusiness) || 0) * 12
    const explicit =
      normalizeOptionalNumber(entry?.employment_duration_months || entry?.employmentDurationMonths) ||
      normalizeOptionalNumber(entry?.employment_months || entry?.employmentMonths) ||
      0
    return Math.max(maxMonths, fromStartDate, fromBusinessYears, explicit)
  }, 0)
}

function buildOnboardingFinanceReadinessSnapshot(formData = {}, transaction = null) {
  const financeType = normalizeFinanceType(formData.purchase_finance_type || transaction?.finance_type || 'cash')
  if (!isBondFinanceType(financeType)) {
    return formData.finance_readiness || null
  }

  const purchasers = getOnboardingPurchaserEntries(formData)
  const monthlyIncome =
    sumOnboardingPurchaserNumbers(purchasers, [
      'gross_monthly_income',
      'grossMonthlyIncome',
      'monthly_income',
      'monthlyIncome',
    ]) || sumOnboardingPurchaserNumbers(purchasers, ['net_monthly_income', 'netMonthlyIncome'])
  const monthlyDebt = sumOnboardingPurchaserNumbers(purchasers, [
    'monthly_credit_commitments',
    'monthlyCreditCommitments',
    'monthly_debt',
    'monthlyDebt',
  ])
  const monthlyExpenses = sumOnboardingPurchaserNumbers(purchasers, [
    'monthly_living_expenses',
    'monthlyLivingExpenses',
    'monthly_expenses',
    'monthlyExpenses',
  ])
  const dependants = sumOnboardingPurchaserNumbers(purchasers, [
    'number_of_dependants',
    'numberOfDependants',
    'dependants',
    'dependents',
  ])
  const employmentDurationMonths = getOnboardingEmploymentDurationMonths(purchasers)
  const snapshot = getOnboardingFinanceSnapshot({ formData, transaction })
  const finance = formData.finance && typeof formData.finance === 'object' ? formData.finance : {}
  const deposit =
    normalizeOptionalNumber(
      finance.cash_contribution_available ??
        finance.cashContributionAvailable ??
        formData.cash_contribution_available ??
        formData.cashContributionAvailable ??
        formData.deposit_available ??
        formData.deposit_amount ??
        snapshot.cashAmount,
    ) || 0
  const hasCapturedPurchaserValue = (keys = []) =>
    purchasers.some((entry) => keys.some((key) => isCapturedOnboardingValue(entry?.[key])))
  const hasCapturedDeposit =
    [
      finance.cash_contribution_available,
      finance.cashContributionAvailable,
      formData.cash_contribution_available,
      formData.cashContributionAvailable,
      formData.deposit_available,
      formData.deposit_amount,
    ].some(isCapturedOnboardingValue) || deposit > 0
  const hasCashContributionSource = [
    finance.cash_contribution_source,
    finance.cashContributionSource,
    formData.cash_contribution_source,
    formData.cashContributionSource,
  ].some(isCapturedOnboardingValue)
  const hasBankStatementsChoice = [
    finance.bank_statements_available,
    finance.bankStatementsAvailable,
    formData.bank_statements_available,
    formData.bankStatementsAvailable,
  ].some(isCapturedOnboardingValue)
  const hasConsentChoice = [
    finance.bond_readiness_consent,
    finance.bondReadinessConsent,
    formData.bond_readiness_consent,
    formData.bondReadinessConsent,
  ].some(isCapturedOnboardingValue)
  const completenessChecks = [
    monthlyIncome > 0,
    employmentDurationMonths > 0,
    snapshot.purchasePrice > 0,
    hasCapturedPurchaserValue([
      'monthly_credit_commitments',
      'monthlyCreditCommitments',
      'monthly_debt',
      'monthlyDebt',
    ]) || monthlyDebt > 0,
    hasCapturedPurchaserValue(['number_of_dependants', 'numberOfDependants', 'dependants', 'dependents']) ||
      dependants > 0,
  ]
  completenessChecks.push(
    monthlyExpenses > 0,
    hasCapturedDeposit,
    hasCashContributionSource,
    hasBankStatementsChoice,
    hasConsentChoice,
  )

  const readiness = buildFinanceReadinessPayload(
    {
      monthlyIncome,
      monthlyDebt,
      monthlyExpenses,
      deposit,
      depositCaptured: hasCapturedDeposit,
      employmentType: firstOnboardingPurchaserValue(purchasers, ['employment_type', 'employmentType']),
      employmentDurationMonths,
      dependants,
      estimatedPurchaseRange: snapshot.purchasePrice || transaction?.purchase_price || transaction?.sales_price,
      documentReadiness: 0,
      onboardingCompleteness: completenessChecks.length
        ? completenessChecks.filter(Boolean).length / completenessChecks.length
        : 0,
    },
    formData,
  ).finance_readiness

  return {
    ...readiness,
    risk_flags: [...new Set([...(readiness.risk_flags || []), ...getOnboardingReadinessRiskFlags(formData)])],
  }
}

function validateOnboardingFinanceAndReservation({ formData = {}, transaction = null } = {}) {
  const snapshot = getOnboardingFinanceSnapshot({ formData, transaction })
  const hasPurchasePrice = Number.isFinite(snapshot.purchasePrice) && snapshot.purchasePrice > 0
  const hasCashAmount = Number.isFinite(snapshot.cashAmount) && snapshot.cashAmount > 0
  const hasBondAmount = Number.isFinite(snapshot.bondAmount) && snapshot.bondAmount > 0

  if (
    snapshot.financeType === 'combination' &&
    hasPurchasePrice &&
    hasCashAmount &&
    hasBondAmount &&
    snapshot.cashAmount + snapshot.bondAmount > snapshot.purchasePrice + 1
  ) {
    throw new Error('Cash Contribution plus Bond Amount cannot exceed the Purchase Price.')
  }
}

function validateOnboardingFundingSources({ formData = {}, transaction = null, submit = false } = {}) {
  const snapshot = getOnboardingFinanceSnapshot({ formData, transaction })
  const fundingSources = getOnboardingFundingSources(formData)
  if (!submit) {
    return fundingSources
  }

  const needsFundingPlan = snapshot.financeType === 'cash' || snapshot.financeType === 'combination'
  if (!needsFundingPlan || !fundingSources.length) {
    return fundingSources
  }

  for (const source of fundingSources) {
    if (!source.amount || source.amount <= 0) {
      throw new Error('Each funding source entry must include an amount.')
    }

    if (!source.sourceType || source.sourceType === 'other') {
      throw new Error('Each funding source entry must include a source type.')
    }
  }

  return fundingSources
}

async function markTransactionAwaitingSignedOtp(client, { transactionId, formData = {}, completedAt = null } = {}) {
  const normalizedTransactionId = normalizeNullableUuid(transactionId)
  if (!normalizedTransactionId) return null

  const nowIso = new Date().toISOString()
  const resolvedCompletedAt = completedAt || nowIso
  const nextAction = resolveAwaitingSignedOtpNextAction(formData)

  // The transaction state transition is persisted atomically by
  // bridge_save_buyer_onboarding_snapshot.  This client-side call is only a
  // best-effort internal-attorney projection; token holders must not be able
  // to write attorney assignments directly.
  try {
    await syncAttorneyIncomingInstructionStatus(client, {
      transactionId: normalizedTransactionId,
      status: ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingSignedOtp,
      occurredAt: resolvedCompletedAt,
      source: 'buyer_onboarding_completed',
    })
  } catch (error) {
    if (!isPermissionDeniedError(error) && !isMissingSchemaError(error)) {
      throw error
    }
    console.warn('Attorney instruction projection skipped for buyer onboarding', error)
  }

  return {
    onboardingStatus: 'awaiting_signed_otp',
    nextAction,
    completedAt: resolvedCompletedAt,
  }
}

function getBuyerOnboardingProjectionErrorCategory(error) {
  if (isPermissionDeniedError(error)) return 'permission_denied'
  if (isMissingSchemaError(error)) return 'schema_unavailable'
  if (isMissingFunctionError(error)) return 'function_unavailable'
  return 'projection_failed'
}

function buildBuyerOnboardingProjectionFailurePayload({
  projection = '',
  transaction = null,
  onboarding = null,
  purchaserType = '',
  financeType = '',
  submit = false,
  completedAt = '',
  error = null,
} = {}) {
  return {
    source: 'buyer_onboarding_projection_recovery_marker',
    projection: normalizeTextValue(projection),
    recoveryRequired: true,
    retryable: true,
    submit: Boolean(submit),
    transactionId: normalizeNullableUuid(transaction?.id || transaction?.transaction_id),
    onboardingId: normalizeNullableUuid(onboarding?.id || onboarding?.onboarding_id),
    purchaserType: normalizePurchaserType(purchaserType || transaction?.purchaser_type || onboarding?.purchaserType),
    financeType: normalizeFinanceType(financeType || transaction?.finance_type || 'cash'),
    completedAt: normalizeNullableText(completedAt),
    errorCategory: getBuyerOnboardingProjectionErrorCategory(error),
    errorCode: normalizeNullableText(error?.code || error?.status || error?.statusCode),
  }
}

async function recordBuyerOnboardingProjectionFailureMarker(
  client,
  {
    transactionId = '',
    eventType = '',
    projection = '',
    transaction = null,
    onboarding = null,
    purchaserType = '',
    financeType = '',
    submit = false,
    completedAt = '',
    error = null,
  } = {},
) {
  const normalizedTransactionId = normalizeNullableUuid(transactionId || transaction?.id || transaction?.transaction_id)
  if (!normalizedTransactionId || !eventType) return null

  try {
    return await logTransactionEventIfPossible(client, {
      transactionId: normalizedTransactionId,
      eventType,
      createdByRole: 'system',
      eventData: buildBuyerOnboardingProjectionFailurePayload({
        projection,
        transaction,
        onboarding,
        purchaserType,
        financeType,
        submit,
        completedAt,
        error,
      }),
    })
  } catch (markerError) {
    console.warn('Buyer onboarding projection recovery marker could not be recorded', markerError)
    return null
  }
}

const BUYER_ONBOARDING_PROJECTION_REPAIR_EVENT_TYPES = {
  required_documents: 'buyer_onboarding_required_documents_projection_failed',
  platform_fee_consent: 'buyer_onboarding_platform_fee_consent_projection_failed',
  buyer_participant_completion: 'buyer_onboarding_buyer_participant_projection_failed',
  information_sheet: 'buyer_onboarding_information_sheet_projection_failed',
  roleplayer: 'buyer_onboarding_roleplayer_projection_failed',
  workflow_evidence: 'buyer_onboarding_workflow_evidence_projection_failed',
  awaiting_signed_otp: 'buyer_onboarding_awaiting_signed_otp_projection_failed',
  finance_event: 'buyer_onboarding_finance_event_projection_failed',
}

const BUYER_ONBOARDING_REPAIRABLE_PROJECTIONS = Object.freeze(
  Object.keys(BUYER_ONBOARDING_PROJECTION_REPAIR_EVENT_TYPES),
)

function normalizeBuyerOnboardingRepairProjection(value = '') {
  const normalized = normalizeTextValue(value).toLowerCase()
  if (!normalized) return ''
  const fromEvent = Object.entries(BUYER_ONBOARDING_PROJECTION_REPAIR_EVENT_TYPES).find(
    ([, eventType]) => eventType === normalized,
  )
  if (fromEvent) return fromEvent[0]
  const canonical = normalized.replace(/^buyer_onboarding_/, '').replace(/_projection_failed$/, '')
  if (canonical === 'required_document' || canonical === 'required_documents') return 'required_documents'
  if (canonical === 'platform_fee' || canonical === 'platform_fee_consent') return 'platform_fee_consent'
  if (canonical === 'buyer_participant' || canonical === 'buyer_participant_completion') {
    return 'buyer_participant_completion'
  }
  if (canonical === 'information_sheet') return 'information_sheet'
  if (canonical === 'roleplayer' || canonical === 'buyer_bond_originator_roleplayer') return 'roleplayer'
  if (canonical === 'workflow' || canonical === 'workflow_evidence') return 'workflow_evidence'
  if (canonical === 'awaiting_signed_otp' || canonical === 'otp') return 'awaiting_signed_otp'
  if (canonical === 'finance' || canonical === 'finance_event' || canonical === 'finance_type_event') return 'finance_event'
  return BUYER_ONBOARDING_REPAIRABLE_PROJECTIONS.includes(normalized) ? normalized : ''
}

function normalizeBuyerOnboardingRepairProjectionList(projections = []) {
  const normalized = (Array.isArray(projections) ? projections : [projections])
    .map(normalizeBuyerOnboardingRepairProjection)
    .filter(Boolean)
  return [...new Set(normalized)]
}

async function acceptBuyerPlatformFeeConsent(client, {
  transaction = null,
  buyer = null,
  formData = {},
  onboarding = null,
  acceptedAt = null,
} = {}) {
  return {
    skipped: true,
    reason: 'platform_fee_deferred_to_otp',
    transactionId: normalizeNullableUuid(transaction?.id),
    onboardingId: normalizeNullableUuid(onboarding?.id),
    acceptedAt: acceptedAt || new Date().toISOString(),
  }
}

async function fetchTransactionRequiredDocumentByKeyIfPossible(client, { transactionId, documentKey }) {
  if (!transactionId || !documentKey) return null

  const fullSelect =
    'id, transaction_id, document_key, document_label, is_uploaded, status, uploaded_document_id, uploaded_at, notes, updated_at'
  const legacySelect = 'id, transaction_id, document_key, document_label, is_uploaded, uploaded_document_id, updated_at'
  let query = await client
    .from('transaction_required_documents')
    .select(fullSelect)
    .eq('transaction_id', transactionId)
    .eq('document_key', documentKey)
    .maybeSingle()

  if (
    query.error &&
    (isMissingColumnError(query.error, 'status') ||
      isMissingColumnError(query.error, 'uploaded_at') ||
      isMissingColumnError(query.error, 'notes'))
  ) {
    query = await client
      .from('transaction_required_documents')
      .select(legacySelect)
      .eq('transaction_id', transactionId)
      .eq('document_key', documentKey)
      .maybeSingle()
  }

  if (query.error) {
    if (isMissingTableError(query.error, 'transaction_required_documents') || isMissingSchemaError(query.error)) {
      return null
    }
    throw query.error
  }

  return query.data || null
}

async function updateTransactionRequiredDocumentCaptureIfPossible(
  client,
  { transactionId, documentKey, requirementId = null, patch = {} } = {},
) {
  if (!transactionId || !documentKey || !patch || !Object.keys(patch).length) return null

  const select = 'id, transaction_id, document_key, is_uploaded, status, uploaded_document_id, uploaded_at, notes, updated_at'
  if (requirementId) {
    return updateRecordByIdWithMissingColumnFallback(
      client,
      'transaction_required_documents',
      requirementId,
      patch,
      select,
    )
  }

  let currentPatch = { ...patch }
  let update = await client
    .from('transaction_required_documents')
    .update(currentPatch)
    .eq('transaction_id', transactionId)
    .eq('document_key', documentKey)
  let attempts = 0

  while (update.error && attempts < 12) {
    const missingKey = Object.keys(currentPatch).find((key) => isMissingColumnError(update.error, key))
    if (!missingKey) break
    delete currentPatch[missingKey]
    if (!Object.keys(currentPatch).length) return null
    update = await client
      .from('transaction_required_documents')
      .update(currentPatch)
      .eq('transaction_id', transactionId)
      .eq('document_key', documentKey)
    attempts += 1
  }

  if (update.error) {
    if (isMissingTableError(update.error, 'transaction_required_documents') || isMissingSchemaError(update.error)) {
      return null
    }
    throw update.error
  }

  return null
}

export async function fetchClientOnboardingByToken(token, buyerTarget = {}) {
  const client = requireOnboardingTokenClient(token)
  const onboarding = await resolveOnboardingTokenContext(client, token)
  const { transaction, unit, buyer, organisation, brandingOrganisation, brandingSource, development } = await resolveTransactionAndContext(
    client,
    onboarding.transactionId,
  )
  const developmentId = unit?.development_id || transaction.development_id
  const formDataPromise = fetchOnboardingFormDataForTransaction(
    client,
    transaction.id,
    transaction.purchaser_type || onboarding.purchaserType,
  )
  const developmentSettingsPromise = developmentId
    ? ensureDevelopmentSettings(client, developmentId, { createIfMissing: false })
      .then((settings) => normalizeBuyerBondOriginatorPolicy(settings))
      .catch((settingsError) => {
        if (!isMissingSchemaError(settingsError) && !isPermissionDeniedError(settingsError)) throw settingsError
        return normalizeBuyerBondOriginatorPolicy(DEFAULT_DEVELOPMENT_SETTINGS)
      })
    : Promise.resolve(normalizeBuyerBondOriginatorPolicy(DEFAULT_DEVELOPMENT_SETTINGS))
  const [formDataRow, rolePlayerPolicy, fundingSources, uploadedDocuments, buyerPortalAccess] = await Promise.all([
    formDataPromise,
    developmentSettingsPromise,
    fetchTransactionFundingSources(client, transaction.id),
    loadSharedDocuments(client, { transactionIds: [transaction.id], viewer: 'client' }),
    getBuyerOnboardingPortalAccess(client),
  ])
  let existingFormData = formDataRow?.formData || {}
  existingFormData = await hydrateSharedBuyerCapture(client, existingFormData, buyerTarget)
  const financeSnapshot = getOnboardingFinanceSnapshot({
    formData: existingFormData,
    transaction,
  })
  const onboardingFlow = resolveBuyerOnboardingFlow(existingFormData, transaction, {
    purchaserType: existingFormData.purchaser_type || transaction.purchaser_type || onboarding.purchaserType,
    financeType: financeSnapshot.financeType,
  })
  const purchaserType = normalizePurchaserType(
    onboardingFlow.purchaser_branch ||
      existingFormData.purchaser_type ||
      transaction.purchaser_type ||
      onboarding.purchaserType,
  )
  const formConfig = getPersonaFormConfig(purchaserType, {
    financeType: financeSnapshot.financeType,
    formData: existingFormData,
  })
  const requiredDocuments = await ensureTransactionRequiredDocuments(
    client,
    {
      transactionId: transaction.id,
      purchaserType,
      financeType: financeSnapshot.financeType,
      reservationRequired: financeSnapshot.reservationRequired,
      cashAmount: financeSnapshot.cashAmount,
      bondAmount: financeSnapshot.bondAmount,
      formData: existingFormData,
    },
    { sync: false },
  )
  const checklistResult = buildRequiredChecklistFromRows(requiredDocuments, uploadedDocuments)

  // An onboarding token is not the same capability as a portal token.  Use
  // the server-side exchange rather than trying to select or create raw links
  // under the onboarding header (which RLS correctly disallows).
  const clientPortalLink = buyerPortalAccess.clientPortalLink

  const mergedFormData = {
    ...existingFormData,
    purchaser_type: purchaserType,
    purchase_finance_type: financeSnapshot.financeType,
    purchase_price:
      existingFormData.purchase_price ??
      (financeSnapshot.purchasePrice !== null && financeSnapshot.purchasePrice !== undefined
        ? String(financeSnapshot.purchasePrice)
        : ''),
    cash_amount:
      existingFormData.cash_amount ??
      (financeSnapshot.cashAmount !== null && financeSnapshot.cashAmount !== undefined
        ? String(financeSnapshot.cashAmount)
        : ''),
    bond_amount:
      existingFormData.bond_amount ??
      (financeSnapshot.bondAmount !== null && financeSnapshot.bondAmount !== undefined
        ? String(financeSnapshot.bondAmount)
        : ''),
    deposit_amount:
      existingFormData.deposit_amount ??
      (financeSnapshot.depositAmount !== null && financeSnapshot.depositAmount !== undefined
        ? String(financeSnapshot.depositAmount)
        : ''),
    reservation_required: existingFormData.reservation_required ?? financeSnapshot.reservationRequired,
    reservation_amount:
      existingFormData.reservation_amount ??
      (financeSnapshot.reservationAmount !== null && financeSnapshot.reservationAmount !== undefined
        ? String(financeSnapshot.reservationAmount)
        : ''),
    reservation_status: existingFormData.reservation_status ?? financeSnapshot.reservationStatus,
    reservation_paid_date: existingFormData.reservation_paid_date ?? financeSnapshot.reservationPaidDate ?? '',
    funding_sources: existingFormData.funding_sources || fundingSources || [],
  }
  const derivedConfiguration = deriveOnboardingConfiguration(mergedFormData, {
    transaction,
  })
  const stepDefinitions = getOnboardingStepDefinitions(mergedFormData, {
    transaction,
  })

  return {
    onboarding,
    transaction,
    unit,
    buyer,
    organisation,
    branding: normalizeBuyerOnboardingBranding({
      organisation: brandingOrganisation || organisation,
      transaction,
      unit,
      development,
      brandingSource,
    }),
    development,
    purchaserType,
    purchaserTypeLabel: getPurchaserTypeLabel(purchaserType),
    formConfig,
    stepDefinitions,
    formData: mergedFormData,
    derivedConfiguration,
    requiredDocuments: checklistResult.checklist.map((item) => {
      const row = requiredDocuments.find((requiredItem) => requiredItem.key === item.key)
      return {
        key: item.key,
        label: item.label,
        group: row?.group || 'General',
        description: row?.description || '',
        requirementLevel: row?.requirementLevel || item.requirementLevel || 'required',
        complete: item.complete,
        uploadedDocumentId: row?.uploadedDocumentId || null,
      }
    }),
    summary: checklistResult.summary,
    uploadedDocuments,
    fundingSources,
    onboardingFlow,
    rolePlayerPolicy,
    clientPortalLink,
    clientPortalPath: buyerPortalAccess.clientPortalPath,
  }
}

function isBuyerCompletionParticipantRow(row = {}) {
  const roleValues = [
    row.role_type,
    row.transaction_role,
    row.buyer_party_role,
  ]
    .map((value) => normalizeTextValue(value).toLowerCase())
    .filter(Boolean)
  return (
    roleValues.some((role) => ['buyer', 'client', 'purchaser', 'primary_buyer', 'additional_buyer', 'co_buyer'].includes(role)) ||
    Boolean(row.buyer_party_id || row.is_primary_buyer)
  )
}

async function fetchBuyerCompletionParticipantsIfPossible(client, transactionId) {
  if (!transactionId) {
    return { rows: [], skipped: true, reason: 'missing_transaction' }
  }

  const query = await client
    .from('transaction_participants')
    .select(TRANSACTION_PARTICIPANT_FULL_SELECT)
    .eq('transaction_id', transactionId)
    .is('removed_at', null)

  if (query.error) {
    if (
      isMissingTableError(query.error, 'transaction_participants') ||
      isMissingSchemaError(query.error) ||
      isPermissionDeniedError(query.error)
    ) {
      return { rows: [], skipped: true, reason: 'transaction_participants_unavailable' }
    }
    if (isMissingTransactionParticipantExtendedColumn(query.error)) {
      return { rows: [], skipped: true, reason: 'buyer_participant_columns_unavailable' }
    }
    throw query.error
  }

  return {
    rows: (query.data || []).filter(isBuyerCompletionParticipantRow),
    skipped: false,
    reason: '',
  }
}

function matchBuyerCompletionParticipantRow(rows = [], target = {}) {
  if (!target?.hasTarget) return null
  const participantId = normalizeNullableText(target.participantId)
  const buyerPartyId = normalizeNullableText(target.buyerPartyId)
  const email = normalizeEmailAddress(target.email)

  return (
    (participantId ? rows.find((row) => normalizeNullableText(row?.id) === participantId) : null) ||
    (buyerPartyId ? rows.find((row) => normalizeNullableText(row?.buyer_party_id) === buyerPartyId) : null) ||
    (email ? rows.find((row) => normalizeEmailAddress(row?.participant_email) === email) : null) ||
    null
  )
}

function verifyBuyerCompletionTargetNonce(row = {}, target = {}) {
  const submittedNonce = normalizeNullableText(target?.targetNonce)
  if (!submittedNonce) {
    return { valid: true, reason: '' }
  }

  const metadata = row?.buyer_metadata && typeof row.buyer_metadata === 'object' && !Array.isArray(row.buyer_metadata)
    ? row.buyer_metadata
    : {}
  const expectedNonce = normalizeNullableText(
    metadata.lastBuyerOnboardingLinkNonce ||
      metadata.lastBuyerPortalLinkNonce ||
      metadata.buyerTargetNonce ||
      metadata.buyer_target_nonce,
  )

  if (!expectedNonce) {
    return { valid: true, reason: 'target_nonce_not_recorded' }
  }

  return expectedNonce === submittedNonce
    ? { valid: true, reason: '' }
    : { valid: false, reason: 'buyer_target_nonce_mismatch' }
}

async function updateBuyerCompletionParticipantRow(client, { transactionId, row, patch }) {
  if (!transactionId || !row?.id) {
    return { data: null, skipped: true, reason: 'missing_participant' }
  }

  let payload = { ...patch }
  let updateResult = await client
    .from('transaction_participants')
    .update(payload)
    .eq('transaction_id', transactionId)
    .eq('id', row.id)
    .select('id, buyer_party_id, participant_email, buyer_profile_status, buyer_onboarding_status, buyer_onboarding_completed_at')
    .maybeSingle()

  if (updateResult.error && isMissingColumnError(updateResult.error, 'buyer_metadata')) {
    payload = { ...payload }
    delete payload.buyer_metadata
    updateResult = await client
      .from('transaction_participants')
      .update(payload)
      .eq('transaction_id', transactionId)
      .eq('id', row.id)
      .select('id, buyer_party_id, participant_email, buyer_profile_status, buyer_onboarding_status, buyer_onboarding_completed_at')
      .maybeSingle()
  }

  if (updateResult.error && isMissingColumnError(updateResult.error, 'updated_at')) {
    payload = { ...payload }
    delete payload.updated_at
    updateResult = await client
      .from('transaction_participants')
      .update(payload)
      .eq('transaction_id', transactionId)
      .eq('id', row.id)
      .select('id, buyer_party_id, participant_email, buyer_profile_status, buyer_onboarding_status, buyer_onboarding_completed_at')
      .maybeSingle()
  }

  if (updateResult.error) {
    if (
      isMissingTableError(updateResult.error, 'transaction_participants') ||
      isMissingSchemaError(updateResult.error) ||
      isPermissionDeniedError(updateResult.error) ||
      isMissingTransactionParticipantExtendedColumn(updateResult.error)
    ) {
      return { data: null, skipped: true, reason: 'buyer_participant_completion_unavailable' }
    }
    throw updateResult.error
  }

  return { data: updateResult.data || null, skipped: false, reason: '' }
}

async function markTransactionBuyerOnboardingCompleted(
  client,
  {
    transaction = null,
    buyer = null,
    formData = {},
    completedAt = '',
    source = 'buyer_onboarding_completed',
  } = {},
) {
  const transactionId = normalizeNullableUuid(transaction?.id || transaction?.transaction_id)
  if (!transactionId) {
    return { status: 'skipped', reason: 'missing_transaction', target: null }
  }

  const participantLookup = await fetchBuyerCompletionParticipantsIfPossible(client, transactionId)
  if (participantLookup.skipped) {
    return { status: 'skipped', reason: participantLookup.reason, target: null }
  }

  const target = resolveBuyerOnboardingCompletionTarget({
    buyers: participantLookup.rows,
    formData,
    buyer,
  })
  const matchedRow = matchBuyerCompletionParticipantRow(participantLookup.rows, target)
  if (!matchedRow?.id) {
    return {
      status: 'skipped',
      reason: 'buyer_participant_not_matched',
      target,
    }
  }
  const nonceVerification = verifyBuyerCompletionTargetNonce(matchedRow, target)
  if (!nonceVerification.valid) {
    return {
      status: 'skipped',
      reason: nonceVerification.reason,
      target,
    }
  }

  const completedTimestamp = normalizeNullableText(completedAt) || new Date().toISOString()
  const patch = buildBuyerOnboardingCompletionParticipantPatch({
    target,
    completedAt: completedTimestamp,
    source,
    existingMetadata: matchedRow.buyer_metadata,
  })
  const updateResult = await updateBuyerCompletionParticipantRow(client, {
    transactionId,
    row: matchedRow,
    patch,
  })
  if (updateResult.skipped) {
    return {
      status: 'skipped',
      reason: updateResult.reason,
      target,
    }
  }

  await logTransactionEventIfPossible(client, {
    transactionId,
    eventType: 'buyer_onboarding_participant_completed',
    createdByRole: 'client',
    eventData: {
      source,
      version: target.version,
      participantId: target.participantId || matchedRow.id,
      buyerPartyId: target.buyerPartyId || matchedRow.buyer_party_id || null,
      buyerEmail: target.email || normalizeEmailAddress(matchedRow.participant_email) || null,
      buyerName: target.name || normalizeTextValue(matchedRow.participant_name) || null,
      matchBasis: target.matchBasis,
      completedAt: completedTimestamp,
    },
  })

  return {
    status: 'completed',
    reason: '',
    target,
    participant: updateResult.data || {
      id: matchedRow.id,
      buyer_party_id: matchedRow.buyer_party_id || null,
      participant_email: matchedRow.participant_email || null,
    },
    completedAt: completedTimestamp,
  }
}

async function notifyTransactionOwnerOnOnboardingSubmitted(
  client,
  { transactionId, buyerName = '', developmentName = '', unitLabel = '', transactionReference = '' } = {},
) {
  if (!transactionId) {
    return null
  }

  let ownerQuery = await client
    .from('transactions')
    .select('id, owner_user_id, transaction_reference, assigned_agent_email')
    .eq('id', transactionId)
    .maybeSingle()

  if (
    ownerQuery.error &&
    (isMissingColumnError(ownerQuery.error, 'owner_user_id') ||
      isMissingColumnError(ownerQuery.error, 'transaction_reference') ||
      isMissingColumnError(ownerQuery.error, 'assigned_agent_email'))
  ) {
    ownerQuery = await client
      .from('transactions')
      .select('id, owner_user_id, transaction_reference')
      .eq('id', transactionId)
      .maybeSingle()
  }

  if (
    ownerQuery.error &&
    (isMissingColumnError(ownerQuery.error, 'owner_user_id') ||
      isMissingColumnError(ownerQuery.error, 'transaction_reference'))
  ) {
    ownerQuery = await client.from('transactions').select('id, owner_user_id').eq('id', transactionId).maybeSingle()
  }

  if (ownerQuery.error && isMissingColumnError(ownerQuery.error, 'owner_user_id')) {
    ownerQuery = await client.from('transactions').select('id').eq('id', transactionId).maybeSingle()
  }

  if (ownerQuery.error) {
    if (isMissingSchemaError(ownerQuery.error)) {
      return null
    }
    throw ownerQuery.error
  }

  let ownerUserId = normalizeNullableText(ownerQuery.data?.owner_user_id)
  let ownerRoleType = 'developer'

  if (!ownerUserId) {
    const assignedAgentEmail = normalizeNullableText(ownerQuery.data?.assigned_agent_email)?.toLowerCase() || ''
    if (assignedAgentEmail) {
      const profileQuery = await client
        .from('profiles')
        .select('id')
        .ilike('email', assignedAgentEmail)
        .limit(1)
        .maybeSingle()

      if (profileQuery.error) {
        if (
          !isMissingSchemaError(profileQuery.error) &&
          !isMissingTableError(profileQuery.error, 'profiles') &&
          !isPermissionDeniedError(profileQuery.error)
        ) {
          throw profileQuery.error
        }
      } else if (profileQuery.data?.id) {
        ownerUserId = normalizeNullableText(profileQuery.data.id)
        ownerRoleType = 'agent'
      }
    }
  }

  if (!ownerUserId) {
    const participantsQuery = await client
      .from('transaction_participants')
      .select('user_id, role_type, status, removed_at')
      .eq('transaction_id', transactionId)

    if (!participantsQuery.error) {
      const activeParticipants = (participantsQuery.data || []).filter(
        (row) => row?.user_id && !row?.removed_at && normalizeStakeholderStatus(row?.status, 'active') === 'active',
      )
      const prioritizedParticipant =
        activeParticipants.find((row) => normalizeRoleType(row?.role_type) === 'developer') ||
        activeParticipants.find((row) => normalizeRoleType(row?.role_type) === 'agent') ||
        activeParticipants[0] ||
        null
      if (prioritizedParticipant?.user_id) {
        ownerUserId = normalizeNullableText(prioritizedParticipant.user_id)
        ownerRoleType = normalizeRoleType(prioritizedParticipant.role_type || 'developer')
      }
    } else if (
      !isMissingSchemaError(participantsQuery.error) &&
      !isMissingTableError(participantsQuery.error, 'transaction_participants') &&
      !isPermissionDeniedError(participantsQuery.error)
    ) {
      throw participantsQuery.error
    }
  }

  if (!ownerUserId) {
    const ownerEventQuery = await client
      .from('transaction_events')
      .select('created_by, created_by_role, event_type, created_at')
      .eq('transaction_id', transactionId)
      .eq('event_type', 'TransactionCreated')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!ownerEventQuery.error && ownerEventQuery.data?.created_by) {
      ownerUserId = normalizeNullableText(ownerEventQuery.data.created_by)
      ownerRoleType = normalizeRoleType(ownerEventQuery.data.created_by_role || 'developer')
    } else if (
      ownerEventQuery.error &&
      !isMissingSchemaError(ownerEventQuery.error) &&
      !isMissingTableError(ownerEventQuery.error, 'transaction_events') &&
      !isPermissionDeniedError(ownerEventQuery.error)
    ) {
      throw ownerEventQuery.error
    }
  }

  if (!ownerUserId) {
    return null
  }

  const resolvedBuyerName = normalizeTextValue(buyerName) || 'Client'
  const propertyLine = [normalizeTextValue(developmentName), normalizeTextValue(unitLabel)].filter(Boolean).join(' ')
  const resolvedTransactionReference =
    normalizeTextValue(transactionReference) || normalizeTextValue(ownerQuery.data?.transaction_reference)

  const message = propertyLine
    ? `Client ${resolvedBuyerName} buying ${propertyLine} has submitted the onboarding. Prepare their OTP and upload it to the transaction.`
    : `Client ${resolvedBuyerName} has submitted the onboarding. Prepare their OTP and upload it to the transaction.`

  return notifyRolesForTransaction(client, {
    transactionId,
    roleTypes: [ownerRoleType],
    notificationType: 'readiness_updated',
    title: 'Buyer Onboarding Submitted',
    message,
    eventType: 'TransactionUpdated',
    eventData: {
      trigger: 'client_onboarding_submitted',
      actionRequired: 'prepare_otp_and_upload',
      buyerName: resolvedBuyerName,
      developmentName: normalizeTextValue(developmentName) || null,
      unitLabel: normalizeTextValue(unitLabel) || null,
      transactionReference: resolvedTransactionReference || null,
    },
    dedupeKey: `onboarding-completed:${transactionId}:${ownerUserId}`,
  })
}

async function upsertClientOnboardingForm({ token, formData = {}, submit = false }) {
  const client = requireOnboardingTokenClient(token)
  const onboarding = await resolveOnboardingTokenContext(client, token)
  const { transaction, unit, buyer } = await resolveTransactionAndContext(client, onboarding.transactionId)
  const developmentId = unit?.development_id || transaction.development_id
  let rolePlayerPolicy = normalizeBuyerBondOriginatorPolicy(DEFAULT_DEVELOPMENT_SETTINGS)
  if (developmentId) {
    try {
      const developmentSettings = await ensureDevelopmentSettings(client, developmentId, {
        createIfMissing: false,
      })
      rolePlayerPolicy = normalizeBuyerBondOriginatorPolicy(developmentSettings)
    } catch (settingsError) {
      if (!isMissingSchemaError(settingsError) && !isPermissionDeniedError(settingsError)) {
        throw settingsError
      }
    }
  }
  const purchaserType = normalizePurchaserType(
    formData.purchaser_type || transaction.purchaser_type || onboarding.purchaserType,
  )
  const normalizedFormData = {
    ...formData,
    purchaser_type: purchaserType,
  }
  let fundingSources = getOnboardingFundingSources(normalizedFormData)
  if (submit) {
    validateOnboardingSubmission(normalizedFormData, { transaction })
    if (!isBuyerFicaDeclarationSigned(normalizedFormData.buyer_fica_declaration)) {
      throw new Error('Review and sign the FICA declaration before submitting.')
    }
    validateOnboardingFinanceAndReservation({
      formData: normalizedFormData,
      transaction,
    })
    fundingSources = validateOnboardingFundingSources({
      formData: normalizedFormData,
      transaction,
      submit: true,
    })
  }
  const financeReadinessSnapshot = submit
    ? buildOnboardingFinanceReadinessSnapshot(normalizedFormData, transaction)
    : normalizedFormData.finance_readiness || null
  let formDataForPersistence = financeReadinessSnapshot
    ? {
        ...normalizedFormData,
        finance_readiness: financeReadinessSnapshot,
      }
    : normalizedFormData
  formDataForPersistence = {
    ...formDataForPersistence,
    ...buildBuyerOnboardingFlowSnapshot(formDataForPersistence, transaction, purchaserType),
  }

  const now = new Date().toISOString()
  const buyerBondOriginatorRequest = getBuyerAppointedBondOriginatorRequest({
    formData: formDataForPersistence,
    transaction,
    buyer,
    policy: rolePlayerPolicy,
    now,
  })
  if (buyerBondOriginatorRequest.status === 'not_allowed') {
    formDataForPersistence = clearBuyerAppointedBondOriginatorFields(formDataForPersistence)
  }
  formDataForPersistence = {
    ...formDataForPersistence,
    buyer_bond_originator_request: buyerBondOriginatorRequest,
    buyerBondOriginatorRequest: buyerBondOriginatorRequest,
  }
  const financeManagedBy = deriveOnboardingFinanceManagedBy({
    formData: formDataForPersistence,
    transaction,
  })
  formDataForPersistence = {
    ...formDataForPersistence,
    finance_managed_by: financeManagedBy,
    financeManagedBy,
    finance: {
      ...(formDataForPersistence.finance && typeof formDataForPersistence.finance === 'object'
        ? formDataForPersistence.finance
        : {}),
      finance_managed_by: financeManagedBy,
      financeManagedBy,
    },
  }
  const lifecycleStatus = submit ? 'awaiting_signed_otp' : 'awaiting_client_onboarding'
  const onboardingNextAction = submit ? resolveAwaitingSignedOtpNextAction(formDataForPersistence) : null
  formDataForPersistence = {
    ...formDataForPersistence,
    funding_sources: fundingSources,
  }

  if (submit && !isPlatformFeeConsentAccepted(formDataForPersistence, 'buyer')) {
    throw new Error(getPlatformFeeConsentConfig('buyer').validationMessage)
  }

  const snapshotSave = await syncOnboardingTransactionFinanceSnapshot(client, {
    transaction,
    formData: formDataForPersistence,
    purchaserType,
    onboardingStatus: lifecycleStatus,
    onboardingCompletedAt: submit ? now : null,
    externalOnboardingSubmittedAt: submit ? now : null,
    fundingSources,
    submit,
    nextAction: onboardingNextAction,
  })

  const financeSnapshot = getOnboardingFinanceSnapshot({
    formData: formDataForPersistence,
    transaction,
  })
  const buyerPortalAccess = normalizeBuyerOnboardingPortalAccess(snapshotSave?.portal)
  const clientPortalLink = buyerPortalAccess.clientPortalLink
  const clientPortalPath = buyerPortalAccess.clientPortalPath

  const updatedOnboarding = snapshotSave?.onboarding || null
  if (!updatedOnboarding?.id) {
    throw new Error('Buyer onboarding state could not be saved.')
  }
  const projectionMarkerContext = {
    transactionId: transaction.id,
    transaction,
    onboarding: updatedOnboarding,
    purchaserType,
    financeType: financeSnapshot.financeType,
    submit,
    completedAt: submit ? now : '',
  }

  try {
    await ensureTransactionRequiredDocuments(client, {
      transactionId: transaction.id,
      purchaserType,
      financeType: financeSnapshot.financeType,
      reservationRequired: financeSnapshot.reservationRequired,
      cashAmount: financeSnapshot.cashAmount,
      bondAmount: financeSnapshot.bondAmount,
      formData: formDataForPersistence,
    }, { emitAudit: false })
  } catch (requiredDocumentsError) {
    console.warn('Buyer onboarding required document projection failed after snapshot save', requiredDocumentsError)
    await recordBuyerOnboardingProjectionFailureMarker(client, {
      ...projectionMarkerContext,
      eventType: 'buyer_onboarding_required_documents_projection_failed',
      projection: 'required_documents',
      error: requiredDocumentsError,
    })
  }

  let buyerOnboardingCompletionHook = null
  let buyerCompletionProjection = null
  let bondFallbackQueueCandidate = null
  let bondAssistanceRoutingDecision = null
  let attorneyHandoffRepairQueueCandidate = null
  let informationSheetCapture = null

  if (submit) {
    try {
      buyerCompletionProjection = await markTransactionBuyerOnboardingCompleted(client, {
        transaction,
        buyer,
        formData: formDataForPersistence,
        completedAt: now,
        source: 'buyer_onboarding_completed',
      })
    } catch (buyerParticipantCompletionError) {
      console.warn('Buyer participant completion projection failed after snapshot save', buyerParticipantCompletionError)
      await recordBuyerOnboardingProjectionFailureMarker(client, {
        ...projectionMarkerContext,
        eventType: 'buyer_onboarding_buyer_participant_projection_failed',
        projection: 'buyer_participant_completion',
        error: buyerParticipantCompletionError,
      })
    }

    try {
      await acceptBuyerPlatformFeeConsent(client, {
        transaction,
        buyer,
        formData: formDataForPersistence,
        onboarding: updatedOnboarding,
        acceptedAt: now,
      })
    } catch (platformFeeConsentError) {
      console.warn('Buyer onboarding platform fee consent projection failed after snapshot save', platformFeeConsentError)
      await recordBuyerOnboardingProjectionFailureMarker(client, {
        ...projectionMarkerContext,
        eventType: 'buyer_onboarding_platform_fee_consent_projection_failed',
        projection: 'platform_fee_consent',
        error: platformFeeConsentError,
      })
    }

    try {
      const existingInformationSheetRequirement = await fetchTransactionRequiredDocumentByKeyIfPossible(client, {
        transactionId: transaction.id,
        documentKey: INFORMATION_SHEET_DOCUMENT_KEY,
      })
      informationSheetCapture = buildOnboardingInformationSheetCapture({
        transaction,
        onboarding: updatedOnboarding,
        formData: formDataForPersistence,
        existingRequirement: existingInformationSheetRequirement,
        capturedAt: now,
        source: 'buyer_onboarding_completed',
      })

      await updateTransactionRequiredDocumentCaptureIfPossible(client, {
        transactionId: transaction.id,
        documentKey: informationSheetCapture.documentKey,
        requirementId: informationSheetCapture.requirementId,
        patch: informationSheetCapture.requirementPatch,
      })

    } catch (informationSheetError) {
      console.warn('Buyer onboarding information sheet projection failed after snapshot save', informationSheetError)
      await recordBuyerOnboardingProjectionFailureMarker(client, {
        ...projectionMarkerContext,
        eventType: 'buyer_onboarding_information_sheet_projection_failed',
        projection: 'information_sheet',
        error: informationSheetError,
      })
    }

    try {
      await upsertBondApplicationConsent(client, {
        transaction,
        request: buyerBondOriginatorRequest,
        actorRole: 'client',
      })
      await processBuyerAppointedBondOriginatorRequest(client, {
        transaction,
        buyer,
        formData: formDataForPersistence,
        policy: rolePlayerPolicy,
        request: buyerBondOriginatorRequest,
        source: 'buyer_onboarding_completed',
      })
    } catch (roleplayerRequestError) {
      console.warn('Buyer bond originator request processing failed', roleplayerRequestError)
      await recordBuyerOnboardingProjectionFailureMarker(client, {
        ...projectionMarkerContext,
        eventType: 'buyer_onboarding_roleplayer_projection_failed',
        projection: 'buyer_bond_originator_roleplayer',
        error: roleplayerRequestError,
      })
    }

    // The token-bound snapshot RPC owns the immutable completion audit.
    // Professional reporting reads the saved facts; a bearer-token browser
    // must not write staff workflow, audit or system-comment tables.

    let otpPendingState = {
      onboardingStatus: 'awaiting_signed_otp',
      nextAction: onboardingNextAction,
      completedAt: now,
    }
    try {
      otpPendingState =
        (await markTransactionAwaitingSignedOtp(client, {
          transactionId: transaction.id,
          formData: formDataForPersistence,
          completedAt: now,
        })) || otpPendingState
    } catch (otpProjectionError) {
      console.warn('Buyer onboarding awaiting-signed-OTP projection failed after snapshot save', otpProjectionError)
      await recordBuyerOnboardingProjectionFailureMarker(client, {
        ...projectionMarkerContext,
        eventType: 'buyer_onboarding_awaiting_signed_otp_projection_failed',
        projection: 'awaiting_signed_otp',
        error: otpProjectionError,
      })
    }

    let completionRolePlayers = []
    try {
      completionRolePlayers = await fetchTransactionRolePlayersIfPossible(client, transaction.id)
    } catch (rolePlayerLookupError) {
      if (!isPermissionDeniedError(rolePlayerLookupError) && !isMissingSchemaError(rolePlayerLookupError)) {
        throw rolePlayerLookupError
      }
      console.warn('Bond fallback queue roleplayer lookup skipped', rolePlayerLookupError)
    }

    bondAssistanceRoutingDecision = buildBondAssistanceRoutingDecision({
      transaction,
      onboarding: updatedOnboarding,
      formData: formDataForPersistence,
      financeSnapshot,
      rolePlayers: completionRolePlayers,
      buyerBondOriginatorRequest,
      completedAt: otpPendingState?.completedAt || now,
      source: 'buyer_onboarding_completed',
    })
    buyerOnboardingCompletionHook = buildBuyerOnboardingCompletionHook({
      transaction,
      onboarding: updatedOnboarding,
      previousTransaction: transaction,
      previousOnboarding: onboarding,
      formData: formDataForPersistence,
      financeSnapshot,
      rolePlayerPolicy,
      buyerBondOriginatorRequest,
      bondAssistanceRouting: bondAssistanceRoutingDecision,
      completedAt: otpPendingState?.completedAt || now,
      nextAction: otpPendingState?.nextAction || onboardingNextAction,
      submit: true,
    })
    bondFallbackQueueCandidate = buildBondFallbackQueueCandidate({
      transaction,
      onboarding: updatedOnboarding,
      formData: formDataForPersistence,
      financeSnapshot,
      rolePlayers: completionRolePlayers,
      buyerBondOriginatorRequest,
      bondAssistanceRouting: bondAssistanceRoutingDecision,
      completionHook: buyerOnboardingCompletionHook,
      completedAt: otpPendingState?.completedAt || now,
      source: 'buyer_onboarding_completed',
    })
    attorneyHandoffRepairQueueCandidate = buildAttorneyHandoffRepairQueueCandidate({
      transaction,
      onboarding: updatedOnboarding,
      rolePlayers: completionRolePlayers,
      routingProfile: transaction?.routing_profile_json || transaction?.routingProfile || transaction?.routing_profile || {},
      completionHook: buyerOnboardingCompletionHook,
      completedAt: otpPendingState?.completedAt || now,
      source: 'buyer_onboarding_completed',
    })

    if (bondAssistanceRoutingDecision?.event) {
      try {

        if (bondAssistanceRoutingDecision.notification) {
          await notifyRolesForTransaction(client, {
            transactionId: transaction.id,
            ...bondAssistanceRoutingDecision.notification,
          })
        }
      } catch (bondAssistanceRoutingError) {
        if (!isPermissionDeniedError(bondAssistanceRoutingError) && !isMissingSchemaError(bondAssistanceRoutingError)) {
          throw bondAssistanceRoutingError
        }
        console.warn('Bond assistance routing projection skipped', bondAssistanceRoutingError)
      }
    }

    if (bondFallbackQueueCandidate?.required && bondFallbackQueueCandidate.event) {
      try {

        await notifyRolesForTransaction(client, {
          transactionId: transaction.id,
          roleTypes: ['agent', 'developer'],
          title: 'Bond fallback queue',
          message:
            bondFallbackQueueCandidate.nextAction ||
            'Bond finance needs manual originator assignment before post-OTP handoff can continue.',
          notificationType: 'readiness_updated',
          eventType: 'TransactionUpdated',
          eventData: {
            source: 'bond_fallback_queue_candidate',
            queueKey: bondFallbackQueueCandidate.queueKey,
            priority: bondFallbackQueueCandidate.priority,
            reasonKeys: bondFallbackQueueCandidate.reasons.map((item) => item.key),
          },
          dedupePrefix: 'bond-fallback-queue',
        })
      } catch (bondFallbackError) {
        if (!isPermissionDeniedError(bondFallbackError) && !isMissingSchemaError(bondFallbackError)) {
          throw bondFallbackError
        }
        console.warn('Bond fallback queue projection skipped', bondFallbackError)
      }
    }

    if (attorneyHandoffRepairQueueCandidate?.required && attorneyHandoffRepairQueueCandidate.event) {
      try {

        await notifyRolesForTransaction(client, {
          transactionId: transaction.id,
          roleTypes: ['agent', 'developer'],
          title: 'Attorney handoff repair queue',
          message:
            attorneyHandoffRepairQueueCandidate.nextAction ||
            'Legal handoff needs attorney assignment repair before the transaction can progress cleanly.',
          notificationType: 'readiness_updated',
          eventType: 'TransactionUpdated',
          eventData: {
            source: 'attorney_handoff_repair_queue_candidate',
            queueKey: attorneyHandoffRepairQueueCandidate.queueKey,
            priority: attorneyHandoffRepairQueueCandidate.priority,
            requiredRoles: attorneyHandoffRepairQueueCandidate.requiredRoles,
            reasonKeys: attorneyHandoffRepairQueueCandidate.reasons.map((item) => item.key),
          },
          dedupePrefix: 'attorney-handoff-repair-queue',
        })
      } catch (attorneyRepairError) {
        if (!isPermissionDeniedError(attorneyRepairError) && !isMissingSchemaError(attorneyRepairError)) {
          throw attorneyRepairError
        }
        console.warn('Attorney handoff repair queue projection skipped', attorneyRepairError)
      }
    }

    try {
      const developmentRecord =
        unit?.development && Array.isArray(unit.development) ? unit.development[0] || null : unit?.development || null
      const developmentName = normalizeTextValue(developmentRecord?.name || '')
      const unitNumber = normalizeTextValue(unit?.unit_number || '')
      const unitLabel = unitNumber ? `Unit ${unitNumber}` : ''
      const completedBuyerName = normalizeTextValue(buyerCompletionProjection?.target?.name || buyer?.name || '')

      await notifyTransactionOwnerOnOnboardingSubmitted(client, {
        transactionId: transaction.id,
        buyerName: completedBuyerName,
        developmentName,
        unitLabel,
        transactionReference: normalizeTextValue(transaction?.transaction_reference || ''),
      })
    } catch (notificationError) {
      console.warn('Onboarding submitted owner notification failed', notificationError)
    }

    try {
      await notifyRolesForTransaction(client, {
        transactionId: transaction.id,
        roleTypes: ['agent', 'developer'],
        title: 'Prepare OTP',
        message: otpPendingState?.nextAction || 'Buyer onboarding has been submitted. Prepare the OTP before finance or attorney handoff.',
        notificationType: 'readiness_updated',
        eventType: 'TransactionUpdated',
        eventData: {
          source: 'buyer_onboarding_completed',
          readiness: 'awaiting_signed_otp',
          financeType: financeSnapshot.financeType || transaction.finance_type,
          intakePreference: resolveClientIntakePreferenceFromFormData(formDataForPersistence),
        },
        dedupePrefix: 'awaiting-signed-otp',
      })
    } catch (otpNotificationError) {
      console.warn('OTP pending notification failed', otpNotificationError)
    }
  }

  return {
    ...normalizeOnboardingRow(updatedOnboarding, purchaserType),
    transactionId: transaction.id,
    clientPortalPath,
    clientPortalLink,
    completionHook: buyerOnboardingCompletionHook,
    buyerCompletion: buyerCompletionProjection,
    bondAssistanceRouting: bondAssistanceRoutingDecision,
    bondFallbackQueue: bondFallbackQueueCandidate,
    attorneyHandoffRepairQueue: attorneyHandoffRepairQueueCandidate,
    documentCapture: {
      informationSheet: informationSheetCapture,
    },
  }
}

export async function saveClientOnboardingDraft({ token, formData }) {
  return upsertClientOnboardingForm({
    token,
    formData,
    submit: false,
  })
}

export async function submitClientOnboarding({ token, formData }) {
  return upsertClientOnboardingForm({
    token,
    formData,
    submit: true,
  })
}

async function resolveBuyerOnboardingProjectionRepairTargets(
  client,
  { transactionId = '', projections = [], useRecoveryMarkers = true } = {},
) {
  const explicitTargets = normalizeBuyerOnboardingRepairProjectionList(projections)
  if (explicitTargets.length) return explicitTargets

  if (!useRecoveryMarkers) {
    return [...BUYER_ONBOARDING_REPAIRABLE_PROJECTIONS]
  }

  const markerEventTypes = Object.values(BUYER_ONBOARDING_PROJECTION_REPAIR_EVENT_TYPES)
  const markerQuery = await client
    .from('transaction_events')
    .select('event_type, event_data, created_at')
    .eq('transaction_id', transactionId)
    .in('event_type', markerEventTypes)
    .order('created_at', { ascending: false })

  if (markerQuery.error) {
    if (
      isMissingTableError(markerQuery.error, 'transaction_events') ||
      isMissingSchemaError(markerQuery.error) ||
      isPermissionDeniedError(markerQuery.error)
    ) {
      return [...BUYER_ONBOARDING_REPAIRABLE_PROJECTIONS]
    }
    throw markerQuery.error
  }

  const markerTargets = (markerQuery.data || [])
    .filter((event) => event?.event_data?.recoveryRequired !== false)
    .map((event) => normalizeBuyerOnboardingRepairProjection(event.event_data?.projection || event.event_type))
    .filter(Boolean)

  return markerTargets.length ? [...new Set(markerTargets)] : [...BUYER_ONBOARDING_REPAIRABLE_PROJECTIONS]
}

function isBuyerOnboardingSubmittedForProjectionRepair(transaction = {}, onboarding = null) {
  const transactionStatus = normalizeTextValue(transaction?.onboarding_status || transaction?.onboardingStatus)
    .toLowerCase()
  const onboardingStatus = normalizeTextValue(onboarding?.status).toLowerCase()
  return (
    ['awaiting_signed_otp', 'signed_otp_received', 'client_onboarding_complete'].includes(transactionStatus) ||
    ['submitted', 'reviewed', 'approved'].includes(onboardingStatus) ||
    Boolean(transaction?.onboarding_completed_at || transaction?.onboardingCompletedAt) ||
    Boolean(transaction?.external_onboarding_submitted_at || transaction?.externalOnboardingSubmittedAt) ||
    Boolean(onboarding?.submittedAt || onboarding?.submitted_at)
  )
}

async function runBuyerOnboardingProjectionRepair(client, projection, context) {
  const {
    transaction,
    buyer,
    onboarding,
    formData,
    purchaserType,
    financeSnapshot,
    rolePlayerPolicy,
    buyerBondOriginatorRequest,
    completedAt,
  } = context
  const transactionId = transaction.id

  if (projection === 'required_documents') {
    return ensureTransactionRequiredDocuments(client, {
      transactionId,
      purchaserType,
      financeType: financeSnapshot.financeType,
      reservationRequired: financeSnapshot.reservationRequired,
      cashAmount: financeSnapshot.cashAmount,
      bondAmount: financeSnapshot.bondAmount,
      formData,
    })
  }

  if (projection === 'platform_fee_consent') {
    if (!isPlatformFeeConsentAccepted(formData, 'buyer')) {
      return { skipped: true, reason: 'platform_fee_consent_not_accepted' }
    }
    if (!onboarding?.token) {
      throw new Error('Active buyer onboarding token is required to replay platform fee consent.')
    }
    const tokenClient = requireOnboardingTokenClient(onboarding.token)
    return acceptBuyerPlatformFeeConsent(tokenClient, {
      transaction,
      buyer,
      formData,
      onboarding,
      acceptedAt: completedAt || new Date().toISOString(),
    })
  }

  if (projection === 'buyer_participant_completion') {
    return markTransactionBuyerOnboardingCompleted(client, {
      transaction,
      buyer,
      formData,
      completedAt: completedAt || new Date().toISOString(),
      source: 'buyer_onboarding_projection_replay',
    })
  }

  if (projection === 'information_sheet') {
    const capturedAt = completedAt || new Date().toISOString()
    const existingRequirement = await fetchTransactionRequiredDocumentByKeyIfPossible(client, {
      transactionId,
      documentKey: INFORMATION_SHEET_DOCUMENT_KEY,
    })
    const informationSheetCapture = buildOnboardingInformationSheetCapture({
      transaction,
      onboarding,
      formData,
      existingRequirement,
      capturedAt,
      source: 'buyer_onboarding_projection_replay',
    })

    await updateTransactionRequiredDocumentCaptureIfPossible(client, {
      transactionId,
      documentKey: informationSheetCapture.documentKey,
      requirementId: informationSheetCapture.requirementId,
      patch: informationSheetCapture.requirementPatch,
    })

    if (informationSheetCapture.workflowEvidence) {
      await processWorkflowEvidenceIfPossible(client, {
        transactionId,
        ...informationSheetCapture.workflowEvidence,
        createdBy: null,
        payload: {
          captureKind: informationSheetCapture.captureKind,
          documentKey: informationSheetCapture.documentKey,
          onboardingId: onboarding?.id || null,
          uploadedDocumentId: informationSheetCapture.uploadedDocumentId,
        },
      })
    }

    return informationSheetCapture
  }

  if (projection === 'roleplayer') {
    await upsertBondApplicationConsent(client, {
      transaction,
      request: buyerBondOriginatorRequest,
      actorRole: 'system_repair',
    })
    return processBuyerAppointedBondOriginatorRequest(client, {
      transaction,
      buyer,
      formData,
      policy: rolePlayerPolicy,
      request: buyerBondOriginatorRequest,
      source: 'buyer_onboarding_projection_replay',
    })
  }

  if (projection === 'workflow_evidence') {
    return processWorkflowEvidenceIfPossible(client, {
      transactionId,
      evidenceType: 'onboarding',
      evidenceId: onboarding?.id || null,
      evidenceKey: 'buyer_onboarding_complete',
      status: 'completed',
      source: 'buyer_onboarding_projection_replay',
      createdBy: null,
      payload: {
        purchaserType,
        financeType: financeSnapshot.financeType,
      },
    })
  }

  if (projection === 'awaiting_signed_otp') {
    return markTransactionAwaitingSignedOtp(client, {
      transactionId,
      formData,
      completedAt: completedAt || new Date().toISOString(),
    })
  }

  if (projection === 'finance_event') {
    return logTransactionEventIfPossible(client, {
      transactionId,
      eventType: 'finance_type_selected',
      createdByRole: 'system_repair',
      eventData: {
        source: 'buyer_onboarding_projection_replay',
        financeType: financeSnapshot.financeType,
      },
    })
  }

  return { skipped: true, reason: 'unsupported_projection' }
}

export async function replayBuyerOnboardingProjections({
  transactionId,
  projections = [],
  useRecoveryMarkers = true,
  actorRole = null,
  throwOnFailure = false,
} = {}) {
  const normalizedTransactionId = normalizeNullableUuid(transactionId)
  if (!normalizedTransactionId) throw new Error('Transaction is required.')

  const client = requireClient()
  const actorProfile = await resolveActiveProfileContext(client)
  const normalizedActorRole = normalizeRoleType(actorRole || actorProfile.role || 'agent')
  if (!['agent', 'agency_admin', 'developer', 'internal_admin', 'admin', 'platform_admin'].includes(normalizedActorRole)) {
    throw new Error('Your role does not have permission to repair buyer onboarding projections.')
  }

  const { transaction, unit, buyer } = await resolveTransactionAndContext(client, normalizedTransactionId)
  const onboarding = await getOrCreateTransactionOnboardingRecord(
    client,
    {
      transactionId: normalizedTransactionId,
      purchaserType: transaction.purchaser_type || 'individual',
    },
    { createIfMissing: false },
  )
  if (!onboarding?.id) {
    throw new Error('Transaction onboarding record was not found.')
  }
  if (!isBuyerOnboardingSubmittedForProjectionRepair(transaction, onboarding)) {
    throw new Error('Buyer onboarding must be submitted before projections can be replayed.')
  }

  const formDataRow = await fetchOnboardingFormDataForTransaction(
    client,
    normalizedTransactionId,
    transaction.purchaser_type || onboarding.purchaserType || 'individual',
  )
  const formData = formDataRow?.formData || {}
  const purchaserType = normalizePurchaserType(formData.purchaser_type || transaction.purchaser_type || onboarding.purchaserType)
  const financeSnapshot = getOnboardingFinanceSnapshot({ formData, transaction })
  const completedAt =
    transaction.onboarding_completed_at ||
    transaction.external_onboarding_submitted_at ||
    onboarding.submittedAt ||
    onboarding.updatedAt ||
    new Date().toISOString()

  const developmentId = unit?.development_id || transaction.development_id
  let rolePlayerPolicy = normalizeBuyerBondOriginatorPolicy(DEFAULT_DEVELOPMENT_SETTINGS)
  if (developmentId) {
    try {
      const developmentSettings = await ensureDevelopmentSettings(client, developmentId, {
        createIfMissing: false,
      })
      rolePlayerPolicy = normalizeBuyerBondOriginatorPolicy(developmentSettings)
    } catch (settingsError) {
      if (!isMissingSchemaError(settingsError) && !isPermissionDeniedError(settingsError)) {
        throw settingsError
      }
    }
  }

  const buyerBondOriginatorRequest = getBuyerAppointedBondOriginatorRequest({
    formData,
    transaction,
    buyer,
    policy: rolePlayerPolicy,
    now: completedAt,
  })
  const targets = await resolveBuyerOnboardingProjectionRepairTargets(client, {
    transactionId: normalizedTransactionId,
    projections,
    useRecoveryMarkers,
  })
  const context = {
    transaction,
    unit,
    buyer,
    onboarding,
    formData,
    purchaserType,
    financeSnapshot,
    rolePlayerPolicy,
    buyerBondOriginatorRequest,
    completedAt,
  }
  const results = []

  for (const projection of targets) {
    try {
      const result = await runBuyerOnboardingProjectionRepair(client, projection, context)
      results.push({ projection, status: result?.skipped ? 'skipped' : 'repaired', result: result || null })
    } catch (error) {
      const failure = {
        projection,
        status: 'failed',
        errorCategory: getBuyerOnboardingProjectionErrorCategory(error),
        errorCode: normalizeNullableText(error?.code || error?.status || error?.statusCode),
        message: normalizeTextValue(error?.message || String(error)),
      }
      results.push(failure)
      if (throwOnFailure) throw error
    }
  }

  const failedCount = results.filter((result) => result.status === 'failed').length
  const repairedCount = results.filter((result) => result.status === 'repaired').length
  const skippedCount = results.filter((result) => result.status === 'skipped').length

  await logTransactionEventIfPossible(client, {
    transactionId: normalizedTransactionId,
    eventType: failedCount ? 'buyer_onboarding_projection_replay_failed' : 'buyer_onboarding_projection_replay_completed',
    createdBy: actorProfile.userId || null,
    createdByRole: normalizedActorRole,
    eventData: {
      source: 'buyer_onboarding_projection_replay',
      projections: targets,
      repairedCount,
      skippedCount,
      failedCount,
      results: results.map((result) => ({
        projection: result.projection,
        status: result.status,
        errorCategory: result.errorCategory || null,
        errorCode: result.errorCode || null,
      })),
    },
  }).catch((eventError) => {
    console.warn('Buyer onboarding projection replay summary could not be recorded', eventError)
  })

  return {
    transactionId: normalizedTransactionId,
    projections: targets,
    repairedCount,
    skippedCount,
    failedCount,
    results,
  }
}

export async function getTransactionBuyerOperationalAudit({ transactionId, actorRole = null } = {}) {
  const normalizedTransactionId = normalizeNullableUuid(transactionId)
  if (!normalizedTransactionId) throw new Error('Transaction is required.')

  const client = requireClient()
  const actorProfile = await resolveActiveProfileContext(client)
  const normalizedActorRole = normalizeRoleType(actorRole || actorProfile.role || 'agent')
  if (!['agent', 'agency_admin', 'developer', 'internal_admin', 'admin', 'platform_admin'].includes(normalizedActorRole)) {
    throw new Error('Your role does not have permission to audit buyer onboarding operations.')
  }

  const transactionQuery = await client
    .from('transactions')
    .select('id, buyer_id, onboarding_status, onboarding_completed_at, external_onboarding_submitted_at, purchaser_type, finance_type, stage, current_main_stage')
    .eq('id', normalizedTransactionId)
    .maybeSingle()

  if (transactionQuery.error) throw transactionQuery.error
  if (!transactionQuery.data?.id) throw new Error('Transaction not found.')

  const onboardingQuery = await client
    .from('transaction_onboarding')
    .select('id, transaction_id, status, purchaser_type, submitted_at, is_active, created_at, updated_at')
    .eq('transaction_id', normalizedTransactionId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (
    onboardingQuery.error &&
    !isMissingTableError(onboardingQuery.error, 'transaction_onboarding') &&
    !isMissingColumnError(onboardingQuery.error, 'is_active') &&
    !isMissingSchemaError(onboardingQuery.error) &&
    !isPermissionDeniedError(onboardingQuery.error)
  ) {
    throw onboardingQuery.error
  }

  let participantsQuery = await client
    .from('transaction_participants')
    .select(TRANSACTION_PARTICIPANT_FULL_SELECT)
    .eq('transaction_id', normalizedTransactionId)

  if (participantsQuery.error && isMissingTransactionParticipantExtendedColumn(participantsQuery.error)) {
    participantsQuery = await client
      .from('transaction_participants')
      .select(TRANSACTION_PARTICIPANT_LEGACY_SELECT)
      .eq('transaction_id', normalizedTransactionId)
  }

  if (
    participantsQuery.error &&
    !isMissingTableError(participantsQuery.error, 'transaction_participants') &&
    !isMissingSchemaError(participantsQuery.error) &&
    !isPermissionDeniedError(participantsQuery.error)
  ) {
    throw participantsQuery.error
  }

  return buildTransactionBuyerOperationalAudit({
    transaction: transactionQuery.data,
    onboarding: onboardingQuery.error ? null : onboardingQuery.data || null,
    participants: (participantsQuery.error ? [] : participantsQuery.data || []).map((row) =>
      normalizeTransactionParticipantRow(row),
    ),
  })
}

export async function uploadOnboardingRequiredDocument({ token, documentKey, file }) {
  const client = requireOnboardingTokenClient(token)
  const onboarding = await resolveOnboardingTokenContext(client, token)
  const { transaction, buyer } = await resolveTransactionAndContext(client, onboarding.transactionId)
  const formDataRow = await fetchOnboardingFormDataForTransaction(
    client,
    transaction.id,
    transaction.purchaser_type || onboarding.purchaserType,
  )
  const formData = formDataRow?.formData || {}
  const purchaserType = normalizePurchaserType(
    formData.purchaser_type || transaction.purchaser_type || onboarding.purchaserType,
  )
  const financeSnapshot = getOnboardingFinanceSnapshot({
    formData,
    transaction,
  })
  const financeManagedBy = deriveOnboardingFinanceManagedBy({
    formData,
    transaction,
  })
  const requiredDocuments = await ensureTransactionRequiredDocuments(client, {
    transactionId: transaction.id,
    purchaserType,
    financeType: financeSnapshot.financeType,
    reservationRequired: financeSnapshot.reservationRequired,
    cashAmount: financeSnapshot.cashAmount,
    bondAmount: financeSnapshot.bondAmount,
    formData,
  })

  const requiredDocument = requiredDocuments.find((item) => item.key === documentKey)
  if (!requiredDocument) {
    throw new Error('Document type is not required for this purchaser profile.')
  }

  if (!file) {
    throw new Error('Select a file to upload.')
  }
  const filePolicy = validateDocumentUploadFile(file, { surface: 'buyer_onboarding', transactionId: transaction.id })

  const previousReadiness = await computeTransactionReadinessSnapshot(client, transaction.id)

  const safeName = filePolicy.safeName
  return runRecoverableDocumentUpload({ client: client, scope: ['buyer_onboarding', token, transaction.id, requiredDocument.key], file, storageBuckets: DOCUMENTS_BUCKET_CANDIDATES,
    toSavedReceipt: result => ({ documentId: result.data.id, documentKey: requiredDocument.key, filePath: result.data.file_path, fileBucket: result.data.file_bucket }),
    run: async attempt => {
      const filePath = attempt.path(`onboarding/${transaction.id}/${requiredDocument.key}/${Date.now()}-${safeName}`)
      const uploadedBucket = await attempt.upload(() => uploadToDocumentsBucket(client, filePath, file))

      const baseDocumentPayload = {
        transaction_id: transaction.id,
        name: `${requiredDocument.label} - ${safeName}`,
        file_path: filePath,
        file_bucket: uploadedBucket,
        source: 'buyer_onboarding_upload',
        uploaded_by_party: 'buyer',
        client_recipient_role: 'buyer',
        category: requiredDocument.label,
        document_type:
          normalizePortalDocumentType(
            requiredDocument.portalDocumentType || requiredDocument.key || requiredDocument.label,
          ) || 'other',
        visibility_scope: 'shared',
        uploaded_by_user_id: null,
        stage_key: null,
        is_client_visible: true,
        uploaded_by_role: 'client',
        uploaded_by_email: buyer?.email || null,
      }

      const insertResult = await attempt.persist({
        save: async () => {
          let insertResult = await client
            .from('documents')
            .insert(baseDocumentPayload)
            .select('id, transaction_id, name, file_path, file_bucket, category, is_client_visible, created_at')
            .single()

          if (
            insertResult.error &&
            (isMissingColumnError(insertResult.error, 'document_type') ||
              isMissingColumnError(insertResult.error, 'visibility_scope') ||
              isMissingColumnError(insertResult.error, 'uploaded_by_user_id') ||
              isMissingColumnError(insertResult.error, 'stage_key') ||
              isMissingColumnError(insertResult.error, 'uploaded_by_role') ||
              isMissingColumnError(insertResult.error, 'uploaded_by_email'))
          ) {
            insertResult = await client
              .from('documents')
              .insert({
                transaction_id: transaction.id,
                name: `${requiredDocument.label} - ${safeName}`,
                file_path: filePath,
                category: requiredDocument.label,
                is_client_visible: true,
              })
              .select('id, transaction_id, name, file_path, category, is_client_visible, created_at')
              .single()
          }

          if (insertResult.error && isMissingColumnError(insertResult.error, 'is_client_visible')) {
            insertResult = await client
              .from('documents')
              .insert({
                transaction_id: transaction.id,
                name: `${requiredDocument.label} - ${safeName}`,
                file_path: filePath,
                category: requiredDocument.label,
              })
              .select('id, transaction_id, name, file_path, category, created_at')
              .single()
          }

          if (insertResult.error) {
            await removeDocumentUploadObjectAfterFailedPersistence(client, {
              bucket: uploadedBucket,
              filePath,
              error: insertResult.error,
            })
            throw insertResult.error
          }
          return insertResult
        },
        read: () => readSavedUploadByPath(client, { table: 'documents', column: 'file_path', path: filePath, filters: { transaction_id: transaction.id } }),
      })

      const now = new Date().toISOString()
      let { error: requirementUpdateError } = await client
        .from('transaction_required_documents')
        .update({
          is_uploaded: true,
          uploaded_document_id: insertResult.data.id,
          status: 'uploaded',
          uploaded_at: now,
          updated_at: now,
        })
        .eq('transaction_id', transaction.id)
        .eq('document_key', requiredDocument.key)

      if (
        requirementUpdateError &&
        (isMissingColumnError(requirementUpdateError, 'status') ||
          isMissingColumnError(requirementUpdateError, 'uploaded_at'))
      ) {
        const legacyRequirementUpdate = await client
          .from('transaction_required_documents')
          .update({
            is_uploaded: true,
            uploaded_document_id: insertResult.data.id,
            updated_at: now,
          })
          .eq('transaction_id', transaction.id)
          .eq('document_key', requiredDocument.key)
        requirementUpdateError = legacyRequirementUpdate.error
      }

      if (requirementUpdateError && !isMissingTableError(requirementUpdateError, 'transaction_required_documents')) {
        throw requirementUpdateError
      }

      await logTransactionEventIfPossible(client, {
        transactionId: transaction.id,
        eventType: 'DocumentUploaded',
        createdByRole: 'client',
        eventData: {
          documentId: insertResult.data?.id || null,
          documentName: insertResult.data?.name || `${requiredDocument.label} - ${safeName}`,
          category: requiredDocument.label,
          requiredDocumentKey: requiredDocument.key,
          source: 'onboarding',
          visibilityScope: 'shared',
        },
      })

      const readiness = await runDocumentAutomationIfPossible(client, {
        transactionId: transaction.id,
        documentId: insertResult.data.id,
        documentName: insertResult.data?.name || `${requiredDocument.label} - ${safeName}`,
        documentType: requiredDocument.portalDocumentType || requiredDocument.key || requiredDocument.label,
        category: requiredDocument.label,
        actorRole: 'client',
        actorUserId: null,
        source: 'onboarding_upload',
        requiredDocumentKey: requiredDocument.key,
      })

      if (isBondFinanceType(financeSnapshot.financeType) && financeManagedBy === 'bond_originator') {
        try {
          const bondDocumentsCompleteResult = await checkAndNotifyBondDocumentsComplete({
            transaction: {
              ...transaction,
              finance_type: financeSnapshot.financeType || transaction.finance_type,
              finance_managed_by: financeManagedBy,
              buyer_name: buyer?.name || null,
              buyer_email: buyer?.email || null,
            },
            previousMissingCount: previousReadiness?.missingRequiredDocs,
            readiness,
            actor: { roleType: 'client' },
            metadata: {
              source: 'onboarding_upload',
              documentKey: requiredDocument.key,
              documentId: insertResult.data.id,
              financeManagedBy,
            },
            client,
          })
          const bondProgress = getBondApplicationProgress({
            transaction,
            onboardingFormData: formData,
          })
          await checkAndNotifyBondApplicationReadyForReview({
            transaction: {
              ...transaction,
              finance_type: financeSnapshot.financeType || transaction.finance_type,
              finance_managed_by: financeManagedBy,
              buyer_name: buyer?.name || null,
              buyer_email: buyer?.email || null,
            },
            previousReadyForReview: Boolean(
              previousReadiness?.docsComplete && bondProgress.status === BOND_APPLICATION_PROGRESS_STATUSES.SUBMITTED,
            ),
            currentReadyForReview: Boolean(
              readiness?.docsComplete && bondProgress.status === BOND_APPLICATION_PROGRESS_STATUSES.SUBMITTED,
            ),
            actor: { roleType: 'client' },
            metadata: {
              source: 'onboarding_upload',
              documentKey: requiredDocument.key,
              documentId: insertResult.data.id,
              financeManagedBy,
            },
            client,
          })
          await notifyAttorneysForBondDocumentsComplete(client, {
            transactionId: transaction.id,
            result: bondDocumentsCompleteResult,
            actor: { roleType: 'client' },
            metadata: {
              source: 'onboarding_upload',
              documentKey: requiredDocument.key,
              documentId: insertResult.data.id,
              financeManagedBy,
            },
          })
        } catch (bondNotificationError) {
          console.warn('Bond document completion notification failed', bondNotificationError)
        }
      }

      return {
        documentId: insertResult.data.id,
        documentKey: requiredDocument.key,
        filePath,
      }
    },
  })
}
