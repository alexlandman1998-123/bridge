import {
  canonicalDefinitionKeyToLegacyKey,
  canonicalInstanceToTransactionRequiredDocument,
  canonicalStatusToDocumentRequestStatus,
  legacyRequirementKeyToCanonicalKey,
  pickStrongerCanonicalStatus,
} from './canonicalDocumentAdapterService'
import {
  REQUIREMENT_EVENT_TYPES,
  REQUIREMENT_STATUSES,
  isRequirementSatisfied,
} from './canonicalDocumentResolverService'

export const STAGING_LINK_CLEANUP_SOURCE = 'staging_link_projection_cleanup'
export const STAGING_LINK_CLEANUP_VERSION = 'canonical_document_staging_link_projection_cleanup_v1'

const HIGH_CONFIDENCE = 95
const MANUAL_CONFIDENCE = 0
const INTERNAL_ONLY_DOCUMENT_TYPES = new Set(['internal_note'])

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeArray(value) {
  if (!value) return []
  return Array.isArray(value) ? value.filter(Boolean) : [value]
}

function rowContextId(row = {}) {
  return normalizeText(row.context_id || row.transaction_id || row.private_listing_id || row.listing_id)
}

function rowLegacyKey(row = {}) {
  return normalizeKey(row.document_definition_key || row.requirement_key || row.document_key || row.document_type || row.packet_type || row.category)
}

function rowId(row = {}) {
  return normalizeText(row.id || row.document_id || row.request_id || row.packet_version_id)
}

function latestRowsByRequirement(plans = []) {
  const grouped = new Map()
  for (const plan of plans) {
    const key = plan.canonicalRequirementInstanceId
    const bucket = grouped.get(key) || []
    bucket.push(plan)
    grouped.set(key, bucket)
  }

  const currentSatisfierByRequirement = new Map()
  for (const [requirementId, rows] of grouped.entries()) {
    const sorted = [...rows].sort((left, right) => {
      const rightTime = Date.parse(right.createdAt || '') || 0
      const leftTime = Date.parse(left.createdAt || '') || 0
      return rightTime - leftTime
    })
    currentSatisfierByRequirement.set(requirementId, sorted[0]?.documentId || null)
  }
  return currentSatisfierByRequirement
}

function groupCounts(rows = [], keyFn) {
  const counts = new Map()
  for (const row of rows) {
    const key = keyFn(row)
    if (!key) continue
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([key, count]) => ({ key, count }))
}

function contextMatches(row = {}, instance = {}) {
  const contextId = rowContextId(row)
  if (!contextId) return false
  return [
    instance.context_id,
    instance.transaction_id,
    instance.listing_id,
  ].map(normalizeText).includes(contextId)
}

function findInstanceByLegacyRow(row = {}, canonicalInstances = []) {
  const canonicalKey = legacyRequirementKeyToCanonicalKey(rowLegacyKey(row))
  if (!canonicalKey) return { instance: null, strategy: 'unmapped_key' }

  const matches = canonicalInstances.filter((instance) => (
    normalizeKey(instance.document_definition_key) === canonicalKey &&
    contextMatches(row, instance)
  ))
  if (matches.length === 1) return { instance: matches[0], strategy: 'explicit_key_and_context' }
  if (matches.length > 1) return { instance: null, strategy: 'ambiguous_key_and_context', matches }
  return { instance: null, strategy: 'no_context_match' }
}

function documentStatusToCanonicalStatus(document = {}) {
  switch (normalizeKey(document.status || document.review_status)) {
    case 'approved':
    case 'accepted':
      return REQUIREMENT_STATUSES.approved
    case 'rejected':
    case 'reupload_required':
      return REQUIREMENT_STATUSES.rejected
    case 'under_review':
      return REQUIREMENT_STATUSES.underReview
    default:
      return REQUIREMENT_STATUSES.uploaded
  }
}

function requestReminderType(instance = {}) {
  if (instance.status === REQUIREMENT_STATUSES.rejected) return 'rejected_documents'
  if (instance.status === REQUIREMENT_STATUSES.expired) return 'expired_documents'
  if (instance.status === REQUIREMENT_STATUSES.underReview || instance.status === REQUIREMENT_STATUSES.uploaded) return 'documents_awaiting_review'
  if (instance.requirement_level === 'blocker') return 'missing_blocker_documents'
  return 'stale_upload_request'
}

function requestReminderStatus(instance = {}) {
  return isRequirementSatisfied(instance) ? 'completed' : 'scheduled'
}

function buildManualReview(operation, row = {}, reason = '', extra = {}) {
  return {
    operation,
    sourceId: rowId(row) || null,
    documentId: operation === 'link_document' ? rowId(row) || null : undefined,
    documentRequestId: operation === 'link_document_request' ? rowId(row) || null : undefined,
    legacyKey: rowLegacyKey(row),
    contextId: rowContextId(row),
    confidence: MANUAL_CONFIDENCE,
    action: 'manual-review',
    reason,
    ...extra,
  }
}

function buildDocumentLinkPlan(document = {}, canonicalInstances = []) {
  const legacyKey = rowLegacyKey(document)
  if (INTERNAL_ONLY_DOCUMENT_TYPES.has(legacyKey)) {
    return { plan: null, manualReview: buildManualReview('link_document', document, 'internal_only_document_type') }
  }
  if (!rowContextId(document)) {
    return { plan: null, manualReview: buildManualReview('link_document', document, 'missing_transaction_context') }
  }

  const match = findInstanceByLegacyRow(document, canonicalInstances)
  if (!match.instance) {
    return { plan: null, manualReview: buildManualReview('link_document', document, match.strategy) }
  }

  const existingSatisfier = normalizeText(match.instance.satisfied_by_document_id)
  if (existingSatisfier && existingSatisfier !== rowId(document)) {
    return {
      plan: null,
      manualReview: buildManualReview('link_document', document, 'requirement_has_existing_different_satisfier', {
        canonicalRequirementInstanceId: match.instance.id,
        existingSatisfierDocumentId: existingSatisfier,
      }),
    }
  }

  const incomingStatus = documentStatusToCanonicalStatus(document)
  const nextStatus = pickStrongerCanonicalStatus(match.instance.status, incomingStatus)

  return {
    plan: {
      operation: 'link_document',
      action: 'auto-link',
      documentId: rowId(document),
      canonicalRequirementInstanceId: match.instance.id,
      transactionId: match.instance.transaction_id || rowContextId(document),
      contextId: match.instance.context_id || rowContextId(document),
      documentKey: legacyKey,
      canonicalKey: match.instance.document_definition_key,
      confidence: HIGH_CONFIDENCE,
      matchReason: match.strategy,
      currentStatus: match.instance.status,
      incomingStatus,
      nextStatus,
      createdAt: document.created_at || null,
      updateCurrentSatisfier: !existingSatisfier || existingSatisfier === rowId(document),
    },
    manualReview: null,
  }
}

function buildDocumentRequestPlan(request = {}, canonicalInstances = [], reminders = []) {
  if (request.canonical_requirement_instance_id) return { plan: null, manualReview: null }
  if (!rowContextId(request)) {
    return { plan: null, manualReview: buildManualReview('link_document_request', request, 'missing_transaction_context') }
  }
  const match = findInstanceByLegacyRow(request, canonicalInstances)
  if (!match.instance) {
    return { plan: null, manualReview: buildManualReview('link_document_request', request, match.strategy) }
  }
  const existingReminder = reminders.find((reminder) => (
    reminder.requirement_instance_id === match.instance.id &&
    reminder.metadata_json?.legacy_document_request_id === request.id
  ))

  return {
    plan: {
      operation: 'link_document_request',
      action: 'auto-link',
      documentRequestId: request.id,
      canonicalRequirementInstanceId: match.instance.id,
      transactionId: match.instance.transaction_id || rowContextId(request),
      contextId: match.instance.context_id || rowContextId(request),
      documentKey: rowLegacyKey(request),
      canonicalKey: match.instance.document_definition_key,
      confidence: HIGH_CONFIDENCE,
      matchReason: match.strategy,
      createReminder: !existingReminder,
      existingReminderId: existingReminder?.id || null,
      reminderType: requestReminderType(match.instance),
      reminderStatus: requestReminderStatus(match.instance),
      requestStatus: request.status || null,
    },
    manualReview: null,
  }
}

function buildProjectionPlan(instance = {}, legacyRequirements = []) {
  if (instance.context_type !== 'transaction' || !instance.transaction_id) return null
  if (instance.status === REQUIREMENT_STATUSES.notApplicable) return null
  const legacyKey = canonicalDefinitionKeyToLegacyKey(instance.document_definition_key)
  const exists = legacyRequirements.some((row) => (
    normalizeText(row.transaction_id) === normalizeText(instance.transaction_id) &&
    rowLegacyKey(row) === legacyKey
  ))
  if (exists) return null

  return {
    operation: 'create_legacy_projection',
    action: 'auto-link',
    instance,
    canonicalRequirementInstanceId: instance.id,
    transactionId: instance.transaction_id,
    contextId: instance.context_id,
    documentKey: legacyKey,
    canonicalKey: instance.document_definition_key,
    confidence: HIGH_CONFIDENCE,
    matchReason: 'canonical_transaction_instance_without_legacy_projection',
    status: instance.status,
  }
}

function buildPacketManualReview(packet = {}) {
  const contextId = rowContextId(packet)
  if (!contextId) return buildManualReview('link_packet_version', packet, 'missing_transaction_context')
  return buildManualReview('link_packet_version', packet, 'no_safe_packet_link_candidate')
}

export function buildStagingLinkProjectionCleanupPlan({
  canonicalInstances = [],
  transactionRequiredDocuments = [],
  documents = [],
  documentRequests = [],
  reminders = [],
  packetVersions = [],
} = {}) {
  const activeInstances = canonicalInstances.filter((instance) => instance.status !== REQUIREMENT_STATUSES.notApplicable)
  const documentLinks = []
  const documentRequestLinks = []
  const legacyProjectionCreates = []
  const manualReview = []

  for (const document of documents.filter((row) => !row.canonical_requirement_instance_id)) {
    const result = buildDocumentLinkPlan(document, activeInstances)
    if (result.plan) documentLinks.push(result.plan)
    if (result.manualReview) manualReview.push(result.manualReview)
  }

  const currentSatisfierByRequirement = latestRowsByRequirement(documentLinks)
  const normalizedDocumentLinks = documentLinks.map((plan) => ({
    ...plan,
    updateCurrentSatisfier: plan.updateCurrentSatisfier && currentSatisfierByRequirement.get(plan.canonicalRequirementInstanceId) === plan.documentId,
  }))

  for (const request of documentRequests) {
    const result = buildDocumentRequestPlan(request, activeInstances, reminders)
    if (result.plan) documentRequestLinks.push(result.plan)
    if (result.manualReview) manualReview.push(result.manualReview)
  }

  for (const instance of activeInstances) {
    const plan = buildProjectionPlan(instance, transactionRequiredDocuments)
    if (plan) legacyProjectionCreates.push(plan)
  }

  for (const packet of packetVersions.filter((row) => !row.canonical_requirement_instance_id && !row.requirement_instance_id)) {
    manualReview.push(buildPacketManualReview(packet))
  }

  const safeAutoLinks = [
    ...normalizedDocumentLinks,
    ...documentRequestLinks,
    ...legacyProjectionCreates,
  ]

  return {
    dryRun: true,
    sourceSystem: STAGING_LINK_CLEANUP_SOURCE,
    cleanupVersion: STAGING_LINK_CLEANUP_VERSION,
    safeAutoLinks,
    documentLinks: normalizedDocumentLinks,
    generatedArtifactLinks: normalizedDocumentLinks.filter((plan) => [
      'signed_otp',
      'otp',
      'otp_pending_approval',
      'transfer_document_pack',
      'signed_transfer_pack',
      'closing_pack',
      'final_signed_packet',
      'registration_confirmation',
    ].includes(plan.documentKey)),
    documentRequestLinks,
    legacyProjectionCreates,
    manualReview,
    skipped: manualReview.filter((item) => item.action === 'manual-review'),
    summary: {
      safeAutoLinkCount: safeAutoLinks.length,
      documentLinkCount: normalizedDocumentLinks.length,
      generatedArtifactLinkCount: normalizedDocumentLinks.filter((plan) => [
        'signed_otp',
        'otp',
        'otp_pending_approval',
        'transfer_document_pack',
        'signed_transfer_pack',
        'closing_pack',
        'final_signed_packet',
        'registration_confirmation',
      ].includes(plan.documentKey)).length,
      documentRequestLinkCount: documentRequestLinks.length,
      legacyProjectionCreateCount: legacyProjectionCreates.length,
      manualReviewCount: manualReview.length,
      byOperation: groupCounts(safeAutoLinks, (row) => row.operation),
      manualReviewByReason: groupCounts(manualReview, (row) => row.reason),
    },
  }
}

function buildEvent(requirementInstanceId, eventType, message, metadata = {}) {
  return {
    requirement_instance_id: requirementInstanceId,
    event_type: eventType,
    actor_role: 'system',
    actor_user_id: null,
    message,
    metadata_json: {
      source_system: STAGING_LINK_CLEANUP_SOURCE,
      cleanup_version: STAGING_LINK_CLEANUP_VERSION,
      ...metadata,
    },
  }
}

function randomUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  throw new Error('crypto.randomUUID is required for staging projection row ids.')
}

function normalizeTransactionRequiredRole(role = '') {
  const normalized = normalizeKey(role)
  if (['seller', 'buyer', 'client', 'agent', 'developer', 'bond_originator', 'system'].includes(normalized)) return normalized
  if (['transferring_attorney', 'bond_attorney', 'cancellation_attorney', 'attorney'].includes(normalized)) return 'attorney'
  return 'client'
}

async function insertEvents(client, events = []) {
  if (!events.length) return 0
  const result = await client.from('document_requirement_events').insert(events)
  if (result.error) throw result.error
  return events.length
}

export async function writeStagingLinkProjectionCleanupPlan({ client, plan, write = false, createReminders = false } = {}) {
  if (!write) {
    return {
      dryRun: true,
      documentsLinked: 0,
      requirementSatisfiersUpdated: 0,
      documentRequestsLinked: 0,
      remindersCreated: 0,
      legacyProjectionRowsCreated: 0,
      eventsCreated: 0,
    }
  }
  if (!client) throw new Error('client is required for write mode.')

  const events = []
  let documentsLinked = 0
  let requirementSatisfiersUpdated = 0
  let documentRequestsLinked = 0
  let remindersCreated = 0
  let legacyProjectionRowsCreated = 0

  for (const item of normalizeArray(plan?.documentLinks)) {
    const documentWrite = await client
      .from('documents')
      .update({ canonical_requirement_instance_id: item.canonicalRequirementInstanceId })
      .eq('id', item.documentId)
      .is('canonical_requirement_instance_id', null)
    if (documentWrite.error) throw documentWrite.error
    documentsLinked += 1

    if (item.updateCurrentSatisfier) {
      const instanceWrite = await client
        .from('document_requirement_instances')
        .update({
          status: item.nextStatus,
          satisfied_by_document_id: item.documentId,
          source_system: STAGING_LINK_CLEANUP_SOURCE,
        })
        .eq('id', item.canonicalRequirementInstanceId)
      if (instanceWrite.error) throw instanceWrite.error
      requirementSatisfiersUpdated += 1
    }

    events.push(buildEvent(
      item.canonicalRequirementInstanceId,
      REQUIREMENT_EVENT_TYPES.legacyUploadLinked,
      'Staging link cleanup linked uploaded document to canonical requirement.',
      {
        document_id: item.documentId,
        legacy_key: item.documentKey,
        canonical_key: item.canonicalKey,
        confidence: item.confidence,
        match_reason: item.matchReason,
        previous_status: item.currentStatus,
        next_status: item.nextStatus,
        updated_current_satisfier: item.updateCurrentSatisfier,
      },
    ))
  }

  for (const item of normalizeArray(plan?.documentRequestLinks)) {
    const requestWrite = await client
      .from('document_requests')
      .update({ canonical_requirement_instance_id: item.canonicalRequirementInstanceId })
      .eq('id', item.documentRequestId)
      .is('canonical_requirement_instance_id', null)
    if (requestWrite.error) throw requestWrite.error
    documentRequestsLinked += 1

    if (item.createReminder && createReminders) {
      const reminderWrite = await client
        .from('document_requirement_reminders')
        .insert({
          requirement_instance_id: item.canonicalRequirementInstanceId,
          context_type: 'transaction',
          context_id: item.contextId,
          recipient_role: null,
          recipient_contact_id: null,
          recipient_email: null,
          reminder_type: item.reminderType,
          channel: 'manual',
          status: item.reminderStatus,
          reminder_count: 0,
          escalation_count: 0,
          metadata_json: {
            source_system: STAGING_LINK_CLEANUP_SOURCE,
            cleanup_version: STAGING_LINK_CLEANUP_VERSION,
            legacy_document_request_id: item.documentRequestId,
            legacy_key: item.documentKey,
            request_status: item.requestStatus,
          },
        })
        .select('id')
        .maybeSingle()
      if (reminderWrite.error) throw reminderWrite.error
      remindersCreated += 1

      if (reminderWrite.data?.id) {
        const reminderItemWrite = await client
          .from('document_requirement_reminder_items')
          .insert({
            reminder_id: reminderWrite.data.id,
            requirement_instance_id: item.canonicalRequirementInstanceId,
          })
        if (reminderItemWrite.error) throw reminderItemWrite.error
      }
    }

    events.push(buildEvent(
      item.canonicalRequirementInstanceId,
      REQUIREMENT_EVENT_TYPES.documentRequestCreated,
      'Staging link cleanup aligned legacy document request to canonical requirement/reminder.',
      {
        document_request_id: item.documentRequestId,
        legacy_key: item.documentKey,
        canonical_key: item.canonicalKey,
        confidence: item.confidence,
        match_reason: item.matchReason,
        reminder_created: item.createReminder,
        reminder_create_attempted: Boolean(createReminders),
        reminder_status: item.reminderStatus,
      },
    ))
  }

  if (normalizeArray(plan?.legacyProjectionCreates).length) {
    const documentLinkByRequirement = new Map(normalizeArray(plan?.documentLinks).map((item) => [item.canonicalRequirementInstanceId, item]))
    const rows = plan.legacyProjectionCreates.map((item) => {
      const instance = plan.instancesById?.get(item.canonicalRequirementInstanceId) || item.instance
      const linkedDocument = documentLinkByRequirement.get(item.canonicalRequirementInstanceId)
      const projectedInstance = linkedDocument
        ? {
          ...instance,
          status: linkedDocument.nextStatus || instance.status,
          satisfied_by_document_id: linkedDocument.documentId || instance.satisfied_by_document_id,
        }
        : instance
      return {
        ...canonicalInstanceToTransactionRequiredDocument(projectedInstance),
        id: randomUuid(),
        required_from_role: normalizeTransactionRequiredRole(projectedInstance.requested_from_role),
      }
    }).filter((row) => row.transaction_id && row.document_key)

    if (rows.length) {
      const projectionWrite = await client
        .from('transaction_required_documents')
        .insert(rows)
      if (projectionWrite.error) throw projectionWrite.error
      legacyProjectionRowsCreated += rows.length

      for (const item of plan.legacyProjectionCreates) {
        events.push(buildEvent(
          item.canonicalRequirementInstanceId,
          REQUIREMENT_EVENT_TYPES.legacySynced,
          'Staging link cleanup created missing transaction_required_documents projection.',
          {
            legacy_table: 'transaction_required_documents',
            transaction_id: item.transactionId,
            legacy_key: item.documentKey,
            canonical_key: item.canonicalKey,
            confidence: item.confidence,
            match_reason: item.matchReason,
          },
        ))
      }
    }
  }

  const eventsCreated = await insertEvents(client, events)

  return {
    dryRun: false,
    documentsLinked,
    requirementSatisfiersUpdated,
    documentRequestsLinked,
    remindersCreated,
    legacyProjectionRowsCreated,
    eventsCreated,
  }
}
