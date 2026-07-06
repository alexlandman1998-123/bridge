import assert from 'node:assert/strict'
import {
  getAttorneyStageDefinitionsForLane,
  getAttorneyStageLabel,
  getAttorneyWorkflowStageTemplates,
  normalizeAttorneyStageKey,
} from '../src/constants/attorneyWorkflowStages.js'
import {
  BOND_STAGE_DEFINITIONS,
  CANCELLATION_STAGE_DEFINITIONS,
  TRANSFER_STAGE_DEFINITIONS,
} from '../src/core/workflows/definitions.js'
import { SUBPROCESS_STEP_TEMPLATES } from '../src/core/transactions/roleConfig.js'
import { getAttorneyUpdateType } from '../src/constants/attorneyUpdateTypes.js'
import { ATTORNEY_LANE_STAGES } from '../src/services/attorneyWorkflow/attorneyWorkflowResolver.js'

function keys(rows = []) {
  return rows.map((row) => row.key)
}

function assertSameKeys(actual, expected, message) {
  assert.deepEqual([...actual], [...expected], message)
}

function assertUniqueStageKeys(laneKey) {
  const definitions = getAttorneyStageDefinitionsForLane(laneKey)
  const stageKeys = keys(definitions)
  assert.equal(new Set(stageKeys).size, stageKeys.length, `${laneKey}: stage keys must be unique`)
}

for (const laneKey of ['transfer', 'bond', 'cancellation']) {
  assertUniqueStageKeys(laneKey)
}

assert.equal(normalizeAttorneyStageKey('buyer_signed', 'transfer'), 'buyer_signed_transfer_documents')
assert.equal(normalizeAttorneyStageKey('buyer_signed_transfer_docs', 'transfer'), 'buyer_signed_transfer_documents')
assert.equal(normalizeAttorneyStageKey('seller_signed', 'transfer'), 'seller_signed_transfer_documents')
assert.equal(normalizeAttorneyStageKey('rates_clearance_uploaded', 'transfer'), 'rates_clearance_received')
assert.equal(normalizeAttorneyStageKey('levy_clearance_uploaded', 'transfer'), 'levy_clearance_received')
assert.equal(normalizeAttorneyStageKey('lodgement_submitted', 'transfer'), 'lodged_at_deeds_office')
assert.equal(normalizeAttorneyStageKey('registered', 'transfer'), 'registered')
assert.equal(normalizeAttorneyStageKey('registration_confirmed', 'transfer'), 'registered')
assert.equal(normalizeAttorneyStageKey('bank_conditions_reviewed', 'bond'), 'bank_requirements_confirmed')
assert.equal(normalizeAttorneyStageKey('grant_signed', 'bond'), 'guarantees_issued')
assert.equal(normalizeAttorneyStageKey('bond_lodgement_pack_prepared', 'bond'), 'bond_lodgement_ready')
assert.equal(normalizeAttorneyStageKey('bond_registration_confirmed', 'bond'), 'bond_registered')
assert.equal(normalizeAttorneyStageKey('guarantees_accepted', 'cancellation'), 'cancellation_guarantees_accepted')

assert.equal(getAttorneyStageLabel('lodgement_submitted', 'transfer'), 'Lodged at Deeds Office')
assert.equal(getAttorneyStageLabel('bond_registration_confirmed', 'bond'), 'Bond Registered')
assert.equal(getAttorneyStageLabel('guarantees_accepted', 'cancellation'), 'Guarantees Accepted')

assert.equal(getAttorneyUpdateType('buyer_signed_transfer_docs')?.id, 'buyer_signed_transfer_documents')
assert.equal(getAttorneyUpdateType('registration_confirmed')?.id, 'registered')
assert.equal(getAttorneyUpdateType('bank_conditions_reviewed')?.id, 'bank_requirements_confirmed')
assert.equal(getAttorneyUpdateType('guarantees_accepted')?.id, 'cancellation_guarantees_accepted')

assertSameKeys(keys(TRANSFER_STAGE_DEFINITIONS), keys(getAttorneyWorkflowStageTemplates('transfer')), 'core transfer workflow should use canonical transfer stages')
assertSameKeys(keys(BOND_STAGE_DEFINITIONS), keys(getAttorneyWorkflowStageTemplates('bond')), 'core bond workflow should use canonical bond stages')
assertSameKeys(keys(CANCELLATION_STAGE_DEFINITIONS), keys(getAttorneyWorkflowStageTemplates('cancellation')), 'core cancellation workflow should use canonical cancellation stages')

assertSameKeys(keys(SUBPROCESS_STEP_TEMPLATES.transfer), keys(getAttorneyWorkflowStageTemplates('transfer')), 'transfer subprocess template should use canonical stages')
assertSameKeys(keys(SUBPROCESS_STEP_TEMPLATES.bond), keys(getAttorneyWorkflowStageTemplates('bond')), 'bond subprocess template should use canonical stages')
assertSameKeys(keys(SUBPROCESS_STEP_TEMPLATES.cancellation), keys(getAttorneyWorkflowStageTemplates('cancellation')), 'cancellation subprocess template should use canonical stages')

assert.deepEqual(ATTORNEY_LANE_STAGES.transfer, keys(getAttorneyWorkflowStageTemplates('transfer')))
assert.deepEqual(ATTORNEY_LANE_STAGES.bond, keys(getAttorneyWorkflowStageTemplates('bond')))
assert.deepEqual(ATTORNEY_LANE_STAGES.cancellation, keys(getAttorneyWorkflowStageTemplates('cancellation')))

console.log('Attorney workflow Phase 0 canonical stage verification passed.')
