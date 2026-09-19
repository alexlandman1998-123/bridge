import assert from 'node:assert/strict'
import test from 'node:test'

import {
  areRequiredSellerDisclosureAcknowledgementsAccepted,
  buildSellerDisclosureAcknowledgementEvidence,
  readSellerDisclosureAcknowledgements,
  SELLER_DISCLOSURE_ACKNOWLEDGEMENT_KEYS,
  updateSellerDisclosureAcknowledgement,
} from '../sellerDisclosureAcknowledgements.js'

test('requires terms, privacy/PAIA notice and disclosure accuracy but not marketing consent', () => {
  let acknowledgements = readSellerDisclosureAcknowledgements()
  for (const key of [
    SELLER_DISCLOSURE_ACKNOWLEDGEMENT_KEYS.termsAndConditions,
    SELLER_DISCLOSURE_ACKNOWLEDGEMENT_KEYS.privacyAndPaiaNotice,
    SELLER_DISCLOSURE_ACKNOWLEDGEMENT_KEYS.disclosureAccuracy,
  ]) {
    acknowledgements = updateSellerDisclosureAcknowledgement(acknowledgements, key, true)
  }

  assert.equal(areRequiredSellerDisclosureAcknowledgementsAccepted(acknowledgements), true)
  const evidence = buildSellerDisclosureAcknowledgementEvidence(acknowledgements, '2026-09-19T10:00:00.000Z')
  assert.equal(evidence.acceptedAt, '2026-09-19T10:00:00.000Z')
  assert.deepEqual(
    evidence.acknowledgements.find((item) => item.key === SELLER_DISCLOSURE_ACKNOWLEDGEMENT_KEYS.marketingConsent),
    { key: SELLER_DISCLOSURE_ACKNOWLEDGEMENT_KEYS.marketingConsent, accepted: false },
  )
})

test('rejects acknowledgement evidence when a required acknowledgement is absent', () => {
  assert.throws(
    () => buildSellerDisclosureAcknowledgementEvidence({}),
    /privacy_and_paia_notice/,
  )
})
