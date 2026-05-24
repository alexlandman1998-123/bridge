import {
  ONBOARDING_REQUIRED_REASONS,
  ONBOARDING_STATUSES,
  ONBOARDING_STEPS,
} from '../../constants/onboardingStatuses'
import { SIGNUP_ONBOARDING_PATHS, SIGNUP_WORKSPACE_ACTIONS } from '../../constants/signupIntents'
import { WORKSPACE_TYPES } from '../../constants/workspaceTypes'

const STATUS_VALUES = new Set([
  ONBOARDING_STATUSES.notStarted,
  ONBOARDING_STATUSES.signupStarted,
  ONBOARDING_STATUSES.emailVerificationPending,
  ONBOARDING_STATUSES.inProgress,
  ONBOARDING_STATUSES.workspaceSetupRequired,
  ONBOARDING_STATUSES.workspacePendingApproval,
  ONBOARDING_STATUSES.blocked,
  ONBOARDING_STATUSES.recoveryRequired,
  ONBOARDING_STATUSES.completed,
  ONBOARDING_STATUSES.suspended,
  ONBOARDING_STATUSES.archived,
])

const STEP_VALUES = new Set(Object.values(ONBOARDING_STEPS))

export function normalizeOnboardingStatus(value, fallback = ONBOARDING_STATUSES.notStarted) {
  const normalized = String(value || '').trim().toLowerCase()
  return STATUS_VALUES.has(normalized) ? normalized : fallback
}

export function normalizeOnboardingStep(value, fallback = ONBOARDING_STEPS.createOrJoinWorkspace) {
  const normalized = String(value || '').trim().toLowerCase()
  return STEP_VALUES.has(normalized) ? normalized : fallback
}

export function deriveStepFromIntent(intent = null) {
  const action = String(intent?.workspace_action || '').trim()
  const path = String(intent?.onboarding_path || '').trim()
  const workspaceType = String(intent?.workspace_type || '').trim()

  if (action === SIGNUP_WORKSPACE_ACTIONS.acceptClientAccess) return ONBOARDING_STEPS.acceptTransactionAccess
  if (action === SIGNUP_WORKSPACE_ACTIONS.joinOrRequestWorkspace || action === SIGNUP_WORKSPACE_ACTIONS.acceptInvite) {
    return ONBOARDING_STEPS.createOrJoinWorkspace
  }
  if (path === SIGNUP_ONBOARDING_PATHS.agencyOwner || workspaceType === WORKSPACE_TYPES.agency) return ONBOARDING_STEPS.createAgency
  if (path === SIGNUP_ONBOARDING_PATHS.developerOwner || workspaceType === WORKSPACE_TYPES.developerCompany) {
    return ONBOARDING_STEPS.createDeveloperCompany
  }
  if (path === SIGNUP_ONBOARDING_PATHS.attorneyOwner || workspaceType === WORKSPACE_TYPES.attorneyFirm) {
    return ONBOARDING_STEPS.createOrLinkFirm
  }
  if (path === SIGNUP_ONBOARDING_PATHS.bondOwner || workspaceType === WORKSPACE_TYPES.bondOriginator) {
    return ONBOARDING_STEPS.createBondWorkspace
  }
  return ONBOARDING_STEPS.createOrJoinWorkspace
}

export function deriveStatusFromRuntime({ profile = null, activeMemberships = [], pendingMemberships = [], validation = null } = {}) {
  if (!profile?.id) return ONBOARDING_STATUSES.recoveryRequired
  if (validation && !validation.ok) return ONBOARDING_STATUSES.recoveryRequired
  if (profile.onboardingCompleted && validation?.ok) return ONBOARDING_STATUSES.completed
  if (pendingMemberships.length && !activeMemberships.length) return ONBOARDING_STATUSES.workspacePendingApproval
  if (!activeMemberships.length) return ONBOARDING_STATUSES.workspaceSetupRequired
  return ONBOARDING_STATUSES.inProgress
}

export function normalizeRecoveryReason(value, fallback = ONBOARDING_REQUIRED_REASONS.invalidOnboardingState) {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized || fallback
}

export function mergeOnboardingContext(existing = {}, patch = {}) {
  return {
    ...(existing && typeof existing === 'object' ? existing : {}),
    ...(patch && typeof patch === 'object' ? patch : {}),
  }
}
