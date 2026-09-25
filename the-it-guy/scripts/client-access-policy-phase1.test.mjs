import assert from 'node:assert/strict'

import {
  CLIENT_ACCESS_POLICY_VERSION,
  CLIENT_ACCESS_REASONS,
  hasSignedMandateEvidence,
  hasSignedOtpEvidence,
  resolveBuyerAccessPolicy,
  resolveClientAccessPolicy,
  resolveSellerAccessPolicy,
} from '../src/core/clientAccess/clientAccessPolicy.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('normal buyer onboarding is available before OTP when a buyer email exists', () => {
  const policy = resolveBuyerAccessPolicy({
    transactionId: 'txn-1',
    buyerEmail: 'buyer@example.com',
    isKingstons: false,
  })

  assert.equal(policy.version, CLIENT_ACCESS_POLICY_VERSION)
  assert.equal(policy.actions.sendOnboarding.enabled, true)
  assert.equal(policy.actions.sendOnboarding.reason, CLIENT_ACCESS_REASONS.buyerOnboardingReady)
  assert.equal(policy.actions.sendPortalLink.enabled, false)
  assert.equal(policy.actions.sendPortalLink.reason, CLIENT_ACCESS_REASONS.buyerPortalWaitingForOnboardingOrOtp)
})

test('buyer onboarding can still be captured manually without a buyer email', () => {
  const policy = resolveBuyerAccessPolicy({
    transactionId: 'txn-2',
    intakeMode: 'agent_assisted',
  })

  assert.equal(policy.manualIntake, true)
  assert.equal(policy.actions.manualCapture.enabled, true)
  assert.equal(policy.actions.manualCapture.reason, CLIENT_ACCESS_REASONS.buyerManualCaptureReady)
  assert.equal(policy.actions.sendOnboarding.enabled, true)
})

test('Kingstons buyer is blocked from onboarding and portal access before signed OTP upload', () => {
  const policy = resolveBuyerAccessPolicy({
    transactionId: 'txn-3',
    agencySlug: 'kingstons',
    buyerEmail: 'buyer@example.com',
  })

  assert.equal(policy.isKingstons, true)
  assert.equal(policy.actions.sendOnboarding.enabled, false)
  assert.equal(policy.actions.sendOnboarding.reason, CLIENT_ACCESS_REASONS.kingstonsManualOtpRequired)
  assert.equal(policy.actions.sendPortalLink.enabled, false)
  assert.equal(policy.actions.sendPortalLink.reason, CLIENT_ACCESS_REASONS.kingstonsManualOtpRequired)
  assert.equal(policy.actions.uploadSignedOtp.enabled, true)
})

test('Kingstons buyer portal becomes available only after signed OTP evidence exists', () => {
  const context = {
    transactionId: 'txn-4',
    agencySlug: 'kingstons',
    documents: [
      {
        key: 'signed_otp',
        status: 'uploaded',
        fileUrl: 'https://example.test/signed-otp.pdf',
      },
    ],
  }
  const policy = resolveBuyerAccessPolicy(context)

  assert.equal(hasSignedOtpEvidence(context), true)
  assert.equal(policy.signedOtpUploaded, true)
  assert.equal(policy.actions.sendOnboarding.enabled, false)
  assert.equal(policy.actions.sendPortalLink.enabled, true)
  assert.equal(policy.actions.sendPortalLink.reason, CLIENT_ACCESS_REASONS.kingstonsSignedOtpUploaded)
  assert.equal(policy.actions.uploadSignedOtp.enabled, false)
  assert.equal(policy.actions.uploadSignedOtp.reason, CLIENT_ACCESS_REASONS.signedOtpAlreadyUploaded)
})

test('seller portal activation requires a confirmed seller type before invitation', () => {
  const policy = resolveSellerAccessPolicy({
    listingId: 'listing-1',
    sellerEmail: 'seller@example.com',
  })

  assert.equal(policy.actions.activatePortal.enabled, false)
  assert.equal(policy.actions.activatePortal.reason, CLIENT_ACCESS_REASONS.sellerTypeRequired)
  assert.equal(policy.actions.uploadSignedMandate.enabled, true)
  assert.equal(policy.actions.sendMandateSigningLink.enabled, false)
  assert.equal(policy.actions.sendMandateSigningLink.reason, CLIENT_ACCESS_REASONS.sellerMandateSigningLinksRetired)
})

test('a generic mandate upload does not substitute for seller setup', () => {
  const policy = resolveSellerAccessPolicy({
    listingId: 'listing-1b',
    sellerEmail: 'seller@example.com',
    hasSignedMandate: true,
    documents: [
      {
        key: 'mandate',
        status: 'uploaded',
        fileUrl: 'https://example.test/mandate.pdf',
      },
    ],
  })

  assert.equal(policy.signedMandateUploaded, false)
  assert.equal(policy.actions.activatePortal.enabled, false)
  assert.equal(policy.actions.activatePortal.reason, CLIENT_ACCESS_REASONS.sellerTypeRequired)
})

test('final signed mandate evidence alone does not substitute for seller setup', () => {
  const policy = resolveSellerAccessPolicy({
    listingId: 'listing-1c',
    sellerEmail: 'seller@example.com',
    mandate: {
      finalSignedFilePath: 'private-listings/listing-1c/signed-mandate.pdf',
    },
  })

  assert.equal(policy.signedMandateUploaded, true)
  assert.equal(policy.actions.activatePortal.enabled, false)
  assert.equal(policy.actions.activatePortal.reason, CLIENT_ACCESS_REASONS.sellerTypeRequired)
})

test('seller portal activation is ready with basic seller setup before mandate upload', () => {
  const policy = resolveSellerAccessPolicy({
    listingId: 'listing-2',
    sellerType: 'company',
    sellerContactName: 'Jane Director',
    sellerEmail: 'seller@example.com',
  })

  assert.equal(hasSignedMandateEvidence({ mandateStatus: 'signed_uploaded' }), true)
  assert.equal(policy.signedMandateUploaded, false)
  assert.equal(policy.actions.activatePortal.enabled, true)
  assert.equal(policy.actions.activatePortal.reason, CLIENT_ACCESS_REASONS.sellerPortalReady)
  assert.equal(policy.actions.uploadSignedMandate.enabled, true)
})

test('company legal name is not treated as its portal contact', () => {
  const policy = resolveSellerAccessPolicy({ listingId: 'listing-company', sellerType: 'company', sellerName: 'Example Pty Ltd', sellerEmail: 'director@example.com' })
  assert.equal(policy.actions.activatePortal.enabled, false)
  assert.equal(policy.actions.activatePortal.reason, CLIENT_ACCESS_REASONS.sellerContactRequired)
})

test('confirmed individual with a named contact can be invited before signing', () => {
  const policy = resolveSellerAccessPolicy({
    listingId: 'listing-individual', sellerType: 'individual', sellerEmail: 'owner@example.com',
    sellerCanonicalFacts: { seller: { legal_type: 'individual' }, firstName: 'Jane', lastName: 'Owner' },
  })
  assert.equal(policy.actions.activatePortal.enabled, true)
  assert.equal(policy.signedMandateUploaded, false)
})

test('seller portal still requires a valid seller email with a confirmed contact', () => {
  const policy = resolveSellerAccessPolicy({
    listingId: 'listing-3',
    sellerType: 'trust',
    sellerContactName: 'Jane Trustee',
    sellerEmail: 'not-an-email',
  })

  assert.equal(policy.actions.activatePortal.enabled, false)
  assert.equal(policy.actions.activatePortal.reason, CLIENT_ACCESS_REASONS.sellerEmailRequired)
})

test('developer sales cannot activate the private seller portal', () => {
  const policy = resolveSellerAccessPolicy({
    transactionId: 'txn-dev-portal',
    transaction_type: 'developer_sale',
    seller_party_type: 'developer',
    sellerEmail: 'developer@example.com',
    mandateStatus: 'signed_uploaded',
  })

  assert.equal(policy.isDeveloperSale, true)
  assert.equal(policy.sellerPartyType, 'developer')
  assert.equal(policy.actions.activatePortal.enabled, false)
  assert.equal(policy.actions.activatePortal.reason, CLIENT_ACCESS_REASONS.developerSellerPortalNotApplicable)
  assert.equal(policy.actions.uploadSignedMandate.enabled, false)
  assert.equal(policy.actions.uploadSignedMandate.reason, CLIENT_ACCESS_REASONS.developerSellerPortalNotApplicable)
  assert.equal(policy.actions.sendMandateSigningLink.enabled, false)
  assert.equal(policy.actions.sendMandateSigningLink.reason, CLIENT_ACCESS_REASONS.developerSellerPortalNotApplicable)
})

test('combined policy exposes buyer and seller decisions from one canonical entry point', () => {
  const policy = resolveClientAccessPolicy({
    buyer: {
      transactionId: 'txn-5',
      buyerEmail: 'buyer@example.com',
      onboardingComplete: true,
    },
    seller: {
      listingId: 'listing-4',
      sellerType: 'company',
      sellerContactName: 'Jane Director',
      sellerEmail: 'seller@example.com',
    },
  })

  assert.equal(policy.version, CLIENT_ACCESS_POLICY_VERSION)
  assert.equal(policy.buyer.actions.sendPortalLink.enabled, true)
  assert.equal(policy.seller.actions.activatePortal.enabled, true)
})

console.log('client access policy phase 1 tests passed')
