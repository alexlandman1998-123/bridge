import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [report, externalIsolation, inlinePolicy] = await Promise.all([
  readFile(new URL('../docs/outstanding-migrations-phase-4-schema-drift-resolution.md', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/202607090006_private_listing_external_isolation.sql', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/202607130005_private_listing_inline_select_policy.sql', import.meta.url), 'utf8'),
])

assert.match(externalIsolation, /select policyname[\s\S]+drop policy if exists/)
assert.match(externalIsolation, /private_listings_delete_owner_or_admin/)
assert.match(inlinePolicy, /private_listings_select_scoped/)
assert.match(inlinePolicy, /bridge_support_can_access_record/)

assert.match(report, /historically applied and intentionally superseded/)
assert.match(report, /exactly these current policies/)
assert.match(report, /Public-schema fingerprints before and after repair were identical/)
assert.match(report, /only genuine unresolved migration/)
assert.match(report, /PHASE_4_COMPLETE_SUPERSEDED_POLICY_MODEL_VERIFIED/)

console.log('outstanding migrations Phase 4 schema-drift tests passed')
