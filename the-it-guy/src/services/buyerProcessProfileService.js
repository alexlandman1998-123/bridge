export const BUYER_PROCESS_PROFILE_KEYS = Object.freeze({
  DEFAULT_RESIDENTIAL: 'default_residential',
  KINGSTONS_RESIDENTIAL: 'kingstons_residential',
})

export const DEFAULT_BUYER_PROCESS_PROFILE = BUYER_PROCESS_PROFILE_KEYS.DEFAULT_RESIDENTIAL
export const KINGSTONS_BUYER_PROCESS_PROFILE = BUYER_PROCESS_PROFILE_KEYS.KINGSTONS_RESIDENTIAL
export const KINGSTONS_BUYER_PROCESS_ORGANISATION_IDS = Object.freeze([
  'ec19d0a6-bcba-4eef-aa72-9972de88204d',
])

const BUYER_PROCESS_PROFILE_ALIASES = Object.freeze({
  default: DEFAULT_BUYER_PROCESS_PROFILE,
  default_residential: DEFAULT_BUYER_PROCESS_PROFILE,
  global: DEFAULT_BUYER_PROCESS_PROFILE,
  global_residential: DEFAULT_BUYER_PROCESS_PROFILE,
  legacy: DEFAULT_BUYER_PROCESS_PROFILE,
  current: DEFAULT_BUYER_PROCESS_PROFILE,
  standard: DEFAULT_BUYER_PROCESS_PROFILE,
  standard_residential: DEFAULT_BUYER_PROCESS_PROFILE,
  residential: DEFAULT_BUYER_PROCESS_PROFILE,
  kingston: KINGSTONS_BUYER_PROCESS_PROFILE,
  kingstons: KINGSTONS_BUYER_PROCESS_PROFILE,
  kingston_residential: KINGSTONS_BUYER_PROCESS_PROFILE,
  kingstons_residential: KINGSTONS_BUYER_PROCESS_PROFILE,
})

const PROFILE_CANDIDATE_PATHS = Object.freeze([
  ['buyerProcessProfile'],
  ['buyer_process_profile'],
  ['buyerProcessProfileKey'],
  ['buyer_process_profile_key'],
  ['buyerProcess', 'profile'],
  ['buyerProcess', 'processProfile'],
  ['buyerProcess', 'process_profile'],
  ['buyer_process', 'profile'],
  ['buyer_process', 'processProfile'],
  ['buyer_process', 'process_profile'],
  ['settings', 'buyerProcessProfile'],
  ['settings', 'buyer_process_profile'],
  ['settings', 'buyerProcess', 'profile'],
  ['settings', 'buyerProcess', 'processProfile'],
  ['settings', 'buyerProcess', 'process_profile'],
  ['settings', 'buyer_process', 'profile'],
  ['settings', 'buyer_process', 'processProfile'],
  ['settings', 'buyer_process', 'process_profile'],
  ['organisationSettings', 'buyerProcessProfile'],
  ['organisationSettings', 'buyer_process_profile'],
  ['organisationSettings', 'buyerProcess', 'profile'],
  ['organisationSettings', 'buyerProcess', 'processProfile'],
  ['organisationSettings', 'buyerProcess', 'process_profile'],
  ['organisationSettings', 'buyer_process', 'profile'],
  ['organisationSettings', 'buyer_process', 'processProfile'],
  ['organisationSettings', 'buyer_process', 'process_profile'],
  ['organisation', 'buyerProcessProfile'],
  ['organisation', 'buyer_process_profile'],
  ['organization', 'buyerProcessProfile'],
  ['organization', 'buyer_process_profile'],
  ['onboarding', 'buyerProcessProfile'],
  ['onboarding', 'buyer_process_profile'],
  ['onboarding', 'buyerProcess', 'profile'],
  ['onboarding', 'buyer_process', 'profile'],
  ['metadata', 'buyerProcessProfile'],
  ['metadata', 'buyer_process_profile'],
])

const ORGANISATION_ID_CANDIDATE_PATHS = Object.freeze([
  ['organisationId'],
  ['organisation_id'],
  ['organizationId'],
  ['organization_id'],
  ['workspaceId'],
  ['workspace_id'],
  ['organisation', 'id'],
  ['organisation', 'organisationId'],
  ['organisation', 'organisation_id'],
  ['organization', 'id'],
  ['organization', 'organizationId'],
  ['organization', 'organization_id'],
  ['workspace', 'id'],
  ['workspace', 'organisationId'],
  ['workspace', 'organisation_id'],
  ['currentWorkspace', 'id'],
  ['currentWorkspace', 'organisationId'],
  ['currentWorkspace', 'organisation_id'],
  ['row', 'organisationId'],
  ['row', 'organisation_id'],
  ['lead', 'organisationId'],
  ['lead', 'organisation_id'],
])

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeProfileToken(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function readPath(source, path) {
  let current = source
  for (const key of path) {
    if (!isObject(current) || !(key in current)) return undefined
    current = current[key]
  }
  return current
}

function collectProfileCandidates(source = {}) {
  if (!isObject(source)) return []

  return PROFILE_CANDIDATE_PATHS
    .map((path) => ({
      path: path.join('.'),
      value: readPath(source, path),
    }))
    .filter((candidate) => normalizeText(candidate.value))
}

function collectOrganisationIdCandidates(source = {}) {
  if (!isObject(source)) return []

  return ORGANISATION_ID_CANDIDATE_PATHS
    .map((path) => ({
      path: path.join('.'),
      value: readPath(source, path),
    }))
    .filter((candidate) => normalizeText(candidate.value))
}

export function normalizeBuyerProcessProfile(value, { fallback = DEFAULT_BUYER_PROCESS_PROFILE } = {}) {
  const token = normalizeProfileToken(value)
  if (!token) return fallback
  return BUYER_PROCESS_PROFILE_ALIASES[token] || fallback
}

export function isKingstonsBuyerProcessOrganisationId(value) {
  const organisationId = normalizeText(value).toLowerCase()
  return Boolean(organisationId && KINGSTONS_BUYER_PROCESS_ORGANISATION_IDS.includes(organisationId))
}

export function isKnownBuyerProcessProfile(value) {
  const token = normalizeProfileToken(value)
  return Boolean(token && BUYER_PROCESS_PROFILE_ALIASES[token])
}

export function isKingstonsBuyerProcessProfile(value) {
  return normalizeBuyerProcessProfile(value) === KINGSTONS_BUYER_PROCESS_PROFILE
}

export function resolveBuyerProcessProfile(source = {}) {
  const [candidate] = collectProfileCandidates(source)
  const requestedProfile = normalizeText(candidate?.value)
  const configured = Boolean(requestedProfile)
  const knownProfile = configured && isKnownBuyerProcessProfile(requestedProfile)
  const profile = knownProfile
    ? normalizeBuyerProcessProfile(requestedProfile)
    : DEFAULT_BUYER_PROCESS_PROFILE

  return Object.freeze({
    profile,
    key: profile,
    configured,
    knownProfile,
    requestedProfile,
    sourcePath: candidate?.path || '',
    isDefault: profile === DEFAULT_BUYER_PROCESS_PROFILE,
    isKingstons: profile === KINGSTONS_BUYER_PROCESS_PROFILE,
  })
}

export function resolveBuyerProcessProfileKey(source = {}) {
  return resolveBuyerProcessProfile(source).profile
}

export function resolveBuyerProcessProfileForOrganisation(source = {}) {
  const explicitResolution = resolveBuyerProcessProfile(source)
  if (explicitResolution.configured && explicitResolution.profile !== DEFAULT_BUYER_PROCESS_PROFILE) {
    return explicitResolution
  }
  if (explicitResolution.configured && !explicitResolution.knownProfile) return explicitResolution

  const [candidate] = collectOrganisationIdCandidates(source)
  const organisationId = normalizeText(candidate?.value).toLowerCase()
  if (!isKingstonsBuyerProcessOrganisationId(organisationId)) return explicitResolution

  return Object.freeze({
    profile: KINGSTONS_BUYER_PROCESS_PROFILE,
    key: KINGSTONS_BUYER_PROCESS_PROFILE,
    configured: true,
    knownProfile: true,
    requestedProfile: KINGSTONS_BUYER_PROCESS_PROFILE,
    sourcePath: candidate?.path || 'organisationId',
    isDefault: false,
    isKingstons: true,
    organisationScoped: true,
  })
}
