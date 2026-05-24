import { ONBOARDING_REQUIRED_REASONS, ONBOARDING_STATUSES, ONBOARDING_STEPS } from '../../constants/onboardingStatuses'

export function getOnboardingRecoveryReason(validation = null, authState = {}) {
  if (!authState?.profile?.id && !validation?.profile?.id) return ONBOARDING_REQUIRED_REASONS.noProfile
  if (authState?.pendingMemberships?.length && !authState?.activeMemberships?.length) return ONBOARDING_REQUIRED_REASONS.pendingApproval
  if (!validation) return authState?.onboardingRequiredReason || ONBOARDING_REQUIRED_REASONS.invalidOnboardingState
  if (validation.ok) return ONBOARDING_REQUIRED_REASONS.none
  return validation.reason || ONBOARDING_REQUIRED_REASONS.completionValidationFailed
}

export function getRecoveryDescriptor(reason = '') {
  const normalized = String(reason || '').trim() || ONBOARDING_REQUIRED_REASONS.invalidOnboardingState
  const descriptors = {
    [ONBOARDING_REQUIRED_REASONS.noProfile]: {
      title: 'Profile setup is needed',
      description: 'We could not find a complete Bridge profile for this account.',
      actionLabel: 'Complete profile setup',
      route: '/onboarding/profile',
    },
    [ONBOARDING_REQUIRED_REASONS.noActiveMembership]: {
      title: 'Workspace access is needed',
      description: 'Your account is not connected to an active workspace yet.',
      actionLabel: 'Set up workspace access',
      route: '/setup/recovery',
    },
    [ONBOARDING_REQUIRED_REASONS.pendingApproval]: {
      title: 'Approval pending',
      description: 'A workspace owner or manager still needs to approve your access.',
      actionLabel: 'View pending status',
      route: '/setup',
    },
    [ONBOARDING_REQUIRED_REASONS.workspaceMissing]: {
      title: 'Workspace record missing',
      description: 'Your membership points to a workspace that could not be loaded.',
      actionLabel: 'Repair workspace setup',
      route: '/setup/recovery',
    },
    [ONBOARDING_REQUIRED_REASONS.missingBranch]: {
      title: 'Branch assignment needed',
      description: 'This workspace requires a branch or team before onboarding can finish.',
      actionLabel: 'Review setup',
      route: '/setup/recovery',
    },
    [ONBOARDING_REQUIRED_REASONS.missingDepartment]: {
      title: 'Department setup needed',
      description: 'This firm needs an active department before onboarding can finish.',
      actionLabel: 'Review firm setup',
      route: '/attorney/onboarding',
    },
    [ONBOARDING_REQUIRED_REASONS.missingSettings]: {
      title: 'Workspace settings needed',
      description: 'The workspace exists, but its setup profile is incomplete.',
      actionLabel: 'Complete workspace setup',
      route: '/setup/recovery',
    },
    [ONBOARDING_REQUIRED_REASONS.appRoleMissing]: {
      title: 'Business role needs confirmation',
      description: 'Confirm your Bridge role so we can route you to the right workspace setup.',
      actionLabel: 'Confirm role',
      route: '/onboarding/profile',
    },
  }

  return descriptors[normalized] || {
    title: 'Setup needs attention',
    description: 'Bridge found an incomplete onboarding state and stopped before opening a dashboard.',
    actionLabel: 'Continue setup',
    route: '/setup/recovery',
  }
}

export function buildRecoveryState(reason = '', context = {}) {
  const descriptor = getRecoveryDescriptor(reason)
  return {
    onboardingStatus: reason === ONBOARDING_REQUIRED_REASONS.pendingApproval
      ? ONBOARDING_STATUSES.workspacePendingApproval
      : ONBOARDING_STATUSES.recoveryRequired,
    onboardingStep: ONBOARDING_STEPS.onboardingReview,
    recoveryReason: reason || ONBOARDING_REQUIRED_REASONS.invalidOnboardingState,
    descriptor,
    context,
  }
}
