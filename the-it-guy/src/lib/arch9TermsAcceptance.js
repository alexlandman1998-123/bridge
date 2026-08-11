export const ARCH9_SELLER_TERMS_VERSION = 'arch9-seller-terms-popi-v1'

export function getArch9SellerTermsConfig() {
  return {
    title: 'Arch9 terms and conditions',
    body:
      'I accept the Arch9 terms and conditions applicable to this seller onboarding and transaction workflow.',
    popiBody:
      'I consent to Arch9, the appointed agency, and authorised transaction partners processing my personal information for onboarding, mandate, property disclosure, compliance, and transaction-administration purposes in line with POPI requirements.',
    checkboxLabel: 'I accept the Arch9 terms and conditions',
    wordingVersion: ARCH9_SELLER_TERMS_VERSION,
    validationMessage: 'Please accept the Arch9 terms and conditions before signing the declaration.',
  }
}

function normalizeAccepted(value) {
  if (typeof value === 'boolean') return value
  const normalized = String(value ?? '').trim().toLowerCase()
  return ['true', 'yes', 'y', '1', 'on', 'accepted'].includes(normalized)
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

export function buildArch9SellerTermsAcceptance() {
  const config = getArch9SellerTermsConfig()
  const acceptedAt = new Date().toISOString()
  return {
    accepted: true,
    acceptedAt,
    accepted_at: acceptedAt,
    wordingVersion: config.wordingVersion,
    wording_version: config.wordingVersion,
    label: config.checkboxLabel,
    source: 'seller_onboarding',
    popiConsentIncluded: true,
    popi_consent_included: true,
  }
}

export function readArch9SellerTermsAcceptance(formData = {}) {
  const source =
    formData?.arch9TermsAcceptance ||
    formData?.arch9_terms_acceptance ||
    formData?.propertyDisclosure?.arch9TermsAcceptance ||
    formData?.propertyDisclosure?.arch9_terms_acceptance ||
    formData?.property_disclosure?.arch9TermsAcceptance ||
    formData?.property_disclosure?.arch9_terms_acceptance ||
    {}
  const accepted = normalizeAccepted(
    source.accepted ??
      source.arch9TermsAccepted ??
      source.arch9_terms_accepted ??
      formData?.arch9TermsAccepted ??
      formData?.arch9_terms_accepted ??
      formData?.propertyDisclosure?.arch9TermsAccepted ??
      formData?.propertyDisclosure?.arch9_terms_accepted ??
      formData?.property_disclosure?.arch9TermsAccepted ??
      formData?.property_disclosure?.arch9_terms_accepted,
  )
  const config = getArch9SellerTermsConfig()
  return {
    accepted,
    acceptedAt: normalizeText(source.acceptedAt || source.accepted_at || formData?.arch9TermsAcceptedAt || formData?.arch9_terms_accepted_at),
    accepted_at: normalizeText(source.accepted_at || source.acceptedAt || formData?.arch9_terms_accepted_at || formData?.arch9TermsAcceptedAt),
    wordingVersion: normalizeText(source.wordingVersion || source.wording_version) || config.wordingVersion,
    wording_version: normalizeText(source.wording_version || source.wordingVersion) || config.wordingVersion,
    label: normalizeText(source.label) || config.checkboxLabel,
    source: normalizeText(source.source) || 'seller_onboarding',
    popiConsentIncluded: normalizeAccepted(source.popiConsentIncluded ?? source.popi_consent_included ?? true),
    popi_consent_included: normalizeAccepted(source.popi_consent_included ?? source.popiConsentIncluded ?? true),
  }
}

export function isArch9SellerTermsAccepted(formData = {}) {
  return readArch9SellerTermsAcceptance(formData).accepted === true
}
