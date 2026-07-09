const DEFAULT_ARCH9_CLIENT_THEME = Object.freeze({
  version: 1,
  source: 'arch9_default',
  sources: ['arch9_default'],
  organisationId: '',
  organisationName: 'Arch9',
  logoUrl: '',
  logoLightUrl: '',
  logoDarkUrl: '',
  logoIconUrl: '',
  heroImageUrl: '',
  primaryColor: '#001A3D',
  secondaryColor: '#10273A',
  accentColor: '#F7CF22',
  neutralColor: '#F7F8FA',
  suggestedPrimaryColor: '',
  suggestedAccentColor: '',
  textOnPrimary: '#FFFFFF',
  textOnSecondary: '#FFFFFF',
  textOnAccent: '#001B44',
  overlayColor: 'rgba(0, 26, 61, 0.86)',
  surfaceColor: '#FFFFFF',
  cardColor: 'rgba(255, 255, 255, 0.10)',
  mutedTextColor: 'rgba(255, 255, 255, 0.72)',
  publishedAt: '',
  updatedAt: '',
  metadata: {},
})

const THEME_FIELD_KEYS = [
  'organisationId',
  'organisationName',
  'logoUrl',
  'logoLightUrl',
  'logoDarkUrl',
  'logoIconUrl',
  'heroImageUrl',
  'primaryColor',
  'secondaryColor',
  'accentColor',
  'neutralColor',
  'suggestedPrimaryColor',
  'suggestedAccentColor',
  'publishedAt',
  'updatedAt',
]

const COLOR_FIELD_KEYS = new Set([
  'primaryColor',
  'secondaryColor',
  'accentColor',
  'neutralColor',
  'suggestedPrimaryColor',
  'suggestedAccentColor',
])

const ASSET_FIELD_KEYS = new Set([
  'logoUrl',
  'logoLightUrl',
  'logoDarkUrl',
  'logoIconUrl',
  'heroImageUrl',
])

function normalizeText(value = '') {
  return String(value ?? '').trim()
}

function firstText(...values) {
  for (const value of values) {
    const text = normalizeText(value)
    if (text) return text
  }
  return ''
}

function parseJsonObject(value) {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value !== 'string') return {}

  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export function normalizeBrandColor(value = '') {
  const text = normalizeText(value)
  if (/^#[0-9a-f]{6}$/i.test(text)) return text.toUpperCase()
  if (/^#[0-9a-f]{3}$/i.test(text)) {
    return `#${text.slice(1).split('').map((part) => `${part}${part}`).join('')}`.toUpperCase()
  }
  return ''
}

function hexToRgb(value = '') {
  const color = normalizeBrandColor(value)
  if (!color) return null
  return {
    r: Number.parseInt(color.slice(1, 3), 16),
    g: Number.parseInt(color.slice(3, 5), 16),
    b: Number.parseInt(color.slice(5, 7), 16),
  }
}

function relativeLuminance(color = '') {
  const rgb = hexToRgb(color)
  if (!rgb) return 0

  const channel = (value) => {
    const normalized = value / 255
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4
  }

  return (0.2126 * channel(rgb.r)) + (0.7152 * channel(rgb.g)) + (0.0722 * channel(rgb.b))
}

function contrastRatio(a = '', b = '') {
  const lighter = Math.max(relativeLuminance(a), relativeLuminance(b))
  const darker = Math.min(relativeLuminance(a), relativeLuminance(b))
  return (lighter + 0.05) / (darker + 0.05)
}

export function getReadableTextColor(backgroundColor = '', options = {}) {
  const background = normalizeBrandColor(backgroundColor)
  const light = normalizeBrandColor(options.light || '#FFFFFF') || '#FFFFFF'
  const dark = normalizeBrandColor(options.dark || '#001B44') || '#001B44'
  if (!background) return light

  return contrastRatio(background, dark) >= contrastRatio(background, light) ? dark : light
}

function rgbaFromHex(value = '', alpha = 0.86) {
  const rgb = hexToRgb(value)
  if (!rgb) return DEFAULT_ARCH9_CLIENT_THEME.overlayColor
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`
}

function sanitizeAssetUrl(value = '') {
  const text = normalizeText(value)
  if (!text) return ''
  if (/^(https?:)?\/\//i.test(text)) return text
  if (text.startsWith('/')) return text
  if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i.test(text)) return text
  return ''
}

function pickAssetFromCollection(collection) {
  if (!Array.isArray(collection)) return ''
  for (const item of collection) {
    const url = typeof item === 'string'
      ? item
      : firstText(item?.url, item?.src, item?.imageUrl, item?.image_url, item?.publicUrl, item?.public_url)
    const safeUrl = sanitizeAssetUrl(url)
    if (safeUrl) return safeUrl
  }
  return ''
}

function resolveListingHeroImageUrl(source = {}) {
  return sanitizeAssetUrl(firstText(
    source?.heroImageUrl,
    source?.hero_image_url,
    source?.backgroundImageUrl,
    source?.background_image_url,
    source?.coverImageUrl,
    source?.cover_image_url,
    source?.imageUrl,
    source?.image_url,
    source?.propertyImageUrl,
    source?.property_image_url,
    source?.mainImageUrl,
    source?.main_image_url,
    source?.thumbnailUrl,
    source?.thumbnail_url,
  )) ||
    pickAssetFromCollection(source?.images) ||
    pickAssetFromCollection(source?.photos) ||
    pickAssetFromCollection(source?.media) ||
    pickAssetFromCollection(source?.listingImages) ||
    pickAssetFromCollection(source?.listing_images) ||
    pickAssetFromCollection(source?.propertyImages) ||
    pickAssetFromCollection(source?.property_images)
}

function readSettingsJson(input = {}) {
  const settings =
    input.organisationSettings ||
    input.organizationSettings ||
    input.settings ||
    input.settingsJson ||
    input.settings_json ||
    {}
  return parseJsonObject(settings.settings_json || settings.settingsJson || settings)
}

function readAgencyOnboarding(input = {}) {
  const direct = input.agencyOnboarding || input.agency_onboarding
  if (direct && typeof direct === 'object') return direct

  const settings = readSettingsJson(input)
  return parseJsonObject(settings.agencyOnboarding || settings.agency_onboarding)
}

function readLegacyBranding(input = {}) {
  const direct = input.legacyBranding || input.legacy_branding
  if (direct && typeof direct === 'object') return direct

  const agencyOnboarding = readAgencyOnboarding(input)
  const settings = readSettingsJson(input)
  return parseJsonObject(agencyOnboarding.branding || settings.branding)
}

function readCanonicalBranding(input = {}, mode = 'published') {
  const row =
    input.organisationBranding ||
    input.organisation_branding ||
    input.canonicalBranding ||
    input.canonical_branding ||
    {}
  const liveTheme = parseJsonObject(row.theme_json || row.themeJson)
  const draftTheme = parseJsonObject(row.draft_theme_json || row.draftThemeJson)
  const selectedTheme = mode === 'draft' && Object.keys(draftTheme).length ? draftTheme : liveTheme
  const preferSelectedTheme = mode === 'draft' && Object.keys(draftTheme).length
  const pickTheme = (themeValues = [], rowValues = []) => preferSelectedTheme
    ? firstText(...themeValues, ...rowValues)
    : firstText(...rowValues, ...themeValues)

  return {
    ...selectedTheme,
    organisationId: pickTheme(
      [selectedTheme.organisationId],
      [row.organisation_id, row.organisationId],
    ),
    organisationName: pickTheme(
      [selectedTheme.organisationName, selectedTheme.agencyName],
      [
        row.organisation_display_name,
        row.organisationDisplayName,
        row.organisationName,
        row.agencyName,
      ],
    ),
    logoLightUrl: pickTheme(
      [selectedTheme.logoLightUrl, selectedTheme.logoLight],
      [row.logo_light_url, row.logoLightUrl, row.logoLight],
    ),
    logoDarkUrl: pickTheme(
      [selectedTheme.logoDarkUrl, selectedTheme.logoDark],
      [row.logo_dark_url, row.logoDarkUrl, row.logoDark],
    ),
    logoIconUrl: pickTheme(
      [selectedTheme.logoIconUrl, selectedTheme.logoIcon],
      [row.logo_icon_url, row.logoIconUrl, row.logoIcon],
    ),
    logoUrl: pickTheme([selectedTheme.logoUrl], [row.logo_url, row.logoUrl]),
    heroImageUrl: pickTheme(
      [selectedTheme.heroImageUrl, selectedTheme.heroImage],
      [row.hero_image_url, row.heroImageUrl, row.heroImage],
    ),
    primaryColor: pickTheme(
      [selectedTheme.primaryColor],
      [row.primary_color, row.primaryColor, row.primary_brand_color, row.primaryBrandColor],
    ),
    secondaryColor: pickTheme(
      [selectedTheme.secondaryColor],
      [row.secondary_color, row.secondaryColor, row.secondary_brand_color, row.secondaryBrandColor],
    ),
    accentColor: pickTheme(
      [selectedTheme.accentColor],
      [row.accent_color, row.accentColor, row.accent_brand_color, row.accentBrandColor],
    ),
    neutralColor: pickTheme(
      [selectedTheme.neutralColor],
      [row.neutral_color, row.neutralColor],
    ),
    suggestedPrimaryColor: pickTheme(
      [selectedTheme.suggestedPrimaryColor],
      [row.suggested_primary_color, row.suggestedPrimaryColor],
    ),
    suggestedAccentColor: pickTheme(
      [selectedTheme.suggestedAccentColor],
      [row.suggested_accent_color, row.suggestedAccentColor],
    ),
    publishedAt: pickTheme(
      [selectedTheme.publishedAt],
      [row.published_at, row.publishedAt],
    ),
    updatedAt: pickTheme(
      [selectedTheme.updatedAt],
      [row.updated_at, row.updatedAt],
    ),
    metadata: parseJsonObject(row.metadata_json || row.metadataJson || selectedTheme.metadata),
  }
}

function layerFromOrganisation(organisation = {}) {
  return {
    organisationId: firstText(organisation.id, organisation.organisation_id, organisation.organisationId),
    organisationName: firstText(organisation.display_name, organisation.displayName, organisation.name),
    logoUrl: firstText(organisation.logo_url, organisation.logoUrl),
    logoLightUrl: firstText(organisation.logo_url, organisation.logoUrl),
    logoDarkUrl: firstText(organisation.logo_url, organisation.logoUrl),
  }
}

function layerFromListing(listing = {}) {
  const branding = parseJsonObject(listing.branding)
  return {
    organisationName: firstText(
      branding.organisationName,
      branding.agencyName,
      branding.name,
      listing.agencyOrganisation,
      listing.organisationName,
      listing.agencyName,
      listing.agency?.displayName,
      listing.agency?.name,
      listing.organisation?.displayName,
      listing.organisation?.name,
    ),
    logoUrl: firstText(
      listing.agencyLogoUrl,
      listing.organisationLogoUrl,
      listing.agency?.logoUrl,
      listing.organisation?.logoUrl,
      branding.logoUrl,
    ),
    logoLightUrl: firstText(listing.agencyLogoLightUrl, listing.organisationLogoLightUrl, branding.logoLightUrl, branding.logoLight),
    logoDarkUrl: firstText(listing.agencyLogoDarkUrl, listing.organisationLogoDarkUrl, branding.logoDarkUrl, branding.logoDark),
    heroImageUrl: firstText(branding.heroImageUrl, branding.backgroundImageUrl) || resolveListingHeroImageUrl(listing),
  }
}

function layerFromLegacyBranding(legacy = {}, agencyOnboarding = {}) {
  const agencyInformation = parseJsonObject(agencyOnboarding.agencyInformation || agencyOnboarding.agency_information)
  return {
    organisationName: firstText(legacy.organisationName, legacy.agencyName, legacy.name, agencyInformation.agencyName),
    logoUrl: firstText(legacy.logoUrl, legacy.logo_url),
    logoLightUrl: firstText(legacy.logoLight, legacy.logoLightUrl, legacy.logoUrl, legacy.logo_url),
    logoDarkUrl: firstText(legacy.logoDark, legacy.logoDarkUrl, legacy.logoHighContrast, legacy.logoHighContrastUrl, legacy.logoUrl, legacy.logo_url),
    logoIconUrl: firstText(legacy.logoIcon, legacy.logoIconUrl, legacy.logo_icon_url),
    heroImageUrl: firstText(
      legacy.heroImage,
      legacy.heroImageUrl,
      legacy.backgroundImage,
      legacy.backgroundImageUrl,
      legacy.coverImageUrl,
    ),
    primaryColor: firstText(legacy.primaryColor, legacy.primaryColour, legacy.brandPrimaryColor, legacy.brandColours?.primary),
    secondaryColor: firstText(legacy.secondaryColor, legacy.secondaryColour, legacy.brandColours?.secondary),
    accentColor: firstText(legacy.accentColor, legacy.accentColour, legacy.brandColours?.accent),
    neutralColor: firstText(legacy.neutralColor, legacy.neutralColour, legacy.brandColours?.neutral),
    suggestedPrimaryColor: firstText(legacy.suggestedPrimaryColor, legacy.suggestedPrimaryColour, legacy.suggestedColours?.primary, legacy.suggestedColors?.primary),
    suggestedAccentColor: firstText(legacy.suggestedAccentColor, legacy.suggestedAccentColour, legacy.suggestedColours?.accent, legacy.suggestedColors?.accent),
  }
}

function applyThemeLayer(theme, layer = {}, source = '', sources = []) {
  let changed = false
  let logoChanged = false
  const nextTheme = { ...theme }

  for (const key of THEME_FIELD_KEYS) {
    const value = layer[key]
    if (COLOR_FIELD_KEYS.has(key)) {
      const color = normalizeBrandColor(value)
      if (color) {
        nextTheme[key] = color
        changed = true
      }
      continue
    }

    if (ASSET_FIELD_KEYS.has(key)) {
      const url = sanitizeAssetUrl(value)
      if (url) {
        nextTheme[key] = url
        changed = true
        if (key === 'logoUrl' || key === 'logoLightUrl' || key === 'logoDarkUrl' || key === 'logoIconUrl') {
          logoChanged = true
        }
      }
      continue
    }

    const text = normalizeText(value)
    if (text) {
      nextTheme[key] = text
      changed = true
    }
  }

  if (logoChanged) {
    nextTheme.logoUrl = sanitizeAssetUrl(layer.logoUrl) ||
      sanitizeAssetUrl(layer.logoDarkUrl) ||
      sanitizeAssetUrl(layer.logoLightUrl) ||
      sanitizeAssetUrl(layer.logoIconUrl) ||
      nextTheme.logoUrl ||
      ''
  } else if (!nextTheme.logoUrl) {
    nextTheme.logoUrl = nextTheme.logoDarkUrl || nextTheme.logoLightUrl || nextTheme.logoIconUrl || ''
  }

  if (changed && source) {
    sources.push(source)
    nextTheme.source = source
  }

  return nextTheme
}

function finalizeTheme(theme = {}, sources = []) {
  const primaryColor = normalizeBrandColor(theme.primaryColor) || DEFAULT_ARCH9_CLIENT_THEME.primaryColor
  const secondaryColor = normalizeBrandColor(theme.secondaryColor) || DEFAULT_ARCH9_CLIENT_THEME.secondaryColor
  const accentColor = normalizeBrandColor(theme.accentColor) || DEFAULT_ARCH9_CLIENT_THEME.accentColor
  const neutralColor = normalizeBrandColor(theme.neutralColor) || DEFAULT_ARCH9_CLIENT_THEME.neutralColor
  const logoUrl = sanitizeAssetUrl(theme.logoUrl) || sanitizeAssetUrl(theme.logoDarkUrl) || sanitizeAssetUrl(theme.logoLightUrl) || sanitizeAssetUrl(theme.logoIconUrl)

  return {
    ...DEFAULT_ARCH9_CLIENT_THEME,
    ...theme,
    version: 1,
    sources: ['arch9_default', ...sources],
    source: sources[sources.length - 1] || 'arch9_default',
    organisationName: normalizeText(theme.organisationName) || DEFAULT_ARCH9_CLIENT_THEME.organisationName,
    logoUrl,
    logoLightUrl: sanitizeAssetUrl(theme.logoLightUrl) || logoUrl,
    logoDarkUrl: sanitizeAssetUrl(theme.logoDarkUrl) || logoUrl,
    logoIconUrl: sanitizeAssetUrl(theme.logoIconUrl),
    heroImageUrl: sanitizeAssetUrl(theme.heroImageUrl),
    primaryColor,
    secondaryColor,
    accentColor,
    neutralColor,
    suggestedPrimaryColor: normalizeBrandColor(theme.suggestedPrimaryColor),
    suggestedAccentColor: normalizeBrandColor(theme.suggestedAccentColor),
    textOnPrimary: getReadableTextColor(primaryColor),
    textOnSecondary: getReadableTextColor(secondaryColor),
    textOnAccent: getReadableTextColor(accentColor),
    overlayColor: rgbaFromHex(primaryColor, 0.86),
    surfaceColor: '#FFFFFF',
    cardColor: 'rgba(255, 255, 255, 0.10)',
    mutedTextColor: 'rgba(255, 255, 255, 0.72)',
    metadata: parseJsonObject(theme.metadata),
  }
}

export function getDefaultArch9ClientTheme() {
  return {
    ...DEFAULT_ARCH9_CLIENT_THEME,
    sources: [...DEFAULT_ARCH9_CLIENT_THEME.sources],
    metadata: { ...DEFAULT_ARCH9_CLIENT_THEME.metadata },
  }
}

export function resolveClientBrandTheme(input = {}, options = {}) {
  const mode = options.mode === 'draft' ? 'draft' : 'published'
  const sources = []
  let theme = getDefaultArch9ClientTheme()

  const listing = input.listing || input.property || input.unit || {}
  const organisation = input.organisation || input.organization || {}
  const agencyOnboarding = readAgencyOnboarding(input)
  const legacyBranding = readLegacyBranding(input)
  const canonicalBranding = readCanonicalBranding(input, mode)
  const fallback = input.fallback && typeof input.fallback === 'object' ? input.fallback : {}

  theme = applyThemeLayer(theme, fallback, 'fallback', sources)
  theme = applyThemeLayer(theme, layerFromListing(listing), 'listing', sources)
  theme = applyThemeLayer(theme, layerFromOrganisation(organisation), 'organisation', sources)
  theme = applyThemeLayer(theme, layerFromLegacyBranding(legacyBranding, agencyOnboarding), 'legacy_settings', sources)
  theme = applyThemeLayer(theme, canonicalBranding, mode === 'draft' ? 'organisation_branding_draft' : 'organisation_branding', sources)

  if (canonicalBranding.metadata && typeof canonicalBranding.metadata === 'object') {
    theme.metadata = {
      ...parseJsonObject(theme.metadata),
      ...canonicalBranding.metadata,
    }
  }

  return finalizeTheme(theme, sources)
}

function escapeCssUrl(value = '') {
  return normalizeText(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

export function buildClientBrandCssVars(themeInput = {}) {
  const theme = themeInput?.primaryColor ? finalizeTheme(themeInput, themeInput.sources || []) : resolveClientBrandTheme(themeInput)
  const vars = {
    '--client-brand-primary': theme.primaryColor,
    '--client-brand-secondary': theme.secondaryColor,
    '--client-brand-accent': theme.accentColor,
    '--client-brand-neutral': theme.neutralColor,
    '--client-brand-primary-contrast': theme.textOnPrimary,
    '--client-brand-secondary-contrast': theme.textOnSecondary,
    '--client-brand-accent-contrast': theme.textOnAccent,
    '--client-brand-overlay': theme.overlayColor,
    '--client-brand-surface': theme.surfaceColor,
    '--client-brand-card': theme.cardColor,
    '--client-brand-muted-text': theme.mutedTextColor,
  }

  if (theme.logoUrl) vars['--client-brand-logo-url'] = `"${escapeCssUrl(theme.logoUrl)}"`
  if (theme.heroImageUrl) vars['--client-brand-hero-image'] = `url("${escapeCssUrl(theme.heroImageUrl)}")`

  return vars
}
