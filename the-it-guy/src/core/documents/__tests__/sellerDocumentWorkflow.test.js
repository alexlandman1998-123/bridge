import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSellerDocumentWorkflow, getSellerDocumentSigningRequest, sellerGeneratedDocumentSelection, sellerDocumentHasActiveSigning } from '../sellerDocumentWorkflow.js'

test('mixed choices generate only selected documents', () => {
  assert.deepEqual(sellerGeneratedDocumentSelection({ signed_mandate: 'upload_existing', signed_fica_declaration: 'digital_pack', signed_disclosure_form: 'manual_upload' }), ['fica', 'disclosure'])
  assert.deepEqual(sellerGeneratedDocumentSelection({ signed_mandate: 'upload_existing' }), [])
})

test('prepared, sent, partially signed, signed and reviewed are distinct', () => {
  const copy = { signingRoute: 'digital_pack' }
  const prepared = buildSellerDocumentWorkflow({ copy })
  assert.equal(prepared.state, 'prepared'); assert.equal(prepared.canSend, true)
  for (const [status, state] of [['sent', 'signing'], ['partially_signed', 'signing'], ['signed', 'review'], ['reviewed', 'complete']]) {
    const flow = buildSellerDocumentWorkflow({ copy, request: { status, signed_count: 1, signer_count: 2 } })
    assert.equal(flow.state, state); assert.equal(flow.canSend, false); assert.equal(flow.canUpload, false)
    if (status === 'signed') assert.equal(flow.canReview, true)
    if (state === 'signing') assert.match(flow.detail, /1 of 2/)
  }
})

test('failed delivery and expiry retry the frozen version without hiding failure', () => {
  for (const status of ['revoked', 'expired']) {
    const flow = buildSellerDocumentWorkflow({ copy: {}, request: { status, revoke_reason: 'delivery_failed' } })
    assert.equal(flow.state, 'retry'); assert.equal(flow.canSend, true); assert.match(flow.sendLabel, /Retry/)
  }
  assert.match(buildSellerDocumentWorkflow({ request: { status: 'revoked', revoke_reason: 'email_not_configured' } }).detail, /not configured/)
})

test('existing uploaded evidence waits for review and does not invite another signing request', () => {
  const flow = buildSellerDocumentWorkflow({ item: { status: 'uploaded', linkedDocument: { id: 'uploaded-id' } } })
  assert.equal(flow.state, 'review'); assert.equal(flow.canSend, false); assert.equal(flow.canPrepare, false)
  assert.equal(buildSellerDocumentWorkflow({ item: { status: 'signed', storage_path: 'signed.pdf' } }).state, 'review')
  assert.equal(buildSellerDocumentWorkflow({ item: { lifecycleStatus: 'complete' } }).state, 'complete')
})

test('current active request wins over a newer failed attempt; old versions stay separate', () => {
  const requests = [
    { id: 'failed', document_key: 'signed_mandate', version_id: 'current', status: 'revoked', created_at: '2026-10-09' },
    { id: 'active', document_key: 'signed_mandate', version_id: 'current', status: 'partially_signed', created_at: '2026-10-08' },
    { id: 'historical', document_key: 'signed_mandate', version_id: 'old', status: 'reviewed' },
  ]
  assert.equal(getSellerDocumentSigningRequest(requests, 'signed_mandate', 'current').id, 'active')
  assert.equal(getSellerDocumentSigningRequest(requests.filter(row => row.id !== 'active'), 'signed_mandate', 'current').id, 'failed')
  assert.equal(sellerDocumentHasActiveSigning(requests, 'signed_mandate'), true)
  assert.equal(sellerDocumentHasActiveSigning(requests, 'signed_fica_declaration'), false)
})
