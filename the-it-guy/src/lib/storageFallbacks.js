function normalizeText(value) {
  return String(value || '').trim()
}

export function normalizeStorageCandidateBuckets(bucketCandidates = []) {
  return Array.from(new Set((bucketCandidates || []).map((bucket) => normalizeText(bucket)).filter(Boolean)))
}

export function isStorageBucketMissingError(error) {
  if (!error) return false
  const status = Number(error?.status || error?.statusCode || 0)
  const code = normalizeText(error?.code).toLowerCase()
  const message = normalizeText(error?.message || error?.error).toLowerCase()
  const details = normalizeText(error?.details).toLowerCase()
  const combined = `${message} ${details}`
  return (
    status === 404 ||
    code === 'bucket_not_found' ||
    (combined.includes('bucket') &&
      (combined.includes('not found') || combined.includes('does not exist') || combined.includes('unknown')))
  )
}

export function isStoragePermissionDeniedError(error) {
  if (!error) return false
  const status = Number(error?.status || error?.statusCode || 0)
  const code = normalizeText(error?.code).toLowerCase()
  const message = normalizeText(error?.message || error?.error).toLowerCase()
  const details = normalizeText(error?.details).toLowerCase()
  const combined = `${message} ${details}`
  return (
    status === 401 ||
    status === 403 ||
    code === '401' ||
    code === '403' ||
    code === '42501' ||
    code === 'permission_denied' ||
    code === 'insufficient_privilege' ||
    combined.includes('row-level security') ||
    combined.includes('permission denied') ||
    combined.includes('not authorized') ||
    combined.includes('unauthorized')
  )
}

export function buildStorageCandidateError(message, { code = 'storage_candidate_upload_failed', cause = null, checkedBuckets = [] } = {}) {
  const error = new Error(message)
  error.code = code
  error.checkedBuckets = checkedBuckets
  if (cause) error.cause = cause
  return error
}

export async function uploadToStorageCandidateBuckets({
  bucketCandidates = [],
  upload,
  missingBucketMessage = 'Storage bucket is not configured for this environment.',
  accessDeniedMessage = 'Storage access is not ready yet. Please retry after storage access is refreshed.',
  genericMessage = 'Unable to upload file.',
  missingBucketCode = 'storage_bucket_not_found',
  accessDeniedCode = 'storage_access_not_ready',
} = {}) {
  if (typeof upload !== 'function') {
    throw new Error('Storage upload handler is required.')
  }

  const checkedBuckets = []
  let latestMissingBucketError = null
  let latestPermissionError = null
  let latestError = null

  for (const bucketName of normalizeStorageCandidateBuckets(bucketCandidates)) {
    checkedBuckets.push(bucketName)
    const result = await upload(bucketName)
    const error = result?.error || null
    if (!error) {
      return { bucket: bucketName, result, checkedBuckets }
    }

    latestError = error
    if (isStorageBucketMissingError(error)) {
      latestMissingBucketError = error
      continue
    }
    if (isStoragePermissionDeniedError(error)) {
      latestPermissionError = error
      continue
    }
    throw error
  }

  if (latestPermissionError) {
    throw buildStorageCandidateError(accessDeniedMessage, {
      code: accessDeniedCode,
      cause: latestPermissionError,
      checkedBuckets,
    })
  }

  if (latestMissingBucketError) {
    throw buildStorageCandidateError(missingBucketMessage, {
      code: missingBucketCode,
      cause: latestMissingBucketError,
      checkedBuckets,
    })
  }

  throw buildStorageCandidateError(genericMessage, {
    cause: latestError,
    checkedBuckets,
  })
}
