import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSharedMatterJourney } from '../../core/transactions/sharedMatterJourneyContract.js'
import { buildTransferTaxCrossRoleAssurance } from '../attorneyWorkflow/transferTaxCrossRoleAssurance.js'

const INTERNAL_TAX_TASKS = [
  'transfer_tax_route_confirmed',
  'transfer_duty_tdc01_submission',
  'sars_evidence_request_response',
  'transfer_duty_assessment_payment',
  'vat_exemption_evidence_verified',
  'non_resident_seller_withholding_review',
]

function journeyFor({ route = 'transfer_duty', statusByKey = {} } = {}) {
  const task = (key, label, clientLabel) => ({
    key,
    label,
    clientLabel,
    status: statusByKey[key] || 'not_started',
    revision: 7,
    outstandingEvidenceCount: 0,
  })
  return buildSharedMatterJourney({
    transactionId: 'matter-transfer-tax-phase7',
    revision: 7,
    planRevision: 8,
    lanes: [{
      key: 'transfer',
      phases: [{
        key: 'financial_preparation',
        label: 'Financial preparation',
        clientLabel: 'Transfer progress',
        tasks: [
          ...INTERNAL_TAX_TASKS.map((key) => task(key, key.replaceAll('_', ' '), 'Transfer progress')),
          task('sars_transfer_tax_receipt_verified', 'Verify SARS Transfer-Tax Receipt', 'Transfer tax clearance'),
        ],
      }],
    }],
    overallJourney: { percent: 0, source: 'workflow', revision: 7 },
  })
}

test('keeps every role on the same tax-task status while keeping buyer and seller wording safe', () => {
  const journey = journeyFor({ statusByKey: {
    transfer_tax_route_confirmed: 'completed',
    transfer_duty_tdc01_submission: 'completed',
    sars_transfer_tax_receipt_verified: 'completed',
  } })
  const report = buildTransferTaxCrossRoleAssurance({
    journey,
    transferTaxDecision: { route: 'transfer_duty', status: 'confirmed' },
  })

  assert.equal(report.ready, true)
  assert.equal(report.lodgementReadiness.ready, true)
  assert.deepEqual(report.audiences, ['attorney', 'developer', 'agent', 'buyer', 'seller'])
  const buyerTasks = report.views.buyer.lanes[0].phases[0].tasks
  assert.equal(buyerTasks[0].label, 'Transfer progress')
  assert.equal(buyerTasks.at(-1).label, 'Transfer tax clearance')
  assert.equal(buyerTasks[0].key, 'task_1')
  assert.equal(report.views.seller.lanes[0].phases[0].tasks.at(-1).status, 'completed')
  assert.equal(report.views.developer.lanes[0].phases[0].tasks.find((task) => task.key === 'sars_transfer_tax_receipt_verified').revision, 7)
  assert.equal(JSON.stringify(report.views.buyer), JSON.stringify(report.views.seller).replaceAll('"audience":"seller"', '"audience":"buyer"'))
})

test('uses the VAT evidence gate without exposing the route to client portals', () => {
  const journey = journeyFor({ statusByKey: {
    transfer_tax_route_confirmed: 'completed',
    vat_exemption_evidence_verified: 'completed',
    sars_transfer_tax_receipt_verified: 'completed',
  } })
  const report = buildTransferTaxCrossRoleAssurance({
    journey,
    transferTaxDecision: { route: 'vat', status: 'confirmed' },
  })

  assert.equal(report.ready, true)
  assert.equal(report.lodgementReadiness.ready, true)
  assert.doesNotMatch(JSON.stringify(report.views.buyer), /vat|tdc01|non-resident|withholding|transfer-duty|sars/i)
  assert.doesNotMatch(JSON.stringify(report.views.seller), /vat|tdc01|non-resident|withholding|transfer-duty|sars/i)
})

test('fails the assurance report when a client projection leaks an internal tax label', () => {
  const journey = journeyFor()
  const clientTask = journey.lanes[0].phases[0].tasks.find((task) => task.key === 'transfer_tax_route_confirmed')
  const tamperedJourney = {
    ...journey,
    lanes: [{ ...journey.lanes[0], phases: [{ ...journey.lanes[0].phases[0], tasks: journey.lanes[0].phases[0].tasks.map((task) =>
      task.key === clientTask.key ? { ...task, clientLabel: 'Confirm VAT route' } : task,
    ) }] }],
  }
  const report = buildTransferTaxCrossRoleAssurance({ journey: tamperedJourney })
  assert.equal(report.ready, false)
  assert.ok(report.blockers.some((item) => item.code === 'TAX_CLIENT_LABEL_UNSAFE'))
})
