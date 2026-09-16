import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { writeNodeJsonResponse } from '../../../server/services/hqMissionControlApi.js'
import { normalizePrivatePropertyText } from '../../../server/services/privatePropertyClient.js'
import { createPrivatePropertyReconciliationReport } from '../../../server/services/privatePropertyReconciliationReportService.js'
import { authenticatePrivatePropertySettingsRequest, getPrivatePropertyHeader, privatePropertySettingsResponse } from '../../../server/private-property/settingsApi.js'

const appRoot = fileURLToPath(new URL('../../..', import.meta.url))
function env() { const values = {}; for (const file of ['.env', '.env.local', '.env.production.local', '.env.private-property.local']) { const target = path.join(appRoot, file); if (!fs.existsSync(target)) continue; for (const line of fs.readFileSync(target, 'utf8').split(/\n/)) { const index = line.indexOf('='); if (index > 0 && !line.trim().startsWith('#')) values[line.slice(0, index).trim()] = line.slice(index + 1).trim().replace(/^["']|["']$/g, '') } } return { ...values, ...process.env } }
export default async function handler(request, response) {
  if (request.method !== 'GET') return writeNodeJsonResponse(response, privatePropertySettingsResponse(405, { error: 'method_not_allowed' }))
  try { const runtime = env(); const url = new URL(request.url || '/', `https://${getPrivatePropertyHeader(request.headers, 'host') || 'app.arch9.co.za'}`); const organisationId = normalizePrivatePropertyText(url.searchParams.get('organisationId')); const supabaseUrl = normalizePrivatePropertyText(runtime.SUPABASE_URL || runtime.VITE_SUPABASE_URL); const serviceRoleKey = normalizePrivatePropertyText(runtime.SUPABASE_SERVICE_ROLE_KEY); if (!organisationId) return writeNodeJsonResponse(response, privatePropertySettingsResponse(400, { error: 'organisation_id_required' })); if (!supabaseUrl || !serviceRoleKey) return writeNodeJsonResponse(response, privatePropertySettingsResponse(503, { error: 'missing_configuration' })); const client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }); const auth = await authenticatePrivatePropertySettingsRequest({ request, supabase: client, organisationId }); if (!auth.ok) return writeNodeJsonResponse(response, auth.response); const report = await createPrivatePropertyReconciliationReport({ client, organisationId }); return writeNodeJsonResponse(response, privatePropertySettingsResponse(report.status === 'ATTENTION_REQUIRED' ? 207 : 200, report)) } catch (error) { return writeNodeJsonResponse(response, privatePropertySettingsResponse(500, { error: 'private_property_reconciliation_failed', message: error.message || 'Unable to reconcile Private Property.' })) }
}
