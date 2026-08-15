import { resolveTransactionBuyerAccessPolicy } from './transactionBuyersPolicy.js'

export const TRANSACTION_BUYER_OPERATIONAL_AUDIT_VERSION = 'transaction_buyer_operational_audit_phase7_v1'

function text(value) {
  return String(value ?? '').trim()
}

function lower(value) {
  return text(value).toLowerCase()
}

function firstText(...values) {
  return values.map(text).find(Boolean) || ''
}

function metadata(record = {}) {
  const value = record.metadata || record.buyerMetadata || record.buyer_metadata
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function buyerStatus(value = '') {
  return lower(value).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function transactionOnboardingSubmitted(transaction = {}, onboarding = null) {
  const transactionStatus = buyerStatus(transaction.onboarding_status || transaction.onboardingStatus)
  const onboardingStatus = buyerStatus(onboarding?.status)
  return Boolean(
    ['awaiting_signed_otp', 'signed_otp_received', 'client_onboarding_complete', 'completed', 'submitted'].includes(transactionStatus) ||
      ['submitted', 'reviewed', 'approved'].includes(onboardingStatus) ||
      transaction.onboarding_completed_at ||
      transaction.onboardingCompletedAt ||
      transaction.external_onboarding_submitted_at ||
      transaction.externalOnboardingSubmittedAt ||
      onboarding?.submittedAt ||
      onboarding?.submitted_at,
  )
}

function buyerHasTargetedLinkMetadata(buyer = {}) {
  const buyerMetadata = metadata(buyer)
  return Boolean(
    buyerMetadata.lastBuyerOnboardingLinkNonce ||
      buyerMetadata.lastBuyerPortalLinkNonce ||
      buyerMetadata.buyerOnboardingLinkVersion ||
      buyerMetadata.buyerPortalLinkVersion,
  )
}

function buyerDeliveryStarted(buyer = {}) {
  return ['sent', 'in_progress'].includes(buyerStatus(buyer.onboardingStatus)) ||
    ['sent', 'active'].includes(buyerStatus(buyer.portalInviteStatus)) ||
    Boolean(buyer.portalInvitedAt)
}

function issue({
  severity = 'warning',
  code = '',
  message = '',
  buyer = null,
  repairProjection = '',
  action = '',
} = {}) {
  return Object.freeze({
    severity,
    code,
    message,
    buyerTargetId: buyer
      ? firstText(buyer.participantId, buyer.buyerId, buyer.email, buyer.name)
      : null,
    buyerName: buyer?.name || null,
    buyerEmail: buyer?.email || null,
    repairProjection: repairProjection || null,
    action: action || null,
  })
}

export function buildTransactionBuyerOperationalAudit({
  transaction = {},
  onboarding = null,
  participants = [],
} = {}) {
  const transactionWithParticipants = {
    ...(transaction || {}),
    participants: Array.isArray(participants) && participants.length
      ? participants
      : transaction?.participants || transaction?.transactionParticipants || transaction?.transaction_participants || [],
  }
  const policy = resolveTransactionBuyerAccessPolicy(transactionWithParticipants)
  const activeBuyers = policy.buyerModel.buyers.filter((buyer) => buyer.active !== false)
  const issues = []
  const submitted = transactionOnboardingSubmitted(transaction, onboarding)
  const completedBuyerCount = activeBuyers.filter((buyer) => policy.buyerDecisions.find(
    (decision) => decision.buyer.identityKey === buyer.identityKey,
  )?.onboardingSatisfied).length

  if (!activeBuyers.length) {
    issues.push(issue({
      severity: 'critical',
      code: 'buyer_participants_missing',
      message: 'No active buyer participants are available for this transaction.',
      action: 'capture_buyer_participants',
    }))
  }

  if (activeBuyers.length && !activeBuyers.some((buyer) => buyer.isPrimary)) {
    issues.push(issue({
      severity: 'critical',
      code: 'primary_buyer_missing',
      message: 'No primary buyer participant is marked for this transaction.',
      action: 'repair_primary_buyer',
    }))
  }

  if (submitted && activeBuyers.length && completedBuyerCount === 0) {
    issues.push(issue({
      severity: 'critical',
      code: 'buyer_participant_completion_missing',
      message: 'Transaction-level onboarding is submitted, but no buyer participant is marked completed.',
      repairProjection: 'buyer_participant_completion',
      action: 'replay_buyer_onboarding_projection',
    }))
  }

  activeBuyers.forEach((buyer) => {
    if (buyerDeliveryStarted(buyer) && !buyerHasTargetedLinkMetadata(buyer)) {
      issues.push(issue({
        severity: 'warning',
        code: 'buyer_target_link_metadata_missing',
        message: 'Buyer delivery has started but no targeted-link metadata is recorded for this buyer.',
        buyer,
        action: 'resend_targeted_buyer_link',
      }))
    }

    if (buyerStatus(buyer.onboardingStatus) === 'completed' && !buyer.onboardingCompletedAt) {
      issues.push(issue({
        severity: 'warning',
        code: 'buyer_completion_timestamp_missing',
        message: 'Buyer onboarding is marked completed without a completion timestamp.',
        buyer,
        repairProjection: 'buyer_participant_completion',
        action: 'replay_buyer_onboarding_projection',
      }))
    }
  })

  const criticalCount = issues.filter((item) => item.severity === 'critical').length
  const warningCount = issues.filter((item) => item.severity === 'warning').length
  const replayProjections = [
    ...new Set(issues.map((item) => item.repairProjection).filter(Boolean)),
  ]

  return Object.freeze({
    version: TRANSACTION_BUYER_OPERATIONAL_AUDIT_VERSION,
    transactionId: policy.transactionId || firstText(transaction?.id, transaction?.transactionId, transaction?.transaction_id),
    health: criticalCount ? 'critical' : warningCount ? 'warning' : 'healthy',
    activeBuyerCount: activeBuyers.length,
    completedBuyerCount,
    submitted,
    criticalCount,
    warningCount,
    issues: Object.freeze(issues),
    replayProjections: Object.freeze(replayProjections),
    summary: Object.freeze({
      allActiveBuyersOnboardingSatisfied: policy.summary.allActiveBuyersOnboardingSatisfied,
      allActiveBuyersPortalReady: policy.summary.allActiveBuyersPortalReady,
      contactableBuyerCount: policy.summary.contactableBuyerCount,
      portalAlreadySentBuyerCount: policy.summary.portalAlreadySentBuyerCount,
    }),
  })
}
