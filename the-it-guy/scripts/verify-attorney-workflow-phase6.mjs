import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildAttorneyWorkflowFollowUpSummary } from '../src/constants/attorneyWorkflowUsability.js'

const fixedNow = '2026-07-06T00:00:00.000Z'

function verifyFollowUpClassification() {
  const summary = buildAttorneyWorkflowFollowUpSummary({
    laneKey: 'transfer',
    label: 'Transfer Attorney',
    now: fixedNow,
    documentRequests: [
      {
        id: 'seller-id',
        title: 'Seller ID Document',
        description: 'Seller FICA is required.',
        lane_key: 'transfer',
        requested_from: 'seller',
        priority: 'required',
        status: 'requested',
        due_date: '2026-07-05',
        visibility_scope: 'client_visible',
      },
      {
        id: 'buyer-fica',
        title: 'Buyer FICA Pack',
        lane_key: 'transfer',
        requested_from: 'buyer',
        priority: 'required',
        review_status: 'rejected',
        rejected_reason: 'Proof of address is older than three months.',
        due_date: '2026-07-10',
        visibility_scope: 'client_visible',
      },
      {
        id: 'otp',
        title: 'Signed OTP',
        lane_key: 'transfer',
        requested_from: 'client',
        priority: 'required',
        status: 'approved',
        due_date: '2026-07-06',
      },
    ],
    timeline: [
      {
        id: 'update-signing',
        message: 'Signing appointment to be scheduled.',
        metadata: {
          workPacket: {
            title: 'Buyer signing appointment',
            laneKey: 'transfer',
            stageKey: 'buyer_signing_scheduled',
            commandType: 'schedule_signing',
            audience: 'buyer',
            audienceLabel: 'Buyer',
            priority: 'required',
            visibility: 'internal',
            dueDate: '2026-07-08',
            checklist: ['Confirm signer availability.', 'Confirm document pack is ready.'],
          },
        },
      },
    ],
    nextActions: [
      {
        id: 'purchase_price_capture_data',
        type: 'update_matter_data',
        label: 'Capture Purchase Price',
        description: 'Required for transfer duty.',
        target: 'attorney',
        priority: 'high',
        laneKey: 'transfer',
      },
    ],
  })

  assert.equal(summary.laneKey, 'transfer')
  assert.equal(summary.health, 'critical')
  assert.equal(summary.counts.total, 4)
  assert.equal(summary.counts.needsCorrection, 1)
  assert.equal(summary.counts.overdue, 1)
  assert.equal(summary.counts.dueSoon >= 1, true)
  assert.equal(summary.counts.clientFacing >= 2, true)
  assert.equal(summary.primaryFollowUp.status, 'needs_correction')
  assert.equal(summary.primaryFollowUp.title, 'Correct Buyer FICA Pack')
  assert.equal(summary.items.some((item) => item.id === 'document_otp'), false)
  assert.equal(summary.items.some((item) => item.source === 'next_action'), true)
}

function verifyCorrectionAndReviewOrdering() {
  const summary = buildAttorneyWorkflowFollowUpSummary({
    laneKey: 'bond',
    now: fixedNow,
    documentRequests: [
      {
        id: 'bank-guarantee',
        title: 'Bank Guarantee',
        lane_key: 'bond',
        requested_from: 'bank',
        priority: 'urgent',
        status: 'uploaded',
        due_date: '2026-07-06',
        visibility_scope: 'professional_shared',
      },
      {
        id: 'instruction',
        title: 'Bond Instruction',
        lane_key: 'bond',
        requested_from: 'bank',
        priority: 'required',
        status: 'requested',
        due_date: '2026-07-12',
      },
    ],
  })

  assert.equal(summary.health, 'attention')
  assert.equal(summary.primaryFollowUp.status, 'review_pending')
  assert.equal(summary.primaryFollowUp.audienceLabel, 'Bank')
  assert.equal(summary.counts.professionalFacing, 2)
}

function verifyPhase6Wiring() {
  const serviceSource = readFileSync(new URL('../src/services/attorneyWorkflow/attorneyWorkflowLaneService.js', import.meta.url), 'utf8')
  const pageSource = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')

  assert.match(serviceSource, /buildAttorneyWorkflowFollowUpSummary/)
  assert.match(serviceSource, /followUpSummary/)
  assert.match(serviceSource, /followUps:\s*followUpSummary\.items/)
  assert.match(pageSource, /function LegalWorkflowFollowUpQueue/)
  assert.match(pageSource, /summary=\{workflow\?\.lane\?\.followUpSummary\}/)
  assert.match(pageSource, /summary=\{lane\.followUpSummary\}/)
}

verifyFollowUpClassification()
verifyCorrectionAndReviewOrdering()
verifyPhase6Wiring()

console.log('Attorney workflow Phase 6 follow-up queue verification passed.')
