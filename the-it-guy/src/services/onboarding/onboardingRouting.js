import { APP_ROLES } from '../../constants/appRoles'
import { ONBOARDING_STATUSES } from '../../constants/onboardingStatuses'
import { SIGNUP_WORKSPACE_ACTIONS } from '../../constants/signupIntents'
import { WORKSPACE_TYPES } from '../../constants/workspaceTypes'
import { getRecoveryDescriptor } from './onboardingRecovery'

export function getDashboardPathForOnboarding({ appRole = '', workspaceType = '' } = {}) {
  if (appRole === APP_ROLES.attorney || workspaceType === WORKSPACE_TYPES.attorneyFirm) return '/attorney/dashboard'
  if (appRole === APP_ROLES.client) return '/client-access'
  return '/dashboard'
}

export function resolveOnboardingRoute(onboardingState = null, context = {}) {
  const status = onboardingState?.onboardingStatus || ''
  const action = onboardingState?.workspaceAction || context.signupIntent?.workspace_action || ''
  const appRole = onboardingState?.appRole || context.profile?.role || context.appRole || ''
  const workspaceType = onboardingState?.workspaceType || context.workspaceType || context.signupIntent?.workspace_type || ''

  if (!context.session && !context.user) return '/auth'
  if (!context.profile?.id) return '/onboarding/profile'
  if (status === ONBOARDING_STATUSES.completed || context.onboardingComplete) {
    return getDashboardPathForOnboarding({ appRole, workspaceType })
  }
  if (status === ONBOARDING_STATUSES.workspacePendingApproval) return '/setup'
  if (status === ONBOARDING_STATUSES.recoveryRequired || onboardingState?.recoveryReason) {
    return getRecoveryDescriptor(onboardingState?.recoveryReason).route
  }
  if (action === SIGNUP_WORKSPACE_ACTIONS.acceptClientAccess || appRole === APP_ROLES.client) return '/client-access'
  if (workspaceType === WORKSPACE_TYPES.attorneyFirm && action === SIGNUP_WORKSPACE_ACTIONS.createWorkspace) return '/attorney/onboarding'
  return '/setup'
}

export function isOnboardingOnlyState(onboardingState = null) {
  return [
    ONBOARDING_STATUSES.signupStarted,
    ONBOARDING_STATUSES.emailVerificationPending,
    ONBOARDING_STATUSES.inProgress,
    ONBOARDING_STATUSES.workspaceSetupRequired,
    ONBOARDING_STATUSES.workspacePendingApproval,
    ONBOARDING_STATUSES.recoveryRequired,
    ONBOARDING_STATUSES.blocked,
  ].includes(onboardingState?.onboardingStatus)
}
