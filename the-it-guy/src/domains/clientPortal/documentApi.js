// clientPortal owns these operations and their existing recovery behavior.
import { removeUploadedDocumentObject } from '../../lib/api/shared/storage.js'
import { logTransactionEventIfPossible } from '../transactions/eventActions.js'
import { isStorageBucketNotFoundError } from '../documents/listReadApi.js'
import { normalizeNullableUuid, normalizeNullableText, isMissingTableError, isMissingColumnError, normalizeTextValue } from '../../lib/api/shared/readHelpers.js'
import { normalizeRequiredDocumentRows } from '../documents/requirementReadModel.js'
import { ensureDevelopmentSettings } from '../developments/configurationApi.js'
import { createFreshDocumentSignedUrl } from '../../lib/documentAccess.js'
import { runRecoverableDocumentUpload, readSavedUploadByPath } from '../../lib/documentUploadRecovery.js'
import { DOCUMENTS_BUCKET_CANDIDATES } from '../../lib/supabaseClient'
import { uploadToStorageCandidateBuckets } from '../../lib/storageFallbacks'
import { withDocumentUploadMimeType, getDocumentUploadOptions, validateDocumentUploadFile } from '../../lib/documentUploadPolicy'
import { resolveClientPortalFinalSignedArtifactAccess } from '../../core/documents/finalSignedArtifactAccess'
import { normalizePortalDocumentType } from '../../core/documents/portalDocumentMetadata'
import { buildBondApplicationDocumentReconciliationPlan } from '../../modules/bond/application/index.js'
import { requireClientPortalTokenClient } from './appointmentRead.js'
import { normalizeDocumentKeyCandidate } from './tokenHelpers.js'
import { isReservationProofDocumentKey } from '../documents/uploadAutomation.js'
import { resolveClientPortalLinkByToken } from './originatorFinanceRead.js'
import { syncFinanceDocumentRelationIfPossible } from '../documents/uploadWorkflow.js'

export function sanitizeFilePart(value, fallback) {
  return String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function splitFileNameAndExtension(fileName = '') {
  const normalized = String(fileName || '').trim()
  const dotIndex = normalized.lastIndexOf('.')
  if (dotIndex <= 0 || dotIndex === normalized.length - 1) {
    return { baseName: normalized || 'file', extension: '' }
  }
  return {
    baseName: normalized.slice(0, dotIndex),
    extension: normalized.slice(dotIndex + 1).toLowerCase(),
  }
}

function buildReservationDepositProofFileName({
  developmentName = '',
  unitReference = '',
  buyerName = '',
  originalFileName = '',
  timestamp = Date.now(),
} = {}) {
  const safeDevelopment = sanitizeFilePart(developmentName, 'development') || 'development'
  const safeUnit = sanitizeFilePart(unitReference, 'unit') || 'unit'
  const safeBuyer = sanitizeFilePart(buyerName, 'buyer') || 'buyer'
  const { extension } = splitFileNameAndExtension(originalFileName)
  const safeExtension = sanitizeFilePart(extension, 'pdf') || 'pdf'
  return `${safeDevelopment}-${safeUnit}-${safeBuyer}-reservationdeposit-proofofpayment-${timestamp}.${safeExtension}`
}

async function uploadToBuyerPortalDocumentsBucket(client, filePath, file) {
  const uploadOptions = getDocumentUploadOptions(file, { fileName: filePath.split('/').at(-1), surface: 'client_portal' })
  const uploadBody = withDocumentUploadMimeType(file, uploadOptions.contentType)
  const { bucket } = await uploadToStorageCandidateBuckets({
    bucketCandidates: ['documents'],
    upload: (bucketName) => client.storage.from(bucketName).upload(filePath, uploadBody, uploadOptions),
    missingBucketMessage: 'Buyer portal document storage is not configured for this environment.',
    accessDeniedMessage: 'Buyer portal document storage access is not ready yet. Please retry.',
    accessDeniedCode: 'buyer_portal_document_storage_access_not_ready',
    genericMessage: 'Unable to upload buyer portal document.',
  })
  return bucket
}

export async function fetchClientPortalCanonicalDocumentProjection(token) {
  const normalizedToken = normalizeNullableText(token)
  if (!normalizedToken) throw new Error('Client portal token is required.')

  const client = requireClientPortalTokenClient(normalizedToken)
  const rpc = await client.rpc('bridge_client_portal_canonical_document_projection')
  if (rpc.error) throw rpc.error
  const unmatchedRpc = await client.rpc('bridge_client_portal_unmatched_buyer_documents_projection')
  // During a staged release, keep the existing canonical room available until
  // the additive unmatched-files RPC migration has reached the database.
  if (unmatchedRpc.error && unmatchedRpc.error.code !== 'PGRST202') throw unmatchedRpc.error

  const projection = rpc.data && typeof rpc.data === 'object' ? rpc.data : {}
  if (String(projection.role || '').trim().toLowerCase() !== 'buyer') {
    throw new Error('The canonical document projection did not resolve a buyer workspace.')
  }
  if (!String(projection.transactionId || '').trim()) {
    throw new Error('The canonical document projection did not resolve a transaction.')
  }
  const unmatched = unmatchedRpc.data && typeof unmatchedRpc.data === 'object' ? unmatchedRpc.data : {}
  if (!unmatchedRpc.error && (String(unmatched.role || '').trim().toLowerCase() !== 'buyer' ||
      String(unmatched.transactionId || '').trim() !== String(projection.transactionId).trim())) {
    throw new Error('The unmatched buyer document projection does not match the buyer transaction.')
  }
  const documentsById = new Map()
  for (const document of [
    ...(Array.isArray(projection.documents) ? projection.documents : []),
    ...(Array.isArray(unmatched.documents) ? unmatched.documents : []),
  ]) {
    if (document?.id) documentsById.set(String(document.id), document)
  }
  return {
    projectionVersion: String(projection.projectionVersion || '').trim(),
    role: 'buyer',
    transactionId: String(projection.transactionId).trim(),
    requirements: Array.isArray(projection.requirements) ? projection.requirements : [],
    documents: [...documentsById.values()],
  }
}

export async function uploadClientPortalDocument({
  token,
  file,
  category = 'Client Portal',
  requiredDocumentKey = null,
  canonicalRequirementInstanceId = null,
  documentType = null,
  documentRequestId = null,
  source = 'client_portal',
  uploadedByParty = 'buyer',
  bucketKey = null,
  fileBucket = null,
  financeLane = null,
  relatedEntityType = null,
  relatedEntityId = null,
  onProgress = null,
}) {
  const client = requireClientPortalTokenClient(token)
  const link = await resolveClientPortalLinkByToken(client, token)
  const settings = await ensureDevelopmentSettings(client, link.development_id)

  if (!settings.client_portal_enabled) {
    throw new Error('Client portal is currently disabled for this development.')
  }

  if (!file) {
    throw new Error('A file is required.')
  }
  const filePolicy = validateDocumentUploadFile(file, { surface: 'buyer_portal', transactionId: link.transaction_id })

  const normalizedRequiredDocumentKey = normalizeDocumentKeyCandidate(requiredDocumentKey)
  const normalizedInputDocumentType = normalizePortalDocumentType(documentType)
  const isReservationDepositProofUpload =
    isReservationProofDocumentKey(normalizedRequiredDocumentKey) ||
    normalizedInputDocumentType === 'reservation_deposit_pop'
  const normalizedDocumentType = isReservationDepositProofUpload
    ? 'reservation_deposit_pop'
    : normalizePortalDocumentType(documentType || requiredDocumentKey || category || file.name) ||
      'client_portal_document'

  let developmentName = ''
  let unitReference = ''
  let buyerName = ''

  if (isReservationDepositProofUpload) {
    const [unitQuery, buyerQuery] = await Promise.all([
      link.unit_id
        ? client
            .from('units')
            .select('id, unit_number, development:developments(name)')
            .eq('id', link.unit_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      link.buyer_id
        ? client.from('buyers').select('id, name, email').eq('id', link.buyer_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])

    if (unitQuery.error) {
      throw unitQuery.error
    }
    if (buyerQuery.error) {
      throw buyerQuery.error
    }

    developmentName = normalizeTextValue(
      Array.isArray(unitQuery.data?.development)
        ? unitQuery.data?.development?.[0]?.name
        : unitQuery.data?.development?.name,
    )
    unitReference = normalizeTextValue(unitQuery.data?.unit_number ? `unit ${unitQuery.data.unit_number}` : '')
    buyerName = normalizeTextValue(buyerQuery.data?.name)
  }

  return runRecoverableDocumentUpload({ client: client, onProgress, scope: ['buyer_portal', token, link.transaction_id, category, requiredDocumentKey, canonicalRequirementInstanceId, documentRequestId, documentType, bucketKey, financeLane, relatedEntityType, relatedEntityId], file,
    run: async attempt => {
      const timestamp = Date.now()
      const generatedFileName = isReservationDepositProofUpload
        ? buildReservationDepositProofFileName({
            developmentName,
            unitReference,
            buyerName,
            originalFileName: filePolicy.safeName,
            timestamp,
          })
        : `${timestamp}-${filePolicy.safeName}`
      const filePath = attempt.path(`client-portal/${link.transaction_id}/${generatedFileName}`)
      const persistedDocumentName = isReservationDepositProofUpload ? generatedFileName : filePolicy.safeName

      const uploadedBucket = await attempt.upload(() => uploadToBuyerPortalDocumentsBucket(client, filePath, file))
      const rpcResult = await attempt.persist({
        save: async () => {
          let rpcResult
          const requestOnlyUpload = Boolean(
            normalizeNullableUuid(documentRequestId) &&
            !normalizeNullableUuid(canonicalRequirementInstanceId) &&
            !normalizeNullableText(requiredDocumentKey),
          )
          rpcResult = requestOnlyUpload
            ? await client.rpc('bridge_upload_buyer_portal_requested_document', {
                p_transaction_id: link.transaction_id,
                p_document_request_id: normalizeNullableUuid(documentRequestId),
                p_file_path: filePath,
                p_file_bucket: uploadedBucket || fileBucket || 'documents',
                p_document_name: persistedDocumentName,
                p_category: category || 'Additional Requests',
                p_document_type: normalizedDocumentType,
              })
            : await client.rpc('bridge_upload_buyer_portal_document', {
                p_transaction_id: link.transaction_id,
                p_file_path: filePath,
                p_file_bucket: uploadedBucket || fileBucket || 'documents',
                p_document_name: persistedDocumentName,
                p_category: category || 'Client Portal',
                p_document_type: normalizedDocumentType,
                p_required_document_key:
                  requiredDocumentKey || (isReservationDepositProofUpload ? 'reservation_deposit_proof' : null),
                p_requirement_instance_id: normalizeNullableUuid(canonicalRequirementInstanceId),
                p_document_request_id: normalizeNullableUuid(documentRequestId),
                p_bucket_key: normalizeNullableText(bucketKey),
                p_finance_lane: normalizeNullableText(financeLane),
                p_related_entity_type: normalizeNullableText(relatedEntityType),
                p_related_entity_id: normalizeNullableUuid(relatedEntityId),
              })

          if (rpcResult.error) throw rpcResult.error
          if (!rpcResult.data?.id) throw new Error('Buyer portal document upload did not return a document record.')
          return rpcResult
        },
        cleanup: () => removeUploadedDocumentObject(client, uploadedBucket, filePath),
        read: () => readSavedUploadByPath(client, { table: 'documents', column: 'file_path', path: filePath, filters: { transaction_id: link.transaction_id } }),
      })

      const result = { data: rpcResult.data, error: null }

      // The upload RPC persists request linkage and in-app notifications.
      // Buyer-owned evidence remains under review until an authorised reviewer acts.

      return {
        ...result.data,
        url: await createClientPortalDocumentSignedUrl({
          token,
          filePath: result.data.file_path,
          fileBucket: result.data.file_bucket || uploadedBucket,
          expiresInSeconds: 60,
        }),
      }
    },
  })
}

export async function reconcileClientPortalBondDocumentRequirements({
  token,
  requirements = [],
  fingerprint = '',
} = {}) {
  const client = requireClientPortalTokenClient(token)
  const link = await resolveClientPortalLinkByToken(client, token)
  const transactionId = link?.transaction_id
  if (!transactionId) return []

  const activeRequirements = Array.isArray(requirements) ? requirements : []
  const now = new Date().toISOString()
  const phase3ColumnNames = [
    'requirement_identity',
    'requirement_identity_version',
    'requirement_base_key',
    'participant_role',
    'participant_key',
    'requirement_baseline_version',
    'originator_profile_key',
    'originator_profile_version',
    'requirement_profile_fingerprint',
    'decision_fingerprint',
    'reconciliation_fingerprint',
    'reconciliation_source',
    'reconciled_at',
  ]
  const fullSelect =
    'id, transaction_id, document_key, document_label, is_required, is_uploaded, status, enabled, group_key, group_label, description, required_from_role, visibility_scope, allow_multiple, uploaded_document_id, uploaded_at, verified_at, rejected_at, notes, sort_order, canonical_requirement_instance_id, created_at, updated_at'
  const phase3Select = `${fullSelect}, ${phase3ColumnNames.join(', ')}`
  const legacySelect =
    'id, transaction_id, document_key, document_label, is_required, is_uploaded, uploaded_document_id, sort_order, created_at, updated_at'

  let existingQuery = await client
    .from('transaction_required_documents')
    .select(phase3Select)
    .eq('transaction_id', transactionId)
  let phase3ColumnsAvailable = true

  if (existingQuery.error && phase3ColumnNames.some((column) => isMissingColumnError(existingQuery.error, column))) {
    phase3ColumnsAvailable = false
    existingQuery = await client
      .from('transaction_required_documents')
      .select(fullSelect)
      .eq('transaction_id', transactionId)
  }

  if (
    existingQuery.error &&
    (isMissingColumnError(existingQuery.error, 'status') ||
      isMissingColumnError(existingQuery.error, 'enabled') ||
      isMissingColumnError(existingQuery.error, 'group_key') ||
      isMissingColumnError(existingQuery.error, 'group_label') ||
      isMissingColumnError(existingQuery.error, 'required_from_role') ||
      isMissingColumnError(existingQuery.error, 'visibility_scope') ||
      isMissingColumnError(existingQuery.error, 'allow_multiple') ||
      isMissingColumnError(existingQuery.error, 'canonical_requirement_instance_id'))
  ) {
    existingQuery = await client
      .from('transaction_required_documents')
      .select(legacySelect)
      .eq('transaction_id', transactionId)
  }

  if (existingQuery.error) {
    if (isMissingTableError(existingQuery.error, 'transaction_required_documents')) return []
    throw existingQuery.error
  }

  const existingRows = existingQuery.data || []
  const reconciliationPlan = buildBondApplicationDocumentReconciliationPlan({
    transactionId,
    activeRequirements,
    existingRequiredDocuments: existingRows,
  })
  const reconciliationFingerprint = fingerprint || reconciliationPlan.fingerprint
  const upsertRows = reconciliationPlan.rowsToUpsert
    .filter((row) => row.document_key)
    .map((row) => ({
      ...row,
      notes: row.notes || (reconciliationFingerprint ? `guided_bond_application_v2:${reconciliationFingerprint}` : null),
      reconciliation_fingerprint: reconciliationFingerprint || null,
      reconciled_at: now,
      updated_at: now,
    }))
  const compatibleUpsertRows = upsertRows.map((row) => {
    const compatible = { ...row }
    phase3ColumnNames.forEach((column) => delete compatible[column])
    return compatible
  })

  if (upsertRows.length) {
    let upsertResult = await client
      .from('transaction_required_documents')
      .upsert(phase3ColumnsAvailable ? upsertRows : compatibleUpsertRows, { onConflict: 'transaction_id,document_key' })

    if (upsertResult.error && phase3ColumnNames.some((column) => isMissingColumnError(upsertResult.error, column))) {
      phase3ColumnsAvailable = false
      upsertResult = await client
        .from('transaction_required_documents')
        .upsert(compatibleUpsertRows, { onConflict: 'transaction_id,document_key' })
    }

    if (
      upsertResult.error &&
      (isMissingColumnError(upsertResult.error, 'status') ||
        isMissingColumnError(upsertResult.error, 'enabled') ||
        isMissingColumnError(upsertResult.error, 'group_key') ||
        isMissingColumnError(upsertResult.error, 'group_label') ||
        isMissingColumnError(upsertResult.error, 'required_from_role') ||
        isMissingColumnError(upsertResult.error, 'visibility_scope') ||
        isMissingColumnError(upsertResult.error, 'allow_multiple') ||
        isMissingColumnError(upsertResult.error, 'canonical_requirement_instance_id'))
    ) {
      upsertResult = await client
        .from('transaction_required_documents')
        .upsert(compatibleUpsertRows.map((row) => ({
          transaction_id: row.transaction_id,
          document_key: row.document_key,
          document_label: row.document_label,
          is_required: row.is_required,
          is_uploaded: row.is_uploaded,
          uploaded_document_id: row.uploaded_document_id,
          sort_order: row.sort_order,
          updated_at: row.updated_at,
        })), { onConflict: 'transaction_id,document_key' })
    }

    if (upsertResult.error) {
      if (isMissingTableError(upsertResult.error, 'transaction_required_documents')) return []
      throw upsertResult.error
    }
  }

  const staleRows = reconciliationPlan.inactiveRows
  for (const staleRow of staleRows) {
    const stalePatch = {
      is_required: false,
      enabled: false,
      status: staleRow.is_uploaded || staleRow.uploaded_document_id ? staleRow.status || 'uploaded' : 'not_required',
      updated_at: now,
    }
    if (phase3ColumnsAvailable) {
      stalePatch.reconciliation_fingerprint = reconciliationFingerprint || null
      stalePatch.reconciled_at = now
      stalePatch.reconciliation_source = 'bond_application_document_reconciliation'
    }
    let staleResult = await client
      .from('transaction_required_documents')
      .update(stalePatch)
      .eq('id', staleRow.id)

    if (
      staleResult.error &&
      (isMissingColumnError(staleResult.error, 'enabled') ||
        isMissingColumnError(staleResult.error, 'status'))
    ) {
      staleResult = await client
        .from('transaction_required_documents')
        .update({
          is_required: false,
          updated_at: now,
        })
        .eq('id', staleRow.id)
    }
    if (staleResult.error && !isMissingTableError(staleResult.error, 'transaction_required_documents')) {
      throw staleResult.error
    }
  }

  let refreshed = await client
    .from('transaction_required_documents')
    .select(phase3ColumnsAvailable ? phase3Select : fullSelect)
    .eq('transaction_id', transactionId)
    .order('sort_order', { ascending: true })

  if (refreshed.error && phase3ColumnNames.some((column) => isMissingColumnError(refreshed.error, column))) {
    phase3ColumnsAvailable = false
    refreshed = await client
      .from('transaction_required_documents')
      .select(fullSelect)
      .eq('transaction_id', transactionId)
      .order('sort_order', { ascending: true })
  }

  if (
    refreshed.error &&
    (isMissingColumnError(refreshed.error, 'status') ||
      isMissingColumnError(refreshed.error, 'enabled') ||
      isMissingColumnError(refreshed.error, 'group_key') ||
      isMissingColumnError(refreshed.error, 'group_label') ||
      isMissingColumnError(refreshed.error, 'required_from_role') ||
      isMissingColumnError(refreshed.error, 'visibility_scope') ||
      isMissingColumnError(refreshed.error, 'allow_multiple') ||
      isMissingColumnError(refreshed.error, 'canonical_requirement_instance_id'))
  ) {
    refreshed = await client
      .from('transaction_required_documents')
      .select(legacySelect)
      .eq('transaction_id', transactionId)
      .order('sort_order', { ascending: true })
  }
  if (refreshed.error) {
    if (isMissingTableError(refreshed.error, 'transaction_required_documents')) return []
    throw refreshed.error
  }

  return normalizeRequiredDocumentRows(refreshed.data || [])
}

export async function resolveClientPortalFinalSignedDocumentAccess({
  token,
  packetId,
  packetVersionId,
  documentId = '',
  download = false,
} = {}) {
  return resolveClientPortalFinalSignedArtifactAccess({
    portalToken: token,
    packetId,
    packetVersionId,
    documentId,
    download,
  })
}

export async function createClientPortalDocumentSignedUrl({ token, filePath, fileBucket = '', expiresInSeconds = 60 }) {
  if (!filePath) {
    throw new Error('Document path is required.')
  }

  const client = requireClientPortalTokenClient(token)
  await resolveClientPortalLinkByToken(client, token)

  return createFreshDocumentSignedUrl({
    client, filePath, fileBucket, expiresInSeconds, monitorSurface: 'buyer',
    candidateBuckets: [...DOCUMENTS_BUCKET_CANDIDATES, 'signed-documents'],
    isBucketMissing: isStorageBucketNotFoundError,
  })
}

export async function uploadClientPortalFinanceDocument({
  token,
  file,
  documentType,
  requiredDocumentKey = null,
  financeLane = null,
  relatedEntityType = null,
  relatedEntityId = null,
  category = 'Finance',
} = {}) {
  const uploaded = await uploadClientPortalDocument({
    token,
    file,
    category,
    requiredDocumentKey,
    documentType,
    source: 'finance_tab',
    uploadedByParty: 'buyer',
    bucketKey: 'finance',
    fileBucket: 'documents',
    financeLane,
    relatedEntityType,
    relatedEntityId,
  })

  const client = requireClientPortalTokenClient(token)
  await syncFinanceDocumentRelationIfPossible(client, {
    transactionId: uploaded.transaction_id,
    documentId: uploaded.id,
    relatedEntityType,
    relatedEntityId,
  }).catch((relationError) => {
    console.warn('Buyer portal finance relation projection failed after the atomic upload completed', relationError)
  })

  await logTransactionEventIfPossible(client, {
    transactionId: uploaded.transaction_id,
    eventType: 'TransactionUpdated',
    createdByRole: 'buyer',
    eventData: {
      source: 'client_portal_finance_document_upload',
      financeEventType: 'finance_document_uploaded',
      documentId: uploaded.id,
      documentType: normalizeNullableText(documentType),
      financeLane: normalizeNullableText(financeLane),
      relatedEntityType: normalizeNullableText(relatedEntityType),
      relatedEntityId: normalizeNullableUuid(relatedEntityId),
    },
  }).catch((eventError) => {
    console.warn('Buyer portal finance projection event failed after the atomic upload completed', eventError)
  })

  return uploaded
}
