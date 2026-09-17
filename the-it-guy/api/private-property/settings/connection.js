import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { writeNodeJsonResponse } from '../../../server/services/hqMissionControlApi.js'
import { normalizePrivatePropertyText } from '../../../server/services/privatePropertyClient.js'
import { resolvePrivatePropertyAgencyConfig, upsertPrivatePropertyAgencyConfig } from '../../../server/services/privatePropertyAgencyConfigService.js'
import { authenticatePrivatePropertySettingsRequest, getPrivatePropertyHeader, privatePropertySettingsResponse, readPrivatePropertySettingsBody } from '../../../server/private-property/settingsApi.js'

const appRoot = fileURLToPath(new URL('../../..', import.meta.url))

function env() {
  const files = ['.env', '.env.local', '.env.production.local', '.env.private-property.local']
  const values = {}
  for (const file of files) {
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
    message: 'Private Property configuration is managed by Arch9 in the Admin Console.',
  }))
  /* c8 ignore start -- retained temporarily for a safe rollback of the legacy agency workflow. */
  if (!['GET', 'PUT'].includes(request.method)) return writeNodeJsonResponse(response, privatePropertySettingsResponse(405, { error: 'method_not_allowed', message: 'Private Property connection supports GET and PUT.' }))
  try {
    const runtime = env()
    const supabaseUrl = normalizePrivatePropertyText(runtime.SUPABASE_URL || runtime.VITE_SUPABASE_URL)
    const serviceRoleKey = normalizePrivatePropertyText(runtime.SUPABASE_SERVICE_ROLE_KEY)
    if (!supabaseUrl || !serviceRoleKey) return writeNodeJsonResponse(response, privatePropertySettingsResponse(503, { error: 'missing_configuration', missingConfiguration: [!supabaseUrl && 'SUPABASE_URL', !serviceRoleKey && 'SUPABASE_SERVICE_ROLE_KEY'].filter(Boolean) }))
    const url = new URL(request.url || '/api/private-property/settings/connection', `https://${getPrivatePropertyHeader(request.headers, 'host') || 'app.arch9.co.za'}`)
    const body = request.method === 'PUT' ? await readPrivatePropertySettingsBody(request) : {}
    if (['username', 'password', 'credential', 'credentials'].some((key) => body[key] !== undefined)) return writeNodeJsonResponse(response, privatePropertySettingsResponse(403, { error: 'private_property_credentials_not_accepted', message: 'Store live credentials in runtime secret storage. This screen accepts secret names only.' }))
    const organisationId = normalizePrivatePropertyText(body.organisationId || url.searchParams.get('organisationId'))
    if (!organisationId) return writeNodeJsonResponse(response, privatePropertySettingsResponse(400, { error: 'organisation_id_required', message: 'Organisation ID is required.' }))
    const supabase = createSupabaseClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const auth = await authenticatePrivatePropertySettingsRequest({ request, supabase, organisationId })
    if (!auth.ok) return writeNodeJsonResponse(response, auth.response)
    if (request.method === 'GET') {
      const result = await resolvePrivatePropertyAgencyConfig({ client: supabase, organisationId, environment: 'production', allowDisabled: true })
      return writeNodeJsonResponse(response, privatePropertySettingsResponse(200, result))
    }
    const existing = await resolvePrivatePropertyAgencyConfig({ client: supabase, organisationId, environment: 'production', allowDisabled: true })
    const metadata = existing?.config?.metadata && typeof existing.config.metadata === 'object' ? existing.config.metadata : {}
    const result = await upsertPrivatePropertyAgencyConfig({
      client: supabase,
      organisationId,
      branchId: body.branchId,
      environment: 'production',
      vendorName: body.vendorName || 'Arch9',
      branchGuid: body.branchGuid,
      usernameSecretName: body.usernameSecretName,
      passwordSecretName: body.passwordSecretName,
      baseUrl: body.baseUrl,
      enabled: false,
      status: 'pending',
      notes: body.notes,
      metadataJson: {
        ...metadata,
        private_property_agency_id: normalizePrivatePropertyText(body.privatePropertyAgencyId),
        private_property_webhook_secret_name: normalizePrivatePropertyText(body.webhookSecretName),
      },
    })
    return writeNodeJsonResponse(response, privatePropertySettingsResponse(200, { ...result, message: 'Connection details saved as pending. Arch9 must verify the mapping before production publishing is enabled.' }))
  } catch (error) {
    return writeNodeJsonResponse(response, privatePropertySettingsResponse(Number(error.status || 500), { error: error.code || 'private_property_connection_failed', message: error.message || 'Private Property connection request failed.', missing: error.missing || undefined }))
  }
  /* c8 ignore stop */
}
