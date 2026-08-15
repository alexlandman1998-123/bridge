import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildAttorneyWorkflowCoordinationSummary } from '../src/constants/attorneyWorkflowUsability.js'
import { buildTransferWorkspaceViewModel } from '../src/services/attorneyWorkflow/transferWorkspaceViewModel.js'

function lane(laneKey, {
  assignment = { firmName: 'Assigned Firm' },
  currentStage = '',
  laneStatus = 'in_progress',
  steps = [],
} = {}) {
  return {
    laneKey,
    assignment,
    currentStage,
    currentStageLabel: currentStage,
    laneStatus,
    steps: steps.map((step, index) => ({
      sortOrder: index + 1,
      ...step,
    })),
    summary: { currentStage, status: laneStatus },
  }
}

const transferLane = lane('transfer', {
  currentStage: 'guarantees_received',
  steps: [
    { stepKey: 'instruction_received', status: 'completed' },
    { stepKey: 'guarantees_received', status: 'completed' },
    { stepKey: 'transfer_guarantees_accepted', status: 'waiting' },
    { stepKey: 'lodgement_ready', status: 'not_started' },
  ],
})

const bondLane = lane('bond', {
  currentStage: 'guarantees_issued',
  steps: [
    { stepKey: 'bond_instruction_received', status: 'completed' },
    { stepKey: 'guarantees_issued', status: 'completed' },
    { stepKey: 'bond_lodgement_ready', status: 'waiting' },
  ],
})

const cancellationLane = lane('cancellation', {
  assignment: null,
  currentStage: 'cancellation_guarantees_received',
  steps: [
    { stepKey: 'cancellation_instruction_received', status: 'completed' },
    { stepKey: 'cancellation_guarantees_received', status: 'waiting' },
    { stepKey: 'cancellation_guarantees_accepted', status: 'not_started' },
    { stepKey: 'cancellation_lodgement_ready', status: 'not_started' },
  ],
})

function verifyTransferCoordination() {
  const summary = buildAttorneyWorkflowCoordinationSummary({
    laneKey: 'transfer',
    lanes: [transferLane, bondLane, cancellationLane],
  })

  assert.equal(summary.health, 'blocked')
  assert.equal(summary.counts.total, 4)
  assert.equal(summary.counts.ready, 1)
  assert.equal(summary.counts.waiting, 1)
  assert.equal(summary.counts.blocked, 2)
  assert.equal(summary.primaryDependency.laneKey, 'cancellation')
  assert.equal(summary.items.find((item) => item.id === 'bond_bond_guarantees_issued').status, 'ready')
  assert.equal(summary.items.find((item) => item.id === 'bond_bond_lodgement_ready').status, 'waiting')
  assert.equal(summary.items.find((item) => item.id === 'cancellation_cancellation_guarantees_accepted').status, 'blocked')
}

function verifyBondCoordination() {
  const summary = buildAttorneyWorkflowCoordinationSummary({
    laneKey: 'bond',
    lanes: [transferLane, bondLane],
  })

  assert.equal(summary.health, 'waiting')
  assert.equal(summary.counts.total, 2)
  assert.equal(summary.counts.waiting, 2)
  assert.equal(summary.primaryDependency.title, 'Transfer guarantee acceptance')
}

function verifyReadyCoordination() {
  const readyTransfer = lane('transfer', {
    currentStage: 'lodgement_ready',
    steps: [
      { stepKey: 'instruction_received', status: 'completed' },
      { stepKey: 'transfer_guarantees_accepted', status: 'completed' },
      { stepKey: 'lodgement_ready', status: 'completed' },
    ],
  })
  const summary = buildAttorneyWorkflowCoordinationSummary({
    laneKey: 'bond',
    lanes: [readyTransfer, bondLane],
  })

  assert.equal(summary.health, 'ready')
  assert.equal(summary.counts.ready, 2)
  assert.equal(summary.items.every((item) => item.status === 'ready'), true)
}

function verifyNoDependencyLaneIsClear() {
  const summary = buildAttorneyWorkflowCoordinationSummary({
    laneKey: 'transfer',
    lanes: [transferLane],
  })

  assert.equal(summary.health, 'clear')
  assert.equal(summary.counts.total, 0)
  assert.equal(summary.primaryDependency, null)
}

function verifyPhase9Wiring() {
  const usabilitySource = readFileSync(new URL('../src/constants/attorneyWorkflowUsability.js', import.meta.url), 'utf8')
  const serviceSource = readFileSync(new URL('../src/services/attorneyWorkflow/attorneyWorkflowLaneService.js', import.meta.url), 'utf8')
  const transferWorkspaceSource = readFileSync(new URL('../src/services/attorneyWorkflow/transferWorkspaceViewModel.js', import.meta.url), 'utf8')
  const pageSource = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
  const uatDocSource = readFileSync(new URL('../docs/attorney-transfer-phase9-uat-release-gate.md', import.meta.url), 'utf8')

  assert.match(usabilitySource, /export function buildAttorneyWorkflowCoordinationSummary/)
  assert.match(usabilitySource, /COORDINATION_RULES/)
  assert.match(serviceSource, /buildAttorneyWorkflowCoordinationSummary/)
  assert.match(serviceSource, /coordinationSummary:/)
  assert.match(pageSource, /function LegalWorkflowCoordinationPanel/)
  assert.match(pageSource, /summary=\{lane\.coordinationSummary\}/)
  assert.match(pageSource, /summary=\{lane\?\.coordinationSummary\}/)
  assert.match(transferWorkspaceSource, /function buildTransferRolloutStatusSummary/)
  assert.match(transferWorkspaceSource, /function buildTransferUatReport/)
  assert.match(transferWorkspaceSource, /rolloutStatusSummary/)
  assert.match(transferWorkspaceSource, /uatReport/)
  assert.match(pageSource, /Transfer Coverage/)
  assert.match(pageSource, /transferScenario\.coverageItems/)
  assert.match(uatDocSource, /Transfer Attorney Phase 9 UAT And Release Gate/)
  assert.match(uatDocSource, /buildTransferWorkspaceViewModel\(\.\.\.\)\.rolloutStatusSummary/)
  assert.match(uatDocSource, /node scripts\/verify-attorney-workflow-phase9\.mjs/)
}

function buildTransferWorkflowFixture({ facts = {}, lane = {}, transaction = {}, onboardingFormData = null } = {}) {
  return {
    title: 'Transfer Progress',
    statusLabel: 'In Progress',
    facts,
    transaction,
    onboardingFormData,
    lane: {
      laneKey: 'transfer',
      currentStage: 'entity_authority_checked',
      permissions: {
        canUpdateStage: true,
        canUploadDocuments: true,
        canRequestDocuments: true,
        canAddNotes: true,
      },
      steps: [
        { id: 'step-1', stepKey: 'instruction_received', status: 'completed', sortOrder: 1 },
        { id: 'step-2', stepKey: 'matter_opened', status: 'completed', sortOrder: 2 },
        { id: 'step-3', stepKey: 'buyer_fica_requested', status: 'completed', sortOrder: 3 },
        { id: 'step-4', stepKey: 'seller_fica_requested', status: 'completed', sortOrder: 4 },
        { id: 'step-5', stepKey: 'entity_authority_checked', status: 'in_progress', sortOrder: 5 },
        { id: 'step-6', stepKey: 'buyer_signing_scheduled', status: 'not_started', sortOrder: 6 },
        { id: 'step-7', stepKey: 'transfer_duty_assessment_prepared', status: 'not_started', sortOrder: 7 },
      ],
      documentRequirements: [],
      ...lane,
    },
  }
}

function buildTransferModel(fixture = {}, selectedTaskKey = 'entity_authority_checked') {
  return buildTransferWorkspaceViewModel({
    workflow: buildTransferWorkflowFixture(fixture),
    selectedTaskKey,
    now: '2026-07-06T00:00:00.000Z',
  })
}

function transferTask(model, key) {
  return model.tasks.find((item) => item.key === key)
}

function verifyTransferReleaseGateSummary() {
  const model = buildTransferModel({
    facts: {
      financeType: 'bond',
      buyerEntityType: 'company',
      sellerEntityType: 'trust',
      sellerHasExistingBond: true,
      cancellationRequired: true,
    },
  })

  assert.equal(model.rolloutReadiness.status, 'ready')
  assert.equal(model.rolloutStatusSummary.releaseGateStatus, 'go')
  assert.equal(model.rolloutStatusSummary.blockerCount, 0)
  assert.equal(model.rolloutStatusSummary.warningCount, 0)
  assert.ok(model.rolloutStatusSummary.checks.every((check) => check.status === 'ready'))
  assert.equal(model.uatReport.releaseGateStatus, 'go')
  assert.equal(model.uatReport.checklist.length, 7)
  assert.ok(model.uatReport.checklist.every((item) => item.id && item.label && item.expectedOutcome && item.proofKey && item.required))
  assert.deepEqual(model.uatReport.signoffGaps, [])
}

function verifyTransferReleaseGateScenarioMatrix() {
  const scenarios = [
    {
      name: 'cash individual',
      facts: {
        financeType: 'cash',
        buyerEntityType: 'individual',
        buyerMaritalStatus: 'single',
        sellerEntityType: 'individual',
        sellerMaritalStatus: 'single',
        sellerHasExistingBond: false,
      },
      assertions(model) {
        assert.equal(model.rolloutStatusSummary.releaseGateStatus, 'go')
        assert.equal(model.scenario.finance.requiresGuarantees, false)
        assert.equal(transferTask(model, 'guarantees_requested'), undefined)
      },
    },
    {
      name: 'married capacity',
      facts: {
        financeType: 'cash',
        buyerEntityType: 'individual',
        buyerMaritalStatus: 'married_in_community',
        sellerEntityType: 'individual',
        sellerMaritalStatus: 'single',
        sellerHasExistingBond: false,
      },
      assertions(model) {
        assert.equal(model.rolloutStatusSummary.releaseGateStatus, 'go')
        assert.ok(transferTask(model, 'entity_authority_checked').requiredDocumentKeys.includes('buyer_spouse_consent'))
      },
    },
    {
      name: 'company trust cancellation',
      facts: {
        financeType: 'bond',
        buyerEntityType: 'company',
        sellerEntityType: 'trust',
        sellerHasExistingBond: true,
        cancellationRequired: true,
      },
      assertions(model) {
        assert.equal(model.rolloutStatusSummary.releaseGateStatus, 'go')
        assert.equal(model.scenario.cancellation.required, true)
        assert.ok(transferTask(model, 'entity_authority_checked').requiredDocumentKeys.includes('buyer_company_resolution'))
        assert.ok(transferTask(model, 'entity_authority_checked').requiredDocumentKeys.includes('seller_trust_deed'))
      },
    },
    {
      name: 'hybrid trust company',
      facts: {
        financeType: 'hybrid',
        buyerEntityType: 'trust',
        sellerEntityType: 'company',
        sellerHasExistingBond: true,
      },
      assertions(model) {
        assert.equal(model.rolloutStatusSummary.releaseGateStatus, 'go')
        assert.equal(model.scenario.finance.type, 'combination')
        assert.ok(transferTask(model, 'entity_authority_checked').requiredDocumentKeys.includes('buyer_trust_deed'))
        assert.ok(transferTask(model, 'entity_authority_checked').requiredDocumentKeys.includes('seller_company_resolution'))
      },
    },
  ]

  scenarios.forEach((scenario) => {
    const model = buildTransferModel({ facts: scenario.facts })
    assert.equal(model.rolloutReadiness.scenarioProof.coverageItemCount, 4, scenario.name)
    assert.equal(model.rolloutReadiness.workflowProof.concurrentWorkAllowed, true, scenario.name)
    assert.ok(model.rolloutReadiness.workflowProof.evidenceControlledTaskCount > 0, scenario.name)
    scenario.assertions(model)
  })
}

function verifyTransferReleaseGateBlocksUnknownOrBrokenCoverage() {
  const unknownModel = buildTransferModel({ facts: {} })
  assert.equal(unknownModel.rolloutReadiness.status, 'attention')
  assert.equal(unknownModel.rolloutStatusSummary.releaseGateStatus, 'review')
  assert.ok(unknownModel.uatReport.signoffGaps.some((gap) => gap.includes('Buyer Capacity')))
  assert.ok(unknownModel.uatReport.signoffGaps.some((gap) => gap.includes('Finance Route')))
}

function verifyTransferReleaseGateCompletionEvidence() {
  const missingEvidenceModel = buildTransferModel({
    facts: {
      financeType: 'cash',
      buyerEntityType: 'individual',
      buyerMaritalStatus: 'married_in_community',
      sellerEntityType: 'individual',
      sellerMaritalStatus: 'single',
      sellerHasExistingBond: false,
    },
  })

  assert.equal(transferTask(missingEvidenceModel, 'entity_authority_checked').completionReadiness.canComplete, false)
  assert.equal(missingEvidenceModel.rolloutStatusSummary.checks.find((check) => check.key === 'completion_evidence')?.status, 'ready')
  assert.ok(missingEvidenceModel.rolloutReadiness.workflowProof.completionBlockedTaskCount > 0)

  const readyEvidenceModel = buildTransferModel({
    facts: {
      financeType: 'cash',
      buyerEntityType: 'individual',
      buyerMaritalStatus: 'married_in_community',
      sellerEntityType: 'individual',
      sellerMaritalStatus: 'single',
      sellerHasExistingBond: false,
    },
    lane: {
      documentRequirements: [
        { id: 'buyer_id_document', label: 'Buyer ID Document', status: 'approved', complete: true },
        { id: 'buyer_proof_of_address', label: 'Buyer Proof of Address', status: 'approved', complete: true },
        { id: 'buyer_marital_status_documents', label: 'Buyer Marital Status Documents', status: 'approved', complete: true },
        { id: 'buyer_spouse_consent', label: 'Buyer Spouse Consent', status: 'approved', complete: true },
        { id: 'seller_id_document', label: 'Seller ID Document', status: 'approved', complete: true },
        { id: 'seller_proof_of_address', label: 'Seller Proof of Address', status: 'approved', complete: true },
      ],
    },
  })
  assert.equal(transferTask(readyEvidenceModel, 'entity_authority_checked').completionReadiness.canComplete, true)
}

verifyTransferCoordination()
verifyBondCoordination()
verifyReadyCoordination()
verifyNoDependencyLaneIsClear()
verifyPhase9Wiring()
verifyTransferReleaseGateSummary()
verifyTransferReleaseGateScenarioMatrix()
verifyTransferReleaseGateBlocksUnknownOrBrokenCoverage()
verifyTransferReleaseGateCompletionEvidence()

console.log('Attorney workflow Phase 9 coordination and transfer rollout release gate verification passed.')
