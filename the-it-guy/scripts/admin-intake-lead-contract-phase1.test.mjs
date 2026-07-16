import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../../', import.meta.url)
const migration = await readFile(
  new URL('supabase/migrations/202607160003_admin_intake_lead_contract_phase1.sql', root),
  'utf8',
)

assert.match(migration, /alter table public\.demo_enquiries/, 'Phase 1 must extend the canonical enquiry table')
assert.doesNotMatch(migration, /create table[^;]*leads/i, 'Phase 1 must not create a competing leads table')

for (const field of [
  'intake_kind',
  'form_key',
  'form_version',
  'submission_key',
  'preferred_contact_method',
  'services_interested',
  'popia_consent_given',
  'popia_consent_at',
  'privacy_policy_version',
  'marketing_consent',
  'request_fingerprint',
  'dedupe_status',
  'duplicate_of_enquiry_id',
  'normalized_email',
  'normalized_phone',
  'normalized_company',
  'dedupe_key',
]) {
  assert.match(migration, new RegExp(`add column if not exists ${field}\\b`), `Missing intake contract field: ${field}`)
}

assert.match(migration, /generated always as[\s\S]*lower\(btrim\(email\)\)/, 'Email normalization must be database generated')
assert.match(migration, /regexp_replace\(phone, '\[\^0-9\]'/, 'Phone normalization must remove formatting')
assert.match(migration, /demo_enquiries_submission_key_unique_idx/, 'Submission idempotency requires a unique partial index')
assert.match(migration, /where submission_key is not null/, 'Legacy rows must remain compatible with idempotency')
assert.match(migration, /popia_consent_at is not null[\s\S]*privacy_policy_version/, 'POPIA consent must retain evidence')
assert.match(migration, /marketing_consent = false or popia_consent_given = true/, 'Marketing consent must require privacy consent')
assert.match(migration, /duplicate_of_enquiry_id <> id/, 'A lead cannot duplicate itself')
assert.match(migration, /references public\.demo_enquiries\(id\)/, 'Duplicate lineage must reference the canonical lead')
assert.match(migration, /intentionally not unique/, 'Deduplication must not reject legitimate repeat enquiries')
assert.match(migration, /Never store a raw IP address/, 'Request fingerprint contract must prohibit raw IP storage')
assert.match(migration, /enable row level security/, 'The canonical lead table must keep RLS enabled')
assert.doesNotMatch(migration, /to anon[\s\S]*(using|with check)\s*\(true\)/, 'Phase 1 must not grant public table writes')

console.log('Admin intake lead contract Phase 1 passed')
