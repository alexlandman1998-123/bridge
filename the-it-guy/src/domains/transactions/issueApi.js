// transactions owns these operations and their existing recovery behavior.
import { logTransactionEventIfPossible } from './eventActions.js'
import { resolveActiveProfileContext } from '../access/actorContext.js'
import { loadTransactionIssueOverridesByIds, normalizeIssueOverrideRow, normalizeIssueTypeValue } from './readinessReadApi.js'
import { normalizeNullableText, normalizeOptionalDate, requireClient, isMissingTableError, isMissingColumnError } from '../../lib/api/shared/readHelpers.js'

export async function fetchTransactionIssueOverrides(transactionId) {
  const client = requireClient()
  if (!transactionId) return []
  const result = await loadTransactionIssueOverridesByIds(client, [transactionId])
  return result[transactionId] || []
}

export async function upsertTransactionIssueOverride({
  transactionId,
  issueType,
  overrideReason = null,
  resolveBy = null,
  isActive = true,
} = {}) {
  const client = requireClient()
  if (!transactionId) {
    throw new Error('Transaction is required.')
  }
  if (!issueType) {
    throw new Error('Issue type is required.')
  }

  const actor = await resolveActiveProfileContext(client)
  const normalizedIssueType = normalizeIssueTypeValue(issueType)
  const now = new Date().toISOString()
  const payload = {
    transaction_id: transactionId,
    issue_type: normalizedIssueType,
    overridden_by: actor.userId || null,
    override_reason: normalizeNullableText(overrideReason),
    resolve_by: normalizeOptionalDate(resolveBy),
    is_active: Boolean(isActive),
    updated_at: now,
  }

  let upsert = await client
    .from('transaction_issue_overrides')
    .upsert(payload, { onConflict: 'transaction_id,issue_type' })
    .select(
      'id, transaction_id, issue_type, overridden_by, override_reason, resolve_by, is_active, created_at, updated_at',
    )
    .single()

  if (
    upsert.error &&
    (isMissingColumnError(upsert.error, 'override_reason') ||
      isMissingColumnError(upsert.error, 'resolve_by') ||
      isMissingColumnError(upsert.error, 'is_active') ||
      isMissingColumnError(upsert.error, 'updated_at'))
  ) {
    upsert = await client
      .from('transaction_issue_overrides')
      .upsert(
        {
          transaction_id: transactionId,
          issue_type: normalizedIssueType,
          overridden_by: actor.userId || null,
        },
        { onConflict: 'transaction_id,issue_type' },
      )
      .select('id, transaction_id, issue_type, overridden_by, created_at')
      .single()
  }

  if (upsert.error) {
    if (isMissingTableError(upsert.error, 'transaction_issue_overrides')) {
      throw new Error('Issue override tables are not set up yet. Run sql/schema.sql and refresh.')
    }
    throw upsert.error
  }

  await logTransactionEventIfPossible(client, {
    transactionId,
    eventType: 'TransactionUpdated',
    createdBy: actor.userId || null,
    createdByRole: actor.role || null,
    eventData: {
      source: 'issue_override_updated',
      issueType: normalizedIssueType,
      isActive: Boolean(isActive),
      resolveBy: payload.resolve_by,
    },
  })

  return normalizeIssueOverrideRow(upsert.data)
}
