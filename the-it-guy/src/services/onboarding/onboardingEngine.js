import { normalizeCanonicalAppRole } from '../../constants/appRoles'
import { ONBOARDING_EVENT_TYPES, ONBOARDING_STATUSES, ONBOARDING_STEPS } from '../../constants/onboardingStatuses'
import { normalizeWorkspaceType } from '../../constants/workspaceTypes'
import { markSignupIntentConsumed } from '../../lib/signupIntent'
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'
import { recordSecurityAuditEvent } from '../auditLogService'
import { loadOnboardingState, recordOnboardingEvent, upsertOnboardingState } from './onboardingPersistence'
import { buildRecoveryState, getOnboardingRecoveryReason } from './onboardingRecovery'
import { resolveOnboardingRoute } from './onboardingRouting'
import { deriveStatusFromRuntime, deriveStepFromIntent, normalizeOnboardingStep } from './onboardingState'
import { validateOnboardingCompletion as validateCompletionContract } from './onboardingValidation'

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is required for onboarding.')
  }
  return supabase
}

function normalizeText(value) {
  return String(value || '').trim()
}

function isMissingSchemaError(error, token = '') {
  if (!error) return false
  const code = String(error.code || '').toLowerCase()
  const message = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase()
  return code === '42p01' || code === '42703' || code === 'pgrst204' || code === 'pgrst205' || message.includes(token.toLowerCase())
}

function deriveIntentPatch(intent = null) {
  if (!intent) return {}
  return {
    appRole: intent.app_role,
    workspaceType: intent.workspace_type,
    intendedOrgRole: intent.intended_org_role,
    onboardingPath: intent.onboarding_path,
    workspaceAction: intent.workspace_action,
    onboardingStep: deriveStepFromIntent(intent),
  }
}

async function updateProfileOnboardingCompletion({ userId, appRole = '', complete = false, profilePatch = {} } = {}) {
  const client = requireClient()
  const payload = {
    ...profilePatch,
    updated_at: new Date().toISOString(),
  }
  if (appRole) payload.role = normalizeCanonicalAppRole(appRole, appRole)
  if (complete) payload.onboarding_completed = true

  let result = await client
    .from('profiles')
    .update(payload)
    .eq('id', userId)
    .select('id, email, first_name, last_name, full_name, company_name, phone_number, avatar_url, role, onboarding_completed, created_at, updated_at')
    .maybeSingle()

  if (result.error && (isMissingSchemaError(result.error, 'company_name') || isMissingSchemaError(result.error, 'avatar_url'))) {
    const fallbackPayload = { ...payload }
    if (isMissingSchemaError(result.error, 'company_name')) delete fallbackPayload.company_name
    if (isMissingSchemaError(result.error, 'avatar_url')) delete fallbackPayload.avatar_url
    result = await client
      .from('profiles')
      .update(fallbackPayload)
      .eq('id', userId)
      .select('id, email, first_name, last_name, full_name, phone_number, role, onboarding_completed, created_at, updated_at')
      .maybeSingle()
  }

  if (result.error) throw result.error
  return result.data || null
}

export async function getOnboardingState(userId, context = {}) {
  const existingState = await loadOnboardingState(userId)
  const validation =
    context.profile?.onboardingCompleted || context.forceValidate
      ? await validateCompletionContract(userId, {
          appRole: context.appRole || context.profile?.role,
          workspaceType: context.workspaceType,
          workspaceId: context.currentWorkspace?.id || context.currentMembership?.workspaceId,
        })
      : null

  const recoveryReason = getOnboardingRecoveryReason(validation, context)
  const derivedStatus = deriveStatusFromRuntime({
    profile: context.profile,
    activeMemberships: context.activeMemberships || [],
    pendingMemberships: context.pendingMemberships || [],
    validation,
    onboardingComplete: context.onboardingComplete,
  })
  const status =
    existingState?.onboardingStatus === ONBOARDING_STATUSES.workspacePendingApproval &&
    !(context.activeMemberships || []).length
      ? ONBOARDING_STATUSES.workspacePendingApproval
      : derivedStatus

  const intentPatch = deriveIntentPatch(context.signupIntent)
  const nextState = {
    userId,
    onboardingStatus: status,
    onboardingStep: existingState?.onboardingStep || intentPatch.onboardingStep || ONBOARDING_STEPS.createOrJoinWorkspace,
    onboardingPath: existingState?.onboardingPath || intentPatch.onboardingPath || '',
    workspaceAction: existingState?.workspaceAction || intentPatch.workspaceAction || '',
    workspaceType: normalizeWorkspaceType(existingState?.workspaceType || intentPatch.workspaceType || context.workspaceType, ''),
    appRole: normalizeCanonicalAppRole(existingState?.appRole || intentPatch.appRole || context.appRole || context.profile?.role, ''),
    intendedOrgRole: existingState?.intendedOrgRole || intentPatch.intendedOrgRole || '',
    lastCompletedStep: existingState?.lastCompletedStep || '',
    context: existingState?.context || {},
    recoveryReason: status === ONBOARDING_STATUSES.recoveryRequired ? recoveryReason : '',
    createdAt: existingState?.createdAt || null,
    updatedAt: existingState?.updatedAt || null,
    completedAt: existingState?.completedAt || null,
    persisted: Boolean(existingState?.persisted),
    validation,
  }

  if (context.signupIntent && !existingState?.persisted) {
    return upsertOnboardingState({
      userId,
      intent: context.signupIntent,
      patch: {
        onboardingStatus: nextState.onboardingStatus,
        onboardingStep: nextState.onboardingStep,
        recoveryReason: nextState.recoveryReason,
      },
      existingState,
      context: { source: 'auth_boot' },
    })
  }

  return nextState
}

export async function advanceOnboardingStep(userId, payload = {}) {
  const existingState = await loadOnboardingState(userId)
  const step = normalizeOnboardingStep(payload.onboardingStep || payload.onboarding_step)
  const state = await upsertOnboardingState({
    userId,
    intent: payload.intent || null,
    existingState,
    patch: {
      onboardingStatus: payload.onboardingStatus || ONBOARDING_STATUSES.inProgress,
      onboardingStep: step,
      lastCompletedStep: payload.lastCompletedStep || existingState?.lastCompletedStep,
      recoveryReason: '',
    },
    context: payload.context || {},
  })
  await recordOnboardingEvent({
    userId,
    workspaceId: payload.workspaceId || null,
    eventType: ONBOARDING_EVENT_TYPES.stepCompleted,
    onboardingStep: step,
    metadata: payload.metadata || {},
  })
  return state
}

export async function resumeOnboarding(userId, context = {}) {
  const onboardingState = await getOnboardingState(userId, context)
  return {
    onboardingState,
    route: resolveOnboardingRoute(onboardingState, context),
  }
}

export async function validateOnboardingCompletion(userId, options = {}) {
  return validateCompletionContract(userId, options)
}

export async function completeOnboarding({
  userId,
  user = null,
  intent = null,
  appRole = '',
  workspaceType = '',
  workspaceId = '',
  profilePatch = {},
  eventType = ONBOARDING_EVENT_TYPES.completed,
  context = {},
} = {}) {
  const id = normalizeText(userId || user?.id)
  if (!id) throw new Error('User id is required before onboarding can be completed.')
  const resolvedAppRole = normalizeCanonicalAppRole(appRole || intent?.app_role, '')
  const resolvedWorkspaceType = normalizeWorkspaceType(workspaceType || intent?.workspace_type, '')

  const validation = await validateCompletionContract(id, {
    appRole: resolvedAppRole,
    workspaceType: resolvedWorkspaceType,
    workspaceId,
  })

  if (!validation.ok) {
    const recovery = buildRecoveryState(validation.reason, { validation, ...context })
    await upsertOnboardingState({
      userId: id,
      intent,
      patch: {
        onboardingStatus: recovery.onboardingStatus,
        onboardingStep: recovery.onboardingStep,
        recoveryReason: recovery.recoveryReason,
      },
      context: { source: 'completion_validation', validation },
    })
    await recordOnboardingEvent({
      userId: id,
      workspaceId: validation.workspaceId || workspaceId || null,
      eventType: ONBOARDING_EVENT_TYPES.failed,
      onboardingStep: ONBOARDING_STEPS.onboardingReview,
      failureReason: validation.reason,
      recoveryReason: recovery.recoveryReason,
      metadata: { context },
    })
    throw new Error(`Onboarding cannot be completed yet: ${validation.reason}.`)
  }

  const profile = await updateProfileOnboardingCompletion({
    userId: id,
    appRole: resolvedAppRole || validation.appRole,
    complete: true,
    profilePatch,
  })

  const state = await upsertOnboardingState({
    userId: id,
    intent,
    patch: {
      onboardingStatus: ONBOARDING_STATUSES.completed,
      onboardingStep: ONBOARDING_STEPS.onboardingComplete,
      lastCompletedStep: ONBOARDING_STEPS.onboardingReview,
      recoveryReason: '',
      completedAt: new Date().toISOString(),
    },
    context: {
      ...context,
      completedByEngine: true,
      validation: {
        workspaceId: validation.workspaceId,
        workspaceType: validation.workspaceType,
        membershipId: validation.membership?.id || null,
      },
    },
  })

  if (intent && user) {
    await markSignupIntentConsumed({ user, intent })
  }

  await recordOnboardingEvent({
    userId: id,
    workspaceId: validation.workspaceId || workspaceId || null,
    eventType,
    onboardingStep: ONBOARDING_STEPS.onboardingComplete,
    metadata: { appRole: resolvedAppRole, workspaceType: resolvedWorkspaceType, context },
  })
  void recordSecurityAuditEvent({
    userId: id,
    workspaceId: validation.workspaceId || workspaceId || null,
    action: 'onboarding_completed',
    targetType: 'profile',
    targetId: id,
    metadata: { appRole: resolvedAppRole, workspaceType: resolvedWorkspaceType },
  })

  return {
    ok: true,
    profile,
    onboardingState: state,
    validation,
  }
}

export async function repairOnboardingState(userId, context = {}) {
  const validation = await validateCompletionContract(userId, {
    appRole: context.appRole || context.profile?.role,
    workspaceType: context.workspaceType,
    workspaceId: context.workspaceId || context.currentWorkspace?.id,
  })
  const recovery = buildRecoveryState(getOnboardingRecoveryReason(validation, context), context)
  const state = await upsertOnboardingState({
    userId,
    intent: context.signupIntent || null,
    patch: {
      onboardingStatus: recovery.onboardingStatus,
      onboardingStep: recovery.onboardingStep,
      recoveryReason: recovery.recoveryReason,
    },
    context: { source: 'repair', validation },
  })
  await recordOnboardingEvent({
    userId,
    workspaceId: validation.workspaceId || null,
    eventType: ONBOARDING_EVENT_TYPES.recovered,
    onboardingStep: recovery.onboardingStep,
    recoveryReason: recovery.recoveryReason,
    metadata: { validation },
  })
  return { onboardingState: state, recovery, validation }
}

export async function resetOnboardingStep(userId, onboardingStep = ONBOARDING_STEPS.createOrJoinWorkspace) {
  return advanceOnboardingStep(userId, {
    onboardingStatus: ONBOARDING_STATUSES.inProgress,
    onboardingStep,
    metadata: { reset: true },
  })
}

export async function getRequiredNextStep(userId, context = {}) {
  const state = await getOnboardingState(userId, context)
  return state.onboardingStep
}

export async function resolveOnboardingPath(userId, context = {}) {
  return resumeOnboarding(userId, context)
}

export { getOnboardingRecoveryReason }
