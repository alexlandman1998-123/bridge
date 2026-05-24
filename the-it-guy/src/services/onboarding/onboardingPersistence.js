import { ONBOARDING_EVENT_TYPES, ONBOARDING_STATUSES, ONBOARDING_STEPS } from '../../constants/onboardingStatuses'
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'
import { mergeOnboardingContext, normalizeOnboardingStatus, normalizeOnboardingStep } from './onboardingState'

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is required for onboarding persistence.')
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

export function mapOnboardingStateRow(row = null) {
  if (!row) return null
  return {
    userId: row.user_id,
    onboardingStatus: normalizeOnboardingStatus(row.onboarding_status),
    onboardingStep: normalizeOnboardingStep(row.onboarding_step, ONBOARDING_STEPS.createOrJoinWorkspace),
    onboardingPath: normalizeText(row.onboarding_path),
    workspaceAction: normalizeText(row.workspace_action),
    workspaceType: normalizeText(row.workspace_type),
    appRole: normalizeText(row.app_role),
    intendedOrgRole: normalizeText(row.intended_org_role),
    lastCompletedStep: normalizeText(row.last_completed_step),
    context: row.onboarding_context_json || {},
    recoveryReason: normalizeText(row.recovery_reason),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    completedAt: row.completed_at || null,
    persisted: true,
    raw: row,
  }
}

export async function loadOnboardingState(userId) {
  const id = normalizeText(userId)
  if (!id) return null
  const client = requireClient()
  const result = await client
    .from('onboarding_states')
    .select('user_id, onboarding_status, onboarding_step, onboarding_path, workspace_action, workspace_type, app_role, intended_org_role, last_completed_step, onboarding_context_json, recovery_reason, created_at, updated_at, completed_at')
    .eq('user_id', id)
    .maybeSingle()

  if (result.error) {
    if (isMissingSchemaError(result.error, 'onboarding_states')) {
      console.warn('[Onboarding] onboarding_states table is missing. Apply the Phase 5 migration before production rollout.')
      return null
    }
    throw result.error
  }

  return mapOnboardingStateRow(result.data)
}

export async function upsertOnboardingState({
  userId,
  patch = {},
  intent = null,
  existingState = null,
  context = {},
} = {}) {
  const id = normalizeText(userId)
  if (!id) throw new Error('User id is required before onboarding state can be persisted.')
  const client = requireClient()
  const mergedContext = mergeOnboardingContext(existingState?.context, {
    ...(intent?.source ? { signupIntentSource: intent.source } : {}),
    ...context,
  })
  const payload = {
    user_id: id,
    onboarding_status: normalizeOnboardingStatus(
      patch.onboardingStatus || patch.onboarding_status,
      intent ? ONBOARDING_STATUSES.inProgress : ONBOARDING_STATUSES.notStarted,
    ),
    onboarding_step: normalizeOnboardingStep(patch.onboardingStep || patch.onboarding_step || existingState?.onboardingStep),
    onboarding_path: patch.onboardingPath || patch.onboarding_path || intent?.onboarding_path || existingState?.onboardingPath || null,
    workspace_action: patch.workspaceAction || patch.workspace_action || intent?.workspace_action || existingState?.workspaceAction || null,
    workspace_type: patch.workspaceType || patch.workspace_type || intent?.workspace_type || existingState?.workspaceType || null,
    app_role: patch.appRole || patch.app_role || intent?.app_role || existingState?.appRole || null,
    intended_org_role: patch.intendedOrgRole || patch.intended_org_role || intent?.intended_org_role || existingState?.intendedOrgRole || null,
    last_completed_step: patch.lastCompletedStep || patch.last_completed_step || existingState?.lastCompletedStep || null,
    recovery_reason: patch.recoveryReason || patch.recovery_reason || null,
    onboarding_context_json: mergedContext,
    completed_at: patch.completedAt || patch.completed_at || null,
  }

  const result = await client
    .from('onboarding_states')
    .upsert(payload, { onConflict: 'user_id' })
    .select('user_id, onboarding_status, onboarding_step, onboarding_path, workspace_action, workspace_type, app_role, intended_org_role, last_completed_step, onboarding_context_json, recovery_reason, created_at, updated_at, completed_at')
    .single()

  if (result.error) {
    if (isMissingSchemaError(result.error, 'onboarding_states')) {
      console.warn('[Onboarding] onboarding state could not be persisted because onboarding_states is missing.', result.error)
      return {
        ...mapOnboardingStateRow(payload),
        persisted: false,
      }
    }
    throw result.error
  }

  return mapOnboardingStateRow(result.data)
}

export async function recordOnboardingEvent({
  userId,
  workspaceId = null,
  eventType = ONBOARDING_EVENT_TYPES.stepCompleted,
  onboardingStep = '',
  failureReason = '',
  recoveryReason = '',
  metadata = {},
} = {}) {
  const id = normalizeText(userId)
  if (!id) return null
  const client = requireClient()
  const result = await client
    .from('onboarding_events')
    .insert({
      user_id: id,
      workspace_id: workspaceId || null,
      event_type: normalizeText(eventType) || ONBOARDING_EVENT_TYPES.stepCompleted,
      onboarding_step: normalizeText(onboardingStep) || null,
      failure_reason: normalizeText(failureReason) || null,
      recovery_reason: normalizeText(recoveryReason) || null,
      metadata: metadata && typeof metadata === 'object' ? metadata : {},
    })

  if (result.error) {
    if (isMissingSchemaError(result.error, 'onboarding_events')) {
      console.warn('[Onboarding] onboarding event not recorded because onboarding_events is missing.', result.error)
      return null
    }
    throw result.error
  }
  return true
}
