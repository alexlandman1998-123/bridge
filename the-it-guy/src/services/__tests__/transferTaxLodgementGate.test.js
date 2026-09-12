import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateTransferTaxLodgementReadiness } from '../attorneyWorkflow/transferTaxLodgementGate.js'

const completed = (stepKey) => ({ stepKey, status: 'completed' })

test('does not prevent ordinary work while the transfer-tax route is still being assessed', () => {
  const result = evaluateTransferTaxLodgementReadiness({
    transferTaxDecision: { route: 'needs_tax_advice', status: 'needs_confirmation' },
  })

  assert.equal(result.ready, false)
  assert.match(result.warnings[0], /Confirm the applicable transfer-tax route/i)
})

test('requires the duty submission and verified SARS proof before transfer-duty lodgement', () => {
  const decision = { route: 'transfer_duty', status: 'confirmed' }
  const incomplete = evaluateTransferTaxLodgementReadiness({
    transferTaxDecision: decision,
    steps: [completed('transfer_duty_tdc01_submission')],
  })
  assert.equal(incomplete.ready, false)
  assert.deepEqual(incomplete.missingRequirements.map((item) => item.key), ['sars_transfer_tax_receipt_verified'])

  const ready = evaluateTransferTaxLodgementReadiness({
    transferTaxDecision: decision,
    steps: [completed('transfer_duty_tdc01_submission'), completed('sars_transfer_tax_receipt_verified')],
  })
  assert.equal(ready.ready, true)
})

test('requires VAT or exemption evidence, and non-resident review when selected by the attorney', () => {
  const decision = {
    route: 'zero_rated_going_concern',
    status: 'confirmed',
    sellerNonResidentReview: 'yes',
  }
  const incomplete = evaluateTransferTaxLodgementReadiness({
    transferTaxDecision: decision,
    steps: [completed('vat_exemption_evidence_verified')],
  })
  assert.equal(incomplete.ready, false)
  assert.deepEqual(incomplete.missingRequirements.map((item) => item.key), ['sars_transfer_tax_receipt_verified', 'non_resident_seller_withholding_review'])

  const ready = evaluateTransferTaxLodgementReadiness({
    transferTaxDecision: decision,
    steps: [completed('vat_exemption_evidence_verified'), completed('sars_transfer_tax_receipt_verified'), completed('non_resident_seller_withholding_review')],
  })
  assert.equal(ready.ready, true)
})

test('does not treat not-applicable or external task labels as verified tax proof', () => {
  const result = evaluateTransferTaxLodgementReadiness({
    transferTaxDecision: { route: 'vat', status: 'confirmed' },
    steps: [{ stepKey: 'vat_exemption_evidence_verified', status: 'not_applicable' }],
  })

  assert.equal(result.ready, false)
})
