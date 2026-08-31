import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createProperty24Client, normalizeProperty24Text, summarizeProperty24Payload } from '../../../server/property24/client.js'
import { resolveProperty24EnvironmentCredentials } from '../../../server/property24/environmentService.js'
import {
  applyProperty24LiveCutoverAction,
  buildProperty24LiveCutoverView,
  fetchProperty24LiveCutoverEvents,
  fetchProperty24LiveCutoverGate,
  fetchProperty24ProductionEvidence,
} from '../../../server/property24/liveCutoverService.js'
import { fetchOrganisationProperty24Connection } from '../../../server/property24/organisationConnectionService.js'
import { runProperty24ReconciliationJob } from '../../../server/property24/reconciliationService.js'
import { createProperty24OrganisationVettingPack } from '../../../server/property24/vettingPackService.js'
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
  return {
    ...fromFiles,
    ...Object.fromEntries(Object.entries(process.env).filter(([, value]) => normalizeProperty24Text(value))),
  }
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

function hasCutoverRole(row = {}) {
  const role = normalizeProperty24Text(row.workspace_role || row.organisation_role || row.organization_role || row.role).toLowerCase()
  const status = normalizeProperty24Text(row.membership_status || row.status).toLowerCase()
  return ['active', 'accepted', 'approved'].includes(status) &&
    ['principal', 'owner', 'admin', 'agency_principal'].includes(role)
}

async function authenticateRequest({ request, supabase, organisationId } = {}) {
  const authorization = getHeader(request.headers, 'authorization')
  const token = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : ''
  if (!token) {
    return { ok: false, response: buildResponse(401, { error: 'unauthorized', message: 'Sign in before managing Property24 production cutover.' }) }
  }
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
  if (!(membership.data || []).some(hasCutoverRole)) {
    return {
      ok: false,
      response: buildResponse(403, {
        error: 'forbidden',
        message: 'Principal or organisation-admin access is required for Property24 production cutover.',
      }),
    }
  }
  return { ok: true, user }
}

function getMissingSupabaseConfiguration(env = {}) {
  const missing = []
  if (!normalizeProperty24Text(env.SUPABASE_URL || env.VITE_SUPABASE_URL)) missing.push('SUPABASE_URL')
  if (!normalizeProperty24Text(env.SUPABASE_SERVICE_ROLE_KEY)) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  return missing
}

function createProperty24FromRuntime(runtime = {}) {
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

function publicRuntimeSummary({ productionRuntime, syndicationEnabled } = {}) {
  return {
    productionCredentialsReady: productionRuntime.configured,
    productionEnvironmentMatches: productionRuntime.environmentMatches,
    productionCredentialSource: productionRuntime.credentialSource,
    missingProductionConfiguration: productionRuntime.missing,
    syndicationEnabled,
  }
}

async function loadCutoverView({ supabase, organisationId, env } = {}) {
  const [gate, productionConnection, events] = await Promise.all([
    fetchProperty24LiveCutoverGate({ supabase, organisationId }),
    fetchOrganisationProperty24Connection({ supabase, organisationId, environment: 'production' }),
    fetchProperty24LiveCutoverEvents({ supabase, organisationId }),
  ])
  const productionRuntime = resolveProperty24EnvironmentCredentials({ env, environment: 'production' })
  const runtime = publicRuntimeSummary({
    productionRuntime,
    syndicationEnabled: normalizeProperty24Text(env.PROPERTY24_SYNDICATION_ENABLED).toLowerCase() === 'true',
  })
  const evidence = await fetchProperty24ProductionEvidence({
    supabase,
    organisationId,
    agencyId: productionConnection.agencyId,
  })
  return {
    gate,
    productionConnection,
    productionRuntime,
    runtime,
    evidence,
    events,
    view: buildProperty24LiveCutoverView({ gate, productionConnection, runtime, evidence, events }),
  }
}

export default async function handler(request, response) {
  if (request.method === 'OPTIONS') {
    writeNodeJsonResponse(response, { status: 204, headers: { 'Cache-Control': 'no-store' }, body: null })
    return
  }
  if (!['GET', 'POST'].includes(request.method)) {
    writeNodeJsonResponse(response, buildResponse(405, {
      error: 'method_not_allowed',
      message: 'Property24 live cutover supports GET and POST.',
    }))
    return
  }

  try {
    const env = getRuntimeEnv()
    const missing = getMissingSupabaseConfiguration(env)
    if (missing.length) {
      writeNodeJsonResponse(response, buildResponse(503, { error: 'missing_configuration', missingConfiguration: missing }))
      return
    }
    const requestUrl = new URL(request.url || '/api/property24/settings/live-cutover', `https://${getHeader(request.headers, 'host') || 'app.arch9.co.za'}`)
    const body = request.method === 'POST' ? await readJsonBody(request) : {}
    const organisationId = normalizeProperty24Text(body.organisationId || requestUrl.searchParams.get('organisationId'))
    if (!organisationId) {
      writeNodeJsonResponse(response, buildResponse(400, { error: 'organisation_id_required', message: 'Organisation ID is required.' }))
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

    let dashboard = await loadCutoverView({ supabase, organisationId, env })
    let actionResult = null
    if (request.method === 'POST') {
      const action = normalizeProperty24Text(body.action).toLowerCase()
      let phase6Pack = null
      let productionCredentialCheck = null
      let reconciliation = null

      if (action === 'approve_exdev') {
        const exdevConnection = await fetchOrganisationProperty24Connection({ supabase, organisationId, environment: 'exdev' })
        if (!exdevConnection.configured || !exdevConnection.enabled) {
          const error = new Error('Enable the ExDev agency connection before approving its vetting evidence.')
          error.code = 'property24_exdev_connection_not_ready'
          error.status = 409
          throw error
        }
        const exdevRuntime = resolveProperty24EnvironmentCredentials({ env, environment: 'exdev' })
        phase6Pack = await createProperty24OrganisationVettingPack({
          supabase,
          property24: createProperty24FromRuntime(exdevRuntime),
          organisationId,
          connection: exdevConnection,
        })
      }

      if (['start_pilot', 'resume_pilot'].includes(action)) {
        const property24 = createProperty24FromRuntime(dashboard.productionRuntime)
        const [echo, agency] = await Promise.all([
          property24.echoAuthenticated('Arch9 Phase 7 production credential check'),
          property24.fetchAgency(dashboard.productionConnection.agencyId),
        ])
        productionCredentialCheck = {
          ok: echo.ok === true && agency.ok === true,
          echoHttpStatus: echo.status,
          agencyHttpStatus: agency.status,
          agencyId: dashboard.productionConnection.agencyId,
        }
      }

      if (action === 'promote_live') {
        const property24 = createProperty24FromRuntime(dashboard.productionRuntime)
        reconciliation = await runProperty24ReconciliationJob({
          supabase,
          property24,
          config: {
            organisationId,
            environment: 'production',
            agencyId: dashboard.productionConnection.agencyId,
            includePortalChecks: true,
            includeLeads: false,
            includeStatistics: false,
            limit: 100,
          },
        })
      }

      actionResult = await applyProperty24LiveCutoverAction({
        supabase,
        organisationId,
        actorUserId: auth.user.id,
        action,
        reason: body.reason,
        phase6Pack,
        productionConnection: dashboard.productionConnection,
        productionCredentialCheck,
        runtime: dashboard.runtime,
        evidence: dashboard.evidence,
        reconciliation,
        pilotListingLimit: body.pilotListingLimit,
      })
      dashboard = await loadCutoverView({ supabase, organisationId, env })
    }

    writeNodeJsonResponse(response, buildResponse(200, {
      route: 'property24SettingsLiveCutover',
      organisationId,
      actionResult,
      cutover: dashboard.view,
    }))
  } catch (error) {
    writeNodeJsonResponse(response, buildResponse(Number(error.status || 500), {
      error: error.code || 'property24_live_cutover_failed',
      message: error.message || 'Property24 live cutover failed.',
      details: error.details || null,
      response: error.responseBody ? summarizeProperty24Payload(error.responseBody) : null,
    }))
  }
}
