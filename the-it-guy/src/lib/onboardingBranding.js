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
  'organisationDisplayName',
  'organisation_display_name',
  'organizationDisplayName',
  'organization_display_name',
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
  'lightLogo',
  'landingLogoUrl',
  'landing_logo_url',
  'landingLogo',
  'landing_logo',
  'lightLogoUrl',
  'light_logo_url',
  'primaryLogoUrl',
  'primary_logo_url',
  'primaryLogo',
  'primary_logo',
  'wordmark',
  'wordmarkUrl',
  'wordmark_url',
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
  'darkLogo',
  'landingDarkLogoUrl',
  'landing_dark_logo_url',
  'landingDarkLogo',
  'landing_dark_logo',
  'darkLogoUrl',
  'dark_logo_url',
  'darkLogo',
  'dark_logo',
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
  'icon',
  'iconUrl',
  'icon_url',
  'landingIconLogoUrl',
  'landing_icon_logo_url',
  'landingIconLogo',
  'landing_icon_logo',
  'iconLogoUrl',
  'icon_logo_url',
  'iconLogo',
  'icon_logo',
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
  'primaryLogoUrl',
  'primary_logo_url',
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
  'primaryBrandColour',
  'primaryBrandColor',
  'brand_primary_colour',
  'brand_primary_color',
  'primary_brand_colour',
  'primary_brand_color',
  'landingPrimaryColour',
  'landingPrimaryColor',
  'landing_primary_colour',
  'landing_primary_color',
  'landingPrimary',
  'landing_primary',
  'primary',
]

const SECONDARY_COLOUR_KEYS = [
  'secondaryColour',
  'secondaryColor',
  'secondary_colour',
  'secondary_color',
  'brandSecondaryColour',
  'brandSecondaryColor',
  'secondaryBrandColour',
  'secondaryBrandColor',
  'brand_secondary_colour',
  'brand_secondary_color',
  'secondary_brand_colour',
  'secondary_brand_color',
  'landingSecondaryColour',
  'landingSecondaryColor',
  'landing_secondary_colour',
  'landing_secondary_color',
  'landingSecondary',
  'landing_secondary',
  'secondary',
]

const ACCENT_COLOUR_KEYS = [
  'accentColour',
  'accentColor',
  'accent_colour',
  'accent_color',
  'brandAccentColour',
  'brandAccentColor',
  'accentBrandColour',
  'accentBrandColor',
  'brand_accent_colour',
  'brand_accent_color',
  'accent_brand_colour',
  'accent_brand_color',
  'landingAccentColour',
  'landingAccentColor',
  'landing_accent_colour',
  'landing_accent_color',
  'landingAccent',
  'landing_accent',
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
  'corporateIdentity',
  'corporate_identity',
  'brandIdentity',
  'brand_identity',
  'visualIdentity',
  'visual_identity',
  'ci',
  'CI',
  'brandAssets',
  'brand_assets',
  'logos',
  'logoSet',
  'logo_set',
  'colourPalette',
  'colorPalette',
  'colour_palette',
  'color_palette',
  'palette',
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
  'landingColours',
  'landingColors',
  'landing_colours',
  'landing_colors',
  'landing',
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

export function normalizeOnboardingLogoUrl(value = '') {
  const text = normalizeOnboardingBrandingText(value)
  if (!text) return ''

  try {
    const url = new URL(text)
    const signedStoragePrefix = '/storage/v1/object/sign/'
    if (url.pathname.startsWith(signedStoragePrefix)) {
      // Seller-signing branding is copied to the private `documents` bucket.
      // A signed URL is its access contract; converting it to `/public/` makes
      // the logo unavailable and causes the signing page to fall back to
      // initials. Public organisation-branding assets can still use their
      // durable public URL below.
      if (url.pathname.startsWith(`${signedStoragePrefix}documents/`)) {
        return url.toString()
      }
      url.pathname = url.pathname.replace(signedStoragePrefix, '/storage/v1/object/public/')
      url.search = ''
      url.hash = ''
      return url.toString()
    }
  } catch {
    return text
  }

  return text
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
  const genericLogoUrl = normalizeOnboardingLogoUrl(pickFirstText(flattenedSources, LOGO_GENERIC_KEYS))
  const logoLightUrl = normalizeOnboardingLogoUrl(pickFirstText(flattenedSources, LOGO_LIGHT_KEYS)) || genericLogoUrl
  const logoDarkUrl = normalizeOnboardingLogoUrl(pickFirstText(flattenedSources, LOGO_DARK_KEYS)) || genericLogoUrl || logoLightUrl
  const logoIconUrl = normalizeOnboardingLogoUrl(pickFirstText(flattenedSources, LOGO_ICON_KEYS)) || genericLogoUrl

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

/** Safe agency colours for paper documents, with readable ink on white. */
export function resolveDocumentBrandPalette(...sources) {
  const branding = resolveOnboardingBranding(...sources)
  const colour = (value, fallback) => /^#[0-9a-f]{6}$/i.test(value) ? value
    : /^#[0-9a-f]{3}$/i.test(value) ? `#${value.slice(1).split('').map(part => part + part).join('')}` : fallback
  const channels = value => [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16))
  const hex = values => `#${values.map(value => Math.round(value).toString(16).padStart(2, '0')).join('')}`
  const contrast = values => {
    const [red, green, blue] = values.map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    return 1.05 / (0.2126 * red + 0.7152 * green + 0.0722 * blue + 0.05)
  }
  const ink = value => {
    const rgb = channels(value)
    if (contrast(rgb) >= 4.5) return value
    for (let factor = 0.95; factor > 0; factor -= 0.05) {
      const shade = rgb.map(channel => Math.round(channel * factor))
      if (contrast(shade) >= 4.5) return hex(shade)
    }
    return '#000000'
  }
  const tint = value => hex(channels(value).map(channel => channel * 0.06 + 255 * 0.94))
  const primaryColour = colour(branding.primaryColour, '#193d2e')
  const accentColour = colour(branding.accentColour, '#176842')
  return { primaryColour, accentColour, primaryInk: ink(primaryColour), accentInk: ink(accentColour),
    primaryTint: tint(primaryColour), accentTint: tint(accentColour) }
}
