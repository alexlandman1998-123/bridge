import { DEFAULT_APP_ROLE, normalizeCanonicalAppRole } from '../constants/appRoles'
import { resolveSystemRole } from '../services/roleResolutionService'
import { clearSupabaseLocalAuthState, isUserFromSubClaimMissingError, supabase } from './supabaseClient'

const PROFILE_SELECT_COLUMNS =
  'id, email, first_name, last_name, full_name, company_name, phone_number, avatar_url, role, system_role, primary_attorney_firm_id, attorney_role, onboarding_completed, created_at, updated_at'
const LEGACY_PROFILE_SELECT_COLUMNS =
  'id, email, first_name, last_name, full_name, company_name, phone_number, role, onboarding_completed, created_at, updated_at'

const ATTORNEY_FIRM_ROLE_VALUES = [
  'firm_admin',
  'director_partner',
  'transfer_attorney',
  'bond_attorney',
  'conveyancing_secretary',
  'admin_staff',
  'reception_scheduling',
  'candidate_attorney',
]

function requireClient() {
  if (!supabase) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_KEY to .env.')
  }

  return supabase
}

function isMissingTableError(error, tableName) {
  if (!error) return false

  const status = Number(error.status || error.statusCode || 0)
  const code = String(error.code || '').toUpperCase()
  const message = String(error.message || '').toLowerCase()
  if (message.includes('permission denied')) return false
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    code === 'NOT_FOUND' ||
    status === 404 ||
    message.includes('relation does not exist') ||
    message.includes('schema cache') ||
    message.includes(`could not find the table '${String(tableName || '').toLowerCase()}'`) ||
    message.includes(`could not find the '${String(tableName || '').toLowerCase()}' table`)
  )
}

function isMissingColumnError(error, columnName) {
  if (!error) return false

  const status = Number(error.status || error.statusCode || 0)
  const code = String(error.code || '').toUpperCase()
  const message = String(error.message || '').toLowerCase()
  const details = String(error.details || '').toLowerCase()
  const hint = String(error.hint || '').toLowerCase()
  const normalizedColumnName = String(columnName || '').trim().toLowerCase()
  if (message.includes('permission denied')) return false
  const missingColumnByCode = code === '42703' || code === 'PGRST204' || code === 'PGRST116'
  const hasNamedColumnMatch = normalizedColumnName
    ? message.includes(normalizedColumnName) || details.includes(normalizedColumnName) || hint.includes(normalizedColumnName)
    : true
  if (missingColumnByCode) return hasNamedColumnMatch
  if (status === 400 && message.includes('column') && message.includes('does not exist')) return hasNamedColumnMatch
  return normalizedColumnName ? message.includes('column') && message.includes(normalizedColumnName) : message.includes('column')
}

function isPermissionDeniedError(error) {
  if (!error) return false

  const message = String(error.message || '').toLowerCase()
  return error.code === '42501' || message.includes('permission denied')
}

function normalizeNullableText(value) {
  const text = String(value || '').trim()
  return text || null
}

function normalizeAppRole(value) {
  return normalizeCanonicalAppRole(value, DEFAULT_APP_ROLE)
}

function splitFullName(fullName) {
  const safeName = String(fullName || '').trim()
  if (!safeName) return { firstName: '', lastName: '' }

  const parts = safeName.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  }
}

function buildDefaultProfileFromUser(user) {
  const metadata = user?.user_metadata || {}
  const metadataFullName = String(metadata.full_name || metadata.name || '').trim()
  const split = splitFullName(metadataFullName)
  const firstName = String(metadata.first_name || split.firstName || '').trim()
  const lastName = String(metadata.last_name || split.lastName || '').trim()
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim()
  const role = normalizeAppRole(metadata.role || metadata.role_type || metadata.persona || metadata.app_role || DEFAULT_APP_ROLE)

  return {
    id: user?.id || null,
    email: String(user?.email || '').trim() || null,
    firstName,
    lastName,
    fullName: fullName || metadataFullName || null,
    companyName: String(metadata.company_name || metadata.company || '').trim() || '',
    phoneNumber: String(metadata.phone || metadata.phone_number || '').trim() || '',
    avatarUrl: String(metadata.avatar_url || metadata.avatarUrl || metadata.picture || '').trim() || '',
    role,
    systemRole: resolveSystemRole({ role }),
    primaryAttorneyFirmId: null,
    attorneyRole: null,
    onboardingCompleted: false,
    createdAt: null,
    updatedAt: null,
  }
}

function normalizeProfileRow(row, user, fallback = null) {
  const base = fallback || buildDefaultProfileFromUser(user)
  const firstName = String(row?.first_name || base.firstName || '').trim()
  const lastName = String(row?.last_name || base.lastName || '').trim()
  const combinedName = [firstName, lastName].filter(Boolean).join(' ').trim()

  return {
    id: row?.id || base.id || user?.id || null,
    email: row?.email || base.email || user?.email || null,
    firstName,
    lastName,
    fullName: combinedName || row?.full_name || base.fullName || null,
    companyName: row?.company_name || base.companyName || '',
    phoneNumber: row?.phone_number || base.phoneNumber || '',
    avatarUrl: row?.avatar_url || base.avatarUrl || '',
    role: normalizeAppRole(row?.role || base.role || DEFAULT_APP_ROLE),
    systemRole: resolveSystemRole({ system_role: row?.system_role || base.systemRole, role: row?.role || base.role }),
    primaryAttorneyFirmId: row?.primary_attorney_firm_id || base.primaryAttorneyFirmId || null,
    attorneyRole: row?.attorney_role || base.attorneyRole || null,
    onboardingCompleted:
      row?.onboarding_completed === true || row?.onboarding_completed === false
        ? row.onboarding_completed
        : Boolean(base.onboardingCompleted),
    createdAt: row?.created_at || base.createdAt || null,
    updatedAt: row?.updated_at || base.updatedAt || null,
  }
}

async function persistProfileRecord(client, user, fallbackProfile, { createIfMissing = false } = {}) {
  const rowPayload = {
    id: user.id,
    email: fallbackProfile.email,
    first_name: fallbackProfile.firstName || null,
    last_name: fallbackProfile.lastName || null,
    full_name: fallbackProfile.fullName || null,
    company_name: fallbackProfile.companyName || null,
    phone_number: fallbackProfile.phoneNumber || null,
    avatar_url: fallbackProfile.avatarUrl || null,
    role: normalizeAppRole(fallbackProfile.role),
    system_role: resolveSystemRole(fallbackProfile),
    primary_attorney_firm_id: fallbackProfile.primaryAttorneyFirmId || null,
    attorney_role: fallbackProfile.attorneyRole || null,
    onboarding_completed: Boolean(fallbackProfile.onboardingCompleted),
  }

  const writeProfile = (payload, selectColumns) => {
    if (createIfMissing) {
      return client
        .from('profiles')
        .insert(payload)
        .select(selectColumns)
        .single()
    }

    const updatePayload = { ...payload }
    delete updatePayload.id
    return client
      .from('profiles')
      .update(updatePayload)
      .eq('id', user.id)
      .select(selectColumns)
      .maybeSingle()
  }

  let result = await writeProfile(rowPayload, PROFILE_SELECT_COLUMNS)

  if (
    result.error &&
    (isMissingColumnError(result.error, 'primary_attorney_firm_id') ||
      isMissingColumnError(result.error, 'attorney_role') ||
      isMissingColumnError(result.error, 'system_role') ||
      isMissingColumnError(result.error, 'avatar_url'))
  ) {
    const legacyPayload = { ...rowPayload }
    delete legacyPayload.primary_attorney_firm_id
    delete legacyPayload.attorney_role
    delete legacyPayload.system_role
    delete legacyPayload.avatar_url
    result = await writeProfile(legacyPayload, LEGACY_PROFILE_SELECT_COLUMNS)
  }

  if (result.error) {
    if (isMissingTableError(result.error, 'profiles') || isMissingColumnError(result.error, 'role')) {
      throw new Error('Profiles onboarding schema is not set up yet. Run sql/schema.sql first.')
    }
    if (isPermissionDeniedError(result.error)) {
      throw new Error('Profiles table exists, but Supabase API permissions are missing. Run the schema grants and reload the app.')
    }
    throw result.error
  }

  if (!result.data) {
    throw new Error('Profile record was not found. Complete account setup before updating your profile.')
  }

  return normalizeProfileRow(result.data, user, fallbackProfile)
}

export async function getOrCreateUserProfile({ user } = {}) {
  const client = requireClient()
  let activeUser = user || null

  if (!activeUser) {
    const { data: authData, error: authError } = await client.auth.getUser()
    if (authError) {
      if (isUserFromSubClaimMissingError(authError)) {
        await clearSupabaseLocalAuthState()
        throw new Error('Your session is out of sync with this environment. Please sign in again.')
      }
      throw authError
    }
    activeUser = authData?.user || null
  }

  if (!activeUser?.id) {
    throw new Error('Authenticated user is required.')
  }

  const fallbackProfile = buildDefaultProfileFromUser(activeUser)

  let profileQuery = await client
    .from('profiles')
    .select(PROFILE_SELECT_COLUMNS)
    .eq('id', activeUser.id)
    .maybeSingle()

  if (
    profileQuery.error &&
    (isMissingColumnError(profileQuery.error, 'primary_attorney_firm_id') ||
      isMissingColumnError(profileQuery.error, 'attorney_role') ||
      isMissingColumnError(profileQuery.error, 'system_role') ||
      isMissingColumnError(profileQuery.error, 'avatar_url'))
  ) {
    profileQuery = await client
      .from('profiles')
      .select(LEGACY_PROFILE_SELECT_COLUMNS)
      .eq('id', activeUser.id)
      .maybeSingle()
  }

  if (profileQuery.error) {
    if (isMissingTableError(profileQuery.error, 'profiles') || isMissingColumnError(profileQuery.error, 'role')) {
      throw new Error('Profiles onboarding schema is not set up yet. Run sql/schema.sql first.')
    }
    if (isPermissionDeniedError(profileQuery.error)) {
      throw new Error('Profiles table exists, but Supabase API permissions are missing. Run the schema grants and reload the app.')
    }
    throw profileQuery.error
  }

  if (!profileQuery.data) {
    return persistProfileRecord(client, activeUser, fallbackProfile, { createIfMissing: true })
  }

  const normalized = normalizeProfileRow(profileQuery.data, activeUser, fallbackProfile)
  const needsBackfill =
    !profileQuery.data.role ||
    profileQuery.data.onboarding_completed === null ||
    (normalized.fullName && !profileQuery.data.full_name)

  if (!needsBackfill) {
    return normalized
  }

  return persistProfileRecord(client, activeUser, {
    ...normalized,
    onboardingCompleted: normalized.onboardingCompleted,
  })
}

export async function updateUserProfile({
  userId,
  firstName,
  lastName,
  companyName,
  phoneNumber,
  avatarUrl,
  role,
  onboardingCompleted,
  primaryAttorneyFirmId,
  attorneyRole,
}) {
  const client = requireClient()

  if (!userId) {
    throw new Error('User id is required to update profile.')
  }

  const payload = {}

  if (firstName !== undefined) {
    const safeFirstName = String(firstName || '').trim()
    payload.first_name = safeFirstName || null
  }

  if (lastName !== undefined) {
    const safeLastName = String(lastName || '').trim()
    payload.last_name = safeLastName || null
  }

  if (firstName !== undefined && lastName !== undefined) {
    const safeFirstName = String(firstName || '').trim()
    const safeLastName = String(lastName || '').trim()
    const safeFullName = [safeFirstName, safeLastName].filter(Boolean).join(' ').trim()
    payload.full_name = safeFullName || null
  }

  if (companyName !== undefined) {
    payload.company_name = normalizeNullableText(companyName)
  }

  if (phoneNumber !== undefined) {
    payload.phone_number = normalizeNullableText(phoneNumber)
  }

  if (avatarUrl !== undefined) {
    payload.avatar_url = normalizeNullableText(avatarUrl)
  }

  if (role !== undefined) {
    payload.role = normalizeAppRole(role)
    payload.system_role = resolveSystemRole({ role: payload.role })
  }

  if (onboardingCompleted !== undefined) {
    payload.onboarding_completed = Boolean(onboardingCompleted)
  }

  if (primaryAttorneyFirmId !== undefined) {
    payload.primary_attorney_firm_id = primaryAttorneyFirmId || null
  }

  if (attorneyRole !== undefined) {
    const normalizedAttorneyRole = String(attorneyRole || '')
      .trim()
      .toLowerCase()
    if (normalizedAttorneyRole && !ATTORNEY_FIRM_ROLE_VALUES.includes(normalizedAttorneyRole)) {
      throw new Error('Invalid attorney role value.')
    }
    payload.attorney_role = normalizedAttorneyRole || null
  }

  console.debug('[PROFILE] write:start', {
    userId,
    fields: Object.keys(payload),
  })

  let updateResult = await client
    .from('profiles')
    .update(payload)
    .eq('id', userId)
    .select(PROFILE_SELECT_COLUMNS)
    .maybeSingle()

  if (
    updateResult.error &&
    (isMissingColumnError(updateResult.error, 'primary_attorney_firm_id') ||
      isMissingColumnError(updateResult.error, 'attorney_role') ||
      isMissingColumnError(updateResult.error, 'system_role') ||
      isMissingColumnError(updateResult.error, 'avatar_url'))
  ) {
    const legacyPayload = { ...payload }
    delete legacyPayload.primary_attorney_firm_id
    delete legacyPayload.attorney_role
    delete legacyPayload.system_role
    delete legacyPayload.avatar_url
    updateResult = await client
      .from('profiles')
      .update(legacyPayload)
      .eq('id', userId)
      .select(LEGACY_PROFILE_SELECT_COLUMNS)
      .maybeSingle()
  }

  if (updateResult.error) {
    if (isMissingTableError(updateResult.error, 'profiles') || isMissingColumnError(updateResult.error, 'role')) {
      throw new Error('Profiles onboarding schema is not set up yet. Run sql/schema.sql first.')
    }
    if (isPermissionDeniedError(updateResult.error)) {
      throw new Error('Profiles table exists, but Supabase API permissions are missing. Run the schema grants and reload the app.')
    }
    throw updateResult.error
  }

  if (!updateResult.data) {
    throw new Error('Profile record was not found. Complete account setup before updating your profile.')
  }

  console.debug('[PROFILE] write:success', {
    userId,
    role: updateResult.data?.role || null,
    onboardingCompleted: updateResult.data?.onboarding_completed ?? null,
  })

  return normalizeProfileRow(updateResult.data, { id: userId })
}
