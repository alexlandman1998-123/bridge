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
  assert.equal(lifecycle.steps.find((step) => step.key === 'transfer_instruction').status, 'current')
}

{
  const lifecycle = buildTransferInstructionLifecycle({
    transaction: baseTransaction,
    allocations: [allocation],
    assignments: [{ id: 'assignment-ready', attorney_role: 'transfer_attorney', instruction_status: 'ready_for_acceptance', assignment_status: 'active' }],
  })
  assert.equal(lifecycle.health, 'on_track')
  assert.equal(lifecycle.decisionState, 'ready_for_acceptance')
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
      { id: 'assignment-ready-replacement', attorney_role: 'transfer_attorney', instruction_status: 'ready_for_acceptance', assignment_status: 'active' },
      { id: 'assignment-old-declined', attorney_role: 'transfer_attorney', instruction_status: 'declined', assignment_status: 'removed' },
    ],
    roleplayers: [{ id: 'roleplayer-replacement', role_type: 'transfer_attorney', assignment_status: 'active' }],
  })
  assert.equal(lifecycle.health, 'on_track')
  assert.equal(lifecycle.decisionState, 'ready_for_acceptance')
}

{
  const lifecycle = buildTransferInstructionLifecycle({
    transaction: baseTransaction,
    allocations: [{ ...allocation, allocation_status: 'converted' }],
    assignments: [{ id: 'assignment-accepted', attorney_role: 'transfer_attorney', instruction_status: 'accepted', assignment_status: 'active' }],
  })
  assert.equal(lifecycle.health, 'on_track')
  assert.equal(lifecycle.decisionState, 'accepted')
  assert.equal(lifecycle.steps.at(-1).status, 'complete')
}

const root = process.cwd()
const [transactionPage, migrationSource] = await Promise.all([
  readFile(resolve(root, 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8'),
  readFile(resolve(root, '../supabase/migrations/202607140015_transfer_instruction_lifecycle_assurance_phase7.sql'), 'utf8'),
])
assert.match(transactionPage, /Transfer instruction lifecycle/)
assert.match(transactionPage, /Reconciliation:/)
assert.match(migrationSource, /transfer_instruction_lifecycle_v1/)
assert.match(migrationSource, /multiple_active_transfer_assignments/)
assert.match(migrationSource, /missing_instruction_assignment/)

console.log('Transfer instruction lifecycle assurance Phase 7 checks passed.')
