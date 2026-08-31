import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { normalizeProperty24Text } from '../../../server/property24/client.js'
import {
  fetchOrganisationProperty24Connection,
  upsertOrganisationProperty24Connection,
} from '../../../server/property24/organisationConnectionService.js'
import { writeNodeJsonResponse } from '../../../server/services/hqMissionControlApi.js'

const appRoot = fileURLToPath(new URL('../../..', import.meta.url))

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(fs.readFileSync(filePath, 'utf8').split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const separator = line.indexOf('=')
      if (separator === -1) return [line, '']
      return [line.slice(0, separator), line.slice(separator + 1).replace(/^["']|["']$/g, '')]
    }))
}

function getRuntimeEnv() {
  const files = ['.env', '.env.local', '.env.production.local', '.env.staging.local']
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
  if (!token) return { ok: false, response: buildResponse(401, { error: 'unauthorized', message: 'Sign in before managing Property24.' }) }
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
    return { ok: false, response: buildResponse(403, { error: 'forbidden', message: 'Organisation admin access is required to manage Property24.' }) }
  }
  return { ok: true, user }
}

export default async function handler(request, response) {
  if (request.method === 'OPTIONS') {
    writeNodeJsonResponse(response, { status: 204, headers: { 'Cache-Control': 'no-store' }, body: null })
    return
  }
  if (!['GET', 'PUT'].includes(request.method)) {
    writeNodeJsonResponse(response, buildResponse(405, { error: 'method_not_allowed', message: 'Property24 connection supports GET and PUT.' }))
    return
  }

  try {
    const env = getRuntimeEnv()
    const supabaseUrl = normalizeProperty24Text(env.SUPABASE_URL || env.VITE_SUPABASE_URL)
    const serviceRoleKey = normalizeProperty24Text(env.SUPABASE_SERVICE_ROLE_KEY)
    if (!supabaseUrl || !serviceRoleKey) {
      writeNodeJsonResponse(response, buildResponse(503, { error: 'missing_configuration', missingConfiguration: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter((key) => key === 'SUPABASE_URL' ? !supabaseUrl : !serviceRoleKey) }))
      return
    }

    const requestUrl = new URL(request.url || '/api/property24/settings/connection', `https://${getHeader(request.headers, 'host') || 'app.arch9.co.za'}`)
    const body = request.method === 'PUT' ? await readJsonBody(request) : {}
    const organisationId = normalizeProperty24Text(body.organisationId || requestUrl.searchParams.get('organisationId'))
    const environment = normalizeProperty24Text(body.environment || requestUrl.searchParams.get('environment'))
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

    const connection = request.method === 'PUT'
      ? await upsertOrganisationProperty24Connection({
          supabase,
          organisationId,
          agencyId: body.agencyId,
          environment,
          enabled: body.enabled,
        })
      : await fetchOrganisationProperty24Connection({ supabase, organisationId, environment })
    writeNodeJsonResponse(response, buildResponse(200, { connection }))
  } catch (error) {
    writeNodeJsonResponse(response, buildResponse(Number(error.status || 500), {
      error: error.code || 'property24_connection_failed',
      message: error.message || 'Property24 connection request failed.',
    }))
  }
}

