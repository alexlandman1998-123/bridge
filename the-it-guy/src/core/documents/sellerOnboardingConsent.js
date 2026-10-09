import { readSellerDisclosureAcknowledgements, SELLER_DISCLOSURE_ACKNOWLEDGEMENT_KEYS } from './sellerDisclosureAcknowledgements.js'

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
      ...(item && typeof item === 'object' ? item : {}),
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
  if (current[consentKey].accepted === Boolean(isAccepted)) return current
  const { history = [], ...previousEvidence } = current[consentKey]
  return {
    ...current,
    [consentKey]: {
      ...current[consentKey],
      accepted: Boolean(isAccepted),
      acceptedAt: isAccepted ? at : '',
      accepted_at: isAccepted ? at : '',
      wordingVersion: SELLER_ONBOARDING_CONSENT_VERSION,
      wording_version: SELLER_ONBOARDING_CONSENT_VERSION,
      source: 'seller_onboarding',
      recordedAt: at,
      history: [...(Array.isArray(history) ? history : []), ...(previousEvidence.acceptedAt || previousEvidence.recordedAt ? [previousEvidence] : [])],
    },
  }
}

export function areSellerOnboardingConsentsComplete(formData = {}) {
  return Object.values(readSellerOnboardingConsents(formData)).every((consent) => consent.accepted)
}

// Prefer the actual privacy choice over legacy summary fields. Private signer
// links store this choice on the primary signer rather than the shared disclosure.
function resolveSellerPopiConsent(formData = {}) {
  const signers = formData.sellerComplianceSigners || formData.seller_compliance_signers ||
    formData.sellerComplianceSigning?.signers || formData.seller_compliance_signing?.signers || []
  const primarySigner = Array.isArray(signers)
    ? [...signers].sort((a, b) => Number(a.order || 1) - Number(b.order || 1))[0]
    : null
  const disclosure = formData.propertyDisclosure || formData.property_disclosure || {}
  const consentSource = formData.sellerOnboardingConsents || formData.seller_onboarding_consents || {}
  const processing = consentSource.privacyProcessing
  const privacy = readSellerOnboardingConsents(formData).privacyProcessing
  if (processing !== undefined && (typeof processing !== 'object' || Object.hasOwn(processing || {}, 'accepted'))) {
    return { accepted: privacy.accepted, acceptedAt: privacy.accepted ? privacy.acceptedAt : '', captured: true }
  }
  const privacyKey = SELLER_DISCLOSURE_ACKNOWLEDGEMENT_KEYS.privacyAndPaiaNotice
  for (const value of [
    primarySigner?.acknowledgements,
    disclosure.sellerDisclosureAcknowledgements,
    disclosure.seller_disclosure_acknowledgements,
  ]) {
    const entries = Array.isArray(value?.acknowledgements) ? value.acknowledgements : []
    const item = entries.find((entry) => entry?.key === privacyKey) ?? value?.[privacyKey]
    if (item === undefined) continue
    const evidence = readSellerDisclosureAcknowledgements(value)
    const isAccepted = evidence.acknowledgements.find((entry) => entry.key === privacyKey).accepted
    return { accepted: isAccepted, acceptedAt: isAccepted ? evidence.acceptedAt : '', captured: true }
  }
  const legacyValue = [formData.popiConsentAccepted, formData.popi_consent_accepted, formData.popiConsent, formData.popi_consent, formData.privacyConsent]
    .find((value) => value !== undefined && value !== null && text(value) !== '')
  const isAccepted = accepted(legacyValue)
  return {
    accepted: isAccepted,
    acceptedAt: isAccepted ? text(formData.popiConsentAcceptedAt || formData.popi_consent_accepted_at) : '',
    captured: legacyValue !== undefined,
  }
}

export function readSellerPopiConsent(formData = {}) {
  const { accepted: isAccepted, acceptedAt } = resolveSellerPopiConsent(formData)
  return { accepted: isAccepted, acceptedAt }
}

export function sellerPopiConsentDisplayValue(formData = {}) {
  const consent = resolveSellerPopiConsent(formData)
  return consent.accepted ? 'Accepted' : consent.captured ? 'No' : ''
}

/** Normalise editable summaries without rewriting signer or disclosure evidence. */
export function buildSellerPopiConsentPatch(formData = {}, value, { at = new Date().toISOString(), source = 'agent_capture' } = {}) {
  if (value === undefined || value === null || text(value) === '') return {}
  const current = resolveSellerPopiConsent(formData)
  const isAccepted = accepted(value)
  const changed = !current.captured || current.accepted !== isAccepted
  const acceptedAt = isAccepted ? changed ? at : current.acceptedAt : ''
  const patch = {
    popiConsent: isAccepted ? 'Accepted' : 'No',
    popi_consent: isAccepted ? 'Accepted' : 'No',
    privacyConsent: isAccepted ? 'Accepted' : 'No',
    popiConsentAccepted: isAccepted,
    popi_consent_accepted: isAccepted,
    popiConsentAcceptedAt: acceptedAt,
    popi_consent_accepted_at: acceptedAt,
  }
  if (changed) {
    const consents = formData.sellerOnboardingConsents || formData.seller_onboarding_consents || {}
    const previous = consents.privacyProcessing
    const previousRecord = previous && typeof previous === 'object' ? previous : {}
    const { history = [], ...previousEvidence } = previousRecord
    const privacyProcessing = {
      ...previousEvidence,
      accepted: isAccepted, acceptedAt, accepted_at: acceptedAt,
      wordingVersion: SELLER_ONBOARDING_CONSENT_VERSION,
      wording_version: SELLER_ONBOARDING_CONSENT_VERSION,
      policyKey: 'popia_processing', source, recordedAt: at,
      history: [...(Array.isArray(history) ? history : []), ...(current.captured ? [{ ...previousEvidence, accepted: current.accepted, acceptedAt: current.acceptedAt }] : [])],
    }
    patch.sellerOnboardingConsents = { ...consents, privacyProcessing }
    patch.seller_onboarding_consents = patch.sellerOnboardingConsents
  }
  return patch
}
