export const SELLER_PROCESS_PROFILE_KEYS = Object.freeze({
  DEFAULT_RESIDENTIAL: 'default_residential',
  KINGSTONS_RESIDENTIAL: 'kingstons_residential',
})

export const DEFAULT_SELLER_PROCESS_PROFILE = SELLER_PROCESS_PROFILE_KEYS.DEFAULT_RESIDENTIAL
export const KINGSTONS_SELLER_PROCESS_PROFILE = SELLER_PROCESS_PROFILE_KEYS.KINGSTONS_RESIDENTIAL
export const KINGSTONS_SELLER_PROCESS_ORGANISATION_IDS = Object.freeze([
  'ec19d0a6-bcba-4eef-aa72-9972de88204d',
])

const SELLER_PROCESS_PROFILE_ALIASES = Object.freeze({
  default: DEFAULT_SELLER_PROCESS_PROFILE,
  default_residential: DEFAULT_SELLER_PROCESS_PROFILE,
  legacy: DEFAULT_SELLER_PROCESS_PROFILE,
  current: DEFAULT_SELLER_PROCESS_PROFILE,
  standard: DEFAULT_SELLER_PROCESS_PROFILE,
  standard_residential: DEFAULT_SELLER_PROCESS_PROFILE,
  residential: DEFAULT_SELLER_PROCESS_PROFILE,
  kingston: KINGSTONS_SELLER_PROCESS_PROFILE,
  kingstons: KINGSTONS_SELLER_PROCESS_PROFILE,
  kingston_residential: KINGSTONS_SELLER_PROCESS_PROFILE,
  kingstons_residential: KINGSTONS_SELLER_PROCESS_PROFILE,
})

const PROFILE_CANDIDATE_PATHS = Object.freeze([
  ['sellerProcessProfile'],
  ['seller_process_profile'],
  ['sellerProcessProfileKey'],
  ['seller_process_profile_key'],
  ['sellerProcess', 'profile'],
  ['sellerProcess', 'processProfile'],
  ['sellerProcess', 'process_profile'],
  ['seller_process', 'profile'],
  ['seller_process', 'processProfile'],
  ['seller_process', 'process_profile'],
  ['settings', 'sellerProcessProfile'],
  ['settings', 'seller_process_profile'],
  ['settings', 'sellerProcess', 'profile'],
  ['settings', 'sellerProcess', 'processProfile'],
  ['settings', 'sellerProcess', 'process_profile'],
  ['settings', 'seller_process', 'profile'],
  ['settings', 'seller_process', 'processProfile'],
  ['settings', 'seller_process', 'process_profile'],
  ['organisationSettings', 'sellerProcessProfile'],
  ['organisationSettings', 'seller_process_profile'],
  ['organisationSettings', 'sellerProcess', 'profile'],
  ['organisationSettings', 'sellerProcess', 'processProfile'],
  ['organisationSettings', 'sellerProcess', 'process_profile'],
  ['organisationSettings', 'seller_process', 'profile'],
  ['organisationSettings', 'seller_process', 'processProfile'],
  ['organisationSettings', 'seller_process', 'process_profile'],
  ['organisation', 'sellerProcessProfile'],
  ['organisation', 'seller_process_profile'],
  ['organization', 'sellerProcessProfile'],
  ['organization', 'seller_process_profile'],
  ['onboarding', 'sellerProcessProfile'],
  ['onboarding', 'seller_process_profile'],
  ['onboarding', 'sellerProcess', 'profile'],
  ['onboarding', 'seller_process', 'profile'],
  ['metadata', 'sellerProcessProfile'],
  ['metadata', 'seller_process_profile'],
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
    .replace(/['’]/g, '')
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

export function normalizeSellerProcessProfile(value, { fallback = DEFAULT_SELLER_PROCESS_PROFILE } = {}) {
  const token = normalizeProfileToken(value)
  if (!token) return fallback
  return SELLER_PROCESS_PROFILE_ALIASES[token] || fallback
}

export function isKingstonsSellerProcessOrganisationId(value) {
  const organisationId = normalizeText(value).toLowerCase()
  return Boolean(organisationId && KINGSTONS_SELLER_PROCESS_ORGANISATION_IDS.includes(organisationId))
}

export function isKnownSellerProcessProfile(value) {
  const token = normalizeProfileToken(value)
  return Boolean(token && SELLER_PROCESS_PROFILE_ALIASES[token])
}

export function isKingstonsSellerProcessProfile(value) {
  return normalizeSellerProcessProfile(value) === KINGSTONS_SELLER_PROCESS_PROFILE
}

export function resolveSellerProcessProfile(source = {}) {
  const [candidate] = collectProfileCandidates(source)
  const requestedProfile = normalizeText(candidate?.value)
  const configured = Boolean(requestedProfile)
  const knownProfile = configured && isKnownSellerProcessProfile(requestedProfile)
  const profile = knownProfile
    ? normalizeSellerProcessProfile(requestedProfile)
    : DEFAULT_SELLER_PROCESS_PROFILE

  return Object.freeze({
    profile,
    key: profile,
    configured,
    knownProfile,
    requestedProfile,
    sourcePath: candidate?.path || '',
    isDefault: profile === DEFAULT_SELLER_PROCESS_PROFILE,
    isKingstons: profile === KINGSTONS_SELLER_PROCESS_PROFILE,
  })
}

export function resolveSellerProcessProfileKey(source = {}) {
  return resolveSellerProcessProfile(source).profile
}

export function resolveSellerProcessProfileForOrganisation(source = {}) {
  const explicitResolution = resolveSellerProcessProfile(source)
  if (explicitResolution.configured) return explicitResolution

  const [candidate] = collectOrganisationIdCandidates(source)
  const organisationId = normalizeText(candidate?.value).toLowerCase()
  if (!isKingstonsSellerProcessOrganisationId(organisationId)) return explicitResolution

  return Object.freeze({
    profile: KINGSTONS_SELLER_PROCESS_PROFILE,
    key: KINGSTONS_SELLER_PROCESS_PROFILE,
    configured: true,
    knownProfile: true,
    requestedProfile: KINGSTONS_SELLER_PROCESS_PROFILE,
    sourcePath: candidate?.path || 'organisationId',
    isDefault: false,
    isKingstons: true,
    organisationScoped: true,
  })
}

export function resolveSellerProcessProfileActivation(input = {}) {
  const requestedProfile = normalizeText(
    input?.profile ||
      input?.sellerProcessProfile ||
      input?.seller_process_profile ||
      input?.sellerProcess?.profile ||
      input?.seller_process?.profile,
  )
  if (!requestedProfile) {
    return Object.freeze({
      ok: false,
      reason: 'missing_profile',
      requestedProfile: '',
      profile: DEFAULT_SELLER_PROCESS_PROFILE,
      isKingstons: false,
    })
  }
  if (!isKnownSellerProcessProfile(requestedProfile)) {
    return Object.freeze({
      ok: false,
      reason: 'unknown_profile',
      requestedProfile,
      profile: DEFAULT_SELLER_PROCESS_PROFILE,
      isKingstons: false,
    })
  }
  const profile = normalizeSellerProcessProfile(requestedProfile)
  return Object.freeze({
    ok: true,
    reason: '',
    requestedProfile,
    profile,
    isKingstons: profile === KINGSTONS_SELLER_PROCESS_PROFILE,
  })
}

export function buildSellerProcessProfileSettings(settings = {}, input = {}) {
  const activation = resolveSellerProcessProfileActivation(input)
  if (!activation.ok) {
    throw new Error(
      activation.reason === 'unknown_profile'
        ? `Unknown seller process profile: ${activation.requestedProfile}`
        : 'Seller process profile is required.',
    )
  }
  const source = isObject(settings) ? settings : {}
  const existingSellerProcess = isObject(source.sellerProcess)
    ? source.sellerProcess
    : isObject(source.seller_process)
      ? source.seller_process
      : {}
  return Object.freeze({
    ...source,
    sellerProcess: {
      ...existingSellerProcess,
      profile: activation.profile,
    },
  })
}
