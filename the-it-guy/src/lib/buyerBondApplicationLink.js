const BUYER_BOND_APPLICATION_SEGMENT = 'bond-application'
const CLIENT_PORTAL_PREFIX = '/client'

export const BUYER_BOND_APPLICATION_FALLBACK_PATH = '/client-access/bond-application'

function normalizeText(value) {
  return String(value || '').trim()
}

function stripTrailingSlashes(value = '') {
  return normalizeText(value).replace(/\/+$/, '')
}

function normalizeBaseUrl(value = '') {
  return stripTrailingSlashes(value)
}

function resolveRuntimeOrigin() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return normalizeBaseUrl(window.location.origin)
  }
  return ''
}

function splitRelativeReference(value = '') {
  let remainder = normalizeText(value)
  let hash = ''
  let query = ''

  const hashIndex = remainder.indexOf('#')
  if (hashIndex >= 0) {
    hash = remainder.slice(hashIndex)
    remainder = remainder.slice(0, hashIndex)
  }

  const queryIndex = remainder.indexOf('?')
  if (queryIndex >= 0) {
    query = remainder.slice(queryIndex)
    remainder = remainder.slice(0, queryIndex)
  }

  return {
    path: remainder || '/',
    query,
    hash,
  }
}

function parseLinkReference(value = '') {
  const raw = normalizeText(value)
  if (!raw) return null

  try {
    const url = new URL(raw)
    return {
      absolute: true,
      origin: url.origin,
      path: url.pathname || '/',
      query: url.search || '',
      hash: url.hash || '',
    }
  } catch {
    return {
      absolute: false,
      origin: '',
      ...splitRelativeReference(raw),
    }
  }
}

function resolveClientPortalTokenFromPath(path = '') {
  const normalizedPath = normalizeText(path).startsWith('/')
    ? normalizeText(path)
    : `/${normalizeText(path)}`
  const match = normalizedPath.match(/^\/client\/([^/?#]+)/)
  const token = match?.[1] || ''
  if (!token || token === 'onboarding') return ''
  return token
}

function buildClientPortalBondApplicationPath(token = '', { encode = true } = {}) {
  const normalizedToken = normalizeText(token)
  const tokenSegment = encode ? encodeURIComponent(normalizedToken) : normalizedToken
  return normalizedToken ? `${CLIENT_PORTAL_PREFIX}/${tokenSegment}/${BUYER_BOND_APPLICATION_SEGMENT}` : ''
}

function normalizeFallbackPath(path = '') {
  const normalizedPath = stripTrailingSlashes(path)
  if (!normalizedPath || normalizedPath === '/client-access') return BUYER_BOND_APPLICATION_FALLBACK_PATH
  if (normalizedPath === BUYER_BOND_APPLICATION_FALLBACK_PATH) return BUYER_BOND_APPLICATION_FALLBACK_PATH
  if (normalizedPath.startsWith('/client-access/')) return BUYER_BOND_APPLICATION_FALLBACK_PATH
  return ''
}

function normalizePortalReference(reference = null) {
  if (!reference) return null
  const token = resolveClientPortalTokenFromPath(reference.path)
  const path = token ? buildClientPortalBondApplicationPath(token, { encode: false }) : normalizeFallbackPath(reference.path)
  if (!path) return null
  return {
    ...reference,
    path,
  }
}

function withQueryAndHash(path = '', query = '', hash = '') {
  return `${path}${query || ''}${hash || ''}`
}

function joinBaseUrl(baseUrl = '', path = '') {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  if (!normalizedBaseUrl) return path
  return `${normalizedBaseUrl}${path.startsWith('/') ? path : `/${path}`}`
}

function firstText(...values) {
  return values.map(normalizeText).find(Boolean) || ''
}

export function resolveBuyerBondApplicationLink(options = {}) {
  const candidates = [
    { source: 'application_link', value: firstText(options.applicationLink, options.applicationUrl) },
    { source: 'application_path', value: options.applicationPath },
    { source: 'client_portal_path', value: firstText(options.clientPortalPath, options.client_portal_path) },
    { source: 'buyer_portal_path', value: firstText(options.buyerPortalPath, options.buyer_portal_path) },
    { source: 'portal_path', value: options.portalPath },
  ]

  let selected = null
  for (const candidate of candidates) {
    const reference = normalizePortalReference(parseLinkReference(candidate.value))
    if (reference) {
      selected = {
        ...reference,
        source: candidate.source,
        usedFallback: reference.path === BUYER_BOND_APPLICATION_FALLBACK_PATH,
      }
      break
    }
  }

  if (!selected) {
    const token = firstText(
      options.portalToken,
      options.clientPortalToken,
      options.client_portal_token,
      options.buyerPortalToken,
      options.buyer_portal_token,
      options.token,
    )
    const path = buildClientPortalBondApplicationPath(token) || BUYER_BOND_APPLICATION_FALLBACK_PATH
    selected = {
      absolute: false,
      origin: '',
      path,
      query: '',
      hash: '',
      source: token ? 'portal_token' : 'fallback',
      usedFallback: !token,
    }
  }

  const pathWithSuffix = withQueryAndHash(selected.path, selected.query, selected.hash)
  const baseUrl = firstText(options.baseUrl, options.appBaseUrl, options.origin)
  const runtimeOrigin = options.absolute === true ? resolveRuntimeOrigin() : ''
  const origin = selected.absolute ? selected.origin : normalizeBaseUrl(baseUrl || runtimeOrigin)
  const link = origin ? joinBaseUrl(origin, pathWithSuffix) : pathWithSuffix

  return {
    link,
    path: pathWithSuffix,
    source: selected.source,
    usedFallback: selected.usedFallback,
    isAbsolute: Boolean(origin),
  }
}

export function buildBuyerBondApplicationLink(options = {}) {
  return resolveBuyerBondApplicationLink(options).link
}
