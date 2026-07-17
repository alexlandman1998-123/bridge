import {
  ATTORNEY_LEAD_SERVICE_TYPE_VALUES,
  normalizeAttorneyLeadSourceChannel,
  sanitizeAttorneyLeadCampaignCode,
} from '../core/leads/attorneyLeadContract.js'
import { assertEdgeFunctionSuccess, invokeEdgeFunction } from '../lib/supabaseClient.js'

export const ATTORNEY_PUBLIC_INTAKE_FUNCTION = 'attorney-public-intake'
export const ATTORNEY_PUBLIC_INTAKE_PRIVACY_VERSION = 'arch9-attorney-intake-v1'

const IDEMPOTENCY_PREFIX = 'attorney-intake:'
const IDEMPOTENCY_STORAGE_PREFIX = 'arch9:attorney-intake:idempotency:'
const UTM_KEYS = Object.freeze(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'])
const PUBLIC_CONTACT_FALLBACKS = Object.freeze({
  'young-law-inc': Object.freeze({
    email: 'info@younglaw.co.za',
    phone: '010 446 7675',
    website: 'https://www.younglaw.co.za/',
  }),
})

function normalizeText(value = '', maxLength = 5000) {
  return String(value || '').trim().slice(0, maxLength)
}

function normalizeSlug(value = '') {
  return normalizeText(value, 80).toLowerCase()
}

function createRandomToken() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const random = Math.random().toString(36).slice(2)
  return `${Date.now().toString(36)}-${random}-${random}`
}

export function createAttorneyIntakeIdempotencyKey() {
  return `${IDEMPOTENCY_PREFIX}${createRandomToken()}`.slice(0, 128)
}

export function attorneyIntakeIdempotencyStorageKey(slug, serviceType) {
  return `${IDEMPOTENCY_STORAGE_PREFIX}${normalizeSlug(slug)}:${normalizeText(serviceType, 80).toLowerCase()}`
}

export function getOrCreateAttorneyIntakeIdempotencyKey(slug, serviceType, storage = globalThis.sessionStorage) {
  const storageKey = attorneyIntakeIdempotencyStorageKey(slug, serviceType)
  try {
    const existing = normalizeText(storage?.getItem(storageKey), 128)
    if (existing.length >= 16 && /^[A-Za-z0-9._:-]+$/.test(existing)) return existing
    const created = createAttorneyIntakeIdempotencyKey()
    storage?.setItem(storageKey, created)
    return created
  } catch {
    return createAttorneyIntakeIdempotencyKey()
  }
}

export function rotateAttorneyIntakeIdempotencyKey(slug, serviceType, storage = globalThis.sessionStorage) {
  const created = createAttorneyIntakeIdempotencyKey()
  try {
    storage?.setItem(attorneyIntakeIdempotencyStorageKey(slug, serviceType), created)
  } catch {
    // A valid in-memory key still protects the active submission.
  }
  return created
}

export function readAttorneyIntakeAttribution(searchParams) {
  const params = searchParams instanceof URLSearchParams
    ? searchParams
    : new URLSearchParams(String(searchParams || ''))
  const utm = {}
  for (const key of UTM_KEYS) {
    const value = normalizeText(params.get(key), 160)
    if (value) utm[key] = value
  }
  return {
    source_channel: normalizeAttorneyLeadSourceChannel(params.get('source') || params.get('utm_source') || 'website'),
    campaign_code: sanitizeAttorneyLeadCampaignCode(params.get('campaign') || params.get('utm_campaign') || ''),
    utm,
  }
}

function sanitizeBrandColour(value, fallback) {
  const colour = normalizeText(value, 20)
  return /^#[0-9a-f]{6}$/i.test(colour) ? colour : fallback
}

export function normalizeAttorneyPublicIntake(value) {
  const row = value && typeof value === 'object' ? value : {}
  const slug = normalizeSlug(row.slug)
  const contactFallback = PUBLIC_CONTACT_FALLBACKS[slug] || {}
  const configuredServices = Array.isArray(row.service_types)
    ? row.service_types.filter((service) => ATTORNEY_LEAD_SERVICE_TYPE_VALUES.includes(service))
    : []
  return {
    slug,
    status: normalizeText(row.status, 40),
    heading: normalizeText(row.heading, 160) || 'How can we assist you?',
    introduction: normalizeText(row.introduction, 1000) || 'Choose a service and tell us briefly how we can help.',
    serviceTypes: Array.isArray(row.service_types) ? configuredServices : [...ATTORNEY_LEAD_SERVICE_TYPE_VALUES],
    firmName: normalizeText(row.firm_name, 180) || 'Your conveyancing team',
    logoUrl: normalizeText(row.logo_url, 2000),
    primaryColour: sanitizeBrandColour(row.primary_colour, '#173f45'),
    secondaryColour: sanitizeBrandColour(row.secondary_colour, '#d3a866'),
    website: normalizeText(row.website, 2000) || contactFallback.website || '',
    contactEmail: normalizeText(row.contact_email, 254) || contactFallback.email || '',
    contactPhone: normalizeText(row.contact_phone, 50) || contactFallback.phone || '',
  }
}

export async function resolveAttorneyPublicIntake(slug) {
  const result = await invokeEdgeFunction(ATTORNEY_PUBLIC_INTAKE_FUNCTION, {
    body: { action: 'resolve', slug: normalizeSlug(slug) },
  })
  assertEdgeFunctionSuccess(result, 'We could not load this intake page.')
  return normalizeAttorneyPublicIntake(result.data?.intake)
}

export async function probeAttorneyPublicIntakeRuntime(slug) {
  const result = await invokeEdgeFunction(ATTORNEY_PUBLIC_INTAKE_FUNCTION, {
    body: { action: 'health', slug: normalizeSlug(slug) },
  })
  assertEdgeFunctionSuccess(result, 'The public Journey runtime could not be reached.')
  return {
    healthy: result.data?.healthy === true,
    intakeActive: result.data?.intake_active === true,
    code: normalizeText(result.data?.code, 80),
    version: normalizeText(result.data?.runtime_version, 120),
  }
}

export async function submitAttorneyPublicIntake({ slug, idempotencyKey, payload }) {
  const result = await invokeEdgeFunction(ATTORNEY_PUBLIC_INTAKE_FUNCTION, {
    body: {
      action: 'submit',
      slug: normalizeSlug(slug),
      idempotency_key: normalizeText(idempotencyKey, 128),
      payload,
    },
  })
  assertEdgeFunctionSuccess(result, 'We could not send your enquiry right now.')
  return {
    accepted: result.data?.accepted === true,
    duplicate: result.data?.duplicate === true,
    code: normalizeText(result.data?.code, 80),
  }
}
