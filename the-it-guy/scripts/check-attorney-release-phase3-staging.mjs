import { createClient } from '@supabase/supabase-js'
import { inspectAttorneyStagingTarget } from './lib/attorney-staging-safety.mjs'

const text = (value) => String(value || '').trim()
const url = text(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
const serviceKey = text(process.env.SUPABASE_SERVICE_ROLE_KEY)
const blockers = []
let health = null
let fixture = null
const safety = inspectAttorneyStagingTarget({
  supabaseUrl: url,
  expectedProjectRef: process.env.SUPABASE_STAGING_PROJECT_REF,
  productionProjectRef: process.env.VITE_PRODUCTION_SUPABASE_PROJECT_REF,
  environment: 'staging',
})
blockers.push(...safety.blockers)
if (!url || !serviceKey) blockers.push({ code: 'STAGING_ADMIN_CONFIGURATION_MISSING', remedy: 'Configure the staging URL and service role key for the read-only propagation preflight.' })
else if (safety.safe) {
  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const manifest = await client.from('demo_seed_manifests').select('status,expected_records').eq('environment', 'staging').eq('demo_key', 'attorney-demo-full-workflows-v1').maybeSingle()
  fixture = { ready: Boolean(manifest.data && !manifest.error), expectedTransactions: Number(manifest.data?.expected_records?.transactions || 0) }
  if (!fixture.ready) blockers.push({ code: 'ATTORNEY_FIXTURE_MISSING', remedy: 'Seed the deterministic attorney staging matters.' })
  const result = await client.rpc('bridge_transaction_progress_propagation_health_phase6', { p_transaction_id: null, p_stale_seconds: 120 })
  if (result.error) blockers.push({ code: 'PROPAGATION_HEALTH_UNAVAILABLE', remedy: 'Deploy or repair the Phase 6 propagation-health RPC.' })
  else {
    health = result.data || {}
    const gapCount = Number(health.gapCount ?? health.gap_count ?? 0)
    if (gapCount > 0) blockers.push({ code: 'PROPAGATION_GAPS_PRESENT', count: gapCount, remedy: 'Review the propagation audit and run controlled reconciliation before UAT.' })
  }
}

console.log(JSON.stringify({ phase: 3, status: blockers.length ? 'NO_GO' : 'GO', safety: { safe: safety.safe, projectRef: safety.projectRef }, fixture, health: health ? { status: health.status || 'unknown', gapCount: Number(health.gapCount ?? health.gap_count ?? 0) } : null, blockers }, null, 2))
if (blockers.length) process.exitCode = 1
