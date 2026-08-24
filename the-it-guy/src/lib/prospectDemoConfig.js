import { isSupabaseConfigured, supabase } from './supabaseClient'

const DEFAULT_DEMO_CONFIG = Object.freeze({
  slug: '',
  agencyName: '',
  logoUrl: '',
  primaryColour: '',
  secondaryColour: '',
  accentColour: '',
  samplePropertyImageUrl: '',
  samplePropertyAddress: '',
})

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

export async function fetchProspectDemoConfigBySlug(slug = '') {
  const normalizedSlug = normalizeProspectDemoSlug(slug)
  if (!normalizedSlug || !isSupabaseConfigured || !supabase) return null

  const { data, error } = await supabase
    .from('prospect_demo_configs')
    .select('slug, agency_name, logo_url, primary_colour, secondary_colour, accent_colour, sample_property_image_url, sample_property_address, created_at, updated_at')
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
  const loaded = await fetchProspectDemoConfigBySlug(normalizedSlug)
  return loaded || buildDefaultProspectDemoConfig(normalizedSlug)
}
