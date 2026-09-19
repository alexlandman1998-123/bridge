import {
  SELLER_MANDATE_TERMS_APPROVAL_STATUS,
  assessSellerMandateTermsPolicy,
} from './sellerMandateTermsPolicy.js'

export const SELLER_MANDATE_ACKNOWLEDGEMENT_CONTRACT = 'arch9-seller-mandate-acknowledgements-v1'

export const SELLER_MANDATE_ACKNOWLEDGEMENT_KEYS = Object.freeze({
  termsAcceptance: 'terms_acceptance',
  accuracyAndAuthority: 'accuracy_and_authority',
  privacyAndPaiaNotice: 'privacy_and_paia_notice',
  electronicCommunicationsAndSigning: 'electronic_communications_and_signing',
  sharedInformationReview: 'shared_information_review',
  proposedTransferAttorney: 'proposed_transfer_attorney',
})

const text = (value) => String(value ?? '').trim()
const record = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {}

export function getRequiredSellerMandateAcknowledgements({
  termsPolicy = {},
  isSecondarySigner = false,
  hasProposedTransferAttorney = false,
} = {}) {
  const assessment = assessSellerMandateTermsPolicy(termsPolicy)
  if (!assessment.ready || assessment.policy.status !== SELLER_MANDATE_TERMS_APPROVAL_STATUS.approved) return []
  const required = [
    SELLER_MANDATE_ACKNOWLEDGEMENT_KEYS.termsAcceptance,
    SELLER_MANDATE_ACKNOWLEDGEMENT_KEYS.accuracyAndAuthority,
    SELLER_MANDATE_ACKNOWLEDGEMENT_KEYS.privacyAndPaiaNotice,
    SELLER_MANDATE_ACKNOWLEDGEMENT_KEYS.electronicCommunicationsAndSigning,
  ]
  if (isSecondarySigner) required.push(SELLER_MANDATE_ACKNOWLEDGEMENT_KEYS.sharedInformationReview)
  if (hasProposedTransferAttorney) required.push(SELLER_MANDATE_ACKNOWLEDGEMENT_KEYS.proposedTransferAttorney)
  return required
}

export function buildSellerMandateAcknowledgementEvidence({
  termsPolicy = {},
  accepted = {},
  signer = {},
  isSecondarySigner = false,
  hasProposedTransferAttorney = false,
  acceptedAt = new Date().toISOString(),
} = {}) {
  const assessment = assessSellerMandateTermsPolicy(termsPolicy)
  if (!assessment.ready) throw new Error('Approved agency terms are required before recording acknowledgements.')
  const required = getRequiredSellerMandateAcknowledgements({ termsPolicy: assessment.policy, isSecondarySigner, hasProposedTransferAttorney })
  const missing = required.filter((key) => accepted[key] !== true)
  if (missing.length) throw new Error(`Required acknowledgements are missing: ${missing.join(', ')}.`)
  const person = record(signer)
  return {
    contract: SELLER_MANDATE_ACKNOWLEDGEMENT_CONTRACT,
    termsVersion: assessment.policy.version,
    termsContentDigest: assessment.policy.contentDigest,
    signerName: text(person.name),
    signerEmail: text(person.email).toLowerCase(),
    acceptedAt: text(acceptedAt),
    acknowledgements: required.map((key) => ({ key, accepted: true })),
  }
}
