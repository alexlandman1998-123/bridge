import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(
  new URL('../../supabase/migrations/20260831145749_repair_active_seller_document_schema_drift.sql', import.meta.url),
  'utf8',
)

const requirementColumns = [
  'applies_to',
  'requested_from_role',
  'request_stage',
  'request_priority',
  'request_due_date',
  'request_delivery_channels',
  'request_dedupe_key',
  'request_source',
  'requested_at',
  'request_revision',
  'last_request_reason',
  'request_metadata',
  'satisfied_by_document_id',
  'satisfaction_verified_at',
  'satisfaction_method',
  'assurance_state',
  'assurance_metadata',
]

const documentColumns = [
  'review_revision',
  'review_started_at',
  'reviewed_at',
  'reviewed_by',
  'review_reason',
  'rejection_reason',
  'review_due_at',
  'review_sla_revision',
  'review_sla_level',
  'review_sla_escalated_at',
]

for (const column of [...requirementColumns, ...documentColumns]) {
  assert.match(migration, new RegExp(`add column if not exists ${column}\\b`, 'i'), `repair must add ${column} safely`)
}

assert.match(migration, /applies_to text not null default 'seller'/i)
assert.match(migration, /review_revision integer not null default 0/i)
assert.match(migration, /assurance_state text not null default 'unverified'/i)
assert.match(migration, /review_sla_level text not null default 'none'/i)
assert.match(migration, /notify pgrst, 'reload schema'/i)

assert.doesNotMatch(migration, /\b(create|alter|drop)\s+policy\b/i, 'schema drift repair must not change RLS policies')
assert.doesNotMatch(migration, /\b(enable|disable|force|no force)\s+row level security\b/i)
assert.doesNotMatch(migration, /\b(grant|revoke)\b/i, 'schema drift repair must not change privileges')
assert.doesNotMatch(migration, /\bcreate\s+(or\s+replace\s+)?function\b/i, 'workflow behavior is handled separately')
assert.doesNotMatch(migration, /\bcreate\s+trigger\b/i, 'workflow behavior is handled separately')
assert.doesNotMatch(migration, /alter table public\.transactions[\s\S]+add column if not exists status/i, 'canonical transaction stage must not be duplicated')

console.log('active seller document schema drift repair test passed')

