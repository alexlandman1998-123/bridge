import assert from 'node:assert/strict'
import {
  buildDeveloperTransactionOperationsSummary,
  isDeveloperHandoverDocument,
} from '../developerTransactionOperationsProfile.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('detects handover documents from document metadata and names', () => {
  assert.equal(isDeveloperHandoverDocument({ name: 'Welcome Pack and Handover Manual' }), true)
  assert.equal(isDeveloperHandoverDocument({ portal_workspace_category: 'handover' }), true)
  assert.equal(isDeveloperHandoverDocument({ document_type: 'occupation_certificate' }), true)
  assert.equal(isDeveloperHandoverDocument({ name: 'Buyer FICA Document' }), false)
})

test('summarises developer sale handover, reservation, documents, and snags', () => {
  const summary = buildDeveloperTransactionOperationsSummary({
    transaction: {
      transaction_type: 'developer_sale',
      reservation_required: true,
      reservation_status: 'paid',
      reservation_amount: 25000,
    },
    handover: {
      status: 'in_progress',
      handoverDate: '2026-07-01',
      inspectionCompleted: true,
      keysHandedOver: false,
      manualsHandedOver: true,
      electricityMeterReading: '12345',
      waterMeterReading: '5678',
    },
    documents: [
      { name: 'Handover Manual.pdf' },
      { name: 'Signed OTP.pdf' },
    ],
    clientIssues: [
      { status: 'open' },
      { status: 'resolved' },
    ],
    developmentSettings: {
      snag_reporting_enabled: true,
      handover_enabled: true,
    },
    onboardingStatus: 'Complete',
  })

  assert.equal(summary.reservation.status, 'pending_review')
  assert.equal(summary.handover.statusLabel, 'In Progress')
  assert.equal(summary.handover.documentCount, 1)
  assert.equal(summary.handover.completedChecklistCount, 3)
  assert.equal(summary.snags.openCount, 1)
  assert.deepEqual(summary.handover.blockers, [
    'Reservation deposit is not verified.',
    '1 open snag still needs attention.',
    'Handover checklist is not complete.',
  ])
  assert.equal(summary.cards.length, 4)
})

test('marks handover ready when no developer operation blockers remain', () => {
  const summary = buildDeveloperTransactionOperationsSummary({
    transaction: {
      transaction_type: 'developer_sale',
      reservation_required: true,
      reservation_status: 'verified',
    },
    handover: {
      status: 'completed',
      inspectionCompleted: true,
      keysHandedOver: true,
      manualsHandedOver: true,
      electricityMeterReading: '12345',
      waterMeterReading: '5678',
    },
    clientIssues: [{ status: 'resolved' }],
    developmentSettings: {
      snag_reporting_enabled: true,
      handover_enabled: true,
    },
  })

  assert.equal(summary.handover.ready, true)
  assert.deepEqual(summary.handover.blockers, [])
  assert.equal(summary.snags.openCount, 0)
})

test('does not build operations summary for private property transactions', () => {
  assert.equal(
    buildDeveloperTransactionOperationsSummary({
      transaction: { transaction_type: 'private_property' },
    }),
    null,
  )
})
