import { ARCH9_SELLER_TERMS_VERSION, getArch9SellerTermsConfig } from './arch9TermsAcceptance.js'
import {
  PLATFORM_FEE_AMOUNT,
  PLATFORM_FEE_CHECKBOX_LABEL,
  PLATFORM_FEE_CONSENT_TYPE,
  PLATFORM_FEE_CURRENCY,
} from './platformFeeConsent.js'

export const SELLER_PORTAL_ACTIVATION_TERMS_VERSION = 'seller-platform-fee-v1'

export function getSellerPortalActivationTermsConfig() {
  const sellerTermsConfig = getArch9SellerTermsConfig()
  return {
    consentType: PLATFORM_FEE_CONSENT_TYPE,
    partyType: 'seller',
    title: 'ARCH9 Transaction Platform Fee',
    body:
      'I acknowledge that this transaction is being facilitated through the ARCH9 platform. I authorise the transferring attorney to deduct the once-off ARCH9 Transaction Platform Fee of R750.00 from my proceeds on registration and to remit that amount to ARCH9.',
    checkboxLabel: PLATFORM_FEE_CHECKBOX_LABEL,
    feeAmount: PLATFORM_FEE_AMOUNT,
    currency: PLATFORM_FEE_CURRENCY,
    wordingVersion: SELLER_PORTAL_ACTIVATION_TERMS_VERSION,
    privacyPolicyVersion: ARCH9_SELLER_TERMS_VERSION,
    sellerTermsTitle: sellerTermsConfig.title,
    sellerTermsBody: sellerTermsConfig.body,
    popiBody: sellerTermsConfig.popiBody,
  }
}

export function normalizeSellerPortalActivationTermsConfig(config = {}) {
  const fallback = getSellerPortalActivationTermsConfig()
  if (!config || typeof config !== 'object') return fallback

  return {
    ...fallback,
    title: config.title || fallback.title,
    body: config.body || fallback.body,
    checkboxLabel: config.checkboxLabel || config.checkbox_label || fallback.checkboxLabel,
    feeAmount: config.feeAmount ?? config.fee_amount ?? fallback.feeAmount,
    currency: config.currency || fallback.currency,
    wordingVersion: config.wordingVersion || config.wording_version || fallback.wordingVersion,
    privacyPolicyVersion: config.privacyPolicyVersion || config.privacy_policy_version || fallback.privacyPolicyVersion,
  }
}

export function buildSellerPortalActivationTermsAcceptance(overrides = {}) {
  const { termsConfig, ...acceptanceOverrides } = overrides || {}
  const config = normalizeSellerPortalActivationTermsConfig(termsConfig)
  const acceptedAt = acceptanceOverrides.acceptedAt || acceptanceOverrides.accepted_at || new Date().toISOString()
  return {
    consentType: config.consentType,
    consent_type: config.consentType,
    partyType: config.partyType,
    party_type: config.partyType,
    accepted: true,
    acceptedAt,
    accepted_at: acceptedAt,
    feeAmount: config.feeAmount,
    fee_amount: config.feeAmount,
    currency: config.currency,
    wordingVersion: config.wordingVersion,
    wording_version: config.wordingVersion,
    wordingSnapshot: config.body,
    wording_snapshot: config.body,
    checkboxLabel: config.checkboxLabel,
    checkbox_label: config.checkboxLabel,
    privacyPolicyVersion: config.privacyPolicyVersion,
    privacy_policy_version: config.privacyPolicyVersion,
    source: 'seller_portal_activation',
    popiConsentIncluded: true,
    popi_consent_included: true,
    ...acceptanceOverrides,
  }
}
