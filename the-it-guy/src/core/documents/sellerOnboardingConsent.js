export const SELLER_ONBOARDING_CONSENT_VERSION = 'arch9-seller-onboarding-consents-v1'

export const SELLER_ONBOARDING_CONSENTS = Object.freeze([
  Object.freeze({
    key: 'privacyProcessing',
    policyKey: 'popia_processing',
    label: 'I consent to the agency and its authorised transaction partners processing my personal information for this seller onboarding and transaction administration.',
  }),
  Object.freeze({
    key: 'ficaKycPermission',
    policyKey: 'fica_kyc_permission',
    label: 'I authorise the agency and its authorised compliance providers to collect, verify and retain my information and supporting documents for FICA/KYC compliance.',
  }),
  Object.freeze({
    key: 'informationAccuracy',
    policyKey: 'seller_information_declaration',
    label: 'I confirm that the basic seller and property information I have supplied is accurate and complete to the best of my knowledge.',
  }),
])

function accepted(value) {
  if (typeof value === 'boolean') return value
  return ['true', 'yes', '1', 'accepted'].includes(String(value ?? '').trim().toLowerCase())
}

function text(value) {
  return String(value ?? '').trim()
}

export function readSellerOnboardingConsents(formData = {}) {
  const source = formData.sellerOnboardingConsents || formData.seller_onboarding_consents || {}
  return Object.fromEntries(SELLER_ONBOARDING_CONSENTS.map((consent) => {
    const item = source[consent.key] || {}
    return [consent.key, {
      accepted: accepted(item.accepted ?? item),
      acceptedAt: text(item.acceptedAt || item.accepted_at),
      wordingVersion: text(item.wordingVersion || item.wording_version) || SELLER_ONBOARDING_CONSENT_VERSION,
      policyKey: consent.policyKey,
    }]
  }))
}

export function updateSellerOnboardingConsent(formData = {}, consentKey = '', isAccepted = false, at = new Date().toISOString()) {
  const current = readSellerOnboardingConsents(formData)
  if (!Object.hasOwn(current, consentKey)) throw new Error('Unknown seller onboarding consent.')
  return {
    ...current,
    [consentKey]: {
      ...current[consentKey],
      accepted: Boolean(isAccepted),
      acceptedAt: isAccepted ? at : '',
      accepted_at: isAccepted ? at : '',
      wordingVersion: SELLER_ONBOARDING_CONSENT_VERSION,
      wording_version: SELLER_ONBOARDING_CONSENT_VERSION,
    },
  }
}

export function areSellerOnboardingConsentsComplete(formData = {}) {
  return Object.values(readSellerOnboardingConsents(formData)).every((consent) => consent.accepted)
}
