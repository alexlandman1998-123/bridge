import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SELLER_WORKFLOW_STAGES,
  advanceSellerWorkflowState,
  createSellerWorkflowState,
  deriveSellerWorkflowState,
} from '../sellerWorkflowState.js'

test('records a monotonic seller workflow history', () => {
  const sent = createSellerWorkflowState({ at: '2026-01-01T00:00:00.000Z' })
  const submitted = advanceSellerWorkflowState(sent, { stage: SELLER_WORKFLOW_STAGES.basicIntakeSubmitted, at: '2026-01-02T00:00:00.000Z' })
  assert.equal(submitted.stage, SELLER_WORKFLOW_STAGES.basicIntakeSubmitted)
  assert.equal(submitted.history.length, 2)
  assert.throws(() => advanceSellerWorkflowState(submitted, { stage: SELLER_WORKFLOW_STAGES.onboardingSent }), /cannot move backwards/)
  assert.equal(advanceSellerWorkflowState(submitted, { stage: SELLER_WORKFLOW_STAGES.onboardingSent, preserveLaterStage: true }).stage, SELLER_WORKFLOW_STAGES.basicIntakeSubmitted)
})

test('derives FICA requests and signing progress after basic intake', () => {
  const workflow = deriveSellerWorkflowState({
    onboarding: { status: 'completed' },
    requirements: [{ group: 'fica', status: 'requested' }],
    signing: { requiredCount: 2, complete: false },
  })
  assert.equal(workflow.stage, SELLER_WORKFLOW_STAGES.signaturesInProgress)
})

test('keeps mandate signing separate from outstanding FICA collection while recording documents prepared', () => {
  const workflow = deriveSellerWorkflowState({
    onboarding: { status: 'completed' },
    requirements: [{ group: 'fica', status: 'requested' }],
    documents: [{ documentType: 'mandate', status: 'uploaded' }],
  })

  assert.equal(workflow.stage, SELLER_WORKFLOW_STAGES.documentsPrepared)
})
