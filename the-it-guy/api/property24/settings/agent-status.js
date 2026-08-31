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
import { syncCanonicalProperty24AgentLifecycle } from '../../../server/property24/agentLifecycleService.js'
import { fetchOrganisationProperty24Connection } from '../../../server/property24/organisationConnectionService.js'
import { writeNodeJsonResponse } from '../../../server/services/hqMissionControlApi.js'

const appRoot = fileURLToPath(new URL('../../..', import.meta.url))

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
      .split(/\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=')
        if (separator === -1) return [line, '']
        return [line.slice(0, separator), line.slice(separator + 1).replace(/^["']|["']$/g, '')]
      }),
  )
}

function getRuntimeEnv() {
  const files = ['.env', '.env.local', '.env.production.local', '.env.staging.local', '.env.property24.local']
  const fromFiles = files.reduce((merged, file) => ({ ...merged, ...parseEnvFile(path.join(appRoot, file)) }), {})
  const processOverrides = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => normalizeProperty24Text(value)),
  )
  return { ...fromFiles, ...processOverrides }
}

function getHeader(headers = {}, name = '') {
  const target = name.toLowerCase()
  const entry = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === target)
  const value = entry?.[1]
  return Array.isArray(value) ? normalizeProperty24Text(value[0]) : normalizeProperty24Text(value)
}

async function readJsonBody(request) {
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

function buildResponse(status, body) {
  return {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
    body,
  }
}

function hasManageSettingsRole(row = {}) {
  const role = normalizeProperty24Text(row.workspace_role || row.organisation_role || row.organization_role || row.role).toLowerCase()
  const status = normalizeProperty24Text(row.membership_status || row.status).toLowerCase()
  if (!['active', 'accepted', 'approved'].includes(status)) return false
  return ['principal', 'owner', 'admin', 'manager', 'branch_manager', 'agency_principal'].includes(role)
}

async function authenticateRequest({ request, supabase, organisationId } = {}) {
  const authorization = getHeader(request.headers, 'authorization')
  const token = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : ''
  if (!token) return { ok: false, response: buildResponse(401, { error: 'unauthorized', message: 'Sign in before changing an agent status.' }) }

  const userResult = await supabase.auth.getUser(token)
  const user = userResult.data?.user
  if (userResult.error || !user?.id) {
    return { ok: false, response: buildResponse(401, { error: 'unauthorized', message: 'Your session could not be verified.' }) }
  }

  const membership = await supabase
    .from('organisation_users')
    .select('id, user_id, email, role, workspace_role, organisation_role, organization_role, status, membership_status')
    .eq('organisation_id', organisationId)
    .or(`user_id.eq.${user.id},email.eq.${user.email || ''}`)
    .limit(5)
  if (membership.error) throw membership.error
  if (!(membership.data || []).some(hasManageSettingsRole)) {
    return {
      ok: false,
      response: buildResponse(403, {
        error: 'forbidden',
        message: 'Organisation admin access is required to change Property24 agent status.',
      }),
    }
  }
  return { ok: true, user }
}

export default async function handler(request, response) {
  if (request.method === 'OPTIONS') {
    writeNodeJsonResponse(response, { status: 204, headers: { 'Cache-Control': 'no-store' }, body: null })
    return
  }
  if (request.method !== 'POST') {
    writeNodeJsonResponse(response, buildResponse(405, {
      error: 'method_not_allowed',
      message: 'Property24 agent status only supports POST.',
    }))
    return
  }

  try {
    const env = getRuntimeEnv()
    const body = await readJsonBody(request)
    const organisationId = normalizeProperty24Text(body.organisationId)
    const arch9UserId = normalizeProperty24Text(body.arch9UserId)
    const targetStatus = normalizeProperty24Text(body.status).toLowerCase()
    const missing = []
    if (!normalizeProperty24Text(env.SUPABASE_URL || env.VITE_SUPABASE_URL)) missing.push('SUPABASE_URL')
    if (!normalizeProperty24Text(env.SUPABASE_SERVICE_ROLE_KEY)) missing.push('SUPABASE_SERVICE_ROLE_KEY')
    if (!organisationId) missing.push('organisationId')
    if (!arch9UserId) missing.push('arch9UserId')
    if (!['active', 'inactive'].includes(targetStatus)) missing.push('status=active|inactive')
    if (missing.length) {
      writeNodeJsonResponse(response, buildResponse(400, { error: 'missing_configuration', missingConfiguration: missing }))
      return
    }

    const supabase = createSupabaseClient(env.SUPABASE_URL || env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const auth = await authenticateRequest({ request, supabase, organisationId })
    if (!auth.ok) {
      writeNodeJsonResponse(response, auth.response)
      return
    }

    const connection = await fetchOrganisationProperty24Connection({ supabase, organisationId })
    if (!connection.configured) {
      writeNodeJsonResponse(response, buildResponse(200, {
        status: 'SKIPPED_NOT_CONFIGURED',
        changed: false,
        organisationId,
        arch9UserId,
        targetStatus,
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
    const result = await syncCanonicalProperty24AgentLifecycle({
      supabase,
      property24,
      organisationId,
      environment: connection.environment,
      agencyId: connection.agencyId,
      arch9UserId,
      targetStatus,
    })
    writeNodeJsonResponse(response, buildResponse(200, result))
  } catch (error) {
    writeNodeJsonResponse(response, buildResponse(Number(error.status || 500), {
      error: error.code || 'property24_agent_status_failed',
      message: error.message || 'Property24 agent status update failed.',
      httpStatus: error.status || null,
      response: error.responseBody ? summarizeProperty24Payload(error.responseBody) : null,
    }))
  }
}
