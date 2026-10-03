import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSellerTransactionHealth } from '../sellerTransactionHealth.js'
import { buildSellerPortalDocumentSummary } from '../sellerPortalDocumentSummary.js'

test('uses authoritative counts even when the available action list is shorter', () => {
  const documentSummary = buildSellerPortalDocumentSummary({
    summary: { total: 12, outstanding: 10, uploaded: 1, underReview: 0, approved: 1, blocking: 10 },
    items: [{ id: 'one', status: 'required' }],
  })
  const health = buildSellerTransactionHealth({ documentSummary, available: true })
  assert.equal(health.label, 'Action needed')
  assert.equal(health.actionCount, 10)
  assert.equal(health.reviewCount, 1)
  assert.equal(health.approvedCount, 1)
  assert.equal('score' in health, false)
})

test('moves from action needed to review to up to date as the checklist changes', () => {
  const build = (summary) => buildSellerTransactionHealth({ available: true, documentSummary: buildSellerPortalDocumentSummary({ summary }) })
  assert.equal(build({ total: 1, outstanding: 1 }).label, 'Action needed')
  const uploaded = build({ total: 1, uploaded: 1 })
  assert.equal(uploaded.label, 'Awaiting review')
  assert.equal(uploaded.actionCount, 0)
  assert.match(uploaded.summary, /No upload is needed/)
  assert.equal(build({ total: 1, underReview: 1 }).reviewCount, 1)
  const approved = build({ total: 1, approved: 1 })
  assert.equal(approved.label, 'Up to date')
  assert.equal(approved.approvedCount, 1)
  assert.equal(build({ total: 1, rejected: 1, blocking: 1 }).label, 'Action needed')
})

test('does not report success or zero counts when document reads are unavailable', () => {
  for (const input of [{}, { available: true, loadError: 'Unavailable' }]) {
    const health = buildSellerTransactionHealth(input)
    assert.equal(health.label, 'Status unavailable')
    assert.equal(health.available, false)
    assert.equal(health.actionCount, undefined)
  }
  const empty = buildSellerTransactionHealth({ available: true, documentSummary: { total: 0 } })
  assert.equal(empty.label, 'Up to date')
  assert.match(empty.summary, /No document items are currently requested/)
})
