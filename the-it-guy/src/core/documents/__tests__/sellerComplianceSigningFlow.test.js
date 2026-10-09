import { normalizePersonCollectionForSellerProfile } from '../../../lib/sellerProfileCaptureModel.js'
import { readSellerPopiConsent } from '../sellerOnboardingConsent.js'
import { transformSellerOnboardingToFacts } from '../../../services/documents/sellerOnboardingFactTransformer.js'
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applySellerComplianceSignerAcknowledgementsToForm,
  applySellerComplianceSignatureToForm,
  buildDisclosureForComplianceSigner,
  buildSellerComplianceSigningForForm,
} from '../sellerComplianceSigningFlow.js'
import {
  SELLER_DISCLOSURE_ACKNOWLEDGEMENT_KEYS,
  updateSellerDisclosureAcknowledgement,
} from '../sellerDisclosureAcknowledgements.js'

function requiredAcknowledgements() {
  return [
    SELLER_DISCLOSURE_ACKNOWLEDGEMENT_KEYS.termsAndConditions,
    SELLER_DISCLOSURE_ACKNOWLEDGEMENT_KEYS.privacyAndPaiaNotice,
    SELLER_DISCLOSURE_ACKNOWLEDGEMENT_KEYS.disclosureAccuracy,
  ].reduce((value, key) => updateSellerDisclosureAcknowledgement(value, key, true), {})
}

const baseForm = {
  sellerFirstName: 'John',
  sellerSurname: 'Smith',
  email: 'john@example.test',
  phone: '0821234567',
  maritalStatus: 'married',
  spouseInvolved: true,
  spouseName: 'Jane Smith',
  spouseEmail: 'jane@example.test',
  propertyDisclosure: {
    declarationAccepted: true,
    arch9TermsAccepted: true,
    signature: 'John Smith',
    signedAt: '2026-08-25',
  },
}

test('applySellerComplianceSignatureToForm records the active primary signer and leaves spouse pending', () => {
  const nextForm = applySellerComplianceSignatureToForm({
    formData: baseForm,
    signerId: 'seller-1',
    disclosure: baseForm.propertyDisclosure,
  })

  assert.equal(nextForm.sellerComplianceSigning.complete, false)
  assert.equal(nextForm.sellerComplianceSigning.signingState.signedCount, 1)
  assert.equal(nextForm.sellerComplianceSigning.nextSigner.id, 'spouse')
  assert.equal(nextForm.sellerComplianceSigners.find((signer) => signer.id === 'seller-1').status, 'signed')
  assert.equal(nextForm.sellerComplianceSigners.find((signer) => signer.id === 'spouse').status, 'pending')
})

test('records explicit acknowledgement evidence on the signer who accepted it', () => {
  const nextForm = applySellerComplianceSignatureToForm({
    formData: baseForm,
    signerId: 'seller-1',
    disclosure: baseForm.propertyDisclosure,
    acknowledgements: requiredAcknowledgements(),
  })

  const signer = nextForm.sellerComplianceSigners.find((item) => item.id === 'seller-1')
  assert.equal(signer.acknowledgements.wordingVersion, 'arch9-seller-disclosure-acknowledgements-v1')
  assert.equal(signer.acknowledgements.acknowledgements.find((item) => item.key === 'privacy_and_paia_notice').accepted, true)
  assert.equal(nextForm.sellerComplianceSigners.find((item) => item.id === 'spouse').acknowledgements, null)
})

test('persists a signer acknowledgement draft without signing the declaration', () => {
  const acknowledgements = updateSellerDisclosureAcknowledgement(
    {},
    SELLER_DISCLOSURE_ACKNOWLEDGEMENT_KEYS.termsAndConditions,
    true,
  )
  const nextForm = applySellerComplianceSignerAcknowledgementsToForm({
    formData: baseForm,
    signerId: 'spouse',
    acknowledgements,
  })
  const signer = nextForm.sellerComplianceSigners.find((item) => item.id === 'spouse')

  assert.equal(signer.status, 'pending')
  assert.equal(signer.complete, false)
  assert.equal(signer.signature.value, '')
  assert.equal(signer.acknowledgements.acknowledgements.find((item) => item.key === 'terms_and_conditions').accepted, true)
})

test('the normal onboarding link remains bound to the primary seller after their signature becomes complete', () => {
  const nextForm = applySellerComplianceSignatureToForm({
    formData: baseForm,
    disclosure: baseForm.propertyDisclosure,
  })

  assert.equal(nextForm.sellerComplianceSigning.complete, false)
  assert.equal(nextForm.sellerComplianceSigning.signingState.signedCount, 1)
  assert.equal(nextForm.sellerComplianceSigners.find((signer) => signer.id === 'seller-1').status, 'signed')
  assert.equal(nextForm.sellerComplianceSigners.find((signer) => signer.id === 'spouse').status, 'pending')
})

test('spouse signer link gets a blank signature view until the spouse signs', () => {
  const afterSellerOne = applySellerComplianceSignatureToForm({
    formData: baseForm,
    signerId: 'seller-1',
    disclosure: baseForm.propertyDisclosure,
  })
  const spouseFlow = buildSellerComplianceSigningForForm({
    formData: afterSellerOne,
    signerId: 'spouse',
  })
  const spouseDisclosure = buildDisclosureForComplianceSigner(afterSellerOne.propertyDisclosure, spouseFlow.activeSigner, {
    preferSignerSignature: true,
  })

  assert.equal(spouseFlow.activeSigner.id, 'spouse')
  assert.equal(spouseDisclosure.signature, '')
  assert.equal(spouseDisclosure.signedAt, '')
})

test('buildSellerComplianceSigningForForm does not treat an unknown signer parameter as matched or advance to another party', () => {
  const flow = buildSellerComplianceSigningForForm({
    formData: baseForm,
    signerId: 'not-a-real-signer',
  })

  assert.equal(flow.requestedSignerMatched, false)
  assert.equal(flow.activeSigner.id, 'seller-1')
})

test('a private signer link never infers completion from a shared legacy disclosure signature', () => {
  const flow = buildSellerComplianceSigningForForm({
    formData: baseForm,
    signerId: 'seller-1',
  })

  assert.equal(flow.requestedSignerMatched, true)
  assert.equal(flow.activeSigner.id, 'seller-1')
  assert.equal(flow.activeSigner.complete, false)
  assert.equal(flow.activeSigner.status, 'pending')
})

test('applySellerComplianceSignatureToForm completes the pack when spouse signs later', () => {
  const afterSellerOne = applySellerComplianceSignatureToForm({
    formData: baseForm,
    signerId: 'seller-1',
    disclosure: baseForm.propertyDisclosure,
  })
  const afterSpouse = applySellerComplianceSignatureToForm({
    formData: afterSellerOne,
    signerId: 'spouse',
    disclosure: {
      ...afterSellerOne.propertyDisclosure,
      signature: 'Jane Smith',
      signedAt: '2026-08-26',
    },
  })

  assert.equal(afterSpouse.sellerComplianceSigning.complete, true)
  assert.equal(afterSpouse.sellerComplianceSigning.signingState.signedCount, 2)
  assert.equal(afterSpouse.sellerComplianceSigners.find((signer) => signer.id === 'seller-1').signature.value, 'John Smith')
  assert.equal(afterSpouse.sellerComplianceSigners.find((signer) => signer.id === 'spouse').signature.value, 'Jane Smith')
})

test('a signer-specific declaration submission preserves the primary seller disclosure', () => {
  const afterSellerOne = applySellerComplianceSignatureToForm({
    formData: baseForm,
    signerId: 'seller-1',
    disclosure: baseForm.propertyDisclosure,
  })
  const spouseDisclosure = buildDisclosureForComplianceSigner(afterSellerOne.propertyDisclosure, {
    id: 'spouse',
  }, { preferSignerSignature: true })
  const afterSpouse = applySellerComplianceSignatureToForm({
    formData: afterSellerOne,
    signerId: 'spouse',
    disclosure: {
      ...spouseDisclosure,
      signature: 'Jane Smith',
      signedAt: '2026-08-26',
    },
  })

  assert.equal(afterSpouse.propertyDisclosure.signature, 'John Smith')
  assert.equal(afterSpouse.propertyDisclosure.signedAt, '2026-08-25')
  assert.equal(afterSpouse.sellerComplianceSigners.find((signer) => signer.id === 'spouse').signature.value, 'Jane Smith')
})


test('company declaration keeps the director identity and privacy evidence through save/reload', () => {
  const formData = {
    ownershipType: 'company', companyName: 'Example Company', companyRegistrationNumber: '2020/000001/07',
    authorisedSignatoryName: 'Casey Director', authorisedSignatoryEmail: 'casey@example.test',
    companyDirectors: [{ name: 'Casey', surname: 'Director', idNumber: '8001015009087' }],
    popiConsent: 'No', popiConsentAccepted: false,
  }
  const flow = buildSellerComplianceSigningForForm({ formData, signerId: 'company-authorised-signatory' })
  assert.equal(flow.activeSigner.idNumber, '8001015009087')
  assert.notEqual(flow.activeSigner.idNumber, formData.companyRegistrationNumber)
  const signed = applySellerComplianceSignatureToForm({
    formData, signerId: flow.activeSigner.id,
    disclosure: { signature: 'Casey Director', signedAt: '2026-10-09' },
    acknowledgements: requiredAcknowledgements(),
  })
  const reloaded = JSON.parse(JSON.stringify(signed))
  assert.equal(buildSellerComplianceSigningForForm({ formData: reloaded, signerId: flow.activeSigner.id }).activeSigner.idNumber, '8001015009087')
  const consent = readSellerPopiConsent(reloaded)
  assert.equal(consent.accepted, true)
  assert.ok(consent.acceptedAt)
  const facts = transformSellerOnboardingToFacts(reloaded)
  assert.equal(facts.seller.popi_consent, 'Accepted')
  assert.equal(facts.seller.popi_consent_accepted_at, consent.acceptedAt)
})

test('each declaration uses its own signer ID or passport', () => {
  const formData = {
    ownershipType: 'multiple_owners', ownerStructureType: 'multiple_owners',
    multipleOwners: [
      { name: 'First Owner', id_number: '8001015009087' },
      { name: 'Second Owner', idNumber: '9001015009084' },
    ],
  }
  assert.equal(buildSellerComplianceSigningForForm({ formData, signerId: 'seller-1' }).activeSigner.idNumber, '8001015009087')
  assert.equal(buildSellerComplianceSigningForForm({ formData, signerId: 'seller-2' }).activeSigner.idNumber, '9001015009084')
  const foreign = buildSellerComplianceSigningForForm({ formData: {
    ownershipType: 'foreign_individual', ownerStructureType: 'foreign_individual',
    sellerFirstName: 'Foreign', sellerSurname: 'Owner', foreignPassportNumber: 'P1234567',
  } })
  assert.equal(foreign.activeSigner.idNumber, 'P1234567')
})


test('legacy company and trustee representative names retain their captured ID or passport', () => {
  const company = buildSellerComplianceSigningForForm({ formData: {
    ownershipType: 'company', companyDirectorName: 'Legacy Director',
    companyDirectors: [{ name: 'Legacy Director', idNumber: '8001015009087' }],
  } })
  assert.equal(company.activeSigner.idNumber, '8001015009087')
  const trust = buildSellerComplianceSigningForForm({ formData: {
    ownershipType: 'trust', trusteeName: 'Foreign Trustee',
    trustees: normalizePersonCollectionForSellerProfile([{ name: 'Foreign Trustee', passportNumber: 'P7654321' }], null, 'Trustee'),
  } })
  assert.equal(trust.activeSigner.idNumber, 'P7654321')
  const individual = buildSellerComplianceSigningForForm({ formData: {
    ownershipType: 'individual', sellerFirstName: 'Alias', sellerSurname: 'Owner', id_number: '8001015009087',
  } })
  assert.equal(individual.activeSigner.idNumber, '8001015009087')
})
