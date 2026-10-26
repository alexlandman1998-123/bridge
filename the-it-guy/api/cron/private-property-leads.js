import { createClient } from '@supabase/supabase-js'
import { runPrivatePropertyLeadSync } from '../../server/services/privatePropertyLeadSyncService.js'

export const config = { maxDuration: 300 }

export default async function handler(request, response) {
  const reply = (status, body) => { response.statusCode = status; response.setHeader('Content-Type', 'application/json'); response.setHeader('Cache-Control', 'no-store'); response.end(JSON.stringify(body)) }
  if (request.method !== 'GET') return reply(405, { error: 'method_not_allowed' })
  if (!process.env.CRON_SECRET || request.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return reply(401, { error: 'unauthorized' })
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !secret) return reply(503, { error: 'storage_not_configured' })
  try {
    const report = await runPrivatePropertyLeadSync({ client: createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } }), apply: true })
    return reply(report.status === 'COMPLETE' ? 200 : 503, report)
  } catch { return reply(502, { error: 'private_property_lead_sync_failed' }) }
}
