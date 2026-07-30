export const AGENCY_PUBLIC_INTAKE_PRIVACY_VERSION = 'agency-public-intake-v1'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeLower(value = '') {
  return normalizeText(value).toLowerCase()
}

function normalizeSlug(value = '') {
  return normalizeLower(value)
}

function buildStorageKey(slug = '', intent = '') {
  return `arch9:agency-public-intake:${normalizeSlug(slug)}:${normalizeLower(intent || 'general')}:idempotency`
}

function createIdempotencyKey(slug = '', intent = '') {
  const safeSlug = normalizeSlug(slug) || 'agency'
  const safeIntent = normalizeLower(intent) || 'intake'
  const random = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `agency-intake:${safeSlug}:${safeIntent}:${random}`
}

function getStorage() {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage || null
  } catch {
    return null
  }
}

export function getOrCreateAgencyIntakeIdempotencyKey(slug = '', intent = '') {
  const storage = getStorage()
  const key = buildStorageKey(slug, intent)
  if (!storage) return createIdempotencyKey(slug, intent)
  const existing = normalizeText(storage.getItem(key))
  if (existing) return existing
  const next = createIdempotencyKey(slug, intent)
  storage.setItem(key, next)
  return next
}

export function rotateAgencyIntakeIdempotencyKey(slug = '', intent = '') {
  const storage = getStorage()
  const next = createIdempotencyKey(slug, intent)
  if (storage) storage.setItem(buildStorageKey(slug, intent), next)
  return next
}

export function readAgencyIntakeAttribution(searchParams) {
  const params = searchParams || new URLSearchParams()
  const utm = {}
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) {
    const value = normalizeText(params.get(key))
    if (value) utm[key] = value
  }

  const listingId = normalizeText(params.get('listingId') || params.get('listing_id'))
  const listingSlug = normalizeText(params.get('listing') || params.get('listingSlug') || params.get('listing_slug'))

  return {
    sourceChannel: normalizeLower(params.get('source') || params.get('channel') || params.get('utm_source') || 'website'),
    campaignCode: normalizeLower(params.get('campaign') || params.get('campaign_code') || params.get('utm_campaign')),
    utm,
    selectedListings: listingId || listingSlug ? [{ id: listingId, slug: listingSlug }] : [],
    context: {
      pageUrl: typeof window !== 'undefined' ? window.location.href : '',
      referrer: typeof document !== 'undefined' ? document.referrer : '',
    },
  }
}

async function readJsonResponse(response, fallbackMessage = 'Request failed.') {
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    throw new Error(fallbackMessage)
  }
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.message || fallbackMessage)
  }
  return payload
}

export async function resolveAgencyPublicIntake(slug = '') {
  const safeSlug = normalizeSlug(slug)
  if (!safeSlug) throw new Error('Agency intake link is missing.')
  const params = new URLSearchParams({ slug: safeSlug })
  const response = await fetch(`/api/public/agency-intake?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  })
  const payload = await readJsonResponse(response, 'This agency intake link is not available.')
  return payload?.intake || null
}

export async function resolveAgencyPublicListings(slug = '', filters = {}) {
  const safeSlug = normalizeSlug(slug)
  if (!safeSlug) return []
  const params = new URLSearchParams({ agencySlug: safeSlug, audience: 'agency-intake', limit: String(filters.limit || 12) })
  for (const [key, value] of Object.entries(filters)) {
    const text = normalizeText(value)
    if (key !== 'limit' && text) params.set(key, text)
  }
  const response = await fetch(`/api/public/listings?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  })
  const payload = await readJsonResponse(response, 'Published listings could not be loaded.')
  return Array.isArray(payload?.items) ? payload.items : []
}

export async function submitAgencyPublicIntake({ slug = '', idempotencyKey = '', payload = {} } = {}) {
  const safeSlug = normalizeSlug(slug || payload.slug)
  if (!safeSlug) throw new Error('Agency intake link is missing.')
  const params = new URLSearchParams({ slug: safeSlug })
  const response = await fetch(`/api/public/agency-intake?${params.toString()}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...payload,
      slug: safeSlug,
      idempotencyKey,
    }),
  })
  return readJsonResponse(response, 'We could not send your enquiry right now.')
}
