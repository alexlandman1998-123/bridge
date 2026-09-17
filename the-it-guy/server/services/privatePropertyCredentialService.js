import { normalizePrivatePropertySecret, normalizePrivatePropertyText } from './privatePropertyClient.js'

function firstRow(data) {
  return Array.isArray(data) ? data[0] || null : data || null
}

export async function savePrivatePropertyAgencyCredentials({ supabase, configId, username, password } = {}) {
  if (!supabase?.rpc) throw new Error('Supabase client is required.')
  const result = await supabase.rpc('set_private_property_agency_credentials', {
    p_config_id: normalizePrivatePropertyText(configId),
    p_username: normalizePrivatePropertyText(username),
    p_password: normalizePrivatePropertySecret(password),
  })
  if (result.error) throw result.error
  const row = firstRow(result.data)
  return { configured: row?.credentials_configured === true, updatedAt: row?.credentials_updated_at || null }
}

export async function fetchPrivatePropertyAgencyCredentials({ supabase, configId } = {}) {
  if (!supabase?.rpc || !normalizePrivatePropertyText(configId)) return null
  const result = await supabase.rpc('get_private_property_agency_credentials', { p_config_id: normalizePrivatePropertyText(configId) })
  if (result.error?.code === 'PGRST202' || result.error?.code === '42883') return null
  if (result.error) throw result.error
  const row = firstRow(result.data)
  const username = normalizePrivatePropertyText(row?.username)
  const password = normalizePrivatePropertySecret(row?.password)
  return username && password.trim() ? { username, password, source: 'agency_vault' } : null
}
