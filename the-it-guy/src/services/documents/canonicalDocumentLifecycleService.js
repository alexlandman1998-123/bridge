import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'
import {
  CANONICAL_RESOLVER_VERSION,
  REQUIREMENT_EVENT_TYPES,
  REQUIREMENT_STATUSES,
  getCurrentSatisfier,
  getRequirementReadiness,
  getRequirementSatisfactionState,
  isRequirementBlocking,
  isRequirementProvisionallySatisfied,
  isRequirementSatisfied,
} from './canonicalDocumentResolverService'
import {
  syncCanonicalToDocumentRequests,
  syncCanonicalToPrivateListingRequirements,
  syncCanonicalToTransactionRequiredDocuments,
} from './canonicalDocumentAdapterService'

export const CANONICAL_UPLOAD_LIFECYCLE_FLAG = 'VITE_CANONICAL_UPLOAD_LIFECYCLE_ENABLED'
export const CANONICAL_REVIEW_WORKFLOW_FLAG = 'VITE_CANONICAL_REVIEW_WORKFLOW_ENABLED'
export const CANONICAL_PACKET_SATISFACTION_FLAG = 'VITE_CANONICAL_PACKET_SATISFACTION_ENABLED'
export const CANONICAL_WAIVER_FLOW_FLAG = 'VITE_CANONICAL_WAIVER_FLOW_ENABLED'
export const CANONICAL_LIFECYCLE_SOURCE = 'canonical_document_lifecycle'

export const CANONICAL_REVIEW_STATUSES = Object.freeze({
  pending: 'pending',
  approved: 'approved',
  rejected: 'rejected',
  needsReupload: 'needs_reupload',
})

const INTERNAL_ROLES = new Set([
  'agent',
  'agency_admin',
  'developer',
  'transferring_attorney',
  'bond_attorney',
  'cancellation_attorney',
  'internal_admin',
  'admin',
  'system',
])

const ELEVATED_WAIVER_ROLES = new Set([
  'agent',
  'agency_admin',
  'developer',
  'transferring_attorney',
  'internal_admin',
  'admin',
  'system',
])

const UNSAFE_DOWNGRADE_STATUSES = new Set([
  REQUIREMENT_STATUSES.approved,
  REQUIREMENT_STATUSES.completed,
  REQUIREMENT_STATUSES.waived,
  REQUIREMENT_STATUSES.notApplicable,
])

const UPLOAD_TRANSITION_STATUSES = new Set([
  REQUIREMENT_STATUSES.pending,
  REQUIREMENT_STATUSES.requested,
  REQUIREMENT_STATUSES.uploaded,
  REQUIREMENT_STATUSES.underReview,
  REQUIREMENT_STATUSES.rejected,
  REQUIREMENT_STATUSES.expired,
])

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeArray(value) {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function isTruthyFlag(value) {
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(normalizeKey(value))
}

function getEnvFlag(name) {
  try {
    return import.meta.env?.[name]
  } catch {
    return undefined
  }
}

function requireClient(client = supabase) {
  if (!client || !isSupabaseConfigured) throw new Error('Supabase is required for canonical document lifecycle operations.')
  return client
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizeText(value))
}

function normalizeUuid(value) {
  const normalized = normalizeText(value)
  return isUuidLike(normalized) ? normalized : null
}

function isMissingColumnError(error, columnName = '') {
  const message = normalizeText(error?.message || error?.details || error?.hint)
  const code = normalizeText(error?.code)
  if (!message && !code) return false
  if (code === '42703' || code === 'PGRST204') {
    return columnName ? message.includes(columnName) : true
  }
  return columnName ? message.includes(columnName) && message.toLowerCase().includes('column') : false
}

function featureEnabled(flagName, options = {}) {
  if (typeof options.enabled === 'boolean') return options.enabled
  if (typeof options.force === 'boolean' && options.force) return true
  return isTruthyFlag(getEnvFlag(flagName))
}

export function isCanonicalUploadLifecycleEnabled(options = {}) {
  return featureEnabled(CANONICAL_UPLOAD_LIFECYCLE_FLAG, options)
}

export function isCanonicalReviewWorkflowEnabled(options = {}) {
  return featureEnabled(CANONICAL_REVIEW_WORKFLOW_FLAG, options)
}

export function isCanonicalPacketSatisfactionEnabled(options = {}) {
  return featureEnabled(CANONICAL_PACKET_SATISFACTION_FLAG, options)
}

export function isCanonicalWaiverFlowEnabled(options = {}) {
  return featureEnabled(CANONICAL_WAIVER_FLOW_FLAG, options)
}

export function actorHasInternalAccess(actorRole = '') {
  return INTERNAL_ROLES.has(normalizeKey(actorRole))
}

export function actorCanWaive(actorRole = '') {
  return ELEVATED_WAIVER_ROLES.has(normalizeKey(actorRole))
}

function roleAllowed(role, roles = []) {
  const normalizedRole = normalizeKey(role)
  if (!normalizedRole) return false
  return normalizeArray(roles).map(normalizeKey).includes(normalizedRole)
}

export function assertCanUploadRequirement(requirement = {}, { actorRole = '', override = false } = {}) {
  if (override || actorHasInternalAccess(actorRole)) return true
  if (roleAllowed(actorRole, requirement.uploadable_by_roles)) return true
  throw new Error('This role cannot upload against the selected canonical document requirement.')
}

export function assertCanReviewRequirement(requirement = {}, { reviewerRole = '', override = false } = {}) {
  if (override || actorHasInternalAccess(reviewerRole)) return true
  const expectedRole = normalizeKey(requirement.reviewer_role)
  if (expectedRole && expectedRole === normalizeKey(reviewerRole)) return true
  throw new Error('This role cannot review the selected canonical document requirement.')
}

export function assertCanWaiveRequirement({ actorRole = '', override = false, waiverReason = '' } = {}) {
  if (!normalizeText(waiverReason)) throw new Error('A waiver reason is required.')
  if (override || actorCanWaive(actorRole)) return true
  throw new Error('This role cannot waive canonical document requirements.')
}

export function calculateExpiryDate({ definition = {}, validityPeriodDays = null, baseDate = new Date() } = {}) {
  const days = Number(validityPeriodDays ?? definition.validity_period_days)
  if (!Number.isFinite(days) || days <= 0) return null
  const base = baseDate instanceof Date ? baseDate : new Date(baseDate)
  if (Number.isNaN(base.getTime())) return null
  const expiry = new Date(base.getTime())
  expiry.setUTCDate(expiry.getUTCDate() + days)
  return expiry.toISOString()
}

export function isRequirementExpired(requirement = {}, now = new Date()) {
  const expiryDate = normalizeText(requirement.expiry_date)
  if (!expiryDate) return false
  const expiry = new Date(expiryDate)
  const current = now instanceof Date ? now : new Date(now)
  if (Number.isNaN(expiry.getTime()) || Number.isNaN(current.getTime())) return false
  return expiry.getTime() <= current.getTime()
}

export function canTransitionRequirementStatus(fromStatus = '', toStatus = '', options = {}) {
  const from = normalizeKey(fromStatus) || REQUIREMENT_STATUSES.pending
  const to = normalizeKey(toStatus) || REQUIREMENT_STATUSES.pending
  if (from === to) return true
  if (options.explicit || options.override) return true
  if (from === REQUIREMENT_STATUSES.rejected && UPLOAD_TRANSITION_STATUSES.has(to)) return true
  if (from === REQUIREMENT_STATUSES.expired && UPLOAD_TRANSITION_STATUSES.has(to)) return true
  if (UNSAFE_DOWNGRADE_STATUSES.has(from) && ![REQUIREMENT_STATUSES.expired, REQUIREMENT_STATUSES.waived].includes(to)) return false
  if (from === REQUIREMENT_STATUSES.completed && to !== REQUIREMENT_STATUSES.expired) return false
  return true
}

export function getNextUploadStatus(requirement = {}, { reviewRequired = null } = {}) {
  const definition = requirement.document_definitions || requirement.document_definition || requirement.definition || {}
  const needsReview = typeof reviewRequired === 'boolean' ? reviewRequired : Boolean(definition.review_required)
  return needsReview ? REQUIREMENT_STATUSES.underReview : REQUIREMENT_STATUSES.uploaded
}

export function buildRequirementLifecycleEvent(requirement = {}, eventType, {
  actorRole = 'system',
  actorUserId = null,
  message = '',
  previousStatus = null,
  newStatus = null,
  documentId = null,
  packetId = null,
  packetVersionId = null,
  reason = '',
  reviewId = null,
  metadata = {},
} = {}) {
  return {
    requirement_instance_id: requirement.id,
    event_type: eventType,
    actor_role: actorRole || 'system',
    actor_user_id: normalizeUuid(actorUserId),
    message: message || null,
    metadata_json: {
      source_system: CANONICAL_LIFECYCLE_SOURCE,
      resolver_version: requirement.resolver_version || CANONICAL_RESOLVER_VERSION,
      rule_id: requirement.rule_id || null,
      previous_status: previousStatus || null,
      new_status: newStatus || null,
      document_id: documentId || null,
      packet_id: packetId || null,
      packet_version_id: packetVersionId || null,
      reason: reason || null,
      review_id: reviewId || null,
      ...metadata,
    },
  }
}

async function insertLifecycleEvent(client, requirement, eventType, options = {}) {
  if (!requirement?.id) return null
  const event = buildRequirementLifecycleEvent(requirement, eventType, options)
  const result = await client.from('document_requirement_events').insert(event)
  if (result.error) throw result.error
  return event
}

async function loadRequirementInstance(client, requirementInstanceId) {
  const id = normalizeText(requirementInstanceId)
  if (!id) throw new Error('requirementInstanceId is required.')
  const result = await client
    .from('document_requirement_instances')
    .select('*, document_definitions(*)')
    .eq('id', id)
    .maybeSingle()
  if (result.error) throw result.error
  if (!result.data) throw new Error('Canonical document requirement instance was not found.')
  return result.data
}

async function updateLinkedArtifact(client, table, artifactId, requirementInstanceId) {
  const normalizedArtifactId = normalizeUuid(artifactId)
  if (!normalizedArtifactId) return { skipped: true, reason: 'non_uuid_artifact_id' }
  const result = await client
    .from(table)
    .update({ canonical_requirement_instance_id: requirementInstanceId })
    .eq('id', normalizedArtifactId)
  if (result.error && !isMissingColumnError(result.error, 'canonical_requirement_instance_id')) throw result.error
  return result.error ? { skipped: true, reason: 'canonical_link_column_missing' } : { skipped: false }
}

async function updateRequirementInstance(client, requirement, patch = {}) {
  const result = await client
    .from('document_requirement_instances')
    .update({
      ...patch,
      source_system: patch.source_system || CANONICAL_LIFECYCLE_SOURCE,
    })
    .eq('id', requirement.id)
    .select('*, document_definitions(*)')
    .maybeSingle()
  if (result.error) throw result.error
  return result.data || { ...requirement, ...patch }
}

async function syncLegacyForRequirement(requirement = {}, { client = supabase, force = true } = {}) {
  const db = client
  const results = []
  if (requirement.context_type === 'private_listing') {
    const contextId = requirement.listing_id || requirement.context_id
    if (contextId) {
      results.push(await syncCanonicalToPrivateListingRequirements({ contextId, listingId: requirement.listing_id || null, client: db, force }))
    }
  }
  if (requirement.transaction_id || requirement.context_type === 'transaction') {
    const transactionId = requirement.transaction_id || (requirement.context_type === 'transaction' ? requirement.context_id : null)
    if (transactionId) {
      results.push(await syncCanonicalToTransactionRequiredDocuments({ transactionId, client: db, force }))
      results.push(await syncCanonicalToDocumentRequests({
        transactionId,
        contextType: requirement.context_type || 'transaction',
        contextId: requirement.context_id || transactionId,
        client: db,
        force,
      }))
    }
  }
  return results
}

async function getReadinessAfterChange(client, requirement = {}) {
  if (!requirement.context_type || !requirement.context_id) return null
  const result = await client
    .from('document_requirement_instances')
    .select('*')
    .eq('context_type', requirement.context_type)
    .eq('context_id', requirement.context_id)
  if (result.error) throw result.error
  return getRequirementReadiness(result.data || [])
}

export async function linkUploadedDocumentToRequirement({
  requirementInstanceId,
  documentId,
  documentTable = 'documents',
  contextType = '',
  contextId = '',
  actorRole = 'seller',
  actorUserId = null,
  metadata = {},
  reviewRequired = null,
  replacement = false,
  client = supabase,
  force = false,
  override = false,
} = {}) {
  if (!isCanonicalUploadLifecycleEnabled({ force })) {
    return { skipped: true, reason: 'canonical_upload_lifecycle_disabled', featureFlag: CANONICAL_UPLOAD_LIFECYCLE_FLAG }
  }
  const db = requireClient(client)
  const requirement = await loadRequirementInstance(db, requirementInstanceId)
  assertCanUploadRequirement(requirement, { actorRole, override })
  if (contextType && requirement.context_type !== contextType) throw new Error('Requirement context type does not match the upload context.')
  if (contextId && requirement.context_id !== contextId && requirement.listing_id !== contextId && requirement.transaction_id !== contextId) {
    throw new Error('Requirement context id does not match the upload context.')
  }

  const previousStatus = requirement.status || REQUIREMENT_STATUSES.pending
  const nextStatus = getNextUploadStatus(requirement, { reviewRequired })
  const hasExistingSatisfier = Boolean(getCurrentSatisfier(requirement))
  const isReplacement = Boolean(replacement || hasExistingSatisfier || previousStatus === REQUIREMENT_STATUSES.rejected || previousStatus === REQUIREMENT_STATUSES.expired)
  if (!canTransitionRequirementStatus(previousStatus, nextStatus, { replacement: isReplacement, explicit: isReplacement || override })) {
    await insertLifecycleEvent(db, requirement, REQUIREMENT_EVENT_TYPES.statusConflict, {
      actorRole,
      actorUserId,
      previousStatus,
      newStatus: nextStatus,
      documentId,
      message: 'Canonical upload did not change status because it would downgrade a completed requirement.',
      metadata: { attempted_event: isReplacement ? REQUIREMENT_EVENT_TYPES.replaced : REQUIREMENT_EVENT_TYPES.uploaded },
    })
    return {
      skipped: true,
      reason: 'unsafe_status_downgrade_prevented',
      requirement,
    }
  }

  await updateLinkedArtifact(db, documentTable, documentId, requirement.id)

  const definition = requirement.document_definitions || requirement.document_definition || requirement.definition || {}
  const expiryDate = calculateExpiryDate({ definition, baseDate: metadata.uploaded_at || new Date() })
  const documentUuid = normalizeUuid(documentId)
  const patch = {
    status: nextStatus,
    rejection_reason: null,
    ...(documentUuid ? { satisfied_by_document_id: documentUuid } : {}),
    ...(expiryDate ? { expiry_date: expiryDate } : {}),
  }
  const updated = await updateRequirementInstance(db, requirement, patch)
  await insertLifecycleEvent(db, updated, isReplacement ? REQUIREMENT_EVENT_TYPES.replaced : REQUIREMENT_EVENT_TYPES.uploaded, {
    actorRole,
    actorUserId,
    previousStatus,
    newStatus: nextStatus,
    documentId,
    message: isReplacement ? 'Replacement upload linked to canonical requirement.' : 'Upload linked to canonical requirement.',
    metadata: {
      document_table: documentTable,
      context_type: contextType || requirement.context_type,
      context_id: contextId || requirement.context_id,
      expiry_date: expiryDate,
      ...metadata,
    },
  })
  const legacySync = await syncLegacyForRequirement(updated, { client: db, force: true })
  const readiness = await getReadinessAfterChange(db, updated)
  return { requirement: updated, legacySync, readiness }
}

export async function startRequirementReview({
  requirementInstanceId,
  documentId = null,
  reviewerRole = 'agent',
  reviewerUserId = null,
  reviewNotes = '',
  client = supabase,
  force = false,
  override = false,
} = {}) {
  if (!isCanonicalReviewWorkflowEnabled({ force })) {
    return { skipped: true, reason: 'canonical_review_workflow_disabled', featureFlag: CANONICAL_REVIEW_WORKFLOW_FLAG }
  }
  const db = requireClient(client)
  const requirement = await loadRequirementInstance(db, requirementInstanceId)
  assertCanReviewRequirement(requirement, { reviewerRole, override })
  const previousStatus = requirement.status || REQUIREMENT_STATUSES.uploaded
  const updated = await updateRequirementInstance(db, requirement, { status: REQUIREMENT_STATUSES.underReview })
  const reviewWrite = await db.from('document_requirement_reviews').insert({
    requirement_instance_id: requirement.id,
    document_id: normalizeUuid(documentId || requirement.satisfied_by_document_id),
    review_status: CANONICAL_REVIEW_STATUSES.pending,
    reviewer_role: reviewerRole || requirement.reviewer_role || null,
    reviewer_user_id: normalizeUuid(reviewerUserId),
    review_notes: reviewNotes || null,
    reviewed_at: null,
  }).select('*').maybeSingle()
  if (reviewWrite.error) throw reviewWrite.error
  await insertLifecycleEvent(db, updated, REQUIREMENT_EVENT_TYPES.reviewStarted, {
    actorRole: reviewerRole,
    actorUserId: reviewerUserId,
    previousStatus,
    newStatus: REQUIREMENT_STATUSES.underReview,
    documentId: documentId || requirement.satisfied_by_document_id || null,
    reviewId: reviewWrite.data?.id || null,
    message: 'Canonical document review started.',
  })
  return { requirement: updated, review: reviewWrite.data || null }
}

async function completeRequirementReview({
  requirementInstanceId,
  documentId = null,
  reviewerRole = 'agent',
  reviewerUserId = null,
  reviewStatus,
  nextStatus,
  reviewNotes = '',
  rejectionReason = '',
  client = supabase,
  force = false,
  override = false,
} = {}) {
  if (!isCanonicalReviewWorkflowEnabled({ force })) {
    return { skipped: true, reason: 'canonical_review_workflow_disabled', featureFlag: CANONICAL_REVIEW_WORKFLOW_FLAG }
  }
  const db = requireClient(client)
  const requirement = await loadRequirementInstance(db, requirementInstanceId)
  assertCanReviewRequirement(requirement, { reviewerRole, override })
  const previousStatus = requirement.status || REQUIREMENT_STATUSES.underReview
  if (!canTransitionRequirementStatus(previousStatus, nextStatus, { explicit: true })) {
    throw new Error(`Unsafe canonical review transition from ${previousStatus} to ${nextStatus}.`)
  }

  const reviewedAt = new Date().toISOString()
  const reviewWrite = await db.from('document_requirement_reviews').insert({
    requirement_instance_id: requirement.id,
    document_id: normalizeUuid(documentId || requirement.satisfied_by_document_id),
    review_status: reviewStatus,
    reviewer_role: reviewerRole || requirement.reviewer_role || null,
    reviewer_user_id: normalizeUuid(reviewerUserId),
    review_notes: reviewNotes || null,
    rejection_reason: rejectionReason || null,
    reviewed_at: reviewedAt,
  }).select('*').maybeSingle()
  if (reviewWrite.error) throw reviewWrite.error

  const patch = {
    status: nextStatus,
    rejection_reason: nextStatus === REQUIREMENT_STATUSES.rejected ? rejectionReason || reviewNotes || 'Document rejected.' : null,
  }
  const definition = requirement.document_definitions || requirement.document_definition || requirement.definition || {}
  if (nextStatus === REQUIREMENT_STATUSES.approved || nextStatus === REQUIREMENT_STATUSES.completed) {
    const expiryDate = calculateExpiryDate({ definition, baseDate: reviewedAt })
    if (expiryDate) patch.expiry_date = expiryDate
  }

  const updated = await updateRequirementInstance(db, requirement, patch)
  const eventType = reviewStatus === CANONICAL_REVIEW_STATUSES.needsReupload
    ? REQUIREMENT_EVENT_TYPES.needsReupload
    : nextStatus === REQUIREMENT_STATUSES.approved
      ? REQUIREMENT_EVENT_TYPES.approved
      : nextStatus === REQUIREMENT_STATUSES.completed
        ? REQUIREMENT_EVENT_TYPES.completed
        : REQUIREMENT_EVENT_TYPES.rejected
  await insertLifecycleEvent(db, updated, eventType, {
    actorRole: reviewerRole,
    actorUserId: reviewerUserId,
    previousStatus,
    newStatus: nextStatus,
    documentId: documentId || requirement.satisfied_by_document_id || null,
    reviewId: reviewWrite.data?.id || null,
    reason: rejectionReason,
    message: nextStatus === REQUIREMENT_STATUSES.rejected ? 'Canonical document review rejected.' : 'Canonical document review approved.',
  })
  const legacySync = await syncLegacyForRequirement(updated, { client: db, force: true })
  const readiness = await getReadinessAfterChange(db, updated)
  return { requirement: updated, review: reviewWrite.data || null, legacySync, readiness }
}

export function approveRequirementReview(options = {}) {
  return completeRequirementReview({
    ...options,
    reviewStatus: CANONICAL_REVIEW_STATUSES.approved,
    nextStatus: options.complete ? REQUIREMENT_STATUSES.completed : REQUIREMENT_STATUSES.approved,
  })
}

export function rejectRequirementReview(options = {}) {
  const reason = normalizeText(options.rejectionReason || options.reviewNotes)
  if (!reason) throw new Error('A rejection reason is required.')
  return completeRequirementReview({
    ...options,
    reviewStatus: CANONICAL_REVIEW_STATUSES.rejected,
    nextStatus: REQUIREMENT_STATUSES.rejected,
    rejectionReason: reason,
  })
}

export function requestRequirementReupload(options = {}) {
  const reason = normalizeText(options.rejectionReason || options.reviewNotes)
  if (!reason) throw new Error('A re-upload reason is required.')
  return completeRequirementReview({
    ...options,
    reviewStatus: CANONICAL_REVIEW_STATUSES.needsReupload,
    nextStatus: REQUIREMENT_STATUSES.rejected,
    rejectionReason: reason,
  })
}

export async function waiveRequirement({
  requirementInstanceId,
  actorRole = 'agent',
  actorUserId = null,
  waiverReason = '',
  client = supabase,
  force = false,
  override = false,
} = {}) {
  if (!isCanonicalWaiverFlowEnabled({ force })) {
    return { skipped: true, reason: 'canonical_waiver_flow_disabled', featureFlag: CANONICAL_WAIVER_FLOW_FLAG }
  }
  assertCanWaiveRequirement({ actorRole, waiverReason, override })
  const db = requireClient(client)
  const requirement = await loadRequirementInstance(db, requirementInstanceId)
  const previousStatus = requirement.status || REQUIREMENT_STATUSES.pending
  const updated = await updateRequirementInstance(db, requirement, {
    status: REQUIREMENT_STATUSES.waived,
    waiver_reason: waiverReason,
  })
  await insertLifecycleEvent(db, updated, REQUIREMENT_EVENT_TYPES.waived, {
    actorRole,
    actorUserId,
    previousStatus,
    newStatus: REQUIREMENT_STATUSES.waived,
    reason: waiverReason,
    message: 'Canonical document requirement waived.',
  })
  const legacySync = await syncLegacyForRequirement(updated, { client: db, force: true })
  const readiness = await getReadinessAfterChange(db, updated)
  return { requirement: updated, legacySync, readiness }
}

export async function markExpiredRequirements({
  contextType = '',
  contextId = '',
  now = new Date(),
  client = supabase,
  force = false,
} = {}) {
  if (!isCanonicalUploadLifecycleEnabled({ force })) {
    return { skipped: true, reason: 'canonical_upload_lifecycle_disabled', featureFlag: CANONICAL_UPLOAD_LIFECYCLE_FLAG }
  }
  const db = requireClient(client)
  let query = db
    .from('document_requirement_instances')
    .select('*')
    .not('expiry_date', 'is', null)
    .not('status', 'in', `(${REQUIREMENT_STATUSES.expired},${REQUIREMENT_STATUSES.notApplicable},${REQUIREMENT_STATUSES.waived})`)
  if (contextType) query = query.eq('context_type', contextType)
  if (contextId) query = query.eq('context_id', contextId)
  const result = await query
  if (result.error) throw result.error

  const expired = (result.data || []).filter((requirement) => isRequirementExpired(requirement, now))
  const updated = []
  for (const requirement of expired) {
    const previousStatus = requirement.status
    const row = await updateRequirementInstance(db, requirement, { status: REQUIREMENT_STATUSES.expired })
    await insertLifecycleEvent(db, row, REQUIREMENT_EVENT_TYPES.expired, {
      actorRole: 'system',
      previousStatus,
      newStatus: REQUIREMENT_STATUSES.expired,
      message: 'Canonical document requirement expired.',
      metadata: { expiry_date: requirement.expiry_date },
    })
    await syncLegacyForRequirement(row, { client: db, force: true })
    updated.push(row)
  }
  return {
    expired: updated,
    readiness: contextType && contextId ? await getReadinessAfterChange(db, { context_type: contextType, context_id: contextId }) : null,
  }
}

export function inferPacketRequirementDefinitionKey(packet = {}, version = {}) {
  const source = {
    ...(packet.source_context_json || {}),
    ...(version.section_manifest_json || {}),
  }
  const packetType = normalizeKey(packet.packet_type || packet.type || source.packetType || source.packet_type)
  const templateKey = normalizeKey(packet.template_key || packet.templateKey || source.templateKey || source.template_key)
  const title = normalizeKey(packet.title || source.title)
  const signed = Boolean(version.final_signed_file_path || version.final_signed_file_url || version.final_signed_document_id || packet.status === 'completed')

  if (packetType.includes('otp') || templateKey.includes('otp') || title.includes('otp') || title.includes('offer to purchase')) return signed ? 'signed_otp' : 'generated_otp'
  if (packetType.includes('addendum') || templateKey.includes('addendum') || title.includes('addendum')) return 'signed_addendum'
  if (packetType.includes('transfer') || templateKey.includes('transfer') || title.includes('transfer')) return signed ? 'signed_transfer_documents' : 'transfer_documents'
  if (packetType.includes('mandate') || templateKey.includes('mandate') || title.includes('mandate')) return signed ? 'signed_mandate' : 'generated_mandate'
  return signed ? 'signed_packet_version' : ''
}

async function findRequirementForPacket(client, {
  requirementInstanceId = '',
  contextType = '',
  contextId = '',
  transactionId = '',
  listingId = '',
  documentDefinitionKey = '',
} = {}) {
  if (requirementInstanceId) return loadRequirementInstance(client, requirementInstanceId)
  const definitionKey = normalizeKey(documentDefinitionKey)
  if (!definitionKey) throw new Error('documentDefinitionKey or requirementInstanceId is required for packet satisfaction.')
  let query = client
    .from('document_requirement_instances')
    .select('*, document_definitions(*)')
    .eq('document_definition_key', definitionKey)
    .neq('status', REQUIREMENT_STATUSES.notApplicable)
    .limit(1)
  if (contextType) query = query.eq('context_type', contextType)
  if (contextId) query = query.eq('context_id', contextId)
  if (transactionId) query = query.eq('transaction_id', transactionId)
  if (listingId) query = query.eq('listing_id', listingId)
  const result = await query.maybeSingle()
  if (result.error) throw result.error
  if (!result.data) throw new Error('No canonical document requirement instance matched the packet.')
  return result.data
}

export async function linkPacketToRequirement({
  requirementInstanceId = '',
  packetId = null,
  packetVersionId,
  packet = {},
  version = {},
  documentDefinitionKey = '',
  contextType = '',
  contextId = '',
  transactionId = '',
  listingId = '',
  actorRole = 'system',
  actorUserId = null,
  metadata = {},
  client = supabase,
  force = false,
  override = false,
} = {}) {
  if (!isCanonicalPacketSatisfactionEnabled({ force })) {
    return { skipped: true, reason: 'canonical_packet_satisfaction_disabled', featureFlag: CANONICAL_PACKET_SATISFACTION_FLAG }
  }
  if (!packetVersionId && !packetId) throw new Error('packetVersionId or packetId is required.')
  const db = requireClient(client)
  const inferredKey = documentDefinitionKey || inferPacketRequirementDefinitionKey(packet, version)
  const requirement = await findRequirementForPacket(db, {
    requirementInstanceId,
    contextType,
    contextId,
    transactionId,
    listingId,
    documentDefinitionKey: inferredKey,
  })
  if (!override && !actorHasInternalAccess(actorRole)) throw new Error('This role cannot link generated packets to canonical requirements.')

  const previousStatus = requirement.status || REQUIREMENT_STATUSES.pending
  const resolvedPacketId = normalizeUuid(packetId || packet.id || version.packet_id)
  const resolvedVersionId = normalizeUuid(packetVersionId || version.id)
  if (resolvedVersionId) await updateLinkedArtifact(db, 'document_packet_versions', resolvedVersionId, requirement.id)
  if (resolvedPacketId) await updateLinkedArtifact(db, 'document_packets', resolvedPacketId, requirement.id)

  const updated = await updateRequirementInstance(db, requirement, {
    status: REQUIREMENT_STATUSES.completed,
    ...(resolvedPacketId ? { satisfied_by_packet_id: resolvedPacketId } : {}),
    ...(resolvedVersionId ? { satisfied_by_packet_version_id: resolvedVersionId } : {}),
    rejection_reason: null,
  })
  await insertLifecycleEvent(db, updated, REQUIREMENT_EVENT_TYPES.packetLinked, {
    actorRole,
    actorUserId,
    previousStatus,
    newStatus: REQUIREMENT_STATUSES.completed,
    packetId: resolvedPacketId,
    packetVersionId: resolvedVersionId,
    message: 'Generated or signed packet linked to canonical requirement.',
    metadata: {
      document_definition_key: inferredKey || requirement.document_definition_key,
      ...metadata,
    },
  })
  await insertLifecycleEvent(db, updated, REQUIREMENT_EVENT_TYPES.completed, {
    actorRole,
    actorUserId,
    previousStatus,
    newStatus: REQUIREMENT_STATUSES.completed,
    packetId: resolvedPacketId,
    packetVersionId: resolvedVersionId,
    message: 'Canonical requirement completed by generated or signed packet.',
  })
  const legacySync = await syncLegacyForRequirement(updated, { client: db, force: true })
  const readiness = await getReadinessAfterChange(db, updated)
  return { requirement: updated, legacySync, readiness }
}

export {
  getCurrentSatisfier,
  getRequirementSatisfactionState,
  isRequirementBlocking,
  isRequirementProvisionallySatisfied,
  isRequirementSatisfied,
}
