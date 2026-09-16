import { normalizePrivatePropertyText } from '../services/privatePropertyClient.js'

export function getPrivatePropertyHeader(headers = {}, name = '') {
  const target = String(name).toLowerCase()
  const entry = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === target)
  const value = entry?.[1]
  return Array.isArray(value) ? normalizePrivatePropertyText(value[0]) : normalizePrivatePropertyText(value)
}

export function privatePropertySettingsResponse(status, body) {
  return {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    body,
  }
}

export async function readPrivatePropertySettingsBody(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  const text = chunks.length ? Buffer.concat(chunks).toString('utf8') : ''
  if (!text.trim()) return {}
  try {
    return JSON.parse(text)
  } catch {
    const error = new Error('Request body must be valid JSON.')
    error.status = 400
    error.code = 'invalid_json'
    throw error
  }
}

function canManagePrivatePropertySettings(row = {}) {
  const role = normalizePrivatePropertyText(row.workspace_role || row.organisation_role || row.organization_role || row.role).toLowerCase()
  const status = normalizePrivatePropertyText(row.membership_status || row.status).toLowerCase()
  return ['active', 'accepted', 'approved'].includes(status) &&
    ['principal', 'owner', 'admin', 'manager', 'branch_manager', 'agency_principal'].includes(role)
}

export async function authenticatePrivatePropertySettingsRequest({ request, supabase, organisationId } = {}) {
  const authorization = getPrivatePropertyHeader(request?.headers, 'authorization')
  const token = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : ''
  if (!token) return { ok: false, response: privatePropertySettingsResponse(401, { error: 'unauthorized', message: 'Sign in before managing Private Property.' }) }

  const userResult = await supabase.auth.getUser(token)
  const user = userResult.data?.user
  if (userResult.error || !user?.id) {
    return { ok: false, response: privatePropertySettingsResponse(401, { error: 'unauthorized', message: 'Your session could not be verified.' }) }
  }

  const membership = await supabase
    .from('organisation_users')
    .select('id, user_id, email, role, workspace_role, organisation_role, organization_role, status, membership_status')
    .eq('organisation_id', organisationId)
    .or(`user_id.eq.${user.id},email.eq.${user.email || ''}`)
    .limit(5)
  if (membership.error) throw membership.error
  if (!(membership.data || []).some(canManagePrivatePropertySettings)) {
    return { ok: false, response: privatePropertySettingsResponse(403, { error: 'forbidden', message: 'Organisation admin access is required to manage Private Property.' }) }
  }
  return { ok: true, user }
}
