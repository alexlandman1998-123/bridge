// transactions owns these operations and their existing recovery behavior.
import { getOrCreateTransactionOnboardingRecord } from '../onboarding/workflow.js'
import { resolveActiveProfileContext } from '../access/actorContext.js'
import { normalizeNullableUuid, normalizeNullableText, requireClient, isMissingColumnError, isMissingSchemaError, normalizeOptionalNumber } from '../../lib/api/shared/readHelpers.js'
import { normalizeMainStage } from '../../core/transactions/legacyReadModel.js'
import { getDetailedStageFromMainStage } from '../../core/transactions/stageConfig'
import { normalizePurchaserType } from '../../lib/purchaserPersonas'
import { normalizeFinanceType } from '../../core/transactions/financeType'
import { SUBPROCESS_TYPES } from '../../core/transactions/roleConfig'
import { normalizeFinanceManagedBy } from '../../core/transactions/permissions'
import { deletePayloadColumnsIfMissing } from './creationApi.js'
import { isFinanceTypeConstraintError } from '../documents/uploadAutomation.js'
import { assertReservationDepositGateForTransition } from '../developments/transactionActions.js'
import { resolveDevelopmentOrganisationId, findOrCreateBuyer } from './attorneyAllocation.js'

export async function createClientRecord({ name, phone, email, organisationId = null }) {
  const client = requireClient()

  if (!String(name || '').trim()) {
    throw new Error('Client name is required.')
  }

  const normalizedOrganisationId = normalizeNullableUuid(organisationId)
  if (!normalizedOrganisationId) {
    throw new Error('Select an active organisation workspace before adding a client.')
  }

  return findOrCreateBuyer(client, {
    name: String(name || '').trim(),
    phone: String(phone || '').trim(),
    email: String(email || '').trim(),
    organisationId: normalizedOrganisationId,
  })
}

export async function saveDeveloperTransactionWorkspace({
  unitId,
  transactionId = null,
  buyerName = '',
  buyerPhone = '',
  buyerEmail = '',
  mode = 'available',
  mainStage = 'FIN',
  subprocessType = 'finance',
  progressNote = '',
  financeType = 'cash',
  purchaserType = 'individual',
  financeManagedBy = 'bond_originator',
  listPrice = null,
  salesPrice = null,
} = {}) {
  const client = requireClient()
  const actorProfile = await resolveActiveProfileContext(client)
  const actorUserId = normalizeNullableUuid(actorProfile.userId)

  if (!unitId) {
    throw new Error('Unit is required.')
  }

  const normalizedMode = String(mode || '')
    .trim()
    .toLowerCase()

  if (!['available', 'in_progress', 'registered'].includes(normalizedMode)) {
    throw new Error('Choose a valid transaction status.')
  }

  let existingTransaction = null

  if (transactionId) {
    let existingQuery = await client
      .from('transactions')
      .select(
        'id, organisation_id, development_id, unit_id, buyer_id, finance_type, purchaser_type, finance_managed_by, stage, current_main_stage, current_sub_stage_summary, assigned_agent, assigned_agent_email, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, next_action, sales_price, is_active',
      )
      .eq('id', transactionId)
      .maybeSingle()

    if (
      existingQuery.error &&
      (isMissingColumnError(existingQuery.error, 'current_main_stage') ||
        isMissingColumnError(existingQuery.error, 'current_sub_stage_summary') ||
        isMissingColumnError(existingQuery.error, 'assigned_agent') ||
        isMissingColumnError(existingQuery.error, 'assigned_agent_email') ||
        isMissingColumnError(existingQuery.error, 'assigned_attorney_email') ||
        isMissingColumnError(existingQuery.error, 'assigned_bond_originator_email') ||
        isMissingColumnError(existingQuery.error, 'organisation_id') ||
        isMissingColumnError(existingQuery.error, 'finance_managed_by') ||
        isMissingColumnError(existingQuery.error, 'sales_price') ||
        isMissingColumnError(existingQuery.error, 'purchaser_type') ||
        isMissingColumnError(existingQuery.error, 'is_active'))
    ) {
      existingQuery = await client
        .from('transactions')
        .select('id, development_id, unit_id, buyer_id, finance_type, stage, attorney, bond_originator, next_action')
        .eq('id', transactionId)
        .maybeSingle()
    }

    if (existingQuery.error && !isMissingSchemaError(existingQuery.error)) {
      throw existingQuery.error
    }

    existingTransaction = existingQuery.data || null
  } else {
    let existingQuery = await client
      .from('transactions')
      .select(
        'id, organisation_id, development_id, unit_id, buyer_id, finance_type, purchaser_type, finance_managed_by, stage, current_main_stage, current_sub_stage_summary, assigned_agent, assigned_agent_email, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, next_action, sales_price, is_active, updated_at',
      )
      .eq('unit_id', unitId)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)

    if (
      existingQuery.error &&
      (isMissingColumnError(existingQuery.error, 'current_main_stage') ||
        isMissingColumnError(existingQuery.error, 'current_sub_stage_summary') ||
        isMissingColumnError(existingQuery.error, 'assigned_agent') ||
        isMissingColumnError(existingQuery.error, 'assigned_agent_email') ||
        isMissingColumnError(existingQuery.error, 'assigned_attorney_email') ||
        isMissingColumnError(existingQuery.error, 'assigned_bond_originator_email') ||
        isMissingColumnError(existingQuery.error, 'organisation_id') ||
        isMissingColumnError(existingQuery.error, 'finance_managed_by') ||
        isMissingColumnError(existingQuery.error, 'sales_price') ||
        isMissingColumnError(existingQuery.error, 'purchaser_type') ||
        isMissingColumnError(existingQuery.error, 'is_active'))
    ) {
      existingQuery = await client
        .from('transactions')
        .select(
          'id, development_id, unit_id, buyer_id, finance_type, stage, attorney, bond_originator, next_action, updated_at',
        )
        .eq('unit_id', unitId)
        .order('updated_at', { ascending: false })
        .limit(1)
    }

    if (existingQuery.error && !isMissingSchemaError(existingQuery.error)) {
      throw existingQuery.error
    }

    existingTransaction = (existingQuery.data || [])[0] || null
  }

  const unitLookup = await client.from('units').select('id, development_id').eq('id', unitId).maybeSingle()
  if (unitLookup.error) {
    throw unitLookup.error
  }

  const buyerOrganisationId =
    normalizeNullableUuid(existingTransaction?.organisation_id) ||
    (await resolveDevelopmentOrganisationId(
      client,
      existingTransaction?.development_id || unitLookup.data?.development_id || null,
    ))

  const normalizedBuyerName = String(buyerName || '').trim()
  const normalizedBuyerPhone = String(buyerPhone || '').trim()
  const normalizedBuyerEmail = String(buyerEmail || '').trim()

  let resolvedBuyerId = existingTransaction?.buyer_id || null
  if (normalizedBuyerName || normalizedBuyerPhone || normalizedBuyerEmail) {
    if (!normalizedBuyerName) {
      throw new Error('Buyer name is required when adding or updating buyer details.')
    }

    const buyer = await findOrCreateBuyer(client, {
      name: normalizedBuyerName,
      phone: normalizedBuyerPhone,
      email: normalizedBuyerEmail,
      organisationId: buyerOrganisationId,
    })
    resolvedBuyerId = buyer.id
  }

  let resolvedMainStage = 'AVAIL'
  let resolvedDetailedStage = 'Available'

  if (normalizedMode === 'in_progress') {
    resolvedMainStage = normalizeMainStage(mainStage, existingTransaction?.stage || 'Finance Pending')
    if (!['DEP', 'OTP', 'FIN', 'ATTY', 'XFER'].includes(resolvedMainStage)) {
      throw new Error('Choose where the matter currently sits in the transaction journey.')
    }
    resolvedDetailedStage = getDetailedStageFromMainStage(resolvedMainStage)
  } else if (normalizedMode === 'registered') {
    resolvedMainStage = 'REG'
    resolvedDetailedStage = 'Registered'
  }

  const normalizedSubprocessType =
    normalizedMode === 'in_progress' &&
    SUBPROCESS_TYPES.includes(
      String(subprocessType || '')
        .trim()
        .toLowerCase(),
    )
      ? String(subprocessType || '')
          .trim()
          .toLowerCase()
      : null

  if (normalizedMode === 'in_progress' && !normalizedSubprocessType) {
    throw new Error('Select which subprocess currently owns the matter.')
  }

  const normalizedProgressNote = normalizeNullableText(progressNote)
  const normalizedListPrice = normalizeOptionalNumber(listPrice)
  const normalizedSalesPrice = normalizeOptionalNumber(salesPrice)

  if (normalizedMode === 'registered' && (normalizedListPrice === null || normalizedSalesPrice === null)) {
    throw new Error('List price and sales price are required when marking a matter as completed / registered.')
  }

  if (existingTransaction?.id && normalizedMode !== 'available') {
    await assertReservationDepositGateForTransition(client, {
      transactionId: existingTransaction.id,
      nextMainStage: resolvedMainStage,
      nextDetailedStage: resolvedDetailedStage,
    })
  }

  const unitPayload = {
    status: resolvedDetailedStage,
  }

  if (normalizedListPrice !== null) {
    unitPayload.list_price = normalizedListPrice
    unitPayload.price = normalizedListPrice
  }

  if (normalizedSalesPrice !== null) {
    unitPayload.current_price = normalizedSalesPrice
  }

  let unitUpdate = await client.from('units').update(unitPayload).eq('id', unitId)
  if (
    unitUpdate.error &&
    (isMissingColumnError(unitUpdate.error, 'list_price') || isMissingColumnError(unitUpdate.error, 'current_price'))
  ) {
    const fallbackUnitPayload = {
      status: resolvedDetailedStage,
      ...(normalizedListPrice !== null ? { price: normalizedListPrice } : {}),
    }
    unitUpdate = await client.from('units').update(fallbackUnitPayload).eq('id', unitId)
  }

  if (unitUpdate.error) {
    throw unitUpdate.error
  }

  await deactivateExistingUnitTransactions(client, unitId)

  const shouldPersistTransaction =
    Boolean(existingTransaction?.id) ||
    Boolean(resolvedBuyerId) ||
    normalizedMode !== 'available' ||
    Boolean(normalizedProgressNote)

  if (!shouldPersistTransaction) {
    return {
      unitId,
      transactionId: null,
      buyerId: resolvedBuyerId,
      stage: resolvedDetailedStage,
    }
  }

  if (!existingTransaction?.id && !actorUserId) {
    throw new Error('Please sign in again before creating a transaction.')
  }

  const subprocessLabel =
    normalizedSubprocessType === 'finance'
      ? 'Finance workflow'
      : normalizedSubprocessType === 'bond'
        ? 'Bond workflow'
        : normalizedSubprocessType === 'transfer' || normalizedSubprocessType === 'attorney'
          ? 'Transfer workflow'
          : null
  const progressSummary =
    normalizedMode === 'in_progress'
      ? normalizedProgressNote
        ? `${subprocessLabel} • ${normalizedProgressNote}`
        : subprocessLabel
      : normalizedMode === 'registered'
        ? 'Registered'
        : null
  const nextAction =
    normalizedMode === 'registered'
      ? 'Registered'
      : normalizedMode === 'in_progress'
        ? normalizedProgressNote || `Currently in ${subprocessLabel?.toLowerCase() || 'workflow'}.`
        : normalizedBuyerName
          ? 'Buyer captured. Ready for transaction setup.'
          : 'Available'

  const transactionPayload = {
    organisation_id: buyerOrganisationId,
    development_id: existingTransaction?.development_id || unitLookup.data?.development_id || null,
    unit_id: unitId,
    buyer_id: resolvedBuyerId,
    finance_type: normalizeFinanceType(financeType || existingTransaction?.finance_type || 'cash'),
    purchaser_type: normalizePurchaserType(purchaserType || existingTransaction?.purchaser_type || 'individual'),
    finance_managed_by: normalizeFinanceManagedBy(financeManagedBy || existingTransaction?.finance_managed_by),
    stage: resolvedDetailedStage,
    current_main_stage: resolvedMainStage,
    current_sub_stage_summary: progressSummary,
    assigned_agent: existingTransaction?.assigned_agent || null,
    assigned_agent_email: existingTransaction?.assigned_agent_email || normalizeNullableText(actorProfile.email)?.toLowerCase() || null,
    attorney: existingTransaction?.attorney || null,
    assigned_attorney_email: existingTransaction?.assigned_attorney_email || null,
    bond_originator: existingTransaction?.bond_originator || null,
    assigned_bond_originator_email: existingTransaction?.assigned_bond_originator_email || null,
    next_action: nextAction,
    comment: nextAction,
    ...(normalizedSalesPrice !== null ? { sales_price: normalizedSalesPrice } : {}),
    is_active: normalizedMode !== 'available',
    updated_at: new Date().toISOString(),
  }

  if (!existingTransaction?.id && actorUserId) {
    transactionPayload.assigned_agent_id = actorUserId
    transactionPayload.assigned_user_id = actorUserId
    transactionPayload.owner_user_id = actorUserId
    transactionPayload.created_by = actorUserId
  }

  let transactionResult = existingTransaction?.id
    ? await client
        .from('transactions')
        .update(transactionPayload)
        .eq('id', existingTransaction.id)
        .select(
          'id, unit_id, buyer_id, finance_type, purchaser_type, finance_managed_by, stage, current_main_stage, current_sub_stage_summary, next_action, sales_price, updated_at, created_at',
        )
        .single()
    : await client
        .from('transactions')
        .insert(transactionPayload)
        .select(
          'id, unit_id, buyer_id, finance_type, purchaser_type, finance_managed_by, stage, current_main_stage, current_sub_stage_summary, next_action, sales_price, updated_at, created_at',
        )
        .single()

  if (
    transactionResult.error &&
    (isMissingColumnError(transactionResult.error, 'current_main_stage') ||
      isMissingColumnError(transactionResult.error, 'current_sub_stage_summary') ||
      isMissingColumnError(transactionResult.error, 'sales_price') ||
      isMissingColumnError(transactionResult.error, 'comment') ||
      isMissingColumnError(transactionResult.error, 'purchaser_type') ||
      isMissingColumnError(transactionResult.error, 'finance_managed_by') ||
      isMissingColumnError(transactionResult.error, 'assigned_agent') ||
      isMissingColumnError(transactionResult.error, 'assigned_agent_email') ||
      isMissingColumnError(transactionResult.error, 'assigned_attorney_email') ||
      isMissingColumnError(transactionResult.error, 'assigned_bond_originator_email') ||
      isMissingColumnError(transactionResult.error, 'assigned_agent_id') ||
      isMissingColumnError(transactionResult.error, 'assigned_user_id') ||
      isMissingColumnError(transactionResult.error, 'owner_user_id') ||
      isMissingColumnError(transactionResult.error, 'created_by') ||
      isMissingColumnError(transactionResult.error, 'organisation_id') ||
      isMissingColumnError(transactionResult.error, 'is_active'))
  ) {
    const fallbackPayload = { ...transactionPayload }
    delete fallbackPayload.current_main_stage
    delete fallbackPayload.current_sub_stage_summary
    delete fallbackPayload.sales_price
    delete fallbackPayload.comment
    delete fallbackPayload.purchaser_type
    delete fallbackPayload.finance_managed_by
    delete fallbackPayload.assigned_agent
    delete fallbackPayload.assigned_agent_email
    delete fallbackPayload.assigned_attorney_email
    delete fallbackPayload.assigned_bond_originator_email
    delete fallbackPayload.is_active
    deletePayloadColumnsIfMissing(transactionResult.error, fallbackPayload, [
      'organisation_id',
      'assigned_agent_id',
      'assigned_user_id',
      'owner_user_id',
      'created_by',
    ])

    transactionResult = existingTransaction?.id
      ? await client
          .from('transactions')
          .update(fallbackPayload)
          .eq('id', existingTransaction.id)
          .select('id, unit_id, buyer_id, finance_type, stage, next_action, updated_at, created_at')
          .single()
      : await client
          .from('transactions')
          .insert(fallbackPayload)
          .select('id, unit_id, buyer_id, finance_type, stage, next_action, updated_at, created_at')
          .single()
  }

  if (
    transactionResult.error &&
    isFinanceTypeConstraintError(transactionResult.error) &&
    transactionPayload.finance_type === 'combination'
  ) {
    const legacyPayload = {
      ...transactionPayload,
      finance_type: 'hybrid',
    }

    transactionResult = existingTransaction?.id
      ? await client
          .from('transactions')
          .update(legacyPayload)
          .eq('id', existingTransaction.id)
          .select('id, unit_id, buyer_id, finance_type, stage, next_action, updated_at, created_at')
          .single()
      : await client
          .from('transactions')
          .insert(legacyPayload)
          .select('id, unit_id, buyer_id, finance_type, stage, next_action, updated_at, created_at')
          .single()
  }

  if (transactionResult.error) {
    throw transactionResult.error
  }

  try {
    await getOrCreateTransactionOnboardingRecord(client, {
      transactionId: transactionResult.data.id,
      purchaserType: transactionPayload.purchaser_type,
    })
  } catch (error) {
    if (!isMissingSchemaError(error)) {
      throw error
    }
  }

  return {
    unitId,
    transactionId: transactionResult.data.id,
    buyerId: resolvedBuyerId,
    stage: resolvedDetailedStage,
  }
}

async function deactivateExistingUnitTransactions(client, unitId) {
  let result = await client
    .from('transactions')
    .update({
      is_active: false,
      stage: 'Available',
      current_main_stage: 'AVAIL',
      current_sub_stage_summary: null,
      next_action: 'Transaction reset to available.',
      comment: 'Transaction reset to available.',
      updated_at: new Date().toISOString(),
    })
    .eq('unit_id', unitId)
    .eq('is_active', true)

  if (!result.error) {
    return
  }

  if (
    isMissingColumnError(result.error, 'is_active') ||
    isMissingColumnError(result.error, 'current_main_stage') ||
    isMissingColumnError(result.error, 'current_sub_stage_summary') ||
    isMissingColumnError(result.error, 'comment') ||
    isMissingColumnError(result.error, 'next_action')
  ) {
    const fallbackPayload = {
      stage: 'Available',
      updated_at: new Date().toISOString(),
    }

    result = await client.from('transactions').update(fallbackPayload).eq('unit_id', unitId).neq('stage', 'Available')

    if (!result.error) {
      return
    }

    if (isMissingColumnError(result.error, 'stage')) {
      return
    }
  }

  throw result.error
}
