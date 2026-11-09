// transactions owns these operations and their existing recovery behavior.
import { logTransactionEventIfPossible } from './eventActions.js'
import { resolveActiveProfileContext } from '../access/actorContext.js'
import { normalizeNullableUuid, requireClient, isMissingTableError, isMissingColumnError, isMissingSchemaError, normalizeTextValue } from '../../lib/api/shared/readHelpers.js'
import { invokeEdgeFunction } from '../../lib/supabaseClient'
import { RESERVATION_DEPOSIT_MARK_PAID_SOURCE, RESERVATION_DEPOSIT_PROOF_DOCUMENT_KEY, buildReservationDepositMarkPaidOverrideRow, buildReservationDepositMarkPaidTransactionPatch, resolveReservationDepositPaymentReviewState } from '../../core/journey/reservationDepositPaymentReview.js'
import { normalizeRoleType } from '../../core/transactions/permissions'

const RESERVATION_DEPOSIT_MARK_PAID_TRANSACTION_SELECT =
  'id, organisation_id, reservation_required, reservation_amount, reservation_status, reservation_paid_date, reservation_proof_document, reservation_proof_uploaded_at, reservation_reviewed_at, reservation_reviewed_by, reservation_review_notes'

const RESERVATION_DEPOSIT_MARK_PAID_FALLBACK_SELECT =
  'id, organisation_id, reservation_required, reservation_amount, reservation_status, reservation_paid_date, reservation_proof_document'

async function readTransactionForReservationDepositMarkPaid(client, transactionId) {
  let query = await client
    .from('transactions')
    .select(RESERVATION_DEPOSIT_MARK_PAID_TRANSACTION_SELECT)
    .eq('id', transactionId)
    .maybeSingle()

  if (
    query.error &&
    (isMissingColumnError(query.error, 'reservation_proof_uploaded_at') ||
      isMissingColumnError(query.error, 'reservation_reviewed_at') ||
      isMissingColumnError(query.error, 'reservation_reviewed_by') ||
      isMissingColumnError(query.error, 'reservation_review_notes'))
  ) {
    query = await client
      .from('transactions')
      .select(RESERVATION_DEPOSIT_MARK_PAID_FALLBACK_SELECT)
      .eq('id', transactionId)
      .maybeSingle()
  }

  if (query.error) {
    throw query.error
  }

  return query.data || null
}

async function insertJourneyStageOverride(client, row) {
  const insertResult = await client
    .from('journey_stage_overrides')
    .insert(row)
    .select(
      'id, organisation_id, entity_type, entity_id, stage_key, action_type, reason, effective_at, actor_user_id, notification_mode, metadata, created_at',
    )
    .single()

  if (insertResult.error) {
    throw insertResult.error
  }

  return insertResult.data || null
}

async function updateReservationDepositPaidState(client, { transactionId, patch } = {}) {
  let updateResult = await client
    .from('transactions')
    .update(patch)
    .eq('id', transactionId)
    .select(RESERVATION_DEPOSIT_MARK_PAID_TRANSACTION_SELECT)
    .maybeSingle()

  if (
    updateResult.error &&
    (isMissingColumnError(updateResult.error, 'reservation_proof_uploaded_at') ||
      isMissingColumnError(updateResult.error, 'reservation_proof_document') ||
      isMissingColumnError(updateResult.error, 'reservation_reviewed_at') ||
      isMissingColumnError(updateResult.error, 'reservation_reviewed_by') ||
      isMissingColumnError(updateResult.error, 'reservation_review_notes'))
  ) {
    const fallbackPatch = { ...patch }
    if (isMissingColumnError(updateResult.error, 'reservation_proof_uploaded_at')) {
      delete fallbackPatch.reservation_proof_uploaded_at
    }
    if (isMissingColumnError(updateResult.error, 'reservation_proof_document')) {
      delete fallbackPatch.reservation_proof_document
    }
    if (isMissingColumnError(updateResult.error, 'reservation_reviewed_at')) {
      delete fallbackPatch.reservation_reviewed_at
    }
    if (isMissingColumnError(updateResult.error, 'reservation_reviewed_by')) {
      delete fallbackPatch.reservation_reviewed_by
    }
    if (isMissingColumnError(updateResult.error, 'reservation_review_notes')) {
      delete fallbackPatch.reservation_review_notes
    }

    updateResult = await client
      .from('transactions')
      .update(fallbackPatch)
      .eq('id', transactionId)
      .select(RESERVATION_DEPOSIT_MARK_PAID_FALLBACK_SELECT)
      .maybeSingle()
  }

  if (updateResult.error) {
    throw updateResult.error
  }

  return updateResult.data || (await readTransactionForReservationDepositMarkPaid(client, transactionId))
}

async function markReservationProofRequirementUnderReviewIfPossible(
  client,
  { transactionId, documentId, nowIso } = {},
) {
  const normalizedDocumentId = normalizeNullableUuid(documentId)
  if (!transactionId || !normalizedDocumentId) {
    return null
  }

  const payload = {
    status: 'under_review',
    is_uploaded: true,
    uploaded_document_id: normalizedDocumentId,
    uploaded_at: nowIso,
    updated_at: nowIso,
  }

  let updateResult = await client
    .from('transaction_required_documents')
    .update(payload)
    .eq('transaction_id', transactionId)
    .eq('document_key', RESERVATION_DEPOSIT_PROOF_DOCUMENT_KEY)

  if (
    updateResult.error &&
    (isMissingColumnError(updateResult.error, 'status') ||
      isMissingColumnError(updateResult.error, 'uploaded_document_id') ||
      isMissingColumnError(updateResult.error, 'uploaded_at'))
  ) {
    updateResult = await client
      .from('transaction_required_documents')
      .update({
        is_uploaded: true,
        updated_at: nowIso,
      })
      .eq('transaction_id', transactionId)
      .eq('document_key', RESERVATION_DEPOSIT_PROOF_DOCUMENT_KEY)
  }

  if (updateResult.error) {
    if (
      isMissingTableError(updateResult.error, 'transaction_required_documents') ||
      isMissingSchemaError(updateResult.error)
    ) {
      return null
    }
    throw updateResult.error
  }

  return {
    transactionId,
    documentId: normalizedDocumentId,
    documentKey: RESERVATION_DEPOSIT_PROOF_DOCUMENT_KEY,
    status: 'under_review',
  }
}

export async function markTransactionReservationDepositPaid({
  transactionId,
  reason = '',
  paidDate = '',
  amount = null,
  reference = '',
  proofDocumentId = '',
  proofUploadedAt = '',
  actorRole = 'developer',
  actorUserId = null,
  source = RESERVATION_DEPOSIT_MARK_PAID_SOURCE,
  metadata = {},
  client: suppliedClient = null,
} = {}) {
  const client = suppliedClient || requireClient()
  const normalizedTransactionId = normalizeNullableUuid(transactionId)
  if (!normalizedTransactionId) {
    throw new Error('Transaction is required.')
  }

  const actorProfile = await resolveActiveProfileContext(client)
  const effectiveActorUserId = normalizeNullableUuid(actorUserId || actorProfile.userId)
  const effectiveActorRole = normalizeRoleType(actorRole || actorProfile.role || 'developer')
  const transaction = await readTransactionForReservationDepositMarkPaid(client, normalizedTransactionId)

  if (!transaction) {
    throw new Error('Transaction not found.')
  }

  const reservationState = resolveReservationDepositPaymentReviewState(transaction)
  if (!reservationState.required) {
    throw new Error('Reservation deposit is not required for this transaction.')
  }
  if (reservationState.verified) {
    throw new Error('Reservation deposit is already verified.')
  }

  const nowIso = new Date().toISOString()
  const overrideResult = buildReservationDepositMarkPaidOverrideRow({
    transaction,
    transactionId: normalizedTransactionId,
    organisationId: transaction.organisation_id,
    reason,
    paidDate,
    amount,
    reference,
    proofDocumentId,
    proofUploadedAt,
    actorUserId: effectiveActorUserId,
    source,
    metadata,
    now: nowIso,
  })

  if (!overrideResult.valid) {
    const details = overrideResult.errors.map((error) => `${error.field}:${error.code}`).join(', ')
    throw new Error(`Reservation deposit paid override is invalid${details ? ` (${details})` : ''}.`)
  }

  const override = await insertJourneyStageOverride(client, overrideResult.row)
  const patch = buildReservationDepositMarkPaidTransactionPatch({
    paidDate,
    proofDocumentId,
    proofUploadedAt,
    now: nowIso,
  })
  const updatedTransaction = await updateReservationDepositPaidState(client, {
    transactionId: normalizedTransactionId,
    patch,
  })
  const proofRequirement = await markReservationProofRequirementUnderReviewIfPossible(client, {
    transactionId: normalizedTransactionId,
    documentId: proofDocumentId,
    nowIso,
  })

  await logTransactionEventIfPossible(client, {
    transactionId: normalizedTransactionId,
    eventType: 'TransactionUpdated',
    createdBy: effectiveActorUserId,
    createdByRole: effectiveActorRole,
    eventData: {
      source: normalizeTextValue(source) || RESERVATION_DEPOSIT_MARK_PAID_SOURCE,
      journeyOverrideId: override?.id || null,
      reservationStatus: 'paid',
      proofDocumentId: normalizeNullableUuid(proofDocumentId),
      proofRequirementStatus: proofRequirement?.status || null,
      verificationRequired: true,
    },
  })

  return {
    transaction: updatedTransaction,
    override,
    proofRequirement,
    reservation: resolveReservationDepositPaymentReviewState(updatedTransaction),
    notificationMode: 'internal_only',
  }
}

async function invokeReservationDepositEmailEdgeFunction(
  client,
  {
    transactionId,
    forceResend = false,
    source = 'reservation_deposit_request',
    actorRole = 'developer',
    actorUserId = null,
  } = {},
) {
  const { data, error } = await invokeEdgeFunction('send-email', {
    client,
    body: {
      type: 'reservation_deposit',
      transactionId,
      resend: Boolean(forceResend),
      source,
      actorRole,
      actorUserId,
    },
  })

  if (error) {
    throw error
  }

  return (
    data || {
      ok: true,
      type: 'reservation_deposit',
      sent: false,
      reason: 'unknown',
      transactionId,
    }
  )
}

export async function sendReservationDepositRequest({
  transactionId,
  forceResend = false,
  source = 'reservation_deposit_manual_request',
} = {}) {
  const client = requireClient()
  const actorProfile = await resolveActiveProfileContext(client)

  return invokeReservationDepositEmailEdgeFunction(client, {
    transactionId,
    forceResend: Boolean(forceResend),
    source,
    actorRole: normalizeRoleType(actorProfile.role || 'developer'),
    actorUserId: actorProfile.userId || null,
  })
}
