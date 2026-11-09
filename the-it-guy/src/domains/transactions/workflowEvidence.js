// transactions owns these operations and their existing recovery behavior.
import { logTransactionEventIfPossible } from './eventActions.js'
import { normalizeNullableUuid, normalizeNullableText, isMissingTableError, isMissingSchemaError } from '../../lib/api/shared/readHelpers.js'
import { TRANSACTION_LIFECYCLE_STAGE_LABELS, normalizePersistedTransactionLifecycleStage, PERSISTED_TRANSACTION_LIFECYCLE_STAGES } from '../../core/transactions/transactionLifecycle'

export async function upsertTransactionLifecycleWorkflow(
  client,
  { transactionId, currentStage, status = 'active', actorUserId = null, source = 'system', note = '', preserveLaterStage = false } = {},
) {
  if (!transactionId || !currentStage) {
    return null
  }

  const normalizedStage = normalizePersistedTransactionLifecycleStage(currentStage)
  const normalizedStatus = ['active', 'completed', 'blocked'].includes(String(status || '').toLowerCase())
    ? String(status).toLowerCase()
    : 'active'
  const now = new Date().toISOString()

  const existing = await client
    .from('transaction_lifecycle_workflows')
    .select('id, transaction_id, current_stage, status')
    .eq('transaction_id', transactionId)
    .maybeSingle()

  if (existing.error) {
    if (isMissingTableError(existing.error, 'transaction_lifecycle_workflows') || isMissingSchemaError(existing.error))
      return null
    throw existing.error
  }

  if (preserveLaterStage && existing.data && (existing.data.status === 'completed' ||
    PERSISTED_TRANSACTION_LIFECYCLE_STAGES.indexOf(existing.data.current_stage) > PERSISTED_TRANSACTION_LIFECYCLE_STAGES.indexOf(normalizedStage))) return existing.data

  const payload = {
    transaction_id: transactionId,
    current_stage: normalizedStage,
    status: normalizedStatus,
    last_updated_by: actorUserId || null,
    last_updated_at: now,
    completed_at: normalizedStatus === 'completed' ? now : null,
    updated_at: now,
  }

  const result = existing.data?.id
    ? await client
        .from('transaction_lifecycle_workflows')
        .update(payload)
        .eq('id', existing.data.id)
        .select(
          'id, transaction_id, current_stage, status, last_updated_by, last_updated_at, completed_at, created_at, updated_at',
        )
        .single()
    : await client
        .from('transaction_lifecycle_workflows')
        .insert({ ...payload, created_at: now })
        .select(
          'id, transaction_id, current_stage, status, last_updated_by, last_updated_at, completed_at, created_at, updated_at',
        )
        .single()

  if (result.error) {
    if (isMissingTableError(result.error, 'transaction_lifecycle_workflows') || isMissingSchemaError(result.error))
      return null
    throw result.error
  }

  if (existing.data?.current_stage !== normalizedStage || existing.data?.status !== normalizedStatus) {
    const label = TRANSACTION_LIFECYCLE_STAGE_LABELS[normalizedStage] || normalizedStage.replace(/_/g, ' ')
    await logTransactionEventIfPossible(client, {
      transactionId,
      eventType:
        normalizedStatus === 'completed' ? 'TransactionLifecycleCompleted' : 'TransactionLifecycleStageChanged',
      createdBy: actorUserId || null,
      eventData: {
        source,
        note: normalizeNullableText(note),
        fromStage: existing.data?.current_stage || null,
        toStage: normalizedStage,
        status: normalizedStatus,
        message:
          normalizedStatus === 'completed'
            ? 'Transaction lifecycle completed'
            : `Transaction lifecycle moved to ${label}`,
      },
    })
  }

  return result.data
}

export async function attemptPromotePendingSellerDocumentsIfPossible(client, listingId) {
  const normalizedListingId = normalizeNullableUuid(listingId)
  if (!normalizedListingId) {
    return null
  }

  const result = await client.rpc('bridge_promote_pending_private_listing_documents', {
    p_private_listing_id: normalizedListingId,
  })

  if (result.error) {
    const message = String(result.error.message || result.error.error || '')
    if (message.includes('bridge_promote_pending_private_listing_documents')) {
      return null
    }
    console.warn('Pending seller document promotion skipped', {
      listingId: normalizedListingId,
      error: result.error,
    })
    return null
  }

  return result.data || null
}
