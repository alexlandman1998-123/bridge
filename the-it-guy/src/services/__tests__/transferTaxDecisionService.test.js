import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyTransferTaxDecisionUpdate,
  resolveTransferTaxDecision,
} from '../transferTaxDecisionService.js'
import { resolveTransactionRoutingProfile } from '../transactionRoutingProfileService.js'
import { buildMatterWorkflowPlan } from '../attorneyWorkflow/matterWorkflowPlanService.js'

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
  assert.equal(decision.sarsStatus, 'submitted')
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
    ['transfer_tax_route_confirmed', 'transfer_duty_tdc01_submission', 'sars_evidence_request_response', 'transfer_duty_assessment_payment', 'non_resident_seller_withholding_review', 'sars_transfer_tax_receipt_verified'],
  )

  const vatPlan = buildMatterWorkflowPlan({
    routingProfile: { financeType: 'cash', transferTaxDecision: { route: 'vat' } },
  })
  const vatSteps = vatPlan.lanes.find((lane) => lane.laneKey === 'transfer').stepKeys
  assert.equal(vatSteps.includes('transfer_duty_tdc01_submission'), false)
  assert.equal(vatSteps.includes('vat_exemption_evidence_verified'), true)
})

test('keeps legacy values readable without presenting them as an attorney confirmation', () => {
  const decision = resolveTransferTaxDecision({ vatTreatment: 'transfer_duty' })

  assert.equal(decision.route, 'transfer_duty')
  assert.equal(decision.status, 'needs_confirmation')
  assert.equal(decision.confirmedBy, null)
  assert.equal(decision.audit.length, 0)
})
