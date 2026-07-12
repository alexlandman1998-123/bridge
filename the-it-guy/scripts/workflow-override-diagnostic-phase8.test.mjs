#!/usr/bin/env node
import assert from 'node:assert/strict'

import {
  WORKFLOW_OVERRIDE_DIAGNOSTIC_MODES,
  assertWorkflowOverrideDiagnosticCoverage,
  buildWorkflowOverrideDiagnostic,
} from '../server/services/workflowOverrideDiagnosticService.js'

const diagnostic = buildWorkflowOverrideDiagnostic({
  transaction: {
    id: 'tx-override-diagnostic',
    finance_type: 'bond',
    seller_has_existing_bond: true,
  },
})

function findStep(workflowKey, stepKey) {
  return diagnostic.steps.find((step) => step.workflowKey === workflowKey && step.stepKey === stepKey)
}

function assertSupports(workflowKey, stepKey, mode) {
  const step = findStep(workflowKey, stepKey)
  assert.ok(step, `${workflowKey}.${stepKey} should be present in the diagnostic.`)
  assert.equal(step.support[mode]?.supported, true, `${workflowKey}.${stepKey} should support ${mode}.`)
  return step
}

assert.equal(diagnostic.version, 'workflow_override_diagnostic_v1')
assert.deepEqual(
  diagnostic.workflowKeys,
  ['sales_otp', 'finance_bond', 'attorney_transfer', 'attorney_bond', 'seller_bond_cancellation', 'registration'],
)
assert.equal(diagnostic.summary.missingOverridePathCount, 0)
assert.equal(assertWorkflowOverrideDiagnosticCoverage(diagnostic), true)

assertSupports('sales_otp', 'buyer_onboarding_complete', WORKFLOW_OVERRIDE_DIAGNOSTIC_MODES.agentAssisted)
assertSupports('sales_otp', 'seller_onboarding_complete', WORKFLOW_OVERRIDE_DIAGNOSTIC_MODES.agentAssisted)
assertSupports('sales_otp', 'signed_otp_received', WORKFLOW_OVERRIDE_DIAGNOSTIC_MODES.manualUploaded)
assertSupports('sales_otp', 'supporting_docs_complete', WORKFLOW_OVERRIDE_DIAGNOSTIC_MODES.agentAssisted)
assertSupports('attorney_transfer', 'transfer_documents_signed', WORKFLOW_OVERRIDE_DIAGNOSTIC_MODES.manualUploaded)
assertSupports('attorney_bond', 'bond_documents_signed', WORKFLOW_OVERRIDE_DIAGNOSTIC_MODES.manualUploaded)
assertSupports('seller_bond_cancellation', 'cancellation_documents_signed', WORKFLOW_OVERRIDE_DIAGNOSTIC_MODES.manualUploaded)

for (const step of diagnostic.steps.filter((item) => item.required && item.blocking)) {
  assert.equal(step.support[WORKFLOW_OVERRIDE_DIAGNOSTIC_MODES.waived]?.supported, true, `${step.workflowKey}.${step.stepKey} should support waiver fallback.`)
  assert.equal(step.support[WORKFLOW_OVERRIDE_DIAGNOSTIC_MODES.reopened]?.supported, true, `${step.workflowKey}.${step.stepKey} should support reopen fallback.`)
}

assert.ok(
  diagnostic.summary.manualCompletionGapCount > 0,
  'The diagnostic should still surface required steps that only have override fallback rather than clean manual/agent completion.',
)
assert.ok(
  diagnostic.gaps.manualCompletionMissing.some((step) => step.workflowKey === 'sales_otp' && step.stepKey === 'ready_for_finance_handoff'),
  'The diagnostic should report manual completion gaps for follow-up phases.',
)

assert.throws(
  () =>
    assertWorkflowOverrideDiagnosticCoverage({
      gaps: {
        missingOverridePath: [{ workflowKey: 'sales_otp', stepKey: 'signed_otp_received' }],
      },
    }),
  /sales_otp\.signed_otp_received/,
)

console.log('workflow override diagnostic Phase 8 tests passed')
