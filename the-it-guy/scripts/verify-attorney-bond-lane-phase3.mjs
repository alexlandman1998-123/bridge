import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  BOND_ATTORNEY_STAGE_COMMAND_PRESETS,
  buildAttorneyWorkflowActionCommand,
} from '../src/constants/attorneyWorkflowUsability.js'
import {
  BOND_LANE_PHASE3_COMMAND_PLAN_VERSION,
  buildBondLanePhase3CommandPlan,
} from '../src/services/attorneyWorkflow/bondLaneJourneyMap.js'

const fixedNow = '2026-07-06T00:00:00.000Z'

function buildBondEvidenceCommand(stageKey, label = '') {
  return buildAttorneyWorkflowActionCommand(
    {
      id: `${stageKey}_complete_evidence`,
      type: 'complete_stage_evidence',
      label: label || `Complete ${stageKey}`,
      description: 'Capture stage-specific evidence.',
      target: 'bond_attorney',
      laneKey: 'bond',
      stageKey,
    },
    { now: fixedNow },
  )
}

function verifyCommandPlan() {
  const plan = buildBondLanePhase3CommandPlan()

  assert.equal(plan.version, BOND_LANE_PHASE3_COMMAND_PLAN_VERSION)
  assert.equal(plan.status, 'ready_for_phase4')
  assert.deepEqual(plan.structuralBlockers, [])
  assert.equal(plan.stageSpecificCommands.every((item) => item.hasPreset), true)
  assert.equal(plan.stageSpecificCommands.every((item) => item.checklist.length >= 3), true)
  assert.ok(plan.noteOnlyStageKeys.includes('bank_conditions_outstanding'))
  assert.equal(Object.keys(BOND_ATTORNEY_STAGE_COMMAND_PRESETS).length, plan.stageSpecificCommands.length)
}

function verifyBankConditionsCommand() {
  const command = buildBondEvidenceCommand('bank_conditions_outstanding', 'Complete Bank Conditions Outstanding')

  assert.equal(command.laneKey, 'bond')
  assert.equal(command.stageKey, 'bank_conditions_outstanding')
  assert.equal(command.commandType, 'add_note')
  assert.equal(command.label, 'Capture Conditions')
  assert.equal(command.draft.visibility, 'internal')
  assert.match(command.draft.message, /Outstanding bank conditions captured/)
  assert.match(command.workPacket.checklist.join(' '), /responsible party/)
}

function verifyApprovalGuaranteeAndLodgementCommands() {
  const approval = buildBondEvidenceCommand('bank_approval_to_lodge_received')
  assert.equal(approval.commandType, 'complete_step')
  assert.equal(approval.label, 'Confirm Approval To Lodge')
  assert.equal(approval.draft.status, 'completed')
  assert.match(approval.draft.note, /approval to lodge received/i)
  assert.match(approval.workPacket.checklist.join(' '), /approval date\/reference/i)

  const guarantees = buildBondEvidenceCommand('guarantees_issued')
  assert.equal(guarantees.commandType, 'complete_step')
  assert.equal(guarantees.label, 'Confirm Guarantees Issued')
  assert.match(guarantees.draft.note, /transfer attorney/)
  assert.match(guarantees.workPacket.checklist.join(' '), /wording and expiry/i)

  const lodgementReady = buildBondEvidenceCommand('bond_lodgement_ready')
  assert.equal(lodgementReady.label, 'Mark Bond Ready')
  assert.match(lodgementReady.workPacket.checklist.join(' '), /simultaneous lodgement/i)

  const lodged = buildBondEvidenceCommand('bond_lodged')
  assert.equal(lodged.label, 'Mark Bond Lodged')
  assert.match(lodged.draft.note, /lodged simultaneously/)
  assert.match(lodged.workPacket.checklist.join(' '), /deeds office/)
}

function verifyStageSpecificBlockerCommand() {
  const command = buildAttorneyWorkflowActionCommand(
    {
      id: 'guarantees_issued_resolve_blocker',
      type: 'resolve_blocker',
      label: 'Resolve Guarantees Issued blocker',
      description: 'Bank guarantee wording must be corrected before transfer acceptance.',
      target: 'bond_attorney',
      laneKey: 'bond',
      stageKey: 'guarantees_issued',
    },
    { now: fixedNow },
  )

  assert.equal(command.commandType, 'add_note')
  assert.equal(command.label, 'Add Bond Blocker Note')
  assert.match(command.draft.message, /Blocker update for Confirm Guarantees Issued/)
  assert.match(command.draft.message, /guarantee wording/)
  assert.match(command.workPacket.checklist.join(' '), /transfer attorney/)
}

function verifyDoc() {
  const docSource = readFileSync(new URL('../docs/attorney-bond-lane-phase3-stage-commands.md', import.meta.url), 'utf8')
  assert.match(docSource, /Bond Lane Phase 3 Stage Commands/)
  assert.match(docSource, /bank_conditions_outstanding/)
  assert.match(docSource, /Confirm Guarantees Issued/)
  assert.match(docSource, /Non-Linear Handling/)
  assert.match(docSource, /node scripts\/verify-attorney-bond-lane-phase3\.mjs/)
}

verifyCommandPlan()
verifyBankConditionsCommand()
verifyApprovalGuaranteeAndLodgementCommands()
verifyStageSpecificBlockerCommand()
verifyDoc()

console.log('Attorney bond lane Phase 3 stage command verification passed.')
