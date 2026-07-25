import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const pipelineSource = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const migration = await readFile(
  new URL('../../supabase/migrations/202607250007_seller_portal_payload_optional_enrichment_guard.sql', import.meta.url),
  'utf8',
)

assert.match(
  pipelineSource,
  /const localFallbackAvailable = isUnsafeFallbackAllowed\(\)[\s\S]*?const snapshot = localFallbackAvailable \? getAgencyPipelineSnapshot\(orgId\) : createEmptyPipelineSnapshot\(orgId\)/,
  'pipeline reload should avoid reading production-blocked local CRM snapshots before remote data loads',
)
assert.match(
  pipelineSource,
  /if \(applyLocalSnapshot && localFallbackAvailable && requestId === reloadRequestRef\.current\)/,
  'pipeline reload should only paint local snapshots when unsafe fallbacks are explicitly enabled',
)
assert.match(pipelineSource, /const PIPELINE_CONTEXT_TIMEOUT_MS = 8000/, 'context loads should not timeout at 3.5s')
assert.match(pipelineSource, /const PIPELINE_RECORDS_TIMEOUT_MS = 10000/, 'private listing and record enrichments should get the same 10s budget as CRM')
assert.match(pipelineSource, /const LEAD_WORKSPACE_HYDRATION_TIMEOUT_MS = 8000/, 'lead workspace hydration should not retry on a 2.5s hair trigger')

assert.match(
  migration,
  /create or replace function public\.bridge_private_listing_seller_portal_payload_phase1\(/,
  'corrective migration should redefine the phase1 seller portal payload used by stable-token wrappers',
)
assert.match(
  migration,
  /bridge_promote_pending_private_listing_documents\(v_listing\.id\)[\s\S]*?exception[\s\S]*?when others then[\s\S]*?null;/,
  'seller portal document promotion should not take down payload reads',
)
for (const assignment of [
  "v_requirements := '[]'::jsonb;",
  "v_documents := '[]'::jsonb;",
  "v_appointments := '[]'::jsonb;",
  "v_mandate_packet := 'null'::jsonb;",
]) {
  assert.ok(migration.includes(assignment), `optional seller portal enrichment should fail closed with ${assignment}`)
}
assert.match(
  migration,
  /when undefined_column or undefined_table then[\s\S]*?v_appointments := '\[\]'::jsonb;/,
  'appointment enrichment should be protected from production schema drift',
)
assert.match(
  migration,
  /revoke all on function public\.bridge_private_listing_seller_portal_payload_phase1\(text, text, boolean\)/,
  'phase1 payload should remain callable only through the guarded public wrapper',
)
assert.match(
  migration,
  /notify pgrst, 'reload schema';/,
  'PostgREST schema cache should be reloaded after redefining the RPC dependency',
)

console.log('pipeline and seller portal stability checks passed')
