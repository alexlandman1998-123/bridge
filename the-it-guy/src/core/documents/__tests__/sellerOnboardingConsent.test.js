import assert from 'node:assert/strict'
import test from 'node:test'
import {
  areSellerOnboardingConsentsComplete,
  readSellerOnboardingConsents,
  updateSellerOnboardingConsent,
} from '../sellerOnboardingConsent.js'

test('seller consents require every distinct permission', () => {
  let consents = {}
  consents = updateSellerOnboardingConsent({ sellerOnboardingConsents: consents }, 'privacyProcessing', true, '2026-01-01T00:00:00.000Z')
  assert.equal(areSellerOnboardingConsentsComplete({ sellerOnboardingConsents: consents }), false)
  consents = updateSellerOnboardingConsent({ sellerOnboardingConsents: consents }, 'ficaKycPermission', true, '2026-01-01T00:00:00.000Z')
  consents = updateSellerOnboardingConsent({ sellerOnboardingConsents: consents }, 'informationAccuracy', true, '2026-01-01T00:00:00.000Z')
  assert.equal(areSellerOnboardingConsentsComplete({ sellerOnboardingConsents: consents }), true)
})

test('consent evidence includes an acceptance timestamp and wording version', () => {
  const consent = readSellerOnboardingConsents({
    sellerOnboardingConsents: updateSellerOnboardingConsent({}, 'ficaKycPermission', true, '2026-01-01T00:00:00.000Z'),
  }).ficaKycPermission
  assert.equal(consent.acceptedAt, '2026-01-01T00:00:00.000Z')
  assert.match(consent.wordingVersion, /seller-onboarding-consents/)
})
