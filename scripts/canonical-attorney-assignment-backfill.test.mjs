import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { cancellationAttorneyLaneFixture as fixture } from '../the-it-guy/test-fixtures/cancellation-attorney-lane.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const migrationPath = resolve(here, '../supabase/migrations/20260831184047_backfill_canonical_transfer_and_bond_assignments.sql')
const migration = await readFile(migrationPath, 'utf8')

assert.match(migration, /^begin;/)
assert.match(migration, /on commit drop/)
assert.match(migration, /having count\(distinct evidence\.firm_id\) = 1/)
assert.match(migration, /assigned_attorney_member_email/)
assert.match(migration, /accepted_bank_appointment/)
assert.match(migration, /appointment\.evidence_confirmed = true/)
assert.match(migration, /coordination_state in \('invite_accepted', 'instruction_confirmed', 'active'\)/)
assert.match(migration, /where not exists[\s\S]*assignment\.attorney_role = candidate\.attorney_role/)
assert.match(migration, /having count\(\*\) = 1/)
assert.doesNotMatch(migration, /insert into public\.transaction_attorney_assignments[\s\S]*'cancellation_attorney'/)
assert.match(migration, /commit;\s*$/)

assert.equal(fixture.transaction.is_demo_data, true)
assert.equal(fixture.transaction.seller_has_existing_bond, true)
assert.equal(fixture.appointment.role_type, 'cancellation_attorney')
assert.equal(fixture.appointment.evidence_confirmed, true)
assert.equal(fixture.appointment.accepted_firm_id, fixture.firm.id)
assert.equal(fixture.assignment.assignment_type, 'cancellation')
assert.equal(fixture.assignment.attorney_role, 'cancellation_attorney')
assert.equal(fixture.assignment.attorney_firm_id, fixture.appointment.accepted_firm_id)
assert.equal(fixture.subprocess.process_type, 'cancellation')
assert.equal(fixture.subprocess.attorney_assignment_id, fixture.assignment.id)

console.log('canonical attorney assignment backfill and cancellation fixture contract: ok')
