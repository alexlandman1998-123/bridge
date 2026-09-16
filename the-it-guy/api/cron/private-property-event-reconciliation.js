import { createClient } from '@supabase/supabase-js'
import { runPrivatePropertyEventReconciliation } from '../../server/services/privatePropertyEventReconciliationService.js'
import { runPrivatePropertyShowdayProjection } from '../../server/services/privatePropertyShowdayProjectionService.js'

export const config = { maxDuration: 60 }

function json(response, status, body) { response.statusCode = status; response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(body)) }

export default async function handler(request, response) {
  if (request.method !== 'GET') return json(response, 405, { error: 'Method not allowed.' })
  const cronSecret = String(process.env.CRON_SECRET || '').trim()
  if (!cronSecret || String(request.headers.authorization || '').trim() !== `Bearer ${cronSecret}`) return json(response, 401, { error: 'Unauthorized.' })
  const supabaseUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!supabaseUrl || !serviceRoleKey) return json(response, 503, { error: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.' })
  try {
    const client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const [report, showdays] = await Promise.all([runPrivatePropertyEventReconciliation({ client }), runPrivatePropertyShowdayProjection({ client })])
    const status = report.status === 'ATTENTION_REQUIRED' || showdays.status === 'ATTENTION_REQUIRED' ? 'ATTENTION_REQUIRED' : 'COMPLETE'
    return json(response, status === 'ATTENTION_REQUIRED' ? 207 : 200, { ...report, status, showdays })
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', route: '/api/cron/private-property-event-reconciliation', error: error.message || 'unknown_error' }))
    return json(response, 502, { error: 'Private Property event reconciliation failed.' })
  }
}
