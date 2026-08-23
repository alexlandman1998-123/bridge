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

test('seller portal activation is blocked until the signed mandate is uploaded', () => {
  const policy = resolveSellerAccessPolicy({
    listingId: 'listing-1',
    sellerEmail: 'seller@example.com',
  })

  assert.equal(policy.actions.activatePortal.enabled, false)
  assert.equal(policy.actions.activatePortal.reason, CLIENT_ACCESS_REASONS.sellerSignedMandateRequired)
  assert.equal(policy.actions.uploadSignedMandate.enabled, true)
  assert.equal(policy.actions.sendMandateSigningLink.enabled, false)
  assert.equal(policy.actions.sendMandateSigningLink.reason, CLIENT_ACCESS_REASONS.sellerMandateSigningLinksRetired)
})

test('generic mandate upload is not enough to activate the seller portal', () => {
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
  assert.equal(policy.actions.activatePortal.reason, CLIENT_ACCESS_REASONS.sellerSignedMandateRequired)
})

test('final signed mandate artifact evidence activates the seller portal policy', () => {
  const policy = resolveSellerAccessPolicy({
    listingId: 'listing-1c',
    sellerEmail: 'seller@example.com',
    mandate: {
      finalSignedFilePath: 'private-listings/listing-1c/signed-mandate.pdf',
    },
  })

  assert.equal(policy.signedMandateUploaded, true)
  assert.equal(policy.actions.activatePortal.enabled, true)
  assert.equal(policy.actions.activatePortal.reason, CLIENT_ACCESS_REASONS.sellerPortalReady)
})

test('seller portal activation is ready after signed mandate upload and seller email', () => {
  const policy = resolveSellerAccessPolicy({
    listingId: 'listing-2',
    sellerEmail: 'seller@example.com',
    mandateStatus: 'signed_uploaded',
  })

  assert.equal(hasSignedMandateEvidence({ mandateStatus: 'signed_uploaded' }), true)
  assert.equal(policy.signedMandateUploaded, true)
  assert.equal(policy.actions.activatePortal.enabled, true)
  assert.equal(policy.actions.activatePortal.reason, CLIENT_ACCESS_REASONS.sellerPortalReady)
  assert.equal(policy.actions.uploadSignedMandate.enabled, false)
})

test('seller portal still requires a seller email after signed mandate upload', () => {
  const policy = resolveSellerAccessPolicy({
    listingId: 'listing-3',
    signedMandateUploaded: true,
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
      sellerEmail: 'seller@example.com',
      mandateStatus: 'signed_uploaded',
    },
  })

  assert.equal(policy.version, CLIENT_ACCESS_POLICY_VERSION)
  assert.equal(policy.buyer.actions.sendPortalLink.enabled, true)
  assert.equal(policy.seller.actions.activatePortal.enabled, true)
})

console.log('client access policy phase 1 tests passed')
