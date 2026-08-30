import { isSupabaseConfigured, supabase } from './supabaseClient'

const DEFAULT_DEMO_CONFIG = Object.freeze({
  slug: '',
  agencyName: '',
  logoUrl: '',
  logoLightUrl: '',
  logoDarkUrl: '',
  primaryColour: '',
  secondaryColour: '',
  accentColour: '',
  samplePropertyImageUrl: '',
  samplePropertyAddress: '',
})

const PROSPECT_DEMO_CONFIG_CACHE_TTL_MS = 5 * 60 * 1000
const PROSPECT_DEMO_CONFIG_WAIT_MS = 1200
const prospectDemoConfigCache = new Map()
const prospectDemoConfigRequests = new Map()

function normalizeText(value = '') {
  return String(value || '').trim()
}

export function normalizeProspectDemoSlug(value = '') {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function normalizeProspectDemoConfig(config = {}, { slug = '' } = {}) {
  const source = config && typeof config === 'object' ? config : {}
  const normalizedSlug = normalizeProspectDemoSlug(source.slug || source.slug_key || slug)
  return {
    ...DEFAULT_DEMO_CONFIG,
    slug: normalizedSlug,
    agencyName: normalizeText(source.agencyName || source.agency_name || source.organisationName || source.organisation_name || source.name),
    logoUrl: normalizeText(source.logoUrl || source.logo_url || source.logo || source.logo_data_url),
    logoLightUrl: normalizeText(source.logoLightUrl || source.logo_light_url || source.logoLight || source.logo_light || source.logoUrl || source.logo_url),
    logoDarkUrl: normalizeText(source.logoDarkUrl || source.logo_dark_url || source.logoDark || source.logo_dark || source.logoUrl || source.logo_url),
    primaryColour: normalizeText(source.primaryColour || source.primary_color || source.primary_colour || source.primaryColor),
    secondaryColour: normalizeText(source.secondaryColour || source.secondary_color || source.secondary_colour || source.secondaryColor),
    accentColour: normalizeText(source.accentColour || source.accent_color || source.accent_colour || source.accentColor),
    samplePropertyImageUrl: normalizeText(
      source.samplePropertyImageUrl ||
        source.sample_property_image_url ||
        source.propertyImageUrl ||
        source.property_image_url ||
        source.imageUrl ||
        source.image_url,
    ),
    samplePropertyAddress: normalizeText(
      source.samplePropertyAddress ||
        source.sample_property_address ||
        source.propertyAddress ||
        source.property_address ||
        source.address,
    ),
  }
}

export function buildDefaultProspectDemoConfig(slug = '') {
  return normalizeProspectDemoConfig({
    slug,
    agency_name: slug ? slug.replace(/-/g, ' ') : '',
  }, { slug })
}

export function getCachedProspectDemoConfig(slug = '', now = Date.now()) {
  const normalizedSlug = normalizeProspectDemoSlug(slug)
  const cached = prospectDemoConfigCache.get(normalizedSlug)
  if (!cached || now - cached.cachedAt > PROSPECT_DEMO_CONFIG_CACHE_TTL_MS) return null
  return cached.value
}

function loadProspectDemoConfig(slug = '') {
  const normalizedSlug = normalizeProspectDemoSlug(slug)
  const existingRequest = prospectDemoConfigRequests.get(normalizedSlug)
  if (existingRequest) return existingRequest

  const request = fetchProspectDemoConfigBySlug(normalizedSlug)
    .then((loaded) => {
      const value = loaded || buildDefaultProspectDemoConfig(normalizedSlug)
      prospectDemoConfigCache.set(normalizedSlug, { value, cachedAt: Date.now() })
      return value
    })
    .catch(() => buildDefaultProspectDemoConfig(normalizedSlug))
    .finally(() => prospectDemoConfigRequests.delete(normalizedSlug))

  prospectDemoConfigRequests.set(normalizedSlug, request)
  return request
}

function waitForProspectDemoConfig(request, slug = '') {
  return new Promise((resolve) => {
    const timeoutId = globalThis.setTimeout(
      () => resolve(buildDefaultProspectDemoConfig(slug)),
      PROSPECT_DEMO_CONFIG_WAIT_MS,
    )
    request.then((value) => {
      globalThis.clearTimeout(timeoutId)
      resolve(value)
    })
  })
}

export async function fetchProspectDemoConfigBySlug(slug = '') {
  const normalizedSlug = normalizeProspectDemoSlug(slug)
  if (!normalizedSlug || !isSupabaseConfigured || !supabase) return null

  const { data, error } = await supabase
    .from('prospect_demo_configs')
    .select('slug, agency_name, logo_url, logo_light_url, logo_dark_url, primary_colour, secondary_colour, accent_colour, sample_property_image_url, sample_property_address, created_at, updated_at')
    .eq('slug', normalizedSlug)
    .maybeSingle()

  if (error) {
    console.warn('[prospect-demo-config] Failed to load config', { slug: normalizedSlug, error })
    return null
  }

  if (!data) return null
  return normalizeProspectDemoConfig(data, { slug: normalizedSlug })
}

export async function resolveProspectDemoConfig(slug = '') {
  const normalizedSlug = normalizeProspectDemoSlug(slug)
  const cached = getCachedProspectDemoConfig(normalizedSlug)
  if (cached) return cached
  return waitForProspectDemoConfig(loadProspectDemoConfig(normalizedSlug), normalizedSlug)
}
