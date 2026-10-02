import { isStorageBucketMissingError, isStoragePermissionDeniedError } from './storageFallbacks.js'

export function isTemporaryStorageError(error) {
  if (!error || isStoragePermissionDeniedError(error) || isStorageBucketMissingError(error)) return false
  const status = Number(error.status || error.statusCode || 0)
  const code = String(error.code || error.errorCode || '').toLowerCase()
  const message = String(error.message || '').toLowerCase()
  return [408, 429, 500, 502, 503, 504, 544].includes(status) ||
    ['databasetimeout', 'etimedout', 'econnreset'].includes(code) ||
    /database timed out|statement timeout|failed to fetch|networkerror|network request failed/.test(message)
}

// Callers must reuse the object path and permit overwrite when retrying writes.
export async function retryStorageOperation(operation, {
  attempts = 3,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  random = Math.random,
} = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const result = await operation()
      if (result?.error) throw result.error
      return result
    } catch (error) {
      if (attempt + 1 >= attempts || !isTemporaryStorageError(error)) throw error
      await sleep(750 * 2 ** attempt + Math.floor(random() * 250))
    }
  }
}

export function createMediaUploadQueue(concurrency = 2) {
  let active = 0
  const waiting = []
  function drain() {
    while (active < concurrency && waiting.length) {
      const { operation, resolve, reject } = waiting.shift()
      active += 1
      Promise.resolve().then(operation).then(resolve, reject).finally(() => {
        active -= 1
        drain()
      })
    }
  }
  return (operation) => new Promise((resolve, reject) => {
    waiting.push({ operation, resolve, reject })
    drain()
  })
}

// Shared by gallery, floor plans and quick capture in this browser session.
export const queueListingMediaUpload = createMediaUploadQueue()

export async function settleListingImageUploads(images, upload, onUploaded = () => {}) {
  const results = await Promise.allSettled(images.map(async (image, index) => {
    const uploaded = await upload(image, index)
    onUploaded(uploaded, image)
    return uploaded
  }))
  const uploadedImages = results.filter((result) => result.status === 'fulfilled').map((result) => result.value)
  const failures = results.filter((result) => result.status === 'rejected')
  if (failures.length) {
    const error = new Error(`${failures[0].reason?.message || 'Image upload failed.'} ${uploadedImages.length} image(s) uploaded successfully and retained. Retry to finish the remaining ${failures.length}.`)
    error.uploadedImages = uploadedImages
    error.cause = failures[0].reason
    throw error
  }
  return uploadedImages
}
