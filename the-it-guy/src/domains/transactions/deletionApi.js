// transactions owns these operations and their existing recovery behavior.
import { logTransactionEventIfPossible } from './eventActions.js'
import { resolveActiveProfileContext } from '../access/actorContext.js'
import { normalizeStage } from '../../core/transactions/legacyReadModel.js'
import { requireClient, isMissingTableError, isMissingColumnError, isMissingSchemaError, isPermissionDeniedError } from '../../lib/api/shared/readHelpers.js'
import { normalizeRoleType } from '../../core/transactions/permissions'

export async function deleteTransactionEverywhere({ transactionId, unitId } = {}) {
  const client = requireClient()
  const actorProfile = await resolveActiveProfileContext(client)
  const actorRole = normalizeRoleType(actorProfile.role || 'developer')

  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  const now = new Date().toISOString()
  const shouldIgnoreCleanupError = (error, tableName = '') => {
    if (!error) {
      return false
    }

    if (isMissingSchemaError(error) || isPermissionDeniedError(error)) {
      return true
    }

    if (isMissingColumnError(error, 'transaction_id') || isMissingColumnError(error, 'updated_at')) {
      return true
    }

    if (tableName && isMissingTableError(error, tableName)) {
      return true
    }

    return false
  }
  const extractBlockingTableName = (error) => {
    const detailText = [error?.details, error?.message, error?.hint].filter(Boolean).join(' ')
    const matchedTable =
      detailText.match(/table\s+"([^"]+)"/i)?.[1] || detailText.match(/relation\s+"([^"]+)"/i)?.[1] || null

    return matchedTable ? matchedTable.trim() : null
  }

  let transactionQuery = await client
    .from('transactions')
    .select('id, unit_id, buyer_id, stage, is_active')
    .eq('id', transactionId)
    .maybeSingle()

  if (transactionQuery.error && isMissingColumnError(transactionQuery.error, 'is_active')) {
    transactionQuery = await client
      .from('transactions')
      .select('id, unit_id, buyer_id, stage')
      .eq('id', transactionId)
      .maybeSingle()
  }

  if (transactionQuery.error) {
    throw transactionQuery.error
  }

  const transaction = transactionQuery.data
  if (!transaction) {
    throw new Error('Transaction not found.')
  }

  const resolvedUnitId = transaction.unit_id || unitId || null
  let transactionIdsToDeactivate = [transactionId]

  if (resolvedUnitId) {
    let transactionsForUnitQuery = await client
      .from('transactions')
      .select('id, stage, is_active')
      .eq('unit_id', resolvedUnitId)

    if (transactionsForUnitQuery.error && isMissingColumnError(transactionsForUnitQuery.error, 'is_active')) {
      transactionsForUnitQuery = await client.from('transactions').select('id, stage').eq('unit_id', resolvedUnitId)
    }

    if (transactionsForUnitQuery.error) {
      throw transactionsForUnitQuery.error
    }

    transactionIdsToDeactivate = [
      ...new Set([
        transactionId,
        ...(transactionsForUnitQuery.data || [])
          .filter((row) => {
            const stage = normalizeStage(row?.stage, null)
            if (row?.id === transactionId) {
              return true
            }
            if (row?.is_active === true) {
              return true
            }
            return stage && stage !== 'Available'
          })
          .map((row) => row.id)
          .filter(Boolean),
      ]),
    ]
  }

  const transactionUpdate = await client
    .from('transactions')
    .update({
      is_active: false,
      stage: 'Available',
      current_main_stage: 'AVAIL',
      current_sub_stage_summary: null,
      next_action: 'Transaction deleted and unit reset to available.',
      comment: 'Transaction deleted and unit reset to available.',
      updated_at: now,
    })
    .in('id', transactionIdsToDeactivate)

  if (
    transactionUpdate.error &&
    (isMissingColumnError(transactionUpdate.error, 'comment') ||
      isMissingColumnError(transactionUpdate.error, 'next_action'))
  ) {
    const fallbackUpdate = await client
      .from('transactions')
      .update({
        is_active: false,
        stage: 'Available',
        updated_at: now,
      })
      .in('id', transactionIdsToDeactivate)

    if (fallbackUpdate.error && isMissingColumnError(fallbackUpdate.error, 'is_active')) {
      const legacyFallback = await client
        .from('transactions')
        .update({
          stage: 'Available',
          updated_at: now,
        })
        .in('id', transactionIdsToDeactivate)

      if (legacyFallback.error) {
        throw legacyFallback.error
      }
    } else if (fallbackUpdate.error) {
      throw fallbackUpdate.error
    }
  } else if (transactionUpdate.error && isMissingColumnError(transactionUpdate.error, 'is_active')) {
    const fallbackUpdate = await client
      .from('transactions')
      .update({
        stage: 'Available',
        updated_at: now,
      })
      .in('id', transactionIdsToDeactivate)

    if (fallbackUpdate.error) {
      throw fallbackUpdate.error
    }
  } else if (
    transactionUpdate.error &&
    (isMissingColumnError(transactionUpdate.error, 'current_main_stage') ||
      isMissingColumnError(transactionUpdate.error, 'current_sub_stage_summary'))
  ) {
    const fallbackUpdate = await client
      .from('transactions')
      .update({
        is_active: false,
        stage: 'Available',
        next_action: 'Transaction deleted and unit reset to available.',
        updated_at: now,
      })
      .in('id', transactionIdsToDeactivate)

    if (fallbackUpdate.error && isMissingColumnError(fallbackUpdate.error, 'is_active')) {
      const legacyFallback = await client
        .from('transactions')
        .update({
          stage: 'Available',
          updated_at: now,
        })
        .in('id', transactionIdsToDeactivate)

      if (legacyFallback.error) {
        throw legacyFallback.error
      }
    } else if (fallbackUpdate.error) {
      throw fallbackUpdate.error
    }
  } else if (transactionUpdate.error) {
    throw transactionUpdate.error
  }

  if (resolvedUnitId) {
    const unitUpdate = await client.from('units').update({ status: 'Available' }).eq('id', resolvedUnitId)
    if (unitUpdate.error) {
      throw unitUpdate.error
    }
  }

  const deactivateOptional = async (tableName) => {
    let result = await client
      .from(tableName)
      .update({ is_active: false, updated_at: now })
      .in('transaction_id', transactionIdsToDeactivate)

    if (result?.error && isMissingColumnError(result.error, 'updated_at')) {
      result = await client
        .from(tableName)
        .update({ is_active: false })
        .in('transaction_id', transactionIdsToDeactivate)
    }

    if (result?.error && isMissingColumnError(result.error, 'is_active')) {
      result = await client.from(tableName).delete().in('transaction_id', transactionIdsToDeactivate)
    }

    if (result?.error && !shouldIgnoreCleanupError(result.error, tableName)) {
      throw result.error
    }
  }

  const clearOptionalTransactionReference = async (tableName) => {
    let result = await client
      .from(tableName)
      .update({ transaction_id: null, updated_at: now })
      .in('transaction_id', transactionIdsToDeactivate)

    if (result?.error && isMissingColumnError(result.error, 'updated_at')) {
      result = await client
        .from(tableName)
        .update({ transaction_id: null })
        .in('transaction_id', transactionIdsToDeactivate)
    }

    if (result?.error && !shouldIgnoreCleanupError(result.error, tableName)) {
      throw result.error
    }
  }

  const deleteOptionalByTransaction = async (tableName) => {
    const result = await client.from(tableName).delete().in('transaction_id', transactionIdsToDeactivate)
    if (result.error && !shouldIgnoreCleanupError(result.error, tableName)) {
      throw result.error
    }
  }

  await deactivateOptional('transaction_onboarding')
  await deactivateOptional('transaction_status_links')
  await deactivateOptional('client_portal_links')

  await deleteOptionalByTransaction('transaction_onboarding')
  await deleteOptionalByTransaction('transaction_status_links')
  await deleteOptionalByTransaction('client_portal_links')
  await deleteOptionalByTransaction('onboarding_form_data')
  await deleteOptionalByTransaction('transaction_required_documents')
  await deleteOptionalByTransaction('transaction_comments')
  await deleteOptionalByTransaction('transaction_proxy_updates')
  await deleteOptionalByTransaction('transaction_finance_details')
  await deleteOptionalByTransaction('transaction_financial_records')
  await deleteOptionalByTransaction('transaction_funding_sources')
  await deleteOptionalByTransaction('transaction_attorney_closeouts')
  await deleteOptionalByTransaction('transaction_bond_closeouts')
  await deleteOptionalByTransaction('transaction_attorney_closeout_documents')
  await deleteOptionalByTransaction('transaction_bond_closeout_documents')
  await deleteOptionalByTransaction('transaction_participants')
  await deleteOptionalByTransaction('transaction_readiness_states')
  await deleteOptionalByTransaction('transaction_handover')
  await deleteOptionalByTransaction('trust_investment_forms')
  await deleteOptionalByTransaction('documents')
  await deleteOptionalByTransaction('notes')
  await deleteOptionalByTransaction('client_issues')
  await deleteOptionalByTransaction('transaction_notifications')
  await deleteOptionalByTransaction('transaction_events')
  await deleteOptionalByTransaction('transaction_external_access')

  await clearOptionalTransactionReference('alteration_requests')
  await clearOptionalTransactionReference('service_reviews')

  const subprocessResult = await client
    .from('transaction_subprocesses')
    .select('id')
    .in('transaction_id', transactionIdsToDeactivate)

  if (subprocessResult.error && !isMissingSchemaError(subprocessResult.error)) {
    throw subprocessResult.error
  }

  const subprocessIds = (subprocessResult.data || []).map((row) => row.id).filter(Boolean)
  if (subprocessIds.length) {
    const stepDelete = await client.from('transaction_subprocess_steps').delete().in('subprocess_id', subprocessIds)
    if (stepDelete.error && !isMissingSchemaError(stepDelete.error)) {
      throw stepDelete.error
    }
  }

  const subprocessDelete = await client
    .from('transaction_subprocesses')
    .delete()
    .in('transaction_id', transactionIdsToDeactivate)
  if (subprocessDelete.error && !shouldIgnoreCleanupError(subprocessDelete.error, 'transaction_subprocesses')) {
    throw subprocessDelete.error
  }

  try {
    await logTransactionEventIfPossible(client, {
      transactionId,
      eventType: 'TransactionUpdated',
      createdBy: actorProfile.userId || null,
      createdByRole: actorRole,
      eventData: {
        automation: 'TransactionDeleted',
        unitId: resolvedUnitId,
        previousStage: transaction.stage || null,
        resetToStatus: 'Available',
        deletedTransactionIds: transactionIdsToDeactivate,
      },
    })
  } catch (error) {
    if (!isMissingSchemaError(error) && !isPermissionDeniedError(error)) {
      throw error
    }
  }

  const externalAccessUpdate = await client
    .from('transaction_external_access')
    .update({ revoked: true, updated_at: now })
    .in('transaction_id', transactionIdsToDeactivate)

  if (externalAccessUpdate.error && isMissingColumnError(externalAccessUpdate.error, 'updated_at')) {
    const revokeFallback = await client
      .from('transaction_external_access')
      .update({ revoked: true })
      .in('transaction_id', transactionIdsToDeactivate)

    if (revokeFallback.error && isMissingColumnError(revokeFallback.error, 'revoked')) {
      const deleteFallback = await client
        .from('transaction_external_access')
        .delete()
        .in('transaction_id', transactionIdsToDeactivate)
      if (deleteFallback.error && !shouldIgnoreCleanupError(deleteFallback.error, 'transaction_external_access')) {
        throw deleteFallback.error
      }
    } else if (revokeFallback.error && !shouldIgnoreCleanupError(revokeFallback.error, 'transaction_external_access')) {
      throw revokeFallback.error
    }
  } else if (externalAccessUpdate.error && isMissingColumnError(externalAccessUpdate.error, 'revoked')) {
    const deleteFallback = await client
      .from('transaction_external_access')
      .delete()
      .in('transaction_id', transactionIdsToDeactivate)
    if (deleteFallback.error && !shouldIgnoreCleanupError(deleteFallback.error, 'transaction_external_access')) {
      throw deleteFallback.error
    }
  } else if (
    externalAccessUpdate.error &&
    !shouldIgnoreCleanupError(externalAccessUpdate.error, 'transaction_external_access')
  ) {
    throw externalAccessUpdate.error
  }

  let hardDeleted = false
  let hardDeleteError = null
  const blockingTablesAttempted = new Set()

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const hardDeleteResult = await client.from('transactions').delete().in('id', transactionIdsToDeactivate)
    if (!hardDeleteResult.error || isMissingSchemaError(hardDeleteResult.error)) {
      hardDeleted = true
      hardDeleteError = null
      break
    }

    if (hardDeleteResult.error.code !== '23503') {
      throw hardDeleteResult.error
    }

    hardDeleteError = hardDeleteResult.error
    const blockingTable = extractBlockingTableName(hardDeleteResult.error)
    if (!blockingTable || blockingTablesAttempted.has(blockingTable)) {
      break
    }

    blockingTablesAttempted.add(blockingTable)

    let clearingResult = await client.from(blockingTable).delete().in('transaction_id', transactionIdsToDeactivate)
    if (clearingResult.error && isMissingColumnError(clearingResult.error, 'transaction_id')) {
      clearingResult = await client
        .from(blockingTable)
        .update({ transaction_id: null, updated_at: now })
        .in('transaction_id', transactionIdsToDeactivate)

      if (clearingResult.error && isMissingColumnError(clearingResult.error, 'updated_at')) {
        clearingResult = await client
          .from(blockingTable)
          .update({ transaction_id: null })
          .in('transaction_id', transactionIdsToDeactivate)
      }
    }

    if (clearingResult.error && !shouldIgnoreCleanupError(clearingResult.error, blockingTable)) {
      break
    }
  }

  if (!hardDeleted && hardDeleteError && hardDeleteError.code !== '23503') {
    throw hardDeleteError
  }

  return {
    transactionId,
    unitId: resolvedUnitId,
    deactivatedTransactionIds: transactionIdsToDeactivate,
    hardDeleted,
    warning:
      !hardDeleted && hardDeleteError
        ? `Hard delete skipped while dependent records were being cleaned up. Transaction was reset to Available and removed from active views.`
        : null,
    unitStatus: resolvedUnitId ? 'Available' : null,
    success: true,
  }
}

export async function rollbackTransaction(args = {}) {
  return deleteTransactionEverywhere(args)
}
