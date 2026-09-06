import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  ATTORNEY_FIRM_ALLOCATION_ACTIONS,
  buildAttorneyAllocationStatus,
  buildAttorneyFirmNominationInput,
  manageAttorneyFirmAllocation,
  nominateAttorneyLaneFirm,
} from '../src/services/attorneyCoordinationNominationService.js'

assert.deepEqual(buildAttorneyFirmNominationInput({ transactionId: 'tx-1', attorneyRole: 'bond', attorneyFirmId: 'firm-b' }), {
  p_transaction_id: 'tx-1', p_attorney_role: 'bond_attorney', p_attorney_firm_id: 'firm-b', p_reason: null,
})
assert.equal(buildAttorneyFirmNominationInput({ transactionId: 'tx-1', attorneyRole: 'cancellation', attorneyFirmId: 'firm-c' }).p_attorney_role, 'cancellation_attorney')
assert.throws(() => buildAttorneyFirmNominationInput({ transactionId: 'tx-1', attorneyRole: 'transfer', attorneyFirmId: 'firm-t' }), /bond or cancellation/i)

const calls = []
const client = { rpc: async (name, payload) => { calls.push({ name, payload }); return { data: [{ id: 'assignment-1', ...payload }], error: null } } }
await nominateAttorneyLaneFirm({ transactionId: 'tx-1', attorneyRole: 'bond', attorneyFirmId: 'firm-b', reason: 'Bank instruction' }, { client })
assert.equal(calls[0].name, 'bridge_nominate_attorney_lane_firm')
assert.equal(calls[0].payload.p_reason, 'Bank instruction')

await manageAttorneyFirmAllocation({ assignmentId: 'assignment-1', action: ATTORNEY_FIRM_ALLOCATION_ACTIONS.accept }, { client })
await manageAttorneyFirmAllocation({ assignmentId: 'assignment-1', action: ATTORNEY_FIRM_ALLOCATION_ACTIONS.assignPrimary, attorneyUserId: 'attorney-1' }, { client })
await manageAttorneyFirmAllocation({ assignmentId: 'assignment-1', action: ATTORNEY_FIRM_ALLOCATION_ACTIONS.activate }, { client })
assert.equal(calls.slice(1).every((call) => call.name === 'bridge_manage_attorney_firm_allocation'), true)
await assert.rejects(() => manageAttorneyFirmAllocation({ assignmentId: 'assignment-1', action: 'decline' }, { client }), /reason/i)

assert.deepEqual(buildAttorneyAllocationStatus({
  id: 'assignment-1', attorney_role: 'bond_attorney', attorney_firm_id: 'firm-b',
  allocation_state: 'awaiting_staff_assignment', firm_acceptance_status: 'accepted',
}).mayAllocatePrimary, true)
assert.equal(buildAttorneyAllocationStatus({
  id: 'assignment-1', attorney_role: 'cancellation_attorney', attorney_firm_id: 'firm-c',
  allocation_state: 'staff_assigned', attorney_user_id: 'attorney-1',
}).mayActivate, true)

const migration = readFileSync(new URL('../../supabase/migrations/20260906070515_attorney_coordination_nomination_phase2.sql', import.meta.url), 'utf8')
assert.match(migration, /only the active transfer attorney/i)
assert.match(migration, /v_role not in \('bond_attorney', 'cancellation_attorney'\)/)
assert.match(migration, /allocation_state[\s\S]*'awaiting_firm_acceptance'/)
assert.match(migration, /primary_attorney_id, attorney_user_id, assigned_user_id[\s\S]*null, null, null/)
assert.match(migration, /revoke all on function public\.bridge_nominate_attorney_lane_firm[\s\S]*from public, anon/)
assert.match(migration, /grant execute on function public\.bridge_nominate_attorney_lane_firm[\s\S]*to authenticated/)
assert.doesNotMatch(migration, /auth\.role\(\)/)

const transactionDetail = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
assert.match(transactionDetail, /const firmFirstAllocation = roleType === 'bond_attorney' \|\| roleType === 'cancellation_attorney'/)
assert.match(transactionDetail, /userId: firmFirstAllocation \? null : option\.userId \|\| null/)
assert.match(transactionDetail, /preferredAttorneyUserId: firmFirstAllocation \? option\.userId \|\| null : null/)
assert.match(transactionDetail, /activationTrigger:[\s\S]*appointed_firm_staff_assignment/)
assert.match(transactionDetail, /nominates the firm; its authorised manager must accept and allocate the primary bond attorney/i)

console.log('Attorney coordination nomination and allocation Phase 2 gate passed.')
