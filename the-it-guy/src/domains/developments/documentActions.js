// Extracted without changing validation, persistence order or recovery behaviour.
import { requireClient, normalizeTextValue, normalizeNullableText, isMissingTableError } from '../../lib/api/shared/readHelpers.js'
import { developmentMediaReference, persistDevelopmentMedia, refreshDevelopmentMedia } from '../../lib/developmentMediaStorage.js'
import { notifyDocumentRequirementContextChanged } from '../../services/documents/documentRequirementReadService.js'
import { normalizeDevelopmentDocumentRow } from './readApi.js'
import { validateDocumentUploadFile } from '../../lib/documentUploadPolicy'
import { runRecoverableDocumentUpload, readSavedUploadByPath } from '../../lib/documentUploadRecovery.js'
import { DOCUMENTS_BUCKET_CANDIDATES } from '../../lib/supabaseClient'
import { uploadToDocumentsBucket, removeUploadedDocumentObject } from '../../lib/api/shared/storage.js'
import { getSignedUrl } from '../documents/listReadApi.js'

export function toCategoryKey(label) {
  return String(label || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
}

export async function createDevelopmentDocumentRequirement({ developmentId, label }) {
  const client = requireClient()

  const normalizedLabel = label?.trim()
  if (!developmentId) {
    throw new Error('Development is required.')
  }

  if (!normalizedLabel) {
    throw new Error('Document label is required.')
  }

  const baseKey = toCategoryKey(normalizedLabel) || 'custom_document'

  const { data: existingRows, error: existingRowsError } = await client
    .from('document_requirements')
    .select('category_key, sort_order')
    .eq('development_id', developmentId)
    .order('sort_order', { ascending: false })

  if (existingRowsError) {
    throw existingRowsError
  }

  const existingKeys = new Set(existingRows.map((row) => row.category_key))
  let categoryKey = baseKey
  let suffix = 2
  while (existingKeys.has(categoryKey)) {
    categoryKey = `${baseKey}_${suffix}`
    suffix += 1
  }

  const nextSortOrder = (existingRows[0]?.sort_order ?? 0) + 1

  const { data, error } = await client
    .from('document_requirements')
    .insert({
      development_id: developmentId,
      category_key: categoryKey,
      label: normalizedLabel,
      sort_order: nextSortOrder,
    })
    .select('id, development_id, category_key, label, sort_order')
    .single()

  if (error) {
    throw error
  }

  return data
}

export async function deleteDevelopmentDocumentRequirement(requirementId) {
  const client = requireClient()

  const { error } = await client.from('document_requirements').delete().eq('id', requirementId)

  if (error) {
    throw error
  }
}

export async function saveDevelopmentDocument({
  developmentId,
  documentId = null,
  documentType = 'other',
  title,
  description = '',
  fileUrl,
  linkedUnitId = null,
  linkedUnitType = '',
  approvalStatus,
  visibility,
  version,
  supersedesDocumentId,
  archivedAt,
  storageBucket,
  storagePath,
  mimeType,
  fileSizeBytes,
  resolvePreview = true,
} = {}) {
  const client = requireClient()

  if (!developmentId) {
    throw new Error('Development is required.')
  }

  if (!normalizeTextValue(title)) {
    throw new Error('Document title is required.')
  }

  const replacesFile = Boolean(documentId && [fileUrl, storagePath, storageBucket].some(value => value !== undefined))
  if (replacesFile && supersedesDocumentId && supersedesDocumentId !== documentId) throw new Error('Choose the current document before replacing its file.')
  const payload = {
    id: replacesFile ? undefined : documentId || undefined,
    development_id: developmentId,
    document_type: normalizeTextValue(documentType) || 'other',
    title: normalizeTextValue(title),
    description: normalizeNullableText(description),
    linked_unit_id: linkedUnitId || null,
    linked_unit_type: normalizeNullableText(linkedUnitType),
    uploaded_at: new Date().toISOString(),
  }
  if (replacesFile) payload.supersedes_document_id = documentId

  if (fileUrl !== undefined) {
    const url = normalizeTextValue(fileUrl)
    if (url && !/^https?:\/\//i.test(url)) throw new Error('Use an HTTPS file link or upload a document file.')
    payload.file_url = normalizeNullableText(persistDevelopmentMedia(client, url, developmentId))
    // A replacement URL must replace its durable location too. Otherwise the
    // next read signs the OLD storage_path and silently restores the old file.
    if (storageBucket === undefined && storagePath === undefined) {
      const reference = developmentMediaReference(client, url, developmentId, { allowPublic: true })
      payload.storage_bucket = reference?.bucket || null
      payload.storage_path = reference?.path || null
      payload.mime_type = null
      payload.file_size_bytes = null
    }
  }

  if (approvalStatus !== undefined) payload.approval_status = normalizeTextValue(approvalStatus) || 'approved'
  if (visibility !== undefined) payload.visibility = normalizeTextValue(visibility) || 'internal'
  if (version !== undefined) payload.version = Math.max(1, Math.trunc(Number(version) || 1))
  if (supersedesDocumentId !== undefined && !replacesFile) payload.supersedes_document_id = supersedesDocumentId || null
  if (archivedAt !== undefined) payload.archived_at = archivedAt || null
  if (storageBucket !== undefined) payload.storage_bucket = normalizeNullableText(storageBucket)
  if (storagePath !== undefined) payload.storage_path = normalizeNullableText(storagePath)
  if (mimeType !== undefined) payload.mime_type = normalizeNullableText(mimeType)
  if (fileSizeBytes !== undefined) {
    const normalizedSize = Number(fileSizeBytes)
    payload.file_size_bytes = Number.isFinite(normalizedSize) && normalizedSize >= 0 ? Math.trunc(normalizedSize) : null
  }

  const table = client.from('development_documents')
  const mutation = documentId && !replacesFile
    ? table.update(payload).eq('id', documentId).eq('development_id', developmentId)
    : table.upsert(payload, { onConflict: 'id' })
  const { data, error } = await mutation
    .select(
      'id, development_id, document_type, title, description, file_url, linked_unit_id, linked_unit_type, approval_status, visibility, version, supersedes_document_id, archived_at, storage_bucket, storage_path, mime_type, file_size_bytes, uploaded_at, created_at',
    )
    .single()

  if (error) {
    if (isMissingTableError(error, 'development_documents')) {
      throw new Error('development_documents table not found. Run sql/schema.sql first.')
    }
    throw error
  }

  if (!data?.id) throw new Error('The document save could not be confirmed. Refresh the development before trying again.')
  notifyDocumentRequirementContextChanged()
  // Upload callers confirm the durable row first and resolve its preview as a
  // bounded follow-up. A slow signing request must not delay "Uploaded".
  if (!resolvePreview) return { ...normalizeDevelopmentDocumentRow(data), saved: true }

  let mediaRefreshFailed = false
  const [document] = await refreshDevelopmentMedia(client, [data]).catch(() => { mediaRefreshFailed = true; return [data] })
  const saved = normalizeDevelopmentDocumentRow(document)
  return mediaRefreshFailed ? { ...saved, saved: true, persistenceWarnings: ['Document saved, but its preview could not be refreshed. Reopen the record to view it.'] } : saved
}

export async function uploadDevelopmentDocumentAsset({
  developmentId,
  documentId = null,
  file,
  documentType = 'marketing',
  title = '',
  description = '',
  linkedUnitId = null,
  linkedUnitType = '',
  onProgress = null,
} = {}) {
  const client = requireClient()

  if (!developmentId) {
    throw new Error('Development is required.')
  }

  const selectedFile = typeof File !== 'undefined' && file instanceof File ? file : file || null
  if (!selectedFile) {
    throw new Error('Select a valid file before uploading.')
  }

  const filePolicy = validateDocumentUploadFile(selectedFile, { surface: 'development_asset' })
  const safeType = String(documentType || 'marketing')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'marketing'
  const safeName = String(selectedFile.name || 'development-asset')
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'development-asset'
  const objectId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return runRecoverableDocumentUpload({ client: client, scope: ['development_asset', developmentId, documentId, safeType, title, description, linkedUnitId, linkedUnitType], file, storageBuckets: DOCUMENTS_BUCKET_CANDIDATES, onProgress,
    toSavedReceipt: result => normalizeDevelopmentDocumentRow(result.data),
    run: async attempt => {
      const filePath = attempt.path(`developments/${developmentId}/${safeType}/${objectId}-${safeName}`)
      const uploadedBucket = await attempt.upload(() => uploadToDocumentsBucket(client, filePath, selectedFile, {
        cacheControl: '3600',
        contentType: filePolicy.mimeType,
      }))
      const { data: publicUrlData } = client.storage.from(uploadedBucket).getPublicUrl(filePath)
      const publicUrl = normalizeTextValue(publicUrlData?.publicUrl)
      const fileUrl = publicUrl || ''

      const result = await attempt.persist({
        save: async () => ({ data: await saveDevelopmentDocument({
          developmentId,
          supersedesDocumentId: documentId,
          documentType: safeType,
          title: title || selectedFile.name || 'Development asset',
          description,
          fileUrl,
          linkedUnitId,
          linkedUnitType,
          storageBucket: uploadedBucket,
          storagePath: filePath,
          mimeType: filePolicy.mimeType,
          fileSizeBytes: selectedFile.size,
          resolvePreview: false,
        }) }),
        read: () => readSavedUploadByPath(client, { table: 'development_documents', column: 'storage_path', path: filePath, filters: { development_id: developmentId } }),
        cleanup: () => removeUploadedDocumentObject(client, uploadedBucket, filePath),
      })
      const signedUrl = await getSignedUrl(filePath, { client, fileBucket: uploadedBucket })
      return { ...result.data, fileUrl: signedUrl || result.data.fileUrl, file_url: signedUrl || result.data.file_url }

    },
  })
}

export async function deleteDevelopmentDocument(documentId) {
  const client = requireClient()

  if (!documentId) throw new Error('Select a document to remove.')

  const { data, error } = await client.from('development_documents').update({ archived_at: new Date().toISOString() }).eq('id', documentId).select('id').maybeSingle()

  if (error) {
    if (isMissingTableError(error, 'development_documents')) {
      throw new Error('development_documents table not found. Run sql/schema.sql first.')
    }
    throw error
  }
  if (!data?.id) throw new Error('Removal could not be confirmed. Refresh the list and check your permission before trying again.')
  notifyDocumentRequirementContextChanged()
  return { id: data.id, removed: true, fileErased: false }
}
