export const PLATFORM_FEE_CONSENT_TYPE = 'arch9_transaction_platform_fee'
export const PLATFORM_FEE_AMOUNT = '750.00'
export const PLATFORM_FEE_CURRENCY = 'ZAR'
export const PLATFORM_FEE_CHECKBOX_LABEL = 'I have read, understood and agree to the above authorisation.'

export const PLATFORM_FEE_CONSENT = Object.freeze({
  seller: Object.freeze({
    partyType: 'seller',
    title: 'ARCH9 Transaction Platform Fee',
    body:
      'I acknowledge that this transaction is being facilitated through the ARCH9 platform. I authorise the transferring attorney to deduct the once-off ARCH9 Transaction Platform Fee of R750.00 from my proceeds on registration and to remit that amount to ARCH9.',
    checkboxLabel: PLATFORM_FEE_CHECKBOX_LABEL,
    wordingVersion: 'seller-platform-fee-v1',
    source: 'seller_defects_declaration',
    validationMessage: 'Please acknowledge the ARCH9 Transaction Platform Fee authorisation before signing the declaration.',
  }),
  buyer: Object.freeze({
    partyType: 'buyer',
    title: 'ARCH9 Transaction Platform Fee',
    body:
      'I acknowledge that a once-off ARCH9 Transaction Platform Fee of R750.00 will be included in my transfer cost account. I authorise the transferring attorney to collect this amount and remit it to ARCH9.',
    checkboxLabel: PLATFORM_FEE_CHECKBOX_LABEL,
    wordingVersion: 'buyer-platform-fee-v1',
    source: 'buyer_onboarding',
    validationMessage: 'Please acknowledge the ARCH9 Transaction Platform Fee authorisation before completing your onboarding.',
  }),
})

export function formatPlatformFeeAmount(amount = PLATFORM_FEE_AMOUNT, currency = PLATFORM_FEE_CURRENCY) {
  const numericAmount = Number(amount)
  if (!Number.isFinite(numericAmount)) return `${currency} ${amount}`
  if (currency === 'ZAR') return `R${numericAmount.toFixed(2)}`
  return `${currency} ${numericAmount.toFixed(2)}`
}

export function getPlatformFeeConsentConfig(partyType = '') {
  return PLATFORM_FEE_CONSENT[String(partyType || '').trim().toLowerCase()] || PLATFORM_FEE_CONSENT.buyer
}

export function normalizePlatformFeeConsentAcceptance(value = {}, partyType = '') {
  const config = getPlatformFeeConsentConfig(partyType)
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    consentType: PLATFORM_FEE_CONSENT_TYPE,
    consent_type: PLATFORM_FEE_CONSENT_TYPE,
    partyType: config.partyType,
    party_type: config.partyType,
    accepted: Boolean(source.accepted ?? source.platformFeeAccepted ?? source.platform_fee_accepted),
    acceptedAt: source.acceptedAt || source.accepted_at || '',
    accepted_at: source.accepted_at || source.acceptedAt || '',
    feeAmount: PLATFORM_FEE_AMOUNT,
    fee_amount: PLATFORM_FEE_AMOUNT,
    currency: PLATFORM_FEE_CURRENCY,
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
