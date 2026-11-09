// transactions owns these operations and their existing recovery behavior.
import { logTransactionEventIfPossible } from './eventActions.js'
import { resolveActiveProfileContext } from '../access/actorContext.js'
import { normalizeTransactionProxyUpdateRow, normalizeProxyUpdateTargetRole, normalizeProxyUpdateWorkflowArea, getProxyUpdateTargetRoleLabel } from './activityReadApi.js'
import { normalizeNullableText, requireClient, isMissingTableError, isMissingColumnError, isMissingSchemaError } from '../../lib/api/shared/readHelpers.js'
import { TRANSACTION_ROLE_LABELS } from '../../core/transactions/roleConfig'
import { normalizeRoleType } from '../../core/transactions/permissions'
import { postMatterMessage } from '../../services/matterConversationService.js'
import { DISCUSSION_TYPES, TRANSACTION_DISCUSSION_COLUMNS, TRANSACTION_DISCUSSION_LEGACY_COLUMNS, parseDiscussionMetadata, normalizeDiscussionVisibility, normalizeTransactionCommentRow } from './participantInfrastructure.js'
import { loadSharedDiscussion } from '../bond/financeRead.js'

export async function createNote(transactionId, body, unitId = null) {
  const client = requireClient()

  let insertQuery = await client
    .from('notes')
    .insert({ transaction_id: transactionId, body })
    .select('id, transaction_id, body, created_at')
    .single()

  if (insertQuery.error && isMissingColumnError(insertQuery.error, 'transaction_id') && unitId) {
    insertQuery = await client
      .from('notes')
      .insert({ unit_id: unitId, body })
      .select('id, unit_id, body, created_at')
      .single()
  }

  if (insertQuery.error) {
    throw insertQuery.error
  }

  return insertQuery.data
}

export async function fetchTransactionDiscussion(transactionId, options = {}) {
  const client = options.client || requireClient()
  return loadSharedDiscussion(client, {
    transactionId,
    unitId: options.unitId || null,
    viewer: options.viewer || 'internal',
    includeLegacy: options.includeLegacy !== false,
    limit: options.limit || null,
  })
}

export async function addTransactionDiscussionComment({
  transactionId,
  authorName,
  authorRole = 'developer',
  authorUserId = null,
  authorOrganisationName = '',
  commentText,
  unitId = null,
  developmentId = null,
  organisationId = null,
  visibilityScope = null,
  updateType = null,
  relatedEntityType = null,
  relatedEntityId = null,
  attachmentIds = [],
  isSystemGenerated = false,
  useMatterConversation = false,
  messageCommandId = null,
  client: scopedClient = null,
}) {
  const client = scopedClient || requireClient()

  const normalizedText = String(commentText || '').trim()
  if (!normalizedText) {
    throw new Error('Comment text is required.')
  }

  const normalizedRole = normalizeRoleType(authorRole)
  const normalizedAuthorName =
    normalizeNullableText(authorName) || TRANSACTION_ROLE_LABELS[normalizedRole] || 'Samlin Team'
  const parsedDiscussion = parseDiscussionMetadata(normalizedText)
  const normalizedUpdateType = DISCUSSION_TYPES.includes(
    String(updateType || '')
      .trim()
      .toLowerCase(),
  )
    ? String(updateType || '')
        .trim()
        .toLowerCase()
    : parsedDiscussion.discussionType || 'operational'
  const normalizedVisibilityScope = normalizeDiscussionVisibility(
    visibilityScope,
    parsedDiscussion.visibility || 'shared',
  )
  const normalizedCommentBody = parsedDiscussion.body || normalizedText

  if (useMatterConversation && !isSystemGenerated) {
    const audience = ['client_visible','client_safe','buyer_visible'].includes(normalizedVisibilityScope)
      ? (normalizedVisibilityScope === 'buyer_visible' ? 'buyer' : 'everyone')
      : ['internal','internal_only'].includes(normalizedVisibilityScope) ? 'private' : 'professionals'
    const posted = await postMatterMessage({ transactionId, client, commandId: messageCommandId || crypto.randomUUID(),
      body: normalizedCommentBody, audience })
    return { id: `message:${posted.id}`, transactionId, commentBody: normalizedCommentBody, commentText: normalizedCommentBody }
  }

  const richPayload = {
    transaction_id: transactionId,
    unit_id: unitId || null,
    development_id: developmentId || null,
    organisation_id: organisationId || null,
    author_user_id: authorUserId || null,
    author_name: normalizedAuthorName,
    author_role: normalizedRole,
    author_organisation_name: normalizeNullableText(authorOrganisationName),
    visibility_scope: normalizedVisibilityScope,
    update_type: normalizedUpdateType,
    comment_text: normalizedCommentBody,
    related_entity_type: normalizeNullableText(relatedEntityType),
    related_entity_id: relatedEntityId || null,
    attachment_ids: Array.isArray(attachmentIds) ? attachmentIds : [],
    is_system_generated: Boolean(isSystemGenerated || normalizedUpdateType === 'system'),
  }
  const legacyPayload = {
    transaction_id: transactionId,
    author_name: normalizedAuthorName,
    author_role: normalizedRole,
    comment_text: normalizedCommentBody,
  }

  let insertResult = await client
    .from('transaction_comments')
    .insert(richPayload)
    .select(TRANSACTION_DISCUSSION_COLUMNS)
    .single()

  if (
    insertResult.error &&
    [
      'unit_id',
      'development_id',
      'organisation_id',
      'author_user_id',
      'author_organisation_name',
      'visibility_scope',
      'update_type',
      'related_entity_type',
      'related_entity_id',
      'attachment_ids',
      'is_system_generated',
    ].some((column) => isMissingColumnError(insertResult.error, column))
  ) {
    insertResult = await client
      .from('transaction_comments')
      .insert(legacyPayload)
      .select(TRANSACTION_DISCUSSION_LEGACY_COLUMNS)
      .single()
  }

  if (insertResult.error) {
    if (isMissingTableError(insertResult.error, 'transaction_comments')) {
      const fallback = await createNote(
        transactionId,
        `[${TRANSACTION_ROLE_LABELS[normalizedRole] || normalizedRole}] ${normalizedCommentBody}`,
        unitId,
      )
      await logTransactionEventIfPossible(client, {
        transactionId,
        eventType: 'CommentAdded',
        createdByRole: normalizedRole,
        eventData: {
          source: 'legacy_notes',
          noteId: fallback?.id || null,
          text: normalizedCommentBody,
          discussionType: normalizedUpdateType,
          visibilityScope: normalizedVisibilityScope,
        },
      })
      return normalizeTransactionCommentRow(
        {
          id: fallback.id,
          transaction_id: transactionId,
          author_name: normalizedAuthorName,
          author_role: normalizedRole,
          comment_text: normalizedCommentBody,
          created_at: fallback.created_at,
        },
        {
          visibility: normalizedVisibilityScope,
          discussionType: normalizedUpdateType,
        },
      )
    }

    throw insertResult.error
  }

  await logTransactionEventIfPossible(client, {
    transactionId,
    eventType: 'CommentAdded',
    createdByRole: normalizedRole,
    eventData: {
      source: 'transaction_comments',
      commentId: insertResult.data?.id || null,
      text: normalizedCommentBody,
      discussionType: normalizedUpdateType,
      visibilityScope: normalizedVisibilityScope,
    },
  })

  return normalizeTransactionCommentRow(insertResult.data)
}

export async function recordTransactionProxyUpdate({
  transactionId,
  targetRoleType,
  targetParticipantId = null,
  workflowArea = 'general',
  workflowStepId = null,
  previousStatus = '',
  newStatus = '',
  note = '',
  evidenceDocumentId = null,
  createdByRole = null,
  metadata = {},
  unitId = null,
  authorName = '',
} = {}) {
  const client = requireClient()
  const normalizedTransactionId = normalizeNullableText(transactionId)
  if (!normalizedTransactionId) {
    throw new Error('Transaction is required.')
  }

  const normalizedNote = normalizeNullableText(note)
  if (!normalizedNote) {
    throw new Error('Update note is required.')
  }

  const activeProfile = await resolveActiveProfileContext(client)
  const actorRole = normalizeRoleType(createdByRole || activeProfile.role || 'agent')
  if (!['agent', 'developer', 'internal_admin'].includes(actorRole)) {
    throw new Error('Only transaction coordinators can record updates on behalf of roleplayers.')
  }

  const normalizedTargetRole = normalizeProxyUpdateTargetRole(targetRoleType)
  const normalizedWorkflowArea = normalizeProxyUpdateWorkflowArea(workflowArea)
  const normalizedNewStatus = normalizeNullableText(newStatus)
  const targetRoleLabel = getProxyUpdateTargetRoleLabel(normalizedTargetRole)
  const workflowAreaLabel = normalizedWorkflowArea.replaceAll('_', ' ').replace(/\b\w/g, (match) => match.toUpperCase())

  const insertPayload = {
    transaction_id: normalizedTransactionId,
    target_role_type: normalizedTargetRole,
    target_participant_id: targetParticipantId || null,
    workflow_area: normalizedWorkflowArea,
    workflow_step_id: normalizeNullableText(workflowStepId),
    previous_status: normalizeNullableText(previousStatus),
    new_status: normalizedNewStatus,
    note: normalizedNote,
    evidence_document_id: evidenceDocumentId || null,
    created_by_user_id: activeProfile.userId || null,
    created_by_role: actorRole,
    confirmation_status: 'pending',
    metadata: metadata && typeof metadata === 'object' ? metadata : {},
  }

  const insertResult = await client
    .from('transaction_proxy_updates')
    .insert(insertPayload)
    .select(
      'id, transaction_id, target_role_type, target_participant_id, workflow_area, workflow_step_id, previous_status, new_status, note, evidence_document_id, created_by_user_id, created_by_role, confirmation_status, confirmed_by_user_id, confirmed_at, rejection_reason, metadata, is_demo_data, created_at, updated_at',
    )
    .single()

  if (insertResult.error) {
    if (
      isMissingTableError(insertResult.error, 'transaction_proxy_updates') ||
      isMissingSchemaError(insertResult.error)
    ) {
      throw new Error('Transaction proxy updates are not set up yet. Run the latest Supabase migrations first.')
    }
    throw insertResult.error
  }

  const proxyUpdate = normalizeTransactionProxyUpdateRow(insertResult.data)
  const statusText = normalizedNewStatus ? ` Status: ${normalizedNewStatus}.` : ''
  const commentText = `[operational][shared] External update recorded for ${targetRoleLabel} (${workflowAreaLabel}).${statusText} ${normalizedNote}`
  const comment = await addTransactionDiscussionComment({
    transactionId: normalizedTransactionId,
    authorName: normalizeNullableText(authorName) || TRANSACTION_ROLE_LABELS[actorRole] || 'Transaction Coordinator',
    authorRole: actorRole,
    commentText,
    unitId,
    client,
  })

  await logTransactionEventIfPossible(client, {
    transactionId: normalizedTransactionId,
    eventType: 'RoleplayerProxyUpdateRecorded',
    createdByRole: actorRole,
    eventData: {
      proxyUpdateId: proxyUpdate.id,
      targetRoleType: normalizedTargetRole,
      targetRoleLabel,
      workflowArea: normalizedWorkflowArea,
      workflowStepId: proxyUpdate.workflowStepId,
      previousStatus: proxyUpdate.previousStatus,
      newStatus: proxyUpdate.newStatus,
      confirmationStatus: proxyUpdate.confirmationStatus,
      commentId: comment?.id || null,
    },
  })

  return proxyUpdate
}

export async function confirmTransactionProxyUpdate(updateId, options = {}) {
  const client = requireClient()
  const normalizedUpdateId = normalizeNullableText(updateId)
  if (!normalizedUpdateId) {
    throw new Error('Proxy update is required.')
  }

  const activeProfile = await resolveActiveProfileContext(client)
  const updateResult = await client
    .from('transaction_proxy_updates')
    .update({
      confirmation_status: 'confirmed',
      confirmed_by_user_id: activeProfile.userId || null,
      confirmed_at: new Date().toISOString(),
      rejection_reason: null,
    })
    .eq('id', normalizedUpdateId)
    .select(
      'id, transaction_id, target_role_type, target_participant_id, workflow_area, workflow_step_id, previous_status, new_status, note, evidence_document_id, created_by_user_id, created_by_role, confirmation_status, confirmed_by_user_id, confirmed_at, rejection_reason, metadata, is_demo_data, created_at, updated_at',
    )
    .single()

  if (updateResult.error) {
    throw updateResult.error
  }

  const proxyUpdate = normalizeTransactionProxyUpdateRow(updateResult.data)
  await logTransactionEventIfPossible(client, {
    transactionId: proxyUpdate.transactionId,
    eventType: 'RoleplayerProxyUpdateConfirmed',
    eventData: {
      proxyUpdateId: proxyUpdate.id,
      targetRoleType: proxyUpdate.targetRoleType,
      workflowArea: proxyUpdate.workflowArea,
    },
  })

  if (options.addComment !== false) {
    await addTransactionDiscussionComment({
      transactionId: proxyUpdate.transactionId,
      authorName: options.authorName || 'Roleplayer',
      authorRole: options.authorRole || proxyUpdate.targetRoleType,
      commentText: `[operational][shared] ${proxyUpdate.targetRoleLabel} confirmed an external update recorded on their behalf.`,
      unitId: options.unitId || null,
      client,
    })
  }

  return proxyUpdate
}

export async function rejectTransactionProxyUpdate(updateId, reason = '', options = {}) {
  const client = requireClient()
  const normalizedUpdateId = normalizeNullableText(updateId)
  if (!normalizedUpdateId) {
    throw new Error('Proxy update is required.')
  }

  const rejectionReason = normalizeNullableText(reason)
  if (!rejectionReason) {
    throw new Error('Rejection reason is required.')
  }

  const updateResult = await client
    .from('transaction_proxy_updates')
    .update({
      confirmation_status: 'rejected',
      rejection_reason: rejectionReason,
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', normalizedUpdateId)
    .select(
      'id, transaction_id, target_role_type, target_participant_id, workflow_area, workflow_step_id, previous_status, new_status, note, evidence_document_id, created_by_user_id, created_by_role, confirmation_status, confirmed_by_user_id, confirmed_at, rejection_reason, metadata, is_demo_data, created_at, updated_at',
    )
    .single()

  if (updateResult.error) {
    throw updateResult.error
  }

  const proxyUpdate = normalizeTransactionProxyUpdateRow(updateResult.data)
  await logTransactionEventIfPossible(client, {
    transactionId: proxyUpdate.transactionId,
    eventType: 'RoleplayerProxyUpdateRejected',
    eventData: {
      proxyUpdateId: proxyUpdate.id,
      targetRoleType: proxyUpdate.targetRoleType,
      workflowArea: proxyUpdate.workflowArea,
      rejectionReason,
    },
  })

  if (options.addComment !== false) {
    await addTransactionDiscussionComment({
      transactionId: proxyUpdate.transactionId,
      authorName: options.authorName || 'Roleplayer',
      authorRole: options.authorRole || proxyUpdate.targetRoleType,
      commentText: `[blocker][shared] ${proxyUpdate.targetRoleLabel} rejected an external update: ${rejectionReason}`,
      unitId: options.unitId || null,
      client,
    })
  }

  return proxyUpdate
}
