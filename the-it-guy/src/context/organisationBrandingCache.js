const CACHE_KEY = 'arch9:organisation-branding:last-good:v1'
const CACHE_VERSION = 1
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const MAX_LOGO_URL_LENGTH = 12_000

function normalizeText(value) {
  return String(value || '').trim()
}

function resolveStorage(storage) {
  if (storage) return storage
  if (typeof window === 'undefined') return null

  try {
    return window.localStorage
  } catch {
    return null
  }
}

function getScope(authState = {}) {
  return {
    userId: normalizeText(authState.user?.id),
    workspaceId: normalizeText(
      authState.currentWorkspace?.id ||
        authState.currentMembership?.workspaceId ||
        authState.currentMembership?.workspace_id,
    ),
  }
}

function normalizeLogoUrl(value) {
  const logoUrl = normalizeText(value)
  if (!logoUrl || logoUrl.length > MAX_LOGO_URL_LENGTH || logoUrl.startsWith('blob:')) return ''
  return logoUrl
}

function normalizeBranding(branding = {}) {
  const logoLightUrl = normalizeLogoUrl(branding.logoLightUrl || branding.logoLight)
  const logoDarkUrl = normalizeLogoUrl(branding.logoDarkUrl || branding.logoDark)
  const logoIconUrl = normalizeLogoUrl(branding.logoIconUrl || branding.logoIcon)
  const logoUrl = normalizeLogoUrl(branding.logoUrl) || logoLightUrl || logoDarkUrl

  return {
    logoUrl,
    logoLightUrl,
    logoDarkUrl,
    logoIconUrl,
    organisationLabel: normalizeText(branding.organisationLabel),
    hasCustomLogo: Boolean(logoUrl),
  }
}

export function readLastGoodOrganisationBranding(authState = {}, storage = null, now = Date.now()) {
  const scopedStorage = resolveStorage(storage)
  const scope = getScope(authState)
  if (!scopedStorage || !scope.userId || !scope.workspaceId) return null

  try {
    const parsed = JSON.parse(scopedStorage.getItem(CACHE_KEY) || 'null')
    const capturedAt = Number(parsed?.capturedAt || 0)
    if (
      parsed?.version !== CACHE_VERSION ||
      normalizeText(parsed?.userId) !== scope.userId ||
      normalizeText(parsed?.workspaceId) !== scope.workspaceId ||
      !capturedAt ||
      now - capturedAt > CACHE_MAX_AGE_MS
    ) {
      return null
    }

    const branding = normalizeBranding(parsed.branding)
    return branding.logoUrl ? branding : null
  } catch {
    return null
  }
}

export function writeLastGoodOrganisationBranding(authState = {}, branding = {}, storage = null, now = Date.now()) {
  const scopedStorage = resolveStorage(storage)
  const scope = getScope(authState)
  const normalizedBranding = normalizeBranding(branding)
  if (!scopedStorage || !scope.userId || !scope.workspaceId || !normalizedBranding.logoUrl) return false

  try {
    scopedStorage.setItem(CACHE_KEY, JSON.stringify({
      version: CACHE_VERSION,
      userId: scope.userId,
      workspaceId: scope.workspaceId,
      capturedAt: now,
      branding: normalizedBranding,
    }))
    return true
  } catch {
    return false
  }
}

export function applyLastGoodOrganisationBranding(snapshot = null, cachedBranding = null) {
  if (!snapshot || snapshot.branding?.logoUrl || !cachedBranding?.logoUrl) return snapshot

  const organisation = snapshot.organisation || {}
  return {
    ...snapshot,
    organisation: {
      ...organisation,
      logoUrl: organisation.logoUrl || cachedBranding.logoUrl,
      logo_url: organisation.logo_url || cachedBranding.logoUrl,
      logoIconUrl: organisation.logoIconUrl || cachedBranding.logoIconUrl,
      logo_icon_url: organisation.logo_icon_url || cachedBranding.logoIconUrl || null,
    },
    branding: {
      ...cachedBranding,
      ...snapshot.branding,
      logoUrl: cachedBranding.logoUrl,
      logoLightUrl: snapshot.branding?.logoLightUrl || cachedBranding.logoLightUrl,
      logoDarkUrl: snapshot.branding?.logoDarkUrl || cachedBranding.logoDarkUrl,
      logoIconUrl: snapshot.branding?.logoIconUrl || cachedBranding.logoIconUrl,
      organisationLabel:
        snapshot.branding?.organisationLabel || cachedBranding.organisationLabel,
      hasCustomLogo: true,
    },
  }
}

export const __organisationBrandingCacheTestUtils = Object.freeze({
  CACHE_KEY,
  CACHE_MAX_AGE_MS,
  getScope,
  normalizeBranding,
})
