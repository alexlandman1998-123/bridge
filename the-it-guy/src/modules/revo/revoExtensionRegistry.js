export const REVO_EXTENSION_KEY = 'revo'
export const REVO_ORGANISATION_ID = '322c3853-2d82-4413-97e6-b4cd8bc32a7c'

const EXTENSION_SETTING_KEY = 'workspaceExtensions'

export const WORKSPACE_EXTENSION_REGISTRY = Object.freeze({
  [REVO_EXTENSION_KEY]: Object.freeze({
    key: REVO_EXTENSION_KEY,
    organisationIds: Object.freeze([REVO_ORGANISATION_ID]),
    label: 'Revo extension',
  }),
})

function text(value = '') {
  return String(value || '').trim()
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function getOrganisationId(context = {}) {
  return text(
    context.organisationId ||
      context.organisation_id ||
      context.organisation?.id ||
      context.workspace?.organisationId ||
      context.workspace?.organisation_id ||
      context.workspace?.id,
  )
}

function getOrganisationSettings(context = {}) {
  return object(context.organisationSettings || context.organizationSettings || context.settingsJson || context.settings_json)
}

function getExtensionSetting(settings = {}, extensionKey = '') {
  return object(object(object(settings)[EXTENSION_SETTING_KEY])[text(extensionKey)])
}

function isKnownExtensionForOrganisation(extension = {}, organisationId = '') {
  return Boolean(organisationId) && extension.organisationIds.includes(organisationId)
}

/**
 * Resolves the extensions enabled for the active organisation.
 *
 * The persisted shape is deliberately explicit:
 * `{ workspaceExtensions: { revo: { enabled: true, features: { feature_key: true } } } }`.
 * A setting alone cannot enable an extension for another organisation, and an
 * allowlisted organisation remains disabled until its setting is explicitly enabled.
 */
export function resolveWorkspaceExtensions(context = {}) {
  const organisationId = getOrganisationId(context)
  const settings = getOrganisationSettings(context)

  return Object.values(WORKSPACE_EXTENSION_REGISTRY)
    .filter((extension) => isKnownExtensionForOrganisation(extension, organisationId))
    .filter((extension) => getExtensionSetting(settings, extension.key).enabled === true)
    .map((extension) => Object.freeze({
      key: extension.key,
      label: extension.label,
      enabled: true,
    }))
}

export function hasWorkspaceExtension(extensionKey = '', context = {}) {
  const expectedKey = text(extensionKey)
  return resolveWorkspaceExtensions(context).some((extension) => extension.key === expectedKey)
}

export function isWorkspaceExtensionFeatureEnabled(extensionKey = '', featureKey = '', context = {}) {
  if (!hasWorkspaceExtension(extensionKey, context)) return false
  const settings = getOrganisationSettings(context)
  const features = object(getExtensionSetting(settings, extensionKey).features)
  return features[text(featureKey)] === true
}

export function getWorkspaceExtensionAccess(extensionKey = '', context = {}) {
  const key = text(extensionKey)
  const registered = WORKSPACE_EXTENSION_REGISTRY[key]
  const organisationId = getOrganisationId(context)

  if (!registered) {
    return Object.freeze({ ok: false, code: 'extension_not_registered', extensionKey: key, organisationId })
  }

  if (!isKnownExtensionForOrganisation(registered, organisationId)) {
    return Object.freeze({ ok: false, code: 'organisation_not_allowed', extensionKey: key, organisationId })
  }

  if (!hasWorkspaceExtension(key, context)) {
    return Object.freeze({ ok: false, code: 'extension_disabled', extensionKey: key, organisationId })
  }

  return Object.freeze({ ok: true, code: 'enabled', extensionKey: key, organisationId })
}
