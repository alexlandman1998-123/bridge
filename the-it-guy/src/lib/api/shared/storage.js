// Shared storage boundary for extracted document and portal repositories.
export { uploadToStorageCandidateBuckets } from '../../storageFallbacks'

// Extracted without changing validation, persistence order or recovery behaviour.
import { getDocumentUploadOptions, withDocumentUploadMimeType } from '../../documentUploadPolicy'
import { uploadToStorageCandidateBuckets } from '../../storageFallbacks'
import { DOCUMENTS_BUCKET_CANDIDATES } from '../../supabaseClient'

export async function uploadToDocumentsBucket(client, filePath, file, options = undefined) {
  const uploadOptions = getDocumentUploadOptions(file, { ...options, fileName: filePath.split('/').at(-1), surface: 'documents_storage' })
  const uploadBody = withDocumentUploadMimeType(file, uploadOptions.contentType)
  const { bucket } = await uploadToStorageCandidateBuckets({
    bucketCandidates: DOCUMENTS_BUCKET_CANDIDATES,
    upload: (bucketName) => client.storage.from(bucketName).upload(filePath, uploadBody, uploadOptions),
    missingBucketMessage: `Storage bucket not found for document upload. Checked: ${DOCUMENTS_BUCKET_CANDIDATES.join(
      ', ',
    )}. Configure VITE_SUPABASE_DOCUMENTS_BUCKET (or legacy VITE_SUPABASE_DOCUMENT_BUCKET) to the correct bucket name.`,
    accessDeniedMessage: 'Document storage is not ready yet. Please retry after storage access is refreshed.',
    accessDeniedCode: 'document_storage_access_not_ready',
    genericMessage: 'Unable to upload document.',
  })
  return bucket
}

export async function removeUploadedDocumentObject(client, bucketName, filePath) {
  const normalizedBucket = String(bucketName || '').trim()
  const normalizedPath = String(filePath || '').trim()
  if (!normalizedBucket || !normalizedPath) return

  const { error } = await client.storage.from(normalizedBucket).remove([normalizedPath])
  if (error) throw error
}
