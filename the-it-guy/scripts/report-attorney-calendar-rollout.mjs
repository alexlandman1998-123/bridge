import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

const requestedEnvironment = process.argv.includes('--production') ? 'production' : 'staging'
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceRoleKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')

const client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
const { data, error } = await client.rpc('attorney_calendar_rollout_health', {
  p_environment: requestedEnvironment,
  p_since: new Date(Date.now() - (24 * 60 * 60 * 1000)).toISOString(),
})
if (error) throw error
console.log(JSON.stringify(data, null, 2))
if (data?.rollbackRecommended) process.exitCode = 2
