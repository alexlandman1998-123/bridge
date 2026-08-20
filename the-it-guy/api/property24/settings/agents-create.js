import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import {
  PROPERTY24_EXDEV_BASE_URL,
  createProperty24Client,
  normalizeProperty24Text,
  summarizeProperty24Payload,
} from '../../../server/property24/client.js'
import { normalizeProperty24Agent } from '../../../server/property24/synchronisationService.js'
import { writeNodeJsonResponse } from '../../../server/services/hqMissionControlApi.js'

const appRoot = fileURLToPath(new URL('../../..', import.meta.url))

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(
    fs
      .readFileSync(filePath, 'utf8')
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
  if (!token) {
    return {
      ok: false,
      response: buildResponse(401, {
        error: 'unauthorized',
        message: 'Sign in before creating a Property24 agent.',
      }),
    }
  }

  const userResult = await supabase.auth.getUser(token)
  const user = userResult.data?.user
  if (userResult.error || !user?.id) {
    return {
      ok: false,
      response: buildResponse(401, {
        error: 'unauthorized',
        message: 'Your session could not be verified.',
      }),
    }
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
        message: 'Organisation admin access is required to create Property24 agents.',
      }),
    }
  }

  return { ok: true, user }
}

function getMissingConfiguration(env = {}) {
  const missing = []
  if (!normalizeProperty24Text(env.SUPABASE_URL || env.VITE_SUPABASE_URL)) missing.push('SUPABASE_URL')
  if (!normalizeProperty24Text(env.SUPABASE_SERVICE_ROLE_KEY)) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (!normalizeProperty24Text(env.PROPERTY24_BASIC_AUTH_USERNAME || env.PROPERTY24_USERNAME)) missing.push('PROPERTY24_BASIC_AUTH_USERNAME')
  if (!normalizeProperty24Text(env.PROPERTY24_BASIC_AUTH_PASSWORD || env.PROPERTY24_PASSWORD)) missing.push('PROPERTY24_BASIC_AUTH_PASSWORD')
  return missing
}

function createProperty24FromEnv(env = {}) {
  return createProperty24Client({
    baseUrl: normalizeProperty24Text(env.PROPERTY24_BASE_URL) || PROPERTY24_EXDEV_BASE_URL,
    username: normalizeProperty24Text(env.PROPERTY24_BASIC_AUTH_USERNAME || env.PROPERTY24_USERNAME),
    password: normalizeProperty24Text(env.PROPERTY24_BASIC_AUTH_PASSWORD || env.PROPERTY24_PASSWORD),
    userGroupId: normalizeProperty24Text(env.PROPERTY24_USER_GROUP_ID),
  })
}

function buildAgentPayload({ body = {}, env = {} } = {}) {
  const agent = body.agent && typeof body.agent === 'object' ? body.agent : {}
  const fullName = normalizeProperty24Text(agent.fullName || agent.name)
  const splitName = fullName.split(/\s+/).filter(Boolean)
  const firstname = normalizeProperty24Text(agent.firstName || splitName[0])
  const lastname = normalizeProperty24Text(agent.lastName || splitName.slice(1).join(' '))
  const payload = {
    firstname,
    lastname,
    receiveStatsMail: false,
    published: true,
    agencyId: Number(body.agencyId || env.PROPERTY24_DEFAULT_AGENCY_ID),
    sourceReference: normalizeProperty24Text(body.sourceReference || agent.sourceReference),
    mobileNumber: normalizeProperty24Text(agent.mobile || agent.phone || agent.phoneNumber),
    emailAddress: normalizeProperty24Text(agent.email),
    countryId: Number(body.countryId || env.PROPERTY24_DEFAULT_COUNTRY_ID || 1),
    status: 'Active',
    jobTitle: normalizeProperty24Text(agent.jobTitle) || 'Agent',
  }

  const missing = []
  if (!payload.firstname) missing.push('agent.firstName')
  if (!payload.lastname) missing.push('agent.lastName')
  if (!payload.emailAddress) missing.push('agent.email')
  if (!payload.mobileNumber) missing.push('agent.mobile')
  if (!payload.sourceReference) missing.push('sourceReference')
  if (!Number.isInteger(payload.agencyId)) missing.push('agencyId')
  if (!Number.isInteger(payload.countryId)) missing.push('countryId')

  return { payload, missing }
}

export default async function handler(request, response) {
  if (request.method === 'OPTIONS') {
    writeNodeJsonResponse(response, { status: 204, headers: { 'Cache-Control': 'no-store' }, body: null })
    return
  }

  if (request.method !== 'POST') {
    writeNodeJsonResponse(response, buildResponse(405, {
      error: 'method_not_allowed',
      message: 'Property24 agent creation only supports POST.',
    }))
    return
  }

  try {
    const env = getRuntimeEnv()
    const missingConfig = getMissingConfiguration(env)
    if (missingConfig.length) {
      writeNodeJsonResponse(response, buildResponse(503, {
        error: 'missing_configuration',
        missingConfiguration: missingConfig,
      }))
      return
    }

    const body = await readJsonBody(request)
    const organisationId = normalizeProperty24Text(body.organisationId)
    if (!organisationId) {
      writeNodeJsonResponse(response, buildResponse(400, {
        error: 'missing_configuration',
        missingConfiguration: ['organisationId'],
      }))
      return
    }

    const { payload, missing } = buildAgentPayload({ body, env })
    if (missing.length) {
      writeNodeJsonResponse(response, buildResponse(400, {
        error: 'missing_agent_fields',
        missingFields: missing,
      }))
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

    const property24 = createProperty24FromEnv(env)
    const result = await property24.createAgent(payload)
    const agent = normalizeProperty24Agent({
      ...payload,
      id: result.data,
      agentId: result.data,
      emailAddress: payload.emailAddress,
      mobileNumber: payload.mobileNumber,
    })

    writeNodeJsonResponse(response, buildResponse(200, {
      status: 'CREATED',
      httpStatus: result.status,
      property24AgentId: normalizeProperty24Text(result.data),
      agent,
      response: summarizeProperty24Payload(result.data),
      payload: {
        agencyId: payload.agencyId,
        countryId: payload.countryId,
        firstname: payload.firstname,
        lastname: payload.lastname,
        emailAddress: payload.emailAddress,
        mobileNumber: payload.mobileNumber,
        sourceReference: payload.sourceReference,
        status: payload.status,
      },
    }))
  } catch (error) {
    writeNodeJsonResponse(response, buildResponse(Number(error.status || 500), {
      error: error.code || 'property24_agent_create_failed',
      message: error.message || 'Property24 agent creation failed.',
      httpStatus: error.status || null,
      response: error.responseBody ? summarizeProperty24Payload(error.responseBody) : null,
    }))
  }
}
