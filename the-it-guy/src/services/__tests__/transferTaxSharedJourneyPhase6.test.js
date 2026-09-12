import assert from 'node:assert/strict'
import test from 'node:test'
import { getAttorneyStageDefinition } from '../../constants/attorneyWorkflowStages.js'
import { presentAttorneyTaskOperationalContract } from '../../core/transactions/attorneyTaskOperationalContract.js'

test('keeps route-specific transfer-tax operations out of client-facing task contracts', () => {
  for (const taskKey of [
    'transfer_tax_route_confirmed',
    'transfer_duty_tdc01_submission',
    'sars_evidence_request_response',
    'transfer_duty_assessment_payment',
    'vat_exemption_evidence_verified',
    'non_resident_seller_withholding_review',
  ]) {
    const definition = getAttorneyStageDefinition(taskKey, 'transfer')
    assert.equal(definition.clientVisibleAllowed, false, `${taskKey} must remain internal`)
    assert.equal(presentAttorneyTaskOperationalContract(definition.operationalContract, { viewerRole: 'buyer' }), null)
    assert.equal(presentAttorneyTaskOperationalContract(definition.operationalContract, { viewerRole: 'seller' }), null)
  }
})

test('presents only a neutral transfer-tax clearance milestone to clients', () => {
  const definition = getAttorneyStageDefinition('sars_transfer_tax_receipt_verified', 'transfer')
  const buyerView = presentAttorneyTaskOperationalContract(definition.operationalContract, { viewerRole: 'buyer' })
  const sellerView = presentAttorneyTaskOperationalContract(definition.operationalContract, { viewerRole: 'seller' })

  assert.equal(definition.clientVisibleAllowed, true)
  assert.equal(buyerView.label, 'Transfer tax clearance')
  assert.equal(sellerView.label, 'Transfer tax clearance')
  assert.doesNotMatch(buyerView.description, /vat|non-resident|tdc01|sars/i)
})
