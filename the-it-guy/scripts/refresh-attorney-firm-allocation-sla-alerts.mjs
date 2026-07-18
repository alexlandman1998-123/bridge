import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
if (!url || !serviceRoleKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY and a Supabase URL are required to refresh firm allocation SLA alerts.')
  process.exit(2)
}

const client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
const result = await client.rpc('bridge_refresh_transfer_firm_allocation_sla_alerts')
if (result.error) {
  console.error(`Firm allocation SLA refresh failed: ${result.error.message}`)
  process.exit(1)
}
console.log(JSON.stringify(result.data || {}, null, 2))
