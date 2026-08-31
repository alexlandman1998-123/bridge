import { getMainStageFromDetailedStage, normalizeTransactionStage } from './stageConfig.js'

export const NEW_TRANSACTION_SETUP_HEALTH_VERSION = 'arch9_new_transaction_setup_health_v1'

function text(value) {
  return String(value ?? '').trim()
}

function hasValue(...values) {
  return values.some((value) => text(value))
}

export function resolveWizardHandoffNextAction(handoffChecklist = {}, fallbackNextAction = '') {
  if (handoffChecklist?.signedOtpStatus === 'uploaded') {
    return 'Begin finance processing from the signed OTP handoff.'
  }
  if (handoffChecklist?.signedOtpStatus === 'pending_upload') {
    return 'Upload the signed OTP to the transaction documents.'
  }
  if (handoffChecklist?.signedOtpStatus === 'not_signed') {
    return 'Send or complete buyer onboarding so the OTP can be prepared and signed.'
  }
  return fallbackNextAction || null
}

export function resolveWizardInitialTransactionStage(handoffChecklist = {}, fallback = {}) {
  if (handoffChecklist?.signedOtpStatus === 'uploaded') {
    const stage = normalizeTransactionStage('Finance')
    return {
      stage,
      mainStage: getMainStageFromDetailedStage(stage),
      onboardingStatus: 'signed_otp_received',
    }
  }

  const stage = normalizeTransactionStage(fallback.stage, 'Reserved')
  return {
    stage,
    mainStage: text(fallback.mainStage) || getMainStageFromDetailedStage(stage),
    onboardingStatus: handoffChecklist?.signedOtpStatus === 'pending_upload'
      ? 'awaiting_signed_otp'
      : 'awaiting_client_onboarding',
  }
}

export function buildNewTransactionSetupHealth({
  setupWarnings = [],
  handoffChecklist = {},
  buyerParties = [],
  rolePlayers = [],
  onboardingRecord = null,
  transactionPayload = {},
  transactionType = '',
  sourceContext = {},
  completeness = null,
} = {}) {
  const warnings = Array.isArray(setupWarnings) ? setupWarnings : []
  const warningAreas = warnings.map((warning) => warning?.area).filter(Boolean)
  const normalizedTransactionType = text(transactionType)
  const hasLinkedSource =
    normalizedTransactionType === 'developer_sale'
      ? Boolean(transactionPayload.development_id && transactionPayload.unit_id)
      : Boolean(transactionPayload.listing_id || transactionPayload.property_address_line_1)
  const hasFinanceSeed = Boolean(
    hasValue(
      transactionPayload.finance_type,
      transactionPayload.finance_managed_by,
      transactionPayload.purchase_price,
      transactionPayload.cash_amount,
      transactionPayload.bond_amount,
      transactionPayload.deposit_amount,
    ),
  )
  const buyerPartyCount = Array.isArray(buyerParties) ? buyerParties.length : 0
  const rolePlayerCount = Array.isArray(rolePlayers) ? rolePlayers.length : 0
  const handoffStatus = handoffChecklist?.signedOtpStatus || 'pending_upload'
  const missingFollowUpItems = Array.isArray(completeness?.missingItems) ? completeness.missingItems : []

  const checks = [
    {
      key: 'source',
      label: 'Source linked',
      status: hasLinkedSource ? 'complete' : 'needs_attention',
      detail: hasLinkedSource
        ? sourceContext?.originLabel || 'Transaction source captured.'
        : 'The transaction was created without a canonical listing, development, unit, or property source.',
    },
    {
      key: 'buyer_parties',
      label: 'Buyer parties',
      status: buyerPartyCount ? 'complete' : 'action_required',
      detail: buyerPartyCount
        ? `${buyerPartyCount} buyer ${buyerPartyCount === 1 ? 'party' : 'parties'} captured.`
        : 'Buyer party details still need to be completed.',
    },
    {
      key: 'finance',
      label: 'Finance profile',
      status: hasFinanceSeed || handoffChecklist?.financeCaptured ? 'complete' : 'action_required',
      detail:
        hasFinanceSeed || handoffChecklist?.financeCaptured
          ? 'Finance route and deal values were seeded into the transaction.'
          : 'Finance route still needs confirmation.',
    },
    {
      key: 'roleplayers',
      label: 'Role players',
      status: handoffChecklist?.partnersCaptured || rolePlayerCount ? 'complete' : 'action_required',
      detail:
        handoffChecklist?.partnersCaptured || rolePlayerCount
          ? `${rolePlayerCount || 'Selected'} role-player ${rolePlayerCount === 1 ? 'assignment' : 'assignments'} captured.`
          : 'Transfer, bond, or cancellation role players still need review.',
    },
    {
      key: 'signed_otp',
      label: 'Signed OTP handoff',
      status: handoffStatus === 'uploaded' ? 'complete' : 'action_required',
      detail:
        handoffStatus === 'uploaded'
          ? 'Signed OTP is marked as uploaded or available for review.'
          : handoffStatus === 'not_signed'
            ? 'OTP still needs to be prepared and signed.'
            : 'Signed OTP must be uploaded to transaction documents.',
    },
    {
      key: 'onboarding',
      label: 'Buyer onboarding',
      status: onboardingRecord?.token ? 'complete' : 'action_required',
      detail: onboardingRecord?.token
        ? 'Buyer onboarding link is available.'
        : 'Buyer onboarding link could not be confirmed during creation.',
    },
    {
      key: 'automation',
      label: 'Post-create automation',
      status: warnings.length ? 'needs_attention' : 'complete',
      detail: warnings.length
        ? `${warnings.length} setup ${warnings.length === 1 ? 'warning' : 'warnings'} recorded: ${warningAreas.join(', ') || 'review required'}.`
        : 'No post-create setup warnings recorded.',
    },
  ]

  const needsAttentionCount = checks.filter((check) => check.status === 'needs_attention').length
  const actionRequiredCount = checks.filter((check) => check.status === 'action_required').length
  const completeCount = checks.filter((check) => check.status === 'complete').length
  const status = needsAttentionCount
    ? 'needs_attention'
    : actionRequiredCount
      ? 'ready_with_next_actions'
      : 'ready'

  return {
    version: NEW_TRANSACTION_SETUP_HEALTH_VERSION,
    status,
    label:
      status === 'ready'
        ? 'Ready'
        : status === 'ready_with_next_actions'
          ? 'Ready with next actions'
          : 'Needs attention',
    completeCount,
    actionRequiredCount,
    needsAttentionCount,
    warningCount: warnings.length,
    missingFollowUpItems,
    checks,
    nextAction: resolveWizardHandoffNextAction(handoffChecklist),
  }
}

export function extractNewTransactionSetupHealthFromEvents(events = []) {
  if (!Array.isArray(events) || !events.length) {
    return null
  }

  const auditEvent = events.find((event) => {
    const eventType = text(event?.eventType || event?.event_type).toLowerCase()
    return eventType === 'transaction_setup_audit'
  })
  const eventData =
    auditEvent?.eventData && typeof auditEvent.eventData === 'object'
      ? auditEvent.eventData
      : auditEvent?.event_data && typeof auditEvent.event_data === 'object'
        ? auditEvent.event_data
        : {}
  const setupHealth = eventData.setupHealth && typeof eventData.setupHealth === 'object' ? eventData.setupHealth : null

  if (!setupHealth) {
    return null
  }

  return {
    ...setupHealth,
    version: setupHealth.version || NEW_TRANSACTION_SETUP_HEALTH_VERSION,
    auditEventId: auditEvent?.id || null,
    auditEventCreatedAt: auditEvent?.createdAt || auditEvent?.created_at || null,
    auditEventLogged: true,
  }
}
