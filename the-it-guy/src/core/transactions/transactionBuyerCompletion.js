import {
  TRANSACTION_BUYER_ONBOARDING_STATUSES,
  TRANSACTION_BUYER_PROFILE_STATUSES,
  normalizeTransactionBuyer,
} from './transactionBuyersModel.js'

export const TRANSACTION_BUYER_COMPLETION_VERSION = 'transaction_buyer_completion_phase5_v1'

function text(value) {
  return String(value ?? '').trim()
}

function lower(value) {
  return text(value).toLowerCase()
}

function firstText(...values) {
  return values.map(text).find(Boolean) || ''
}

function firstEmail(...values) {
  return lower(firstText(...values))
}

export function getBuyerOnboardingCompletionIdentity(input = {}) {
  const formData = input.formData && typeof input.formData === 'object' ? input.formData : input
  const buyer = input.buyer && typeof input.buyer === 'object' ? input.buyer : null

  return Object.freeze({
    participantId: firstText(
      input.participantId,
      input.participant_id,
      formData.buyerParticipantId,
      formData.buyer_participant_id,
      formData.participantId,
      formData.participant_id,
    ),
    buyerPartyId: firstText(
      input.buyerPartyId,
      input.buyer_party_id,
      input.buyerId,
      input.buyer_id,
      formData.buyerPartyId,
      formData.buyer_party_id,
      formData.buyerId,
      formData.buyer_id,
    ),
    email: firstEmail(
      input.email,
      input.buyerEmail,
      input.buyer_email,
      formData.email,
      formData.buyerEmail,
      formData.buyer_email,
      formData.participantEmail,
      formData.participant_email,
      formData.clientEmail,
      formData.client_email,
      formData.company_contact_email,
      formData.trust_contact_email,
      formData.authorised_signatory_email,
      formData.authorised_trustee_email,
      buyer?.email,
      buyer?.buyer_email,
    ),
    targetNonce: firstText(
      input.targetNonce,
      input.target_nonce,
      input.buyerTargetNonce,
      input.buyer_target_nonce,
      formData.buyerTargetNonce,
      formData.buyer_target_nonce,
      formData.buyerLinkNonce,
      formData.buyer_link_nonce,
    ),
    name: firstText(
      input.name,
      input.buyerName,
      input.buyer_name,
      formData.full_name,
      formData.fullName,
      formData.buyerName,
      formData.buyer_name,
      formData.company_contact_name,
      formData.trust_contact_name,
      formData.authorised_signatory_name,
      formData.authorised_trustee_name,
      buyer?.name,
      buyer?.buyer_name,
    ),
  })
}

export function resolveBuyerOnboardingCompletionTarget({
  buyers = [],
  formData = {},
  buyer = null,
  fallbackToPrimary = true,
} = {}) {
  const normalizedBuyers = (Array.isArray(buyers) ? buyers : [])
    .map((item, index) => normalizeTransactionBuyer(item, { index, source: 'buyer_completion_candidates' }))
    .filter((item) => item.active !== false)
  const identity = getBuyerOnboardingCompletionIdentity({ formData, buyer })
  const matchedByParticipantId = identity.participantId
    ? normalizedBuyers.find((item) => item.participantId === identity.participantId)
    : null
  const matchedByBuyerPartyId = !matchedByParticipantId && identity.buyerPartyId
    ? normalizedBuyers.find((item) => item.buyerId === identity.buyerPartyId)
    : null
  const matchedByEmail = !matchedByParticipantId && !matchedByBuyerPartyId && identity.email
    ? normalizedBuyers.find((item) => item.email === identity.email)
    : null
  const primaryBuyer = fallbackToPrimary
    ? normalizedBuyers.find((item) => item.isPrimary) || normalizedBuyers[0] || null
    : null
  const target = matchedByParticipantId || matchedByBuyerPartyId || matchedByEmail || primaryBuyer
  const matchBasis = matchedByParticipantId
    ? 'participant_id'
    : matchedByBuyerPartyId
      ? 'buyer_party_id'
      : matchedByEmail
        ? 'email'
        : target
          ? 'primary_fallback'
          : ''

  if (!target) {
    return Object.freeze({
      version: TRANSACTION_BUYER_COMPLETION_VERSION,
      hasTarget: false,
      matchBasis,
      participantId: '',
      buyerPartyId: '',
      email: identity.email,
      name: identity.name,
      targetNonce: identity.targetNonce,
      isPrimary: false,
      targetId: identity.participantId || identity.buyerPartyId || identity.email,
    })
  }

  return Object.freeze({
    version: TRANSACTION_BUYER_COMPLETION_VERSION,
    hasTarget: Boolean(target.participantId || target.buyerId || target.email),
    matchBasis,
    participantId: target.participantId || identity.participantId || '',
    buyerPartyId: target.buyerId || identity.buyerPartyId || '',
    email: target.email || identity.email || '',
    name: target.name || identity.name || '',
    targetNonce: identity.targetNonce,
    isPrimary: Boolean(target.isPrimary),
    targetId: target.participantId || target.buyerId || target.email || identity.participantId || identity.buyerPartyId || identity.email,
  })
}

export function buildBuyerOnboardingCompletionParticipantPatch({
  target = null,
  completedAt = '',
  source = 'buyer_onboarding_completed',
  existingMetadata = {},
} = {}) {
  const timestamp = firstText(completedAt) || new Date().toISOString()
  const metadata = existingMetadata && typeof existingMetadata === 'object' && !Array.isArray(existingMetadata)
    ? existingMetadata
    : {}

  return Object.freeze({
    buyer_profile_status: TRANSACTION_BUYER_PROFILE_STATUSES.completed,
    buyer_onboarding_status: TRANSACTION_BUYER_ONBOARDING_STATUSES.completed,
    buyer_onboarding_completed_at: timestamp,
    buyer_metadata: {
      ...metadata,
      buyerOnboardingCompletionVersion: TRANSACTION_BUYER_COMPLETION_VERSION,
      lastBuyerOnboardingCompletedAt: timestamp,
      lastBuyerOnboardingCompletedSource: source,
      lastBuyerOnboardingCompletionTargetId: target?.targetId || null,
      lastBuyerOnboardingCompletionMatchBasis: target?.matchBasis || null,
    },
    updated_at: timestamp,
  })
}
