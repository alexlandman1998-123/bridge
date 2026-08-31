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
import { normalizeProperty24Agent } from '../../../server/property24/synchronisationService.js'
import { fetchCanonicalProperty24AgentProfile } from '../../../server/property24/agentProfileService.js'
import {
  findMatchingProperty24Agent,
  prepareProperty24AgentPhotoUrl,
} from '../../../server/property24/agentPhotoService.js'
import { syndicateCanonicalProperty24AgentProfile } from '../../../server/property24/agentProfileSyndicationService.js'
import { persistCanonicalProperty24AgentMapping } from '../../../server/property24/agentMappingService.js'
import { resolveOrganisationProperty24Connection } from '../../../server/property24/organisationConnectionService.js'
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
  return missing
}

function createProperty24FromEnv(env = {}, environment = 'exdev') {
  const runtime = resolveProperty24EnvironmentCredentials({ env, environment })
  if (!runtime.configured) {
    const error = new Error(`Property24 ${runtime.environment} credentials are incomplete: ${runtime.missing.join(', ')}.`)
    error.code = 'property24_environment_credentials_missing'
    error.status = 503
    throw error
  }
  return createProperty24Client({
    baseUrl: runtime.baseUrl,
    username: runtime.username,
    password: runtime.password,
    userGroupId: runtime.userGroupId,
  })
}

function normalizeAgentMobile(value = '') {
  return normalizeProperty24Text(value).replace(/[\s()-]/g, '')
}

function isValidAgentEmail(value = '') {
  const email = normalizeProperty24Text(value).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return false
  return !email.endsWith('.test')
}

function isValidAgentMobile(value = '') {
  const mobile = normalizeProperty24Text(value)
  return /^\+?\d{10,15}$/.test(mobile)
}

export function buildProperty24AgentPayloadFromCanonicalProfile({ profile = {}, body = {}, connection = {}, env = {} } = {}) {
  const fullName = normalizeProperty24Text(profile.fullName)
  const splitName = fullName.split(/\s+/).filter(Boolean)
  const firstname = normalizeProperty24Text(profile.firstName || splitName[0])
  const lastname = normalizeProperty24Text(profile.lastName || splitName.slice(1).join(' '))
  const payload = {
    firstname,
    lastname,
    receiveStatsMail: false,
    published: true,
    agencyId: Number(connection.agencyId),
    sourceReference: normalizeProperty24Text(body.sourceReference),
    mobileNumber: normalizeAgentMobile(profile.phone),
    emailAddress: normalizeProperty24Text(profile.email),
    countryId: Number(body.countryId || env.PROPERTY24_DEFAULT_COUNTRY_ID || 1),
    status: 'Active',
    jobTitle: normalizeProperty24Text(profile.jobTitle) || 'Agent',
  }

  const missing = []
  if (!payload.firstname) missing.push('profile.firstName')
  if (!payload.lastname) missing.push('profile.lastName')
  if (!payload.emailAddress) missing.push('profile.email')
  if (!payload.mobileNumber) missing.push('profile.phone')
  if (!normalizeProperty24Text(profile.avatarUrl)) missing.push('profile.avatarUrl')
  if (!payload.sourceReference) missing.push('sourceReference')
  if (!Number.isInteger(payload.agencyId)) missing.push('agencyId')
  if (!Number.isInteger(payload.countryId)) missing.push('countryId')

  const invalid = []
  if (payload.emailAddress && !isValidAgentEmail(payload.emailAddress)) invalid.push('profile.email')
  if (payload.mobileNumber && !isValidAgentMobile(payload.mobileNumber)) invalid.push('profile.phone')

  return { payload, missing, invalid }
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

    const supabase = createSupabaseClient(env.SUPABASE_URL || env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const auth = await authenticateRequest({ request, supabase, organisationId })
    if (!auth.ok) {
      writeNodeJsonResponse(response, auth.response)
      return
    }

    const connection = await resolveOrganisationProperty24Connection({
      supabase,
      organisationId,
      requestedAgencyId: body.agencyId,
    })
    const canonicalProfile = await fetchCanonicalProperty24AgentProfile({
      supabase,
      organisationId,
      arch9UserId: body.arch9UserId,
      arch9MembershipId: body.arch9MembershipId,
    })
    const { payload, missing, invalid } = buildProperty24AgentPayloadFromCanonicalProfile({ profile: canonicalProfile, body, connection, env })
    if (missing.length) {
      writeNodeJsonResponse(response, buildResponse(400, {
        error: 'missing_agent_fields',
        missingFields: missing,
        message: 'Complete the missing fields on the Arch9 agent profile, then try again.',
      }))
      return
    }
    if (invalid.length) {
      writeNodeJsonResponse(response, buildResponse(400, {
        error: 'invalid_agent_fields',
        invalidFields: invalid,
        message: 'Update the Arch9 agent profile with a real email address and a mobile number containing 10 to 15 digits.',
      }))
      return
    }

    const preparedPhoto = await prepareProperty24AgentPhotoUrl(canonicalProfile.avatarUrl, {
      allowedOrigins: [
        env.SUPABASE_URL || env.VITE_SUPABASE_URL,
        env.PROPERTY24_AGENT_PHOTO_ALLOWED_ORIGINS,
      ],
      allowInsecureHttp: normalizeProperty24Text(env.PROPERTY24_AGENT_PHOTO_ALLOW_HTTP).toLowerCase() === 'true',
    })
    const property24 = createProperty24FromEnv(env, connection.environment)
    const beforeSnapshot = await property24.fetchAgencyAgents(connection.agencyId)
    const existingAgent = findMatchingProperty24Agent(beforeSnapshot.data, payload)
    const syndication = await syndicateCanonicalProperty24AgentProfile({
      property24,
      profile: canonicalProfile,
      preparedPhoto,
      agencyId: connection.agencyId,
      sourceReference: payload.sourceReference,
      countryId: payload.countryId,
      remoteAgent: existingAgent,
    })
    const generatedAt = new Date().toISOString()
    const warnings = [...syndication.warnings]
    try {
      await persistCanonicalProperty24AgentMapping({
        supabase,
        organisationId,
        environment: connection.environment,
        agencyId: connection.agencyId,
        arch9UserId: canonicalProfile.userId,
        property24AgentId: syndication.property24AgentId,
        sourceReference: payload.sourceReference,
        matchType: existingAgent ? 'source_reference' : 'manual',
        confidence: 1,
        lastSeenAt: generatedAt,
      })
    } catch (mappingError) {
      warnings.push({ code: mappingError.code || 'property24_agent_mapping_write_failed', message: mappingError.message })
    }
    const accountUpdate = await supabase
      .from('property24_accounts')
      .update({ last_agent_sync_at: generatedAt })
      .eq('organisation_id', organisationId)
      .eq('environment', connection.environment)
      .eq('agency_id', Number(connection.agencyId))
    if (accountUpdate.error) {
      warnings.push({ code: 'property24_account_sync_timestamp_failed', message: accountUpdate.error.message })
    }
    const agent = normalizeProperty24Agent({
      ...payload,
      id: syndication.property24AgentId,
      agentId: syndication.property24AgentId,
      emailAddress: payload.emailAddress,
      mobileNumber: payload.mobileNumber,
    })

    writeNodeJsonResponse(response, buildResponse(warnings.length ? 207 : 200, {
      status: syndication.status,
      generatedAt,
      httpStatus: syndication.profileHttpStatus,
      property24AgentId: normalizeProperty24Text(syndication.property24AgentId),
      agent,
      canonicalProfile: {
        arch9UserId: canonicalProfile.userId,
        arch9MembershipId: canonicalProfile.membershipId,
        avatarReady: true,
        source: 'arch9_profile',
      },
      profileSync: {
        action: syndication.action,
        profileUpdated: syndication.profileUpdated,
        photoUploaded: syndication.photoUploaded,
        photo: syndication.photo,
      },
      response: summarizeProperty24Payload({ agentId: syndication.property24AgentId, status: syndication.status }),
      warnings,
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
      missingFields: error.missingFields || null,
      invalidFields: error.invalidFields || null,
      httpStatus: error.status || null,
      response: error.responseBody ? summarizeProperty24Payload(error.responseBody) : null,
    }))
  }
}
