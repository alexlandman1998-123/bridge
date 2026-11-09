// Extracted read path; queries, filters, mapping and cache behaviour are preserved.
import { createFreshDocumentSignedUrl } from '../../lib/documentAccess.js'
import { requireClient, isMissingSchemaError } from '../../lib/api/shared/readHelpers.js'
import { DOCUMENTS_BUCKET_CANDIDATES } from '../../lib/supabaseClient'
import { resolvePortalDocumentMetadata } from '../../core/documents/portalDocumentMetadata'
import { fetchTransactionsData, fetchUnitsData } from '../transactions/listReadApi.js'
import { fetchDevelopmentIdsForOrganisation } from '../developments/scopeReadApi.js'
import { fetchTransactionRequiredDocumentsByTransactionIds, fetchDocumentRequirements, buildRequiredChecklistFromRows, buildDocumentChecklist } from './requirementReadModel.js'
import { byDevelopmentThenUnit } from '../../core/transactions/legacyReadModel.js'
import { DEFAULT_DOCUMENT_REQUIREMENTS } from '../../core/documents/documentRequirementRules'

export function normalizeDocumentVisibilityScope(value, fallback = 'internal') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return ['internal', 'shared', 'client'].includes(normalized) ? normalized : fallback
}

export function isStorageBucketNotFoundError(error) {
  const message = String(error?.message || error?.error || '').toLowerCase()
  const code = String(error?.code || error?.statusCode || error?.status || '').toLowerCase()
  return (
    (message.includes('bucket') && (message.includes('not found') || message.includes('does not exist'))) ||
    code === 'bucket_not_found'
  )
}

export async function getSignedUrl(filePath, { client: suppliedClient = null, fileBucket = '', expiresInSeconds = 60 * 60 } = {}) {
  try {
    return await createFreshDocumentSignedUrl({
      client: suppliedClient || requireClient(), filePath, fileBucket, expiresInSeconds,
      candidateBuckets: DOCUMENTS_BUCKET_CANDIDATES,
      isBucketMissing: isStorageBucketNotFoundError,
    })
  } catch {
    // A failed private access check is unavailable, never a constructed public URL.
    return null
  }
}

export function isCanonicalFinalSignedDocumentRow(document = {}) {
  return String(document?.stage_key || document?.stageKey || '')
    .trim()
    .toLowerCase() === 'final_signed'
}

export function toClientPortalFinalSignedDocumentDescriptor(document = {}) {
  return {
    ...document,
    // A client portal receives an identity for the final Documents row, not
    // its storage address. The final-artifact resolver derives the exact
    // packet/version and performs the F2 + publication checks server-side.
    canonicalFinalArtifact: true,
    finalDocumentId: document?.id || null,
    file_path: '',
    filePath: '',
    storage_path: '',
    storagePath: '',
    file_bucket: '',
    fileBucket: '',
    bucket_key: '',
    file_url: '',
    fileUrl: '',
    file_access_url: '',
    fileAccessUrl: '',
    url: '',
    signedUrl: '',
  }
}

export async function enrichDocuments(documents, { client = null, clientPortalFinalArtifactDescriptors = false } = {}) {
  const results = new Array(documents.length)
  let cursor = 0
  await Promise.all(Array.from({length:Math.min(3,documents.length)}, async () => {
    while(cursor < documents.length) {
      const index = cursor++
      const document = documents[index]
      if (clientPortalFinalArtifactDescriptors && isCanonicalFinalSignedDocumentRow(document)) {
        results[index] = toClientPortalFinalSignedDocumentDescriptor(document)
        continue
      }
      results[index] = {
        ...document,
        url: await getSignedUrl(document.file_path, {
          client,
          fileBucket: document.file_bucket || document.fileBucket || document.bucket_key || document.bucketKey || '',
        }),
      }
    }
  }))
  return results
}

export function normalizeSharedDocumentRow(row, { hasClientVisibilityColumn = true } = {}) {
  const inferredVisibility = hasClientVisibilityColumn ? (row?.is_client_visible ? 'shared' : 'internal') : 'shared'
  const archivedAt = row?.archived_at || null
  const normalizedCategory = String(row?.category || '')
  const inferredArchivedFromCategory = /^archived\b/i.test(normalizedCategory)
  const portalMetadata = resolvePortalDocumentMetadata({
    portal_workspace_category: row?.portal_workspace_category,
    document_type: row?.document_type,
    category: row?.category,
    stage_key: row?.stage_key,
    label: row?.name,
    name: row?.name,
  })
  return {
    ...row,
    is_client_visible: hasClientVisibilityColumn ? Boolean(row?.is_client_visible) : true,
    document_type: row?.document_type || row?.category || null,
    visibility_scope: normalizeDocumentVisibilityScope(row?.visibility_scope, inferredVisibility),
    stage_key: row?.stage_key || null,
    uploaded_by_user_id: row?.uploaded_by_user_id || null,
    uploaded_by_role: row?.uploaded_by_role || null,
    uploaded_by_email: row?.uploaded_by_email || null,
    uploaded_by_party: row?.uploaded_by_party || null,
    external_access_id: row?.external_access_id || null,
    bucket_key: row?.bucket_key || null,
    source: row?.source || null,
    source_document_id: row?.source_document_id || null,
    file_bucket: row?.file_bucket || row?.bucket_key || null,
    finance_lane: row?.finance_lane || null,
    related_entity_type: row?.related_entity_type || null,
    related_entity_id: row?.related_entity_id || null,
    canonicalRequirementInstanceId: row?.canonical_requirement_instance_id || null,
    canonical_requirement_instance_id: row?.canonical_requirement_instance_id || null,
    status: row?.status || row?.review_status || null,
    review_status: row?.review_status || row?.status || null,
    rejection_reason: row?.rejection_reason || row?.rejected_reason || null,
    archived_at: archivedAt,
    is_archived: Boolean(archivedAt || inferredArchivedFromCategory || row?.is_current_evidence === false),
    portal_document_type: portalMetadata.portalDocumentType,
    portal_workspace_category: portalMetadata.portalWorkspaceCategory,
    portal_mapping_source: portalMetadata.portalMappingSource,
    portal_mapping_confidence: portalMetadata.portalMappingConfidence,
    portal_mapping_ambiguous: portalMetadata.portalMappingAmbiguous,
    portalDocumentType: portalMetadata.portalDocumentType,
    portalWorkspaceCategory: portalMetadata.portalWorkspaceCategory,
    portalMappingSource: portalMetadata.portalMappingSource,
    portalMappingConfidence: portalMetadata.portalMappingConfidence,
    portalMappingAmbiguous: portalMetadata.portalMappingAmbiguous,
  }
}

export function normalizeDocumentViewerRole(viewerRole = '') {
  const normalized = String(viewerRole || '')
    .trim()
    .toLowerCase()

  if (
    ['attorney', 'tuckers', 'conveyancer', 'transfer_attorney', 'bond_attorney', 'cancellation_attorney'].includes(
      normalized,
    )
  ) {
    return 'attorney'
  }

  if (normalized === 'developer_contact') {
    return 'developer'
  }

  if (['developer', 'agent', 'internal_admin', 'bond_originator', 'client', 'buyer', 'seller'].includes(normalized)) {
    return normalized
  }

  return ''
}

export function roleCanAccessInternalDocumentBucket(roleType = '', bucketKey = '') {
  const normalizedRole = normalizeDocumentViewerRole(roleType)
  const normalizedBucket = String(bucketKey || '')
    .trim()
    .toLowerCase()
  if (!normalizedBucket) return false
  if (['developer', 'agent', 'internal_admin'].includes(normalizedRole)) return true
  if (normalizedRole === 'attorney') {
    return ['transfer', 'sale', 'buyer_fica', 'legal'].includes(normalizedBucket)
  }
  if (normalizedRole === 'bond_originator') {
    return ['finance', 'buyer_fica', 'sale'].includes(normalizedBucket)
  }
  return false
}

export function filterSharedDocumentsByViewer(documents, viewer = 'internal', { viewerRole = null } = {}) {
  const normalizedViewer = String(viewer || 'internal')
    .trim()
    .toLowerCase()

  if (normalizedViewer === 'internal') {
    return documents.filter((item) => !item?.is_archived)
  }

  if (normalizedViewer === 'external') {
    return documents.filter((item) => {
      if (item?.is_archived) return false
      const visibility = normalizeDocumentVisibilityScope(item.visibility_scope, 'internal')
      if (['shared', 'client'].includes(visibility)) return true
      return roleCanAccessInternalDocumentBucket(viewerRole, item?.bucket_key)
    })
  }

  return documents.filter(
    (item) =>
      !item?.is_archived &&
      (Boolean(item.is_client_visible) ||
        normalizeDocumentVisibilityScope(item.visibility_scope, 'internal') === 'shared' ||
        normalizeDocumentVisibilityScope(item.visibility_scope, 'internal') === 'client'),
  )
}

export async function fetchSharedDocumentRowsByTransactionIds(client, transactionIds = []) {
  const ids = [...new Set((transactionIds || []).filter(Boolean))]
  if (!ids.length) {
    return {
      rows: [],
      hasClientVisibilityColumn: true,
    }
  }

  const documentSelectCandidates = [
    {
      select: 'id, transaction_id, name, file_path, category, document_type, status, review_status, visibility_scope, stage_key, uploaded_by_user_id, is_client_visible, uploaded_by_role, uploaded_by_email, uploaded_by_party, external_access_id, bucket_key, source, source_document_id, file_bucket, finance_lane, related_entity_type, related_entity_id, canonical_requirement_instance_id, created_at, updated_at, notes, lane_key, attorney_role, attorney_persistence_version, client_recipient_role, attorney_version_root_id, attorney_version_previous_id, attorney_version_number, attorney_version_kind, attorney_version_document_type, attorney_target_requirement_id, attorney_target_request_id, is_current_evidence',
      hasClientVisibilityColumn: true,
    },
    {
      select:
        'id, transaction_id, name, file_path, category, document_type, status, review_status, visibility_scope, stage_key, uploaded_by_user_id, is_client_visible, uploaded_by_role, uploaded_by_email, uploaded_by_party, external_access_id, bucket_key, source, source_document_id, file_bucket, finance_lane, related_entity_type, related_entity_id, canonical_requirement_instance_id, created_at, updated_at, notes, lane_key, attorney_role, attorney_persistence_version, client_recipient_role, attorney_version_root_id, attorney_version_previous_id, attorney_version_number, attorney_version_kind, attorney_version_document_type, attorney_target_requirement_id, attorney_target_request_id',
      hasClientVisibilityColumn: true,
    },
    {
      select:
        'id, transaction_id, name, file_path, category, document_type, status, review_status, visibility_scope, stage_key, uploaded_by_user_id, is_client_visible, uploaded_by_role, uploaded_by_email, uploaded_by_party, external_access_id, bucket_key, source, source_document_id, file_bucket, finance_lane, related_entity_type, related_entity_id, canonical_requirement_instance_id, created_at, updated_at, notes, lane_key, attorney_role, attorney_persistence_version, client_recipient_role',
      hasClientVisibilityColumn: true,
    },
    {
      select:
        'id, transaction_id, name, file_path, category, document_type, status, review_status, visibility_scope, stage_key, uploaded_by_user_id, is_client_visible, uploaded_by_role, uploaded_by_email, uploaded_by_party, external_access_id, bucket_key, source, source_document_id, file_bucket, finance_lane, related_entity_type, related_entity_id, canonical_requirement_instance_id, created_at, updated_at',
      hasClientVisibilityColumn: true,
    },
    {
      select:
        'id, transaction_id, name, file_path, category, document_type, status, review_status, visibility_scope, stage_key, uploaded_by_user_id, is_client_visible, uploaded_by_role, uploaded_by_email, uploaded_by_party, external_access_id, bucket_key, source, source_document_id, file_bucket, finance_lane, related_entity_type, related_entity_id, canonical_requirement_instance_id, created_at',
      hasClientVisibilityColumn: true,
    },
    {
      select:
        'id, transaction_id, name, file_path, category, is_client_visible, uploaded_by_role, uploaded_by_email, uploaded_by_party, external_access_id, bucket_key, source, source_document_id, file_bucket, finance_lane, related_entity_type, related_entity_id, created_at',
      hasClientVisibilityColumn: true,
    },
    {
      select:
        'id, transaction_id, name, file_path, category, uploaded_by_role, uploaded_by_email, uploaded_by_party, external_access_id, bucket_key, source, source_document_id, file_bucket, finance_lane, related_entity_type, related_entity_id, created_at',
      hasClientVisibilityColumn: false,
    },
    {
      select:
        'id, transaction_id, name, file_path, category, bucket_key, source, source_document_id, file_bucket, finance_lane, related_entity_type, related_entity_id, created_at',
      hasClientVisibilityColumn: false,
    },
    {
      select: 'id, transaction_id, name, file_path, category, created_at',
      hasClientVisibilityColumn: false,
    },
  ]

  let hasClientVisibilityColumn = true
  let query = { data: [], error: null }
  for (const candidate of documentSelectCandidates) {
    query = await client
      .from('documents')
      .select(candidate.select)
      .in('transaction_id', ids)
      .order('created_at', { ascending: false })

    if (!query.error) {
      hasClientVisibilityColumn = candidate.hasClientVisibilityColumn
      break
    }
    if (!isMissingSchemaError(query.error)) {
      break
    }
  }

  if (query.error) {
    if (isMissingSchemaError(query.error)) {
      return {
        rows: [],
        hasClientVisibilityColumn,
      }
    }

    throw query.error
  }

  return {
    rows: (query.data || []).map((row) => normalizeSharedDocumentRow(row, { hasClientVisibilityColumn })),
    hasClientVisibilityColumn,
  }
}

export async function fetchClientPortalSafeSharedDocumentRowsByTransactionIds(client, transactionIds = []) {
  const ids = [...new Set((transactionIds || []).filter(Boolean))]
  if (!ids.length) return []

  const normalSelectCandidates = [
    'id, transaction_id, name, file_path, category, document_type, status, review_status, visibility_scope, stage_key, uploaded_by_user_id, is_client_visible, uploaded_by_role, uploaded_by_email, uploaded_by_party, external_access_id, bucket_key, source, source_document_id, file_bucket, finance_lane, related_entity_type, related_entity_id, canonical_requirement_instance_id, created_at, updated_at',
    'id, transaction_id, name, file_path, category, document_type, status, review_status, visibility_scope, stage_key, is_client_visible, created_at',
  ]
  const finalDescriptorSelectCandidates = [
    'id, transaction_id, name, category, document_type, status, review_status, visibility_scope, stage_key, uploaded_by_user_id, is_client_visible, uploaded_by_role, uploaded_by_email, uploaded_by_party, external_access_id, source, source_document_id, finance_lane, related_entity_type, related_entity_id, canonical_requirement_instance_id, created_at, updated_at',
    'id, transaction_id, name, category, document_type, status, review_status, visibility_scope, stage_key, is_client_visible, created_at',
  ]
  normalSelectCandidates.unshift(`${normalSelectCandidates[0]}, is_current_evidence`)
  finalDescriptorSelectCandidates.unshift(`${finalDescriptorSelectCandidates[0]}, is_current_evidence`)

  let normalRows = null
  for (const select of normalSelectCandidates) {
    const result = await client
      .from('documents')
      .select(select)
      .in('transaction_id', ids)
      // Keep legacy unclassified documents, but never select an F3 final row
      // through this raw-path query.
      .or('stage_key.is.null,stage_key.neq.final_signed')
      .order('created_at', { ascending: false })
    if (!result.error) {
      normalRows = result.data || []
      break
    }
    if (!isMissingSchemaError(result.error)) throw result.error
  }
  if (normalRows === null) return []

  let finalRows = null
  for (const select of finalDescriptorSelectCandidates) {
    const result = await client
      .from('documents')
      .select(select)
      .in('transaction_id', ids)
      .eq('stage_key', 'final_signed')
      .order('created_at', { ascending: false })
    if (!result.error) {
      finalRows = result.data || []
      break
    }
    if (!isMissingSchemaError(result.error)) throw result.error
  }
  if (finalRows === null) return []

  return [...normalRows, ...finalRows]
    .map((row) => normalizeSharedDocumentRow(row, { hasClientVisibilityColumn: true }))
    .sort((left, right) => {
      const leftAt = Date.parse(left?.created_at || left?.updated_at || '') || 0
      const rightAt = Date.parse(right?.created_at || right?.updated_at || '') || 0
      return rightAt - leftAt
    })
}

export async function loadSharedDocuments(
  client,
  { transactionIds = [], viewer = 'internal', viewerRole = null, clientPortalFinalArtifactDescriptors = false, includeSignedUrls = true } = {},
) {
  const rows = clientPortalFinalArtifactDescriptors
    ? await fetchClientPortalSafeSharedDocumentRowsByTransactionIds(client, transactionIds)
    : (await fetchSharedDocumentRowsByTransactionIds(client, transactionIds)).rows
  const visibleRows = filterSharedDocumentsByViewer(rows, viewer, {
    viewerRole,
  })
  return includeSignedUrls ? enrichDocuments(visibleRows, { client, clientPortalFinalArtifactDescriptors }) :
    visibleRows.map(document => clientPortalFinalArtifactDescriptors && isCanonicalFinalSignedDocumentRow(document)
      ? toClientPortalFinalSignedDocumentDescriptor(document) : document)
}

export async function fetchDocumentsData({ developmentId = null } = {}) {
  const client = requireClient()
  const transactionRows = await fetchTransactionsData({ developmentId })

  const transactionIds = transactionRows.map((row) => row.transaction.id)

  if (!transactionIds.length) {
    return []
  }

  const rowByTransactionId = transactionRows.reduce((accumulator, row) => {
    accumulator[row.transaction.id] = row
    return accumulator
  }, {})

  const docsWithUrls = await loadSharedDocuments(client, {
    transactionIds,
    viewer: 'internal',
  })

  return docsWithUrls.map((doc) => {
    const row = rowByTransactionId[doc.transaction_id]

    return {
      ...doc,
      developmentName: row?.development?.name || '-',
      unitNumber: row?.unit?.unit_number || '-',
      buyerName: row?.buyer?.name || '-',
      stage: row?.stage || '-',
    }
  })
}

export async function fetchDocumentsByUnit({ developmentId = null, organisationId = null } = {}) {
  const client = requireClient()
  const normalizedOrganisationId = String(organisationId || '').trim()
  const normalizedDevelopmentId = String(developmentId || '').trim()
  let allowedDevelopmentIds = null
  if (normalizedOrganisationId) {
    allowedDevelopmentIds = new Set(await fetchDevelopmentIdsForOrganisation(client, normalizedOrganisationId))
    if (!allowedDevelopmentIds.size) return []
    if (
      normalizedDevelopmentId &&
      normalizedDevelopmentId !== 'all' &&
      !allowedDevelopmentIds.has(normalizedDevelopmentId)
    ) {
      return []
    }
  }

  let rows = await fetchUnitsData({
    developmentId,
    stage: 'all',
    financeType: 'all',
  })
  if (allowedDevelopmentIds) {
    rows = rows.filter((row) =>
      allowedDevelopmentIds.has(String(row?.unit?.development_id || row?.development?.id || '').trim()),
    )
  }

  if (!rows.length) {
    return []
  }

  const transactionIds = [...new Set(rows.map((row) => row.transaction?.id).filter(Boolean))]
  const documents = await loadSharedDocuments(client, {
    transactionIds,
    viewer: 'internal',
  })

  const docsByTransactionId = documents.reduce((accumulator, document) => {
    if (!accumulator[document.transaction_id]) {
      accumulator[document.transaction_id] = []
    }

    accumulator[document.transaction_id].push(document)
    return accumulator
  }, {})

  const requirementsByDevelopment = {}
  const uniqueDevelopmentIds = [...new Set(rows.map((row) => row.unit?.development_id || row.development?.id || null).filter(Boolean))]
  const transactionRequirementsByTransactionId = await fetchTransactionRequiredDocumentsByTransactionIds(
    client,
    transactionIds,
  )

  for (const currentDevelopmentId of uniqueDevelopmentIds) {
    requirementsByDevelopment[currentDevelopmentId] = await fetchDocumentRequirements(client, currentDevelopmentId)
  }

  return rows.sort(byDevelopmentThenUnit).map((row) => {
    const transactionId = row.transaction?.id
    const unitDocuments = transactionId ? docsByTransactionId[transactionId] || [] : []
    const transactionRequirements = transactionId ? transactionRequirementsByTransactionId[transactionId] || [] : []
    const checklistResult = transactionRequirements.length
      ? buildRequiredChecklistFromRows(transactionRequirements, unitDocuments)
      : buildDocumentChecklist(
          requirementsByDevelopment[row.unit?.development_id || row.development?.id || null] || DEFAULT_DOCUMENT_REQUIREMENTS,
          unitDocuments,
        )

    return {
      unit: row.unit,
      development: row.development,
      buyer: row.buyer,
      transaction: row.transaction,
      stage: row.stage,
      documents: unitDocuments,
      requiredChecklist: checklistResult.checklist,
      checklistSummary: checklistResult.summary,
    }
  })
}
