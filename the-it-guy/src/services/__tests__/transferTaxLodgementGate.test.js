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
  const decision = { route: 'transfer_duty', status: 'confirmed', sarsStatus: 'receipted', tdc01Reference: 'TDC01-1',
    dutyPaymentRequired: 'no', basisNote: 'Dutiable purchase', sarsProofReference: 'SARS-1' }
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

test('requires going-concern and per-seller non-resident evidence', () => {
  const decision = {
    route: 'zero_rated_going_concern',
    status: 'confirmed',
    sarsStatus: 'receipted',
    sellerVatRegistered: 'yes', supplyInCourseOfEnterprise: 'yes',
    sellerVatNumberReference: 'VAT-1', goingConcernAgreementReference: 'OTP-1',
    buyerVatRegistered: 'yes', buyerVatNumberReference: 'BUYER-VAT-1',
    basisNote: 'Written going concern', sarsProofReference: 'SARS-2',
    nonResidentSellers: { 'seller:one': { applicable: 'yes', directiveStatus: 'issued',
      directiveReference: 'DIR-1', withholdingRequired: 'yes', paymentReference: 'PAY-1',
      proofReference: 'FILE-1', basisNote: 'Company seller; attorney reviewed amount and directive.' } },
  }
  const scenarioProfile = { parties: [{ id: 'seller:one', role: 'seller', taxResidence: 'outside_south_africa' }] }
  const incomplete = evaluateTransferTaxLodgementReadiness({
    transferTaxDecision: decision, scenarioProfile,
    steps: [completed('going_concern_zero_rate_verified')],
  })
  assert.equal(incomplete.ready, false)
  assert.deepEqual(incomplete.missingRequirements.map((item) => item.key), [
    'non_resident_seller_applicability_review', 'non_resident_seller_directive_review',
    'non_resident_seller_withholding_payment_review', 'sars_transfer_tax_receipt_verified',
  ])

  const ready = evaluateTransferTaxLodgementReadiness({
    transferTaxDecision: decision, scenarioProfile,
    steps: ['going_concern_zero_rate_verified','non_resident_seller_applicability_review',
      'non_resident_seller_directive_review','non_resident_seller_withholding_payment_review',
      'sars_transfer_tax_receipt_verified'].map(completed),
  })
  assert.equal(ready.ready, true)
})

test('does not treat not-applicable or external task labels as verified tax proof', () => {
  const result = evaluateTransferTaxLodgementReadiness({
    transferTaxDecision: { route: 'vat', status: 'confirmed', sarsStatus: 'receipted', sellerVatRegistered: 'yes',
      supplyInCourseOfEnterprise: 'yes', sellerVatNumberReference: 'VAT-1',
      basisNote: 'Taxable supply', sarsProofReference: 'SARS-1' },
    steps: [{ stepKey: 'ordinary_vat_basis_verified', status: 'not_applicable' },
      completed('sars_transfer_tax_receipt_verified')],
  })

  assert.equal(result.ready, false)
})
