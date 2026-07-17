import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const migrationPath = path.resolve(
  process.cwd(),
  '../supabase/migrations/202607170016_attorney_firm_first_allocation_phase2.sql',
)
const migration = fs.readFileSync(migrationPath, 'utf8')

function assertHas(pattern, message) {
  assert.match(migration, pattern, message)
}

for (const column of [
  'appointment_source',
  'preferred_attorney_user_id',
  'preferred_contact_name',
  'firm_acceptance_status',
  'firm_accepted_by',
  'firm_accepted_at',
  'staff_assignment_status',
  'allocation_state',
  'allocation_state_changed_at',
  'declined_by',
  'declined_at',
  'decline_reason',
  'replacement_required_by',
  'replacement_required_at',
  'replacement_reason',
  'superseded_by_assignment_id',
]) {
  assertHas(new RegExp(`add column if not exists ${column}\\b`, 'i'), `Phase 2 should add ${column}`)
}

assertHas(
  /allocation_state in \(\s*'awaiting_firm_acceptance',[\s\S]*'removed'\s*\)/i,
  'the database lifecycle should use the Phase 1 canonical states',
)
assertHas(
  /create or replace function public\.attorney_firm_first_allocation_transition_allowed/i,
  'the migration should expose one canonical transition contract',
)
assertHas(
  /when 'awaiting_firm_acceptance' then p_to_state in \('awaiting_staff_assignment', 'declined', 'replacement_required', 'removed'\)/i,
  'firm acceptance cannot jump directly to active',
)
assertHas(
  /transaction_attorney_assignments_canonical_firm_check[\s\S]*check \(firm_id = attorney_firm_id\)/i,
  'canonical and compatibility firm identifiers should remain aligned',
)
assertHas(
  /transaction_attorney_assignments_active_allocation_check[\s\S]*firm_acceptance_status = 'accepted'[\s\S]*staff_assignment_status = 'staff_assigned'[\s\S]*assignment_status = 'active'[\s\S]*is_primary = true/i,
  'active allocations should require an accepted firm and a primary person',
)
assertHas(
  /from public\.attorney_firm_members member[\s\S]*member\.firm_id = new\.attorney_firm_id[\s\S]*member\.user_id = v_person_id[\s\S]*member\.status = 'active'/i,
  'assigned people should be validated as active members of the appointed firm',
)
assertHas(
  /from public\.transaction_legal_role_appointments appointment[\s\S]*appointment\.accepted_firm_id = new\.attorney_firm_id/i,
  'existing bank-appointed firm acceptance should feed the canonical lifecycle',
)
assertHas(
  /transaction_attorney_assignments_unique_canonical_active_primary_role[\s\S]*where is_primary = true and allocation_state = 'active'/i,
  'only one canonical active primary should exist per transaction and legal role',
)
assertHas(
  /create trigger trg_prepare_attorney_firm_first_allocation[\s\S]*before insert or update on public\.transaction_attorney_assignments/i,
  'legacy and canonical writes should share the compatibility trigger',
)

assert.doesNotMatch(migration, /drop column/i, 'the Phase 2 migration must not remove compatibility columns')
assert.doesNotMatch(migration, /drop policy/i, 'Phase 2 must preserve the existing RLS policy surface')
assert.doesNotMatch(migration, /delete from public\.transaction_attorney_assignments/i, 'Phase 2 must not delete assignments')

console.log('Attorney firm-first allocation Phase 2 migration tests passed')
