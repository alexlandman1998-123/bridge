// transactions owns these operations and their existing recovery behavior.
import { getOrCreateTransactionOnboardingRecord } from '../onboarding/workflow.js'
import { ensureTransactionRequiredDocuments } from '../documents/requirementActions.js'
import { logTransactionEventIfPossible, publishWorkflowChangedIfPossible } from './eventActions.js'
import { resolveActiveProfileContext } from '../access/actorContext.js'
import { normalizeNullableUuid, normalizeNullableText, requireClient, isMissingColumnError, isMissingSchemaError, normalizeOptionalNumber } from '../../lib/api/shared/readHelpers.js'
import { normalizeStage, normalizeMainStage } from '../../core/transactions/legacyReadModel.js'
import { getDetailedStageFromMainStage } from '../../core/transactions/stageConfig'
import { normalizePurchaserType } from '../../lib/purchaserPersonas'
import { normalizeFinanceType } from '../../core/transactions/financeType'
import { getRolePermissions, normalizeFinanceManagedBy, normalizeRoleType } from '../../core/transactions/permissions'
import { deletePayloadColumnsIfMissing } from './creationApi.js'
import { isFinanceTypeConstraintError, runDocumentAutomationIfPossible } from '../documents/uploadAutomation.js'
import { ensureTransactionSubprocesses } from './subprocessApi.js'
import { syncTransactionSubprocessOwners, ensureTransactionParticipants } from './workspaceHydration.js'
import { createTransactionNotificationIfPossible } from './participantInfrastructure.js'
import { notifyRolesForTransaction } from '../bond/financeRead.js'
import { assertReservationDepositGateForTransition } from '../developments/transactionActions.js'
import { resolveDevelopmentOrganisationId, persistTransactionCommissionSnapshotIfPossible, persistCommissionSnapshotToTransactionRowIfPossible } from './attorneyAllocation.js'

export async function saveTransaction({
  unitId,
  transactionId,
  buyerId,
  financeType,
  purchasePrice,
  cashAmount,
  bondAmount,
  depositAmount,
  purchaserType,
  financeManagedBy,
  mainStage,
  stage,
  assignedAgent,
  assignedAgentEmail,
  attorney,
  assignedAttorneyEmail,
  bondOriginator,
  assignedBondOriginatorEmail,
  nextAction,
  actorRole,
  commissionSnapshot = null,
}) {
  const client = requireClient()
  const normalizedActorRole = actorRole ? normalizeRoleType(actorRole) : null
  const actorProfile = await resolveActiveProfileContext(client)
  const effectiveActorRole = normalizedActorRole || actorProfile.role || 'developer'
  const effectiveActorUserId = normalizeNullableUuid(actorProfile.userId)

  if (!transactionId && !effectiveActorUserId) {
    throw new Error('Please sign in again before creating a transaction.')
  }

  const toComparableText = (value) =>
    String(value || '')
      .trim()
      .toLowerCase()

  const hasAssignmentChanged = (previousName, previousEmail, nextName, nextEmail) =>
    toComparableText(previousName) !== toComparableText(nextName) ||
    toComparableText(previousEmail) !== toComparableText(nextEmail)

  let previousTransaction = null
  if (transactionId) {
    let previousQuery = await client
      .from('transactions')
      .select(
        'id, stage, current_main_stage, finance_type, finance_managed_by, assigned_agent, assigned_agent_email, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, gross_commission_percentage, agent_split_percentage_snapshot, agency_split_percentage_snapshot',
      )
      .eq('id', transactionId)
      .maybeSingle()

    if (
      previousQuery.error &&
      (isMissingColumnError(previousQuery.error, 'current_main_stage') ||
        isMissingColumnError(previousQuery.error, 'finance_managed_by') ||
        isMissingColumnError(previousQuery.error, 'assigned_agent') ||
        isMissingColumnError(previousQuery.error, 'assigned_agent_email') ||
        isMissingColumnError(previousQuery.error, 'assigned_attorney_email') ||
        isMissingColumnError(previousQuery.error, 'assigned_bond_originator_email') ||
        isMissingColumnError(previousQuery.error, 'gross_commission_percentage') ||
        isMissingColumnError(previousQuery.error, 'agent_split_percentage_snapshot') ||
        isMissingColumnError(previousQuery.error, 'agency_split_percentage_snapshot'))
    ) {
      previousQuery = await client
        .from('transactions')
        .select('id, stage, finance_type, attorney, bond_originator')
        .eq('id', transactionId)
        .maybeSingle()
    }

    if (previousQuery.error && !isMissingSchemaError(previousQuery.error)) {
      throw previousQuery.error
    }

    previousTransaction = previousQuery.data || null
  }

  if (normalizedActorRole) {
    const actorPermissions = getRolePermissions({
      role: normalizedActorRole,
      financeManagedBy: financeManagedBy || 'bond_originator',
    })

    if (!actorPermissions.canEditCoreTransaction) {
      throw new Error('Your role does not have permission to edit core transaction details.')
    }
  }

  const resolvedDetailedStage = stage || getDetailedStageFromMainStage(mainStage, previousTransaction?.stage || null)
  const resolvedMainStage = normalizeMainStage(
    mainStage || previousTransaction?.current_main_stage,
    resolvedDetailedStage,
  )
  const normalizedFinanceType = normalizeFinanceType(financeType || previousTransaction?.finance_type || 'cash')
  const hasPurchasePrice = purchasePrice !== undefined
  const hasCashAmount = cashAmount !== undefined
  const hasBondAmount = bondAmount !== undefined
  const hasDepositAmount = depositAmount !== undefined
  const normalizedPurchasePrice = hasPurchasePrice ? normalizeOptionalNumber(purchasePrice) : null
  const normalizedCashAmount = hasCashAmount ? normalizeOptionalNumber(cashAmount) : null
  const normalizedBondAmount = hasBondAmount ? normalizeOptionalNumber(bondAmount) : null
  const normalizedDepositAmount = hasDepositAmount ? normalizeOptionalNumber(depositAmount) : null
  const previousStage = normalizeStage(previousTransaction?.stage, resolvedDetailedStage)
  const previousMainStage = normalizeMainStage(previousTransaction?.current_main_stage, previousStage)
  const normalizedNextStage = normalizeStage(resolvedDetailedStage, resolvedDetailedStage)

  if (transactionId && (previousStage !== normalizedNextStage || previousMainStage !== resolvedMainStage)) {
    await assertReservationDepositGateForTransition(client, {
      transactionId,
      previousMainStage,
      nextMainStage: resolvedMainStage,
      nextDetailedStage: normalizedNextStage,
    })
  }

  const payload = {
    unit_id: unitId,
    buyer_id: buyerId || null,
    finance_type: normalizedFinanceType,
    purchaser_type: normalizePurchaserType(purchaserType),
    finance_managed_by: normalizeFinanceManagedBy(financeManagedBy),
    stage: resolvedDetailedStage,
    current_main_stage: resolvedMainStage,
    assigned_agent: normalizeNullableText(assignedAgent),
    assigned_agent_email: normalizeNullableText(assignedAgentEmail)?.toLowerCase() || null,
    attorney: attorney || null,
    assigned_attorney_email: normalizeNullableText(assignedAttorneyEmail)?.toLowerCase() || null,
    bond_originator: bondOriginator || null,
    assigned_bond_originator_email: normalizeNullableText(assignedBondOriginatorEmail)?.toLowerCase() || null,
    next_action: nextAction || null,
    comment: nextAction || null,
    is_active: resolvedMainStage !== 'AVAIL',
    updated_at: new Date().toISOString(),
  }

  if (!transactionId && effectiveActorUserId) {
    payload.assigned_agent_id = ['developer', 'agent'].includes(effectiveActorRole) ? effectiveActorUserId : null
    payload.assigned_user_id = effectiveActorUserId
    payload.owner_user_id = effectiveActorUserId
    payload.created_by = effectiveActorUserId

    if (unitId) {
      const unitLookup = await client.from('units').select('id, development_id').eq('id', unitId).maybeSingle()
      if (unitLookup.error) {
        throw unitLookup.error
      }
      payload.development_id = normalizeNullableUuid(unitLookup.data?.development_id)
      payload.organisation_id = await resolveDevelopmentOrganisationId(client, payload.development_id)
    }
  }

  if (hasPurchasePrice) {
    payload.sales_price = normalizedPurchasePrice
    payload.purchase_price = normalizedPurchasePrice
  }

  if (hasCashAmount) {
    payload.cash_amount = normalizedCashAmount
  }

  if (hasBondAmount) {
    payload.bond_amount = normalizedBondAmount
  }

  if (hasDepositAmount) {
    payload.deposit_amount = normalizedDepositAmount
  }

  let result

  if (transactionId) {
    result = await client
      .from('transactions')
      .update(payload)
      .eq('id', transactionId)
      .select(
        'id, unit_id, buyer_id, finance_type, purchaser_type, finance_managed_by, assigned_agent, assigned_agent_email, stage, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, next_action, updated_at, created_at',
      )
      .single()
  } else {
    result = await client
      .from('transactions')
      .insert(payload)
      .select(
        'id, unit_id, buyer_id, finance_type, purchaser_type, finance_managed_by, assigned_agent, assigned_agent_email, stage, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, next_action, updated_at, created_at',
      )
      .single()
  }

  if (result.error) {
    if (
      isMissingColumnError(result.error, 'current_main_stage') ||
      isMissingColumnError(result.error, 'purchaser_type') ||
      isMissingColumnError(result.error, 'sales_price') ||
      isMissingColumnError(result.error, 'purchase_price') ||
      isMissingColumnError(result.error, 'cash_amount') ||
      isMissingColumnError(result.error, 'bond_amount') ||
      isMissingColumnError(result.error, 'deposit_amount') ||
      isMissingColumnError(result.error, 'assigned_agent_id') ||
      isMissingColumnError(result.error, 'assigned_user_id') ||
      isMissingColumnError(result.error, 'owner_user_id') ||
      isMissingColumnError(result.error, 'created_by') ||
      isMissingColumnError(result.error, 'development_id') ||
      isMissingColumnError(result.error, 'organisation_id')
    ) {
      const fallbackPayload = { ...payload }
      delete fallbackPayload.current_main_stage
      delete fallbackPayload.comment
      delete fallbackPayload.purchaser_type
      delete fallbackPayload.sales_price
      delete fallbackPayload.purchase_price
      delete fallbackPayload.cash_amount
      delete fallbackPayload.bond_amount
      delete fallbackPayload.deposit_amount
      deletePayloadColumnsIfMissing(result.error, fallbackPayload, [
        'assigned_agent_id',
        'assigned_user_id',
        'owner_user_id',
        'created_by',
        'development_id',
        'organisation_id',
      ])

      if (transactionId) {
        result = await client
          .from('transactions')
          .update(fallbackPayload)
          .eq('id', transactionId)
          .select(
            'id, unit_id, buyer_id, finance_type, purchaser_type, finance_managed_by, assigned_agent, assigned_agent_email, stage, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, next_action, updated_at, created_at',
          )
          .single()
      } else {
        result = await client
          .from('transactions')
          .insert(fallbackPayload)
          .select(
            'id, unit_id, buyer_id, finance_type, purchaser_type, finance_managed_by, assigned_agent, assigned_agent_email, stage, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, next_action, updated_at, created_at',
          )
          .single()
      }
    }

    if (result.error && isMissingColumnError(result.error, 'comment')) {
      const fallbackPayload = { ...payload }
      delete fallbackPayload.comment

      if (transactionId) {
        result = await client
          .from('transactions')
          .update(fallbackPayload)
          .eq('id', transactionId)
          .select(
            'id, unit_id, buyer_id, finance_type, purchaser_type, finance_managed_by, assigned_agent, assigned_agent_email, stage, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, next_action, updated_at, created_at',
          )
          .single()
      } else {
        result = await client
          .from('transactions')
          .insert(fallbackPayload)
          .select(
            'id, unit_id, buyer_id, finance_type, purchaser_type, finance_managed_by, assigned_agent, assigned_agent_email, stage, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, next_action, updated_at, created_at',
          )
          .single()
      }
    }

    if (result.error && isMissingColumnError(result.error, 'is_active')) {
      const fallbackPayload = { ...payload }
      delete fallbackPayload.is_active

      if (transactionId) {
        result = await client
          .from('transactions')
          .update(fallbackPayload)
          .eq('id', transactionId)
          .select(
            'id, unit_id, buyer_id, finance_type, purchaser_type, finance_managed_by, assigned_agent, assigned_agent_email, stage, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, next_action, updated_at, created_at',
          )
          .single()
      } else {
        result = await client
          .from('transactions')
          .insert(fallbackPayload)
          .select(
            'id, unit_id, buyer_id, finance_type, purchaser_type, finance_managed_by, assigned_agent, assigned_agent_email, stage, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, next_action, updated_at, created_at',
          )
          .single()
      }
    }

    if (
      result.error &&
      (isMissingColumnError(result.error, 'finance_managed_by') ||
        isMissingColumnError(result.error, 'assigned_agent') ||
        isMissingColumnError(result.error, 'assigned_agent_email') ||
        isMissingColumnError(result.error, 'assigned_attorney_email') ||
        isMissingColumnError(result.error, 'assigned_bond_originator_email'))
    ) {
      const fallbackPayload = { ...payload }
      delete fallbackPayload.finance_managed_by
      delete fallbackPayload.assigned_agent
      delete fallbackPayload.assigned_agent_email
      delete fallbackPayload.assigned_attorney_email
      delete fallbackPayload.assigned_bond_originator_email
      delete fallbackPayload.comment
      delete fallbackPayload.current_main_stage
      delete fallbackPayload.purchaser_type

      if (transactionId) {
        result = await client
          .from('transactions')
          .update(fallbackPayload)
          .eq('id', transactionId)
          .select(
            'id, unit_id, buyer_id, finance_type, stage, attorney, bond_originator, next_action, updated_at, created_at',
          )
          .single()
      } else {
        result = await client
          .from('transactions')
          .insert(fallbackPayload)
          .select(
            'id, unit_id, buyer_id, finance_type, stage, attorney, bond_originator, next_action, updated_at, created_at',
          )
          .single()
      }
    }

    if (result.error && isFinanceTypeConstraintError(result.error) && normalizedFinanceType === 'combination') {
      const legacyPayload = {
        ...payload,
        finance_type: 'hybrid',
      }

      if (transactionId) {
        result = await client
          .from('transactions')
          .update(legacyPayload)
          .eq('id', transactionId)
          .select(
            'id, unit_id, buyer_id, finance_type, purchaser_type, finance_managed_by, assigned_agent, assigned_agent_email, stage, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, next_action, updated_at, created_at',
          )
          .single()
      } else {
        result = await client
          .from('transactions')
          .insert(legacyPayload)
          .select(
            'id, unit_id, buyer_id, finance_type, purchaser_type, finance_managed_by, assigned_agent, assigned_agent_email, stage, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, next_action, updated_at, created_at',
          )
          .single()
      }
    }
  }

  if (result.error) {
    throw result.error
  }

  const normalizeSnapshotForSave = (snapshot = null) => {
    if (!snapshot || typeof snapshot !== 'object') return null
    const grossCommissionPercentage = normalizeOptionalNumber(snapshot.grossCommissionPercentage)
    const agentSplitPercentage = normalizeOptionalNumber(snapshot.agentSplitPercentage)
    const agencySplitPercentageRaw = normalizeOptionalNumber(snapshot.agencySplitPercentage)
    const salePrice = normalizeOptionalNumber(snapshot.salePrice)
    const grossCommissionAmount = normalizeOptionalNumber(snapshot.grossCommissionAmount)
    const agentCommissionAmount = normalizeOptionalNumber(snapshot.agentCommissionAmount)
    const agencyCommissionAmount = normalizeOptionalNumber(snapshot.agencyCommissionAmount)

    return {
      ...snapshot,
      grossCommissionPercentage,
      agentSplitPercentage,
      agencySplitPercentage:
        agencySplitPercentageRaw !== null
          ? agencySplitPercentageRaw
          : agentSplitPercentage !== null
            ? Number((100 - agentSplitPercentage).toFixed(3))
            : null,
      salePrice,
      grossCommissionAmount,
      agentCommissionAmount,
      agencyCommissionAmount,
    }
  }

  const buildSnapshotFromPercentages = ({
    salePrice,
    grossCommissionPercentage,
    agentSplitPercentage,
    agencySplitPercentage,
  } = {}) => {
    const normalizedSalePrice = normalizeOptionalNumber(salePrice)
    const normalizedGross = normalizeOptionalNumber(grossCommissionPercentage)
    const normalizedAgentSplit = normalizeOptionalNumber(agentSplitPercentage)
    if (normalizedSalePrice === null || normalizedGross === null || normalizedAgentSplit === null) {
      return null
    }
    const normalizedAgencySplit =
      normalizeOptionalNumber(agencySplitPercentage) ?? Number((100 - normalizedAgentSplit).toFixed(3))
    const grossCommissionAmount = Number(((normalizedSalePrice * normalizedGross) / 100).toFixed(2))
    const agentCommissionAmount = Number(((grossCommissionAmount * normalizedAgentSplit) / 100).toFixed(2))
    const agencyCommissionAmount = Number(((grossCommissionAmount * normalizedAgencySplit) / 100).toFixed(2))
    return {
      salePrice: normalizedSalePrice,
      grossCommissionPercentage: normalizedGross,
      grossCommissionAmount,
      agentSplitPercentage: normalizedAgentSplit,
      agencySplitPercentage: normalizedAgencySplit,
      agentCommissionAmount,
      agencyCommissionAmount,
    }
  }

  const explicitSnapshot = normalizeSnapshotForSave(commissionSnapshot)
  const salePriceForAutoSnapshot =
    normalizedPurchasePrice ??
    normalizeOptionalNumber(result?.data?.purchase_price) ??
    normalizeOptionalNumber(result?.data?.sales_price)
  const autoRecalculatedSnapshot =
    explicitSnapshot ||
    buildSnapshotFromPercentages({
      salePrice: salePriceForAutoSnapshot,
      grossCommissionPercentage: previousTransaction?.gross_commission_percentage,
      agentSplitPercentage: previousTransaction?.agent_split_percentage_snapshot,
      agencySplitPercentage: previousTransaction?.agency_split_percentage_snapshot,
    })

  if (autoRecalculatedSnapshot) {
    let commissionSnapshotWithContext = autoRecalculatedSnapshot
    if (!normalizeNullableText(commissionSnapshotWithContext.organisationId)) {
      try {
        const context = await resolveActiveProfileContext(client)
        if (context?.workspaceId || context?.organisationId) {
          commissionSnapshotWithContext = {
            ...commissionSnapshotWithContext,
            organisationId: context.workspaceId || context.organisationId,
          }
        }
      } catch {
        // Non-fatal: transaction table snapshot persistence still proceeds.
      }
    }

    try {
      await persistTransactionCommissionSnapshotIfPossible(client, {
        transactionId: result.data.id,
        commissionSnapshot: commissionSnapshotWithContext,
        setup: {
          salesPrice: salePriceForAutoSnapshot,
          assignedAgentUserId: null,
          assignedAgentEmail: normalizeNullableText(assignedAgentEmail)?.toLowerCase() || null,
        },
      })
    } catch (snapshotPersistError) {
      if (!isMissingSchemaError(snapshotPersistError)) {
        throw snapshotPersistError
      }
    }

    try {
      await persistCommissionSnapshotToTransactionRowIfPossible(client, {
        transactionId: result.data.id,
        commissionSnapshot: commissionSnapshotWithContext,
      })
    } catch (snapshotPersistError) {
      if (!isMissingSchemaError(snapshotPersistError)) {
        throw snapshotPersistError
      }
    }
  }

  const { error: unitError } = await client.from('units').update({ status: resolvedDetailedStage }).eq('id', unitId)

  if (unitError) {
    throw unitError
  }

  try {
    const subprocesses = await ensureTransactionSubprocesses(client, result.data.id)
    await syncTransactionSubprocessOwners(client, result.data, subprocesses)
  } catch (error) {
    if (!isMissingSchemaError(error)) {
      throw error
    }
  }

  try {
    let buyer = null
    if (result.data.buyer_id) {
      const buyerResult = await client
        .from('buyers')
        .select('id, name, email')
        .eq('id', result.data.buyer_id)
        .maybeSingle()
      if (buyerResult.error && !isMissingSchemaError(buyerResult.error)) {
        throw buyerResult.error
      }
      buyer = buyerResult.data || null
    }

    const participantResult = await ensureTransactionParticipants(client, {
      transaction: result.data,
      buyer,
    })

    const participants = participantResult?.participants || []
    const participantByRole = participants.reduce((accumulator, participant) => {
      accumulator[participant.roleType] = participant
      return accumulator
    }, {})

    const assignmentChanges = [
      {
        roleType: 'agent',
        roleLabel: 'Agent',
        previousName: previousTransaction?.assigned_agent || '',
        previousEmail: previousTransaction?.assigned_agent_email || '',
        nextName: payload.assigned_agent || '',
        nextEmail: payload.assigned_agent_email || '',
      },
      {
        roleType: 'attorney',
        roleLabel: 'Attorney',
        previousName: previousTransaction?.attorney || '',
        previousEmail: previousTransaction?.assigned_attorney_email || '',
        nextName: payload.attorney || '',
        nextEmail: payload.assigned_attorney_email || '',
      },
      {
        roleType: 'bond_originator',
        roleLabel: 'Bond Originator',
        previousName: previousTransaction?.bond_originator || '',
        previousEmail: previousTransaction?.assigned_bond_originator_email || '',
        nextName: payload.bond_originator || '',
        nextEmail: payload.assigned_bond_originator_email || '',
      },
    ]

    for (const assignment of assignmentChanges) {
      if (
        !hasAssignmentChanged(
          assignment.previousName,
          assignment.previousEmail,
          assignment.nextName,
          assignment.nextEmail,
        )
      ) {
        continue
      }

      const target = participantByRole[assignment.roleType]
      if (!target?.userId || target.userId === effectiveActorUserId) {
        continue
      }

      await createTransactionNotificationIfPossible(client, {
        transactionId: result.data.id,
        userId: target.userId,
        roleType: assignment.roleType,
        notificationType: 'participant_assigned',
        title: `${assignment.roleLabel} assignment updated`,
        message: `You were assigned on Unit ${result.data.unit_id || '-'}.`,
        eventType: 'ParticipantAssigned',
        eventData: {
          trigger: 'save_transaction',
          assignedRole: assignment.roleType,
          actorRole: effectiveActorRole,
        },
        dedupeKey: `assign-update:${result.data.id}:${assignment.roleType}:${target.userId}:${toComparableText(assignment.nextEmail || assignment.nextName)}`,
      })
    }

    await getOrCreateTransactionOnboardingRecord(client, {
      transactionId: result.data.id,
      purchaserType: result.data.purchaser_type || purchaserType,
    })
    await ensureTransactionRequiredDocuments(client, {
      transactionId: result.data.id,
      purchaserType: result.data.purchaser_type || purchaserType,
      financeType: payload.finance_type,
      reservationRequired: false,
      cashAmount: null,
      bondAmount: null,
    })
  } catch (error) {
    if (!isMissingSchemaError(error)) {
      throw error
    }
  }

  await logTransactionEventIfPossible(client, {
    transactionId: result.data.id,
    eventType: 'TransactionUpdated',
    createdBy: effectiveActorUserId,
    createdByRole: effectiveActorRole,
    eventData: {
      stage: resolvedDetailedStage,
      mainStage: resolvedMainStage,
      financeType: payload.finance_type,
      financeManagedBy: payload.finance_managed_by,
      purchaserType: payload.purchaser_type,
      nextAction: payload.next_action || null,
    },
  })

  const stageChanged = previousStage !== normalizedNextStage
  const mainStageChanged = previousMainStage !== resolvedMainStage

  if (stageChanged || mainStageChanged) {
    await logTransactionEventIfPossible(client, {
      transactionId: result.data.id,
      eventType: 'TransactionStageChanged',
      createdBy: effectiveActorUserId,
      createdByRole: effectiveActorRole,
      eventData: {
        fromStage: previousStage,
        toStage: normalizedNextStage,
        fromMainStage: previousMainStage,
        toMainStage: resolvedMainStage,
        source: 'save_transaction',
      },
    })
  }

  if (mainStageChanged && resolvedMainStage === 'FIN') {
    await notifyRolesForTransaction(client, {
      transactionId: result.data.id,
      roleTypes: ['bond_originator'],
      title: 'Finance lane active',
      message: 'This transaction has moved into finance processing.',
      notificationType: 'lane_handoff',
      eventType: 'TransactionStageChanged',
      eventData: {
        fromMainStage: previousMainStage,
        toMainStage: resolvedMainStage,
      },
      dedupePrefix: `handoff-finance-stage:${resolvedMainStage}`,
      excludeUserId: effectiveActorUserId,
    })
  }

  if (mainStageChanged && resolvedMainStage === 'ATTY') {
    await notifyRolesForTransaction(client, {
      transactionId: result.data.id,
      roleTypes: ['attorney'],
      title: 'Attorney lane active',
      message: 'This transaction is now ready for transfer preparation.',
      notificationType: 'lane_handoff',
      eventType: 'TransactionStageChanged',
      eventData: {
        fromMainStage: previousMainStage,
        toMainStage: resolvedMainStage,
      },
      dedupePrefix: `handoff-attorney-stage:${resolvedMainStage}`,
      excludeUserId: effectiveActorUserId,
    })
  }

  if ((stageChanged || mainStageChanged) && normalizedNextStage === 'Registered') {
    await notifyRolesForTransaction(client, {
      transactionId: result.data.id,
      roleTypes: ['developer', 'agent', 'attorney', 'bond_originator', 'client'],
      title: 'Transaction registered',
      message: 'Registration is complete for this transaction.',
      notificationType: 'registration_completed',
      eventType: 'TransactionStageChanged',
      eventData: {
        stage: 'Registered',
      },
      dedupePrefix: 'registration-complete',
      excludeUserId: effectiveActorUserId,
    })
  }

  await runDocumentAutomationIfPossible(client, {
    transactionId: result.data.id,
    documentId: null,
    documentName: null,
    category: null,
    actorRole: effectiveActorRole,
    actorUserId: effectiveActorUserId,
    source: 'transaction_updated',
  })

  await publishWorkflowChangedIfPossible(client, {
    transactionId: result.data.id,
    triggerType: 'transaction_update',
    triggerId: result.data.id,
    reasonCode:
      normalizeFinanceType(previousTransaction?.finance_type || '', {
        allowUnknown: true,
      }) !== normalizeFinanceType(payload.finance_type || '', { allowUnknown: true })
        ? 'finance_type_changed'
        : stageChanged || mainStageChanged
          ? 'transaction_stage_saved'
          : 'transaction_updated',
    userId: effectiveActorUserId,
    source: 'save_transaction',
    payload: {
      financeType: payload.finance_type,
      previousFinanceType: previousTransaction?.finance_type || null,
      requestedMainStage: resolvedMainStage,
      requestedStage: resolvedDetailedStage,
    },
  })

  return result.data
}
