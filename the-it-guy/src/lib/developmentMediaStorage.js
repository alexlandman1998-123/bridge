// Stored URLs identify objects; viewing URLs are renewed for the current actor.
const SIGNED_URL_SECONDS = 60 * 60 * 24
const CACHE_MS = 55 * 60 * 1000
const MAX_CACHE_ENTRIES = 2000
const BATCH_SIZE = 100
const clientCaches = new WeakMap()

const text = (value) => String(value || '').trim()

function validPath(path, developmentId) {
  return Boolean(developmentId) && path.startsWith(`developments/${developmentId}/`) &&
    path.split('/').every((part) => part && part !== '.' && part !== '..') &&
    !path.includes('\\') && !Array.from(path).some((character) => character.charCodeAt(0) < 32)
}

export function developmentMediaReference(client, value, developmentId) {
  try {
    const url = new URL(text(value))
    if (url.origin !== new URL(client.supabaseUrl).origin) return null
    const match = url.pathname.match(/^\/storage\/v1\/object\/(sign|authenticated)\/([^/]+)\/(.+)$/)
    if (!match) return null
    const bucket = decodeURIComponent(match[2])
    const path = decodeURIComponent(match[3])
    if (!bucket || /[/\\]/.test(bucket) || !developmentId || !validPath(path, developmentId)) return null
    return { bucket, path }
  } catch {
    return null
  }
}

function referenceUrl(client, { bucket, path }) {
  return `${new URL(client.supabaseUrl).origin}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${path.split('/').map(encodeURIComponent).join('/')}`
}

function mapMedia(value, transform) {
  if (typeof value === 'string') return value.split('\n').map(transform).join('\n')
  if (Array.isArray(value)) return value.map((item) => mapMedia(item, transform))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapMedia(item, transform)]))
  }
  return value
}

// Save token-free object references in existing URL fields. External/public URLs
// remain unchanged, and older records need no migration or remote backfill.
export function persistDevelopmentMedia(client, value, developmentId) {
  return mapMedia(value, (url) => {
    const reference = developmentMediaReference(client, url, developmentId)
    return reference ? referenceUrl(client, reference) : url
  })
}

function cacheFor(client) {
  let state = clientCaches.get(client)
  if (state) return state
  state = { entries: new Map(), pending: new Map(), generation: 0, userId: undefined }
  clientCaches.set(client, state)
  client.auth?.onAuthStateChange?.((event, session) => {
    const userId = session?.user?.id || null
    const changedUser = state.userId !== undefined && state.userId !== userId
    state.userId = userId
    if (event !== 'SIGNED_OUT' && !changedUser) return
    state.generation += 1
    state.entries.clear()
    state.pending.clear()
  })
  return state
}

const keyFor = ({ bucket, path }) => `${bucket}/${path}`

function documentReference(client, row, developmentId) {
  const bucket = text(row.storage_bucket || row.storageBucket) || 'documents'
  const path = text(row.storage_path || row.storagePath)
  if (bucket && !/[/\\]/.test(bucket) && validPath(path, developmentId)) return { bucket, path }
  return developmentMediaReference(client, row.file_url || row.fileUrl, developmentId)
}

export async function refreshDevelopmentMedia(client, rows = [], { strict = true } = {}) {
  const references = new Map()
  const sources = rows.map((row) => {
    const developmentId = row.development_id || row.developmentId
    const source = { ...row }
    const reference = documentReference(client, row, developmentId)
    if (reference) {
      if ('file_url' in row) source.file_url = referenceUrl(client, reference)
      if ('fileUrl' in row) source.fileUrl = referenceUrl(client, reference)
      // Recover the durable location for legacy document records too.
      source.storage_bucket = reference.bucket
      source.storage_path = reference.path
    }
    mapMedia(source, (url) => {
      const asset = developmentMediaReference(client, url, developmentId)
      if (asset) references.set(keyFor(asset), asset)
      return url
    })
    return source
  })
  if (!references.size) return sources

  const state = cacheFor(client)
  const generation = state.generation
  const groups = new Map()
  const now = Date.now()
  for (const [key, reference] of references) {
    const cached = state.entries.get(key)
    if (cached && cached.expiresAt > now) continue
    state.entries.delete(key)
    if (state.pending.has(key)) continue
    if (!groups.has(reference.bucket)) groups.set(reference.bucket, [])
    groups.get(reference.bucket).push(reference)
  }

  // Defer signing so overlapping readers can reuse the same pending objects.
  // Each request is bounded, including large galleries across a portfolio.
  let previous = Promise.resolve()
  for (const [bucket, assets] of groups) {
    for (let offset = 0; offset < assets.length; offset += BATCH_SIZE) {
      const batch = assets.slice(offset, offset + BATCH_SIZE)
      const request = previous.then(async () => {
        try {
          return await client.storage.from(bucket).createSignedUrls(batch.map((asset) => asset.path), SIGNED_URL_SECONDS)
        } catch {
          return { error: true }
        }
      })
      previous = request
      for (const asset of batch) {
        const key = keyFor(asset)
        const pending = request.then((response) => {
          const item = response.data?.find((entry) => entry.path === asset.path)
          const url = !response.error && !item?.error ? text(item?.signedUrl) : ''
          if (url && generation === state.generation) {
            state.entries.delete(key)
            state.entries.set(key, { url, expiresAt: Date.now() + CACHE_MS })
            while (state.entries.size > MAX_CACHE_ENTRIES) state.entries.delete(state.entries.keys().next().value)
          }
          if (state.pending.get(key) === pending) state.pending.delete(key)
          return url
        })
        state.pending.set(key, pending)
      }
    }
  }

  const urls = new Map(await Promise.all([...references].map(async ([key]) => {
    const url = state.entries.get(key)?.url || await state.pending.get(key)
    if (generation !== state.generation || (!url && strict)) {
      // Never replace saved references with blanks or save a partial profile
      // after a signing failure. No privileged/public fallback is attempted.
      throw new Error('Development media could not be loaded. Reload or check storage access.')
    }
    return [key, url]
  })))
  return sources.map((row) => mapMedia(row, (url) => {
    const reference = developmentMediaReference(client, url, row.development_id || row.developmentId)
    return reference ? urls.get(keyFor(reference)) : url
  }))
}
