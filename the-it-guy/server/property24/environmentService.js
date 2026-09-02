import { PROPERTY24_EXDEV_BASE_URL, normalizeProperty24Text } from './client.js'

function normalizeEnvironment(value = '') {
  return normalizeProperty24Text(value).toLowerCase() === 'production' ? 'production' : 'exdev'
}

function environmentFromBaseUrl(value = '') {
  const baseUrl = normalizeProperty24Text(value).toLowerCase()
  return baseUrl.includes('property24-test.com') ? 'exdev' : 'production'
}

export function resolveProperty24EnvironmentCredentials({ env = {}, environment = 'exdev' } = {}) {
  const targetEnvironment = normalizeEnvironment(environment)
  const production = targetEnvironment === 'production'
  const specificBaseUrl = normalizeProperty24Text(production
    ? env.PROPERTY24_PRODUCTION_BASE_URL
    : env.PROPERTY24_EXDEV_BASE_URL)
  const genericBaseUrl = normalizeProperty24Text(env.PROPERTY24_BASE_URL)
  const baseUrl = specificBaseUrl || genericBaseUrl || (production ? '' : PROPERTY24_EXDEV_BASE_URL)
  const username = normalizeProperty24Text(production
    ? env.PROPERTY24_PRODUCTION_BASIC_AUTH_USERNAME
    : env.PROPERTY24_EXDEV_BASIC_AUTH_USERNAME) || normalizeProperty24Text(env.PROPERTY24_BASIC_AUTH_USERNAME || env.PROPERTY24_USERNAME)
  const password = normalizeProperty24Text(production
    ? env.PROPERTY24_PRODUCTION_BASIC_AUTH_PASSWORD
    : env.PROPERTY24_EXDEV_BASIC_AUTH_PASSWORD) || normalizeProperty24Text(env.PROPERTY24_BASIC_AUTH_PASSWORD || env.PROPERTY24_PASSWORD)
  const userGroupId = normalizeProperty24Text(production
    ? env.PROPERTY24_PRODUCTION_USER_GROUP_ID
    : env.PROPERTY24_EXDEV_USER_GROUP_ID) || normalizeProperty24Text(env.PROPERTY24_USER_GROUP_ID)
  const resolvedEnvironment = baseUrl ? environmentFromBaseUrl(baseUrl) : targetEnvironment
  const apiVersion = normalizeProperty24Text(production
    ? env.PROPERTY24_PRODUCTION_API_VERSION
    : env.PROPERTY24_EXDEV_API_VERSION) || normalizeProperty24Text(env.PROPERTY24_API_VERSION) || (production ? 'v55' : 'v53')
  const sendUserGroupHeader = production
    ? String(env.PROPERTY24_PRODUCTION_SEND_USER_GROUP_HEADER || env.PROPERTY24_SEND_USER_GROUP_HEADER || '').trim().toLowerCase() === 'true'
    : String(env.PROPERTY24_EXDEV_SEND_USER_GROUP_HEADER || env.PROPERTY24_SEND_USER_GROUP_HEADER || '').trim().toLowerCase() !== 'false'

  return {
    environment: targetEnvironment,
    baseUrl,
    username,
    password,
    userGroupId,
    apiVersion,
    sendUserGroupHeader,
    configured: Boolean(baseUrl && username && password && resolvedEnvironment === targetEnvironment),
    environmentMatches: resolvedEnvironment === targetEnvironment,
    credentialSource: specificBaseUrl ? 'environment_specific' : 'legacy_generic',
    missing: [
      ...(!baseUrl ? [`PROPERTY24_${targetEnvironment.toUpperCase()}_BASE_URL`] : []),
      ...(!username ? [`PROPERTY24_${targetEnvironment.toUpperCase()}_BASIC_AUTH_USERNAME`] : []),
      ...(!password ? [`PROPERTY24_${targetEnvironment.toUpperCase()}_BASIC_AUTH_PASSWORD`] : []),
      ...(baseUrl && resolvedEnvironment !== targetEnvironment ? ['PROPERTY24 environment-specific base URL'] : []),
    ],
  }
}
