import { buildBuyerOnboardingCompletionParticipantPatch, resolveBuyerOnboardingCompletionTarget } from './transactionBuyerCompletion.js'
import {
  TRANSACTION_BUYER_ONBOARDING_STATUSES,
  TRANSACTION_BUYER_PORTAL_STATUSES,
} from './transactionBuyersModel.js'
import { buildTransactionBuyerDeliveryPayload, TRANSACTION_BUYER_DELIVERY_ACTIONS } from './transactionBuyerDelivery.js'
import { buildTransactionBuyerOperationalAudit } from './transactionBuyerOperationalAudit.js'
import { resolveTransactionBuyerAccessPolicy } from './transactionBuyersPolicy.js'

export const TRANSACTION_BUYER_RELEASE_READINESS_VERSION = 'transaction_buyer_release_readiness_phase8_v1'

export const TRANSACTION_BUYER_RELEASE_PHASES = Object.freeze([
  { phase: 1, key: 'buyer_party_model', label: 'Multi-buyer participant model' },
  { phase: 2, key: 'buyer_access_policy', label: 'Per-buyer access policy' },
  { phase: 3, key: 'workspace_roster', label: 'Agent buyer roster workspace' },
  { phase: 4, key: 'targeted_delivery', label: 'Targeted buyer onboarding delivery' },
  { phase: 5, key: 'completion_projection', label: 'Buyer participant completion projection' },
  { phase: 6, key: 'targeted_links', label: 'Buyer-targeted onboarding links' },
  { phase: 7, key: 'operational_audit', label: 'Operational audit and recovery surface' },
  { phase: 8, key: 'release_readiness', label: 'Global and Kingstons release gate' },
])

const SIGNED_OTP_DOCUMENT = Object.freeze({
  key: 'signed_otp',
  status: 'uploaded',
  fileUrl: 'https://example.test/signed-otp.pdf',
})

function text(value) {
  return String(value ?? '').trim()
}

function key(value = '') {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function participant({
  id,
  buyerId,
  name,
  email,
  phone = '+27 82 000 0000',
  primary = false,
  position = 0,
  onboardingStatus = TRANSACTION_BUYER_ONBOARDING_STATUSES.notStarted,
  manualCaptureStatus = TRANSACTION_BUYER_ONBOARDING_STATUSES.notStarted,
  portalInviteStatus = TRANSACTION_BUYER_PORTAL_STATUSES.notSent,
  onboardingCompletedAt = '',
  portalInvitedAt = '',
  metadata = {},
} = {}) {
  return {
    id,
    buyer_party_id: buyerId,
    transaction_role: 'buyer',
    role_type: 'buyer',
    participant_name: name,
    participant_email: email,
    participant_phone: phone,
    is_primary_buyer: Boolean(primary),
    buyer_party_position: position,
    buyer_onboarding_status: onboardingStatus,
    buyer_manual_capture_status: manualCaptureStatus,
    buyer_portal_invite_status: portalInviteStatus,
    buyer_onboarding_completed_at: onboardingCompletedAt,
    buyer_portal_invited_at: portalInvitedAt,
    buyer_metadata: metadata,
    status: 'active',
  }
}

export function buildTransactionBuyerReleaseReadinessScenarios() {
  return [
    {
      scenario: 'global_pre_otp_multi_buyer',
      expectedMode: 'global_before_otp',
      transaction: {
        id: 'txn-global-pre-otp',
        agencySlug: 'global',
        onboarding_status: 'awaiting_client_onboarding',
        participants: [
          participant({
            id: 'participant-global-primary',
            buyerId: 'buyer-global-primary',
            name: 'Primary Global Buyer',
            email: 'primary.global@example.com',
            primary: true,
          }),
          participant({
            id: 'participant-global-secondary',
            buyerId: 'buyer-global-secondary',
            name: 'Secondary Global Buyer',
            email: 'secondary.global@example.com',
            position: 1,
          }),
        ],
      },
    },
    {
      scenario: 'global_manual_capture_buyer',
      expectedMode: 'global_manual_capture',
      transaction: {
        id: 'txn-global-manual',
        agencySlug: 'global',
        onboarding_status: 'awaiting_signed_otp',
        participants: [
          participant({
            id: 'participant-global-manual',
            buyerId: 'buyer-global-manual',
            name: 'Manual Global Buyer',
            email: '',
            primary: true,
            manualCaptureStatus: TRANSACTION_BUYER_ONBOARDING_STATUSES.manuallyCaptured,
            onboardingCompletedAt: '2026-08-15T08:00:00.000Z',
          }),
        ],
      },
    },
    {
      scenario: 'global_completed_multi_buyer',
      expectedMode: 'global_completed',
      transaction: {
        id: 'txn-global-completed',
        agencySlug: 'global',
        onboarding_status: 'awaiting_signed_otp',
        onboarding_completed_at: '2026-08-15T10:00:00.000Z',
        participants: [
          participant({
            id: 'participant-global-completed-primary',
            buyerId: 'buyer-global-completed-primary',
            name: 'Completed Primary Buyer',
            email: 'completed.primary@example.com',
            primary: true,
            onboardingStatus: TRANSACTION_BUYER_ONBOARDING_STATUSES.completed,
            onboardingCompletedAt: '2026-08-15T10:00:00.000Z',
            metadata: {
              lastBuyerOnboardingLinkNonce: 'nonce-completed-primary',
            },
          }),
          participant({
            id: 'participant-global-completed-secondary',
            buyerId: 'buyer-global-completed-secondary',
            name: 'Completed Secondary Buyer',
            email: 'completed.secondary@example.com',
            position: 1,
            onboardingStatus: TRANSACTION_BUYER_ONBOARDING_STATUSES.completed,
            onboardingCompletedAt: '2026-08-15T10:05:00.000Z',
            metadata: {
              lastBuyerOnboardingLinkNonce: 'nonce-completed-secondary',
            },
          }),
        ],
      },
    },
    {
      scenario: 'kingstons_before_signed_otp',
      expectedMode: 'kingstons_before_otp',
      transaction: {
        id: 'txn-kingstons-before-otp',
        agencySlug: 'kingstons',
        onboarding_status: 'signed_otp_required',
        participants: [
          participant({
            id: 'participant-kingstons-before-primary',
            buyerId: 'buyer-kingstons-before-primary',
            name: 'Kingstons Primary Buyer',
            email: 'kingstons.primary@example.com',
            primary: true,
          }),
          participant({
            id: 'participant-kingstons-before-secondary',
            buyerId: 'buyer-kingstons-before-secondary',
            name: 'Kingstons Secondary Buyer',
            email: 'kingstons.secondary@example.com',
            position: 1,
          }),
        ],
      },
    },
    {
      scenario: 'kingstons_after_signed_otp',
      expectedMode: 'kingstons_after_otp',
      transaction: {
        id: 'txn-kingstons-after-otp',
        agencySlug: 'kingstons',
        onboarding_status: 'awaiting_transfer',
        documents: [SIGNED_OTP_DOCUMENT],
        participants: [
          participant({
            id: 'participant-kingstons-after-primary',
            buyerId: 'buyer-kingstons-after-primary',
            name: 'Kingstons OTP Primary Buyer',
            email: 'kingstons.otp.primary@example.com',
            primary: true,
          }),
          participant({
            id: 'participant-kingstons-after-secondary',
            buyerId: 'buyer-kingstons-after-secondary',
            name: 'Kingstons OTP Secondary Buyer',
            email: 'kingstons.otp.secondary@example.com',
            position: 1,
          }),
        ],
      },
    },
  ]
}

function buildDeliveryProof(transaction = {}, decision = {}) {
  if (!decision?.contactable) return null
  return buildTransactionBuyerDeliveryPayload({
    transactionId: transaction.id,
    decision,
    action: decision.actions?.sendPortalLink?.enabled
      ? TRANSACTION_BUYER_DELIVERY_ACTIONS.sendPortalLink
      : TRANSACTION_BUYER_DELIVERY_ACTIONS.sendOnboarding,
    source: 'multi_buyer_phase8_release_readiness',
  })
}

function buildCompletionProof(transaction = {}, decision = {}) {
  if (!decision?.buyer?.participantId) return null
  const target = resolveBuyerOnboardingCompletionTarget({
    buyers: transaction.participants || [],
    formData: {
      buyerParticipantId: decision.buyer.participantId,
      buyerPartyId: decision.buyer.buyerId,
      email: decision.email,
      buyerTargetNonce: decision.buyer.metadata?.lastBuyerOnboardingLinkNonce || 'phase8-target-nonce',
    },
  })
  const patch = buildBuyerOnboardingCompletionParticipantPatch({
    target,
    completedAt: '2026-08-15T11:00:00.000Z',
    source: 'multi_buyer_phase8_release_readiness',
    existingMetadata: decision.buyer.metadata,
  })
  return { target, patch }
}

function evaluateExpectedMode({ expectedMode = '', policy, audit, deliveryProofs = [], completionProofs = [] } = {}) {
  const activeDecisions = policy.buyerDecisions.filter((decision) => decision.active)
  const contactableDecisions = activeDecisions.filter((decision) => decision.contactable)
  const blockers = []
  const warnings = []

  if (!activeDecisions.length) {
    blockers.push('No active buyers available for release scenario.')
  }

  if (audit.health === 'critical') {
    blockers.push('Phase 7 buyer operational audit is critical.')
  } else if (audit.health === 'warning') {
    warnings.push('Phase 7 buyer operational audit has warnings.')
  }

  if (expectedMode === 'global_before_otp') {
    if (policy.isKingstons) blockers.push('Global pre-OTP scenario resolved as Kingstons.')
    if (!policy.summary.anyBuyerCanReceiveOnboarding) blockers.push('Global buyers cannot receive onboarding before OTP.')
    if (!contactableDecisions.every((decision) => decision.actions.sendOnboarding.enabled)) {
      blockers.push('A contactable global buyer is blocked from onboarding before OTP.')
    }
    if (!activeDecisions.every((decision) => decision.actions.manualCapture.enabled)) {
      blockers.push('Manual buyer capture is not available for every active global buyer.')
    }
    if (policy.summary.anyBuyerCanReceivePortal) blockers.push('Buyer portal became available before onboarding or OTP.')
  }

  if (expectedMode === 'global_manual_capture') {
    if (!policy.summary.canCaptureAnyBuyerManually) blockers.push('Agent manual buyer capture is not available.')
    if (!activeDecisions.every((decision) => decision.actions.manualCapture.enabled)) {
      blockers.push('Manual capture is not available on every active manual scenario buyer.')
    }
    if (!activeDecisions.some((decision) => decision.onboardingSatisfied)) {
      blockers.push('Manual capture does not satisfy buyer onboarding.')
    }
  }

  if (expectedMode === 'global_completed') {
    if (!policy.summary.allActiveBuyersOnboardingSatisfied) blockers.push('Not every global buyer is onboarding-satisfied.')
    if (!policy.summary.allActiveBuyersPortalReady) blockers.push('Not every completed global buyer is portal-ready.')
    if (!completionProofs.every((proof) => proof?.target?.matchBasis === 'participant_id')) {
      blockers.push('Completion projection does not target buyers by participant id.')
    }
  }

  if (expectedMode === 'kingstons_before_otp') {
    if (!policy.isKingstons) blockers.push('Kingstons pre-OTP scenario did not resolve as Kingstons.')
    if (policy.summary.anyBuyerCanReceiveOnboarding) blockers.push('Kingstons buyer onboarding became available before signed OTP.')
    if (policy.summary.anyBuyerCanReceivePortal) blockers.push('Kingstons buyer portal became available before signed OTP.')
    if (!policy.actions.uploadSignedOtp?.enabled) blockers.push('Kingstons signed OTP upload action is not available.')
  }

  if (expectedMode === 'kingstons_after_otp') {
    if (!policy.isKingstons) blockers.push('Kingstons post-OTP scenario did not resolve as Kingstons.')
    if (!policy.summary.allActiveBuyersPortalReady) blockers.push('Kingstons buyers are not all portal-ready after signed OTP.')
    if (policy.summary.anyBuyerCanReceiveOnboarding) blockers.push('Kingstons buyer onboarding became available after OTP despite the exception flow.')
    if (policy.actions.uploadSignedOtp?.enabled) blockers.push('Kingstons signed OTP upload action stayed open after evidence upload.')
  }

  if (!deliveryProofs.every((proof) =>
    proof?.buyerDeliveryVersion &&
      proof?.buyerTargetId &&
      proof?.buyerParticipantId &&
      proof?.buyerPartyId &&
      proof?.buyerDeliveryAction,
  )) {
    blockers.push('Targeted delivery payloads are missing buyer participant targeting fields.')
  }

  return { blockers, warnings }
}

export function evaluateTransactionBuyerReleaseScenario(scenario = {}) {
  const transaction = scenario.transaction || {}
  const policy = resolveTransactionBuyerAccessPolicy(transaction)
  const audit = buildTransactionBuyerOperationalAudit({
    transaction,
    onboarding: scenario.onboarding || null,
    participants: transaction.participants || [],
  })
  const contactableDecisions = policy.buyerDecisions.filter((decision) => decision.active && decision.contactable)
  const deliveryProofs = contactableDecisions.map((decision) => buildDeliveryProof(transaction, decision)).filter(Boolean)
  const completionProofs = policy.buyerDecisions
    .filter((decision) => decision.active && decision.onboardingSatisfied)
    .map((decision) => buildCompletionProof(transaction, decision))
    .filter(Boolean)
  const evaluation = evaluateExpectedMode({
    expectedMode: scenario.expectedMode,
    policy,
    audit,
    deliveryProofs,
    completionProofs,
  })

  return Object.freeze({
    scenario: scenario.scenario || transaction.id || '',
    expectedMode: scenario.expectedMode || '',
    transactionId: transaction.id || '',
    ready: evaluation.blockers.length === 0,
    health: audit.health,
    isKingstons: policy.isKingstons,
    activeBuyerCount: policy.summary.activeBuyerCount,
    contactableBuyerCount: policy.summary.contactableBuyerCount,
    onboardingSatisfiedBuyerCount: policy.summary.onboardingSatisfiedBuyerCount,
    portalReadyBuyerCount: policy.summary.portalReadyBuyerCount,
    portalAlreadySentBuyerCount: policy.summary.portalAlreadySentBuyerCount,
    manualCaptureAvailable: policy.summary.canCaptureAnyBuyerManually,
    targetedDeliveryProofCount: deliveryProofs.length,
    completionProofCount: completionProofs.length,
    blockers: Object.freeze(evaluation.blockers),
    warnings: Object.freeze(evaluation.warnings),
  })
}

export function buildTransactionBuyerReleaseReadinessReport({ scenarios = null } = {}) {
  const rows = (Array.isArray(scenarios) && scenarios.length ? scenarios : buildTransactionBuyerReleaseReadinessScenarios())
    .map((scenario) => evaluateTransactionBuyerReleaseScenario(scenario))
  const blockers = rows.flatMap((row) => row.blockers.map((blocker) => ({
    scenario: row.scenario,
    transactionId: row.transactionId,
    blocker,
  })))
  const warnings = rows.flatMap((row) => row.warnings.map((warning) => ({
    scenario: row.scenario,
    transactionId: row.transactionId,
    warning,
  })))
  const globalRows = rows.filter((row) => !row.isKingstons)
  const kingstonsRows = rows.filter((row) => row.isKingstons)
  const beforeOtpGlobalRows = rows.filter((row) => row.expectedMode === 'global_before_otp')
  const manualRows = rows.filter((row) => row.expectedMode === 'global_manual_capture')
  const completedRows = rows.filter((row) => row.expectedMode === 'global_completed')
  const kingstonsAfterOtpRows = rows.filter((row) => row.expectedMode === 'kingstons_after_otp')

  return Object.freeze({
    version: TRANSACTION_BUYER_RELEASE_READINESS_VERSION,
    phase: 8,
    phaseKey: 'release_readiness',
    ready: blockers.length === 0,
    phases: TRANSACTION_BUYER_RELEASE_PHASES,
    counts: Object.freeze({
      scenarios: rows.length,
      ready: rows.filter((row) => row.ready).length,
      blocked: rows.filter((row) => !row.ready).length,
      warnings: warnings.length,
      global: globalRows.length,
      kingstons: kingstonsRows.length,
      targetedDeliveryProofs: rows.reduce((sum, row) => sum + row.targetedDeliveryProofCount, 0),
      completionProofs: rows.reduce((sum, row) => sum + row.completionProofCount, 0),
    }),
    globalContract: Object.freeze({
      buyerOnboardingBeforeOtpGlobally: beforeOtpGlobalRows.length > 0 && beforeOtpGlobalRows.every((row) => row.ready),
      agentManualCaptureAvailable: manualRows.length > 0 && manualRows.every((row) => row.ready && row.manualCaptureAvailable),
      completedBuyersPortalReady: completedRows.length > 0 && completedRows.every((row) => row.ready),
      kingstonsSignedOtpException: kingstonsRows.length > 0 && kingstonsRows.every((row) => row.ready),
      allKingstonsBuyersPortalReadyAfterOtp: kingstonsAfterOtpRows.length > 0 && kingstonsAfterOtpRows.every((row) => row.portalReadyBuyerCount === row.activeBuyerCount),
      noCriticalOperationalAudits: rows.every((row) => key(row.health) !== 'critical'),
      targetedDeliveryPayloads: rows.every((row) => row.targetedDeliveryProofCount === 0 || row.ready),
      participantCompletionProjection: completedRows.every((row) => row.completionProofCount === row.onboardingSatisfiedBuyerCount),
    }),
    rows: Object.freeze(rows),
    blockers: Object.freeze(blockers),
    warnings: Object.freeze(warnings),
  })
}

export default {
  TRANSACTION_BUYER_RELEASE_PHASES,
  TRANSACTION_BUYER_RELEASE_READINESS_VERSION,
  buildTransactionBuyerReleaseReadinessReport,
  buildTransactionBuyerReleaseReadinessScenarios,
  evaluateTransactionBuyerReleaseScenario,
}
