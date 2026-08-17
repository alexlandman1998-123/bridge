export const PLATFORM_FEE_CONSENT_TYPE = 'arch9_transaction_platform_fee'
export const BUYER_ONBOARDING_TERMS_CONSENT_TYPE = 'arch9_buyer_online_terms_permissions'
export const PLATFORM_FEE_AMOUNT = '750.00'
export const PLATFORM_FEE_CURRENCY = 'ZAR'
export const PLATFORM_FEE_CHECKBOX_LABEL =
  'I accept the online terms and give permission for my information to be shared with the relevant transaction roleplayers.'

export const PLATFORM_FEE_CONSENT = Object.freeze({
  buyer: Object.freeze({
    partyType: 'buyer',
    consentType: BUYER_ONBOARDING_TERMS_CONSENT_TYPE,
    feeAmount: '',
    currency: '',
    title: 'Online Terms and Transaction Permissions',
    body:
      'I accept the online terms and conditions for this buyer onboarding. I give Arch9 and the transaction team permission to share my onboarding information and documents with the parties and service providers reasonably required to progress this transaction, including the agency or developer, transferring attorney, bond originator, banks, conveyancers, compliance providers, and related roleplayers.',
    checkboxLabel: PLATFORM_FEE_CHECKBOX_LABEL,
    wordingVersion: 'buyer-online-terms-permissions-v1',
    source: 'buyer_onboarding_terms',
    validationMessage: 'Please accept the online terms and transaction information-sharing permission before completing your onboarding.',
  }),
})

export function formatPlatformFeeAmount(amount = PLATFORM_FEE_AMOUNT, currency = PLATFORM_FEE_CURRENCY) {
  const numericAmount = Number(amount)
  if (!Number.isFinite(numericAmount)) return `${currency} ${amount}`
  if (currency === 'ZAR') return `R${numericAmount.toFixed(2)}`
  return `${currency} ${numericAmount.toFixed(2)}`
}

export function getPlatformFeeConsentConfig(partyType = '') {
  const normalizedPartyType = String(partyType || '').trim().toLowerCase()
  if (normalizedPartyType === 'seller') {
    throw new Error('Seller platform fee consent is no longer supported.')
  }
  return PLATFORM_FEE_CONSENT[normalizedPartyType] || PLATFORM_FEE_CONSENT.buyer
}

export function normalizePlatformFeeConsentAcceptance(value = {}, partyType = '') {
  const config = getPlatformFeeConsentConfig(partyType)
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    consentType: config.consentType || PLATFORM_FEE_CONSENT_TYPE,
    consent_type: config.consentType || PLATFORM_FEE_CONSENT_TYPE,
    partyType: config.partyType,
    party_type: config.partyType,
    accepted: Boolean(source.accepted ?? source.platformFeeAccepted ?? source.platform_fee_accepted),
    acceptedAt: source.acceptedAt || source.accepted_at || '',
    accepted_at: source.accepted_at || source.acceptedAt || '',
    feeAmount: config.feeAmount ?? PLATFORM_FEE_AMOUNT,
    fee_amount: config.feeAmount ?? PLATFORM_FEE_AMOUNT,
    currency: config.currency ?? PLATFORM_FEE_CURRENCY,
    wordingVersion: config.wordingVersion,
    wording_version: config.wordingVersion,
    wordingSnapshot: source.wordingSnapshot || source.wording_snapshot || config.body,
    wording_snapshot: source.wording_snapshot || source.wordingSnapshot || config.body,
    checkboxLabel: config.checkboxLabel,
    checkbox_label: config.checkboxLabel,
    source: config.source,
  }
}

export function readPlatformFeeConsentAcceptance(formData = {}, partyType = '') {
  const candidate =
    formData?.platformFeeConsent ||
    formData?.platform_fee_consent ||
    formData?.propertyDisclosure?.platformFeeConsent ||
    formData?.propertyDisclosure?.platform_fee_consent ||
    formData?.property_disclosure?.platformFeeConsent ||
    formData?.property_disclosure?.platform_fee_consent ||
    {}
  return normalizePlatformFeeConsentAcceptance(candidate, partyType)
}

export function isPlatformFeeConsentAccepted(formData = {}, partyType = '') {
  return readPlatformFeeConsentAcceptance(formData, partyType).accepted === true
}

export function buildPlatformFeeConsentAcceptance(partyType = '', overrides = {}) {
  const config = getPlatformFeeConsentConfig(partyType)
  const acceptedAt = overrides.acceptedAt || overrides.accepted_at || new Date().toISOString()
  return normalizePlatformFeeConsentAcceptance(
    {
      ...overrides,
      accepted: true,
      acceptedAt,
      wordingSnapshot: config.body,
    },
    config.partyType,
  )
}
