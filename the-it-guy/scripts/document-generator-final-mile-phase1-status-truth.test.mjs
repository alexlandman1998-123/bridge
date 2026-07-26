import assert from 'node:assert/strict'
import fs from 'node:fs'

const migrationPath = '../supabase/migrations/202607260001_corrective_final_completion_status_truth.sql'
const migration = fs.readFileSync(migrationPath, 'utf8')
const audit = fs.readFileSync('docs/audits/document-generator-final-mile-phase-1.md', 'utf8')

assert.match(migration, /create or replace function public\.bridge_get_final_completion_status_f5/)
assert.match(migration, /v_artifact_ready boolean := false/)
assert.match(migration, /v_transaction_ready boolean := false/)
assert.match(migration, /v_surface_ready boolean := false/)
assert.match(migration, /v_delivery_ready boolean := false/)

assert.match(
  migration,
  /v_ready := v_artifact_ready\s+and v_transaction_ready\s+and v_surface_ready\s+and v_delivery_ready;/,
  'ready must require artifact, transaction, surface, and delivery truth.',
)

assert.match(
  migration,
  /when not v_delivery_ready then 'awaiting_recipient_delivery'/,
  'stage must stay pending while recipient delivery is incomplete.',
)

assert.match(
  migration,
  /'retryable', v_artifact_ready and not v_ready/,
  'retryable must remain true when a final artifact exists but completion is not ready.',
)

assert.match(migration, /'deliveryReady', v_delivery_ready/)
assert.match(migration, /'deliveryStage', v_delivery_stage/)
assert.match(migration, /'deliveryRetryable', v_artifact_ready and not v_delivery_ready/)
assert.match(migration, /'completedAt', case when v_ready then v_receipt\.completed_at else null end/)

assert.doesNotMatch(
  migration,
  /'ready',\s*v_artifact_ready\s+and\s+v_transaction_ready\s+and\s+v_surface_ready(?!\s+and\s+v_delivery_ready)/,
  'ready must not ignore recipient delivery.',
)

for (const reference of [
  'Correct the final completion status model',
  '`ready=true` now requires all of',
  "`stage='awaiting_recipient_delivery'`",
  'This phase does not add staging-safe suppressed delivery. That is Phase 2.',
]) {
  assert.ok(audit.includes(reference), `Phase 1 audit should keep: ${reference}`)
}

console.log('document-generator final-mile Phase 1 status truth passed.')
