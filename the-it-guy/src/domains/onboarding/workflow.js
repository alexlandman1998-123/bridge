// Extracted without changing validation, persistence order or recovery behaviour.
import { isMissingSchemaError, isPermissionDeniedError, normalizeNullableUuid, isMissingTableError, isMissingColumnError, requireClient, normalizeNullableText } from '../../lib/api/shared/readHelpers.js'
import { normalizePurchaserType, getPurchaserTypeLabel } from '../../lib/purchaserPersonas'
import { normalizeOnboardingRow } from '../transactions/readinessReadApi.js'
import { resolveActiveProfileContext } from '../access/actorContext.js'
import { normalizeRoleType } from '../../core/transactions/permissions'
import { updateRecordByIdWithMissingColumnFallback } from '../../lib/api/shared/schemaCompatibility.js'
import { logTransactionEventIfPossible } from '../transactions/eventActions.js'
import { syncAttorneyIncomingInstructionStatus } from '../../services/attorneyIncomingMatterInstructionSync'
import { ATTORNEY_INCOMING_INSTRUCTION_STATUSES } from '../../core/transactions/attorneyIncomingMatterContract'
import { normalizeFinanceType } from '../../core/transactions/financeType'
import { ensureTransactionRequiredDocuments } from '../documents/requirementActions.js'

export function isRecoverableTransactionSetupError(error) {
  return (
    isMissingSchemaError(error) ||
    isPermissionDeniedError(error) ||
    ['ATTORNEY_FIRM_RESOLUTION_FAILED', 'ATTORNEY_ASSIGNMENT_PERSISTENCE_FAILED'].includes(error?.code)
  )
}

export function generateOnboardingToken() {
  return `onb${crypto.randomUUID().replaceAll('-', '')}`
}

export async function getOrCreateTransactionOnboardingRecord(
  client,
  { transactionId, purchaserType = 'individual' },
  { createIfMissing = true } = {},
) {
  const normalizedTransactionId = normalizeNullableUuid(transactionId)
  if (!normalizedTransactionId) {
    return null
  }

  const normalizedType = normalizePurchaserType(purchaserType)
  const rowSelect = 'id, transaction_id, token, status, purchaser_type, submitted_at, is_active, created_at, updated_at'

  const pickMostRecentOnboardingRow = (rows = []) =>
    rows.reduce((latest, row) => {
      if (!row) {
        return latest
      }

      if (!latest) {
        return row
      }

      const rowTimestamp = Date.parse(row.updated_at || row.created_at || '')
      const latestTimestamp = Date.parse(latest.updated_at || latest.created_at || '')
      const normalizedRowTimestamp = Number.isFinite(rowTimestamp) ? rowTimestamp : 0
      const normalizedLatestTimestamp = Number.isFinite(latestTimestamp) ? latestTimestamp : 0

      if (normalizedRowTimestamp === normalizedLatestTimestamp) {
        return String(row.id || '') > String(latest.id || '') ? row : latest
      }

      return normalizedRowTimestamp > normalizedLatestTimestamp ? row : latest
    }, null)

  const existingQuery = await client
    .from('transaction_onboarding')
    .select(rowSelect)
    .eq('transaction_id', normalizedTransactionId)
    .eq('is_active', true)
  const existingError = existingQuery.error

  if (existingError) {
    if (
      isMissingTableError(existingError, 'transaction_onboarding') ||
      isMissingColumnError(existingError, 'is_active') ||
      isMissingColumnError(existingError, 'purchaser_type') ||
      isMissingColumnError(existingError, 'status')
    ) {
      return null
    }

    throw existingError
  }

  const existingRows = Array.isArray(existingQuery.data) ? existingQuery.data : []
  const existing = pickMostRecentOnboardingRow(existingRows)

  if (existing) {
    const existingType = normalizePurchaserType(existing.purchaser_type)
    if (existingType !== normalizedType && createIfMissing) {
      const { data: updated, error: updateError } = await client
        .from('transaction_onboarding')
        .update({
          purchaser_type: normalizedType,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select(rowSelect)
        .single()

      if (updateError) {
        throw updateError
      }

      return normalizeOnboardingRow(updated, normalizedType)
    }

    return normalizeOnboardingRow(existing, existingType || normalizedType)
  }

  if (!createIfMissing) {
    return normalizeOnboardingRow(
      {
        id: null,
        transaction_id: normalizedTransactionId,
        token: null,
        status: 'Not Started',
        purchaser_type: normalizedType,
        submitted_at: null,
        is_active: true,
        created_at: null,
        updated_at: null,
      },
      normalizedType,
    )
  }

  const insertPayload = {
    transaction_id: normalizedTransactionId,
    token: generateOnboardingToken(),
    status: 'Not Started',
    purchaser_type: normalizedType,
    is_active: true,
  }

  let insertResult = await client.from('transaction_onboarding').insert(insertPayload).select(rowSelect).single()

  if (insertResult.error && insertResult.error.code === '23505') {
    const conflictLookup = await client
      .from('transaction_onboarding')
      .select(rowSelect)
      .eq('transaction_id', normalizedTransactionId)
      .eq('is_active', true)
    const conflictRow = pickMostRecentOnboardingRow(Array.isArray(conflictLookup.data) ? conflictLookup.data : [])
    if (conflictLookup.error) {
      insertResult = conflictLookup
    } else if (conflictRow) {
      insertResult = { data: conflictRow, error: null }
    } else {
      insertResult = {
        data: null,
        error: {
          message: 'Onboarding row already exists but could not be reloaded.',
        },
      }
    }
  }

  if (insertResult.error) {
    if (
      isMissingTableError(insertResult.error, 'transaction_onboarding') ||
      isMissingColumnError(insertResult.error, 'is_active') ||
      isMissingColumnError(insertResult.error, 'purchaser_type') ||
      isMissingColumnError(insertResult.error, 'status')
    ) {
      return null
    }

    throw insertResult.error
  }

  return normalizeOnboardingRow(insertResult.data, normalizedType)
}

export async function recordBuyerOnboardingSent({
  transactionId,
  actorRole = null,
  recipientEmail = '',
  buyerTarget = null,
  roleplayers = [],
} = {}) {
  if (!transactionId) return null
  const client = requireClient()
  const actorProfile = await resolveActiveProfileContext(client)
  const normalizedActorRole = normalizeRoleType(actorRole || actorProfile.role || 'agent')
  const selectedBondOriginator = roleplayers.find(
    (roleplayer) => normalizeRoleType(roleplayer?.roleType || roleplayer?.role_type) === 'bond_originator',
  )
  if (selectedBondOriginator) {
    try {
      await updateRecordByIdWithMissingColumnFallback(
        client,
        'transactions',
        transactionId,
        {
          bond_assignment_status: 'awaiting_buyer_onboarding',
          bond_assignment_source: 'buyer_onboarding_send',
          updated_at: new Date().toISOString(),
        },
        'id, bond_assignment_status, bond_assignment_source, updated_at',
      )
    } catch (assignmentError) {
      if (!isRecoverableTransactionSetupError(assignmentError)) {
        throw assignmentError
      }
      console.warn('[recordBuyerOnboardingSent] bond assignment handoff update skipped', assignmentError)
    }
  }
  const target = buyerTarget && typeof buyerTarget === 'object' ? buyerTarget : {}
  const targetParticipantId = normalizeNullableText(target.participantId || target.participant_id)
  const targetBuyerPartyId = normalizeNullableText(target.buyerPartyId || target.buyer_party_id || target.buyerId || target.buyer_id)
  const targetEmail = normalizeNullableText(target.email || target.buyerEmail || target.buyer_email || recipientEmail)?.toLowerCase() || ''
  if (targetParticipantId || targetBuyerPartyId || targetEmail) {
    const nowIso = new Date().toISOString()
    let participantUpdateQuery = client
      .from('transaction_participants')
      .update({
        buyer_profile_status: 'invited',
        buyer_onboarding_status: 'sent',
        buyer_metadata: {
          ...(target.metadata && typeof target.metadata === 'object' ? target.metadata : {}),
          lastBuyerOnboardingSentAt: nowIso,
          lastBuyerOnboardingSentByRole: normalizedActorRole,
        },
        updated_at: nowIso,
      })
      .eq('transaction_id', transactionId)

    if (targetParticipantId) {
      participantUpdateQuery = participantUpdateQuery.eq('id', targetParticipantId)
    } else if (targetBuyerPartyId) {
      participantUpdateQuery = participantUpdateQuery.eq('buyer_party_id', targetBuyerPartyId)
    } else {
      participantUpdateQuery = participantUpdateQuery.ilike('participant_email', targetEmail)
    }

    const participantUpdate = await participantUpdateQuery.select('id')
    if (
      participantUpdate.error &&
      !isMissingTableError(participantUpdate.error, 'transaction_participants') &&
      !isMissingColumnError(participantUpdate.error, 'buyer_profile_status') &&
      !isMissingColumnError(participantUpdate.error, 'buyer_onboarding_status') &&
      !isMissingColumnError(participantUpdate.error, 'buyer_metadata') &&
      !isMissingColumnError(participantUpdate.error, 'updated_at') &&
      !isMissingColumnError(participantUpdate.error, 'buyer_party_id') &&
      !isMissingColumnError(participantUpdate.error, 'participant_email') &&
      !isPermissionDeniedError(participantUpdate.error)
    ) {
      throw participantUpdate.error
    }
    if (participantUpdate.error) {
      console.warn('[recordBuyerOnboardingSent] buyer participant onboarding status update skipped', participantUpdate.error)
    }
  }
  await logTransactionEventIfPossible(client, {
    transactionId,
    eventType: 'buyer_onboarding_sent',
    createdBy: actorProfile.userId || null,
    createdByRole: normalizedActorRole,
    eventData: {
      source: 'agent_send_buyer_onboarding',
      recipientEmail: normalizeNullableText(recipientEmail)?.toLowerCase() || null,
      buyerTarget: targetParticipantId || targetBuyerPartyId || targetEmail
        ? {
            participantId: targetParticipantId || null,
            buyerPartyId: targetBuyerPartyId || null,
            email: targetEmail || null,
          }
        : null,
      roleplayers,
    },
  })
  return true
}

export async function getOrCreateTransactionOnboarding({ transactionId, purchaserType = 'individual', prepareDocuments = true }) {
  const client = requireClient()
  const normalizedTransactionId = normalizeNullableUuid(transactionId)

  if (!normalizedTransactionId) {
    throw new Error('Transaction is required.')
  }

  const onboarding = await getOrCreateTransactionOnboardingRecord(client, {
    transactionId: normalizedTransactionId,
    purchaserType,
  })

  if (!onboarding) {
    throw new Error('Transaction onboarding is not set up yet. Run sql/schema.sql first.')
  }

  const { data: transaction, error: transactionError } = await client
    .from('transactions')
    .select(
      'id, purchaser_type, finance_type, cash_amount, bond_amount, reservation_required, onboarding_status, onboarding_completed_at, external_onboarding_submitted_at',
    )
    .eq('id', normalizedTransactionId)
    .maybeSingle()

  if (
    transactionError &&
    !isMissingColumnError(transactionError, 'purchaser_type') &&
    !isMissingColumnError(transactionError, 'finance_type') &&
    !isMissingColumnError(transactionError, 'cash_amount') &&
    !isMissingColumnError(transactionError, 'bond_amount') &&
    !isMissingColumnError(transactionError, 'reservation_required') &&
    !isMissingColumnError(transactionError, 'onboarding_status') &&
    !isMissingColumnError(transactionError, 'onboarding_completed_at') &&
    !isMissingColumnError(transactionError, 'external_onboarding_submitted_at')
  ) {
    throw transactionError
  }

  if (
    transaction?.id &&
    ['Submitted', 'Reviewed', 'Approved'].includes(onboarding.status) &&
    !transaction.onboarding_completed_at &&
    !transaction.external_onboarding_submitted_at
  ) {
    const completedAt = onboarding.submittedAt || onboarding.updatedAt || new Date().toISOString()
    await updateRecordByIdWithMissingColumnFallback(
      client,
      'transactions',
      normalizedTransactionId,
      {
        onboarding_status: 'awaiting_signed_otp',
        onboarding_completed_at: completedAt,
        external_onboarding_submitted_at: completedAt,
        updated_at: new Date().toISOString(),
      },
      'id, onboarding_status, onboarding_completed_at, external_onboarding_submitted_at, updated_at',
    )
    await syncAttorneyIncomingInstructionStatus(client, {
      transactionId: normalizedTransactionId,
      status: ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingSignedOtp,
      occurredAt: completedAt,
      source: 'get_or_create_transaction_onboarding',
    })
  }

  const resolvedType = normalizePurchaserType(transaction?.purchaser_type || purchaserType || onboarding.purchaserType)
  const resolvedFinanceType = normalizeFinanceType(transaction?.finance_type || 'cash')
  const requiredDocuments = prepareDocuments
    ? await ensureTransactionRequiredDocuments(client, {
      transactionId: normalizedTransactionId,
      purchaserType: resolvedType,
      financeType: resolvedFinanceType,
      reservationRequired: Boolean(transaction?.reservation_required),
      cashAmount: transaction?.cash_amount,
      bondAmount: transaction?.bond_amount,
      formData: {},
    })
    : []

  return {
    ...onboarding,
    purchaserType: resolvedType,
    purchaserTypeLabel: getPurchaserTypeLabel(resolvedType),
    requiredDocuments,
  }
}
