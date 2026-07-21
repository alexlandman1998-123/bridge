import {
  SIGNUP_INTENT_SOURCE,
  SIGNUP_INTENT_STATUSES,
  SIGNUP_POSITION_INTENT_MAP,
  SIGNUP_WORKSPACE_ACTIONS,
} from '../constants/signupIntents'
import { normalizeCanonicalAppRole } from '../constants/appRoles'
import { normalizeOrgRole } from '../constants/orgRoles'
import { resolveSignupRoleContract, resolveWorkspaceKindForContract } from '../constants/roleContract'
import { normalizeSystemRole } from '../constants/systemRoles'
import { normalizeWorkspaceKind, normalizeWorkspaceType } from '../constants/workspaceTypes'
import { isSupabaseConfigured, supabase } from './supabaseClient'

export const SIGNUP_INTENT_STORAGE_KEY = 'itg:signup-intent:v1'

const SIGNUP_INTENT_SELECT =
  'id, auth_user_id, email, app_role, system_role, workspace_type, workspace_kind, intended_org_role, role_contract_key, authority_level, onboarding_path, workspace_action, invite_token, status, source, created_at, updated_at, consumed_at'
const LEGACY_SIGNUP_INTENT_SELECT =
  'id, auth_user_id, email, app_role, workspace_type, intended_org_role, authority_level, onboarding_path, workspace_action, invite_token, status, source, created_at, updated_at, consumed_at'
const CONTRACT_SIGNUP_INTENT_COLUMNS = ['system_role', 'workspace_kind', 'role_contract_key']

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

function isMissingSignupIntentContractColumn(error) {
  if (!error) return false
  const code = String(error.code || '').toLowerCase()
  const status = Number(error.status || error.statusCode || 0)
  const message = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase()
  return (
    code === '42703' ||
    code === 'pgrst204' ||
    (status === 400 && message.includes('schema cache') && message.includes('signup_intents')) ||
    (status === 400 && message.includes('column') && message.includes('signup_intents')) ||
    CONTRACT_SIGNUP_INTENT_COLUMNS.some((column) => message.includes(column))
  )
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
  const workspaceAction = overrides.workspace_action || (inviteToken ? SIGNUP_WORKSPACE_ACTIONS.acceptInvite : template.workspace_action)
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
  const roleContract = resolveSignupRoleContract({ ...input, app_role: appRole, workspace_type: workspaceType })
  const workspaceKind = normalizeWorkspaceKind(
    input.workspace_kind || input.workspaceKind,
    roleContract ? resolveWorkspaceKindForContract(roleContract) : '',
  )
  const systemRole = normalizeSystemRole(input.system_role || input.systemRole, roleContract?.systemRole || '')
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
    system_role: systemRole || null,
    workspace_type: workspaceType || null,
    workspace_kind: workspaceKind || null,
    intended_org_role: intendedOrgRole,
    role_contract_key: normalizeText(input.role_contract_key || input.roleContractKey || roleContract?.key),
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
    system_role: normalizedIntent.system_role,
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
    system_role: normalized.system_role,
    workspace_type: normalized.workspace_type,
    workspace_kind: normalized.workspace_kind,
    intended_org_role: normalized.intended_org_role,
    role_contract_key: normalized.role_contract_key,
    authority_level: normalized.authority_level,
    onboarding_path: normalized.onboarding_path,
    workspace_action: normalized.workspace_action,
    invite_token: normalized.invite_token || null,
    status,
    source: normalized.source,
    consumed_at: normalized.consumed_at || null,
  }

  let result = await supabase
    .from('signup_intents')
    .upsert(payload, { onConflict: 'auth_user_id' })
    .select(SIGNUP_INTENT_SELECT)
    .single()

  if (result.error && isMissingSignupIntentContractColumn(result.error)) {
    const legacyPayload = { ...payload }
    CONTRACT_SIGNUP_INTENT_COLUMNS.forEach((column) => delete legacyPayload[column])
    result = await supabase
      .from('signup_intents')
      .upsert(legacyPayload, { onConflict: 'auth_user_id' })
      .select(LEGACY_SIGNUP_INTENT_SELECT)
      .single()
  }

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
    let result = await supabase
      .from('signup_intents')
      .select(SIGNUP_INTENT_SELECT)
      .eq('auth_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (result.error && isMissingSignupIntentContractColumn(result.error)) {
      result = await supabase
        .from('signup_intents')
        .select(LEGACY_SIGNUP_INTENT_SELECT)
        .eq('auth_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    }

    if (!result.error && result.data) {
      const intent = mapIntentRow(result.data)
      if (intent) storeSignupIntentTemporarily(intent)
      return intent
    }

    if (result.error && !isMissingSignupIntentsTable(result.error)) {
      console.warn('[SIGNUP_INTENT] backend load failed; falling back to auth metadata/session state.', result.error)
    }
  }

  return getSignupIntentFallbackForUser(user)
}

export function getSignupIntentFallbackForUser(user = null) {
  if (!user?.id) return null

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
  if (normalized.workspace_action === SIGNUP_WORKSPACE_ACTIONS.claimExistingWorkspace) {
    return '/setup'
  }
  if (normalized.app_role === 'client') return '/client-access'
  if (normalized.app_role === 'attorney') return '/attorney/onboarding'
  return '/setup'
}
