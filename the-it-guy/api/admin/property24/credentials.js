import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { saveOrganisationProperty24Credentials } from '../../../server/property24/organisationCredentialService.js'
import { normalizeProperty24Text } from '../../../server/property24/client.js'
import { writeNodeJsonResponse } from '../../../server/services/hqMissionControlApi.js'

const appRoot = fileURLToPath(new URL('../../..', import.meta.url))

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
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

function corsHeaders(request) {
  const origin = getHeader(request.headers, 'origin')
  const permitted = new Set(['https://admin.arch9.co.za', 'http://localhost:5173'])
  return {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    ...(permitted.has(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'OPTIONS, PUT',
  }
}

function response(status, body, request) {
  return { status, headers: corsHeaders(request), body }
}

async function readJsonBody(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  const text = chunks.length ? Buffer.concat(chunks).toString('utf8') : ''
  return text.trim() ? JSON.parse(text) : {}
}

function hasExecutiveAccess(user = {}) {
  const metadata = user.app_metadata || {}
  const values = [metadata.role, metadata.app_role, ...(Array.isArray(metadata.roles) ? metadata.roles : [])]
  return values.some((value) => normalizeProperty24Text(value).toLowerCase().replace(/[\s-]+/g, '_') === 'executive')
}

export default async function handler(request, responseWriter) {
  if (request.method === 'OPTIONS') {
    writeNodeJsonResponse(responseWriter, response(204, null, request))
    return
  }
  if (request.method !== 'PUT') {
    writeNodeJsonResponse(responseWriter, response(405, { error: 'method_not_allowed' }, request))
    return
  }

  try {
    const env = getRuntimeEnv()
    const supabaseUrl = normalizeProperty24Text(env.SUPABASE_URL || env.VITE_SUPABASE_URL)
    const serviceRoleKey = normalizeProperty24Text(env.SUPABASE_SERVICE_ROLE_KEY)
    if (!supabaseUrl || !serviceRoleKey) {
      writeNodeJsonResponse(responseWriter, response(503, { error: 'missing_configuration' }, request))
      return
    }
    const authorization = getHeader(request.headers, 'authorization')
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
    if (!token) {
      writeNodeJsonResponse(responseWriter, response(401, { error: 'unauthorized' }, request))
      return
    }
    const supabase = createSupabaseClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const userResult = await supabase.auth.getUser(token)
    if (userResult.error || !userResult.data?.user?.id) {
      writeNodeJsonResponse(responseWriter, response(401, { error: 'unauthorized' }, request))
      return
    }
    const trustedUser = await supabase.auth.admin.getUserById(userResult.data.user.id)
    if (trustedUser.error || !hasExecutiveAccess(trustedUser.data?.user)) {
      writeNodeJsonResponse(responseWriter, response(403, { error: 'forbidden', message: 'Executive admin access is required.' }, request))
      return
    }

    const body = await readJsonBody(request)
    const result = await saveOrganisationProperty24Credentials({
      supabase,
      organisationId: normalizeProperty24Text(body.organisationId),
      environment: 'production',
      username: normalizeProperty24Text(body.username),
      password: normalizeProperty24Text(body.password),
      userGroupId: normalizeProperty24Text(body.userGroupId),
    })
    writeNodeJsonResponse(responseWriter, response(200, { configured: result.configured, updatedAt: result.updatedAt }, request))
  } catch (error) {
    writeNodeJsonResponse(responseWriter, response(Number(error.status || 500), {
      error: error.code || 'property24_credentials_failed',
      message: error.message || 'Unable to save Property24 credentials.',
    }, request))
  }
}
