import { normalizeProperty24Text } from './client.js'

function credentialError(code, message, status = 409) {
  const error = new Error(message)
  error.code = code
  error.status = status
  return error
}

function normaliseEnvironment(value = '') {
  const environment = normalizeProperty24Text(value).toLowerCase()
  return ['production', 'exdev'].includes(environment) ? environment : ''
}

function firstRow(data) {
  return Array.isArray(data) ? data[0] || null : data || null
}

export async function fetchOrganisationProperty24Credentials({ supabase, organisationId, environment } = {}) {
  // Older focused test doubles and pre-migration deployments do not expose
  // RPC. They retain the existing environment-credential fallback.
  if (!supabase?.rpc) return null
  const normalizedOrganisationId = normalizeProperty24Text(organisationId)
  const normalizedEnvironment = normaliseEnvironment(environment)
  if (!normalizedOrganisationId || !normalizedEnvironment) return null
  const result = await supabase.rpc('get_property24_account_credentials', {
    p_organisation_id: normalizedOrganisationId,
    p_environment: normalizedEnvironment,
  })
  // Old deployments can keep using the environment fallback until the
  // migration has been applied. Never mask other database failures.
  if (result.error?.code === 'PGRST202' || result.error?.code === '42883') return null
  if (result.error) throw result.error
  const row = firstRow(result.data)
  const username = normalizeProperty24Text(row?.username)
  const password = normalizeProperty24Text(row?.password)
  if (!username || !password) return null
  return {
    username,
    password,
    userGroupId: normalizeProperty24Text(row?.user_group_id),
    source: 'organisation_vault',
  }
}

export async function saveOrganisationProperty24Credentials({ supabase, organisationId, environment, username, password, userGroupId = '' } = {}) {
  if (!supabase?.rpc) throw credentialError('supabase_required', 'Supabase client is required.', 500)
  const normalizedOrganisationId = normalizeProperty24Text(organisationId)
  const normalizedEnvironment = normaliseEnvironment(environment)
  if (!normalizedOrganisationId) throw credentialError('organisation_id_required', 'Organisation ID is required.', 400)
  if (!normalizedEnvironment) throw credentialError('property24_environment_invalid', 'Property24 environment must be ExDev or production.', 400)
  if (!normalizeProperty24Text(username) || !normalizeProperty24Text(password)) {
    throw credentialError('property24_credentials_required', 'Enter the Property24 username and password.', 400)
  }
  const result = await supabase.rpc('set_property24_account_credentials', {
    p_organisation_id: normalizedOrganisationId,
    p_environment: normalizedEnvironment,
    p_username: normalizeProperty24Text(username),
    p_password: normalizeProperty24Text(password),
    p_user_group_id: normalizeProperty24Text(userGroupId) || null,
  })
  if (result.error) throw result.error
  const row = firstRow(result.data)
  return {
    configured: row?.credentials_configured === true,
    updatedAt: row?.credentials_updated_at || null,
  }
}
