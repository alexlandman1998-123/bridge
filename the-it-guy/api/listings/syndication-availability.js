import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { writeNodeJsonResponse } from '../../server/services/hqMissionControlApi.js'
import { normalizeProperty24Text } from '../../server/property24/client.js'
import { fetchOrganisationProperty24Connection } from '../../server/property24/organisationConnectionService.js'
import { resolvePrivatePropertyAgencyConfig } from '../../server/services/privatePropertyAgencyConfigService.js'

const appRoot = fileURLToPath(new URL('../..', import.meta.url))

function text(value = '') {
  return String(value || '').trim()
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(fs.readFileSync(filePath, 'utf8').split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const separator = line.indexOf('=')
      return separator === -1 ? [line, ''] : [line.slice(0, separator), line.slice(separator + 1).replace(/^["']|["']$/g, '')]
    }))
}

function runtimeEnv() {
  const files = ['.env', '.env.local', '.env.production.local', '.env.staging.local']
  const fileEnv = files.reduce((values, file) => ({ ...values, ...parseEnvFile(path.join(appRoot, file)) }), {})
  return { ...fileEnv, ...process.env }
}

function getHeader(headers = {}, name = '') {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())
  return text(Array.isArray(entry?.[1]) ? entry[1][0] : entry?.[1])
}

function response(status, body) {
  return { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body }
}

function activeMembership(row = {}) {
  return ['active', 'accepted', 'approved'].includes(text(row.membership_status || row.status).toLowerCase())
}

export default async function handler(request, nodeResponse) {
  if (request.method === 'OPTIONS') return writeNodeJsonResponse(nodeResponse, response(204, null))
  if (request.method !== 'GET') return writeNodeJsonResponse(nodeResponse, response(405, { error: 'method_not_allowed', message: 'Syndication availability supports GET only.' }))

  try {
    const env = runtimeEnv()
    const supabaseUrl = text(env.SUPABASE_URL || env.VITE_SUPABASE_URL)
    const serviceRoleKey = text(env.SUPABASE_SERVICE_ROLE_KEY)
    if (!supabaseUrl || !serviceRoleKey) {
      return writeNodeJsonResponse(nodeResponse, response(503, { error: 'missing_configuration', message: 'Syndication availability is not configured.' }))
    }
    const requestUrl = new URL(request.url || '/api/listings/syndication-availability', `https://${getHeader(request.headers, 'host') || 'app.arch9.co.za'}`)
    const organisationId = text(requestUrl.searchParams.get('organisationId'))
    const token = getHeader(request.headers, 'authorization').replace(/^Bearer\s+/i, '')
    if (!organisationId) return writeNodeJsonResponse(nodeResponse, response(400, { error: 'organisation_id_required', message: 'Organisation ID is required.' }))
    if (!token) return writeNodeJsonResponse(nodeResponse, response(401, { error: 'unauthorized', message: 'Sign in to check publishing destinations.' }))

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const userResult = await supabase.auth.getUser(token)
    const user = userResult.data?.user
    if (userResult.error || !user?.id) return writeNodeJsonResponse(nodeResponse, response(401, { error: 'unauthorized', message: 'Your session could not be verified.' }))
    const membershipResult = await supabase
      .from('organisation_users')
      .select('status, membership_status')
      .eq('organisation_id', organisationId)
      .or(`user_id.eq.${user.id},email.eq.${user.email || ''}`)
      .limit(5)
    if (membershipResult.error) throw membershipResult.error
    if (!(membershipResult.data || []).some(activeMembership)) {
      return writeNodeJsonResponse(nodeResponse, response(403, { error: 'forbidden', message: 'Your account does not have access to this organisation.' }))
    }

    const [property24, privateProperty, websiteSite] = await Promise.all([
      fetchOrganisationProperty24Connection({ supabase, organisationId, environment: 'production' }),
      resolvePrivatePropertyAgencyConfig({ client: supabase, organisationId, environment: 'production' }),
      supabase.from('website_sites').select('id, status').eq('organisation_id', organisationId).maybeSingle(),
    ])
    if (websiteSite.error) throw websiteSite.error
    const websiteDomain = websiteSite.data?.id
      ? await supabase.from('website_domains').select('id').eq('website_site_id', websiteSite.data.id).eq('status', 'active').limit(1)
      : { data: [], error: null }
    if (websiteDomain.error) throw websiteDomain.error

    return writeNodeJsonResponse(nodeResponse, response(200, {
      channels: {
        property24: { available: property24.configured && property24.enabled, reason: property24.configured ? 'connection_disabled' : 'connection_not_configured' },
        private_property: { available: privateProperty.ready, reason: privateProperty.blockers[0] || '' },
        agency_website: { available: websiteSite.data?.status === 'published' && Boolean(websiteDomain.data?.length), reason: websiteSite.data ? 'website_or_domain_not_live' : 'website_not_configured' },
      },
    }))
  } catch (error) {
    writeNodeJsonResponse(nodeResponse, response(Number(error.status || 500), { error: error.code || 'syndication_availability_failed', message: error.message || 'Unable to check publishing destinations.' }))
  }
}
