import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import {
  createProperty24Client,
  normalizeProperty24Text,
  summarizeProperty24Payload,
} from '../../../server/property24/client.js'
import { resolveProperty24EnvironmentCredentials } from '../../../server/property24/environmentService.js'
import { fetchCanonicalProperty24AgentProfile } from '../../../server/property24/agentProfileService.js'
import {
  extractProperty24AgentId,
  unwrapProperty24AgentCollection,
} from '../../../server/property24/agentPhotoService.js'
import {
  deactivateCanonicalProperty24AgentMapping,
  persistCanonicalProperty24AgentMapping,
} from '../../../server/property24/agentMappingService.js'
import { resolveOrganisationProperty24Connection } from '../../../server/property24/organisationConnectionService.js'
import { writeNodeJsonResponse } from '../../../server/services/hqMissionControlApi.js'

const appRoot = fileURLToPath(new URL('../../..', import.meta.url))

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(fs.readFileSync(filePath, 'utf8').split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const separator = line.indexOf('=')
      return separator === -1
        ? [line, '']
        : [line.slice(0, separator), line.slice(separator + 1).replace(/^["']|["']$/g, '')]
    }))
}

function getRuntimeEnv() {
  const files = ['.env', '.env.local', '.env.production.local', '.env.staging.local', '.env.property24.local']
  const fromFiles = files.reduce((merged, file) => ({ ...merged, ...parseEnvFile(path.join(appRoot, file)) }), {})
  return { ...fromFiles, ...Object.fromEntries(Object.entries(process.env).filter(([, value]) => normalizeProperty24Text(value))) }
}

function getHeader(headers = {}, name = '') {
  const entry = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === name.toLowerCase())
  const value = entry?.[1]
  return Array.isArray(value) ? normalizeProperty24Text(value[0]) : normalizeProperty24Text(value)
}

async function readJsonBody(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  const text = chunks.length ? Buffer.concat(chunks).toString('utf8') : ''
  return text.trim() ? JSON.parse(text) : {}
}

function buildResponse(status, body) {
  return {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    body,
  }
}

function hasManageSettingsRole(row = {}) {
  const role = normalizeProperty24Text(row.workspace_role || row.organisation_role || row.organization_role || row.role).toLowerCase()
  const status = normalizeProperty24Text(row.membership_status || row.status).toLowerCase()
  return ['active', 'accepted', 'approved'].includes(status) &&
    ['principal', 'owner', 'admin', 'manager', 'branch_manager', 'agency_principal'].includes(role)
}

async function authenticateRequest({ request, supabase, organisationId } = {}) {
  const authorization = getHeader(request.headers, 'authorization')
  const token = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : ''
  if (!token) return { ok: false, response: buildResponse(401, { error: 'unauthorized', message: 'Sign in before changing a Property24 agent mapping.' }) }
  const userResult = await supabase.auth.getUser(token)
  const user = userResult.data?.user
  if (userResult.error || !user?.id) return { ok: false, response: buildResponse(401, { error: 'unauthorized', message: 'Your session could not be verified.' }) }
  const membership = await supabase
    .from('organisation_users')
    .select('id, user_id, email, role, workspace_role, organisation_role, organization_role, status, membership_status')
    .eq('organisation_id', organisationId)
    .or(`user_id.eq.${user.id},email.eq.${user.email || ''}`)
    .limit(5)
  if (membership.error) throw membership.error
  if (!(membership.data || []).some(hasManageSettingsRole)) {
    return { ok: false, response: buildResponse(403, { error: 'forbidden', message: 'Organisation admin access is required to change Property24 agent mappings.' }) }
  }
  return { ok: true }
}

export default async function handler(request, response) {
  if (request.method === 'OPTIONS') {
    writeNodeJsonResponse(response, { status: 204, headers: { 'Cache-Control': 'no-store' }, body: null })
    return
  }
  if (request.method !== 'PUT') {
    writeNodeJsonResponse(response, buildResponse(405, { error: 'method_not_allowed', message: 'Property24 agent mappings support PUT only.' }))
    return
  }

  try {
    const env = getRuntimeEnv()
    const supabaseUrl = normalizeProperty24Text(env.SUPABASE_URL || env.VITE_SUPABASE_URL)
    const serviceRoleKey = normalizeProperty24Text(env.SUPABASE_SERVICE_ROLE_KEY)
    const missingConfiguration = [
      !supabaseUrl && 'SUPABASE_URL',
      !serviceRoleKey && 'SUPABASE_SERVICE_ROLE_KEY',
    ].filter(Boolean)
    if (missingConfiguration.length) {
      writeNodeJsonResponse(response, buildResponse(503, { error: 'missing_configuration', missingConfiguration }))
      return
    }

    const body = await readJsonBody(request)
    const organisationId = normalizeProperty24Text(body.organisationId)
    if (!organisationId) {
      writeNodeJsonResponse(response, buildResponse(400, { error: 'organisation_id_required', message: 'Organisation ID is required.' }))
      return
    }
    const supabase = createSupabaseClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const auth = await authenticateRequest({ request, supabase, organisationId })
    if (!auth.ok) {
      writeNodeJsonResponse(response, auth.response)
      return
    }
    const connection = await resolveOrganisationProperty24Connection({ supabase, organisationId })
    const profile = await fetchCanonicalProperty24AgentProfile({
      supabase,
      organisationId,
      arch9UserId: body.arch9UserId,
      arch9MembershipId: body.arch9MembershipId,
    })
    const property24AgentId = Number(body.property24AgentId)
    if (!Number.isSafeInteger(property24AgentId) || property24AgentId <= 0) {
      const deactivated = await deactivateCanonicalProperty24AgentMapping({
        supabase,
        organisationId,
        environment: connection.environment,
        agencyId: connection.agencyId,
        arch9UserId: profile.userId,
      })
      writeNodeJsonResponse(response, buildResponse(200, {
        status: deactivated ? 'MAPPING_CLEARED' : 'MAPPING_ALREADY_CLEAR',
        arch9UserId: profile.userId,
      }))
      return
    }

    const property24Runtime = resolveProperty24EnvironmentCredentials({ env, environment: connection.environment })
    if (!property24Runtime.configured) {
      writeNodeJsonResponse(response, buildResponse(503, {
        error: 'property24_environment_credentials_missing',
        missingConfiguration: property24Runtime.missing,
      }))
      return
    }
    const property24 = createProperty24Client({
      baseUrl: property24Runtime.baseUrl,
      username: property24Runtime.username,
      password: property24Runtime.password,
      userGroupId: property24Runtime.userGroupId,
    })
    const snapshot = await property24.fetchAgencyAgents(connection.agencyId)
    const remoteAgent = unwrapProperty24AgentCollection(snapshot.data)
      .find((agent) => extractProperty24AgentId(agent) === property24AgentId) || null
    if (!remoteAgent) {
      writeNodeJsonResponse(response, buildResponse(404, {
        error: 'property24_agent_not_found',
        message: `Property24 agent ${property24AgentId} was not returned for agency ${connection.agencyId}.`,
      }))
      return
    }
    const sourceReference = normalizeProperty24Text(
      body.sourceReference || remoteAgent.sourceReference || remoteAgent.SourceReference,
    )
    const mapping = await persistCanonicalProperty24AgentMapping({
      supabase,
      organisationId,
      environment: connection.environment,
      agencyId: connection.agencyId,
      arch9UserId: profile.userId,
      property24AgentId,
      sourceReference,
      matchType: 'manual',
      confidence: 1,
    })
    writeNodeJsonResponse(response, buildResponse(200, {
      status: 'MAPPING_SAVED',
      mapping: {
        arch9UserId: mapping.arch9_user_id,
        property24AgentId: mapping.property24_agent_id,
        sourceReference: mapping.source_reference,
        matchType: mapping.match_type,
        status: mapping.status,
      },
    }))
  } catch (error) {
    writeNodeJsonResponse(response, buildResponse(Number(error.status || 500), {
      error: error.code || 'property24_agent_mapping_failed',
      message: error.message || 'Property24 agent mapping failed.',
      response: error.responseBody ? summarizeProperty24Payload(error.responseBody) : null,
    }))
  }
}
