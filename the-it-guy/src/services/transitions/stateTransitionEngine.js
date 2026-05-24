import { MEMBERSHIP_STATUSES, normalizeMembershipStatus } from '../../constants/membershipStatuses'
import { ONBOARDING_STATUSES } from '../../constants/onboardingStatuses'
import { BridgeValidationError } from '../errors/validationErrors'

const MEMBERSHIP_TRANSITIONS = {
  [MEMBERSHIP_STATUSES.pending]: [MEMBERSHIP_STATUSES.active, MEMBERSHIP_STATUSES.removed],
  invited: [MEMBERSHIP_STATUSES.active, MEMBERSHIP_STATUSES.removed],
  [MEMBERSHIP_STATUSES.active]: [MEMBERSHIP_STATUSES.suspended, MEMBERSHIP_STATUSES.removed, MEMBERSHIP_STATUSES.deactivated],
  [MEMBERSHIP_STATUSES.suspended]: [MEMBERSHIP_STATUSES.active, MEMBERSHIP_STATUSES.removed, MEMBERSHIP_STATUSES.deactivated],
  [MEMBERSHIP_STATUSES.removed]: [],
  deactivated: [],
}

const ONBOARDING_TRANSITIONS = {
  [ONBOARDING_STATUSES.notStarted]: [ONBOARDING_STATUSES.signupStarted],
  [ONBOARDING_STATUSES.signupStarted]: [ONBOARDING_STATUSES.emailVerificationPending, ONBOARDING_STATUSES.inProgress],
  [ONBOARDING_STATUSES.emailVerificationPending]: [ONBOARDING_STATUSES.inProgress],
  [ONBOARDING_STATUSES.inProgress]: [
    ONBOARDING_STATUSES.workspaceSetupRequired,
    ONBOARDING_STATUSES.workspacePendingApproval,
    ONBOARDING_STATUSES.recoveryRequired,
    ONBOARDING_STATUSES.completed,
  ],
  [ONBOARDING_STATUSES.workspaceSetupRequired]: [
    ONBOARDING_STATUSES.inProgress,
    ONBOARDING_STATUSES.workspacePendingApproval,
    ONBOARDING_STATUSES.recoveryRequired,
    ONBOARDING_STATUSES.completed,
  ],
  [ONBOARDING_STATUSES.workspacePendingApproval]: [ONBOARDING_STATUSES.inProgress, ONBOARDING_STATUSES.completed],
  [ONBOARDING_STATUSES.recoveryRequired]: [ONBOARDING_STATUSES.inProgress, ONBOARDING_STATUSES.workspaceSetupRequired],
  [ONBOARDING_STATUSES.completed]: [ONBOARDING_STATUSES.suspended, ONBOARDING_STATUSES.archived],
  [ONBOARDING_STATUSES.suspended]: [ONBOARDING_STATUSES.completed, ONBOARDING_STATUSES.archived],
  [ONBOARDING_STATUSES.archived]: [],
}

export function validateMembershipStatusTransition(fromStatus, toStatus) {
  const from = normalizeMembershipStatus(fromStatus)
  const to = normalizeMembershipStatus(toStatus)
  const allowed = MEMBERSHIP_TRANSITIONS[from] || []
  if (allowed.includes(to)) return { ok: true, from, to }
  return {
    ok: false,
    from,
    to,
    reason: 'invalid_membership_status_transition',
    message: `Membership status cannot move from ${from || 'unknown'} to ${to || 'unknown'}.`,
  }
}

export function assertMembershipStatusTransition(fromStatus, toStatus) {
  const result = validateMembershipStatusTransition(fromStatus, toStatus)
  if (!result.ok) {
    throw new BridgeValidationError(result.message, {
      code: result.reason,
      severity: 'error',
      entityType: 'membership',
      userMessage: 'This membership status change is not allowed.',
      metadata: result,
    })
  }
  return result
}

export function validateOnboardingStatusTransition(fromStatus, toStatus) {
  const from = String(fromStatus || ONBOARDING_STATUSES.notStarted).trim()
  const to = String(toStatus || '').trim()
  const allowed = ONBOARDING_TRANSITIONS[from] || []
  if (allowed.includes(to) || from === to) return { ok: true, from, to }
  return {
    ok: false,
    from,
    to,
    reason: 'invalid_onboarding_status_transition',
    message: `Onboarding status cannot move from ${from || 'unknown'} to ${to || 'unknown'}.`,
  }
}

export function assertOnboardingStatusTransition(fromStatus, toStatus) {
  const result = validateOnboardingStatusTransition(fromStatus, toStatus)
  if (!result.ok) {
    throw new BridgeValidationError(result.message, {
      code: result.reason,
      severity: 'error',
      entityType: 'onboarding',
      userMessage: 'This onboarding transition is not allowed.',
      metadata: result,
    })
  }
  return result
}

export function validateTransactionStageTransition({
  currentStage = '',
  nextStage = '',
  allowedStages = [],
  requiredParticipantsOk = true,
  requiredDocumentsOk = true,
  requiredApprovalsOk = true,
} = {}) {
  const current = String(currentStage || '').trim()
  const next = String(nextStage || '').trim()
  const allowed = Array.isArray(allowedStages) ? allowedStages : []
  const issues = []

  if (!next) issues.push('missing_next_stage')
  if (allowed.length && current && !allowed.includes(next)) issues.push('stage_not_allowed')
  if (!requiredParticipantsOk) issues.push('missing_participants')
  if (!requiredDocumentsOk) issues.push('missing_required_documents')
  if (!requiredApprovalsOk) issues.push('missing_required_approvals')

  return {
    ok: issues.length === 0,
    current,
    next,
    issues,
    reason: issues[0] || '',
  }
}
