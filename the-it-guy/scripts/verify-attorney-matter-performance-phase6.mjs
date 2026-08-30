import assert from 'node:assert/strict'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

const liveMode = process.argv.includes('--live')

if (!liveMode) {
  console.log('Phase 6 is source-verified. Use --live with attorney certification credentials after migrations are deployed.')
  process.exit(0)
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY
const email = process.env.ATTORNEY_DEMO_EMAIL
const password = process.env.ATTORNEY_DEMO_PASSWORD
assert.ok(url && anonKey && email && password, 'SUPABASE_URL, VITE_SUPABASE_ANON_KEY, ATTORNEY_DEMO_EMAIL and ATTORNEY_DEMO_PASSWORD are required')

const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
const login = await client.auth.signInWithPassword({ email, password })
assert.equal(login.error, null, `Attorney sign-in failed: ${login.error?.message || ''}`)

try {
  const { data: memberships, error: membershipsError } = await client
    .from('attorney_firm_members')
    .select('firm_id')
    .eq('user_id', login.data.user.id)
    .eq('status', 'active')
    .limit(1)
  assert.equal(membershipsError, null, `Firm lookup failed: ${membershipsError?.message || ''}`)
  const firmId = memberships?.[0]?.firm_id
  assert.ok(firmId, 'Certification attorney must have an active firm membership')

  const staging = await client.rpc('get_attorney_matter_snapshot_rollout_status', {
    p_attorney_firm_id: firmId,
    p_environment: 'staging',
  })
  assert.equal(staging.error, null, `Staging rollout status failed: ${staging.error?.message || ''}`)
  assert.equal(staging.data?.enabled, true, 'Staging must be enabled for certification')

  const production = await client.rpc('get_attorney_matter_snapshot_rollout_status', {
    p_attorney_firm_id: firmId,
    p_environment: 'production',
  })
  assert.equal(production.error, null, `Production rollout status failed: ${production.error?.message || ''}`)
  assert.equal(production.data?.enabled, false, 'Production must remain disabled until explicit approval')

  const snapshot = await client.rpc('bridge_attorney_matter_list_snapshot', {
    p_attorney_firm_id: firmId,
    p_view: 'all',
    p_page: 1,
    p_page_size: 20,
    p_search: '',
    p_filters: {},
  })
  assert.equal(snapshot.error, null, `Matter snapshot RPC failed: ${snapshot.error?.message || ''}`)
  assert.equal(snapshot.data?.contract, 'arch9-attorney-matter-list-snapshot-v1')
  assert.equal(snapshot.data?.access?.activeMembership, true)
  assert.ok(Array.isArray(snapshot.data?.rows), 'Matter snapshot must return a rows array')

  console.log(JSON.stringify({
    phase: 6,
    status: 'passed',
    staging: staging.data,
    production: production.data,
    returnedRows: snapshot.data.rows.length,
  }, null, 2))
} finally {
  await client.auth.signOut()
}
