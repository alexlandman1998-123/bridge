export const SELLER_DISCLOSURE_ACKNOWLEDGEMENT_CONTRACT = 'arch9-seller-disclosure-acknowledgements-v1'
export const SELLER_DISCLOSURE_ACKNOWLEDGEMENT_VERSION = 'arch9-seller-disclosure-acknowledgements-v1'

export const SELLER_DISCLOSURE_ACKNOWLEDGEMENT_KEYS = Object.freeze({
  termsAndConditions: 'terms_and_conditions',
  privacyAndPaiaNotice: 'privacy_and_paia_notice',
  disclosureAccuracy: 'disclosure_accuracy',
  marketingConsent: 'marketing_consent',
})

export const SELLER_DISCLOSURE_ACKNOWLEDGEMENTS = Object.freeze([
  Object.freeze({
    key: SELLER_DISCLOSURE_ACKNOWLEDGEMENT_KEYS.termsAndConditions,
    required: true,
    label: 'I have read and accept the applicable seller onboarding terms and conditions.',
  }),
  Object.freeze({
    key: SELLER_DISCLOSURE_ACKNOWLEDGEMENT_KEYS.privacyAndPaiaNotice,
    required: true,
    label: 'I acknowledge the POPIA and PAIA privacy notice and authorise processing of my personal information for this onboarding, disclosure, compliance and transaction administration.',
  }),
  Object.freeze({
    key: SELLER_DISCLOSURE_ACKNOWLEDGEMENT_KEYS.disclosureAccuracy,
    required: true,
    label: 'I confirm that this seller declaration is true, accurate and complete to the best of my knowledge.',
  }),
  Object.freeze({
    key: SELLER_DISCLOSURE_ACKNOWLEDGEMENT_KEYS.marketingConsent,
    required: false,
    label: 'I would like to receive marketing communications from the agency. This is optional and does not affect my onboarding or sale.',
  }),
])

function text(value) {
  return String(value ?? '').trim()
}

function accepted(value) {
  if (typeof value === 'boolean') return value
  return ['true', 'yes', '1', 'accepted'].includes(text(value).toLowerCase())
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

export function readSellerDisclosureAcknowledgements(value = {}) {
  const source = record(value)
  const entries = Array.isArray(source.acknowledgements) ? source.acknowledgements : []
  return {
    contract: text(source.contract) || SELLER_DISCLOSURE_ACKNOWLEDGEMENT_CONTRACT,
    wordingVersion: text(source.wordingVersion || source.wording_version) || SELLER_DISCLOSURE_ACKNOWLEDGEMENT_VERSION,
    acceptedAt: text(source.acceptedAt || source.accepted_at),
    acknowledgements: SELLER_DISCLOSURE_ACKNOWLEDGEMENTS.map((definition) => {
      const item = entries.find((entry) => text(entry?.key) === definition.key) || source[definition.key] || {}
      return {
        key: definition.key,
        required: definition.required,
        label: definition.label,
        accepted: accepted(item?.accepted ?? item),
      }
    }),
  }
}

export function updateSellerDisclosureAcknowledgement(value = {}, key = '', isAccepted = false) {
  const current = readSellerDisclosureAcknowledgements(value)
  if (!SELLER_DISCLOSURE_ACKNOWLEDGEMENTS.some((definition) => definition.key === key)) {
    throw new Error('Unknown seller disclosure acknowledgement.')
  }
  return {
    ...current,
    acknowledgements: current.acknowledgements.map((item) => item.key === key
      ? { ...item, accepted: Boolean(isAccepted) }
      : item),
  }
}

export function areRequiredSellerDisclosureAcknowledgementsAccepted(value = {}) {
  return readSellerDisclosureAcknowledgements(value).acknowledgements
    .filter((item) => item.required)
    .every((item) => item.accepted)
}

export function buildSellerDisclosureAcknowledgementEvidence(value = {}, acceptedAt = new Date().toISOString()) {
  const normalized = readSellerDisclosureAcknowledgements(value)
  const missing = normalized.acknowledgements.filter((item) => item.required && !item.accepted)
  if (missing.length) throw new Error(`Required seller declaration acknowledgements are missing: ${missing.map((item) => item.key).join(', ')}.`)
  return {
    contract: SELLER_DISCLOSURE_ACKNOWLEDGEMENT_CONTRACT,
    wordingVersion: SELLER_DISCLOSURE_ACKNOWLEDGEMENT_VERSION,
    acceptedAt: text(acceptedAt),
    accepted_at: text(acceptedAt),
    acknowledgements: normalized.acknowledgements.map((item) => ({ key: item.key, accepted: item.accepted })),
  }
}
