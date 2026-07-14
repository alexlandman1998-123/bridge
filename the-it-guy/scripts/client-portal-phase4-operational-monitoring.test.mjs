import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const migration = await fs.readFile(
  new URL('../../supabase/migrations/202607140007_seller_portal_operational_monitoring.sql', import.meta.url),
  'utf8',
)
const privateListingService = await fs.readFile(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8')
const listingDetail = await fs.readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')

const diagnosticsFunction = migration.match(
  /create or replace function public\.bridge_private_listing_seller_portal_diagnostics\(p_token text\)[\s\S]*?\n\$\$;/,
)?.[0] || ''

assert.match(migration, /private_listing_seller_portal_security_alerts/, 'Phase 4 needs durable security alerts')
assert.match(migration, /where status = 'open'/, 'only one open alert of a given type should exist')
assert.match(migration, /v_reason = 'temporarily_locked'/, 'a temporary lockout should create an alert')
assert.match(migration, /'resolution', 'successful_authentication'/, 'successful recovery should resolve the lockout alert')
assert.match(diagnosticsFunction, /'failedEvents24h'/, 'diagnostics should summarize recent failures')
assert.match(diagnosticsFunction, /'successfulEvents24h'/, 'diagnostics should summarize recent successful access')
assert.match(diagnosticsFunction, /limit 20/, 'recent event history should remain bounded')
assert.match(diagnosticsFunction, /'invitation'/, 'diagnostics should expose invitation lifecycle state')
assert.match(diagnosticsFunction, /'session'/, 'diagnostics should expose session lifecycle state')
assert.doesNotMatch(diagnosticsFunction, /token_fingerprint/, 'agent diagnostics must not return token fingerprints')
assert.match(migration, /greatest\(30, least\(coalesce\(p_retention_days, 90\), 365\)\)/, 'security history retention must be bounded')
assert.match(migration, /auth\.role\(\) <> 'service_role'/, 'history pruning must be service-role only')
assert.match(privateListingService, /export async function getSellerPortalSecurityDiagnostics/, 'the agent UI needs a diagnostics service boundary')
assert.match(privateListingService, /legacyFallback: true/, 'the diagnostics UI should tolerate frontend-first deployment')
assert.match(listingDetail, /Portal Security/, 'the listing workspace should surface portal security health')
assert.match(listingDetail, /Failures \(24h\)/, 'the listing workspace should surface recent failure volume')
assert.match(listingDetail, /open security alert/, 'the listing workspace should surface open alerts')

console.log('Client portal Phase 4 operational monitoring checks passed.')
