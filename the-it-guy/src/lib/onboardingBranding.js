export const DEFAULT_ONBOARDING_BRANDING = Object.freeze({
  organisationName: '',
  logoLightUrl: '',
  logoDarkUrl: '',
  logoIconUrl: '',
  primaryColour: '',
  secondaryColour: '',
  accentColour: '',
})

const NAME_KEYS = [
  'organisationName',
  'organisation_name',
  'organizationName',
  'organization_name',
  'agencyName',
  'agency_name',
  'tradingName',
  'trading_name',
  'displayName',
  'display_name',
  'name',
  'senderName',
  'sender_name',
  'assignedAgencyName',
  'assigned_agency_name',
  'agencyOrganisation',
  'agency_organisation',
  'assigned_agent',
  'assignedAgent',
]

const LOGO_LIGHT_KEYS = [
  'logoLightUrl',
  'logo_light_url',
  'logoLight',
  'logo_light',
  'lightLogoUrl',
  'light_logo_url',
  'primaryLogoUrl',
  'primary_logo_url',
  'organisationLogoLightUrl',
  'organisation_logo_light_url',
  'agencyLogoLightUrl',
  'agency_logo_light_url',
]

const LOGO_DARK_KEYS = [
  'logoDarkUrl',
  'logo_dark_url',
  'logoDark',
  'logo_dark',
  'darkLogoUrl',
  'dark_logo_url',
  'logoHighContrastUrl',
  'logo_high_contrast_url',
  'organisationLogoDarkUrl',
  'organisation_logo_dark_url',
  'organisationHighContrastLogoUrl',
  'organisation_high_contrast_logo_url',
  'agencyLogoDarkUrl',
  'agency_logo_dark_url',
]

const LOGO_ICON_KEYS = [
  'logoIconUrl',
  'logo_icon_url',
  'logoIcon',
  'logo_icon',
  'iconLogoUrl',
  'icon_logo_url',
  'organisationLogoIconUrl',
  'organisation_logo_icon_url',
  'agencyLogoIconUrl',
  'agency_logo_icon_url',
  'portalIcon',
  'portalIconUrl',
  'portal_icon_url',
  'mobileIcon',
  'mobileIconUrl',
  'mobile_icon_url',
]

const LOGO_GENERIC_KEYS = [
  'logoUrl',
  'logo_url',
  'logo',
  'organisationLogoUrl',
  'organisation_logo_url',
  'agencyLogoUrl',
  'agency_logo_url',
]

const PRIMARY_COLOUR_KEYS = [
  'primaryColour',
  'primaryColor',
  'primary_colour',
  'primary_color',
  'brandPrimaryColour',
  'brandPrimaryColor',
  'brand_primary_colour',
  'brand_primary_color',
  'primary',
]

const SECONDARY_COLOUR_KEYS = [
  'secondaryColour',
  'secondaryColor',
  'secondary_colour',
  'secondary_color',
  'brandSecondaryColour',
  'brandSecondaryColor',
  'brand_secondary_colour',
  'brand_secondary_color',
  'secondary',
]

const ACCENT_COLOUR_KEYS = [
  'accentColour',
  'accentColor',
  'accent_colour',
  'accent_color',
  'brandAccentColour',
  'brandAccentColor',
  'brand_accent_colour',
  'brand_accent_color',
  'accent',
]

const FIELD_KEYS = {
  organisationName: NAME_KEYS,
  logoLightUrl: LOGO_LIGHT_KEYS,
  logoDarkUrl: LOGO_DARK_KEYS,
  logoIconUrl: LOGO_ICON_KEYS,
  primaryColour: PRIMARY_COLOUR_KEYS,
  secondaryColour: SECONDARY_COLOUR_KEYS,
  accentColour: ACCENT_COLOUR_KEYS,
}

const NESTED_BRANDING_KEYS = [
  'branding',
  'portalBranding',
  'portal_branding',
  'onboardingBranding',
  'onboarding_branding',
  'settingsJson',
  'settings_json',
  'agencyOnboarding',
  'agency_onboarding',
  'organisationSettings',
  'organisation_settings',
  'agencyInformation',
  'agency_information',
  'publicIdentity',
  'public_identity',
  'brandColours',
  'brandColors',
  'brand_colours',
  'brand_colors',
  'organisation',
  'organization',
  'agency',
]

export function normalizeOnboardingBrandingText(value = '') {
  if (typeof value !== 'string' && typeof value !== 'number') return ''
  return String(value).trim()
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function collectBrandingSources(input, seen = new Set()) {
  if (Array.isArray(input)) {
    return input.flatMap((item) => collectBrandingSources(item, seen))
  }

  if (!isRecord(input) || seen.has(input)) return []
  seen.add(input)

  const sources = [input]
  for (const key of NESTED_BRANDING_KEYS) {
    if (isRecord(input[key])) {
      sources.push(...collectBrandingSources(input[key], seen))
    }
  }

  return sources
}

function pickFirstText(sources, keys) {
  for (const source of sources) {
    if (!isRecord(source)) continue
    for (const key of keys) {
      const text = normalizeOnboardingBrandingText(source[key])
      if (text) return text
    }
  }
  return ''
}

function collectSources(inputs = []) {
  return inputs.flatMap((input) => collectBrandingSources(input))
}

export function hasResolvedOnboardingBrandingValue(field, ...sources) {
  const keys = FIELD_KEYS[field] || []
  if (!keys.length) return false
  return Boolean(pickFirstText(collectSources(sources), keys))
}

export function getOnboardingBrandInitials(value = '') {
  const parts = normalizeOnboardingBrandingText(value)
    .split(/\s+/)
    .filter(Boolean)

  if (!parts.length) return 'B9'

  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

export function resolveOnboardingBranding(...sources) {
  const flattenedSources = collectSources(sources)
  const genericLogoUrl = pickFirstText(flattenedSources, LOGO_GENERIC_KEYS)
  const logoLightUrl = pickFirstText(flattenedSources, LOGO_LIGHT_KEYS) || genericLogoUrl
  const logoDarkUrl = pickFirstText(flattenedSources, LOGO_DARK_KEYS) || genericLogoUrl || logoLightUrl
  const logoIconUrl = pickFirstText(flattenedSources, LOGO_ICON_KEYS) || genericLogoUrl

  return {
    ...DEFAULT_ONBOARDING_BRANDING,
    organisationName: pickFirstText(flattenedSources, NAME_KEYS),
    logoLightUrl,
    logoDarkUrl,
    logoIconUrl,
    primaryColour: pickFirstText(flattenedSources, PRIMARY_COLOUR_KEYS),
    secondaryColour: pickFirstText(flattenedSources, SECONDARY_COLOUR_KEYS),
    accentColour: pickFirstText(flattenedSources, ACCENT_COLOUR_KEYS),
  }
}
