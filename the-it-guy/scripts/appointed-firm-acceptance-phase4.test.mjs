import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  new URL('../../supabase/migrations/202607150010_appointed_firm_acceptance_phase4.sql', import.meta.url),
  'utf8',
)
const assignmentService = readFileSync(
  new URL('../src/services/transactionAttorneyAssignments.js', import.meta.url),
  'utf8',
)
const assignmentForm = readFileSync(
  new URL('../src/components/attorney/assignments/AttorneyAssignmentForm.jsx', import.meta.url),
  'utf8',
)
const assignmentSection = readFileSync(
  new URL('../src/components/attorney/assignments/AttorneyAssignmentSection.jsx', import.meta.url),
  'utf8',
)

assert.match(migration, /accepted_organisation_id uuid/)
assert.match(migration, /accepted_firm_id uuid/)
assert.match(migration, /staff_assignment_status text not null default 'awaiting_firm_acceptance'/)
assert.match(migration, /staff_assignment_status = 'awaiting_staff_assignment'/)

assert.match(migration, /user_id = null,[\s\S]*assigned_user_id = null/)
assert.match(migration, /status = 'selected',[\s\S]*assignment_status = 'selected'/)
assert.match(migration, /'legalInstructionConfirmed', false/)
assert.match(migration, /'new_instruction'|instruction_status/)

assert.match(migration, /bridge_enforce_appointed_firm_staff_assignment/)
assert.match(migration, /Bond and cancellation staff must be assigned from the bank-appointed firm/)
assert.match(migration, /A bank-appointed firm cannot be removed through staff assignment/)
assert.match(migration, /bridge_sync_appointed_firm_staff_assignment/)
assert.match(migration, /staff_assignment_status = 'staff_assigned'/)
assert.match(migration, /activation_trigger = case[\s\S]*'bank_instruction_confirmed'/)

assert.match(assignmentService, /assertBankAppointedFirmAssignmentAuthority/)
assert.match(assignmentService, /accepted_firm_id !== firmId/)
assert.match(assignmentForm, /isBankAppointedFirmLocked/)
assert.match(assignmentForm, /cannot replace the appointed firm/)
assert.match(assignmentSection, /Awaiting the \$\{type\} firm appointed by the bank/)
assert.match(assignmentSection, /canRemoveAssignments && !isBankAppointedRole/)

console.log('appointed firm acceptance Phase 4 contracts passed')
