import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildAttorneyWorkflowFollowUpCommand,
  buildAttorneyWorkflowFollowUpSummary,
} from '../src/constants/attorneyWorkflowUsability.js'

const fixedNow = '2026-07-06T00:00:00.000Z'

function buildRejectedBuyerFicaSummary(extra = {}) {
  return buildAttorneyWorkflowFollowUpSummary({
    laneKey: 'transfer',
    now: fixedNow,
    documentRequests: [
      {
        id: 'buyer-fica',
        title: 'Buyer FICA Pack',
        lane_key: 'transfer',
        requested_from: 'buyer',
        priority: 'required',
        review_status: 'rejected',
        rejected_reason: 'Proof of address is older than three months.',
        due_date: '2026-07-07',
        visibility_scope: 'client_visible',
      },
      {
        id: 'seller-id',
        title: 'Seller ID Document',
        lane_key: 'transfer',
        requested_from: 'seller',
        priority: 'required',
        status: 'requested',
        due_date: '2026-07-08',
        visibility_scope: 'client_visible',
      },
    ],
    ...extra,
  })
}

function verifySourceFollowUpMetadata() {
  const summary = buildRejectedBuyerFicaSummary()
  const correction = summary.items.find((item) => item.id === 'document_buyer-fica')
  const command = buildAttorneyWorkflowFollowUpCommand(correction, { now: fixedNow })

  assert.equal(command.followUpId, 'document_buyer-fica')
  assert.equal(command.workPacket.sourceFollowUpId, 'document_buyer-fica')
  assert.equal(command.workPacket.sourceFollowUpSource, 'document_request')
  assert.equal(command.workPacket.sourceFollowUpRelatedId, 'buyer-fica')
  assert.equal(command.workPacket.sourceFollowUpStatus, 'needs_correction')
  assert.equal(command.draft.workPacket.sourceFollowUpId, 'document_buyer-fica')
}

function verifyActionedFollowUpsLeaveQueue() {
  const initial = buildRejectedBuyerFicaSummary()
  const correction = initial.items.find((item) => item.id === 'document_buyer-fica')
  const command = buildAttorneyWorkflowFollowUpCommand(correction, { now: fixedNow })
  const summary = buildRejectedBuyerFicaSummary({
    timeline: [
      {
        id: 'update-correction-request',
        message: 'Buyer FICA Pack requested from Buyer.',
        metadata: { workPacket: command.workPacket },
      },
    ],
  })

  assert.equal(summary.counts.actioned, 1)
  assert.deepEqual(summary.actionedFollowUpIds, ['document_buyer-fica'])
  assert.equal(summary.items.some((item) => item.id === 'document_buyer-fica'), false)
  assert.equal(summary.items.some((item) => item.id === 'seller-id'), false)
  assert.equal(summary.items.some((item) => item.id === 'document_seller-id'), true)
  assert.equal(summary.items.some((item) => item.source === 'work_packet'), false)
}

function verifyNextActionCloseLoop() {
  const nextAction = {
    id: 'capture_purchase_price',
    type: 'update_matter_data',
    label: 'Capture Purchase Price',
    description: 'Required for transfer duty calculation.',
    target: 'attorney',
    priority: 'high',
    laneKey: 'transfer',
  }
  const initial = buildAttorneyWorkflowFollowUpSummary({
    laneKey: 'transfer',
    now: fixedNow,
    nextActions: [nextAction],
  })
  const followUp = initial.items.find((item) => item.id === 'next_capture_purchase_price')
  const command = buildAttorneyWorkflowFollowUpCommand(followUp, { now: fixedNow })
  const closed = buildAttorneyWorkflowFollowUpSummary({
    laneKey: 'transfer',
    now: fixedNow,
    nextActions: [nextAction],
    timeline: [
      {
        id: 'update-purchase-price-note',
        message: 'Matter data needed: Purchase Price.',
        metadata: { workPacket: command.workPacket },
      },
    ],
  })

  assert.equal(closed.counts.actioned, 1)
  assert.equal(closed.items.some((item) => item.id === 'next_capture_purchase_price'), false)
}

function verifyPhase8Wiring() {
  const usabilitySource = readFileSync(new URL('../src/constants/attorneyWorkflowUsability.js', import.meta.url), 'utf8')
  const serviceSource = readFileSync(new URL('../src/services/attorneyWorkflow/attorneyWorkflowLaneService.js', import.meta.url), 'utf8')
  const pageSource = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')

  assert.match(usabilitySource, /sourceFollowUpId/)
  assert.match(usabilitySource, /function buildFollowUpResolutionIndex/)
  assert.match(usabilitySource, /if \(packet\.sourceFollowUpId\) continue/)
  assert.match(serviceSource, /async function insertFollowUpActionMarker/)
  assert.match(serviceSource, /workPacketMetadata\.workPacket\?\.sourceFollowUpId/)
  assert.match(serviceSource, /await insertFollowUpActionMarker/)
  assert.match(pageSource, /counts\.actioned/)
}

verifySourceFollowUpMetadata()
verifyActionedFollowUpsLeaveQueue()
verifyNextActionCloseLoop()
verifyPhase8Wiring()

console.log('Attorney workflow Phase 8 close-loop verification passed.')
