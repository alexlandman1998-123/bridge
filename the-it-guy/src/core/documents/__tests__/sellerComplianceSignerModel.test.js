import test from 'node:test'
import assert from 'node:assert/strict'

import {
  approveSellerComplianceSignerAuthority,
  buildSellerComplianceSigningState,
  normalizeSellerComplianceSigner,
  recordSellerComplianceSignerAuthority,
  recordSellerComplianceSignerSignature,
  SELLER_COMPLIANCE_SIGNER_MODEL_CONTRACT,
  SELLER_COMPLIANCE_SIGNER_STATUSES,
} from '../sellerComplianceSignerModel.js'

test('normalizes a seller compliance signer into the phase 1 contract shape', () => {
  const signer = normalizeSellerComplianceSigner({
    id: 'seller-primary',
    signerName: 'Alex Seller',
    signerEmail: 'ALEX@EXAMPLE.COM',
    signerMobile: '082 000 0000',
    signerRole: 'seller',
    status: 'pending',
    signingOrder: 1,
    audit: {
      ipAddress: '196.1.2.3',
      userAgent: 'Mobile Safari',
      deviceType: 'phone',
      otpVerified: 'yes',
    },
  })

  assert.equal(signer.id, 'seller-primary')
  assert.equal(signer.name, 'Alex Seller')
  assert.equal(signer.email, 'alex@example.com')
  assert.equal(signer.mobile, '082 000 0000')
  assert.equal(signer.role, 'seller_1')
  assert.equal(signer.roleLabel, 'Seller 1')
  assert.equal(signer.required, true)
  assert.equal(signer.status, SELLER_COMPLIANCE_SIGNER_STATUSES.pending)
  assert.equal(signer.complete, false)
  assert.equal(signer.audit.ip, '196.1.2.3')
  assert.equal(signer.audit.otpVerified, true)
})

test('keeps the seller compliance pack incomplete after only seller 1 signs', () => {
  const signers = [
    { id: 'seller-1', name: 'Alex Seller', email: 'alex@example.com', role: 'seller_1', status: 'pending' },
    { id: 'seller-2', name: 'Sam Seller', email: 'sam@example.com', role: 'spouse', status: 'pending' },
  ]

  const updated = recordSellerComplianceSignerSignature(signers, 'seller-1', {
    signature: 'data:image/png;base64,seller1',
    signatureType: 'drawn',
    signedAt: '2026-08-25T10:00:00+02:00',
    audit: {
      ip: '196.1.2.3',
      userAgent: 'Mobile Safari',
      device: 'phone',
      otpVerified: true,
    },
  })
  const state = buildSellerComplianceSigningState({ signers: updated })

  assert.equal(state.contract, SELLER_COMPLIANCE_SIGNER_MODEL_CONTRACT)
  assert.equal(state.status, 'pending')
  assert.equal(state.complete, false)
  assert.equal(state.requiredCount, 2)
  assert.equal(state.signedCount, 1)
  assert.equal(state.remainingCount, 1)
  assert.equal(state.percent, 50)
  assert.equal(state.nextSigner.id, 'seller-2')
  assert.deepEqual(state.waitingOn.map((signer) => signer.id), ['seller-2'])
})

test('completes the seller compliance pack once every required signer has signed', () => {
  const signers = [
    {
      id: 'seller-1',
      name: 'Alex Seller',
      role: 'seller_1',
      status: 'signed',
      signedAt: '2026-08-25T10:00:00+02:00',
      signature: 'Alex',
    },
    { id: 'seller-2', name: 'Sam Seller', role: 'spouse', status: 'pending' },
  ]

  const updated = recordSellerComplianceSignerSignature(signers, 'seller-2', {
    signature: 'Sam',
    signatureType: 'typed',
    signedAt: '2026-08-25T10:05:00+02:00',
  })
  const state = buildSellerComplianceSigningState({ signers: updated })

  assert.equal(state.status, 'complete')
  assert.equal(state.complete, true)
  assert.equal(state.signedCount, 2)
  assert.equal(state.remainingCount, 0)
  assert.equal(state.nextSigner, null)
  assert.equal(state.percent, 100)
})

test('requires review when one seller uploads authority for another signer', () => {
  const signers = [
    { id: 'seller-1', name: 'Alex Seller', role: 'seller_1', status: 'signed', signedAt: '2026-08-25T10:00:00+02:00', signature: 'Alex' },
    { id: 'seller-2', name: 'Sam Seller', role: 'spouse', status: 'pending' },
  ]

  const withAuthority = recordSellerComplianceSignerAuthority(signers, 'seller-2', {
    reason: 'power_of_attorney',
    documentId: 'authority-doc-1',
    documentName: 'POA.pdf',
    uploadedAt: '2026-08-25T10:10:00+02:00',
  })
  const reviewState = buildSellerComplianceSigningState({ signers: withAuthority })

  assert.equal(reviewState.status, 'authority_review_required')
  assert.equal(reviewState.complete, false)
  assert.equal(reviewState.authorityUploadedCount, 1)
  assert.equal(reviewState.remainingCount, 1)

  const approved = approveSellerComplianceSignerAuthority(withAuthority, 'seller-2', {
    reviewedBy: 'agent-1',
    reviewedAt: '2026-08-25T10:30:00+02:00',
  })
  const approvedState = buildSellerComplianceSigningState({ signers: approved })

  assert.equal(approvedState.status, 'complete')
  assert.equal(approvedState.complete, true)
  assert.equal(approvedState.skippedByAuthorityCount, 1)
  assert.equal(approvedState.remainingCount, 0)
})
