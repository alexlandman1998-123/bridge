import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { writeNodeJsonResponse } from '../../../server/services/hqMissionControlApi.js'
import { normalizePrivatePropertyText } from '../../../server/services/privatePropertyClient.js'
import { resolvePrivatePropertyAgencyConfig } from '../../../server/services/privatePropertyAgencyConfigService.js'
import { redactPrivatePropertyAgentMapping, upsertPrivatePropertyAgentMapping } from '../../../server/services/privatePropertyAgentMappingService.js'
import { authenticatePrivatePropertySettingsRequest, getPrivatePropertyHeader, privatePropertySettingsResponse, readPrivatePropertySettingsBody } from '../../../server/private-property/settingsApi.js'

const appRoot = fileURLToPath(new URL('../../..', import.meta.url))

function env() {
  const values = {}
  for (const file of ['.env', '.env.local', '.env.production.local', '.env.private-property.local']) {
    const filePath = path.join(appRoot, file)
    if (!fs.existsSync(filePath)) continue
    for (const line of fs.readFileSync(filePath, 'utf8').split(/\n/)) {
      const index = line.indexOf('=')
      if (index > 0 && !line.trim().startsWith('#')) values[line.slice(0, index).trim()] = line.slice(index + 1).trim().replace(/^["']|["']$/g, '')
    }
  }
  return { ...values, ...process.env }
}

export default async function handler(request, response) {
  if (request.method === 'OPTIONS') return writeNodeJsonResponse(response, { status: 204, headers: { 'Cache-Control': 'no-store' }, body: null })
  return writeNodeJsonResponse(response, privatePropertySettingsResponse(403, {
    error: 'private_property_admin_managed',
    message: 'Private Property agent mappings are managed by Arch9 in the Admin Console.',
  }))
  /* c8 ignore start -- retained temporarily for a safe rollback of the legacy agency workflow. */
  if (!['GET', 'PUT'].includes(request.method)) return writeNodeJsonResponse(response, privatePropertySettingsResponse(405, { error: 'method_not_allowed', message: 'Private Property agent mappings support GET and PUT.' }))
  try {
    const runtime = env()
    const supabaseUrl = normalizePrivatePropertyText(runtime.SUPABASE_URL || runtime.VITE_SUPABASE_URL)
    const serviceRoleKey = normalizePrivatePropertyText(runtime.SUPABASE_SERVICE_ROLE_KEY)
    if (!supabaseUrl || !serviceRoleKey) return writeNodeJsonResponse(response, privatePropertySettingsResponse(503, { error: 'missing_configuration', missingConfiguration: [!supabaseUrl && 'SUPABASE_URL', !serviceRoleKey && 'SUPABASE_SERVICE_ROLE_KEY'].filter(Boolean) }))
    const url = new URL(request.url || '/api/private-property/settings/agent-mappings', `https://${getPrivatePropertyHeader(request.headers, 'host') || 'app.arch9.co.za'}`)
    const body = request.method === 'PUT' ? await readPrivatePropertySettingsBody(request) : {}
    const organisationId = normalizePrivatePropertyText(body.organisationId || url.searchParams.get('organisationId'))
    if (!organisationId) return writeNodeJsonResponse(response, privatePropertySettingsResponse(400, { error: 'organisation_id_required', message: 'Organisation ID is required.' }))
    const supabase = createSupabaseClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const auth = await authenticatePrivatePropertySettingsRequest({ request, supabase, organisationId })
    if (!auth.ok) return writeNodeJsonResponse(response, auth.response)
    const configResolution = await resolvePrivatePropertyAgencyConfig({ client: supabase, organisationId, environment: 'production', allowDisabled: true })
    if (request.method === 'GET') {
      const { data, error } = await supabase.from('private_property_agent_mappings').select('*').eq('organisation_id', organisationId).eq('environment', 'production').order('updated_at', { ascending: false })
      if (error) throw error
      return writeNodeJsonResponse(response, privatePropertySettingsResponse(200, { agencyConfig: configResolution.config, mappings: (data || []).map(redactPrivatePropertyAgentMapping) }))
    }
    if (!configResolution.config?.id) return writeNodeJsonResponse(response, privatePropertySettingsResponse(409, { error: 'private_property_connection_required', message: 'Save the Private Property connection before mapping agents.' }))
    const result = await upsertPrivatePropertyAgentMapping({
      client: supabase,
      agencyConfigId: configResolution.config.id,
      organisationId,
      branchId: body.branchId,
      organisationUserId: body.organisationUserId,
      arch9UserId: body.arch9UserId,
      environment: 'production',
      privatePropertyAgentId: body.privatePropertyAgentId,
      sourceReference: body.sourceReference,
      emailSnapshot: body.emailSnapshot,
      firstNameSnapshot: body.firstNameSnapshot,
      lastNameSnapshot: body.lastNameSnapshot,
      mobileSnapshot: body.mobileSnapshot,
      isDefaultForBranch: body.isDefaultForBranch,
      isDefaultForOrganisation: body.isDefaultForOrganisation,
      matchType: 'manual',
      confidence: 1,
      status: body.status || 'active',
      notes: body.notes,
    })
    return writeNodeJsonResponse(response, privatePropertySettingsResponse(200, result))
  } catch (error) {
    return writeNodeJsonResponse(response, privatePropertySettingsResponse(Number(error.status || 500), { error: error.code || 'private_property_agent_mapping_failed', message: error.message || 'Private Property agent mapping request failed.', missing: error.missing || undefined }))
  }
  /* c8 ignore stop */
}
