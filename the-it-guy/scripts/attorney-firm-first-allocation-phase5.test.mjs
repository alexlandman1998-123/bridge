import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  getAttorneyFirmAllocationLaneLabel,
  manageAttorneyFirmAllocation,
  getTransferFirmAllocationLabel,
  manageTransferFirmAllocation,
  TRANSFER_FIRM_ALLOCATION_STATES,
} from '../src/services/transferFirmAllocationService.js'

const root = process.cwd()
const migration = fs.readFileSync(
  path.join(root, '../supabase/migrations/202607170003_attorney_firm_first_acceptance_phase5.sql'),
  'utf8',
)
const section = fs.readFileSync(path.join(root, 'src/components/attorney/assignments/AttorneyAssignmentSection.jsx'), 'utf8')
const actions = fs.readFileSync(path.join(root, 'src/components/attorney/assignments/TransferFirmAllocationActions.jsx'), 'utf8')

assert.equal(
  getTransferFirmAllocationLabel(TRANSFER_FIRM_ALLOCATION_STATES.awaitingFirmAcceptance),
  'Awaiting firm acceptance',
)
assert.equal(getTransferFirmAllocationLabel(TRANSFER_FIRM_ALLOCATION_STATES.staffAssigned), 'Primary attorney assigned')

let capturedRpc = null
const client = {
  async rpc(name, params) {
    capturedRpc = { name, params }
    return {
      data: {
        id: params.p_assignment_id,
        transaction_id: 'transaction-1',
        attorney_firm_id: 'firm-1',
        attorney_user_id: params.p_attorney_user_id,
        appointment_source: 'agent_firm_nomination',
        firm_acceptance_status: 'accepted',
        staff_assignment_status: 'assigned',
        allocation_state: 'staff_assigned',
      },
      error: null,
    }
  },
}

const assigned = await manageTransferFirmAllocation({
  assignmentId: 'assignment-1',
  action: 'assign_primary',
  attorneyUserId: 'attorney-1',
}, { client })
assert.equal(capturedRpc.name, 'bridge_manage_attorney_firm_allocation')
assert.equal(capturedRpc.params.p_action, 'assign_primary')
assert.equal(capturedRpc.params.p_attorney_user_id, 'attorney-1')
assert.equal(assigned.allocationState, 'staff_assigned')
assert.equal(assigned.laneKey, 'transfer')
assert.equal(getAttorneyFirmAllocationLaneLabel('cancellation_attorney'), 'Cancellation Attorney')

const fallbackCalls = []
const legacyFallbackClient = {
  async rpc(name, params) {
    fallbackCalls.push(name)
    if (name === 'bridge_manage_attorney_firm_allocation') {
      return { data: null, error: { code: 'PGRST202', message: 'Could not find bridge_manage_attorney_firm_allocation' } }
    }
    return {
      data: { id: params.p_assignment_id, transaction_id: 'transaction-1', attorney_role: 'transfer_attorney', allocation_state: 'active' },
      error: null,
    }
  },
}
await manageTransferFirmAllocation({ assignmentId: 'assignment-2', action: 'accept' }, { client: legacyFallbackClient })
assert.deepEqual(fallbackCalls, ['bridge_manage_attorney_firm_allocation', 'bridge_manage_transfer_firm_allocation'])

await assert.rejects(
  () => manageAttorneyFirmAllocation({ assignmentId: 'assignment-3', action: 'accept', laneKey: 'bond' }, { client: legacyFallbackClient }),
  (error) => error?.code === 'PGRST202',
)
assert.deepEqual(
  fallbackCalls,
  ['bridge_manage_attorney_firm_allocation', 'bridge_manage_transfer_firm_allocation', 'bridge_manage_attorney_firm_allocation'],
  'bond must never fall back to the transfer-only RPC',
)

await assert.rejects(
  () => manageTransferFirmAllocation({ assignmentId: 'assignment-1', action: 'decline' }, { client }),
  /reason/i,
)
await assert.rejects(
  () => manageTransferFirmAllocation({ assignmentId: 'assignment-1', action: 'assign_primary' }, { client }),
  /primary transfer attorney/i,
)

assert.match(migration, /public\.attorney_user_is_firm_lead\(v_firm_id\)/, 'only firm leads may transition an allocation')
assert.match(migration, /member\.firm_id = v_firm_id[\s\S]*member\.status = 'active'/, 'primary attorney must be active in the nominated firm')
assert.match(migration, /v_action = 'accept'[\s\S]*allocation_state = 'awaiting_staff_assignment'/, 'firm acceptance must not activate the matter')
assert.match(migration, /v_action = 'assign_primary'[\s\S]*allocation_state = 'staff_assigned'/, 'internal allocation must remain distinct from activation')
assert.match(migration, /v_action = 'activate'[\s\S]*instruction_status = 'accepted'/, 'activation should accept the instruction only after both gates')
assert.match(migration, /bridge_guard_transfer_firm_activation/, 'direct instruction acceptance must be guarded')
assert.doesNotMatch(migration, /delete from|drop table|drop column/i, 'the Phase 5 migration should remain additive')

assert.match(section, /getTransferFirmAllocation\(transactionId\)/, 'the assignment screen should load firm-first state')
assert.match(section, /getAttorneyFirmAllocation\(transactionId, \{ laneKey: 'bond' \}\)/, 'the assignment screen should load bond firm-first state')
assert.match(section, /getAttorneyFirmAllocation\(transactionId, \{ laneKey: 'cancellation' \}\)/, 'the assignment screen should load cancellation firm-first state')
assert.match(section, /<TransferFirmAllocationActions/, 'the assignment screen should render firm-first actions')
assert.match(actions, /Accept for Firm/, 'firm leads should have an explicit firm acceptance action')
assert.match(actions, /Assign Primary/, 'firm leads should allocate an internal primary attorney')
assert.match(actions, /Activate \$\{laneLabel\} Matter/, 'activation should retain the selected attorney lane')
assert.match(actions, /getAssignableAttorneyFirmMembers\(allocation\.firmId, laneKey\)/, 'internal allocation must load members qualified for its lane')
assert.match(actions, /Agent preference \(non-binding\)/, 'preferred contacts must remain non-binding')

console.log('Attorney firm-first allocation Phase 5 acceptance and internal allocation tests passed')
