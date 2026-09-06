import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  ATTORNEY_COORDINATION_ACTIONS,
  ATTORNEY_COORDINATION_DEFINITIONS,
  ATTORNEY_COORDINATION_LANES,
  ATTORNEY_COORDINATION_OPERATING_MODEL_VERSION,
  ATTORNEY_COORDINATION_RULES,
  evaluateAttorneyCoordinationAuthority,
} from '../src/constants/attorneyCoordinationOperatingModel.js'

assert.equal(ATTORNEY_COORDINATION_OPERATING_MODEL_VERSION, 'attorney-coordination-operating-model-phase0-v1')
assert.deepEqual(ATTORNEY_COORDINATION_LANES, ['transfer_attorney', 'bond_attorney', 'cancellation_attorney'])
assert.deepEqual(Object.keys(ATTORNEY_COORDINATION_DEFINITIONS), ['nomination', 'firmAcceptance', 'internalAllocation', 'coordination', 'delegation', 'reassignment'])
assert.equal(ATTORNEY_COORDINATION_RULES.sharedTransactionSystemOfRecord, true)
assert.equal(ATTORNEY_COORDINATION_RULES.separateLaneCopiesAllowed, false)
assert.equal(ATTORNEY_COORDINATION_RULES.transferAttorneyMayAllocateExternalFirmStaff, false)
assert.equal(ATTORNEY_COORDINATION_RULES.crossLaneUpdateRequiresExplicitDelegation, true)

const shared = {
  actorRole: 'transfer_attorney',
  actorFirmId: 'transfer-firm',
  transferFirmId: 'transfer-firm',
  targetRole: 'bond_attorney',
  responsibleFirmId: 'bond-firm',
}

assert.equal(evaluateAttorneyCoordinationAuthority({ ...shared, action: ATTORNEY_COORDINATION_ACTIONS.nominateFirm }).allowed, true)
assert.equal(evaluateAttorneyCoordinationAuthority({ ...shared, targetRole: 'cancellation_attorney', action: ATTORNEY_COORDINATION_ACTIONS.nominateFirm }).allowed, true)
assert.equal(evaluateAttorneyCoordinationAuthority({ ...shared, targetRole: 'transfer_attorney', action: ATTORNEY_COORDINATION_ACTIONS.nominateFirm }).allowed, false)
assert.equal(evaluateAttorneyCoordinationAuthority({ ...shared, action: ATTORNEY_COORDINATION_ACTIONS.allocateFirmStaff }).allowed, false)
assert.equal(evaluateAttorneyCoordinationAuthority({ ...shared, action: ATTORNEY_COORDINATION_ACTIONS.coordinateLane }).allowed, true)
assert.equal(evaluateAttorneyCoordinationAuthority({ ...shared, action: ATTORNEY_COORDINATION_ACTIONS.updateLane }).allowed, false)

const delegatedUpdate = evaluateAttorneyCoordinationAuthority({
  ...shared,
  action: ATTORNEY_COORDINATION_ACTIONS.updateLane,
  hasActiveDelegation: true,
})
assert.equal(delegatedUpdate.allowed, true)
assert.equal(delegatedUpdate.actingOnBehalf, true)

assert.equal(evaluateAttorneyCoordinationAuthority({
  action: ATTORNEY_COORDINATION_ACTIONS.allocateFirmStaff,
  actorRole: 'bond_attorney',
  actorFirmId: 'bond-firm',
  transferFirmId: 'transfer-firm',
  targetRole: 'bond_attorney',
  responsibleFirmId: 'bond-firm',
  canManageResponsibleFirm: true,
}).allowed, true)

assert.equal(evaluateAttorneyCoordinationAuthority({
  action: ATTORNEY_COORDINATION_ACTIONS.updateLane,
  actorRole: 'bond_attorney',
  actorFirmId: 'bond-firm',
  targetRole: 'bond_attorney',
  responsibleFirmId: 'bond-firm',
}).actingOnBehalf, false)

const documentation = readFileSync(new URL('../docs/attorney-coordination-operating-model-phase0.md', import.meta.url), 'utf8')
for (const phrase of ['one canonical transaction record', 'cannot allocate staff inside an independent firm', 'denied by default', 'preserve the actual actor']) {
  assert.match(documentation, new RegExp(phrase, 'i'))
}

console.log('Attorney coordination operating model Phase 0 contract passed.')
