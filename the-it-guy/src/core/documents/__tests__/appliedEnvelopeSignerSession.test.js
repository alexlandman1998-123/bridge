import test from 'node:test'
import assert from 'node:assert/strict'
import { assessAppliedEnvelopeSignerSession } from '../appliedEnvelopeSignerSession.js'

const field = { signerRole: 'seller', signerEmail: 'seller@example.com', fieldType: 'signature', pageNumber: 2, xPosition: 10, yPosition: 20, width: 30, height: 12, required: true }
const base = {
  version: { transactionPdfPersisted: true, nativePdfVerified: true },
  layout: { id: 'layout-1', status: 'applied', placementVerified: true, fields: [field] },
  dispatch: { status: 'delivered', layoutId: 'layout-1' },
  signer: { id: 'signer-1', signerRole: 'seller', signerEmail: 'seller@example.com', status: 'sent' },
  fields: [field],
}

test('opens the exact delivered signer envelope', () => {
  assert.equal(assessAppliedEnvelopeSignerSession(base).ready, true)
})

test('rejects a field belonging to another signer', () => {
  const result = assessAppliedEnvelopeSignerSession({ ...base, fields: [{ ...field, signerRole: 'buyer' }] })
  assert.ok(result.reasons.includes('F1_SCOPED_FIELDS_MISSING'))
})

test('rejects an undelivered envelope', () => {
  const result = assessAppliedEnvelopeSignerSession({ ...base, dispatch: { ...base.dispatch, status: 'authorized' } })
  assert.ok(result.reasons.includes('F1_DELIVERED_DISPATCH_MISSING'))
})
