import assert from 'node:assert/strict'

import {
  TRANSFER_ATTORNEY_JOURNEY_PHASES,
  getAttorneyJourneyPhaseForStage,
  getAttorneyJourneyPhasesForLane,
  getAttorneyStageDefinitionsForLane,
} from '../../constants/attorneyWorkflowStages.js'

const EXPECTED_PHASE_KEYS = [
  'instruction',
  'fica_authority',
  'financial_preparation',
  'documents_guarantees',
  'lodgement_registration',
  'post_registration',
]

const phases = getAttorneyJourneyPhasesForLane('transfer')
const phaseKeys = phases.map((phase) => phase.key)
assert.deepEqual(phaseKeys, EXPECTED_PHASE_KEYS, 'transfer journey phase order is canonical')
assert.deepEqual(
  phases.map((phase) => phase.label),
  TRANSFER_ATTORNEY_JOURNEY_PHASES.map((phase) => phase.label),
  'public accessor returns the canonical transfer journey labels',
)

const transferDefinitions = getAttorneyStageDefinitionsForLane('transfer')
const transferStageKeys = transferDefinitions.map((definition) => definition.key)
const phaseStageKeys = phases.flatMap((phase) => phase.stageKeys)
const uniquePhaseStageKeys = [...new Set(phaseStageKeys)]

assert.equal(phaseStageKeys.length, uniquePhaseStageKeys.length, 'transfer stages are mapped to exactly one phase')
assert.deepEqual(
  [...uniquePhaseStageKeys].sort(),
  [...transferStageKeys].sort(),
  'every transfer stage is covered by the canonical journey phases',
)

for (const phase of phases) {
  assert.ok(phase.label, `${phase.key} has a label`)
  assert.ok(phase.description, `${phase.key} has a description`)
  assert.ok(phase.stageKeys.length > 0, `${phase.key} contains transfer stages`)
}

for (const definition of transferDefinitions) {
  const phase = getAttorneyJourneyPhaseForStage(definition.key, 'transfer')
  assert.ok(phase, `${definition.key} resolves to a transfer journey phase`)
  assert.ok(definition.label, `${definition.key} has an attorney-facing label`)
  assert.ok(definition.description, `${definition.key} has an attorney-facing description`)
  assert.ok(definition.actionLabel, `${definition.key} has an attorney action label`)
  assert.ok(definition.defaultVisibility, `${definition.key} has default visibility`)
  assert.equal(typeof definition.clientVisibleAllowed, 'boolean', `${definition.key} has explicit client visibility policy`)
  assert.ok(Array.isArray(definition.requiredData), `${definition.key} exposes required data metadata`)
  assert.ok(Array.isArray(definition.requiredDocuments), `${definition.key} exposes required document metadata`)
  assert.ok(Array.isArray(definition.evidenceRequirements), `${definition.key} exposes evidence requirements`)
  assert.ok(definition.evidenceRequirements.length > 0, `${definition.key} has completion evidence`)
}

assert.equal(
  getAttorneyJourneyPhaseForStage('rates_clearance_uploaded', 'transfer')?.key,
  'financial_preparation',
  'aliases resolve into the canonical transfer journey phase',
)
assert.equal(
  getAttorneyJourneyPhaseForStage('lodged', 'transfer')?.key,
  'lodgement_registration',
  'legacy transfer stage aliases remain phase-mapped',
)

console.log('transferAttorneyJourneyPhase1 tests passed')
