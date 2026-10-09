import assert from 'node:assert/strict'
import test from 'node:test'
import {
  areSellerOnboardingConsentsComplete,
  readSellerOnboardingConsents,
  readSellerPopiConsent,
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


test('privacy processing evidence overrides stale legacy No consent', () => {
  const acceptedAt = '2026-10-09T07:00:00.000Z'
  const form = {
    popiConsent: 'No', popiConsentAccepted: false,
    sellerOnboardingConsents: updateSellerOnboardingConsent({}, 'privacyProcessing', true, acceptedAt),
  }
  assert.deepEqual(readSellerPopiConsent(form), { accepted: true, acceptedAt })
})

test('disclosure privacy choice is read independently of marketing and completion', () => {
  const evidence = (isAccepted) => ({
    accepted_at: '2026-10-09T07:00:00.000Z',
    acknowledgements: [
      { key: 'privacy_and_paia_notice', accepted: isAccepted },
      { key: 'marketing_consent', accepted: !isAccepted },
    ],
  })
  for (const alias of ['propertyDisclosure', 'property_disclosure']) {
    assert.equal(readSellerPopiConsent({
      popiConsent: 'No', [alias]: { seller_disclosure_acknowledgements: evidence(true) },
    }).accepted, true)
    assert.deepEqual(readSellerPopiConsent({
      popiConsent: 'Accepted', [alias]: { seller_disclosure_acknowledgements: evidence(false) },
    }), { accepted: false, acceptedAt: '' })
  }
  assert.equal(readSellerPopiConsent({ status: 'completed', marketingConsent: true }).accepted, false)
})

test('private primary signer privacy evidence takes precedence over a stale shared declaration', () => {
  const primary = { order: 1, acknowledgements: { acceptedAt: '2026-10-09T07:00:00.000Z', acknowledgements: [{ key: 'privacy_and_paia_notice', accepted: true }] } }
  const secondary = { order: 2, acknowledgements: { acknowledgements: [{ key: 'privacy_and_paia_notice', accepted: false }] } }
  for (const alias of ['sellerComplianceSigners', 'seller_compliance_signers']) {
    assert.deepEqual(readSellerPopiConsent({
      popiConsent: 'No', [alias]: [secondary, primary],
      propertyDisclosure: { sellerDisclosureAcknowledgements: secondary.acknowledgements },
    }), { accepted: true, acceptedAt: '2026-10-09T07:00:00.000Z' })
    assert.equal(readSellerPopiConsent({ [alias]: [{ ...secondary, order: 1 }, { ...primary, order: 2 }] }).accepted, false)
  }
})

test('legacy consent strings are parsed as values rather than truthy strings', () => {
  for (const value of ['false', 'No', false, '0']) assert.equal(readSellerPopiConsent({ popiConsentAccepted: value }).accepted, false)
  for (const value of ['true', 'Accepted', true, 'yes']) assert.equal(readSellerPopiConsent({ popi_consent_accepted: value }).accepted, true)
})


test('onboarding processing permission stays accepted while separate declaration choices are pending', () => {
  const form = {
    sellerOnboardingConsents: updateSellerOnboardingConsent({}, 'privacyProcessing', true, '2026-10-09T07:00:00.000Z'),
    propertyDisclosure: { sellerDisclosureAcknowledgements: { acknowledgements: [{ key: 'privacy_and_paia_notice', accepted: false }] } },
  }
  assert.equal(readSellerPopiConsent(form).accepted, true)
})
