import {
  CLIENT_ACCESS_ACTIONS,
  CLIENT_ACCESS_POLICY_VERSION,
  CLIENT_ACCESS_REASONS,
  resolveBuyerAccessPolicy,
} from '../clientAccess/clientAccessPolicy.js'
import {
  TRANSACTION_BUYER_ONBOARDING_STATUSES,
  TRANSACTION_BUYER_PORTAL_STATUSES,
  TRANSACTION_BUYERS_MODEL_VERSION,
  resolveTransactionBuyers,
} from './transactionBuyersModel.js'

export const TRANSACTION_BUYERS_POLICY_VERSION = 'transaction_buyers_policy_phase2_v1'

const SATISFIED_ONBOARDING_STATUSES = new Set([
  TRANSACTION_BUYER_ONBOARDING_STATUSES.completed,
  TRANSACTION_BUYER_ONBOARDING_STATUSES.manuallyCaptured,
  'captured',
  'complete',
  'approved',
  'submitted',
])

const SENT_PORTAL_STATUSES = new Set([
  TRANSACTION_BUYER_PORTAL_STATUSES.sent,
  TRANSACTION_BUYER_PORTAL_STATUSES.active,
])

function text(value) {
  return String(value ?? '').trim()
}

function lower(value) {
  return text(value).toLowerCase()
}

function firstText(...values) {
  return values.map(text).find(Boolean) || ''
}

function key(value = '') {
  return lower(value).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function booleanish(value) {
  if (value === true || value === 1) return true
  const normalized = key(value)
  return normalized === 'true' || normalized === 'yes' || normalized === 'y' || normalized === '1'
}

function transactionContextId(transaction = {}) {
  return firstText(transaction.id, transaction.transactionId, transaction.transaction_id)
}

function buyerTargetId(buyer = {}) {
  return firstText(buyer.participantId, buyer.buyerId, buyer.email, buyer.name)
}

function buyerHasEmail(buyer = {}) {
  return Boolean(text(buyer.email))
}

function buyerOnboardingSatisfied(buyer = {}) {
  return Boolean(
    SATISFIED_ONBOARDING_STATUSES.has(key(buyer.onboardingStatus)) ||
      SATISFIED_ONBOARDING_STATUSES.has(key(buyer.manualCaptureStatus)) ||
      text(buyer.onboardingCompletedAt) ||
      text(buyer.manualCaptureCompletedAt),
  )
}

function buyerPortalAlreadySent(buyer = {}) {
  return SENT_PORTAL_STATUSES.has(key(buyer.portalInviteStatus)) || Boolean(text(buyer.portalInvitedAt))
}

function transactionAccessContext(transaction = {}, buyer = {}) {
  return {
    ...transaction,
    transactionId: transactionContextId(transaction),
    buyerEmail: buyer.email,
    onboardingStatus: buyerOnboardingSatisfied(buyer) ? 'completed' : buyer.onboardingStatus,
    onboardingComplete: buyerOnboardingSatisfied(buyer),
    manualCapture: false,
  }
}

function deliveryAction(baseAction, buyer = {}) {
  if (buyerHasEmail(buyer)) return baseAction
  return Object.freeze({
    ...baseAction,
    enabled: false,
    reason: CLIENT_ACCESS_REASONS.buyerEmailRequired,
  })
}

function buyerDecision(transaction = {}, buyer = {}) {
  const canonicalPolicy = resolveBuyerAccessPolicy(transactionAccessContext(transaction, buyer))
  const sendOnboarding = deliveryAction(canonicalPolicy.actions.sendOnboarding, buyer)
  const sendPortalLink = deliveryAction(canonicalPolicy.actions.sendPortalLink, buyer)
  const manualCapture = Object.freeze({
    ...canonicalPolicy.actions.manualCapture,
    enabled: Boolean(transactionContextId(transaction)),
    reason: transactionContextId(transaction)
      ? CLIENT_ACCESS_REASONS.buyerManualCaptureReady
      : CLIENT_ACCESS_REASONS.transactionRequired,
  })
  const portalAlreadySent = buyerPortalAlreadySent(buyer)

  return Object.freeze({
    version: TRANSACTION_BUYERS_POLICY_VERSION,
    canonicalPolicyVersion: CLIENT_ACCESS_POLICY_VERSION,
    buyerModelVersion: TRANSACTION_BUYERS_MODEL_VERSION,
    buyer,
    targetId: buyerTargetId(buyer),
    participantId: buyer.participantId || '',
    buyerId: buyer.buyerId || '',
    email: buyer.email || '',
    isPrimary: Boolean(buyer.isPrimary),
    active: buyer.active !== false,
    contactable: buyerHasEmail(buyer),
    onboardingSatisfied: buyerOnboardingSatisfied(buyer),
    portalAlreadySent,
    actions: Object.freeze({
      sendOnboarding,
      manualCapture,
      sendPortalLink: Object.freeze({
        ...sendPortalLink,
        enabled: Boolean(sendPortalLink.enabled && !portalAlreadySent),
        reason: portalAlreadySent ? 'buyer_portal_already_sent' : sendPortalLink.reason,
      }),
      uploadSignedOtp: canonicalPolicy.actions.uploadSignedOtp,
    }),
    canonicalPolicy,
  })
}

function activeDecisions(decisions = []) {
  return decisions.filter((decision) => decision.active)
}

function findByTarget(decisions = [], target = {}) {
  const participantId = firstText(target.participantId, target.participant_id)
  const buyerId = firstText(target.buyerId, target.buyer_id, target.buyerPartyId, target.buyer_party_id)
  const email = lower(target.email || target.buyerEmail || target.buyer_email)
  return decisions.find((decision) => {
    return Boolean(
      (participantId && decision.participantId === participantId) ||
        (buyerId && decision.buyerId === buyerId) ||
        (email && lower(decision.email) === email),
    )
  }) || null
}

export function resolveTransactionBuyerAccessPolicy(transaction = {}, options = {}) {
  const buyerModel = resolveTransactionBuyers(transaction)
  const decisions = buyerModel.buyers.map((buyer) => buyerDecision(transaction, buyer))
  const active = activeDecisions(decisions)
  const primaryDecision = decisions.find((decision) => decision.isPrimary) || decisions[0] || null
  const requestedDecision = findByTarget(decisions, options.target || options.buyer || {})
  const defaultPortalDecision = primaryDecision?.actions.sendPortalLink.enabled
    ? primaryDecision
    : active.find((decision) => decision.actions.sendPortalLink.enabled) || primaryDecision

  const allActiveBuyersOnboardingSatisfied = active.length > 0 && active.every((decision) => decision.onboardingSatisfied)
  const allActiveBuyersPortalReady = active.length > 0 && active.every((decision) =>
    decision.actions.sendPortalLink.enabled || decision.portalAlreadySent,
  )
  const anyBuyerCanReceiveOnboarding = active.some((decision) => decision.actions.sendOnboarding.enabled)
  const anyBuyerCanReceivePortal = active.some((decision) => decision.actions.sendPortalLink.enabled)

  return Object.freeze({
    version: TRANSACTION_BUYERS_POLICY_VERSION,
    buyerModelVersion: buyerModel.modelVersion,
    transactionId: buyerModel.transactionId,
    legacyBuyerId: buyerModel.legacyBuyerId,
    legacyCompatible: buyerModel.legacyCompatible,
    isKingstons: Boolean(resolveBuyerAccessPolicy(transaction).isKingstons),
    buyerModel,
    buyerDecisions: Object.freeze(decisions),
    primaryDecision,
    requestedDecision,
    defaultPortalDecision,
    summary: Object.freeze({
      activeBuyerCount: active.length,
      totalBuyerCount: decisions.length,
      contactableBuyerCount: active.filter((decision) => decision.contactable).length,
      onboardingSatisfiedBuyerCount: active.filter((decision) => decision.onboardingSatisfied).length,
      portalReadyBuyerCount: active.filter((decision) => decision.actions.sendPortalLink.enabled).length,
      portalAlreadySentBuyerCount: active.filter((decision) => decision.portalAlreadySent).length,
      allActiveBuyersOnboardingSatisfied,
      allActiveBuyersPortalReady,
      anyBuyerCanReceiveOnboarding,
      anyBuyerCanReceivePortal,
      canCaptureAnyBuyerManually: Boolean(transactionContextId(transaction)),
      canAddBuyer: Boolean(transactionContextId(transaction)),
    }),
    actions: Object.freeze({
      sendPrimaryBuyerOnboarding: primaryDecision?.actions.sendOnboarding || null,
      capturePrimaryBuyerManually: primaryDecision?.actions.manualCapture || null,
      sendPrimaryBuyerPortalLink: primaryDecision?.actions.sendPortalLink || null,
      uploadSignedOtp: primaryDecision?.actions.uploadSignedOtp || Object.freeze({
        name: CLIENT_ACCESS_ACTIONS.uploadKingstonsSignedOtp,
        enabled: false,
        reason: CLIENT_ACCESS_REASONS.transactionRequired,
        label: 'Upload signed OTP',
      }),
    }),
  })
}

export function resolveTransactionBuyerActorAccess(transaction = {}, actor = {}) {
  const policy = resolveTransactionBuyerAccessPolicy(transaction, { target: actor })
  const decision = policy.requestedDecision
  const authenticated = Boolean(
    booleanish(actor.authenticated) ||
      firstText(actor.userId, actor.user_id, actor.id, actor.email),
  )

  return Object.freeze({
    version: TRANSACTION_BUYERS_POLICY_VERSION,
    transactionId: policy.transactionId,
    buyerFound: Boolean(decision),
    authenticated,
    buyerDecision: decision,
    canViewBuyerPortal: Boolean(authenticated && decision && (decision.actions.sendPortalLink.enabled || decision.portalAlreadySent)),
    canSubmitBuyerOnboarding: Boolean(authenticated && decision && decision.actions.sendOnboarding.enabled),
    canUploadBuyerDocuments: Boolean(authenticated && decision && (decision.onboardingSatisfied || decision.portalAlreadySent)),
  })
}
