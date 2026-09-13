import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  buildAgentAssistedOfferEntry,
  buildManualBuyerCapture,
} from '../src/lib/agentAssistedOfferEntry.js'

const offerDeliverySource = readFileSync(new URL('../src/lib/offerLinkDeliveryPlan.js', import.meta.url), 'utf8')

const manualCapture = buildManualBuyerCapture({
  mode: 'hard_copy',
  draft: {
    manualCaptureSource: 'hard_copy',
    manualDocumentStatus: 'received_pending_upload',
    manualCaptureNotes: 'Buyer supplied ID and proof of address at the viewing.',
  },
  now: '2026-09-13T10:00:00.000Z',
})

assert.equal(manualCapture.mode, 'hard_copy')
assert.equal(manualCapture.captureSource, 'hard_copy')
assert.equal(manualCapture.documentsRequireUpload, true)
assert.match(manualCapture.notes, /proof of address/i)

const agentEntry = buildAgentAssistedOfferEntry({
  buyer: { name: 'Manual Buyer', email: 'buyer@example.test', phone: '0820000000' },
  draft: {
    offerAmount: '1500000',
    depositAmount: '100000',
    financeType: 'bond',
    manualCaptureSource: 'agent_meeting',
    manualDocumentStatus: 'received_pending_upload',
  },
  now: '2026-09-13T10:00:00.000Z',
})

assert.equal(agentEntry.ok, true)
assert.equal(agentEntry.payload.conditionsJson.manualBuyerCapture.captureSource, 'agent_meeting')
assert.equal(agentEntry.payload.conditionsJson.manualBuyerCapture.documentsRequireUpload, true)

assert.match(offerDeliverySource, /intake === 'hard_copy'/)
assert.match(offerDeliverySource, /deliversLink: false/)
assert.match(offerDeliverySource, /handoffRequired: true/)

console.log('Manual buyer capture phase 6 checks passed.')
