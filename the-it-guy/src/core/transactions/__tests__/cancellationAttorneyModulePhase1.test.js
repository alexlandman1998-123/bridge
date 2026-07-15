import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CANCELLATION_ATTORNEY_PHASE1_ACTION_SEQUENCE,
  CANCELLATION_ATTORNEY_PHASE1_CONTROL_BOUNDARY,
  CANCELLATION_ATTORNEY_PHASE1_DOMAIN_DEFINITIONS,
  buildCancellationAttorneyPhase1BaselineReport,
  buildCancellationAttorneyPhase1Usability,
  decorateCancellationDocumentRequirement,
  validateCancellationAttorneyPhase1Usability,
} from '../cancellationAttorneyModulePhase1.js'
import { buildCancellationAttorneyPhase0BaselineReport } from '../cancellationAttorneyModulePhase0.js'
import { buildCancellationAttorneyCockpit } from '../attorneyCancellationWorldClassCockpit.js'

assert.deepEqual(
  CANCELLATION_ATTORNEY_PHASE1_ACTION_SEQUENCE.map((item) => item.id),
  ['confirm', 'request', 'upload', 'review', 'reconcile', 'sign'],
)
assert.equal(CANCELLATION_ATTORNEY_PHASE1_CONTROL_BOUNDARY.roleFocusedCockpitOnly, true)
assert.equal(CANCELLATION_ATTORNEY_PHASE1_CONTROL_BOUNDARY.generatesOperationalDocuments, false)
assert.equal(CANCELLATION_ATTORNEY_PHASE1_CONTROL_BOUNDARY.generatesLegalInstruments, false)
assert.equal(CANCELLATION_ATTORNEY_PHASE1_CONTROL_BOUNDARY.writesExternalSystem, false)
assert.equal(CANCELLATION_ATTORNEY_PHASE1_CONTROL_BOUNDARY.exposesStageAndResolverRequirementMismatch, true)

assert.deepEqual(
  CANCELLATION_ATTORNEY_PHASE1_DOMAIN_DEFINITIONS.map((item) => item.key),
  [
    'instruction_and_existing_bond',
    'figures_and_expiry',
    'guarantees',
    'documents_and_signing',
    'lodgement_and_registration',
    'settlement_and_closeout',
  ],
)

const uploadedFigures = decorateCancellationDocumentRequirement({
  id: 'cancellation_figures',
  label: 'Cancellation Figures',
  category: 'cancellation_documents',
  requiredFrom: 'seller',
  status: 'uploaded',
  requestId: 'request-figures',
})
assert.equal(uploadedFigures.status, 'review')
assert.equal(uploadedFigures.nextAction, 'Review and reconcile evidence')
assert.equal(uploadedFigures.actionMap.find((item) => item.id === 'reconcile').status, 'next')

const bankDocuments = decorateCancellationDocumentRequirement({
  id: 'bank_cancellation_documents',
  label: 'Bank Cancellation Documents',
  category: 'cancellation_documents',
  requiredFrom: 'attorney',
  clientUploadAllowed: false,
  status: 'missing',
})
assert.equal(bankDocuments.strategy, 'template_controlled')
assert.equal(bankDocuments.nextAction, 'Prepare only from governed template')
assert.equal(bankDocuments.actionMap.find((item) => item.id === 'upload').status, 'not_applicable')

const signedDocs = decorateCancellationDocumentRequirement({
  id: 'seller_signed_cancellation_documents',
  label: 'Seller Signed Cancellation Documents',
  category: 'cancellation_documents',
  requiredFrom: 'attorney',
  clientUploadAllowed: false,
  status: 'missing',
})
assert.equal(signedDocs.actionMap.find((item) => item.id === 'sign').status, 'waiting')

const lane = {
  laneKey: 'cancellation',
  label: 'Cancellation Attorney',
  currentStage: 'figures_expiry_captured',
  assigned: true,
  permissions: { canUpdateStage: true, canRequestDocuments: true },
  dataRequirements: [
    {
      id: 'cancellation_figures_expiry_date',
      label: 'Figures Expiry Date',
      owner: 'cancellation_attorney',
      severity: 'high',
      status: 'missing',
      stageKey: 'figures_expiry_captured',
    },
  ],
  documentRequirements: [
    { id: 'cancellation_instruction', label: 'Cancellation Instruction', category: 'cancellation_documents', requiredFrom: 'seller', status: 'complete' },
    { id: 'existing_bond_account_details', label: 'Existing Bond Account Details', category: 'cancellation_documents', requiredFrom: 'seller', status: 'requested', requestId: 'request-account' },
    { id: 'cancellation_figures', label: 'Cancellation Figures', category: 'cancellation_documents', requiredFrom: 'seller', status: 'uploaded', requestId: 'request-figures' },
    { id: 'cancellation_guarantees', label: 'Guarantees for Cancellation', category: 'cancellation_documents', requiredFrom: 'seller', status: 'missing' },
    { id: 'bank_cancellation_documents', label: 'Bank Cancellation Documents', category: 'cancellation_documents', requiredFrom: 'attorney', clientUploadAllowed: false, status: 'missing' },
    { id: 'proof_of_settlement', label: 'Proof of Settlement', category: 'cancellation_documents', requiredFrom: 'seller', status: 'missing' },
  ],
  signingRequirements: [{ id: 'seller_cancellation_documents_signature', laneKey: 'cancellation' }],
  coordinationSummary: {
    items: [
      { id: 'handoff-guarantee', laneKey: 'transfer', title: 'Transfer guarantee handoff', status: 'waiting' },
    ],
  },
}

const usability = buildCancellationAttorneyPhase1Usability(lane)
assert.equal(usability.version, 'cancellation_attorney_module_phase1_usability_v1')
assert.equal(usability.releaseBlockerId, 'cancellation_lane_usability_not_simplified')
assert.equal(usability.laneKey, 'cancellation')
assert.equal(usability.roleFocused, true)
assert.equal(usability.canAct, true)
assert.equal(usability.documentRequestActionLabel, 'Create Cancellation Document Requests')
assert.match(usability.documentRequestActionDescription, /does not generate bank forms/)
assert.equal(usability.counts.domainCount, 6)
assert.equal(usability.counts.stageCount, 19)
assert.equal(usability.domains.reduce((sum, domain) => sum + domain.stageCount, 0), 19)
assert.equal(usability.counts.hiddenRichRequirementCount, 0)
assert.ok(usability.counts.visibleRequirementCount >= 10)
assert.ok(usability.documentRequirements.some((item) => item.id === 'bank_cancellation_documents'))
assert.ok(usability.documentRequirements.some((item) => item.id === 'proof_of_settlement'))
assert.ok(usability.documentRequirements.some((item) => item.id === 'seller_signed_cancellation_documents'))
assert.ok(usability.documentCoverage.richRequirementIdsNotOnStages.includes('bank_cancellation_documents'))
assert.ok(usability.documentCoverage.richRequirementIdsNotOnStages.includes('proof_of_settlement'))
assert.ok(usability.documentCoverage.stageOnlyDocumentKeys.includes('seller_signed_cancellation_documents'))
assert.ok(usability.documentCoverage.stageOnlyDocumentKeys.includes('guarantee_letter'))
assert.equal(usability.counts.dataGapCount, 1)
assert.equal(usability.counts.signingRequirementCount, 1)
assert.equal(usability.primaryNextAction.actionLabel, 'Capture required cancellation data')
assert.ok(usability.nextActions.some((item) => item.actionLabel === 'Review and reconcile evidence'))
assert.ok(usability.nextActions.some((item) => item.actionLabel === 'Review cancellation requirement coverage'))
assert.equal(validateCancellationAttorneyPhase1Usability(usability).valid, true)

const readOnlyUsability = buildCancellationAttorneyPhase1Usability({
  currentStage: 'cancellation_instruction_received',
  permissions: { canUpdateStage: false, readOnlyReason: 'Assigned to another cancellation team.' },
})
assert.equal(readOnlyUsability.roleFocused, false)
assert.match(readOnlyUsability.readOnlyReason, /Assigned to another/)
assert.ok(readOnlyUsability.nextActions.some((item) => item.actionKey === 'read_only_cancellation_lane'))

const report = buildCancellationAttorneyPhase1BaselineReport(lane)
assert.equal(buildCancellationAttorneyPhase0BaselineReport().readyForPhase1, true)
assert.equal(report.readyForPhase2, true, JSON.stringify(report, null, 2))
assert.equal(report.phase0Ready, true)
assert.equal(report.domainCount, 6)
assert.equal(report.stageCount, 19)
assert.equal(report.hiddenRichRequirementCount, 0)
assert.ok(report.coverageWarningCount > 0)
assert.equal(report.documentRequestActionLabel, 'Create Cancellation Document Requests')
assert.equal(report.validation.valid, true, JSON.stringify(report.validation.errors, null, 2))

const cockpit = buildCancellationAttorneyCockpit({ lane })
assert.equal(cockpit.phase1Usability.version, 'cancellation_attorney_module_phase1_usability_v1')
assert.equal(cockpit.phase1Usability.counts.hiddenRichRequirementCount, 0)
assert.ok(cockpit.phase1Usability.documentRequirements.some((item) => item.id === 'proof_of_settlement'))

const cockpitSource = readFileSync(new URL('../attorneyCancellationWorldClassCockpit.js', import.meta.url), 'utf8')
assert.match(cockpitSource, /buildCancellationAttorneyPhase1Usability/)
assert.match(cockpitSource, /phase1Usability/)

console.log(`Cancellation attorney module Phase 1 usability baseline passed (${report.visibleRequirementCount} visible requirements).`)
