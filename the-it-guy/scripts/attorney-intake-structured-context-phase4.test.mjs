import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const page = await readFile(new URL('../src/pages/AttorneyPublicIntakePage.jsx', import.meta.url), 'utf8')
const edge = await readFile(new URL('../../supabase/functions/attorney-public-intake/index.ts', import.meta.url), 'utf8')
const migration = await readFile(new URL('../../supabase/migrations/202607160025_attorney_intake_structured_context_phase4.sql', import.meta.url), 'utf8')

for (const field of [
  'journey_key', 'practice_key', 'goal', 'matter_stage', 'finance_type', 'bank_name',
  'existing_bond', 'cancellation_reason', 'cancellation_notice', 'timing', 'preferred_contact',
]) {
  assert.ok(page.includes(field), `public form should submit ${field}`)
  assert.ok(edge.includes(field), `Edge Function should allowlist ${field}`)
}

assert.match(page, /intake_context:\s*buildIntakeContext/)
assert.match(edge, /sanitizeIntakeContext\(payload\.intake_context\)/)
assert.match(edge, /p_request_metadata:\s*\{ \.\.\.requestMetadata\(req\), intake_context: intakeContext \}/)
assert.match(migration, /bridge_sanitize_attorney_intake_context/)
assert.match(migration, /trg_enrich_attorney_lead_intake_context/)
assert.match(migration, /attorney_intake_context_json/)
assert.match(migration, /trg_sync_attorney_intake_context_to_transaction_insert/)
assert.match(migration, /bridge_derive_attorney_lane_keys/)

for (const expected of [
  "return array['bond']::text[]",
  "return array['cancellation']::text[]",
  "v_lanes := array['transfer']::text[]",
  "array_append(v_lanes, 'bond')",
  "array_append(v_lanes, 'cancellation')",
]) assert.ok(migration.includes(expected), `lane matrix should include ${expected}`)

assert.match(migration, /bridge_attorney_workflow_step_templates_v1/)
assert.match(migration, /on conflict \(transaction_id, process_type\) do nothing/)
assert.match(migration, /seededStepCount/)

console.log('attorney intake structured context Phase 4 tests passed')
