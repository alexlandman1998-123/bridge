import test from 'node:test'
import assert from 'node:assert/strict'
import { getSigningCompletionAccess } from '../signingCompletionAccess.js'

const completed = {
  completedAt: '2026-07-18T12:00:00.000Z',
  document: { id: 'packet-1', type: 'mandate' },
  version: { id: 'version-1' },
  signer: { id: 'signer-1', signedAt: '2026-07-18T12:00:00.000Z' },
  finalArtifact: { path: 'signed/final.pdf', url: 'https://example.test/final.pdf' },
  transactionSaved: true,
  access: { transactionVisible: true, clientVisible: true, canonicalSatisfied: true, portalSurface: 'seller_portal' },
  delivery: { status: 'delivered', emailStatus: 'sent' },
}

test('settles only after the exact final copy is published to every required surface', () => {
  const result = getSigningCompletionAccess(completed)
  assert.equal(result.settled, true)
  assert.equal(result.shouldPoll, false)
  assert.equal(result.emailDelivered, true)
})

test('keeps checking when signing is complete but transaction publication is pending', () => {
  const result = getSigningCompletionAccess({ ...completed, transactionSaved: false, access: {} })
  assert.equal(result.completed, true)
  assert.equal(result.settled, false)
  assert.equal(result.shouldPoll, true)
})
