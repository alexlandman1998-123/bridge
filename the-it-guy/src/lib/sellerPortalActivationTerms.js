import { ARCH9_SELLER_TERMS_VERSION, getArch9SellerTermsConfig } from './arch9TermsAcceptance.js'

export const SELLER_PORTAL_ACTIVATION_TERMS_VERSION = 'seller-portal-terms-popi-v2'

export function getSellerPortalActivationTermsConfig() {
  const terms = getArch9SellerTermsConfig()
  return {
    consentType: 'seller_portal_terms_and_privacy',
    partyType: 'seller',
    title: terms.title,
    body: `${terms.body}\n\n${terms.popiBody}`,
    checkboxLabel: 'I accept the Arch9 terms and conditions and consent to the processing of my personal information as described below.',
    wordingVersion: SELLER_PORTAL_ACTIVATION_TERMS_VERSION,
    privacyPolicyVersion: ARCH9_SELLER_TERMS_VERSION,
    sellerTermsTitle: terms.title,
    sellerTermsBody: terms.body,
    popiBody: terms.popiBody,
  }
}

export function normalizeSellerPortalActivationTermsConfig() {
  // Never mix published transaction fee wording into password setup.
  return getSellerPortalActivationTermsConfig()
}

export function buildSellerPortalActivationTermsAcceptance(overrides = {}) {
  const config = getSellerPortalActivationTermsConfig()
  const acceptedAt = overrides.acceptedAt || overrides.accepted_at || new Date().toISOString()
  return {
    consentType: config.consentType,
    consent_type: config.consentType,
    partyType: config.partyType,
    party_type: config.partyType,
    accepted: true,
    acceptedAt,
    accepted_at: acceptedAt,
    wordingVersion: config.wordingVersion,
    wording_version: config.wordingVersion,
    wordingSnapshot: config.body,
    wording_snapshot: config.body,
    checkboxLabel: config.checkboxLabel,
    checkbox_label: config.checkboxLabel,
    privacyPolicyVersion: config.privacyPolicyVersion,
    privacy_policy_version: config.privacyPolicyVersion,
    acceptedByEmail: overrides.acceptedByEmail || overrides.accepted_by_email || '',
    source: 'seller_portal_activation',
    popiConsentIncluded: true,
    popi_consent_included: true,
  }
}
