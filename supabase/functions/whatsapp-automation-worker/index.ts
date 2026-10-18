import { createClient } from 'npm:@supabase/supabase-js@2.49.9'
import { campaignMeta } from '../_shared/whatsappCampaignMeta.ts'
import { authorizeCampaignWorker } from '../whatsapp-campaign-worker/authorization.js'
import { createAutomationWorker } from './worker.js'

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' })
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const url = Deno.env.get('SUPABASE_URL') || ''
  let secrets: string[] = []
  try {
    const configured = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}')
    if (configured && typeof configured === 'object' && !Array.isArray(configured)) secrets = Object.values(configured).filter((v): v is string => typeof v === 'string' && v.startsWith('sb_secret_'))
  } catch { /* Unknown credentials never authorize a request. */ }
  if (!await authorizeCampaignWorker(req, { legacy: key, secrets })) return json(401, { error: 'Worker authorization required.' })
  if (!key || !url) return json(503, { error: 'Worker configuration is incomplete.' })
  try {
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    return json(200, await createAutomationWorker({ db, meta: campaignMeta })())
  } catch {
    // Do not return provider credentials or database internals to the caller.
    return json(500, { error: 'WhatsApp automation worker failed.' })
  }
})
