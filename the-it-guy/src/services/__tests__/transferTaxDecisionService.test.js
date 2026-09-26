import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyTransferTaxDecisionUpdate,
  resolveTransferTaxDecision,
} from '../transferTaxDecisionService.js'
import { resolveTransactionRoutingProfile } from '../transactionRoutingProfileService.js'
import { buildMatterWorkflowPlan } from '../attorneyWorkflow/matterWorkflowPlanService.js'
import { phase4DecisionIssues } from '../attorneyWorkflow/transferPhase4Policy.js'

test('does not infer a tax route from seller entity type', () => {
  const profile = resolveTransactionRoutingProfile({
    transaction: {
      id: 'matter-company-seller',
      seller_type: 'company',
      transaction_type: 'resale',
      routing_profile_json: {},
    },
  })

  assert.equal(profile.transferTaxDecision.route, 'needs_tax_advice')
  assert.equal(profile.vatTreatment, 'unknown')
})

test('records the attorney confirmation and a bounded audit entry', () => {
  const decision = applyTransferTaxDecisionUpdate(
    {},
    {
      route: 'vat',
      sellerVatRegistered: 'yes',
      supplyInCourseOfEnterprise: 'yes',
      sellerNonResidentReview: 'no',
      sarsStatus: 'submitted',
      basisNote: 'Seller is a VAT vendor and the sale is in the course of its enterprise.',
    },
    { userId: 'attorney-1', role: 'attorney', confirmedAt: '2026-09-10T12:00:00.000Z' },
  )

  assert.equal(decision.status, 'confirmed')
  assert.equal(decision.confirmedBy, 'attorney-1')
  assert.equal(decision.audit.length, 1)
  assert.equal(decision.audit[0].previousRoute, 'needs_tax_advice')
  assert.equal(decision.audit[0].route, 'vat')
  assert.equal(decision.sarsStatus, 'not_started', 'a newly selected route needs fresh SARS proof')
})

test('uses a confirmed attorney decision ahead of legacy VAT fields', () => {
  const profile = resolveTransactionRoutingProfile({
    transaction: {
      id: 'matter-tax-decision',
      vat_treatment: 'transfer_duty',
      routing_profile_json: {
        transferTaxDecision: {
          route: 'vat',
          status: 'confirmed',
          confirmedAt: '2026-09-10T12:00:00.000Z',
        },
      },
    },
  })

  assert.equal(profile.vatTreatment, 'vat')
})

test('builds only the applicable transfer-tax tasks', () => {
  const transferDutyPlan = buildMatterWorkflowPlan({
    routingProfile: {
      financeType: 'cash',
      transferTaxDecision: {
        route: 'transfer_duty',
        sarsEvidenceRequest: 'yes',
        dutyPaymentRequired: 'yes',
        sellerNonResidentReview: 'yes',
      },
    },
  })
  const transferSteps = transferDutyPlan.lanes.find((lane) => lane.laneKey === 'transfer').stepKeys
  assert.deepEqual(
    transferSteps.filter((key) => key.includes('tax') || key.includes('tdc01') || key.includes('sars') || key.includes('withholding') || key.includes('assessment')),
    ['transfer_tax_route_confirmed', 'transfer_duty_tdc01_submission', 'sars_evidence_request_response', 'transfer_duty_assessment_payment', 'non_resident_seller_withholding_payment_review', 'sars_transfer_tax_receipt_verified'],
  )

  const vatPlan = buildMatterWorkflowPlan({
    routingProfile: { financeType: 'cash', transferTaxDecision: { route: 'vat' } },
  })
  const vatSteps = vatPlan.lanes.find((lane) => lane.laneKey === 'transfer').stepKeys
  assert.equal(vatSteps.includes('transfer_duty_tdc01_submission'), false)
  assert.equal(vatSteps.includes('ordinary_vat_basis_verified'), true)
  assert.equal(vatSteps.includes('vat_exemption_evidence_verified'), false)
})

test('keeps legacy values readable without presenting them as an attorney confirmation', () => {
  const decision = resolveTransferTaxDecision({ vatTreatment: 'transfer_duty' })

  assert.equal(decision.route, 'transfer_duty')
  assert.equal(decision.status, 'needs_confirmation')
  assert.equal(decision.confirmedBy, null)
  assert.equal(decision.audit.length, 0)
})

test('route correction retires old tasks and requires new SARS proof without erasing audit', () => {
  const old = applyTransferTaxDecisionUpdate({}, { route: 'transfer_duty', basisNote: 'Initially dutiable',
    tdc01Reference: 'TDC01-1', sarsProofReference: 'OLD-SARS' }, { userId: 'attorney-1' })
  const next = applyTransferTaxDecisionUpdate(old, { ...old, route: 'zero_rated_going_concern',
    basisNote: 'Written going-concern sale' }, { userId: 'attorney-1' })
  assert.equal(next.sarsProofReference, '')
  assert.equal(next.audit.length, 2)
  const before = buildMatterWorkflowPlan({ routingProfile: { financeType: 'cash', transferTaxDecision: old } })
  const after = buildMatterWorkflowPlan({ routingProfile: { financeType: 'cash', transferTaxDecision: next } })
  const oldSteps = before.lanes[0].stepKeys
  const newSteps = after.lanes[0].stepKeys
  assert.ok(oldSteps.includes('transfer_duty_tdc01_submission'))
  assert.ok(!newSteps.includes('transfer_duty_tdc01_submission'))
  assert.ok(newSteps.includes('going_concern_zero_rate_verified'))
})

test('separates sectional body-corporate and HOA routes', () => {
  const sectional = buildMatterWorkflowPlan({ routingProfile: { propertyTenure: 'sectional_title', hoaApplicable: 'no' } })
  const combined = buildMatterWorkflowPlan({ routingProfile: { propertyTenure: 'sectional_title', hoaApplicable: 'yes' } })
  assert.ok(sectional.lanes[0].stepKeys.includes('body_corporate_levy_clearance_review'))
  assert.ok(!sectional.lanes[0].stepKeys.includes('hoa_clearance_review'))
  assert.ok(combined.lanes[0].stepKeys.includes('body_corporate_levy_clearance_review'))
  assert.ok(combined.lanes[0].stepKeys.includes('hoa_clearance_review'))
})

test('holds certificate and title routes until the property decisions are specific', () => {
  const tax = { route: 'transfer_duty', status: 'confirmed', tdc01Reference: 'TDC01',
    dutyPaymentRequired: 'no', sarsStatus: 'receipted', basisNote: 'Dutiable', sarsProofReference: 'SARS' }
  const conditions = { titleRestrictions: 'yes', complianceCertificates: 'yes',
    clearances: { municipal: { issuer: 'Municipality', validUntil: '2030-01-01' } } }
  const issues = phase4DecisionIssues(tax, {}, conditions, { propertyTenure: 'freehold', hoaApplicable: 'no' })
  assert.ok(issues.includes('title condition evidence'))
  assert.ok(issues.includes('gas certificate applicability'))
  const plan = buildMatterWorkflowPlan({ routingProfile: {
    propertyTenure: 'freehold', hoaApplicable: 'no', propertyConditions: conditions,
    transferTaxDecision: tax,
  } })
  assert.ok(plan.lanes[0].stepKeys.includes('title_conditions_review'))
  assert.ok(plan.lanes[0].stepKeys.includes('property_compliance_review'))
})

test('records separate applicability and proof for each claimed exemption', () => {
  const decision = resolveTransferTaxDecision({ route: 'exempt', status: 'confirmed', sarsStatus: 'receipted', basisNote: 'Two claims reviewed',
    sarsProofReference: 'SARS exemption receipt', exemptionClaims: [
      { statutoryBasis: 'Provision A', appliesTo: 'seller one share', applicable: 'yes', evidenceReference: 'A-proof', basisNote: 'Applies to first share' },
      { statutoryBasis: 'Provision B', appliesTo: 'seller two share', applicable: 'no', basisNote: 'Does not apply to second share' },
    ] })
  assert.deepEqual(phase4DecisionIssues(decision), [])
  const incomplete = { ...decision, exemptionClaims: decision.exemptionClaims.map((claim) => ({ ...claim, applicable: 'no' })) }
  assert.ok(phase4DecisionIssues(incomplete).includes('at least one applicable statutory exemption'))
})
