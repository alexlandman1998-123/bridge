import { createClient } from 'supabase'
import { createCampaignHandler } from './handler.js'
import { campaignMeta } from '../_shared/whatsappCampaignMeta.ts'

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' }
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed.' }), { status: 405, headers })
  try {
    const url = Deno.env.get('SUPABASE_URL') || ''
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const anon = Deno.env.get('SUPABASE_ANON_KEY') || ''
    if (!url || !key || !anon) throw new Error('WhatsApp server configuration is incomplete.')
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    const handler = createCampaignHandler({
      db,
      authorize: async (authorization: string, org: string) => {
        const token = (authorization || '').replace(/^Bearer\s+/i, '')
        if (!token || token === key) return null
        const { data, error } = await db.auth.getUser(token)
        if (error || !data.user) return null
        const userDb = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } })
        const member = await userDb.rpc('bridge_is_active_member', { target_org: org })
        return !member.error && member.data === true ? {userId:data.user.id,userDb} : null
      },
      meta: campaignMeta,
    })
    const raw = await req.text()
    if (raw.length > 1000000) throw new Error('Campaign request is too large.')
    return new Response(JSON.stringify(await handler(JSON.parse(raw), req.headers.get('authorization') || '')), { headers })
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'WhatsApp campaign request failed.' }), { status: 400, headers })
  }
})
