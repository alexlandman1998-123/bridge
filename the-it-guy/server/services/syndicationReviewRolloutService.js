const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on', 'enabled'])

export const SYNDICATION_REVIEW_ROLLOUT_VERSION = 'arch9_syndication_review_rollout_v1'

export const SYNDICATION_REVIEW_ROLLOUT_ENV = Object.freeze({
  enabled: 'ARCH9_SYNDICATION_REVIEW_ENABLED',
  organisationIds: 'ARCH9_SYNDICATION_REVIEW_ORGANISATION_IDS',
  pilotChannels: 'ARCH9_SYNDICATION_REVIEW_PILOT_CHANNELS',
  pilotCategories: 'ARCH9_SYNDICATION_REVIEW_PILOT_CATEGORIES',
})

const DEFAULT_PILOT_CHANNELS = Object.freeze(['privateProperty', 'property24'])
const DEFAULT_PILOT_CATEGORIES = Object.freeze(['residential', 'land', 'farm', 'commercial', 'industrial', 'mixedUse'])

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeBoolean(value) {
  return TRUE_VALUES.has(normalizeText(value).toLowerCase())
}

function normalizeOrganisationIds(value = '') {
  const raw = Array.isArray(value) ? value : normalizeText(value).split(',')
  return [...new Set(raw.map((item) => normalizeText(item)).filter(Boolean))]
}

function normalizeChannel(value = '') {
  const normalized = normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '')
  if (normalized === 'privateproperty') return 'privateProperty'
  if (normalized === 'property24') return 'property24'
  return ''
}

function resolvePilotChannels(value) {
  const configured = normalizeText(value)
  if (!configured) return { configured: false, values: [...DEFAULT_PILOT_CHANNELS] }
  const values = [...new Set(configured.split(',').map(normalizeChannel).filter(Boolean))]
  return { configured: true, values }
}

function normalizeCategory(value = '') {
  const normalized = normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '')
  if (['house', 'apartment', 'flat', 'townhouse', 'cluster', 'residential'].includes(normalized)) return 'residential'
  if (normalized === 'land') return 'land'
  if (['farm', 'agricultural', 'agriculture'].includes(normalized)) return 'farm'
  if (normalized === 'commercial') return 'commercial'
  if (normalized === 'industrial') return 'industrial'
  if (['mixeduse', 'mixed'].includes(normalized)) return 'mixedUse'
  return ''
}

function resolvePilotCategories(value) {
  const configured = normalizeText(value)
  if (!configured) return { configured: false, values: [...DEFAULT_PILOT_CATEGORIES] }
  const values = [...new Set(configured.split(',').map(normalizeCategory).filter(Boolean))]
  return { configured: true, values }
}

/**
 * This gate deliberately starts disabled. Future UI work must opt an
 * organisation in explicitly; it can never change the existing publish path
 * merely because a global environment value was added.
 */
export function resolveSyndicationReviewRollout({ env = {}, organisationId = '', listingCategory = '' } = {}) {
  const normalizedOrganisationId = normalizeText(organisationId)
  const globallyEnabled = normalizeBoolean(env[SYNDICATION_REVIEW_ROLLOUT_ENV.enabled])
  const enabledOrganisationIds = normalizeOrganisationIds(env[SYNDICATION_REVIEW_ROLLOUT_ENV.organisationIds])
  const pilotChannels = resolvePilotChannels(env[SYNDICATION_REVIEW_ROLLOUT_ENV.pilotChannels])
  const pilotCategories = resolvePilotCategories(env[SYNDICATION_REVIEW_ROLLOUT_ENV.pilotCategories])
  const normalizedListingCategory = normalizeCategory(listingCategory)
  const organisationEnabled = Boolean(normalizedOrganisationId) && enabledOrganisationIds.includes(normalizedOrganisationId)
  const enabled = globallyEnabled && organisationEnabled

  let reason = 'disabled_by_default'
  if (globallyEnabled && !normalizedOrganisationId) reason = 'missing_organisation_id'
  if (globallyEnabled && normalizedOrganisationId && !organisationEnabled) reason = 'organisation_not_enabled'
  if (enabled) reason = 'organisation_enabled'

  return {
    version: SYNDICATION_REVIEW_ROLLOUT_VERSION,
    enabled,
    mode: enabled ? 'review' : 'legacy',
    reason,
    organisationId: normalizedOrganisationId || null,
    pilotChannels: enabled ? pilotChannels.values : [],
    pilotChannelsConfigured: pilotChannels.configured,
    pilotCategories: enabled ? pilotCategories.values : [],
    pilotCategoriesConfigured: pilotCategories.configured,
    listingCategory: normalizedListingCategory || null,
    listingCategoryEnabled: enabled && (!pilotCategories.configured || pilotCategories.values.includes(normalizedListingCategory)),
    legacyPublishPathPreserved: true,
  }
}
