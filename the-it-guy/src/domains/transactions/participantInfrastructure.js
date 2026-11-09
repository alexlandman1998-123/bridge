// transactions owns these operations and their existing recovery behavior.
import { isOnConflictConstraintError } from '../developments/persistenceHelpers.js'
import { logTransactionEventIfPossible } from './eventActions.js'
import { normalizeFirmRole } from '../access/actorContext.js'
import { normalizeStakeholderStatus } from '../developments/participantReadApi.js'
import { normalizeOnboardingFormDataRow } from './readinessReadApi.js'
import { normalizeDocumentVisibilityScope } from '../documents/listReadApi.js'
import { normalizeEventType } from './activityReadApi.js'
import { normalizeNullableUuid, normalizeNullableText, isMissingTableError, isMissingColumnError, isMissingSchemaError, normalizeTextValue } from '../../lib/api/shared/readHelpers.js'
import { normalizeStage, normalizeMainStage } from '../../core/transactions/legacyReadModel.js'
import { getDetailedStageFromMainStage } from '../../core/transactions/stageConfig'
import { normalizePurchaserType } from '../../lib/purchaserPersonas'
import { normalizeTransactionLifecycleStage } from '../../core/transactions/transactionLifecycle'
import { TRANSACTION_ROLE_LABELS } from '../../core/transactions/roleConfig'
import { getRolePermissions, normalizeRoleType } from '../../core/transactions/permissions'
import { resolveTransactionParticipantShape } from '../../services/roleResolutionService'
import { TRANSACTION_ACCESS_LEVEL_VALUES, TRANSACTION_NOTIFICATION_TYPES } from '../shared/constants.js'
import { upsertTransactionLifecycleWorkflow } from './workflowEvidence.js'

export async function loadWorkflowEvidenceMapper() {
  return import("../../../server/services/workflowEvidenceMapper.js")
}

export const DISCUSSION_TYPES = [
  'operational',
  'blocker',
  'document',
  'decision',
  'client',
  'finance',
  'legal',
  'system',
  'workflow',
  'reminder',
  'internal_note',
  'client_update',
]

export function isMissingFunctionError(error, functionName = '') {
  if (!error) return false
  const code = String(error.code || '').toUpperCase()
  const message = String(error.message || error.details || error.hint || '').toLowerCase()
  const normalizedFunctionName = String(functionName || '')
    .trim()
    .toLowerCase()
  if (message.includes('permission denied')) return false
  if (code && !['42883', 'PGRST202'].includes(code)) return false
  const functionMissing =
    code === '42883' || code === 'PGRST202' || message.includes('function') || message.includes('schema cache')
  return functionMissing && (!normalizedFunctionName || message.includes(normalizedFunctionName))
}

const TRANSACTION_PARTICIPANT_ASSIGNMENT_SOURCES = new Set([
  'transaction_direct',
  'development_default',
  'system_inherited',
  'reference_only',
])

export function normalizeTransactionParticipantAssignmentSource(value, fallback = 'transaction_direct') {
  const normalized = normalizeTextValue(value).toLowerCase()
  if (TRANSACTION_PARTICIPANT_ASSIGNMENT_SOURCES.has(normalized)) return normalized

  if (
    [
      'agent_firm_nomination',
      'manual',
      'partner_invitation',
      'stakeholder_add',
      'transaction_partner_invitation',
      'workflow_assignment',
    ].includes(normalized)
  ) {
    return 'transaction_direct'
  }

  if (
    [
      'phase6_person_routing_sync',
      'routing_rule',
      'system',
      'transaction_roleplayer_propagation',
    ].includes(normalized)
  ) {
    return 'system_inherited'
  }

  return TRANSACTION_PARTICIPANT_ASSIGNMENT_SOURCES.has(fallback) ? fallback : 'transaction_direct'
}

export function normalizeTransactionAccessLevel(value, fallback = 'shared') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return TRANSACTION_ACCESS_LEVEL_VALUES.includes(normalized) ? normalized : fallback
}

export function normalizeAttorneyLegalRole(value, fallback = 'none') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  if (!normalized) {
    return fallback
  }
  if (normalized === 'none') {
    return 'none'
  }
  if (normalized === 'transfer') {
    return 'transfer'
  }
  if (normalized === 'bond') {
    return 'bond'
  }
  if (normalized === 'cancellation') {
    return 'cancellation'
  }
  return fallback
}

export function isInternalStakeholderRole(roleType) {
  const normalized = normalizeRoleType(roleType)
  return ['developer', 'internal_admin', 'attorney', 'agent', 'bond_originator'].includes(normalized)
}

export function normalizeNotificationType(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  return TRANSACTION_NOTIFICATION_TYPES.includes(normalized) ? normalized : 'readiness_updated'
}

const DISCUSSION_VISIBILITY_VALUES = [
  'shared',
  'internal',
  'client_safe',
  'professional_shared',
  'shared_role_players',
  'shared_transaction',
  'internal_only',
  'client_visible',
  'buyer_visible',
  'attorney_visible',
  'bond_originator_visible',
  'developer_visible',
]

export const TRANSACTION_DISCUSSION_COLUMNS =
  'id, transaction_id, unit_id, development_id, organisation_id, author_user_id, author_name, author_role, author_organisation_name, visibility_scope, update_type, comment_text, related_entity_type, related_entity_id, attachment_ids, is_system_generated, created_at, updated_at'

export const TRANSACTION_DISCUSSION_LEGACY_COLUMNS = 'id, transaction_id, author_name, author_role, comment_text, created_at'

export function parseDiscussionMetadata(rawText) {
  const sourceText = String(rawText || '').trim()
  if (!sourceText) {
    return {
      body: '',
      discussionType: 'operational',
      visibility: 'shared',
      hasDiscussionTypeTag: false,
      hasVisibilityTag: false,
    }
  }

  const typeTags = new Set(DISCUSSION_TYPES)
  const visibilityMap = {
    shared: 'shared',
    professional_shared: 'shared',
    shared_role_players: 'shared',
    shared_transaction: 'shared_transaction',
    internal: 'internal',
    internal_only: 'internal',
    client_safe: 'client_safe',
    client_visible: 'client_safe',
    buyer_visible: 'buyer_visible',
    attorney_visible: 'attorney_visible',
    bond_originator_visible: 'bond_originator_visible',
    developer_visible: 'developer_visible',
  }

  let remaining = sourceText
  let parsedType = null
  let parsedVisibility = null
  let guard = 0

  while (guard < 4) {
    const match = remaining.match(/^\[([a-z_ ]+)\]\s*/i)
    if (!match) {
      break
    }

    guard += 1
    const tag = String(match[1] || '')
      .trim()
      .toLowerCase()
      .replaceAll(' ', '_')

    if (!parsedType && typeTags.has(tag)) {
      parsedType = tag
    }

    if (!parsedVisibility && visibilityMap[tag]) {
      parsedVisibility = visibilityMap[tag]
    }

    remaining = remaining.slice(match[0].length).trimStart()
  }

  return {
    body: remaining || sourceText,
    discussionType: parsedType || 'operational',
    visibility: parsedVisibility || 'shared',
    hasDiscussionTypeTag: Boolean(parsedType),
    hasVisibilityTag: Boolean(parsedVisibility),
  }
}

export function normalizeDiscussionVisibility(value, fallback = 'shared') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  if (!DISCUSSION_VISIBILITY_VALUES.includes(normalized)) {
    return fallback
  }
  if (normalized === 'internal_only') return 'internal'
  if (normalized === 'client_visible' || normalized === 'buyer_visible') return 'client_safe'
  if (
    [
      'professional_shared',
      'shared_role_players',
      'shared_transaction',
      'attorney_visible',
      'bond_originator_visible',
      'developer_visible',
    ].includes(normalized)
  ) {
    return 'shared'
  }
  return normalized
}

export async function fetchOnboardingFormDataForTransaction(client, transactionId, purchaserType = 'individual') {
  if (!transactionId) {
    return null
  }

  const normalizedType = normalizePurchaserType(purchaserType)

  const { data, error } = await client
    .from('onboarding_form_data')
    .select('id, transaction_id, purchaser_type, form_data, created_at, updated_at')
    .eq('transaction_id', transactionId)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error, 'onboarding_form_data')) {
      return {
        id: null,
        transactionId,
        purchaserType: normalizedType,
        formData: {},
        createdAt: null,
        updatedAt: null,
      }
    }

    throw error
  }

  if (!data) {
    return {
      id: null,
      transactionId,
      purchaserType: normalizedType,
      formData: {},
      createdAt: null,
      updatedAt: null,
    }
  }

  return normalizeOnboardingFormDataRow(data)
}

export const TRANSACTION_PARTICIPANT_FULL_SELECT = `
  id,
  transaction_id,
  user_id,
  role_type,
  legal_role,
  transaction_role,
  status,
  firm_id,
  invited_by_user_id,
  invitation_token,
  invitation_expires_at,
  invited_at,
  accepted_at,
  removed_at,
  visibility_scope,
  is_internal,
  participant_name,
  participant_email,
  participant_phone,
  participant_scope,
  assignment_source,
  buyer_party_id,
  buyer_party_role,
  buyer_party_position,
  is_primary_buyer,
  buyer_profile_status,
  buyer_onboarding_status,
  buyer_onboarding_completed_at,
  buyer_manual_capture_status,
  buyer_manual_capture_completed_at,
  buyer_portal_invite_status,
  buyer_portal_invited_at,
  buyer_portal_last_sent_at,
  buyer_portal_link_id,
  buyer_source,
  buyer_metadata,
  ownership_percentage,
  signing_required,
  can_view,
  can_comment,
  can_upload_documents,
  can_edit_finance_workflow,
  can_edit_attorney_workflow,
  can_edit_core_transaction,
  created_at,
  updated_at
`

export const TRANSACTION_PARTICIPANT_LEGACY_SELECT = `
  id,
  transaction_id,
  user_id,
  role_type,
  legal_role,
  status,
  firm_id,
  invited_by_user_id,
  invitation_token,
  invitation_expires_at,
  invited_at,
  accepted_at,
  removed_at,
  visibility_scope,
  is_internal,
  participant_name,
  participant_email,
  participant_scope,
  assignment_source,
  can_view,
  can_comment,
  can_upload_documents,
  can_edit_finance_workflow,
  can_edit_attorney_workflow,
  can_edit_core_transaction,
  created_at,
  updated_at
`

export function isMissingTransactionParticipantExtendedColumn(error) {
  return [
    'transaction_role',
    'participant_phone',
    'participant_scope',
    'assignment_source',
    'buyer_party_id',
    'buyer_party_role',
    'buyer_party_position',
    'is_primary_buyer',
    'buyer_profile_status',
    'buyer_onboarding_status',
    'buyer_onboarding_completed_at',
    'buyer_manual_capture_status',
    'buyer_manual_capture_completed_at',
    'buyer_portal_invite_status',
    'buyer_portal_invited_at',
    'buyer_portal_last_sent_at',
    'buyer_portal_link_id',
    'buyer_source',
    'buyer_metadata',
  ].some((column) => isMissingColumnError(error, column))
}

export function normalizeTransactionParticipantRow(row) {
  const shape = resolveTransactionParticipantShape(row)
  const roleType = normalizeRoleType(shape.roleType)
  const transactionRole = shape.transactionRole
  const fallbackPermissions = getRolePermissions({
    role: roleType,
    financeManagedBy: 'bond_originator',
  })
  const legalRole = normalizeAttorneyLegalRole(shape.legalRole, roleType === 'attorney' ? 'transfer' : 'none')
  const stakeholderStatus = normalizeStakeholderStatus(row?.status, row?.removed_at ? 'removed' : 'active')
  const participantScope = String(row?.participant_scope || '')
    .trim()
    .toLowerCase()
  const assignmentSource = String(row?.assignment_source || '')
    .trim()
    .toLowerCase()
  const roleLabelBase = TRANSACTION_ROLE_LABELS[roleType] || roleType
  const legalRoleLabel =
    roleType !== 'attorney'
      ? null
      : legalRole === 'transfer'
        ? 'Transfer Attorney'
        : legalRole === 'bond'
          ? 'Bond Attorney'
          : legalRole === 'cancellation'
            ? 'Cancellation Attorney'
            : 'Attorney'
  return {
    id: row?.id || null,
    transactionId: row?.transaction_id || null,
    userId: row?.user_id || null,
    roleType,
    transactionRole,
    roleLabel: legalRoleLabel || roleLabelBase,
    legalRole: roleType === 'attorney' ? legalRole : null,
    stakeholderStatus,
    accessLevel: normalizeTransactionAccessLevel(row?.access_level, 'shared'),
    visibilityScope: normalizeDocumentVisibilityScope(
      row?.visibility_scope,
      isInternalStakeholderRole(roleType) ? 'internal' : 'shared',
    ),
    invitedAt: row?.invited_at || null,
    acceptedAt: row?.accepted_at || null,
    removedAt: row?.removed_at || null,
    invitationToken: row?.invitation_token || null,
    invitationExpiresAt: row?.invitation_expires_at || null,
    invitedByUserId: row?.invited_by_user_id || null,
    firmId: row?.firm_id || null,
    firmRole: normalizeFirmRole(row?.firm_role, roleType === 'attorney' ? 'attorney' : roleType),
    participantName: row?.participant_name || '',
    participantEmail: row?.participant_email || '',
    participantPhone: row?.participant_phone || '',
    buyerPartyId: row?.buyer_party_id || null,
    buyerPartyRole: row?.buyer_party_role || '',
    buyerPartyPosition: Number.isFinite(Number(row?.buyer_party_position)) ? Number(row.buyer_party_position) : 0,
    isPrimaryBuyer: row?.is_primary_buyer === true,
    buyerProfileStatus: row?.buyer_profile_status || '',
    buyerOnboardingStatus: row?.buyer_onboarding_status || '',
    buyerOnboardingCompletedAt: row?.buyer_onboarding_completed_at || null,
    buyerManualCaptureStatus: row?.buyer_manual_capture_status || '',
    buyerManualCaptureCompletedAt: row?.buyer_manual_capture_completed_at || null,
    buyerPortalInviteStatus: row?.buyer_portal_invite_status || '',
    buyerPortalInvitedAt: row?.buyer_portal_invited_at || null,
    buyerPortalLastSentAt: row?.buyer_portal_last_sent_at || null,
    buyerPortalLinkId: row?.buyer_portal_link_id || null,
    buyerSource: row?.buyer_source || '',
    buyerMetadata: row?.buyer_metadata && typeof row.buyer_metadata === 'object' ? row.buyer_metadata : {},
    canView: row?.can_view !== false,
    canComment: row?.can_comment !== false,
    canUploadDocuments: row?.can_upload_documents !== false,
    canEditFinanceWorkflow:
      typeof row?.can_edit_finance_workflow === 'boolean'
        ? row.can_edit_finance_workflow
        : Boolean(fallbackPermissions.canEditFinanceWorkflow),
    canEditAttorneyWorkflow:
      typeof row?.can_edit_attorney_workflow === 'boolean'
        ? row.can_edit_attorney_workflow
        : Boolean(fallbackPermissions.canEditAttorneyWorkflow),
    canEditCoreTransaction:
      typeof row?.can_edit_core_transaction === 'boolean'
        ? row.can_edit_core_transaction
        : Boolean(fallbackPermissions.canEditCoreTransaction),
    canRequestAdditionalDocuments:
      typeof row?.can_request_additional_documents === 'boolean'
        ? row.can_request_additional_documents
        : Boolean(fallbackPermissions.canRequestAdditionalDocuments),
    participantScope: ['development', 'reference', 'transaction'].includes(participantScope)
      ? participantScope
      : 'transaction',
    assignmentSource: assignmentSource || 'transaction_direct',
    accessInherited: participantScope === 'development' || assignmentSource === 'development_default',
    isInternal: row?.is_internal ?? isInternalStakeholderRole(roleType),
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
  }
}

export async function upsertTransactionParticipantsRowsWithFallback(
  client,
  { rows = [], onConflict = 'transaction_id,role_type,legal_role', rowSelect = 'id', matchOnLegalRole = true } = {},
) {
  const normalizedRows = (rows || []).map((sourceRow) => {
    const row = { ...(sourceRow || {}) }
    if (Object.prototype.hasOwnProperty.call(row, 'role_type')) {
      const normalizedRoleType = normalizeRoleType(row.role_type)
      row.role_type = normalizedRoleType
      if (Object.prototype.hasOwnProperty.call(row, 'legal_role')) {
        row.legal_role =
          normalizedRoleType === 'attorney' ? normalizeAttorneyLegalRole(row.legal_role, 'transfer') : 'none'
      }
    }
    if (Object.prototype.hasOwnProperty.call(row, 'assignment_source')) {
      row.assignment_source = normalizeTransactionParticipantAssignmentSource(row.assignment_source, 'transaction_direct')
    }
    if (Object.prototype.hasOwnProperty.call(row, 'status')) {
      row.status = normalizeStakeholderStatus(row.status, 'draft')
    }
    return row
  })

  // Current non-buyer identities have a partial unique index. PostgREST's
  // on_conflict cannot express its predicate, so use the identity lookup path
  // directly instead of issuing a known-invalid upsert on every assignment.
  const lookupFirst = normalizedRows.every(row => row.role_type !== 'buyer' && row.transaction_role !== 'buyer')
  let result = lookupFirst ? null : await client.from('transaction_participants').upsert(normalizedRows, { onConflict }).select(rowSelect)

  if (!lookupFirst && (!result.error || !isOnConflictConstraintError(result.error))) {
    return result
  }

  const rowIds = []
  for (const row of normalizedRows) {
    let lookupQuery = client
      .from('transaction_participants')
      .select('id')
      .eq('transaction_id', row.transaction_id)
      .eq('role_type', row.role_type)

    if (matchOnLegalRole && Object.prototype.hasOwnProperty.call(row, 'legal_role')) {
      lookupQuery = lookupQuery.eq('legal_role', row.legal_role)
    }

    let existingResult = await lookupQuery.maybeSingle()
    if (existingResult.error && matchOnLegalRole && isMissingColumnError(existingResult.error, 'legal_role')) {
      lookupQuery = client
        .from('transaction_participants')
        .select('id')
        .eq('transaction_id', row.transaction_id)
        .eq('role_type', row.role_type)
      existingResult = await lookupQuery.maybeSingle()
    }

    if (existingResult.error) {
      return existingResult
    }

    if (existingResult.data?.id) {
      const updateResult = await client
        .from('transaction_participants')
        .update(row)
        .eq('id', existingResult.data.id)
        .select('id')
        .maybeSingle()

      if (updateResult.error) {
        return updateResult
      }
      rowIds.push(updateResult.data?.id || existingResult.data.id)
      continue
    }

    let insertResult = await client.from('transaction_participants').insert(row).select('id').single()
    if (lookupFirst && insertResult.error?.code === '23505') {
      const concurrent = await lookupQuery.maybeSingle()
      if (concurrent.error) return concurrent
      if (concurrent.data?.id) {
        insertResult = await client.from('transaction_participants').update(row)
          .eq('id', concurrent.data.id).select('id').maybeSingle()
      }
    }

    if (insertResult.error) {
      return insertResult
    }

    if (insertResult.data?.id) {
      rowIds.push(insertResult.data.id)
    }
  }

  if (!rowIds.length) {
    return { data: [], error: null }
  }

  result = await client.from('transaction_participants').select(rowSelect).in('id', rowIds)

  return result
}

export function normalizeTransactionCommentRow(row, options = {}) {
  const role = normalizeRoleType(row?.author_role || 'developer')
  const metadata = parseDiscussionMetadata(row?.comment_text || '')
  const rawVisibility = String(options.visibility || row?.visibility_scope || '')
    .trim()
    .toLowerCase()
  const visibility =
    metadata.hasVisibilityTag &&
    (!rawVisibility || rawVisibility === 'shared' || rawVisibility === 'shared_transaction')
      ? normalizeDiscussionVisibility(metadata.visibility, 'shared')
      : normalizeDiscussionVisibility(rawVisibility, metadata.visibility || 'shared')
  const rowUpdateType = String(row?.update_type || '')
    .trim()
    .toLowerCase()
  const discussionType = DISCUSSION_TYPES.includes(options.discussionType)
    ? options.discussionType
    : DISCUSSION_TYPES.includes(rowUpdateType)
      ? rowUpdateType
      : metadata.discussionType
  const commentBody = String((options.commentBody ?? metadata.body ?? row?.comment_text) || '').trim()

  return {
    id: row?.id || null,
    transactionId: row?.transaction_id || null,
    unitId: row?.unit_id || null,
    developmentId: row?.development_id || null,
    organisationId: row?.organisation_id || null,
    authorUserId: row?.author_user_id || null,
    authorName: row?.author_name || 'Samlin Team',
    authorRole: role,
    authorRoleLabel: TRANSACTION_ROLE_LABELS[role] || role,
    authorOrganisationName: row?.author_organisation_name || '',
    commentText: row?.comment_text || commentBody,
    commentBody: commentBody || row?.comment_text || '',
    discussionType,
    visibility,
    relatedEntityType: row?.related_entity_type || null,
    relatedEntityId: row?.related_entity_id || null,
    attachmentIds: Array.isArray(row?.attachment_ids) ? row.attachment_ids : [],
    isSystemGenerated: Boolean(row?.is_system_generated || discussionType === 'system'),
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || row?.created_at || null,
  }
}

export function normalizeNotificationRow(row) {
  return {
    id: row?.id || null,
    transactionId: row?.transaction_id || null,
    userId: row?.user_id || null,
    roleType: normalizeRoleType(row?.role_type || null),
    type: normalizeNotificationType(row?.notification_type),
    title: row?.title || '',
    message: row?.message || '',
    isRead: Boolean(row?.is_read),
    readAt: row?.read_at || null,
    dedupeKey: row?.dedupe_key || null,
    eventType: normalizeEventType(row?.event_type),
    eventData: row?.event_data && typeof row.event_data === 'object' ? row.event_data : {},
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
  }
}

export async function createTransactionNotificationIfPossible(client, payload = {}) {
  const userId = payload.userId || null
  if (!userId) {
    return null
  }

  const notificationPayload = {
    transaction_id: payload.transactionId || null,
    user_id: userId,
    role_type: normalizeRoleType(payload.roleType || null),
    notification_type: normalizeNotificationType(payload.notificationType),
    title: normalizeTextValue(payload.title || 'Arch9 Update'),
    message: normalizeTextValue(payload.message || ''),
    is_read: false,
    read_at: null,
    dedupe_key: normalizeNullableText(payload.dedupeKey),
    event_type: normalizeEventType(payload.eventType || 'TransactionUpdated'),
    event_data: payload.eventData && typeof payload.eventData === 'object' ? payload.eventData : {},
  }

  if (notificationPayload.dedupe_key) {
    const existingQuery = await client
      .from('transaction_notifications')
      .select(
        'id, transaction_id, user_id, role_type, notification_type, title, message, is_read, read_at, dedupe_key, event_type, event_data, created_at, updated_at',
      )
      .eq('user_id', notificationPayload.user_id)
      .eq('dedupe_key', notificationPayload.dedupe_key)
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingQuery.error) {
      if (
        isMissingTableError(existingQuery.error, 'transaction_notifications') ||
        isMissingColumnError(existingQuery.error, 'dedupe_key')
      ) {
        return null
      }
      throw existingQuery.error
    }

    if (existingQuery.data) {
      return normalizeNotificationRow(existingQuery.data)
    }
  }

  const insertResult = await client
    .from('transaction_notifications')
    .insert(notificationPayload)
    .select(
      'id, transaction_id, user_id, role_type, notification_type, title, message, is_read, read_at, dedupe_key, event_type, event_data, created_at, updated_at',
    )
    .single()

  if (insertResult.error) {
    if (
      isMissingTableError(insertResult.error, 'transaction_notifications') ||
      isMissingColumnError(insertResult.error, 'notification_type') ||
      isMissingColumnError(insertResult.error, 'event_data')
    ) {
      return null
    }
    throw insertResult.error
  }

  return normalizeNotificationRow(insertResult.data)
}

export async function advanceTransactionMainStageIfNeeded(
  client,
  {
    transactionId,
    targetMainStage,
    allowedCurrentMainStages = [],
    nextAction = null,
    comment = null,
    source = 'automation',
    actorRole = 'internal_admin',
  } = {},
) {
  if (!transactionId || !targetMainStage) {
    return { advanced: false, reason: 'missing_context' }
  }

  let transactionQuery = await client
    .from('transactions')
    .select('id, unit_id, stage, current_main_stage')
    .eq('id', transactionId)
    .maybeSingle()

  if (transactionQuery.error && isMissingColumnError(transactionQuery.error, 'current_main_stage')) {
    transactionQuery = await client
      .from('transactions')
      .select('id, unit_id, stage')
      .eq('id', transactionId)
      .maybeSingle()
  }

  if (transactionQuery.error) {
    if (isMissingSchemaError(transactionQuery.error)) {
      return { advanced: false, reason: 'schema_missing' }
    }
    throw transactionQuery.error
  }

  const transactionRow = transactionQuery.data || null
  if (!transactionRow) {
    return { advanced: false, reason: 'transaction_not_found' }
  }

  const currentStage = normalizeStage(transactionRow.stage, 'Available')
  const currentMainStage = normalizeMainStage(transactionRow.current_main_stage, currentStage)
  const normalizedTargetMainStage = normalizeMainStage(targetMainStage, currentStage)

  if (allowedCurrentMainStages.length && !allowedCurrentMainStages.includes(currentMainStage)) {
    return {
      advanced: false,
      reason: 'not_in_allowed_stage',
      currentMainStage,
    }
  }

  if (currentMainStage === normalizedTargetMainStage) {
    return { advanced: false, reason: 'already_at_target', currentMainStage }
  }

  const nowIso = new Date().toISOString()
  const nextStage = getDetailedStageFromMainStage(normalizedTargetMainStage, currentStage)
  const payload = {
    stage: nextStage,
    current_main_stage: normalizedTargetMainStage,
    next_action: normalizeNullableText(nextAction),
    comment: normalizeNullableText(comment),
    stage_date: nowIso,
    is_active: normalizedTargetMainStage !== 'AVAIL',
    updated_at: nowIso,
  }

  let updateResult = await client.from('transactions').update(payload).eq('id', transactionId)
  if (
    updateResult.error &&
    (isMissingColumnError(updateResult.error, 'current_main_stage') ||
      isMissingColumnError(updateResult.error, 'next_action') ||
      isMissingColumnError(updateResult.error, 'comment') ||
      isMissingColumnError(updateResult.error, 'stage_date') ||
      isMissingColumnError(updateResult.error, 'is_active'))
  ) {
    const fallbackPayload = { ...payload }
    if (isMissingColumnError(updateResult.error, 'current_main_stage')) delete fallbackPayload.current_main_stage
    if (isMissingColumnError(updateResult.error, 'next_action')) delete fallbackPayload.next_action
    if (isMissingColumnError(updateResult.error, 'comment')) delete fallbackPayload.comment
    if (isMissingColumnError(updateResult.error, 'stage_date')) delete fallbackPayload.stage_date
    if (isMissingColumnError(updateResult.error, 'is_active')) delete fallbackPayload.is_active
    updateResult = await client.from('transactions').update(fallbackPayload).eq('id', transactionId)
  }

  if (updateResult.error && !isMissingSchemaError(updateResult.error)) {
    throw updateResult.error
  }

  const normalizedUnitId = normalizeNullableUuid(transactionRow.unit_id)
  if (normalizedUnitId) {
    const unitUpdate = await client.from('units').update({ status: nextStage }).eq('id', normalizedUnitId)

    if (unitUpdate.error && !isMissingSchemaError(unitUpdate.error)) {
      throw unitUpdate.error
    }
  }

  await upsertTransactionLifecycleWorkflow(client, {
    transactionId,
    currentStage: normalizeTransactionLifecycleStage(normalizedTargetMainStage),
    status: 'active',
    source,
    note: normalizeNullableText(comment || nextAction),
  })

  await logTransactionEventIfPossible(client, {
    transactionId,
    eventType: 'TransactionStageChanged',
    createdByRole: normalizeRoleType(actorRole || 'internal_admin'),
    eventData: {
      fromStage: currentStage,
      fromMainStage: currentMainStage,
      toStage: nextStage,
      toMainStage: normalizedTargetMainStage,
      source,
      note: normalizeNullableText(comment || nextAction),
    },
  })

  return {
    advanced: true,
    previousStage: currentStage,
    previousMainStage: currentMainStage,
    nextStage,
    nextMainStage: normalizedTargetMainStage,
  }
}
