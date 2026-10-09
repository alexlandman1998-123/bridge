import assert from 'node:assert/strict'
import test from 'node:test'
import {
  areSellerOnboardingConsentsComplete,
  readSellerOnboardingConsents,
  readSellerPopiConsent,
  updateSellerOnboardingConsent,
  buildSellerPopiConsentPatch,
  sellerPopiConsentDisplayValue,
} from '../sellerOnboardingConsent.js'
import { buildCanonicalSellerOnboardingPayload } from '../../../services/documents/sellerOnboardingFactTransformer.js'

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

test('an explicit processing decline overrides stale accepted summaries and platform terms', () => {
  for (const alias of ['sellerOnboardingConsents', 'seller_onboarding_consents']) {
    const form = { [alias]: { privacyProcessing: { accepted: false } }, popiConsentAccepted: true, popiConsent: 'Accepted', arch9TermsAccepted: true }
    assert.deepEqual(readSellerPopiConsent(form), { accepted: false, acceptedAt: '' })
    assert.equal(buildCanonicalSellerOnboardingPayload(form).canonicalSellerFacts.seller.popi_consent_accepted, false)
  }
  assert.equal(readSellerPopiConsent({ popiConsentAccepted: false, popiConsent: 'Accepted' }).accepted, false)
  assert.equal(readSellerPopiConsent({ privacyConsent: 'Accepted' }).accepted, true)
  assert.equal(buildCanonicalSellerOnboardingPayload({ arch9TermsAccepted: true }).canonicalSellerFacts.seller.popi_consent_accepted, false)
})

test('missing consent and an explicit decline remain distinct without manufacturing acceptance', () => {
  assert.equal(sellerPopiConsentDisplayValue({}), '')
  assert.equal(sellerPopiConsentDisplayValue({ popiConsentAccepted: false }), 'No')
  assert.deepEqual(buildSellerPopiConsentPatch({}, ''), {})
  assert.deepEqual(buildSellerPopiConsentPatch({ popiConsent: 'Accepted' }, undefined), {})
})

test('normalising consent preserves original timestamps and signed evidence', () => {
  const form = {
    seller_onboarding_consents: { privacyProcessing: { accepted: true, acceptedAt: '2026-09-27T10:00:00Z', source: 'seller', wordingVersion: 'original-wording' }, ficaKycPermission: { accepted: true } },
    sellerComplianceSigners: [{ id: 'seller-1', signature: { value: 'original-signature' } }],
    propertyDisclosure: { signature: 'original-disclosure' },
  }
  const before = structuredClone(form)
  const same = { ...form, ...buildSellerPopiConsentPatch(form, 'Accepted', { at: '2026-10-09T12:00:00Z' }) }
  assert.equal(same.popiConsentAcceptedAt, '2026-09-27T10:00:00Z')
  assert.deepEqual(same.seller_onboarding_consents, before.seller_onboarding_consents)
  assert.deepEqual(same.sellerComplianceSigners, before.sellerComplianceSigners)
  assert.deepEqual(same.propertyDisclosure, before.propertyDisclosure)
  const declined = { ...same, ...buildSellerPopiConsentPatch(same, 'No', { at: '2026-10-09T12:00:00Z' }) }
  assert.equal(readSellerPopiConsent(declined).accepted, false)
  assert.equal(declined.sellerOnboardingConsents.privacyProcessing.history[0].wordingVersion, 'original-wording')
  assert.equal(declined.sellerOnboardingConsents.privacyProcessing.history[0].acceptedAt, '2026-09-27T10:00:00Z')
  assert.deepEqual(declined.sellerComplianceSigners, before.sellerComplianceSigners)
  assert.deepEqual(declined.propertyDisclosure, before.propertyDisclosure)
  assert.deepEqual(form, before)
})

test('agent recording adds only processing permission and keeps repeated saves stable', () => {
  const recorded = buildSellerPopiConsentPatch({}, true, { at: '2026-10-09T12:00:00Z' })
  assert.equal(recorded.sellerOnboardingConsents.privacyProcessing.source, 'agent_capture')
  assert.equal(areSellerOnboardingConsentsComplete(recorded), false)
  const repeated = { ...recorded, ...buildSellerPopiConsentPatch(recorded, true, { at: '2026-10-10T12:00:00Z' }) }
  assert.equal(repeated.popiConsentAcceptedAt, '2026-10-09T12:00:00Z')
  assert.deepEqual(repeated.sellerOnboardingConsents, recorded.sellerOnboardingConsents)
})

test('onboarding preserves consent history and the original timestamp across other answers', () => {
  const original = { accepted: true, acceptedAt: '2026-09-30T08:00:00Z', wordingVersion: 'original',
    source: 'agent_capture', recordedAt: '2026-09-30T08:00:00Z', history: [{ accepted: false }] }
  const form = { sellerOnboardingConsents: { privacyProcessing: original } }
  assert.deepEqual(readSellerOnboardingConsents(form).privacyProcessing.history, original.history)
  const unchanged = updateSellerOnboardingConsent(form, 'privacyProcessing', true, '2026-10-09T08:00:00Z')
  assert.equal(unchanged.privacyProcessing.acceptedAt, original.acceptedAt)
  assert.deepEqual(unchanged.privacyProcessing.history, original.history)
  const declined = updateSellerOnboardingConsent(form, 'privacyProcessing', false, '2026-10-09T08:00:00Z')
  assert.equal(declined.privacyProcessing.accepted, false)
  assert.equal(declined.privacyProcessing.history.at(-1).wordingVersion, 'original')
  assert.equal(declined.privacyProcessing.history.at(-1).acceptedAt, original.acceptedAt)
  assert.deepEqual(form.sellerOnboardingConsents.privacyProcessing, original)
})
