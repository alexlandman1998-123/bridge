import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { buildTransferInstructionLifecycle } from '../src/services/transferInstructionLifecycleService.js'

const baseTransaction = {
  id: 'tx-1',
  listing_id: 'listing-1',
  onboarding_status: 'signed_otp_received',
}
const allocation = {
  id: 'allocation-1',
  role_type: 'transfer_attorney',
  allocation_status: 'instructed',
  transaction_id: 'tx-1',
  company_name: 'Example Attorneys',
}

{
  const lifecycle = buildTransferInstructionLifecycle({ transaction: baseTransaction, allocations: [allocation] })
  assert.equal(lifecycle.health, 'attention')
  assert.deepEqual(lifecycle.issues, ['missing_instruction_assignment'])
  assert.equal(lifecycle.steps.find((step) => step.key === 'firm_nomination').status, 'current')
}

{
  const lifecycle = buildTransferInstructionLifecycle({
    transaction: baseTransaction,
    allocations: [allocation],
    assignments: [{
      id: 'assignment-awaiting-firm',
      attorney_role: 'transfer_attorney',
      instruction_status: 'ready_for_acceptance',
      assignment_status: 'pending',
      allocation_state: 'awaiting_firm_acceptance',
      firm_acceptance_status: 'awaiting_firm_acceptance',
      staff_assignment_status: 'awaiting_staff_assignment',
    }],
  })
  assert.equal(lifecycle.health, 'on_track')
  assert.equal(lifecycle.decisionState, 'awaiting_firm_acceptance')
  assert.equal(lifecycle.steps.find((step) => step.key === 'firm_acceptance').status, 'current')
}

{
  const lifecycle = buildTransferInstructionLifecycle({
    transaction: baseTransaction,
    allocations: [{ ...allocation, allocation_status: 'withdrawn' }],
    assignments: [{ id: 'assignment-declined', attorney_role: 'transfer_attorney', instruction_status: 'declined', assignment_status: 'removed' }],
    roleplayers: [{ id: 'roleplayer-stale', role_type: 'transfer_attorney', assignment_status: 'active' }],
  })
  assert.equal(lifecycle.health, 'blocked')
  assert.ok(lifecycle.issues.includes('declined_attorney_still_active'))
}

{
  const lifecycle = buildTransferInstructionLifecycle({
    transaction: baseTransaction,
    allocations: [{ ...allocation, company_name: 'Replacement Attorneys' }],
    assignments: [
      { id: 'assignment-ready-replacement', attorney_role: 'transfer_attorney', instruction_status: 'ready_for_acceptance', assignment_status: 'pending', allocation_state: 'awaiting_firm_acceptance', firm_acceptance_status: 'awaiting_firm_acceptance' },
      { id: 'assignment-old-declined', attorney_role: 'transfer_attorney', instruction_status: 'declined', assignment_status: 'removed', allocation_state: 'declined' },
    ],
    roleplayers: [{ id: 'roleplayer-replacement', role_type: 'transfer_attorney', assignment_status: 'active' }],
  })
  assert.equal(lifecycle.health, 'on_track')
  assert.equal(lifecycle.decisionState, 'awaiting_firm_acceptance')
}

{
  const lifecycle = buildTransferInstructionLifecycle({
    transaction: baseTransaction,
    allocations: [{ ...allocation, allocation_status: 'converted' }],
    assignments: [{
      id: 'assignment-accepted',
      attorney_role: 'transfer_attorney',
      instruction_status: 'accepted',
      assignment_status: 'active',
      allocation_state: 'active',
      firm_acceptance_status: 'accepted',
      staff_assignment_status: 'staff_assigned',
      attorney_user_id: 'attorney-1',
    }],
  })
  assert.equal(lifecycle.health, 'on_track')
  assert.equal(lifecycle.decisionState, 'active')
  assert.equal(lifecycle.steps.at(-1).status, 'complete')
}

{
  const lifecycle = buildTransferInstructionLifecycle({
    transaction: baseTransaction,
    allocations: [allocation],
    assignments: [{
      id: 'assignment-invalid-staff',
      attorney_role: 'transfer_attorney',
      instruction_status: 'ready_for_acceptance',
      assignment_status: 'pending',
      allocation_state: 'staff_assigned',
      firm_acceptance_status: 'accepted',
      staff_assignment_status: 'staff_assigned',
    }],
  })
  assert.equal(lifecycle.health, 'blocked')
  assert.ok(lifecycle.issues.includes('staff_assigned_state_missing_primary_attorney'))
}

const root = process.cwd()
const [transactionPage, migrationSource] = await Promise.all([
  readFile(resolve(root, 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8'),
  readFile(resolve(root, '../supabase/migrations/202607170006_attorney_firm_first_lifecycle_assurance_phase7.sql'), 'utf8'),
])
assert.match(transactionPage, /Transfer instruction lifecycle/)
assert.match(transactionPage, /Reconciliation:/)
assert.match(migrationSource, /transfer_firm_allocation_lifecycle_v2/)
assert.match(migrationSource, /multiple_open_transfer_firm_allocations/)
assert.match(migrationSource, /missing_instruction_assignment/)
assert.match(migrationSource, /active_matter_missing_firm_or_person_gate/)
assert.match(migrationSource, /firm_acceptance_sla_overdue/)
assert.match(migrationSource, /internal_assignment_sla_overdue/)
assert.match(migrationSource, /nominate_replacement_firm/)
assert.doesNotMatch(migrationSource, /delete from|drop table|drop column/i)

console.log('Firm-first transfer lifecycle assurance Phase 7 checks passed.')
