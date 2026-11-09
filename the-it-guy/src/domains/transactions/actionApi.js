// transactions owns these operations and their existing recovery behavior.
import { getOrCreateTransactionOnboardingRecord } from '../onboarding/workflow.js'
import { ensureTransactionRequiredDocuments } from '../documents/requirementActions.js'
import { logTransactionEventIfPossible, publishWorkflowChangedIfPossible } from './eventActions.js'
import { resolveActiveProfileContext } from '../access/actorContext.js'
import { ONBOARDING_STATUSES } from './readinessReadApi.js'
import { selectWithoutKnownMissingColumns, registerKnownMissingColumns } from '../../lib/api/shared/schemaReadCompatibility.js'
import { normalizeNullableText, requireClient, isMissingTableError, isMissingColumnError, isMissingSchemaError, normalizeOptionalNumber } from '../../lib/api/shared/readHelpers.js'
import { normalizeStage } from '../../core/transactions/legacyReadModel.js'
import { applyPartyCapacityDecisions } from '../../services/matterScenarioProfile.js'
import { getTransactionPurchaserTypeValue, normalizePurchaserType } from '../../lib/purchaserPersonas'
import { deriveFinanceManagedBy, normalizeFinanceType } from '../../core/transactions/financeType'
import { normalizeStoredTransactionType as normalizeSaleStoredTransactionType } from '../../core/transactions/transactionSaleProfile.js'
import { getRolePermissions, normalizeRoleType } from '../../core/transactions/permissions'
import { TRANSACTION_CANONICAL_PERSISTENCE_MODES, resolveTransactionDocumentRequirements } from '../../services/documents/transactionCanonicalDocumentRequirementService'
import { resolveTransactionRoutingProfile } from '../../services/transactionRoutingProfileService'
import { applyTransferTaxDecisionUpdate, TRANSFER_TAX_ROUTES } from '../../services/transferTaxDecisionService.js'
import { buildMatterWorkflowPlan, diffMatterWorkflowPlans, resolveMatterWorkflowPlan } from '../../services/attorneyWorkflow/matterWorkflowPlanService.js'
import { buildTransactionRoutingBackfillPlan } from '../../services/transactionRoutingGovernanceService'
import { syncAttorneyIncomingInstructionStatus } from '../../services/attorneyIncomingMatterInstructionSync'
import { ATTORNEY_INCOMING_INSTRUCTION_STATUSES } from '../../core/transactions/attorneyIncomingMatterContract'
import { loadWorkflowActionService, ensureTransactionParticipants } from './workspaceHydration.js'
import { isFinanceTypeConstraintError } from '../documents/uploadAutomation.js'
import { processWorkflowEvidenceIfPossible } from '../bond/financeRead.js'
import { findOrCreateBuyer } from './attorneyAllocation.js'
import { fetchTransactionById } from './detailReadApi.js'

async function loadWorkflowOverrideService() {
  return import("../../../server/services/workflowOverrideService.js")
}

function normalizeManualSectionCompletion(value) {
  const defaults = {
    identity: false,
    employment: false,
    purchase_structure: false,
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return defaults
  }

  return {
    identity: Boolean(value.identity),
    employment: Boolean(value.employment),
    purchase_structure: Boolean(value.purchase_structure),
  }
}

export async function updateTransactionMainStage({ transactionId, unitId = null, mainStage, note = '', actorRole }) {
  void transactionId
  void unitId
  void mainStage
  void note
  void actorRole

  throw new Error(
    'Direct stage updates are deprecated. Use GET /api/transactions/:id/rollup plus POST /api/transactions/:id/workflow-actions.',
  )
}

export async function runWorkflowAction({ transactionId, actionKey, payload = {}, actorRole = null } = {}) {
  const client = requireClient()
  const actorProfile = await resolveActiveProfileContext(client)
  const { runWorkflowAction: runCanonicalWorkflowAction } = await loadWorkflowActionService()

  return runCanonicalWorkflowAction({
    transactionId,
    actionKey,
    userId: actorProfile.userId || null,
    actorRole: normalizeRoleType(actorRole || actorProfile.role || 'developer'),
    payload,
    client,
  })
}

export async function applyWorkflowOverride({
  transactionId,
  workflowKey,
  stepKey,
  overrideType,
  reason,
  payload = {},
  actorRole = null,
} = {}) {
  const client = requireClient()
  const actorProfile = await resolveActiveProfileContext(client)
  const { applyWorkflowOverride: applyCanonicalWorkflowOverride } = await loadWorkflowOverrideService()

  return applyCanonicalWorkflowOverride({
    transactionId,
    workflowKey,
    stepKey,
    overrideType,
    reason,
    userId: actorProfile.userId || null,
    actorRole: actorRole || actorProfile.role || 'developer',
    payload,
    client,
  })
}

function getManualOnboardingLifecycleStatus(status) {
  return ['Submitted', 'Reviewed', 'Approved'].includes(status) ? 'awaiting_signed_otp' : 'awaiting_client_onboarding'
}

export async function saveTransactionClientInformation({
  transactionId,
  buyerId,
  buyerName,
  buyerFirstName,
  buyerLastName,
  buyerEmail,
  buyerPhone,
  nextAction,
  identityNumber,
  taxNumber,
  companyName,
  companyRegistrationNumber,
  financeType,
  purchasePrice,
  cashAmount,
  bondAmount,
  depositAmount,
  purchaserType,
  onboardingStatus,
  onboardingMode,
  manualSectionCompletion,
  actorRole,
}) {
  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  const client = requireClient()
  const normalizedActorRole = actorRole ? normalizeRoleType(actorRole) : null
  const actorProfile = await resolveActiveProfileContext(client)
  const effectiveActorRole = normalizedActorRole || actorProfile.role || 'developer'
  const effectiveActorUserId = actorProfile.userId || null

  if (normalizedActorRole) {
    const actorPermissions = getRolePermissions({
      role: normalizedActorRole,
      financeManagedBy: 'bond_originator',
    })

    if (!actorPermissions.canEditCoreTransaction) {
      throw new Error('Your role does not have permission to edit client information.')
    }
  }

  let transactionQuery = await client
    .from('transactions')
    .select(
      'id, organisation_id, buyer_id, purchaser_type, finance_type, sales_price, purchase_price, cash_amount, bond_amount, deposit_amount, reservation_required, stage, current_main_stage, finance_managed_by, assigned_agent, assigned_agent_email, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, onboarding_completed_at, external_onboarding_submitted_at',
    )
    .eq('id', transactionId)
    .maybeSingle()

  if (
    transactionQuery.error &&
    (isMissingColumnError(transactionQuery.error, 'finance_managed_by') ||
      isMissingColumnError(transactionQuery.error, 'assigned_agent') ||
      isMissingColumnError(transactionQuery.error, 'assigned_agent_email') ||
      isMissingColumnError(transactionQuery.error, 'assigned_attorney_email') ||
      isMissingColumnError(transactionQuery.error, 'assigned_bond_originator_email') ||
      isMissingColumnError(transactionQuery.error, 'organisation_id') ||
      isMissingColumnError(transactionQuery.error, 'finance_type') ||
      isMissingColumnError(transactionQuery.error, 'sales_price') ||
      isMissingColumnError(transactionQuery.error, 'purchase_price') ||
      isMissingColumnError(transactionQuery.error, 'cash_amount') ||
      isMissingColumnError(transactionQuery.error, 'bond_amount') ||
      isMissingColumnError(transactionQuery.error, 'deposit_amount') ||
      isMissingColumnError(transactionQuery.error, 'reservation_required') ||
      isMissingColumnError(transactionQuery.error, 'stage') ||
      isMissingColumnError(transactionQuery.error, 'current_main_stage') ||
      isMissingColumnError(transactionQuery.error, 'onboarding_completed_at') ||
      isMissingColumnError(transactionQuery.error, 'external_onboarding_submitted_at'))
  ) {
    transactionQuery = await client
      .from('transactions')
      .select(
        'id, buyer_id, purchaser_type, finance_type, sales_price, purchase_price, cash_amount, bond_amount, deposit_amount, stage, current_main_stage, attorney, bond_originator',
      )
      .eq('id', transactionId)
      .maybeSingle()
  }

  if (transactionQuery.error) {
    throw transactionQuery.error
  }

  if (!transactionQuery.data) {
    throw new Error('Transaction not found.')
  }

  const transaction = transactionQuery.data
  const normalizedPurchaserType = normalizePurchaserType(purchaserType || transaction.purchaser_type || 'individual')
  const normalizedOnboardingStatus = ONBOARDING_STATUSES.includes(onboardingStatus) ? onboardingStatus : 'Not Started'
  const normalizedOnboardingMode =
    String(onboardingMode || '')
      .trim()
      .toLowerCase() === 'manual'
      ? 'manual'
      : 'client_portal'
  const normalizedManualSectionCompletion = normalizeManualSectionCompletion(manualSectionCompletion)
  const lifecycleStatus = getManualOnboardingLifecycleStatus(normalizedOnboardingStatus)
  const now = new Date().toISOString()

  let buyer = null
  let effectiveBuyerId = buyerId || transaction.buyer_id || null

  if (effectiveBuyerId) {
    const buyerQuery = await client
      .from('buyers')
      .select('id, name, email, phone')
      .eq('id', effectiveBuyerId)
      .maybeSingle()
    if (buyerQuery.error) {
      throw buyerQuery.error
    }
    buyer = buyerQuery.data || null
  }

  const normalizedBuyerFirstName = normalizeNullableText(buyerFirstName)
  const normalizedBuyerLastName = normalizeNullableText(buyerLastName)
  const derivedBuyerNameFromParts = [normalizedBuyerFirstName, normalizedBuyerLastName].filter(Boolean).join(' ')
  const normalizedBuyerName = normalizeNullableText(buyerName || derivedBuyerNameFromParts)
  const normalizedBuyerEmail = normalizeNullableText(buyerEmail)?.toLowerCase() || null
  const normalizedBuyerPhone = normalizeNullableText(buyerPhone)
  const normalizedNextAction = normalizeNullableText(nextAction)
  const normalizedIdentityNumber = normalizeNullableText(identityNumber)
  const normalizedTaxNumber = normalizeNullableText(taxNumber)
  const normalizedCompanyName = normalizeNullableText(companyName)
  const normalizedCompanyRegistrationNumber = normalizeNullableText(companyRegistrationNumber)
  const hasFinanceType = financeType !== undefined
  const hasPurchasePrice = purchasePrice !== undefined
  const hasCashAmount = cashAmount !== undefined
  const hasBondAmount = bondAmount !== undefined
  const hasDepositAmount = depositAmount !== undefined
  const normalizedFinanceType = normalizeFinanceType(financeType || transaction.finance_type || 'cash')
  const normalizedPurchasePrice = hasPurchasePrice
    ? normalizeOptionalNumber(purchasePrice)
    : normalizeOptionalNumber(transaction.purchase_price ?? transaction.sales_price)
  const normalizedCashAmount = hasCashAmount
    ? normalizeOptionalNumber(cashAmount)
    : normalizeOptionalNumber(transaction.cash_amount)
  const normalizedBondAmount = hasBondAmount
    ? normalizeOptionalNumber(bondAmount)
    : normalizeOptionalNumber(transaction.bond_amount)
  const normalizedDepositAmount = hasDepositAmount
    ? normalizeOptionalNumber(depositAmount)
    : normalizeOptionalNumber(transaction.deposit_amount)
  const normalizedFinanceManagedBy = deriveFinanceManagedBy({
    financeType: normalizedFinanceType,
    financeManagedBy: transaction.finance_managed_by,
  })

  if (!effectiveBuyerId && (normalizedBuyerName || normalizedBuyerEmail || normalizedBuyerPhone)) {
    const nextBuyer = await findOrCreateBuyer(client, {
      name: normalizedBuyerName || normalizedBuyerEmail || 'Client / Buyer',
      email: normalizedBuyerEmail,
      phone: normalizedBuyerPhone,
      organisationId: transaction.organisation_id,
    })
    effectiveBuyerId = nextBuyer.id
    buyer = nextBuyer
  } else if (effectiveBuyerId) {
    const buyerUpdatePayload = {
      name: normalizedBuyerName || buyer?.name || 'Client / Buyer',
      email: normalizedBuyerEmail,
      phone: normalizedBuyerPhone,
    }

    const buyerUpdate = await client
      .from('buyers')
      .update(buyerUpdatePayload)
      .eq('id', effectiveBuyerId)
      .select('id, name, email, phone')
      .single()

    if (buyerUpdate.error) {
      throw buyerUpdate.error
    }

    buyer = buyerUpdate.data
  }

  const onboardingRecord = await getOrCreateTransactionOnboardingRecord(client, {
    transactionId,
    purchaserType: normalizedPurchaserType,
  })

  if (onboardingRecord?.id) {
    const submittedAt =
      normalizedOnboardingStatus === 'Not Started' || normalizedOnboardingStatus === 'In Progress'
        ? null
        : onboardingRecord.submittedAt || now

    const onboardingUpdate = await client
      .from('transaction_onboarding')
      .update({
        status: normalizedOnboardingStatus,
        purchaser_type: normalizedPurchaserType,
        submitted_at: submittedAt,
        updated_at: now,
      })
      .eq('id', onboardingRecord.id)

    if (onboardingUpdate.error) {
      throw onboardingUpdate.error
    }
  }

  const transactionPayload = {
    buyer_id: effectiveBuyerId,
    purchaser_type: normalizedPurchaserType,
    next_action: normalizedNextAction,
    comment: normalizedNextAction,
    is_active: true,
    onboarding_status: lifecycleStatus,
    onboarding_completed_at:
      lifecycleStatus === 'awaiting_signed_otp' ? transaction.onboarding_completed_at || now : null,
    external_onboarding_submitted_at:
      lifecycleStatus === 'awaiting_signed_otp' ? transaction.external_onboarding_submitted_at || now : null,
    finance_managed_by: normalizedFinanceManagedBy,
    updated_at: now,
  }

  const hasTransactionStage =
    Object.prototype.hasOwnProperty.call(transaction, 'stage') && transaction.stage !== undefined
  const currentTransactionStage = hasTransactionStage ? normalizeStage(transaction.stage, 'Available') : null
  // Self-heal historical corruption where finance edits previously reset stage to Available.
  if (currentTransactionStage === 'Available') {
    transactionPayload.stage = 'Reserved'
    transactionPayload.current_main_stage = 'DEP'
  }

  if (hasFinanceType) {
    transactionPayload.finance_type = normalizedFinanceType
  }

  if (hasPurchasePrice) {
    transactionPayload.sales_price = normalizedPurchasePrice
    transactionPayload.purchase_price = normalizedPurchasePrice
  }

  if (hasCashAmount) {
    transactionPayload.cash_amount = normalizedCashAmount
  }

  if (hasBondAmount) {
    transactionPayload.bond_amount = normalizedBondAmount
  }

  if (hasDepositAmount) {
    transactionPayload.deposit_amount = normalizedDepositAmount
  }

  let transactionUpdate = await client.from('transactions').update(transactionPayload).eq('id', transactionId)

  if (transactionUpdate.error) {
    const fallbackColumns = [
      'purchaser_type',
      'finance_type',
      'sales_price',
      'purchase_price',
      'cash_amount',
      'bond_amount',
      'deposit_amount',
      'stage',
      'current_main_stage',
      'next_action',
      'comment',
      'is_active',
      'onboarding_status',
      'onboarding_completed_at',
      'external_onboarding_submitted_at',
      'finance_managed_by',
    ]
    let fallbackPayload = { ...transactionPayload }
    let fallbackError = transactionUpdate.error
    let fallbackAttempts = 0

    while (fallbackError && fallbackAttempts < fallbackColumns.length) {
      const missingColumns = fallbackColumns.filter((column) => isMissingColumnError(fallbackError, column))
      if (!missingColumns.length) {
        break
      }

      const beforeKeys = Object.keys(fallbackPayload).length
      missingColumns.forEach((column) => {
        delete fallbackPayload[column]
      })
      const afterKeys = Object.keys(fallbackPayload).length
      if (afterKeys === beforeKeys) {
        break
      }

      const fallbackResult = await client.from('transactions').update(fallbackPayload).eq('id', transactionId)
      transactionUpdate = fallbackResult
      fallbackError = fallbackResult.error
      fallbackAttempts += 1

      if (!fallbackError) {
        break
      }
    }
  }

  if (
    transactionUpdate.error &&
    isFinanceTypeConstraintError(transactionUpdate.error) &&
    transactionPayload.finance_type === 'combination'
  ) {
    const legacyPayload = {
      ...transactionPayload,
      finance_type: 'hybrid',
    }
    transactionUpdate = await client.from('transactions').update(legacyPayload).eq('id', transactionId)
  }

  if (transactionUpdate.error) {
    throw transactionUpdate.error
  }

  if (lifecycleStatus === 'awaiting_signed_otp') {
    await syncAttorneyIncomingInstructionStatus(client, {
      transactionId,
      status: ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingSignedOtp,
      occurredAt: transactionPayload.external_onboarding_submitted_at || now,
      source: 'save_transaction_client_information',
    })
  }

  let latestOnboardingFormData = {}

  try {
    const onboardingFormDataQuery = await client
      .from('onboarding_form_data')
      .select('id, form_data, purchaser_type')
      .eq('transaction_id', transactionId)
      .maybeSingle()

    if (onboardingFormDataQuery.error) {
      if (!isMissingTableError(onboardingFormDataQuery.error, 'onboarding_form_data')) {
        throw onboardingFormDataQuery.error
      }
    } else {
      const existingFormData =
        onboardingFormDataQuery.data?.form_data && typeof onboardingFormDataQuery.data.form_data === 'object'
          ? { ...onboardingFormDataQuery.data.form_data }
          : {}

      const applyFormDataValue = (key, value) => {
        if (value === null || value === undefined || value === '') {
          delete existingFormData[key]
          return
        }
        existingFormData[key] = String(value)
      }

      applyFormDataValue('first_name', normalizedBuyerFirstName)
      applyFormDataValue('last_name', normalizedBuyerLastName)
      applyFormDataValue('full_name', normalizedBuyerName || buyer?.name || '')
      applyFormDataValue('email', normalizedBuyerEmail)
      applyFormDataValue('phone', normalizedBuyerPhone)
      applyFormDataValue('identity_number', normalizedIdentityNumber)
      applyFormDataValue('tax_number', normalizedTaxNumber)
      applyFormDataValue('company_name', normalizedCompanyName)
      applyFormDataValue('company_registration_number', normalizedCompanyRegistrationNumber)
      applyFormDataValue('purchase_finance_type', normalizedFinanceType)
      applyFormDataValue('purchase_price', normalizedPurchasePrice)
      applyFormDataValue('cash_amount', normalizedCashAmount)
      applyFormDataValue('bond_amount', normalizedBondAmount)
      applyFormDataValue('deposit_amount', normalizedDepositAmount)
      existingFormData.__bridge_onboarding_mode = normalizedOnboardingMode
      existingFormData.__bridge_manual_section_completion = normalizedManualSectionCompletion
      latestOnboardingFormData = { ...existingFormData }

      const onboardingFormDataUpsert = await client.from('onboarding_form_data').upsert(
        {
          transaction_id: transactionId,
          purchaser_type: normalizedPurchaserType,
          form_data: existingFormData,
          updated_at: now,
        },
        { onConflict: 'transaction_id' },
      )

      if (
        onboardingFormDataUpsert.error &&
        !isMissingTableError(onboardingFormDataUpsert.error, 'onboarding_form_data')
      ) {
        throw onboardingFormDataUpsert.error
      }
    }
  } catch (error) {
    if (!isMissingSchemaError(error)) {
      throw error
    }
  }

  try {
    await ensureTransactionRequiredDocuments(client, {
      transactionId,
      purchaserType: normalizedPurchaserType,
      financeType: normalizedFinanceType,
      reservationRequired: Boolean(transaction.reservation_required),
      cashAmount: normalizedCashAmount,
      bondAmount: normalizedBondAmount,
      formData: latestOnboardingFormData,
    })
  } catch (error) {
    if (!isMissingSchemaError(error)) {
      throw error
    }
  }

  try {
    await ensureTransactionParticipants(client, {
      transaction: {
        ...transaction,
        id: transactionId,
        buyer_id: effectiveBuyerId,
        purchaser_type: normalizedPurchaserType,
        finance_type: normalizedFinanceType,
        finance_managed_by: normalizedFinanceManagedBy,
      },
      buyer,
    })
  } catch (error) {
    if (!isMissingSchemaError(error)) {
      throw error
    }
  }

  await logTransactionEventIfPossible(client, {
    transactionId,
    eventType: 'TransactionUpdated',
    createdBy: effectiveActorUserId,
    createdByRole: effectiveActorRole,
    eventData: {
      source: 'save_transaction_client_information',
      onboardingStatus: normalizedOnboardingStatus,
      onboardingLifecycleStatus: lifecycleStatus,
      purchaserType: normalizedPurchaserType,
      onboardingMode: normalizedOnboardingMode,
      manualSectionCompletion: normalizedManualSectionCompletion,
      buyerId: effectiveBuyerId,
      buyerEmail: normalizedBuyerEmail,
      nextAction: normalizedNextAction,
      financeType: normalizedFinanceType,
      financeManagedBy: normalizedFinanceManagedBy,
      purchasePrice: normalizedPurchasePrice,
      cashAmount: normalizedCashAmount,
      bondAmount: normalizedBondAmount,
      depositAmount: normalizedDepositAmount,
    },
  })

  if (lifecycleStatus === 'awaiting_signed_otp') {
    await processWorkflowEvidenceIfPossible(client, {
      transactionId,
      evidenceType: 'onboarding',
      evidenceId: onboardingRecord?.id || transactionId,
      evidenceKey: 'buyer_onboarding_complete',
      status: 'completed',
      source: 'save_transaction_client_information',
      createdBy: effectiveActorUserId,
      payload: {
        onboardingMode: normalizedOnboardingMode,
        purchaserType: normalizedPurchaserType,
        financeManagedBy: normalizedFinanceManagedBy,
      },
    })
  }

  return {
    buyer,
    onboardingStatus: normalizedOnboardingStatus,
    onboardingLifecycleStatus: lifecycleStatus,
    purchaserType: normalizedPurchaserType,
    financeManagedBy: normalizedFinanceManagedBy,
  }
}

function normalizeRoutingKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

function normalizeRoutingBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value
  if (value === null || value === undefined || value === '') return Boolean(fallback)
  const normalized = normalizeRoutingKey(value)
  if (['1', 'true', 'yes', 'y', 'required', 'applies', 'existing_bond'].includes(normalized)) return true
  if (['0', 'false', 'no', 'n', 'not_required', 'none'].includes(normalized)) return false
  return Boolean(fallback)
}

function normalizeRoutingFinanceType(value, fallback = 'unknown') {
  const normalized = normalizeFinanceType(value || '', { allowUnknown: true })
  if (normalized === 'combination') return 'hybrid'
  if (normalized === 'unknown') return fallback
  return normalized || fallback
}

function nullableUnknown(value) {
  const normalized = normalizeRoutingKey(value)
  return normalized && normalized !== 'unknown' ? normalized : null
}

function buildTransactionRoutingCorrectionPayload(transaction = {}, input = {}) {
  const priorPurchaserType = normalizePurchaserType(transaction.purchaser_type)
  const purchaserTypeInput = input.purchaserType ?? input.purchaser_type ?? transaction.purchaser_type
  const requestedPurchaserType = normalizeRoutingKey(purchaserTypeInput) === 'unknown'
    ? priorPurchaserType : normalizePurchaserType(purchaserTypeInput)
  // The routing editor selects a broad legal entity. Choosing Individual must
  // not erase the existing natural-person marriage/residency branch.
  const purchaserType = requestedPurchaserType === 'individual' && !['company', 'trust'].includes(priorPurchaserType)
    ? priorPurchaserType : requestedPurchaserType
  const financeType = normalizeRoutingFinanceType(
    input.financeType ?? input.finance_type ?? transaction.finance_type,
    'unknown',
  )
  const sellerHasExistingBond = normalizeRoutingBoolean(
    input.sellerHasExistingBond ?? input.seller_has_existing_bond ?? input.existingBond ?? input.existing_bond,
    transaction.seller_has_existing_bond ?? transaction.existing_bond ?? false,
  )
  const cancellationRequired =
    normalizeRoutingBoolean(
      input.cancellationRequired ?? input.cancellation_required,
      transaction.cancellation_required ?? sellerHasExistingBond,
    ) || sellerHasExistingBond
  const existingRoutingProfile = transaction.routing_profile_json && typeof transaction.routing_profile_json === 'object'
    ? transaction.routing_profile_json
    : {}
  const transferTaxDecision = input.transferTaxDecision
    ? applyTransferTaxDecisionUpdate(
      existingRoutingProfile.transferTaxDecision || existingRoutingProfile.transfer_tax_decision,
      input.transferTaxDecision,
      input.transferTaxActor,
    )
    : existingRoutingProfile.transferTaxDecision || existingRoutingProfile.transfer_tax_decision
  const decisionVatTreatment = transferTaxDecision?.status === 'confirmed'
    && TRANSFER_TAX_ROUTES.includes(transferTaxDecision.route)
    && transferTaxDecision.route !== 'needs_tax_advice'
    ? transferTaxDecision.route
    : null
  const nextTransaction = {
    ...transaction,
    routing_profile_json: {
      ...existingRoutingProfile,
      mvpProfile: input.mvpProfile || existingRoutingProfile.mvpProfile || {},
      scenarioProfile: input.scenarioProfile || existingRoutingProfile.scenarioProfile,
      ...(transferTaxDecision ? { transferTaxDecision } : {}),
    },
    finance_type: financeType === 'unknown' ? transaction.finance_type || null : financeType,
    transaction_type: nullableUnknown(input.transactionType ?? input.transaction_type ?? transaction.transaction_type),
    property_type: normalizeNullableText(input.propertyType ?? input.property_type ?? transaction.property_type),
    property_tenure: nullableUnknown(input.propertyTenure ?? input.property_tenure ?? transaction.property_tenure),
    purchaser_type: purchaserType,
    buyer_entity_type: purchaserType,
    seller_type: nullableUnknown(input.sellerType ?? input.seller_type ?? transaction.seller_type),
    seller_entity_type: nullableUnknown(input.sellerType ?? input.seller_type ?? transaction.seller_type),
    seller_has_existing_bond: sellerHasExistingBond,
    existing_bond: sellerHasExistingBond,
    cancellation_required: cancellationRequired,
    vat_treatment: nullableUnknown(decisionVatTreatment ?? input.vatTreatment ?? input.vat_treatment ?? transaction.vat_treatment),
  }
  const priorMatterProfile = resolveTransactionRoutingProfile({ transaction }).matterProfile || {}
  const proposedRoutingProfile = resolveTransactionRoutingProfile({ transaction: nextTransaction })
  const matterProfileInput = input.matterProfile?.status === 'confirmed' &&
    priorMatterProfile.status === 'confirmed' &&
    priorMatterProfile.factFingerprint === proposedRoutingProfile.matterProfile?.factFingerprint
    ? {
        status: 'confirmed',
        confirmedAt: priorMatterProfile.confirmedAt,
        confirmedByRole: priorMatterProfile.confirmedByRole,
        revision: priorMatterProfile.revision,
      }
    : input.matterProfile
  const routingProfile = resolveTransactionRoutingProfile({
    transaction: nextTransaction,
    matterProfile: matterProfileInput,
  })
  const workflowPlan = buildMatterWorkflowPlan({
    routingProfile,
    generatedAt: routingProfile.matterProfile?.confirmedAt || null,
  })
  const workflowPlanImpact = diffMatterWorkflowPlans(
    resolveMatterWorkflowPlan(transaction.routing_profile_json || {}),
    workflowPlan,
  )
  const persistedRoutingProfile = { ...routingProfile, workflowPlan }
  const resolvedFinanceType = routingProfile.financeType === 'hybrid' ? 'hybrid' : financeType
  const resolvedTransactionType =
    routingProfile.transactionType && routingProfile.transactionType !== 'unknown'
      ? normalizeSaleStoredTransactionType(routingProfile.transactionType, '')
      : nextTransaction.transaction_type
  return {
    payload: {
      finance_type: resolvedFinanceType && resolvedFinanceType !== 'unknown' ? resolvedFinanceType : null,
      transaction_type: resolvedTransactionType || null,
      property_type: nextTransaction.property_type || null,
      property_tenure:
        routingProfile.propertyTenure && routingProfile.propertyTenure !== 'unknown'
          ? routingProfile.propertyTenure
          : nextTransaction.property_tenure || null,
      purchaser_type: getTransactionPurchaserTypeValue(nextTransaction.purchaser_type),
      seller_type:
        routingProfile.sellerEntityType && routingProfile.sellerEntityType !== 'unknown'
          ? routingProfile.sellerEntityType
          : nextTransaction.seller_type || null,
      seller_has_existing_bond: input.mvpProfile?.sellerExistingBond === 'unknown' ? null : Boolean(routingProfile.sellerHasExistingBond),
      existing_bond: input.mvpProfile?.sellerExistingBond === 'unknown' ? null : Boolean(routingProfile.sellerHasExistingBond),
      cancellation_required: Boolean(routingProfile.cancellationRequired),
      vat_treatment:
        routingProfile.vatTreatment && routingProfile.vatTreatment !== 'unknown' ? routingProfile.vatTreatment : null,
      routing_profile_version: routingProfile.version || null,
      routing_profile_json: persistedRoutingProfile,
      updated_at: new Date().toISOString(),
    },
    routingProfile: persistedRoutingProfile,
    workflowPlanImpact,
  }
}

export async function saveTransactionRoutingProfile({
  transactionId,
  financeType,
  transactionType,
  propertyType,
  propertyTenure,
  purchaserType,
  sellerType,
  sellerHasExistingBond,
  cancellationRequired,
  vatTreatment,
  transferTaxDecision,
  mvpProfile,
  scenarioProfile,
  reason = '',
  actorRole = null,
} = {}) {
  if (!transactionId) throw new Error('Transaction is required.')
  if ((mvpProfile?.bondWorkflow === 'exclude' || mvpProfile?.cancellationWorkflow === 'exclude') && !String(reason || '').trim()) {
    throw new Error('Record a reason when excluding an attorney checklist.')
  }

  const client = requireClient()
  const actorProfile = await resolveActiveProfileContext(client)
  const normalizedActorRole = normalizeRoleType(actorRole || actorProfile.role || 'attorney')
  if (!['attorney', 'developer', 'internal_admin', 'admin', 'agent', 'bond_originator'].includes(normalizedActorRole)) {
    throw new Error('Your role does not have permission to update routing facts.')
  }
  if (transferTaxDecision && !['attorney', 'internal_admin', 'admin'].includes(normalizedActorRole)) {
    throw new Error('Only an attorney may confirm the transfer-tax route.')
  }

  let transactionQuery = await client
    .from('transactions')
    .select(
      selectWithoutKnownMissingColumns(
        'id, finance_type, transaction_type, property_type, property_tenure, purchaser_type, seller_type, seller_has_existing_bond, existing_bond, cancellation_required, vat_treatment, routing_profile_version, routing_profile_json, updated_at',
      ),
    )
    .eq('id', transactionId)
    .maybeSingle()

  if (transactionQuery.error && isMissingColumnError(transactionQuery.error)) {
    registerKnownMissingColumns(transactionQuery.error, [
      'transaction_type',
      'property_type',
      'property_tenure',
      'purchaser_type',
      'seller_type',
      'seller_has_existing_bond',
      'existing_bond',
      'cancellation_required',
      'vat_treatment',
      'routing_profile_version',
      'routing_profile_json',
    ])
    transactionQuery = await client
      .from('transactions')
      .select(
        selectWithoutKnownMissingColumns(
          'id, finance_type, transaction_type, property_type, purchaser_type, updated_at',
        ),
      )
      .eq('id', transactionId)
      .maybeSingle()
  }

  if (transactionQuery.error) throw transactionQuery.error
  const transaction = transactionQuery.data
  if (!transaction) throw new Error('Transaction not found.')

  const reviewedScenarioProfile = scenarioProfile
      ? applyPartyCapacityDecisions(transaction.routing_profile_json?.scenarioProfile, scenarioProfile, {
        canReview: normalizedActorRole === 'attorney',
        userId: actorProfile.userId || '',
        now: new Date().toISOString(),
        propertyTenure: propertyTenure || transaction.routing_profile_json?.propertyTenure || transaction.property_tenure,
        propertyConditions: mvpProfile?.propertyConditions || transaction.routing_profile_json?.mvpProfile?.propertyConditions || {},
      })
    : undefined

  const { payload, routingProfile, workflowPlanImpact } = buildTransactionRoutingCorrectionPayload(transaction, {
    financeType,
    transactionType,
    propertyType,
    propertyTenure,
    purchaserType,
    sellerType,
    sellerHasExistingBond,
    cancellationRequired,
    vatTreatment,
    transferTaxDecision,
    transferTaxActor: { userId: actorProfile.userId || null, role: normalizedActorRole },
    mvpProfile,
    scenarioProfile: reviewedScenarioProfile,
    matterProfile: {
      status: 'confirmed',
      confirmedAt: new Date().toISOString(),
      confirmedByRole: normalizedActorRole,
      revision: Math.max(0, Number(resolveTransactionRoutingProfile({ transaction }).matterProfile?.revision) || 0) + 1,
    },
  })

  const fallbackColumns = [
    'transaction_type',
    'property_type',
    'property_tenure',
    'purchaser_type',
    'seller_type',
    'seller_has_existing_bond',
    'existing_bond',
    'cancellation_required',
    'vat_treatment',
    'routing_profile_version',
    'routing_profile_json',
  ]
  let updatePayload = { ...payload }
  let updateResult = await client.from('transactions').update(updatePayload).eq('id', transactionId)

  if (
    updateResult.error &&
    isFinanceTypeConstraintError(updateResult.error) &&
    updatePayload.finance_type === 'hybrid'
  ) {
    updatePayload = { ...updatePayload, finance_type: 'combination' }
    updateResult = await client.from('transactions').update(updatePayload).eq('id', transactionId)
  }

  if (updateResult.error) {
    let fallbackError = updateResult.error
    let fallbackAttempts = 0
    while (fallbackError && fallbackAttempts < fallbackColumns.length) {
      const missingColumns = fallbackColumns.filter((column) => isMissingColumnError(fallbackError, column))
      if (!missingColumns.length) break
      const beforeKeys = Object.keys(updatePayload).length
      missingColumns.forEach((column) => {
        delete updatePayload[column]
      })
      if (Object.keys(updatePayload).length === beforeKeys) break
      const fallbackResult = await client.from('transactions').update(updatePayload).eq('id', transactionId)
      updateResult = fallbackResult
      fallbackError = fallbackResult.error
      fallbackAttempts += 1
      if (!fallbackError) break
    }
  }

  if (updateResult.error) throw updateResult.error

  // A changed legal route can introduce an entire document pack. Persist that
  // pack before returning a successful routing save; existing evidence and its
  // approvals are retained by the protected reconciliation RPC.
  try {
    await resolveTransactionDocumentRequirements({
      transactionId, client, writeLegacyProjection: false,
      persistenceMode: TRANSACTION_CANONICAL_PERSISTENCE_MODES.creationRpc,
    })
  } catch (cause) {
    const error = new Error('Routing facts were saved, but document requirements could not be refreshed. Retry the routing save before proceeding.')
    error.code = 'ROUTING_DOCUMENT_RECONCILIATION_REQUIRED'
    error.cause = cause
    throw error
  }

  try {
    await logTransactionEventIfPossible(client, {
      transactionId,
      eventType: 'RoutingProfileUpdated',
      eventData: {
        reason: normalizeNullableText(reason),
        routingProfileVersion: routingProfile.version,
        workflowTemplateKey: routingProfile.workflowTemplateKey,
        requiredWorkflowKeys: routingProfile.requiredWorkflowKeys,
        missingFields: routingProfile.missingFields,
        matterProfileStatus: routingProfile.matterProfile?.status || null,
        matterProfileRevision: routingProfile.matterProfile?.revision || 0,
        matterProfileFingerprint: routingProfile.matterProfile?.factFingerprint || null,
        transferTaxDecision: transferTaxDecision
          ? {
              route: routingProfile.transferTaxDecision?.route || null,
              status: routingProfile.transferTaxDecision?.status || null,
              confirmedAt: routingProfile.transferTaxDecision?.confirmedAt || null,
            }
          : null,
        workflowPlanImpact,
      },
      createdBy: actorProfile.userId || null,
      createdByRole: normalizedActorRole,
    })
  } catch (eventError) {
    console.warn('[transaction-routing] unable to record routing update event', eventError)
  }

  await publishWorkflowChangedIfPossible(client, {
    transactionId,
    triggerType: 'routing_profile',
    triggerId: transactionId,
    reasonCode: 'routing_profile_updated',
    userId: actorProfile.userId || null,
    source: 'transaction_routing_profile',
    payload: {
      routingProfileVersion: routingProfile.version,
      requiredWorkflowKeys: routingProfile.requiredWorkflowKeys,
      missingFields: routingProfile.missingFields,
      matterProfileStatus: routingProfile.matterProfile?.status || null,
      matterProfileFingerprint: routingProfile.matterProfile?.factFingerprint || null,
      workflowPlanImpact,
    },
  })

  return fetchTransactionById(transactionId)
}

async function updateTransactionRoutingBackfillPayload(client, transactionId, payload = {}) {
  const fallbackColumns = [
    'transaction_type',
    'property_tenure',
    'purchaser_type',
    'seller_type',
    'seller_has_existing_bond',
    'existing_bond',
    'cancellation_required',
    'vat_treatment',
    'routing_profile_version',
    'routing_profile_json',
    'updated_at',
  ]
  let updatePayload = { ...payload, updated_at: new Date().toISOString() }
  let updateResult = await client.from('transactions').update(updatePayload).eq('id', transactionId)

  if (
    updateResult.error &&
    isFinanceTypeConstraintError(updateResult.error) &&
    updatePayload.finance_type === 'hybrid'
  ) {
    updatePayload = { ...updatePayload, finance_type: 'combination' }
    updateResult = await client.from('transactions').update(updatePayload).eq('id', transactionId)
  }

  if (updateResult.error) {
    let fallbackError = updateResult.error
    let fallbackAttempts = 0
    while (fallbackError && fallbackAttempts < fallbackColumns.length) {
      const missingColumns = fallbackColumns.filter((column) => isMissingColumnError(fallbackError, column))
      if (!missingColumns.length) break
      const beforeKeys = Object.keys(updatePayload).length
      missingColumns.forEach((column) => {
        delete updatePayload[column]
      })
      if (Object.keys(updatePayload).length === beforeKeys) break
      const fallbackResult = await client.from('transactions').update(updatePayload).eq('id', transactionId)
      updateResult = fallbackResult
      fallbackError = fallbackResult.error
      fallbackAttempts += 1
      if (!fallbackError) break
    }
  }

  if (updateResult.error) throw updateResult.error
  return updatePayload
}

export async function runTransactionRoutingProfileBackfill({
  organisationId = '',
  transactionIds = [],
  limit = 200,
  dryRun = true,
  includeNeedsFacts = false,
  actorRole = null,
} = {}) {
  const client = requireClient()
  const actorProfile = await resolveActiveProfileContext(client)
  const normalizedActorRole = normalizeRoleType(actorRole || actorProfile.role || 'developer')
  if (!['developer', 'internal_admin', 'admin', 'agency_admin'].includes(normalizedActorRole)) {
    throw new Error('You do not have permission to run transaction routing backfills.')
  }

  const boundedLimit = Math.max(1, Math.min(Number(limit) || 200, 1000))
  const normalizedTransactionIds = (Array.isArray(transactionIds) ? transactionIds : [])
    .map((id) => normalizeNullableText(id))
    .filter(Boolean)

  let query = client
    .from('transactions')
    .select(
      selectWithoutKnownMissingColumns(
        'id, organisation_id, finance_type, transaction_type, property_type, property_tenure, purchaser_type, seller_type, seller_has_existing_bond, existing_bond, cancellation_required, vat_treatment, development_id, unit_id, routing_profile_version, routing_profile_json, is_active, updated_at, created_at',
      ),
    )
    .order('updated_at', { ascending: false })
    .limit(boundedLimit)

  if (normalizeNullableText(organisationId)) query = query.eq('organisation_id', normalizeNullableText(organisationId))
  if (normalizedTransactionIds.length) query = query.in('id', normalizedTransactionIds)

  let rowsQuery = await query

  if (rowsQuery.error && isMissingColumnError(rowsQuery.error)) {
    registerKnownMissingColumns(rowsQuery.error, [
      'organisation_id',
      'transaction_type',
      'property_type',
      'property_tenure',
      'purchaser_type',
      'seller_type',
      'seller_has_existing_bond',
      'existing_bond',
      'cancellation_required',
      'vat_treatment',
      'development_id',
      'unit_id',
      'routing_profile_version',
      'routing_profile_json',
      'is_active',
      'updated_at',
      'created_at',
    ])

    let fallbackQuery = client
      .from('transactions')
      .select(
        selectWithoutKnownMissingColumns(
          'id, organisation_id, finance_type, transaction_type, property_type, development_id, unit_id, updated_at, created_at',
        ),
      )
      .order('updated_at', { ascending: false })
      .limit(boundedLimit)

    if (normalizeNullableText(organisationId))
      fallbackQuery = fallbackQuery.eq('organisation_id', normalizeNullableText(organisationId))
    if (normalizedTransactionIds.length) fallbackQuery = fallbackQuery.in('id', normalizedTransactionIds)
    rowsQuery = await fallbackQuery
  }

  if (rowsQuery.error) throw rowsQuery.error

  const rows = Array.isArray(rowsQuery.data) ? rowsQuery.data : []
  const plan = buildTransactionRoutingBackfillPlan(rows, {
    dryRun,
    includeNeedsFacts,
  })

  if (dryRun) {
    return {
      ...plan,
      applied: [],
      skipped: plan.operations.map((operation) => ({
        transactionId: operation.transactionId,
        reason: 'dry_run',
      })),
    }
  }

  const applied = []
  const skipped = []
  for (const operation of plan.operations) {
    if (!operation.transactionId) {
      skipped.push({ transactionId: null, reason: 'missing_transaction_id' })
      continue
    }

    try {
      const appliedPayload = await updateTransactionRoutingBackfillPayload(
        client,
        operation.transactionId,
        operation.updatePayload,
      )
      applied.push({
        transactionId: operation.transactionId,
        reasonCodes: operation.reasonCodes,
        persistedColumns: Object.keys(appliedPayload),
      })
      await logTransactionEventIfPossible(client, {
        transactionId: operation.transactionId,
        eventType: 'RoutingProfileBackfilled',
        eventData: {
          reasonCodes: operation.reasonCodes,
          missingFields: operation.missingFields,
          source: 'phase6_routing_backfill',
        },
        createdBy: actorProfile.userId || null,
        createdByRole: normalizedActorRole,
      }).catch((eventError) => {
        console.warn('[transaction-routing] unable to record routing backfill event', eventError)
      })
      await publishWorkflowChangedIfPossible(client, {
        transactionId: operation.transactionId,
        triggerType: 'routing_profile',
        triggerId: operation.transactionId,
        reasonCode: 'routing_profile_backfilled',
        userId: actorProfile.userId || null,
        source: 'transaction_routing_profile_backfill',
        payload: {
          reasonCodes: operation.reasonCodes,
          missingFields: operation.missingFields,
        },
      })
    } catch (error) {
      skipped.push({
        transactionId: operation.transactionId,
        reason: error?.message || String(error),
      })
    }
  }

  return {
    ...plan,
    dryRun: false,
    applied,
    skipped,
    summary: {
      ...plan.summary,
      appliedUpdates: applied.length,
      skippedUpdates: skipped.length,
    },
  }
}
