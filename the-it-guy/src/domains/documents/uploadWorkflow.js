// documents owns these operations and their existing recovery behavior.
import { uploadToDocumentsBucket, removeUploadedDocumentObject } from '../../lib/api/shared/storage.js'
import { logTransactionEventIfPossible } from '../transactions/eventActions.js'
import { resolveActiveProfileContext } from '../access/actorContext.js'
import { getSignedUrl } from './listReadApi.js'
import { normalizeNullableUuid, normalizeNullableText, isUuidLike, requireClient, isMissingTableError, isMissingColumnError, isMissingSchemaError, isPermissionDeniedError } from '../../lib/api/shared/readHelpers.js'
import { normalizeDocumentRequestRow, normalizeDocumentRequestPriorityValue, normalizeRequestRoleScope } from './requirementReadModel.js'
import { trackTransactionBackgroundWork } from '../../lib/transactionBackgroundWork.js'
import { runRecoverableDocumentUpload, readSavedUploadByPath, isDefiniteUploadSaveRejection } from '../../lib/documentUploadRecovery.js'
import { DOCUMENTS_BUCKET_CANDIDATES, createScopedSupabaseClient } from '../../lib/supabaseClient'
import { validateDocumentUploadFile } from '../../lib/documentUploadPolicy'
import { reportDocumentUploadTelemetry } from '../../lib/documentUploadObservability'
import { createDocumentUploadProgressReporter } from '../../lib/documentUploadLifecycle'
import { persistAttorneyDocument, isDefiniteDocumentSaveFailure } from '../../services/documents/attorneyDocumentPersistence.js'
import { normalizePortalDocumentType } from '../../core/documents/portalDocumentMetadata'
import { normalizeRoleType } from '../../core/transactions/permissions'
import { requireExternalAccessTokenClient, normalizeExternalAccessRoleToTransactionRole, resolveExternalAccessByToken, ensureExternalWorkspaceRole, resolveExternalWorkspaceTransactionIds } from '../access/externalApi.js'
import { isMissingFunctionError, createTransactionNotificationIfPossible } from '../transactions/participantInfrastructure.js'
import { processWorkflowEvidenceIfPossible, fetchNotificationTargetsByRole } from '../bond/financeRead.js'
import { normalizeDocumentKeyCandidate } from '../clientPortal/tokenHelpers.js'
import { runDocumentAutomationIfPossible } from './uploadAutomation.js'

const CANONICAL_UPLOAD_CATEGORY_KEY_HINTS = {
  'instruction / otp documents': 'signed_otp',
  'buyer fica / compliance': 'buyer_id_document',
  'seller fica / compliance': 'seller_id_document',
  'drafting documents': 'transfer_documents',
  'signing documents': 'signed_transfer_documents',
  guarantees: 'guarantees',
  'clearance documents': 'rates_clearance_certificate',
  'lodgement documents': 'lodgement_confirmation',
  'registration / close-out documents': 'registration_confirmation',
}

async function updateDocumentRequestFromUploadIfPossible(
  client,
  {
    transactionId,
    documentId,
    category,
    documentName,
    documentRequestId = null,
    actorRole = null,
    actorUserId = null,
  } = {},
) {
  if (!transactionId || !documentId) {
    return null
  }

  const normalizedCategory = String(category || '')
    .trim()
    .toLowerCase()
  const normalizedName = String(documentName || '')
    .trim()
    .toLowerCase()

  let requestQuery = client
    .from('document_requests')
    .select('id, transaction_id, category, document_type, title, priority, status, assigned_to_role, created_at')
    .eq('transaction_id', transactionId)

  if (documentRequestId) {
    requestQuery = requestQuery.eq('id', documentRequestId)
  } else {
    requestQuery = requestQuery.in('status', ['requested', 'rejected', 'reviewed', 'under_review'])
  }

  let requestsResult = await requestQuery.order('created_at', {
    ascending: false,
  })

  if (
    requestsResult.error &&
    (isMissingColumnError(requestsResult.error, 'requires_review') ||
      isMissingColumnError(requestsResult.error, 'requested_document_id') ||
      isMissingColumnError(requestsResult.error, 'requested_from') ||
      isMissingColumnError(requestsResult.error, 'visibility_scope') ||
      isMissingColumnError(requestsResult.error, 'request_type') ||
      isMissingColumnError(requestsResult.error, 'notes'))
  ) {
    requestsResult = await client
      .from('document_requests')
      .select('id, transaction_id, category, document_type, title, priority, status, assigned_to_role, created_at')
      .eq('transaction_id', transactionId)
      .order('created_at', { ascending: false })
  }

  if (requestsResult.error) {
    if (isMissingTableError(requestsResult.error, 'document_requests') || isMissingSchemaError(requestsResult.error)) {
      return null
    }
    throw requestsResult.error
  }

  const requests = (requestsResult.data || []).map((item) => normalizeDocumentRequestRow(item))
  if (!requests.length) {
    return null
  }

  const ranked = requests
    .filter((item) => ['requested', 'rejected', 'reviewed', 'under_review'].includes(item.status))
    .filter((item) => {
      if (documentRequestId) {
        return item.id === documentRequestId
      }
      if (!normalizedCategory && !normalizedName) return true
      const requestCategory = String(item.category || '')
        .trim()
        .toLowerCase()
      const requestType = String(item.documentType || '')
        .trim()
        .toLowerCase()
      const requestTitle = String(item.title || '')
        .trim()
        .toLowerCase()
      return (
        (normalizedCategory &&
          (requestCategory === normalizedCategory ||
            requestType === normalizedCategory ||
            requestTitle.includes(normalizedCategory))) ||
        (normalizedName &&
          ((requestType && normalizedName.includes(requestType)) ||
            (requestTitle && normalizedName.includes(requestTitle))))
      )
    })
    .sort((left, right) => {
      const rank = {
        urgent: 4,
        required: 3,
        important: 2,
        normal: 2,
        optional: 1,
      }
      const priorityDelta =
        (rank[normalizeDocumentRequestPriorityValue(right.priority)] || 0) -
        (rank[normalizeDocumentRequestPriorityValue(left.priority)] || 0)
      if (priorityDelta !== 0) return priorityDelta
      return new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime()
    })

  const target = ranked[0]
  if (!target?.id) {
    return null
  }

  const nextStatus = target.requiresReview ? 'uploaded' : 'completed'
  const now = new Date().toISOString()
  const payload = {
    status: nextStatus,
    requested_document_id: documentId,
    completed_at: nextStatus === 'completed' ? now : null,
    rejected_reason: null,
    updated_at: now,
  }

  let update = await client
    .from('document_requests')
    .update(payload)
    .eq('id', target.id)
    .select(
      'id, transaction_id, category, document_type, title, description, priority, due_date, assigned_to_role, assigned_to_user_id, request_group_id, status, requires_review, requested_document_id, created_by, created_by_role, completed_at, rejected_reason, resend_count, last_resent_at, requested_from, visibility_scope, request_type, notes, created_at, updated_at',
    )
    .single()

  if (
    update.error &&
    (isMissingColumnError(update.error, 'requested_document_id') ||
      isMissingColumnError(update.error, 'completed_at') ||
      isMissingColumnError(update.error, 'rejected_reason') ||
      isMissingColumnError(update.error, 'requested_from') ||
      isMissingColumnError(update.error, 'visibility_scope') ||
      isMissingColumnError(update.error, 'request_type') ||
      isMissingColumnError(update.error, 'notes') ||
      isMissingColumnError(update.error, 'updated_at'))
  ) {
    update = await client
      .from('document_requests')
      .update({ status: nextStatus })
      .eq('id', target.id)
      .select(
        'id, transaction_id, category, document_type, title, priority, due_date, assigned_to_role, status, requested_from, visibility_scope, request_type, notes, created_at',
      )
      .single()
  }

  if (update.error) {
    if (isMissingTableError(update.error, 'document_requests') || isMissingSchemaError(update.error)) {
      return null
    }
    throw update.error
  }

  const normalizedUpdated = normalizeDocumentRequestRow(update.data)
  await logTransactionEventIfPossible(client, {
    transactionId,
    eventType: 'TransactionUpdated',
    createdBy: actorUserId || null,
    createdByRole: actorRole || null,
    eventData: {
      source: 'document_request_upload_linked',
      requestId: normalizedUpdated.id,
      documentId,
      status: normalizedUpdated.status,
    },
  })

  if (
    normalizedUpdated.status === 'uploaded' &&
    normalizeRequestRoleScope(normalizedUpdated.assignedToRole) === 'attorney'
  ) {
    const targets = await fetchNotificationTargetsByRole(client, {
      transactionId,
      roleTypes: ['attorney'],
    })
    for (const targetUser of targets) {
      await createTransactionNotificationIfPossible(client, {
        transactionId,
        userId: targetUser.userId,
        roleType: targetUser.roleType || 'attorney',
        notificationType: 'document_uploaded',
        title: 'Document uploaded for review',
        message: `${normalizedUpdated.title || 'A document'} was uploaded and is waiting for review.`,
        eventType: 'DocumentUploaded',
        eventData: {
          requestId: normalizedUpdated.id,
          documentId,
          source: 'document_request_upload_linked',
        },
        dedupeKey: `doc-request-upload:${normalizedUpdated.id}:${documentId}:${targetUser.userId}`,
      })
    }
  }

  return normalizedUpdated
}

export async function uploadExternalDocument({
  accessToken,
  transactionId = null,
  file,
  category,
  requiredDocumentKey = null,
}) {
  const client = requireExternalAccessTokenClient(accessToken)
  const access = await resolveExternalAccessByToken(client, accessToken)
  ensureExternalWorkspaceRole(access)
  const accessibleTransactionIds = await resolveExternalWorkspaceTransactionIds(client, access)
  const targetTransactionId = transactionId || access.transaction_id

  if (!accessibleTransactionIds.includes(targetTransactionId)) {
    throw new Error('This transaction is not available for your access link.')
  }
  const filePolicy = validateDocumentUploadFile(file, { surface: 'external_workspace', transactionId: targetTransactionId })

  const safeName = filePolicy.safeName
  return runRecoverableDocumentUpload({ client: client, scope: ['external_workspace', accessToken, targetTransactionId, category, requiredDocumentKey], file, storageBuckets: DOCUMENTS_BUCKET_CANDIDATES,
    run: async attempt => {
      const filePath = attempt.path(`external-${access.id}/transaction-${targetTransactionId}/${Date.now()}-${safeName}`)
      const normalizedDocumentType =
        normalizePortalDocumentType(requiredDocumentKey || category || file.name) || 'external_shared_document'

      const uploadedBucket = await attempt.upload(() => uploadToDocumentsBucket(client, filePath, file))

      const result = await attempt.persist({
        save: async () => {
          let result = await client
            .from('documents')
            .insert({
              transaction_id: targetTransactionId,
              name: safeName,
              file_path: filePath,
              category: category || 'General',
              document_type: normalizedDocumentType,
              visibility_scope: 'shared',
              uploaded_by_user_id: null,
              stage_key: null,
              is_client_visible: true,
              uploaded_by_role: access.role,
              uploaded_by_email: access.email,
              external_access_id: access.id,
            })
            .select(
              'id, transaction_id, name, file_path, category, document_type, visibility_scope, stage_key, uploaded_by_user_id, is_client_visible, uploaded_by_role, uploaded_by_email, external_access_id, created_at',
            )
            .single()

          if (
            result.error &&
            (isMissingColumnError(result.error, 'document_type') ||
              isMissingColumnError(result.error, 'visibility_scope') ||
              isMissingColumnError(result.error, 'stage_key') ||
              isMissingColumnError(result.error, 'uploaded_by_user_id') ||
              isMissingColumnError(result.error, 'is_client_visible') ||
              isMissingColumnError(result.error, 'uploaded_by_role') ||
              isMissingColumnError(result.error, 'uploaded_by_email') ||
              isMissingColumnError(result.error, 'external_access_id'))
          ) {
            result = await client
              .from('documents')
              .insert({
                transaction_id: targetTransactionId,
                name: safeName,
                file_path: filePath,
                category: category || 'General',
              })
              .select('id, transaction_id, name, file_path, category, created_at')
              .single()
          }

          if (result.error) {
            reportDocumentUploadTelemetry({
              surface: 'external_workspace',
              stage: 'persistence',
              outcome: 'failed',
              error: result.error,
              transactionId: targetTransactionId,
            })
            await removeDocumentUploadObjectAfterFailedPersistence(client, {
              bucket: uploadedBucket,
              filePath,
              error: result.error,
            })
            throw result.error
          }
          return result
        },
        read: () => readSavedUploadByPath(client, { table: 'documents', column: 'file_path', path: filePath, filters: { transaction_id: targetTransactionId } }),
      })

      await logTransactionEventIfPossible(client, {
        transactionId: targetTransactionId,
        eventType: 'DocumentUploaded',
        createdByRole: normalizeExternalAccessRoleToTransactionRole(access.role),
        eventData: {
          documentId: result.data.id,
          documentName: result.data.name,
          category: result.data.category || category || 'General',
          visibilityScope: result.data.visibility_scope || 'shared',
          source: 'external_workspace',
        },
      })

      await updateDocumentRequestFromUploadIfPossible(client, {
        transactionId: targetTransactionId,
        documentId: result.data.id,
        category: result.data.category || category || 'General',
        documentName: result.data.name,
        actorRole: normalizeExternalAccessRoleToTransactionRole(access.role),
        actorUserId: null,
      })

      await runDocumentAutomationIfPossible(client, {
        transactionId: targetTransactionId,
        documentId: result.data.id,
        documentName: result.data.name,
        documentType: normalizedDocumentType,
        category: result.data.category || category || 'General',
        requiredDocumentKey,
        actorRole: normalizeExternalAccessRoleToTransactionRole(access.role),
        actorUserId: null,
        source: 'external_upload',
      })

      return {
        ...result.data,
        url: await getSignedUrl(result.data.file_path, { client, fileBucket: result.data.file_bucket || '' }),
      }
    },
  })
}

export function normalizeCanonicalUploadActorRole(role = '') {
  const normalized = normalizeDocumentKeyCandidate(role)
  if (normalized === 'attorney' || normalized === 'conveyancer') return 'transferring_attorney'
  if (normalized === 'client') return 'buyer'
  return normalized || 'system'
}

function getCanonicalUploadKeyCandidates({ requiredDocumentKey = null, documentType = null, category = null } = {}) {
  const values = [
    requiredDocumentKey,
    documentType,
    CANONICAL_UPLOAD_CATEGORY_KEY_HINTS[
      String(category || '')
        .trim()
        .toLowerCase()
    ],
    category,
  ]
  return [...new Set(values.map(normalizeDocumentKeyCandidate).filter(Boolean))]
}

async function assertActiveTransactionForDocumentUpload(client, transactionId) {
  const normalizedTransactionId = String(transactionId || '').trim()
  if (!normalizedTransactionId) {
    throw new Error('Choose an active transaction before uploading a document.')
  }

  const result = await client
    .from('transactions')
    .select('id')
    .eq('id', normalizedTransactionId)
    .maybeSingle()

  if (result.error) throw result.error
  if (!result.data?.id) {
    throw new Error('This transaction no longer exists. Open an active transaction before uploading a document.')
  }

  return normalizedTransactionId
}

async function resolveCanonicalRequirementTargetForUpload(
  client,
  {
    transactionId,
    canonicalRequirementInstanceId = null,
    requiredDocumentKey = null,
    documentType = null,
    category = null,
  } = {},
) {
  if (!transactionId) return null
  if (isUuidLike(canonicalRequirementInstanceId)) {
    return {
      canonicalRequirementInstanceId,
      requiredDocumentKey: normalizeDocumentKeyCandidate(requiredDocumentKey || documentType),
      matchReason: 'explicit_canonical_requirement_instance_id',
    }
  }

  const keyCandidates = getCanonicalUploadKeyCandidates({
    requiredDocumentKey,
    documentType,
    category,
  })
  if (!keyCandidates.length) return null

  const query = await client
    .from('transaction_required_documents')
    .select('id, transaction_id, document_key, document_label, canonical_requirement_instance_id')
    .eq('transaction_id', transactionId)
    .in('document_key', keyCandidates)
    .not('canonical_requirement_instance_id', 'is', null)
    .limit(2)

  if (query.error) {
    if (
      isMissingTableError(query.error, 'transaction_required_documents') ||
      isMissingColumnError(query.error, 'canonical_requirement_instance_id') ||
      isPermissionDeniedError(query.error)
    ) {
      return null
    }
    throw query.error
  }

  const rows = query.data || []
  if (rows.length === 1) {
    const row = rows[0]
    return {
      canonicalRequirementInstanceId: row.canonical_requirement_instance_id,
      requiredDocumentKey: row.document_key,
      legacyRequirementId: row.id,
      matchReason: 'transaction_required_document_key',
    }
  }

  const instanceQuery = await client
    .from('document_requirement_instances')
    .select('id, document_definition_key')
    .eq('transaction_id', transactionId)
    .in('document_definition_key', keyCandidates)
    .neq('status', 'not_applicable')
    .limit(2)

  if (instanceQuery.error) {
    if (
      isMissingTableError(instanceQuery.error, 'document_requirement_instances') ||
      isMissingColumnError(instanceQuery.error, 'document_definition_key') ||
      isPermissionDeniedError(instanceQuery.error)
    ) {
      return null
    }
    throw instanceQuery.error
  }

  const instances = instanceQuery.data || []
  if (instances.length !== 1) return null
  return {
    canonicalRequirementInstanceId: instances[0].id,
    requiredDocumentKey: instances[0].document_definition_key,
    matchReason: 'canonical_definition_key',
  }
}

async function linkInternalUploadToCanonicalRequirementIfPossible(
  client,
  { transactionId, documentId, canonicalRequirementInstanceId, actorRole = '', actorUserId = null, metadata = {} } = {},
) {
  if (!transactionId || !documentId || !canonicalRequirementInstanceId) return null

  const rpc = await client.rpc('bridge_link_document_to_canonical_requirement', {
    p_document_id: documentId,
    p_requirement_instance_id: canonicalRequirementInstanceId,
    p_actor_role: normalizeCanonicalUploadActorRole(actorRole),
    p_actor_user_id: actorUserId || null,
    p_metadata: {
      source: 'internal_browser_upload',
      ...metadata,
    },
  })

  if (rpc.error) {
    if (
      isMissingFunctionError(rpc.error, 'bridge_link_document_to_canonical_requirement') ||
      isMissingColumnError(rpc.error, 'canonical_requirement_instance_id')
    ) {
      console.warn(
        '[canonical-documents] Canonical upload linkage skipped; RPC or link column is unavailable.',
        rpc.error,
      )
      return null
    }
    throw rpc.error
  }

  return rpc.data || null
}

async function linkInternalUploadToCanonicalRequirementByKeyIfPossible(
  client,
  { transactionId, documentId, keyCandidates = [], actorRole = '', actorUserId = null, metadata = {} } = {},
) {
  if (!transactionId || !documentId || !keyCandidates.length) return null

  for (const documentKey of keyCandidates) {
    const rpc = await client.rpc('bridge_link_document_to_canonical_requirement_by_key', {
      p_document_id: documentId,
      p_transaction_id: transactionId,
      p_document_key: documentKey,
      p_actor_role: normalizeCanonicalUploadActorRole(actorRole),
      p_actor_user_id: actorUserId || null,
      p_metadata: {
        source: 'internal_browser_upload',
        ...metadata,
      },
    })

    if (rpc.error) {
      if (
        isMissingFunctionError(rpc.error, 'bridge_link_document_to_canonical_requirement_by_key') ||
        isMissingColumnError(rpc.error, 'canonical_requirement_instance_id')
      ) {
        console.warn(
          '[canonical-documents] Canonical upload key linkage skipped; RPC or link column is unavailable.',
          rpc.error,
        )
        return null
      }
      throw rpc.error
    }

    if (rpc.data?.ok && rpc.data?.requirementInstanceId) {
      return {
        ...rpc.data,
        documentKey,
      }
    }
  }

  return null
}

const ATTORNEY_DOCUMENT_LANE_ROLES = {
  transfer: 'transfer_attorney',
  bond: 'bond_attorney',
  cancellation: 'cancellation_attorney',
}

function normalizeAttorneyDocumentLaneKey(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (['transfer', 'transfer_attorney', 'attorney'].includes(normalized)) return 'transfer'
  if (['bond', 'bond_attorney'].includes(normalized)) return 'bond'
  if (['cancellation', 'cancellation_attorney'].includes(normalized)) return 'cancellation'
  return null
}

function resolveAttorneyDocumentLaneMetadata({ attorneyLaneKey = null, attorneyRole = null } = {}) {
  const laneKey =
    normalizeAttorneyDocumentLaneKey(attorneyLaneKey) ||
    normalizeAttorneyDocumentLaneKey(attorneyRole)
  if (!laneKey) return null

  return {
    laneKey,
    attorneyRole: ATTORNEY_DOCUMENT_LANE_ROLES[laneKey],
  }
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function createDocumentUploadIdempotencyKey({
  transactionId,
  file,
  requiredDocumentKey = null,
  canonicalRequirementInstanceId = null,
  documentRequestId = null,
  documentType = null,
  category = null,
  relatedEntityId = null,
  attorneyScope = null,
  fileFingerprint = null,
} = {}) {
  const scope = JSON.stringify({
    fileFingerprint,
    transactionId: String(transactionId || '').trim(),
    requiredDocumentKey: normalizeDocumentKeyCandidate(requiredDocumentKey),
    canonicalRequirementInstanceId: String(canonicalRequirementInstanceId || '').trim(),
    documentRequestId: String(documentRequestId || '').trim(),
    documentType: normalizeDocumentKeyCandidate(documentType),
    category: normalizeDocumentKeyCandidate(category),
    ...(relatedEntityId ? { relatedEntityId: String(relatedEntityId).trim() } : {}),
    ...(attorneyScope ? { attorneyScope } : {}),
  })
  // Reuse the fingerprint computed by upload recovery. Equal file metadata
  // alone must not collapse different document contents into the same receipt.
  const fileIdentity = [file?.name, file?.size, file?.type, file?.lastModified].join('|')
  const digest = globalThis.crypto?.subtle
    ? await globalThis.crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(`${scope}|${fileIdentity}`),
      )
    : null

  if (digest) {
    return `document-upload:v1:${bytesToHex(new Uint8Array(digest))}`
  }

  // All supported browsers provide Web Crypto. This deterministic fallback is
  // retained for unusual embedded clients so a retry remains safe even there.
  const fallback = `${scope}|${fileIdentity}`
  let hash = 2166136261
  for (let index = 0; index < fallback.length; index += 1) {
    hash ^= fallback.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `document-upload:v1:fallback-${(hash >>> 0).toString(16)}`
}

async function findDocumentByUploadIdempotencyKey(client, { transactionId, idempotencyKey } = {}) {
  if (!transactionId || !idempotencyKey) return null

  let result = await client
    .from('documents')
    .select(
      'id, transaction_id, name, file_path, category, document_type, visibility_scope, stage_key, is_client_visible, file_bucket, canonical_requirement_instance_id, created_at',
    )
    .eq('transaction_id', transactionId)
    .eq('upload_idempotency_key', idempotencyKey)
    .maybeSingle()

  if (
    result.error &&
    (isMissingColumnError(result.error, 'upload_idempotency_key') ||
      isMissingColumnError(result.error, 'canonical_requirement_instance_id'))
  ) {
    result = await client
      .from('documents')
      .select('id, transaction_id, name, file_path, category, created_at')
      .eq('transaction_id', transactionId)
      .eq('upload_idempotency_key', idempotencyKey)
      .maybeSingle()
  }

  if (result.error && !isMissingColumnError(result.error, 'upload_idempotency_key')) {
    throw result.error
  }

  return result.data || null
}

export async function removeDocumentUploadObjectAfterFailedPersistence(client, { bucket, filePath, error } = {}) {
  if (!isDefiniteUploadSaveRejection(error) || error?.code === '23505') return
  try {
    await removeUploadedDocumentObject(client, bucket, filePath)
  } catch (cleanupError) {
    console.warn('[document-upload] Failed to remove a storage object after document persistence failed.', {
      bucket,
      filePath,
      persistenceError: error,
      cleanupError,
    })
  }
}

function reportDocumentUploadFollowUpFailure({ transactionId, documentId, step, error } = {}) {
  // The file and document row have already been persisted when this runs. These
  // projections are important, but must never cause the upload itself to appear
  // to have failed (or prompt the user to upload the same file again).
  console.warn('[document-upload] Follow-up processing failed after document was saved.', {
    transactionId,
    documentId,
    step,
    error,
  })
  reportDocumentUploadTelemetry({
    surface: 'internal_transaction',
    stage: step,
    outcome: 'failed',
    error,
    transactionId,
    documentId,
  })
}

function runInternalDocumentUploadFollowUps(client, input) {
  return trackTransactionBackgroundWork(input?.transactionId, runInternalDocumentUploadFollowUpsNow(client, input))
}

async function runInternalDocumentUploadFollowUpsNow(
  client,
  {
    transactionId,
    document,
    category,
    isClientVisible = false,
    documentType = null,
    documentRequestId = null,
    canonicalTarget = null,
    canonicalKeyCandidates = [],
    requiredDocumentKey = null,
    attorneyLaneMetadata = null,
    activeProfile = {},
    source = 'internal',
    inferCanonicalRequirement = true,
  } = {},
) {
  if (!transactionId || !document?.id) return

  let canonicalUploadResult = null
  try {
    if (canonicalTarget?.canonicalRequirementInstanceId) {
      canonicalUploadResult = await linkInternalUploadToCanonicalRequirementIfPossible(client, {
        transactionId,
        documentId: document.id,
        canonicalRequirementInstanceId: canonicalTarget.canonicalRequirementInstanceId,
        actorRole: activeProfile.role || 'developer',
        actorUserId: activeProfile.userId || null,
        metadata: {
          document_name: document.name,
          document_type: documentType,
          category: document.category || category || 'General',
          required_document_key: canonicalTarget.requiredDocumentKey || requiredDocumentKey || null,
          match_reason: canonicalTarget.matchReason || null,
        },
      })
    } else if (canonicalKeyCandidates.length) {
      canonicalUploadResult = await linkInternalUploadToCanonicalRequirementByKeyIfPossible(client, {
        transactionId,
        documentId: document.id,
        keyCandidates: canonicalKeyCandidates,
        actorRole: activeProfile.role || 'developer',
        actorUserId: activeProfile.userId || null,
        metadata: {
          document_name: document.name,
          document_type: documentType,
          category: document.category || category || 'General',
          required_document_key: requiredDocumentKey || null,
          match_reason: 'document_key_rpc',
        },
      })
    }
  } catch (error) {
    reportDocumentUploadFollowUpFailure({ transactionId, documentId: document.id, step: 'canonical_link', error })
  }

  const linkedCanonicalRequirementInstanceId =
    canonicalTarget?.canonicalRequirementInstanceId ||
    canonicalUploadResult?.requirementInstanceId ||
    document.canonical_requirement_instance_id ||
    null
  const linkedRequiredDocumentKey =
    canonicalTarget?.requiredDocumentKey ||
    canonicalUploadResult?.canonicalKey ||
    canonicalUploadResult?.documentKey ||
    requiredDocumentKey

  const followUps = [
    {
      step: 'activity_log',
      run: () =>
        logTransactionEventIfPossible(client, {
          transactionId,
          eventType: 'DocumentUploaded',
          createdBy: activeProfile.userId || null,
          createdByRole: activeProfile.role || null,
          eventData: {
            documentId: document.id,
            documentName: document.name,
            category: document.category || category || 'General',
            visibilityScope: document.visibility_scope || (isClientVisible ? 'shared' : 'internal'),
            stageKey: document.stage_key || null,
            laneKey: document.lane_key || attorneyLaneMetadata?.laneKey || null,
            attorneyRole: document.attorney_role || attorneyLaneMetadata?.attorneyRole || null,
            canonicalRequirementInstanceId: linkedCanonicalRequirementInstanceId,
            source: normalizeNullableText(source) || 'internal',
          },
        }),
    },
    {
      step: 'document_request_link',
      run: () =>
        updateDocumentRequestFromUploadIfPossible(client, {
          transactionId,
          documentId: document.id,
          category: document.category || category || 'General',
          documentName: document.name,
          documentRequestId,
          actorRole: activeProfile.role || 'developer',
          actorUserId: activeProfile.userId || null,
        }),
    },
    {
      step: 'workflow_automation',
      run: () =>
        runDocumentAutomationIfPossible(client, {
          transactionId,
          documentId: document.id,
          documentName: document.name,
          documentType,
          category: document.category || category || 'General',
          requiredDocumentKey: linkedRequiredDocumentKey,
          canonicalRequirementInstanceId: linkedCanonicalRequirementInstanceId,
          actorRole: activeProfile.role || 'developer',
          actorUserId: activeProfile.userId || null,
          source: 'internal_upload',
        }),
    },
  ]

  // Capture imports retain the recorded deal stage. The exact canonical link
  // above records receipt; legacy type/name matching must not pick another
  // co-owner or start workflow automation while historical files are imported.
  const enabledFollowUps = followUps.filter(({ step }) => source === 'transaction_capture'
    ? step === 'activity_log'
    : inferCanonicalRequirement || step === 'activity_log' || (step === 'document_request_link' && documentRequestId))
  const results = await Promise.allSettled(enabledFollowUps.map(({ run }) => run()))
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      reportDocumentUploadFollowUpFailure({
        transactionId,
        documentId: document.id,
        step: enabledFollowUps[index].step,
        error: result.reason,
      })
    }
  })
}

export async function reconcileAttorneyDocumentEvidence(client, { document, status, requirementInstanceId = null }) {
  // The document, request and canonical checklist already committed. Preserve
  // the older workflow reporting integration without making its reads/writes
  // part of the user-facing save or re-running title-based document matching.
  const evidenceKey = document.document_type || document.category || document.name
  if (!document.transaction_id || !evidenceKey) return
  await processWorkflowEvidenceIfPossible(client, {
    transactionId: document.transaction_id, evidenceType: 'document', evidenceId: document.id,
    evidenceKey, status, source: 'attorney_document_save', createdBy: document.uploaded_by_user_id || null,
    payload: { requirementInstanceId },
  })
}

export async function uploadDocument({
  transactionId,
  file,
  category,
  isClientVisible = false,
  clientRecipientRole = null,
  documentType = null,
  visibilityScope = null,
  stageKey = null,
  requiredDocumentKey = null,
  documentRequestId = null,
  canonicalRequirementInstanceId = null,
  source = 'internal',
  uploadedByParty = null,
  bucketKey = null,
  fileBucket = null,
  financeLane = null,
  relatedEntityType = null,
  relatedEntityId = null,
  attorneyLaneKey = null,
  attorneyRole = null,
  attorneyVersionKind = null,
  attorneyPreviousVersionId = null,
  inferCanonicalRequirement = true,
  onProgress = null,
  notes = null,
}) {
  const reportProgress = createDocumentUploadProgressReporter(onProgress)

  reportProgress('preparing', 'Checking the document and preparing a secure upload…')
  try {
  const filePolicy = validateDocumentUploadFile(file, { surface: 'internal_transaction', transactionId })
  let client = requireClient()
  const [activeTransactionId, activeProfile] = await Promise.all([
    assertActiveTransactionForDocumentUpload(client, transactionId),
    resolveActiveProfileContext(client),
  ])
  // The durable save returns before reporting finishes. Keep every part of
  // this accepted upload under its verified actor even if the UI signs out.
  const uploadSession = typeof client.auth?.getSession === 'function'
    ? (await client.auth.getSession())?.data?.session : null
  if (uploadSession?.user?.id && uploadSession.user.id !== activeProfile.userId) {
    throw new Error('The signed-in account changed. Start the upload again.')
  }
  if (uploadSession?.access_token) {
    client = createScopedSupabaseClient({ Authorization: `Bearer ${uploadSession.access_token}` }) || client
  }
  const attorneyLaneMetadata = resolveAttorneyDocumentLaneMetadata({ attorneyLaneKey, attorneyRole })
  const attorneySave = Boolean(attorneyLaneMetadata) || source === 'attorney_workspace'
  if (attorneySave && !attorneyLaneMetadata) throw new Error('Select an editable attorney lane before uploading this document.')
  const versionKind = attorneySave ? attorneyVersionKind || 'evidence' : null
  if (versionKind && !['draft', 'final', 'signed', 'evidence'].includes(versionKind)) throw new Error('Select a valid document version type.')
  reportProgress('matching', 'Matching the document to this transaction…')
  const canonicalTarget = inferCanonicalRequirement ? await resolveCanonicalRequirementTargetForUpload(client, {
    transactionId: activeTransactionId,
    canonicalRequirementInstanceId,
    requiredDocumentKey,
    documentType,
    category,
  }) : null
  const canonicalKeyCandidates = inferCanonicalRequirement ? getCanonicalUploadKeyCandidates({
    requiredDocumentKey,
    documentType,
    category,
  }) : []

  const safeName = filePolicy.safeName
  return await runRecoverableDocumentUpload({ client: client, monitorSurface: source === 'developer_buyer_document_upload' ? 'developerLead' : source === 'agent_buyer_document_upload' ? 'lead' : attorneyRole ? 'attorneyVersions' : 'transaction', scope: ['internal_transaction', activeTransactionId, category, isClientVisible, clientRecipientRole, documentType, visibilityScope, stageKey, requiredDocumentKey, documentRequestId, canonicalRequirementInstanceId, source, uploadedByParty, bucketKey, fileBucket, financeLane, relatedEntityType, relatedEntityId, notes, versionKind, attorneyPreviousVersionId], file, storageBuckets: DOCUMENTS_BUCKET_CANDIDATES, onProgress,
    run: async attempt => {
      const filePath = attempt.path(`transaction-${activeTransactionId}/${Date.now()}-${safeName}`)
      const normalizedDocumentType =
        normalizePortalDocumentType(
          documentType || canonicalTarget?.requiredDocumentKey || requiredDocumentKey || category || file.name,
        ) || 'general'
      const uploadIdempotencyKey = await createDocumentUploadIdempotencyKey({
        transactionId: activeTransactionId,
        file,
        requiredDocumentKey,
        canonicalRequirementInstanceId: canonicalTarget?.canonicalRequirementInstanceId || canonicalRequirementInstanceId,
        documentRequestId,
        documentType: normalizedDocumentType,
        category,
        relatedEntityId,
        fileFingerprint: attempt.fileFingerprint,
        attorneyScope: attorneySave ? {
          actor: activeProfile.userId, lane: attorneyLaneMetadata.laneKey,
          visibility: visibilityScope || (isClientVisible ? 'shared' : 'internal'),
          clientRecipientRole, isClientVisible, stageKey, uploadedByParty, bucketKey, source,
          financeLane, relatedEntityType, notes,
          versionKind, previousVersionId: attorneyPreviousVersionId,
        } : null,
      })
      const existingDocument = await findDocumentByUploadIdempotencyKey(client, {
        transactionId: activeTransactionId,
        idempotencyKey: uploadIdempotencyKey,
      })

      if (existingDocument) {
        attempt.saved({ data: existingDocument })
        if (attorneySave) {
          const saved = await persistAttorneyDocument(client, {
            document: { ...existingDocument, lane_key: attorneyLaneMetadata.laneKey, upload_idempotency_key: uploadIdempotencyKey,
              canonical_requirement_instance_id: canonicalTarget?.canonicalRequirementInstanceId || canonicalRequirementInstanceId || null,
              attorney_version_kind: versionKind, attorney_version_previous_id: attorneyPreviousVersionId,
            },
            documentRequestId,
          })
          reportProgress('complete', 'This document was already saved.', { documentId: saved.id, postUploadProcessing: 'complete' })
          return saved
        }
        reportProgress('complete', 'This document was already saved. Reusing the existing upload…')
        reportDocumentUploadTelemetry({
          surface: 'internal_transaction',
          stage: 'idempotency',
          outcome: 'deduplicated',
          transactionId: activeTransactionId,
          documentId: existingDocument.id,
        })
        return {
          ...existingDocument,
          canonicalRequirementInstanceId:
            existingDocument.canonical_requirement_instance_id || canonicalTarget?.canonicalRequirementInstanceId || null,
          deduplicated: true,
          postUploadProcessing: 'complete',
          url: await getSignedUrl(existingDocument.file_path, {
            client,
            fileBucket: existingDocument.file_bucket || '',
          }),
        }
      }

      let uploadedBucket
      try {
        reportProgress('uploading', `Uploading ${safeName} to secure storage…`)
        uploadedBucket = await attempt.upload(() => uploadToDocumentsBucket(client, filePath, file))
      } catch (error) {
        reportProgress('failed', error?.message || 'The file could not be uploaded to secure storage.', { error })
        reportDocumentUploadTelemetry({
          surface: 'internal_transaction',
          stage: 'storage',
          outcome: 'failed',
          error,
          transactionId: activeTransactionId,
        })
        throw error
      }

      const documentInsertPayload = {
        transaction_id: activeTransactionId,
        name: safeName,
        file_path: filePath,
        category: category || 'General',
        document_type: normalizedDocumentType,
        visibility_scope: visibilityScope || (isClientVisible ? 'shared' : 'internal'),
        client_recipient_role: normalizeNullableText(clientRecipientRole),
        uploaded_by_user_id: activeProfile.userId || null,
        uploaded_by_role: activeProfile.role || null,
        uploaded_by_email: activeProfile.email || null,
        stage_key: stageKey || null,
        is_client_visible: Boolean(isClientVisible),
        uploaded_by_party: normalizeNullableText(uploadedByParty),
        bucket_key: normalizeNullableText(bucketKey),
        source: normalizeNullableText(source),
        file_bucket: uploadedBucket || normalizeNullableText(fileBucket),
        finance_lane: normalizeNullableText(financeLane),
        related_entity_type: normalizeNullableText(relatedEntityType),
        related_entity_id: normalizeNullableUuid(relatedEntityId),
        ...(attorneyLaneMetadata
          ? {
              lane_key: attorneyLaneMetadata.laneKey,
              attorney_role: attorneyLaneMetadata.attorneyRole,
            }
          : {}),
        ...(canonicalTarget?.canonicalRequirementInstanceId
          ? {
              canonical_requirement_instance_id: canonicalTarget.canonicalRequirementInstanceId,
            }
          : {}),
        upload_idempotency_key: uploadIdempotencyKey,
        ...(attorneySave ? { notes: normalizeNullableText(notes), attorney_version_kind: versionKind,
          attorney_version_previous_id: normalizeNullableUuid(attorneyPreviousVersionId) } : {}),
      }

      const documentSelectFields = [
        'id',
        'transaction_id',
        'name',
        'file_path',
        'category',
        'document_type',
        'visibility_scope',
        'stage_key',
        'uploaded_by_user_id',
        'uploaded_by_role',
        'uploaded_by_email',
        'is_client_visible',
        'uploaded_by_party',
        'bucket_key',
        'source',
        'file_bucket',
        'finance_lane',
        'related_entity_type',
        'related_entity_id',
        'canonical_requirement_instance_id',
        ...(attorneyLaneMetadata ? ['lane_key', 'attorney_role'] : []),
        'created_at',
      ].join(', ')

      // Storage has accepted the file; persist its transaction record before
      // doing any downstream document automation.
      reportProgress('saving', 'File uploaded. Saving it to the transaction document library…')
      if (attorneySave) {
        let saved
        try {
          saved = await persistAttorneyDocument(client, { document: documentInsertPayload, documentRequestId })
        } catch (saveError) {
          if (isDefiniteDocumentSaveFailure(saveError)) {
            await removeDocumentUploadObjectAfterFailedPersistence(client, { bucket: uploadedBucket, filePath, error: saveError })
          }
          reportProgress('failed', saveError?.message || 'The document save could not be confirmed.', { error: saveError })
          throw saveError
        }
        if (saved.deduplicated && saved.file_path !== filePath) {
          // The RPC proved which object is retained, making this cleanup safe even
          // when two uploads raced or the previous response was lost.
          void removeDocumentUploadObjectAfterFailedPersistence(client, { bucket: uploadedBucket, filePath, error: { code: '23505' } })
        }
        attempt.saved({ data: saved })
        reportDocumentUploadTelemetry({ surface: 'internal_transaction', stage: 'persistence', outcome: 'durable_saved', transactionId: activeTransactionId, documentId: saved.id })
        if (!saved.deduplicated && saved.canonicalRequirementInstanceId) {
          void trackTransactionBackgroundWork(activeTransactionId, reconcileAttorneyDocumentEvidence(client, { document: saved, status: 'uploaded', requirementInstanceId: saved.canonicalRequirementInstanceId }))
            .catch(() => console.warn('[document-upload] Saved document reporting could not refresh'))
        }
        reportProgress('complete', 'Document saved successfully.', { documentId: saved.id, postUploadProcessing: 'complete' })
        return saved
      }
      const result = await attempt.persist({
        save: async () => {
          let result = await client
            .from('documents')
            .insert(documentInsertPayload)
            .select(documentSelectFields)
            .single()

          // Only the optional deduplication column may be omitted. Never silently lose
          // audience, actor, bucket or canonical-link data on an older schema.
          if (result.error && isMissingColumnError(result.error, 'upload_idempotency_key')) {
            const { upload_idempotency_key: omittedIdempotencyKey, ...compatiblePayload } = documentInsertPayload
            result = await client
              .from('documents')
              .insert(compatiblePayload)
              .select(documentSelectFields)
              .single()
          }

          if (result.error?.code === '23505') {
            const duplicateDocument = await findDocumentByUploadIdempotencyKey(client, {
              transactionId: activeTransactionId,
              idempotencyKey: uploadIdempotencyKey,
            })
            if (duplicateDocument) {
              if (duplicateDocument.file_path !== filePath) await removeDocumentUploadObjectAfterFailedPersistence(client, {
                bucket: uploadedBucket,
                filePath,
                error: result.error,
              })
              reportDocumentUploadTelemetry({
                surface: 'internal_transaction',
                stage: 'idempotency',
                outcome: 'deduplicated',
                transactionId: activeTransactionId,
                documentId: duplicateDocument.id,
              })
              return { data: duplicateDocument, error: null }
            }
          }

          if (result.error) {
            reportProgress('failed', result.error?.message || 'The document record could not be saved.', { error: result.error })
            reportDocumentUploadTelemetry({
              surface: 'internal_transaction',
              stage: 'persistence',
              outcome: 'failed',
              error: result.error,
              transactionId: activeTransactionId,
            })
            await removeDocumentUploadObjectAfterFailedPersistence(client, {
              bucket: uploadedBucket,
              filePath,
              error: result.error,
            })
            throw result.error
          }

          return result
        },
        read: () => readSavedUploadByPath(client, { table: 'documents', column: 'file_path', path: filePath, filters: { transaction_id: activeTransactionId } }),
      })

      reportDocumentUploadTelemetry({
        surface: 'internal_transaction',
        stage: 'persistence',
        outcome: 'durable_saved',
        transactionId: activeTransactionId,
        documentId: result.data.id,
      })
      // Storage and the document row are the durable upload boundary. Do not wait
      // for projections after this point: a temporary automation/linking failure
      // must not tell a user to re-upload a file that has already been saved.
      void runInternalDocumentUploadFollowUps(client, {
        transactionId: activeTransactionId,
        document: result.data,
        category,
        isClientVisible,
        documentType: normalizedDocumentType,
        documentRequestId,
        canonicalTarget,
        canonicalKeyCandidates,
        requiredDocumentKey,
        attorneyLaneMetadata,
        activeProfile,
        source,
        inferCanonicalRequirement,
      })

      reportProgress('complete', 'Document saved successfully.', {
        documentId: result.data.id,
        postUploadProcessing: 'queued',
      })

      return {
        ...result.data,
        canonicalRequirementInstanceId:
          canonicalTarget?.canonicalRequirementInstanceId || result.data.canonical_requirement_instance_id || null,
        postUploadProcessing: 'queued',
        url: await getSignedUrl(result.data.file_path, {
          client,
          fileBucket: result.data.file_bucket || uploadedBucket || '',
        }),
      }
    },
  })
  } catch (error) {
    reportProgress('failed', error?.message || 'The document could not be prepared. Please retry.', { fileName: file?.name, error })
    throw error
  }
}

export async function listOrphanedTransactionDocumentObjects(transactionId) {
  const client = requireClient()
  const activeTransactionId = await assertActiveTransactionForDocumentUpload(client, transactionId)
  const result = await client.rpc('bridge_list_orphaned_transaction_document_objects', {
    p_transaction_id: activeTransactionId,
  })

  if (result.error) {
    if (isMissingFunctionError(result.error, 'bridge_list_orphaned_transaction_document_objects')) {
      return []
    }
    throw result.error
  }

  return (result.data || []).map((item) => ({
    bucketId: item.bucket_id || 'documents',
    filePath: item.file_path || '',
    createdAt: item.created_at || null,
  }))
}

export async function getTransactionDocumentRecoveryReview(transactionId) {
  const client = requireClient()
  const activeTransactionId = await assertActiveTransactionForDocumentUpload(client, transactionId)
  const result = await client.rpc('bridge_get_transaction_document_recovery_review', {
    p_transaction_id: activeTransactionId,
  })
  if (result.error) throw result.error
  return result.data || {
    version: 'transaction_document_recovery_review_v1',
    transactionId: activeTransactionId,
    documentsMissingStorage: [],
    orphanStorageObjects: [],
    summary: { documentsMissingStorageCount: 0, orphanStorageObjectCount: 0 },
  }
}

export async function repairTransactionDocumentCanonicalLink({
  transactionId,
  documentId,
  requirementInstanceId,
} = {}) {
  const client = requireClient()
  const activeTransactionId = await assertActiveTransactionForDocumentUpload(client, transactionId)
  if (!isUuidLike(documentId) || !isUuidLike(requirementInstanceId)) {
    throw new Error('Choose the exact document and canonical requirement before repairing a link.')
  }
  const result = await client.rpc('bridge_repair_transaction_document_link', {
    p_transaction_id: activeTransactionId,
    p_document_id: documentId,
    p_requirement_instance_id: requirementInstanceId,
  })
  if (result.error) throw result.error
  return result.data || null
}

export async function syncFinanceDocumentRelationIfPossible(
  client,
  { transactionId, documentId, relatedEntityType = '', relatedEntityId = null } = {},
) {
  const normalizedType = String(relatedEntityType || '')
    .trim()
    .toLowerCase()
  if (!transactionId || !documentId || !normalizedType || !relatedEntityId) return

  if (normalizedType === 'bond_offer') {
    const update = await client
      .from('transaction_bond_quotes')
      .update({
        quote_document_id: documentId,
      })
      .eq('id', relatedEntityId)
      .eq('transaction_id', transactionId)
    if (
      update.error &&
      !isMissingColumnError(update.error, 'quote_document_id') &&
      !isMissingTableError(update.error, 'transaction_bond_quotes')
    ) {
      throw update.error
    }
    return
  }

  if (normalizedType === 'bond_instruction') {
    const existing = await client
      .from('transaction_bond_instructions')
      .select('id')
      .eq('transaction_id', transactionId)
      .maybeSingle()
    if (existing.error && !isMissingTableError(existing.error, 'transaction_bond_instructions')) {
      throw existing.error
    }
    if (existing.data?.id) {
      const update = await client
        .from('transaction_bond_instructions')
        .update({
          instruction_document_id: documentId,
        })
        .eq('id', existing.data.id)
      if (update.error && !isMissingColumnError(update.error, 'instruction_document_id')) {
        throw update.error
      }
    }
  }
}

export async function uploadTransactionFinanceDocument({
  transactionId,
  file,
  documentType,
  requiredDocumentKey = null,
  canonicalRequirementInstanceId = null,
  financeLane = null,
  relatedEntityType = null,
  relatedEntityId = null,
  category = 'Finance',
  actorRole = null,
  isClientVisible = true,
} = {}) {
  const uploaded = await uploadDocument({
    transactionId,
    file,
    category,
    isClientVisible,
    documentType,
    requiredDocumentKey,
    canonicalRequirementInstanceId,
    source: 'finance_tab',
    uploadedByParty: normalizeRoleType(actorRole || 'agent'),
    bucketKey: 'finance',
    fileBucket: 'documents',
    financeLane,
    relatedEntityType,
    relatedEntityId,
  })

  const client = requireClient()
  await syncFinanceDocumentRelationIfPossible(client, {
    transactionId,
    documentId: uploaded.id,
    relatedEntityType,
    relatedEntityId,
  })

  await logTransactionEventIfPossible(client, {
    transactionId,
    eventType: 'TransactionUpdated',
    createdByRole: normalizeRoleType(actorRole || 'agent'),
    eventData: {
      source: 'transaction_finance_document_upload',
      financeEventType: 'finance_document_uploaded',
      documentId: uploaded.id,
      documentType: normalizeNullableText(documentType),
      financeLane: normalizeNullableText(financeLane),
      relatedEntityType: normalizeNullableText(relatedEntityType),
      relatedEntityId: normalizeNullableUuid(relatedEntityId),
    },
  })

  return uploaded
}
