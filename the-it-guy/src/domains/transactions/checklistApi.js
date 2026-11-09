// transactions owns these operations and their existing recovery behavior.
import { logTransactionEventIfPossible, publishWorkflowChangedIfPossible } from './eventActions.js'
import { resolveActiveProfileContext } from '../access/actorContext.js'
import { fetchTransactionRowById } from './workspaceReadApi.js'
import { normalizeChecklistItemStatusValue, loadTransactionChecklistItemsByIds, normalizeChecklistItemRow, normalizeAttorneyStageValue } from './readinessReadApi.js'
import { normalizeNullableText, requireClient, isMissingTableError, isMissingColumnError, normalizeTextValue } from '../../lib/api/shared/readHelpers.js'
import { normalizeDocumentRequestPriorityValue, normalizeRequestRoleScope } from '../documents/requirementReadModel.js'
import { buildDefaultChecklistItemsForStage, resolveAttorneyOperationalStageKey } from '../../core/transactions/attorneyOperationalEngine'
import { blockOperationalChecklistItem as blockOperationalChecklistItemService, completeOperationalChecklistItem as completeOperationalChecklistItemService, getOperationalChecklistForRole as getOperationalChecklistForRoleService, getOperationalChecklistForTransaction as getOperationalChecklistForTransactionService, syncOperationalChecklistForLane as syncOperationalChecklistForLaneService, syncOperationalChecklistForTransaction as syncOperationalChecklistForTransactionService } from '../../services/transactionOperationalChecklistService'
import { syncOperationalChecklistSafely } from './subprocessApi.js'

export async function fetchTransactionChecklistItems(transactionId) {
  const client = requireClient()
  if (!transactionId) return []
  const result = await loadTransactionChecklistItemsByIds(client, [transactionId])
  return result[transactionId] || []
}

export async function syncOperationalChecklistForTransaction(transactionId) {
  const result = await syncOperationalChecklistForTransactionService(transactionId)
  return result || { items: [], warnings: [], insertedCount: 0, updatedCount: 0 }
}

export async function syncOperationalChecklistForLane(transactionId, laneKey) {
  const result = await syncOperationalChecklistForLaneService(transactionId, laneKey)
  return result || { items: [], warnings: [], insertedCount: 0, updatedCount: 0 }
}

export async function getOperationalChecklistForTransaction(transactionId) {
  return getOperationalChecklistForTransactionService(transactionId)
}

export async function getOperationalChecklistForRole(transactionId, role) {
  return getOperationalChecklistForRoleService(transactionId, role)
}

export async function completeOperationalChecklistItem(itemId, payload = {}) {
  return completeOperationalChecklistItemService(itemId, payload)
}

export async function blockOperationalChecklistItem(itemId, reason = '', options = {}) {
  return blockOperationalChecklistItemService(itemId, reason, options)
}

export async function ensureTransactionChecklistItems({ transactionId, stageKey = null } = {}) {
  const client = requireClient()
  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  const transaction = await fetchTransactionRowById(client, transactionId)
  if (!transaction) {
    return []
  }

  await syncOperationalChecklistSafely(transactionId)

  const activeStage = normalizeAttorneyStageValue(
    stageKey || resolveAttorneyOperationalStageKey({ transaction }),
    'instruction_received',
  )
  const existingByTransaction = await loadTransactionChecklistItemsByIds(client, [transactionId])
  const existingItems = existingByTransaction[transactionId] || []
  const existingForStage = existingItems.filter((item) => item.stage === activeStage)

  if (existingForStage.length) {
    return existingItems
  }

  const defaults = buildDefaultChecklistItemsForStage({
    transactionId,
    stageKey: activeStage,
  })

  if (!defaults.length) {
    return existingItems
  }

  const now = new Date().toISOString()
  const insertRows = defaults.map((item) => ({
    transaction_id: transactionId,
    stage: normalizeAttorneyStageValue(item.stage),
    label: normalizeTextValue(item.label),
    description: normalizeNullableText(item.description),
    status: normalizeChecklistItemStatusValue(item.status),
    priority: normalizeDocumentRequestPriorityValue(item.priority),
    owner_role: normalizeRequestRoleScope(item.ownerRole, 'attorney'),
    owner_user_id: item.ownerUserId || null,
    linked_document_request_id: item.linkedDocumentRequestId || null,
    linked_document_id: item.linkedDocumentId || null,
    auto_rule_key: normalizeNullableText(item.autoRuleKey),
    is_auto_managed: Boolean(item.isAutoManaged),
    sort_order: Number(item.sortOrder || 0) || 0,
    created_at: now,
    updated_at: now,
  }))

  let insert = await client
    .from('transaction_checklist_items')
    .insert(insertRows)
    .select(
      'id, transaction_id, stage, label, description, status, priority, owner_role, owner_user_id, linked_document_request_id, linked_document_id, auto_rule_key, is_auto_managed, completed_by, completed_at, overridden_by, override_reason, sort_order, created_at, updated_at',
    )

  if (
    insert.error &&
    (isMissingColumnError(insert.error, 'owner_user_id') ||
      isMissingColumnError(insert.error, 'linked_document_request_id') ||
      isMissingColumnError(insert.error, 'linked_document_id') ||
      isMissingColumnError(insert.error, 'auto_rule_key') ||
      isMissingColumnError(insert.error, 'is_auto_managed') ||
      isMissingColumnError(insert.error, 'updated_at'))
  ) {
    insert = await client
      .from('transaction_checklist_items')
      .insert(
        insertRows.map((item) => ({
          transaction_id: item.transaction_id,
          stage: item.stage,
          label: item.label,
          description: item.description,
          status: item.status,
          priority: item.priority,
          owner_role: item.owner_role,
          sort_order: item.sort_order,
          created_at: item.created_at,
        })),
      )
      .select(
        'id, transaction_id, stage, label, description, status, priority, owner_role, completed_at, sort_order, created_at',
      )
  }

  if (insert.error) {
    if (isMissingTableError(insert.error, 'transaction_checklist_items')) {
      return existingItems
    }
    throw insert.error
  }

  const normalizedInserted = (insert.data || []).map((item) => normalizeChecklistItemRow(item))
  await logTransactionEventIfPossible(client, {
    transactionId,
    eventType: 'WorkflowStepUpdated',
    eventData: {
      source: 'checklist_seeded',
      stage: activeStage,
      count: normalizedInserted.length,
    },
  })

  return [...existingItems, ...normalizedInserted]
}

export async function updateTransactionChecklistItem({ checklistItemId, status, overrideReason = null } = {}) {
  const client = requireClient()
  if (!checklistItemId) throw new Error('Checklist item id is required.')
  const actor = await resolveActiveProfileContext(client)
  const normalizedStatus = normalizeChecklistItemStatusValue(status)
  const now = new Date().toISOString()

  const payload = {
    status: normalizedStatus,
    completed_at: normalizedStatus === 'completed' ? now : null,
    completed_by: normalizedStatus === 'completed' ? actor.userId || null : null,
    overridden_by: ['waived', 'blocked'].includes(normalizedStatus) ? actor.userId || null : null,
    override_reason: ['waived', 'blocked'].includes(normalizedStatus) ? normalizeNullableText(overrideReason) : null,
    updated_at: now,
  }

  let update = await client
    .from('transaction_checklist_items')
    .update(payload)
    .eq('id', checklistItemId)
    .select(
      'id, transaction_id, stage, label, description, status, priority, owner_role, owner_user_id, linked_document_request_id, linked_document_id, auto_rule_key, is_auto_managed, completed_by, completed_at, overridden_by, override_reason, sort_order, created_at, updated_at',
    )
    .single()

  if (
    update.error &&
    (isMissingColumnError(update.error, 'completed_by') ||
      isMissingColumnError(update.error, 'overridden_by') ||
      isMissingColumnError(update.error, 'override_reason') ||
      isMissingColumnError(update.error, 'updated_at'))
  ) {
    update = await client
      .from('transaction_checklist_items')
      .update({ status: normalizedStatus })
      .eq('id', checklistItemId)
      .select(
        'id, transaction_id, stage, label, description, status, priority, owner_role, completed_at, sort_order, created_at',
      )
      .single()
  }

  if (update.error) {
    if (isMissingTableError(update.error, 'transaction_checklist_items')) {
      throw new Error('Checklist tables are not set up yet. Run sql/schema.sql and refresh.')
    }
    throw update.error
  }

  await logTransactionEventIfPossible(client, {
    transactionId: update.data?.transaction_id || null,
    eventType: 'WorkflowStepUpdated',
    createdBy: actor.userId || null,
    createdByRole: actor.role || null,
    eventData: {
      source: 'checklist_item_updated',
      checklistItemId,
      status: normalizedStatus,
    },
  })

  await publishWorkflowChangedIfPossible(client, {
    transactionId: update.data?.transaction_id || null,
    triggerType: 'checklist_item',
    triggerId: checklistItemId,
    reasonCode:
      normalizedStatus === 'completed'
        ? 'checklist_item_completed'
        : normalizedStatus === 'pending'
          ? 'checklist_item_reopened'
          : normalizedStatus === 'blocked'
            ? 'checklist_item_blocked'
            : `checklist_item_${normalizedStatus}`,
    userId: actor.userId || null,
    source: 'checklist_item_update',
    payload: {
      checklistItemId,
      status: normalizedStatus,
      overrideReason: normalizeNullableText(overrideReason),
    },
  })

  return normalizeChecklistItemRow(update.data)
}
