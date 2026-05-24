import {
  SIGNUP_INTENT_SOURCE,
  SIGNUP_INTENT_STATUSES,
  SIGNUP_POSITION_INTENT_MAP,
  SIGNUP_WORKSPACE_ACTIONS,
} from '../constants/signupIntents'
import { normalizeCanonicalAppRole } from '../constants/appRoles'
import { normalizeOrgRole } from '../constants/orgRoles'
import { normalizeWorkspaceType } from '../constants/workspaceTypes'
import { isSupabaseConfigured, supabase } from './supabaseClient'

export const SIGNUP_INTENT_STORAGE_KEY = 'itg:signup-intent:v1'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase()
}

function isMissingSignupIntentsTable(error) {
  if (!error) return false
  const code = String(error.code || '').toLowerCase()
  const message = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase()
  return code === '42p01' || code === 'pgrst205' || message.includes('signup_intents')
}

function getStoredSignupIntent() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(SIGNUP_INTENT_STORAGE_KEY)
    if (!raw) return null
    return normalizeSignupIntent(JSON.parse(raw))
  } catch {
    return null
  }
}

export function clearStoredSignupIntent() {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(SIGNUP_INTENT_STORAGE_KEY)
}

export function storeSignupIntentTemporarily(intent) {
  if (typeof window === 'undefined') return
  const normalized = normalizeSignupIntent(intent)
  if (!normalized) return
  window.sessionStorage.setItem(SIGNUP_INTENT_STORAGE_KEY, JSON.stringify(normalized))
}

export function buildSignupIntent({
  position,
  inviteToken = '',
  source = SIGNUP_INTENT_SOURCE.publicSignup,
  overrides = {},
} = {}) {
  const template = SIGNUP_POSITION_INTENT_MAP[position]
  if (!template) return null
  const workspaceAction = inviteToken ? SIGNUP_WORKSPACE_ACTIONS.acceptInvite : template.workspace_action
  return normalizeSignupIntent({
    ...template,
    ...overrides,
    workspace_action: overrides.workspace_action || workspaceAction,
    invite_token: inviteToken || overrides.invite_token || '',
    source,
    created_at: overrides.created_at || new Date().toISOString(),
  })
}

export function normalizeSignupIntent(input = null) {
  if (!input || typeof input !== 'object') return null
  const appRole = normalizeCanonicalAppRole(input.app_role || input.appRole, '')
  const workspaceType = normalizeWorkspaceType(input.workspace_type || input.workspaceType, null)
  const intendedOrgRoleRaw = normalizeText(input.intended_org_role || input.intendedOrgRole)
  const intendedOrgRole = intendedOrgRoleRaw === 'client'
    ? 'client'
    : normalizeOrgRole(intendedOrgRoleRaw, { appRole, workspaceType })
  const authorityLevel = normalizeText(input.authority_level || input.authorityLevel)
  const onboardingPath = normalizeText(input.onboarding_path || input.onboardingPath)
  const workspaceAction = normalizeText(input.workspace_action || input.workspaceAction)

  if (!appRole || !intendedOrgRole || !authorityLevel || !onboardingPath || !workspaceAction) return null

  return {
    id: normalizeText(input.id),
    auth_user_id: normalizeText(input.auth_user_id || input.authUserId),
    email: normalizeEmail(input.email),
    app_role: appRole,
    workspace_type: workspaceType || null,
    intended_org_role: intendedOrgRole,
    authority_level: authorityLevel,
    onboarding_path: onboardingPath,
    workspace_action: workspaceAction,
    invite_token: normalizeText(input.invite_token || input.inviteToken),
    status: normalizeText(input.status) || SIGNUP_INTENT_STATUSES.pendingEmailVerification,
    source: normalizeText(input.source) || SIGNUP_INTENT_SOURCE.publicSignup,
    created_at: input.created_at || input.createdAt || new Date().toISOString(),
    updated_at: input.updated_at || input.updatedAt || null,
    consumed_at: input.consumed_at || input.consumedAt || null,
  }
}

export function createSignupUserMetadata({ intent, fullName = '', phone = '' } = {}) {
  const normalizedIntent = normalizeSignupIntent(intent)
  if (!normalizedIntent) return {}
  const safeFullName = normalizeText(fullName)
  const parts = safeFullName.split(/\s+/).filter(Boolean)
  return {
    app_role: normalizedIntent.app_role,
    role: normalizedIntent.app_role,
    signup_intent: normalizedIntent,
    full_name: safeFullName,
    first_name: parts[0] || '',
    last_name: parts.length > 1 ? parts.slice(1).join(' ') : '',
    phone: normalizeText(phone),
    phone_number: normalizeText(phone),
  }
}

function mapIntentRow(row = null) {
  if (!row) return null
  return normalizeSignupIntent(row)
}

export async function persistSignupIntent({
  intent,
  user = null,
  email = '',
  status = SIGNUP_INTENT_STATUSES.pendingEmailVerification,
} = {}) {
  const normalized = normalizeSignupIntent({
    ...intent,
    auth_user_id: user?.id || intent?.auth_user_id || '',
    email: email || user?.email || intent?.email || '',
    status,
  })
  if (!normalized) throw new Error('A valid signup intent is required before creating an account.')

  storeSignupIntentTemporarily(normalized)

  if (!isSupabaseConfigured || !supabase || !user?.id) {
    return { intent: normalized, persisted: false, reason: 'no_authenticated_user' }
  }

  const payload = {
    auth_user_id: user.id,
    email: normalizeEmail(normalized.email || user.email),
    app_role: normalized.app_role,
    workspace_type: normalized.workspace_type,
    intended_org_role: normalized.intended_org_role,
    authority_level: normalized.authority_level,
    onboarding_path: normalized.onboarding_path,
    workspace_action: normalized.workspace_action,
    invite_token: normalized.invite_token || null,
    status,
    source: normalized.source,
    consumed_at: normalized.consumed_at || null,
  }

  const result = await supabase
    .from('signup_intents')
    .upsert(payload, { onConflict: 'auth_user_id' })
    .select('id, auth_user_id, email, app_role, workspace_type, intended_org_role, authority_level, onboarding_path, workspace_action, invite_token, status, source, created_at, updated_at, consumed_at')
    .single()

  if (result.error) {
    if (isMissingSignupIntentsTable(result.error)) {
      console.warn('[SIGNUP_INTENT] signup_intents table unavailable; using auth metadata/session fallback until migration is applied.')
      return { intent: normalized, persisted: false, reason: 'missing_table' }
    }
    if (String(result.error?.message || '').toLowerCase().includes('row-level security')) {
      console.warn('[SIGNUP_INTENT] signup_intents insert blocked by RLS; will retry after authenticated boot.', result.error)
      return { intent: normalized, persisted: false, reason: 'rls_blocked' }
    }
    throw result.error
  }

  const persistedIntent = mapIntentRow(result.data) || normalized
  storeSignupIntentTemporarily(persistedIntent)
  return { intent: persistedIntent, persisted: true, reason: '' }
}

export async function loadSignupIntentForUser({ user = null } = {}) {
  if (!user?.id) return null

  if (isSupabaseConfigured && supabase) {
    const result = await supabase
      .from('signup_intents')
      .select('id, auth_user_id, email, app_role, workspace_type, intended_org_role, authority_level, onboarding_path, workspace_action, invite_token, status, source, created_at, updated_at, consumed_at')
      .eq('auth_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!result.error && result.data) {
      const intent = mapIntentRow(result.data)
      if (intent) storeSignupIntentTemporarily(intent)
      return intent
    }

    if (result.error && !isMissingSignupIntentsTable(result.error)) {
      console.warn('[SIGNUP_INTENT] backend load failed; falling back to auth metadata/session state.', result.error)
    }
  }

  const metadataIntent = normalizeSignupIntent(user.user_metadata?.signup_intent)
  if (metadataIntent) {
    const readyIntent = {
      ...metadataIntent,
      auth_user_id: user.id,
      email: normalizeEmail(metadataIntent.email || user.email),
      status:
        metadataIntent.status === SIGNUP_INTENT_STATUSES.pendingEmailVerification
          ? SIGNUP_INTENT_STATUSES.readyForOnboarding
          : metadataIntent.status,
    }
    storeSignupIntentTemporarily(readyIntent)
    return readyIntent
  }

  const storedIntent = getStoredSignupIntent()
  if (storedIntent && (!storedIntent.email || normalizeEmail(storedIntent.email) === normalizeEmail(user.email))) {
    return {
      ...storedIntent,
      auth_user_id: user.id,
      email: normalizeEmail(storedIntent.email || user.email),
    }
  }

  return null
}

export async function markSignupIntentReadyForOnboarding({ user = null, intent = null } = {}) {
  const normalized = normalizeSignupIntent(intent)
  if (!normalized || !user?.id) return normalized
  const result = await persistSignupIntent({
    intent: normalized,
    user,
    email: normalized.email || user.email,
    status: SIGNUP_INTENT_STATUSES.readyForOnboarding,
  })
  return result.intent
}

export async function markSignupIntentConsumed({ user = null, intent = null } = {}) {
  const normalized = normalizeSignupIntent(intent)
  if (!normalized || !user?.id) return normalized
  const consumedAt = new Date().toISOString()
  const result = await persistSignupIntent({
    intent: {
      ...normalized,
      consumed_at: consumedAt,
    },
    user,
    email: normalized.email || user.email,
    status: SIGNUP_INTENT_STATUSES.consumed,
  })
  clearStoredSignupIntent()
  return {
    ...result.intent,
    consumed_at: consumedAt,
  }
}

export function resolveSignupIntentRoute(intent = null) {
  const normalized = normalizeSignupIntent(intent)
  if (!normalized) return '/onboarding/profile'
  if (normalized.workspace_action === SIGNUP_WORKSPACE_ACTIONS.acceptInvite && normalized.invite_token) {
    return `/invite/${encodeURIComponent(normalized.invite_token)}`
  }
  if (normalized.app_role === 'client') return '/client-access'
  if (normalized.app_role === 'attorney') return '/attorney/onboarding'
  return '/setup'
}
