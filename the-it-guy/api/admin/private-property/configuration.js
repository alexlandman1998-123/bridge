import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { writeNodeJsonResponse } from '../../../server/services/hqMissionControlApi.js'
import { normalizePrivatePropertyText } from '../../../server/services/privatePropertyClient.js'
import { resolvePrivatePropertyAgencyConfig, upsertPrivatePropertyAgencyConfig } from '../../../server/services/privatePropertyAgencyConfigService.js'
import { savePrivatePropertyAgencyCredentials } from '../../../server/services/privatePropertyCredentialService.js'

const appRoot = fileURLToPath(new URL('../../..', import.meta.url))
const productionUrl = 'https://services.privateproperty.co.za/AgentImport/AgentImport.asmx'

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
function header(headers = {}, name) { const pair = Object.entries(headers).find(([key]) => key.toLowerCase() === name); return normalizePrivatePropertyText(Array.isArray(pair?.[1]) ? pair[1][0] : pair?.[1]) }
function executive(user = {}) { const meta = user.app_metadata || {}; return [meta.role, meta.app_role, ...(Array.isArray(meta.roles) ? meta.roles : [])].some((role) => normalizePrivatePropertyText(role).toLowerCase().replace(/[\s-]+/g, '_') === 'executive') }
function cors(request) { const origin = header(request.headers, 'origin'); return { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8', ...(new Set(['https://admin.arch9.co.za', 'http://localhost:5173']).has(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}), 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'OPTIONS, GET, PUT' } }
async function body(request) { const chunks = []; for await (const chunk of request) chunks.push(chunk); const value = chunks.length ? Buffer.concat(chunks).toString('utf8') : ''; return value.trim() ? JSON.parse(value) : {} }

async function leadWebhookState(supabase, config, projectUrl) {
  const endpoint = `${projectUrl.replace(/\/+$/, '')}/functions/v1/private-property-webhook`
  if (!config?.id) return { endpoint, agencyId: '', secretConfigured: false, lastReceivedAt: null, failedCount: 0 }
  const [state, latest, failed] = await Promise.all([
    supabase.from('private_property_agency_configs').select('webhook_secret_id').eq('id', config.id).single(),
    supabase.from('private_property_webhook_events').select('received_at,status').eq('organisation_id', config.organisationId).order('received_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('private_property_webhook_events').select('id', { count: 'exact', head: true }).eq('organisation_id', config.organisationId).eq('status', 'failed'),
  ])
  for (const result of [state, latest, failed]) if (result.error) throw result.error
  return { endpoint, agencyId: config.metadata?.private_property_agency_id || '',
    secretConfigured: Boolean(state.data?.webhook_secret_id), lastReceivedAt: latest.data?.received_at || null,
    lastEventStatus: latest.data?.status || null, failedCount: failed.count || 0 }
}

export default async function handler(request, responseWriter) {
  const reply = (status, body) => writeNodeJsonResponse(responseWriter, { status, headers: cors(request), body })
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
    if (request.method === 'GET') {
      const result = await resolvePrivatePropertyAgencyConfig({ client: supabase, organisationId, environment: 'production', allowDisabled: true })
      const credentialState = result.config?.id
        ? await supabase.from('private_property_agency_configs').select('username_secret_id,password_secret_id').eq('id', result.config.id).maybeSingle()
        : { data: null, error: null }
      if (credentialState.error) throw credentialState.error
      const vaultCredentialsConfigured = Boolean(credentialState.data?.username_secret_id && credentialState.data?.password_secret_id)
      return reply(200, { ...result, credentialsConfigured: vaultCredentialsConfigured || Boolean(result.config?.id && result.config.metadata?.credentialsConfigured),
        leadWebhook: await leadWebhookState(supabase, result.config, url) })
    }
    const input = await body(request)
    const existing = await resolvePrivatePropertyAgencyConfig({ client: supabase, organisationId, environment: 'production', allowDisabled: true })
    if (input.action === 'lead_webhook') {
      if (!existing.config?.id) return reply(409, { error: 'private_property_connection_required', message: 'Save the production connection before configuring lead delivery.' })
      const agencyId = normalizePrivatePropertyText(input.agencyId)
      if (!/^\d+$/.test(agencyId)) return reply(400, { error: 'private_property_agency_id_required', message: 'Enter the numeric agency ID from Private Property.' })
      const secret = typeof input.signingSecret === 'string' && input.signingSecret.trim() ? input.signingSecret : null
      const saved = await supabase.rpc('set_private_property_webhook_configuration', {
        p_config_id: existing.config.id, p_agency_id: agencyId, p_secret: secret,
      })
      if (saved.error) return reply(400, { error: 'private_property_webhook_configuration_invalid', message: saved.error.message })
      const refreshed = await resolvePrivatePropertyAgencyConfig({ client: supabase, organisationId, environment: 'production', allowDisabled: true })
      return reply(200, { leadWebhook: await leadWebhookState(supabase, refreshed.config, url),
        message: 'Lead signing configuration saved securely. Complete webhook setup in the Private Property Admin Portal to start delivery.' })
    }
    const connection = await upsertPrivatePropertyAgencyConfig({ client: supabase, organisationId, environment: 'production', branchGuid: input.branchGuid, baseUrl: input.baseUrl || productionUrl, usernameSecretName: 'PRIVATE_PROPERTY_USERNAME', passwordSecretName: 'PRIVATE_PROPERTY_PASSWORD', enabled: false, status: 'pending', metadataJson: { ...(existing.config?.metadata || {}), credentialsConfigured: Boolean(input.username && input.password) || Boolean(existing.config?.metadata?.credentialsConfigured) } })
    let credentials = null
    if (normalizePrivatePropertyText(input.username) || normalizePrivatePropertyText(input.password)) credentials = await savePrivatePropertyAgencyCredentials({ supabase, configId: connection.config.id, username: input.username, password: input.password })
    return reply(200, { ...connection, credentialsConfigured: credentials?.configured || Boolean(existing.config?.metadata?.credentialsConfigured), credentialsUpdatedAt: credentials?.updatedAt || null, message: 'Private Property production connection saved as pending. Publishing remains disabled until Arch9 verifies it.' })
  } catch (error) { return reply(Number(error.status || 500), { error: error.code || 'private_property_configuration_failed', message: error.message || 'Unable to save Private Property configuration.' }) }
}
