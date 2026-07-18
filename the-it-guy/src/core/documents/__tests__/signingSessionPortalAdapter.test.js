import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCanonicalSigningSession } from '../signingSessionContract.js'
import {
  adaptCanonicalSigningSessionToPortal,
  completePortalSessionField,
} from '../signingSessionPortalAdapter.js'

function otpSession() {
  return buildCanonicalSigningSession({
    document: { id: 'otp-document', type: 'otp', title: 'Offer to Purchase', transactionId: 'transaction-1' },
    version: { id: 'otp-version', documentId: 'otp-document', pdfPath: 'otp/file.pdf', pdfUrl: 'https://example.test/otp.pdf' },
    signer: { id: 'buyer-1', role: 'buyer', name: 'Buyer One', email: 'buyer@example.test', status: 'sent' },
    fields: [{ id: 'signature-1', signerRole: 'buyer', type: 'signature', pageNumber: 2, x: 72, y: 700, width: 180, height: 48, required: true }],
    binding: { exactVersionBound: true, bindingKey: 'otp-binding' },
  })
}

test('adapts a canonical OTP session to the existing SignerPortal view model', () => {
  const portal = adaptCanonicalSigningSessionToPortal(otpSession())
  assert.equal(portal.packet.packet_type, 'otp')
  assert.equal(portal.signer.signer_role, 'purchaser_1')
  assert.equal(portal.version.id, 'otp-version')
  assert.equal(portal.documentPreviewUrl, 'https://example.test/otp.pdf')
  assert.deepEqual(portal.fields[0], {
    id: 'signature-1',
    signer_role: 'purchaser_1',
    field_type: 'signature',
    page_number: 2,
    x_position: 72,
    y_position: 700,
    width: 180,
    height: 48,
    required: true,
    status: 'pending',
    completed_at: null,
  })
})

test('marks the legacy OTP field and signer complete without changing its binding', () => {
  const portal = adaptCanonicalSigningSessionToPortal(otpSession())
  const completed = completePortalSessionField(portal, 'signature-1', '2026-07-18T10:00:00.000Z')
  assert.equal(completed.fields[0].status, 'completed')
  assert.equal(completed.signer.status, 'signed')
  assert.equal(completed.sessionBinding.bindingKey, 'otp-binding')
  assert.equal(completed.version.id, 'otp-version')
})

test('carries the canonical completion result into the shared portal view model', () => {
  const portal = adaptCanonicalSigningSessionToPortal(otpSession(), {
    completion: {
      completedAt: '2026-07-18T10:00:00.000Z',
      document: { id: 'otp-document', type: 'otp' },
      version: { id: 'otp-version' },
      signer: { id: 'buyer-1', signedAt: '2026-07-18T10:00:00.000Z' },
      finalArtifact: { path: 'signed/otp.pdf', url: 'https://example.test/signed-otp.pdf' },
    },
  })
  assert.equal(portal.completion.status, 'completed')
  assert.equal(portal.completion.finalArtifact.ready, true)
  assert.equal(portal.completion.finalArtifact.url, 'https://example.test/signed-otp.pdf')
})
