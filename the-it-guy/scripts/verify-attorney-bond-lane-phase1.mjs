import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  BOND_LANE_PHASE1_JOURNEY_VERSION,
  buildBondLaneJourneyMap,
} from '../src/services/attorneyWorkflow/bondLaneJourneyMap.js'

const map = buildBondLaneJourneyMap()

assert.equal(map.version, BOND_LANE_PHASE1_JOURNEY_VERSION)
assert.equal(map.originator.ownerRole, 'bond_originator')
assert.equal(map.attorney.ownerRole, 'bond_attorney')
assert.equal(map.rolloutBaseline.attorneyStartsAt, 'bond_instruction_received')

assert.deepEqual(map.originator.missingJourneyStageKeys, [])
assert.deepEqual(map.originator.missingFinanceStageKeys, [])
assert.deepEqual(map.attorney.missingStageKeys, [])
assert.deepEqual(map.attorney.unknownStageKeys, [])
assert.deepEqual(map.attorney.duplicateStageKeys, [])

assert.ok(map.originator.lanes.length >= 5)
assert.ok(map.attorney.lanes.length >= 5)
assert.ok(map.originator.mappedJourneyStageKeys.includes('received'))
assert.ok(map.originator.mappedJourneyStageKeys.includes('instruction'))
assert.ok(map.originator.mappedFinanceStageKeys.includes('instruction_sent'))
assert.ok(map.attorney.mappedStageKeys.includes('bond_instruction_received'))
assert.ok(map.attorney.mappedStageKeys.includes('bond_lodged'))
assert.ok(map.attorney.mappedStageKeys.includes('bond_close_out_complete'))

const originatorHandoff = map.handoffs.find((handoff) => handoff.key === 'originator_to_bond_attorney')
assert.equal(originatorHandoff?.fromOwnerRole, 'bond_originator')
assert.equal(originatorHandoff?.toOwnerRole, 'bond_attorney')
assert.equal(originatorHandoff?.toStageKey, 'bond_instruction_received')
assert.ok(originatorHandoff.requiredEvidence.includes('signed_grant'))
assert.ok(originatorHandoff.requiredEvidence.includes('bond_instruction'))
assert.ok(originatorHandoff.requiredEvidence.includes('bank_reference'))

const transferGuaranteeHandoff = map.handoffs.find((handoff) => handoff.key === 'bond_attorney_to_transfer_attorney')
assert.equal(transferGuaranteeHandoff?.toOwnerRole, 'transfer_attorney')
assert.equal(transferGuaranteeHandoff?.toStageKey, 'transfer_guarantees_accepted')
assert.ok(transferGuaranteeHandoff.requiredEvidence.includes('guarantee_letter'))

const lodgementHandoff = map.handoffs.find((handoff) => handoff.key === 'bond_attorney_to_lodgement_coordination')
assert.equal(lodgementHandoff?.toStageKey, 'lodgement_ready')
assert.ok(lodgementHandoff.requiredEvidence.includes('bank_approval_to_lodge'))

const docSource = readFileSync(new URL('../docs/attorney-bond-lane-phase1-journey-map.md', import.meta.url), 'utf8')
assert.match(docSource, /Bond Lane Phase 1 Journey Map/)
assert.match(docSource, /bond_originator\.instruction_sent/)
assert.match(docSource, /bond_attorney\.bond_instruction_received/)
assert.match(docSource, /node scripts\/verify-attorney-bond-lane-phase1\.mjs/)

console.log('Attorney bond lane Phase 1 journey map verification passed.')
