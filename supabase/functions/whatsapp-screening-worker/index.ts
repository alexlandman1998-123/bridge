import { createClient } from 'npm:@supabase/supabase-js@2.49.9'
import { credentialSet, supabaseServiceKey } from '../_shared/apiCredentials.ts'
import { authorizeCampaignWorker } from '../whatsapp-campaign-worker/authorization.js'
import { campaignMeta } from '../_shared/whatsappCampaignMeta.ts'
import { createScreeningWorker } from './worker.js'

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
Deno.serve(async request => {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' })
  let credentials: ReturnType<typeof credentialSet>
  try { credentials = credentialSet() } catch { return json(503, { error: 'Worker configuration is incomplete.' }) }
  if (!await authorizeCampaignWorker(request, { legacy: credentials.allowLegacy ? credentials.legacyService : '', secrets: credentials.secrets })) return json(401, { error: 'Worker authorization required.' })
  const key = supabaseServiceKey(), url = Deno.env.get('SUPABASE_URL')
  if (!key || !url) return json(503, { error: 'Worker configuration is incomplete.' })
  try {
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    return json(200, await createScreeningWorker({ db, meta: campaignMeta })())
  } catch { return json(500, { error: 'Screening worker failed. Saved work will remain available for review.' }) }
})
