import assert from 'node:assert/strict'
import {
  buildTransferWorkspacePhaseMap,
  getTransferWorkspacePhaseForStage,
  TRANSFER_WORKSPACE_ACTION_CONTRACT,
  TRANSFER_WORKSPACE_PHASES,
  TRANSFER_WORKSPACE_SECTION_ORDER,
  TRANSFER_WORKSPACE_STATUS_OPTIONS,
} from '../src/constants/attorneyTransferWorkspacePresentation.js'
import { getAttorneyStageDefinitionsForLane } from '../src/constants/attorneyWorkflowStages.js'

const transferStages = getAttorneyStageDefinitionsForLane('transfer')
const presentation = buildTransferWorkspacePhaseMap(transferStages)
const mappedStageKeys = TRANSFER_WORKSPACE_PHASES.flatMap((phase) => phase.stageKeys)

assert.equal(transferStages.length, 37, 'the transfer workflow should expose all 37 defined steps')
assert.equal(new Set(mappedStageKeys).size, mappedStageKeys.length, 'each transfer step should belong to exactly one phase')
assert.deepEqual(presentation.unassignedSteps, [], 'every defined transfer step should have a presentation phase')
assert.deepEqual(presentation.missingStageKeys, [], 'every mapped phase step should exist in the workflow definition')
assert.deepEqual(
  TRANSFER_WORKSPACE_PHASES.map((phase) => phase.stageKeys.length),
  [5, 7, 9, 8, 5, 3],
  'the six phase counts should remain intentional and reviewable',
)
assert.deepEqual(
  TRANSFER_WORKSPACE_STATUS_OPTIONS.map((status) => status.key),
  ['complete', 'in_progress', 'waiting', 'blocked', 'not_started'],
  'the presentation should use one five-state vocabulary',
)
assert.deepEqual(
  TRANSFER_WORKSPACE_SECTION_ORDER,
  ['steps', 'required_information', 'documents', 'evidence', 'activity'],
  'every expanded phase should use the same content order',
)
assert.equal(getTransferWorkspacePhaseForStage('guarantees_requested')?.key, 'documents_signing_guarantees')
assert.equal(getTransferWorkspacePhaseForStage('registered')?.key, 'lodgement_registration')
assert.equal(getTransferWorkspacePhaseForStage('matter_closed')?.key, 'close_out')
assert.equal(getTransferWorkspacePhaseForStage('unknown_step'), null)

assert.deepEqual(
  Object.entries(TRANSFER_WORKSPACE_ACTION_CONTRACT)
    .filter(([, action]) => !action.aligned)
    .map(([actionType]) => actionType),
  [],
  'Phase 4 should keep every promoted transfer action aligned with its real handler',
)

console.log('attorney transfer workspace phase 1 tests passed')
