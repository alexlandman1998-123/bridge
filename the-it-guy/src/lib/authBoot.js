import { getOrCreateUserProfile } from './api'
import { isSupabaseConfigured, supabase } from './supabaseClient'
import { normalizeCanonicalAppRole, isCanonicalAppRole } from '../constants/appRoles'
import { MEMBERSHIP_STATUSES, isActiveMembershipStatus, normalizeMembershipStatus } from '../constants/membershipStatuses'
import { ONBOARDING_REQUIRED_REASONS, ONBOARDING_STATUSES } from '../constants/onboardingStatuses'
import { normalizeOrgRole } from '../constants/orgRoles'
import { WORKSPACE_TYPES, inferWorkspaceTypeFromAppRole, normalizeWorkspaceType } from '../constants/workspaceTypes'
import { loadSignupIntentForUser, markSignupIntentReadyForOnboarding } from './signupIntent'
import { getOnboardingState } from '../services/onboarding/onboardingEngine'
import { resolveCurrentWorkspace } from '../services/workspaceResolutionService'

const ACTIVE_MEMBERSHIP_STATUSES = new Set([MEMBERSHIP_STATUSES.active])

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase()
}

function isMissingTableError(error, tableName = '') {
  if (!error) return false
  const message = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase()
  const code = String(error.code || '').toLowerCase()
  return code === '42p01' || code === 'pgrst205' || (message.includes('table') && message.includes(String(tableName).toLowerCase()))
}

function isMissingColumnError(error, columnName = '') {
  if (!error) return false
  const message = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase()
  const code = String(error.code || '').toLowerCase()
  return code === '42703' || code === 'pgrst204' || (message.includes('column') && message.includes(String(columnName).toLowerCase()))
}

function isRecoverableSchemaError(error, tableName = '', columnName = '') {
  return isMissingTableError(error, tableName) || (columnName ? isMissingColumnError(error, columnName) : false)
}

function normalizeOrganisationRow(row = null, fallback = {}) {
  if (!row) return null
  const inferredType = normalizeWorkspaceType(row.type, inferWorkspaceTypeFromAppRole(fallback.appRole))
  return {
    id: row.id,
    type: inferredType || inferWorkspaceTypeFromAppRole(fallback.appRole),
    name: normalizeText(row.display_name || row.name) || 'Workspace',
    legalName: normalizeText(row.legal_name || row.name),
    email: normalizeEmail(row.company_email || row.support_email),
    phone: normalizeText(row.company_phone || row.support_phone),
    raw: row,
  }
}

function normalizeAttorneyFirmRow(row = null) {
  if (!row) return null
  return {
    id: row.id,
    type: WORKSPACE_TYPES.attorneyFirm,
    name: normalizeText(row.name) || 'Attorney Firm',
    legalName: normalizeText(row.name),
    email: normalizeEmail(row.email),
    phone: normalizeText(row.phone),
    raw: row,
  }
}

function createMembershipRecord({
  id,
  source,
  userId,
  workspaceId,
  workspace,
  workspaceType,
  appRole,
  role,
  status,
  branchId = null,
  departmentId = null,
  invitedBy = null,
  joinedAt = null,
  acceptedAt = null,
  raw = null,
}) {
  const normalizedWorkspaceType = normalizeWorkspaceType(workspaceType, inferWorkspaceTypeFromAppRole(appRole))
  const normalizedStatus = normalizeMembershipStatus(status)
  return {
    id,
    source,
    userId,
    workspaceId,
    workspace,
    workspaceType: normalizedWorkspaceType,
    appRole: normalizeCanonicalAppRole(appRole),
    role: normalizeOrgRole(role, { appRole, workspaceType: normalizedWorkspaceType }),
    rawRole: normalizeText(role).toLowerCase(),
    status: normalizedStatus,
    isActive: ACTIVE_MEMBERSHIP_STATUSES.has(normalizedStatus),
    branchId,
    departmentId,
    invitedBy,
    joinedAt,
    acceptedAt,
    raw,
  }
}

async function fetchOrganisationRows(client, organisationIds = [], appRole = '') {
  const ids = Array.from(new Set(organisationIds.map((id) => normalizeText(id)).filter(Boolean)))
  if (!ids.length) return new Map()

  let query = await client
    .from('organisations')
    .select('id, name, display_name, company_email, company_phone, support_email, support_phone, legal_name, type')
    .in('id', ids)

  if (query.error && isMissingColumnError(query.error, 'type')) {
    query = await client
      .from('organisations')
      .select('id, name, display_name, company_email, company_phone, support_email, support_phone')
      .in('id', ids)
  }

  if (query.error) {
    if (isMissingTableError(query.error, 'organisations')) return new Map()
    throw query.error
  }

  return new Map((query.data || []).map((row) => [row.id, normalizeOrganisationRow(row, { appRole })]))
}

async function fetchOrganisationMemberships(client, user, profile) {
  const appRole = normalizeCanonicalAppRole(profile?.role)
  const byUserId = await client
    .from('organisation_users')
    .select('id, organisation_id, user_id, branch_id, first_name, last_name, email, role, status, invited_by_user_id, invited_at, joined_at, accepted_at, last_active_at, created_at, updated_at')
    .eq('user_id', user.id)

  if (byUserId.error) {
    if (isRecoverableSchemaError(byUserId.error, 'organisation_users', 'organisation_id')) return []
    throw byUserId.error
  }

  const userEmail = normalizeEmail(user.email || profile?.email)
  let invitedRows = []
  if (userEmail) {
    const byEmail = await client
      .from('organisation_users')
      .select('id, organisation_id, user_id, branch_id, first_name, last_name, email, role, status, invited_by_user_id, invited_at, joined_at, accepted_at, last_active_at, created_at, updated_at')
      .eq('email', userEmail)
      .in('status', [MEMBERSHIP_STATUSES.invited, MEMBERSHIP_STATUSES.pending])

    if (!byEmail.error) {
      invitedRows = byEmail.data || []
    } else if (!isRecoverableSchemaError(byEmail.error, 'organisation_users', 'status')) {
      throw byEmail.error
    }
  }

  const rowsById = new Map()
  for (const row of [...(byUserId.data || []), ...invitedRows]) {
    if (row?.id) rowsById.set(row.id, row)
  }

  const rows = Array.from(rowsById.values())
  const organisationRows = await fetchOrganisationRows(client, rows.map((row) => row.organisation_id), appRole)

  return rows.map((row) => {
    const workspaceType = inferWorkspaceTypeFromAppRole(appRole)
    const workspace = organisationRows.get(row.organisation_id) || null

    return createMembershipRecord({
      id: row.id,
      source: 'organisation_users',
      userId: row.user_id || null,
      workspaceId: row.organisation_id || null,
      workspace,
      workspaceType: workspace?.type || workspaceType,
      appRole,
      role: row.role,
      status: row.status,
      branchId: row.branch_id || null,
      invitedBy: row.invited_by_user_id || null,
      joinedAt: row.joined_at || null,
      acceptedAt: row.accepted_at || null,
      raw: row,
    })
  })
}

async function fetchAttorneyMemberships(client, user, profile) {
  const profileFirmId = normalizeText(profile?.primaryAttorneyFirmId)

  const query = await client
    .from('attorney_firm_members')
    .select('id, firm_id, user_id, department_id, role, status, invited_by, joined_at, created_at, updated_at')
    .eq('user_id', user.id)

  if (query.error) {
    if (isMissingTableError(query.error, 'attorney_firm_members')) return []
    throw query.error
  }

  const rows = query.data || []
  const firmIds = Array.from(new Set([...rows.map((row) => row.firm_id), profileFirmId].map((id) => normalizeText(id)).filter(Boolean)))
  let firmsById = new Map()

  if (firmIds.length) {
    const firmQuery = await client
      .from('attorney_firms')
      .select('id, name, email, phone, created_by, is_active')
      .in('id', firmIds)

    if (firmQuery.error) {
      if (!isMissingTableError(firmQuery.error, 'attorney_firms')) throw firmQuery.error
    } else {
      firmsById = new Map((firmQuery.data || []).map((row) => [row.id, normalizeAttorneyFirmRow(row)]))
    }
  }

  const membershipRows = [...rows]
  if (profileFirmId && !membershipRows.some((row) => row.firm_id === profileFirmId) && firmsById.has(profileFirmId)) {
    const firm = firmsById.get(profileFirmId)
    const isCreatedByUser = firm?.raw?.created_by === user.id
    membershipRows.push({
      id: `attorney-profile-primary-${profileFirmId}-${user.id}`,
      firm_id: profileFirmId,
      user_id: user.id,
      role: isCreatedByUser ? 'firm_admin' : 'attorney',
      status: isCreatedByUser ? MEMBERSHIP_STATUSES.active : MEMBERSHIP_STATUSES.pending,
      department_id: null,
      joined_at: null,
    })
  }

  return membershipRows.map((row) => {
    const workspace = firmsById.get(row.firm_id) || null
    return createMembershipRecord({
      id: row.id,
      source: 'attorney_firm_members',
      userId: row.user_id || null,
      workspaceId: row.firm_id || null,
      workspace,
      workspaceType: WORKSPACE_TYPES.attorneyFirm,
      appRole: 'attorney',
      role: row.role,
      status: row.status,
      departmentId: row.department_id || null,
      invitedBy: row.invited_by || null,
      joinedAt: row.joined_at || null,
      raw: row,
    })
  })
}

function sortMemberships(left, right) {
  if (left.workspace && !right.workspace) return -1
  if (!left.workspace && right.workspace) return 1
  const leftKey = `${left.workspaceType || ''}:${left.workspace?.name || ''}:${left.workspaceId || ''}:${left.id || ''}`
  const rightKey = `${right.workspaceType || ''}:${right.workspace?.name || ''}:${right.workspaceId || ''}:${right.id || ''}`
  return leftKey.localeCompare(rightKey)
}

function chooseCurrentMembership(activeMemberships = [], selectedWorkspaceId = '') {
  if (!activeMemberships.length) return null
  const selectedId = normalizeText(selectedWorkspaceId)
  if (selectedId) {
    const selected = activeMemberships.find((membership) => membership.workspace && (membership.workspaceId === selectedId || membership.id === selectedId))
    if (selected) return selected
  }
  return [...activeMemberships].sort(sortMemberships)[0] || null
}

function profileNeedsRepair(profile) {
  if (!profile?.id) return ONBOARDING_REQUIRED_REASONS.noProfile
  const firstName = normalizeText(profile.firstName)
  const lastName = normalizeText(profile.lastName)
  if (!firstName || !lastName) return ONBOARDING_REQUIRED_REASONS.profileIncomplete
  if (!isCanonicalAppRole(profile.role)) return ONBOARDING_REQUIRED_REASONS.appRoleMissing
  return ''
}

export function deriveAuthBootOnboardingState({
  profile = null,
  appRole = '',
  activeMemberships = [],
  currentMembership = null,
} = {}) {
  const repairReason = profileNeedsRepair(profile)
  if (repairReason) {
    return {
      onboardingComplete: false,
      onboardingRequiredReason: repairReason,
    }
  }

  if (!profile?.onboardingCompleted) {
    return {
      onboardingComplete: false,
      onboardingRequiredReason: ONBOARDING_REQUIRED_REASONS.onboardingIncomplete,
    }
  }

  if (appRole !== 'client' && !activeMemberships.length) {
    return {
      onboardingComplete: false,
      onboardingRequiredReason: ONBOARDING_REQUIRED_REASONS.noActiveMembership,
    }
  }

  if (appRole !== 'client' && !currentMembership?.workspace) {
    return {
      onboardingComplete: false,
      onboardingRequiredReason: ONBOARDING_REQUIRED_REASONS.workspaceMissing,
    }
  }

  return {
    onboardingComplete: true,
    onboardingRequiredReason: ONBOARDING_REQUIRED_REASONS.none,
  }
}

export async function loadBridgeAuthState({ session, selectedWorkspaceId = '' } = {}) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured. Bridge auth requires Supabase in this environment.')
  }

  if (!session?.user?.id) {
    return {
      status: 'unauthenticated',
      session: null,
      user: null,
      profile: null,
      signupIntent: null,
      onboardingState: null,
      appRole: '',
      memberships: [],
      activeMemberships: [],
      pendingMemberships: [],
      suspendedMemberships: [],
      currentMembership: null,
      currentWorkspace: null,
      workspaceType: '',
      onboardingComplete: false,
      onboardingRequiredReason: '',
      bootError: '',
    }
  }

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  const user = userData?.user || session.user
  if (!user?.id) throw new Error('Authenticated Supabase user could not be resolved.')

  const profile = await getOrCreateUserProfile({ user })
  const loadedSignupIntent = await loadSignupIntentForUser({ user })
  const signupIntent = loadedSignupIntent
    ? await markSignupIntentReadyForOnboarding({ user, intent: loadedSignupIntent })
    : null
  const appRole = normalizeCanonicalAppRole(profile?.role)

  if (!isCanonicalAppRole(appRole)) {
    console.warn('[AUTH] profile role requires repair before dashboard access', {
      userId: user.id,
      role: profile?.role || null,
    })
  }

  const workspaceResolution = await resolveCurrentWorkspace(user.id, {
    client: supabase,
    user,
    profile,
    requestedWorkspaceId: selectedWorkspaceId,
  })
  const memberships = workspaceResolution.memberships
  const activeMemberships = workspaceResolution.activeMemberships
  const pendingMemberships = workspaceResolution.pendingMemberships
  const suspendedMemberships = workspaceResolution.suspendedMemberships
  const currentMembership = workspaceResolution.currentMembership
  const currentWorkspace = workspaceResolution.currentWorkspace
  const workspaceType = workspaceResolution.workspaceType || inferWorkspaceTypeFromAppRole(appRole)
  const onboarding = deriveAuthBootOnboardingState({
    profile,
    signupIntent,
    appRole,
    activeMemberships,
    currentMembership,
  })
  const onboardingState = await getOnboardingState(user.id, {
    session,
    user,
    profile,
    signupIntent,
    appRole,
    memberships,
    activeMemberships,
    pendingMemberships,
    suspendedMemberships,
    currentMembership,
    currentWorkspace,
    workspaceType,
    workspaceRole: workspaceResolution.workspaceRole,
    permissions: workspaceResolution.permissions,
    workspaceResolution,
    workspaceDiagnostics: workspaceResolution.diagnostics,
    onboardingComplete: onboarding.onboardingComplete,
    onboardingRequiredReason: onboarding.onboardingRequiredReason,
  })
  const engineRequiresSetup = Boolean(onboardingState?.recoveryReason) || (
    profile?.onboardingCompleted &&
    onboardingState?.validation &&
    onboardingState.validation.ok === false
  )
  const engineRequiredReason =
    onboardingState?.onboardingStatus === ONBOARDING_STATUSES.workspacePendingApproval
      ? ONBOARDING_REQUIRED_REASONS.pendingApproval
      : onboardingState?.recoveryReason || onboarding.onboardingRequiredReason

  return {
    status: 'authenticated',
    session,
    user,
    profile,
    signupIntent,
    onboardingState,
    appRole,
    memberships,
    activeMemberships,
    pendingMemberships,
    suspendedMemberships,
    currentMembership,
    currentWorkspace,
    workspaceType,
    workspaceRole: workspaceResolution.workspaceRole,
    permissions: workspaceResolution.permissions,
    workspaceResolution,
    workspaceDiagnostics: workspaceResolution.diagnostics,
    onboardingComplete: engineRequiresSetup ? false : onboarding.onboardingComplete,
    onboardingRequiredReason: engineRequiresSetup || onboardingState?.onboardingStatus === ONBOARDING_STATUSES.workspacePendingApproval
      ? engineRequiredReason
      : onboarding.onboardingRequiredReason,
    bootError: '',
  }
}
