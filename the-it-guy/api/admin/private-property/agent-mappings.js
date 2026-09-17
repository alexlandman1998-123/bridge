import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { writeNodeJsonResponse } from '../../../server/services/hqMissionControlApi.js'
import { createPrivatePropertyClient, extractPrivatePropertyXmlBlocks, extractPrivatePropertyXmlTag, normalizePrivatePropertyText } from '../../../server/services/privatePropertyClient.js'
import { resolvePrivatePropertyAgencyConfig, resolvePrivatePropertyCredentials, resolvePrivatePropertyRuntimeCredentials } from '../../../server/services/privatePropertyAgencyConfigService.js'
import { redactPrivatePropertyAgentMapping, upsertPrivatePropertyAgentMapping } from '../../../server/services/privatePropertyAgentMappingService.js'

const appRoot = fileURLToPath(new URL('../../..', import.meta.url))

function runtimeEnv() {
  const values = {}
  for (const file of ['.env', '.env.local', '.env.production.local']) {
    const filePath = path.join(appRoot, file)
    if (!fs.existsSync(filePath)) continue
    for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
      const index = line.indexOf('=')
      if (index > 0 && !line.trim().startsWith('#')) values[line.slice(0, index).trim()] = line.slice(index + 1).trim().replace(/^["']|["']$/g, '')
    }
  }
  return { ...values, ...process.env }
}
function header(headers = {}, name) { const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name); return normalizePrivatePropertyText(Array.isArray(entry?.[1]) ? entry[1][0] : entry?.[1]) }
function privatePropertyAgents(xml = '') { return extractPrivatePropertyXmlBlocks(xml, 'Agent').map((agent) => ({ privatePropertyAgentId: extractPrivatePropertyXmlTag(agent, 'AgentId'), privatePropertyInternalId: extractPrivatePropertyXmlTag(agent, 'PrivatePropertyAgentId'), email: extractPrivatePropertyXmlTag(agent, 'Email').toLowerCase(), firstName: extractPrivatePropertyXmlTag(agent, 'FirstName'), lastName: extractPrivatePropertyXmlTag(agent, 'LastName'), active: extractPrivatePropertyXmlTag(agent, 'Active').toLowerCase() !== 'false' })).filter((agent) => agent.privatePropertyAgentId) }
function executive(user = {}) { const meta = user.app_metadata || {}; return [meta.role, meta.app_role, ...(Array.isArray(meta.roles) ? meta.roles : [])].some((role) => normalizePrivatePropertyText(role).toLowerCase().replace(/[\s-]+/g, '_') === 'executive') }
function cors(request) { const origin = header(request.headers, 'origin'); return { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8', ...(new Set(['https://admin.arch9.co.za', 'http://localhost:5173']).has(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}), 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'OPTIONS, GET, PUT' } }
async function readBody(request) { const chunks = []; for await (const chunk of request) chunks.push(chunk); const value = chunks.length ? Buffer.concat(chunks).toString('utf8') : ''; return value.trim() ? JSON.parse(value) : {} }

export default async function handler(request, responseWriter) {
  const reply = (status, body) => writeNodeJsonResponse(responseWriter, { status, headers: cors(request), body })
  let credentialDiagnostics = null
  if (request.method === 'OPTIONS') return reply(204, null)
  if (!['GET', 'PUT'].includes(request.method)) return reply(405, { error: 'method_not_allowed' })
  try {
    const env = runtimeEnv(); const url = normalizePrivatePropertyText(env.SUPABASE_URL || env.VITE_SUPABASE_URL); const key = normalizePrivatePropertyText(env.SUPABASE_SERVICE_ROLE_KEY)
    if (!url || !key) return reply(503, { error: 'missing_configuration' })
    const token = header(request.headers, 'authorization').replace(/^Bearer\s+/i, '')
    if (!token) return reply(401, { error: 'unauthorized' })
    const supabase = createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    const current = await supabase.auth.getUser(token); const trusted = current.data?.user?.id ? await supabase.auth.admin.getUserById(current.data.user.id) : null
    if (current.error || !trusted || trusted.error) return reply(401, { error: 'unauthorized' })
    if (!executive(trusted.data?.user)) return reply(403, { error: 'forbidden', message: 'Executive admin access is required.' })
    const organisationId = normalizePrivatePropertyText(new URL(request.url || '/', 'https://app.arch9.co.za').searchParams.get('organisationId'))
    if (!organisationId) return reply(400, { error: 'organisation_id_required' })
    const config = await resolvePrivatePropertyAgencyConfig({ client: supabase, organisationId, environment: 'production', allowDisabled: true })
    if (!config.config?.id) return reply(409, { error: 'private_property_connection_required', message: 'Save the Private Property production connection before mapping agents.' })
    if (request.method === 'GET') {
      const [users, mappings, credentials] = await Promise.all([
        supabase.from('organisation_users').select('user_id, email, first_name, last_name, status, membership_status').eq('organisation_id', organisationId).not('user_id', 'is', null).order('first_name'),
        supabase.from('private_property_agent_mappings').select('*').eq('agency_config_id', config.config.id).eq('environment', 'production').order('updated_at', { ascending: false }),
        resolvePrivatePropertyCredentials({ client: supabase, config: config.config, secrets: env }),
      ])
      if (users.error) throw users.error
      if (mappings.error) throw mappings.error
      const runtimeCredentials = resolvePrivatePropertyRuntimeCredentials(config.config, env)
      credentialDiagnostics = {
        vaultCredentialsPresent: Boolean(credentials.username && credentials.password),
        runtimeCredentialsPresent: Boolean(runtimeCredentials.username && runtimeCredentials.password),
        vaultMatchesRuntime: Boolean(
          credentials.username
          && credentials.password
          && runtimeCredentials.username
          && runtimeCredentials.password
          && credentials.username === runtimeCredentials.username
          && credentials.password === runtimeCredentials.password,
        ),
        credentialSource: credentials.source,
        serviceAuthentication: 'pending',
        branchAuthorization: 'not_tested',
      }
      console.info('[private-property-agent-mappings] production credential check', {
        organisationId,
        ...credentialDiagnostics,
      })
      const privateProperty = createPrivatePropertyClient({ baseUrl: config.config.baseUrl, username: credentials.username, password: credentials.password })
      await privateProperty.getCountries()
      credentialDiagnostics.serviceAuthentication = 'passed'
      const agentResponse = await privateProperty.getAllAgentsForBranch({ branchGuid: config.config.branchGuid })
      credentialDiagnostics.branchAuthorization = 'passed'
      return reply(200, { agencyConfig: config.config, users: users.data || [], mappings: (mappings.data || []).map(redactPrivatePropertyAgentMapping), privatePropertyAgents: privatePropertyAgents(agentResponse.data), credentialDiagnostics })
    }
    const input = await readBody(request)
    const userId = normalizePrivatePropertyText(input.arch9UserId)
    const userResult = userId ? await supabase.from('organisation_users').select('user_id, email, first_name, last_name').eq('organisation_id', organisationId).eq('user_id', userId).maybeSingle() : { data: null, error: null }
    if (userResult.error) throw userResult.error
    if (!userResult.data) return reply(400, { error: 'arch9_user_required', message: 'Choose an active Arch9 user for this mapping.' })
    const user = userResult.data
    const result = await upsertPrivatePropertyAgentMapping({ client: supabase, agencyConfigId: config.config.id, organisationId, organisationUserId: user.user_id, arch9UserId: user.user_id, environment: 'production', privatePropertyAgentId: input.privatePropertyAgentId, sourceReference: input.sourceReference, emailSnapshot: user.email, firstNameSnapshot: user.first_name, lastNameSnapshot: user.last_name, isDefaultForOrganisation: input.isDefaultForOrganisation === true, matchType: 'manual', confidence: 1, status: 'active', notes: input.notes })
    return reply(200, result)
  } catch (error) {
    console.error('[private-property-agent-mappings] request failed', { name: error.name, code: error.code || null, method: error.method || null, status: error.status || null })
    const serviceAuthenticationFailure = error.method === 'GetCountries'
    const branchAuthorizationFailure = error.method === 'GetAllAgentsForBranch'
    if (credentialDiagnostics && serviceAuthenticationFailure) credentialDiagnostics.serviceAuthentication = 'failed'
    if (credentialDiagnostics && branchAuthorizationFailure) credentialDiagnostics.branchAuthorization = 'failed'
    return reply(Number(error.status || 500), {
      error: serviceAuthenticationFailure ? 'private_property_service_authentication_failed' : branchAuthorizationFailure ? 'private_property_branch_authorization_failed' : (error.code || 'private_property_agent_mapping_failed'),
      message: serviceAuthenticationFailure
        ? 'Private Property rejected the production service credentials or generated token before checking Kingdom’s branch GUID.'
        : branchAuthorizationFailure
          ? 'Private Property accepted the service credentials but rejected or could not access Kingdom’s branch GUID.'
          : (error.message || 'Unable to save Private Property agent mapping.'),
      ...(credentialDiagnostics ? { credentialDiagnostics } : {}),
    })
  }
}
