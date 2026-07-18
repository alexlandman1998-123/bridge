import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SIGNING_SESSION_CONTRACT,
  assertCanonicalSigningSession,
  buildCanonicalSigningSession,
  normalizeSigningRole,
} from '../signingSessionContract.js'

function fixture(type) {
  const purchaser = type === 'otp'
  return {
    document: { id: `packet-${type}`, packetId: `packet-${type}`, type, title: type === 'otp' ? 'Offer to Purchase' : 'Mandate', transactionId: 'transaction-1' },
    version: { id: `version-${type}`, number: 2, documentId: `document-${type}`, pdfPath: `${type}/version-2.pdf`, pdfUrl: `https://example.test/${type}.pdf`, sha256: `sha256:${type}` },
    signer: { id: `signer-${type}`, role: purchaser ? 'buyer' : 'seller', name: purchaser ? 'Pat Buyer' : 'Sam Seller', email: `${type}@example.test`, order: 1, status: 'sent' },
    fields: [{ id: `field-${type}`, signer_role: purchaser ? 'buyer' : 'seller', field_type: 'signature', page_number: 3, required: true, status: 'pending' }],
    binding: { certified: true },
  }
}

test('mandate and OTP produce the same canonical contract shape', () => {
  const mandate = assertCanonicalSigningSession(fixture('mandate'))
  const otp = assertCanonicalSigningSession(fixture('otp'))
  assert.equal(mandate.contract, SIGNING_SESSION_CONTRACT)
  assert.equal(otp.contract, SIGNING_SESSION_CONTRACT)
  assert.deepEqual(Object.keys(mandate), Object.keys(otp))
  assert.deepEqual(Object.keys(mandate.document), Object.keys(otp.document))
  assert.deepEqual(Object.keys(mandate.version), Object.keys(otp.version))
  assert.deepEqual(Object.keys(mandate.signer), Object.keys(otp.signer))
  assert.deepEqual(Object.keys(mandate.binding), Object.keys(otp.binding))
})

test('normalises buyer and agency role aliases', () => {
  assert.equal(normalizeSigningRole('buyer'), 'purchaser_1')
  assert.equal(normalizeSigningRole('primary purchaser'), 'purchaser_1')
  assert.equal(normalizeSigningRole('agency representative'), 'agent')
  assert.equal(normalizeSigningRole('co-seller'), 'seller_spouse')
})

test('binds a signer to one exact PDF version', () => {
  const session = assertCanonicalSigningSession(fixture('otp'))
  assert.equal(session.binding.exactVersionBound, true)
  assert.equal(session.binding.versionId, 'version-otp')
  assert.equal(session.binding.documentId, 'document-otp')
  assert.equal(session.binding.pdfPath, 'otp/version-2.pdf')
  assert.match(session.binding.bindingKey, /version-otp/)
})

test('rejects an unbound session', () => {
  const session = buildCanonicalSigningSession({
    document: { id: 'packet-1', type: 'mandate' },
    version: { id: 'version-1', documentId: 'document-1' },
    signer: { role: 'seller' },
  })
  assert.throws(() => assertCanonicalSigningSession(session), { code: 'INVALID_CANONICAL_SIGNING_SESSION' })
})
