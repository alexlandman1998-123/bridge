import { createClient } from '@supabase/supabase-js'
import { createProperty24Client, normalizeProperty24Text, summarizeProperty24Payload } from '../../../server/property24/client.js'
import { resolveProperty24EnvironmentCredentials } from '../../../server/property24/environmentService.js'
import { fetchOrganisationProperty24Connection } from '../../../server/property24/organisationConnectionService.js'
import { fetchOrganisationProperty24Credentials } from '../../../server/property24/organisationCredentialService.js'
import { writeNodeJsonResponse } from '../../../server/services/hqMissionControlApi.js'

function response(status, body) {
  return { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body }
}

async function bodyOf(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400 }) }
}

function tokenFrom(headers = {}) {
  const entry = Object.entries(headers).find(([name]) => name.toLowerCase() === 'authorization')
  return normalizeProperty24Text(entry?.[1]).replace(/^Bearer\s+/i, '')
}

function isManager(row = {}) {
  const role = normalizeProperty24Text(row.workspace_role || row.organisation_role || row.organization_role || row.role).toLowerCase()
  const status = normalizeProperty24Text(row.membership_status || row.status).toLowerCase()
  return ['active', 'accepted', 'approved'].includes(status) && ['principal', 'owner', 'admin', 'manager', 'branch_manager', 'agency_principal'].includes(role)
}

function liveListingNumbers(data) {
  const rows = Array.isArray(data) ? data : (Array.isArray(data?.listings) ? data.listings : [])
  return [...new Set(rows.filter((row) => {
    const status = normalizeProperty24Text(row.ListingStatus || row.listingStatus || row.status).toLowerCase()
    return row.IsOnPortal === true || row.isOnPortal === true || ['active', 'live', 'published', 'on_portal'].includes(status)
  }).map((row) => Number(row.ListingNumber || row.listingNumber || row.id)).filter(Number.isFinite))]
}

export default async function handler(request, nodeResponse) {
  if (request.method !== 'POST') return writeNodeJsonResponse(nodeResponse, response(405, { error: 'method_not_allowed' }))
  try {
    const body = await bodyOf(request)
    const organisationId = normalizeProperty24Text(body.organisationId)
    const expectedLiveCount = Number(body.expectedLiveCount)
    if (!organisationId || body.confirmExpireAllLive !== true || expectedLiveCount < 1) {
      return writeNodeJsonResponse(nodeResponse, response(400, { error: 'explicit_confirmation_required', message: 'Supply the organisation, expected live count, and confirmExpireAllLive: true.' }))
    }
    const env = process.env
    const supabaseUrl = normalizeProperty24Text(env.SUPABASE_URL || env.VITE_SUPABASE_URL)
    const serviceRole = normalizeProperty24Text(env.SUPABASE_SERVICE_ROLE_KEY)
    if (!supabaseUrl || !serviceRole) return writeNodeJsonResponse(nodeResponse, response(503, { error: 'missing_configuration', missingConfiguration: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] }))
    const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } })
    const token = tokenFrom(request.headers)
    const userResult = await supabase.auth.getUser(token)
    if (userResult.error || !userResult.data?.user) return writeNodeJsonResponse(nodeResponse, response(401, { error: 'unauthorized' }))
    const user = userResult.data.user
    const membership = await supabase.from('organisation_users').select('role, workspace_role, organisation_role, organization_role, status, membership_status, user_id, email').eq('organisation_id', organisationId).or(`user_id.eq.${user.id},email.eq.${user.email || ''}`).limit(5)
    if (membership.error) throw membership.error
    if (!(membership.data || []).some(isManager)) return writeNodeJsonResponse(nodeResponse, response(403, { error: 'forbidden', message: 'Organisation admin access is required.' }))
    const connection = await fetchOrganisationProperty24Connection({ supabase, organisationId })
    const runtime = resolveProperty24EnvironmentCredentials({ env, environment: connection.environment })
    const credentials = await fetchOrganisationProperty24Credentials({ supabase, organisationId, environment: connection.environment })
    if (!connection.enabled || connection.environment !== 'production' || !runtime.environmentMatches || !runtime.baseUrl || !credentials?.username || !credentials?.password) {
      return writeNodeJsonResponse(nodeResponse, response(503, { error: 'unsafe_property24_runtime', message: 'A verified production Property24 runtime and organisation credentials are required.' }))
    }
    const property24 = createProperty24Client({ baseUrl: runtime.baseUrl, apiVersion: runtime.apiVersion, username: credentials.username, password: credentials.password, userGroupId: credentials.userGroupId })
    const reconciliation = await property24.fetchListingReconciliation({ agencyId: connection.agencyId })
    const listingNumbers = liveListingNumbers(reconciliation.data)
    if (listingNumbers.length !== expectedLiveCount) {
      return writeNodeJsonResponse(nodeResponse, response(409, { error: 'live_count_changed', message: `Property24 now reports ${listingNumbers.length} live listings; expected ${expectedLiveCount}. Nothing was expired.`, liveCount: listingNumbers.length }))
    }
    const results = []
    for (const listingNumber of listingNumbers) {
      const update = await property24.updateListingStatus(listingNumber, 'Expired')
      const portal = await property24.checkListingOnPortal(listingNumber)
      results.push({ listingNumber, updateStatus: update.status, isOnPortal: Boolean(portal.data) })
    }
    const stillLive = results.filter((item) => item.isOnPortal).map((item) => item.listingNumber)
    writeNodeJsonResponse(nodeResponse, response(stillLive.length ? 502 : 200, {
      status: stillLive.length ? 'NEEDS_REVIEW' : 'EXPIRED_AND_VERIFIED',
      agencyId: connection.agencyId,
      expiredCount: results.length,
      verifiedOffPortalCount: results.length - stillLive.length,
      stillLive,
      results,
    }))
  } catch (error) {
    writeNodeJsonResponse(nodeResponse, response(Number(error.status || 502), { error: 'property24_bulk_expiry_failed', message: error.message || 'Bulk expiry failed.', response: error.responseBody ? summarizeProperty24Payload(error.responseBody) : null }))
  }
}
