import { APP_ROLES, isCanonicalAppRole, normalizeCanonicalAppRole } from '../constants/appRoles'
import { MEMBERSHIP_STATUSES, isActiveMembershipStatus, normalizeMembershipStatus } from '../constants/membershipStatuses'
import { ONBOARDING_REQUIRED_REASONS } from '../constants/onboardingStatuses'
import { normalizeOrgRole } from '../constants/orgRoles'
import { WORKSPACE_TYPES, inferWorkspaceTypeFromAppRole, normalizeWorkspaceType } from '../constants/workspaceTypes'
import { permissionsByWorkspaceRole } from '../auth/permissions/permissionRegistry'
import { getOrCreateUserProfile } from '../lib/api'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

export const WORKSPACE_RESOLUTION_STATUSES = Object.freeze({
  resolved: 'resolved',
  unauthenticated: 'unauthenticated',
  profileRequired: 'profile_required',
  appRoleRequired: 'app_role_required',
  membershipRequired: 'membership_required',
  pendingApproval: 'pending_approval',
  workspaceMissing: 'workspace_missing',
  invalidPreference: 'invalid_preference',
  blocked: 'blocked',
  schemaMissing: 'schema_missing',
})

const BLOCKED_MEMBERSHIP_STATUSES = new Set([
  MEMBERSHIP_STATUSES.suspended,
  MEMBERSHIP_STATUSES.removed,
  MEMBERSHIP_STATUSES.deactivated,
])

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase()
}

function isMissingTableError(error, tableName = '') {
  if (!error) return false
  const code = String(error.code || '').toLowerCase()
  const message = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase()
  return code === '42p01' || code === 'pgrst205' || (message.includes('table') && message.includes(String(tableName).toLowerCase()))
}

function isMissingColumnError(error, columnName = '') {
  if (!error) return false
  const code = String(error.code || '').toLowerCase()
  const message = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase()
  return code === '42703' || code === 'pgrst204' || (columnName && message.includes(String(columnName).toLowerCase()))
}

function isRecoverableSchemaError(error, tableName = '', columnName = '') {
  return isMissingTableError(error, tableName) || (columnName ? isMissingColumnError(error, columnName) : false)
}

function normalizeProfile(profile = null) {
  if (!profile) return null
  return {
    ...profile,
    id: profile.id || profile.user_id || '',
    email: profile.email || '',
    firstName: profile.firstName || profile.first_name || '',
    lastName: profile.lastName || profile.last_name || '',
    fullName: profile.fullName || profile.full_name || '',
    role: normalizeCanonicalAppRole(profile.role, profile.role || ''),
    onboardingCompleted: Boolean(profile.onboardingCompleted ?? profile.onboarding_completed),
  }
}

function profileRepairReason(profile = null) {
  if (!profile?.id) return ONBOARDING_REQUIRED_REASONS.noProfile
  if (!normalizeText(profile.firstName) || !normalizeText(profile.lastName)) return ONBOARDING_REQUIRED_REASONS.profileIncomplete
  if (!isCanonicalAppRole(profile.role)) return ONBOARDING_REQUIRED_REASONS.appRoleMissing
  return ''
}

function normalizeOrganisationRow(row = null, fallback = {}) {
  if (!row) return null
  const type = normalizeWorkspaceType(row.type || row.workspace_type, inferWorkspaceTypeFromAppRole(fallback.appRole))
  return {
    id: row.id,
    type,
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
  const workspaceRole = normalizeOrgRole(role, { appRole, workspaceType: normalizedWorkspaceType })
  const resolvedWorkspace = workspace || null
  return {
    id,
    source,
    userId,
    workspaceId,
    workspace: resolvedWorkspace,
    workspaceType: normalizedWorkspaceType,
    appRole: normalizeCanonicalAppRole(appRole, ''),
    role: workspaceRole,
    workspaceRole,
    rawRole: normalizeText(role).toLowerCase(),
    status: normalizedStatus,
    isActive: isActiveMembershipStatus(normalizedStatus),
    branchId,
    departmentId,
    invitedBy,
    joinedAt,
    acceptedAt,
    raw,
  }
}

function sortMemberships(left, right) {
  if (left.workspace && !right.workspace) return -1
  if (!left.workspace && right.workspace) return 1
  const leftKey = `${left.workspaceType || ''}:${left.workspace?.name || ''}:${left.workspaceId || ''}:${left.id || ''}`
  const rightKey = `${right.workspaceType || ''}:${right.workspace?.name || ''}:${right.workspaceId || ''}:${right.id || ''}`
  return leftKey.localeCompare(rightKey)
}

function getWorkspacePreferenceReason({
  requestedWorkspaceId = '',
  storedWorkspaceId = '',
  selectedMembership = null,
  activeMemberships = [],
}) {
  const requested = normalizeText(requestedWorkspaceId)
  const stored = normalizeText(storedWorkspaceId)
  if (requested && selectedMembership?.workspaceId === requested) return 'requested_workspace'
  if (stored && selectedMembership?.workspaceId === stored) return 'stored_preference'
  if (requested && !activeMemberships.some((membership) => membership.workspaceId === requested || membership.id === requested)) {
    return 'requested_workspace_invalid'
  }
  if (stored && !activeMemberships.some((membership) => membership.workspaceId === stored || membership.id === stored)) {
    return 'stored_preference_invalid'
  }
  return selectedMembership ? 'first_active_membership' : 'none'
}

function selectMembership(activeMemberships = [], { requestedWorkspaceId = '', storedWorkspaceId = '' } = {}) {
  const requested = normalizeText(requestedWorkspaceId)
  if (requested) {
    const selected = activeMemberships.find((membership) => membership.workspace && (membership.workspaceId === requested || membership.id === requested))
    if (selected) return selected
  }

  const stored = normalizeText(storedWorkspaceId)
  if (stored) {
    const selected = activeMemberships.find((membership) => membership.workspace && (membership.workspaceId === stored || membership.id === stored))
    if (selected) return selected
  }

  return [...activeMemberships].sort(sortMemberships)[0] || null
}

function getPermissionMapForMembership(membership = null, appRole = '') {
  if (!membership?.id || !isActiveMembershipStatus(membership.status)) return Object.freeze({})
  if (appRole === APP_ROLES.platformAdmin) return Object.freeze({})
  return permissionsByWorkspaceRole[membership.workspaceType]?.[membership.workspaceRole || membership.role] || Object.freeze({})
}

function buildDiagnostics({
  userId = '',
  profile = null,
  memberships = [],
  activeMemberships = [],
  pendingMemberships = [],
  suspendedMemberships = [],
  currentMembership = null,
  requestedWorkspaceId = '',
  storedWorkspaceId = '',
  reason = '',
  status = '',
  warnings = [],
} = {}) {
  return {
    userId,
    status,
    reason,
    appRole: profile?.role || '',
    requestedWorkspaceId: normalizeText(requestedWorkspaceId) || null,
    storedWorkspaceId: normalizeText(storedWorkspaceId) || null,
    currentWorkspaceId: currentMembership?.workspaceId || null,
    currentMembershipId: currentMembership?.id || null,
    membershipCounts: {
      total: memberships.length,
      active: activeMemberships.length,
      pending: pendingMemberships.length,
      blocked: suspendedMemberships.length,
    },
    warnings,
  }
}

function createResolutionResult({
  ok,
  status,
  reason,
  profile = null,
  user = null,
  memberships = [],
  activeMemberships = [],
  pendingMemberships = [],
  suspendedMemberships = [],
  currentMembership = null,
  requestedWorkspaceId = '',
  storedWorkspaceId = '',
  warnings = [],
} = {}) {
  const currentWorkspace = currentMembership?.workspace || null
  const workspaceType = currentWorkspace?.type || currentMembership?.workspaceType || inferWorkspaceTypeFromAppRole(profile?.role)
  const workspaceRole = currentMembership?.workspaceRole || currentMembership?.role || ''
  const permissions = getPermissionMapForMembership(currentMembership, profile?.role)
  const diagnostics = buildDiagnostics({
    userId: user?.id || profile?.id || currentMembership?.userId || '',
    profile,
    memberships,
    activeMemberships,
    pendingMemberships,
    suspendedMemberships,
    currentMembership,
    requestedWorkspaceId,
    storedWorkspaceId,
    reason,
    status,
    warnings,
  })

  if (!ok) {
    console.warn('[WORKSPACE_RESOLUTION] unresolved workspace context', diagnostics)
  }

  return {
    ok,
    status,
    reason,
    profile,
    user,
    memberships,
    activeMemberships,
    pendingMemberships,
    suspendedMemberships,
    currentMembership,
    currentWorkspace,
    workspaceType,
    workspaceRole,
    permissions,
    onboardingRequiredReason: reason,
    diagnostics,
  }
}

export function buildWorkspaceResolution({
  user = null,
  profile: profileInput = null,
  organisationMembershipRows = [],
  organisationRows = [],
  attorneyMembershipRows = [],
  attorneyFirmRows = [],
  requestedWorkspaceId = '',
  storedWorkspaceId = '',
} = {}) {
  const profile = normalizeProfile(profileInput)
  const userEmail = normalizeEmail(user?.email || profile?.email)
  const userId = normalizeText(user?.id || profile?.id)
  const appRole = normalizeCanonicalAppRole(profile?.role, '')
  const organisationById = new Map((organisationRows || []).map((row) => [row.id, normalizeOrganisationRow(row, { appRole })]))
  const firmById = new Map((attorneyFirmRows || []).map((row) => [row.id, normalizeAttorneyFirmRow(row)]))

  const organisationMemberships = (organisationMembershipRows || []).map((row) => {
    const workspace = organisationById.get(row.organisation_id) || normalizeOrganisationRow(row.organisations, { appRole })
    return createMembershipRecord({
      id: row.id,
      source: 'organisation_users',
      userId: row.user_id || null,
      workspaceId: row.organisation_id || null,
      workspace,
      workspaceType: row.workspace_type || workspace?.type || inferWorkspaceTypeFromAppRole(appRole),
      appRole: row.app_role || appRole,
      role: row.organisation_role || row.role,
      status: row.status,
      branchId: row.branch_id || null,
      invitedBy: row.invited_by_user_id || null,
      joinedAt: row.joined_at || null,
      acceptedAt: row.accepted_at || null,
      raw: row,
    })
  })

  const attorneyMemberships = (attorneyMembershipRows || []).map((row) => {
    const workspace = firmById.get(row.firm_id) || normalizeAttorneyFirmRow(row.attorney_firms)
    return createMembershipRecord({
      id: row.id,
      source: 'attorney_firm_members',
      userId: row.user_id || null,
      workspaceId: row.firm_id || null,
      workspace,
      workspaceType: WORKSPACE_TYPES.attorneyFirm,
      appRole: APP_ROLES.attorney,
      role: row.role,
      status: row.status,
      departmentId: row.department_id || null,
      invitedBy: row.invited_by || null,
      joinedAt: row.joined_at || null,
      raw: row,
    })
  })

  const memberships = [...organisationMemberships, ...attorneyMemberships].sort(sortMemberships)
  const activeMemberships = memberships.filter((membership) => isActiveMembershipStatus(membership.status))
  const pendingMemberships = memberships.filter((membership) =>
    [MEMBERSHIP_STATUSES.invited, MEMBERSHIP_STATUSES.pending].includes(normalizeMembershipStatus(membership.status)),
  )
  const suspendedMemberships = memberships.filter((membership) => BLOCKED_MEMBERSHIP_STATUSES.has(normalizeMembershipStatus(membership.status)))
  const repairReason = profileRepairReason(profile)

  if (!userId) {
    return createResolutionResult({
      ok: false,
      status: WORKSPACE_RESOLUTION_STATUSES.unauthenticated,
      reason: ONBOARDING_REQUIRED_REASONS.noProfile,
      profile,
      user,
      memberships,
      activeMemberships,
      pendingMemberships,
      suspendedMemberships,
      requestedWorkspaceId,
      storedWorkspaceId,
      warnings: ['missing_user_id'],
    })
  }

  if (repairReason) {
    return createResolutionResult({
      ok: false,
      status: repairReason === ONBOARDING_REQUIRED_REASONS.appRoleMissing ? WORKSPACE_RESOLUTION_STATUSES.appRoleRequired : WORKSPACE_RESOLUTION_STATUSES.profileRequired,
      reason: repairReason,
      profile,
      user,
      memberships,
      activeMemberships,
      pendingMemberships,
      suspendedMemberships,
      requestedWorkspaceId,
      storedWorkspaceId,
    })
  }

  if (appRole === APP_ROLES.client || appRole === APP_ROLES.platformAdmin) {
    return createResolutionResult({
      ok: true,
      status: WORKSPACE_RESOLUTION_STATUSES.resolved,
      reason: ONBOARDING_REQUIRED_REASONS.none,
      profile,
      user,
      memberships,
      activeMemberships,
      pendingMemberships,
      suspendedMemberships,
      requestedWorkspaceId,
      storedWorkspaceId,
    })
  }

  const selectedMembership = selectMembership(activeMemberships, { requestedWorkspaceId, storedWorkspaceId })
  const preferenceReason = getWorkspacePreferenceReason({
    requestedWorkspaceId,
    storedWorkspaceId,
    selectedMembership,
    activeMemberships,
  })

  if (!activeMemberships.length) {
    return createResolutionResult({
      ok: false,
      status: pendingMemberships.length ? WORKSPACE_RESOLUTION_STATUSES.pendingApproval : suspendedMemberships.length ? WORKSPACE_RESOLUTION_STATUSES.blocked : WORKSPACE_RESOLUTION_STATUSES.membershipRequired,
      reason: pendingMemberships.length ? ONBOARDING_REQUIRED_REASONS.pendingApproval : ONBOARDING_REQUIRED_REASONS.noActiveMembership,
      profile,
      user: userEmail ? { ...user, email: userEmail } : user,
      memberships,
      activeMemberships,
      pendingMemberships,
      suspendedMemberships,
      requestedWorkspaceId,
      storedWorkspaceId,
      warnings: suspendedMemberships.length ? ['only_blocked_memberships'] : [],
    })
  }

  if (!selectedMembership?.workspace) {
    return createResolutionResult({
      ok: false,
      status: WORKSPACE_RESOLUTION_STATUSES.workspaceMissing,
      reason: ONBOARDING_REQUIRED_REASONS.workspaceMissing,
      profile,
      user,
      memberships,
      activeMemberships,
      pendingMemberships,
      suspendedMemberships,
      requestedWorkspaceId,
      storedWorkspaceId,
      warnings: ['active_membership_without_workspace'],
    })
  }

  return createResolutionResult({
    ok: true,
    status: WORKSPACE_RESOLUTION_STATUSES.resolved,
    reason: ONBOARDING_REQUIRED_REASONS.none,
    profile,
    user,
    memberships,
    activeMemberships,
    pendingMemberships,
    suspendedMemberships,
    currentMembership: selectedMembership,
    requestedWorkspaceId,
    storedWorkspaceId,
    warnings: preferenceReason.endsWith('_invalid') ? [preferenceReason] : [],
  })
}

function requireClient(client = null) {
  const resolvedClient = client || supabase
  if (!isSupabaseConfigured || !resolvedClient) {
    throw new Error('Supabase is required for workspace resolution.')
  }
  return resolvedClient
}

async function fetchServerWorkspacePreference(client, userId) {
  const result = await client
    .from('user_workspace_preferences')
    .select('active_workspace_id, active_workspace_source, updated_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (result.error) {
    if (isMissingTableError(result.error, 'user_workspace_preferences')) return { workspaceId: '', missingSchema: true }
    throw result.error
  }

  return {
    workspaceId: normalizeText(result.data?.active_workspace_id),
    source: result.data?.active_workspace_source || '',
    updatedAt: result.data?.updated_at || null,
    missingSchema: false,
  }
}

export async function setActiveWorkspacePreference(userId, workspaceId, options = {}) {
  const client = requireClient(options.client)
  const safeUserId = normalizeText(userId)
  const safeWorkspaceId = normalizeText(workspaceId)
  if (!safeUserId) throw new Error('User id is required before setting active workspace preference.')
  if (!safeWorkspaceId) throw new Error('Workspace id is required before setting active workspace preference.')

  const validation = await resolveCurrentWorkspace(safeUserId, {
    client,
    user: options.user || null,
    profile: options.profile || null,
    requestedWorkspaceId: safeWorkspaceId,
    persistPreference: false,
  })

  if (!validation.ok || validation.currentWorkspace?.id !== safeWorkspaceId) {
    throw new Error('Workspace switch denied because the user does not have an active membership in that workspace.')
  }

  const result = await client
    .from('user_workspace_preferences')
    .upsert(
      {
        user_id: safeUserId,
        active_workspace_id: safeWorkspaceId,
        active_workspace_source: options.source || 'user_selected',
      },
      { onConflict: 'user_id' },
    )
    .select('user_id, active_workspace_id, active_workspace_source, updated_at')
    .single()

  if (result.error) {
    if (isMissingTableError(result.error, 'user_workspace_preferences')) {
      throw new Error('Workspace preference storage is missing. Apply the workspace resolution migration.')
    }
    throw result.error
  }

  return result.data
}

async function fetchOrganisationMembershipRows(client, user, profile) {
  const userId = normalizeText(user?.id)
  const userEmail = normalizeEmail(user?.email || profile?.email)
  const byUserId = await client
    .from('organisation_users')
    .select('id, organisation_id, user_id, branch_id, first_name, last_name, email, role, organisation_role, app_role, workspace_type, status, invited_by_user_id, invited_at, joined_at, accepted_at, last_active_at, created_at, updated_at')
    .eq('user_id', userId)

  if (byUserId.error) {
    if (isRecoverableSchemaError(byUserId.error, 'organisation_users', 'organisation_id')) return []
    throw byUserId.error
  }

  let invitedRows = []
  if (userEmail) {
    const byEmail = await client
      .from('organisation_users')
      .select('id, organisation_id, user_id, branch_id, first_name, last_name, email, role, organisation_role, app_role, workspace_type, status, invited_by_user_id, invited_at, joined_at, accepted_at, last_active_at, created_at, updated_at')
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
  return [...rowsById.values()]
}

async function fetchOrganisationRows(client, organisationIds = []) {
  const ids = Array.from(new Set(organisationIds.map((id) => normalizeText(id)).filter(Boolean)))
  if (!ids.length) return []

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
    if (isMissingTableError(query.error, 'organisations')) return []
    throw query.error
  }

  return query.data || []
}

async function fetchAttorneyMembershipRows(client, user, profile) {
  const profileFirmId = normalizeText(profile?.primaryAttorneyFirmId || profile?.primary_attorney_firm_id)
  const query = await client
    .from('attorney_firm_members')
    .select('id, firm_id, user_id, department_id, role, status, invited_by, joined_at, created_at, updated_at')
    .eq('user_id', user.id)

  if (query.error) {
    if (isMissingTableError(query.error, 'attorney_firm_members')) return []
    throw query.error
  }

  const rows = query.data || []
  const hasProfileFirm = profileFirmId && rows.some((row) => row.firm_id === profileFirmId)
  if (!profileFirmId || hasProfileFirm) return rows

  return [
    ...rows,
    {
      id: `attorney-profile-primary-${profileFirmId}-${user.id}`,
      firm_id: profileFirmId,
      user_id: user.id,
      role: 'attorney',
      status: MEMBERSHIP_STATUSES.pending,
      department_id: null,
      joined_at: null,
    },
  ]
}

async function fetchAttorneyFirmRows(client, firmIds = []) {
  const ids = Array.from(new Set(firmIds.map((id) => normalizeText(id)).filter(Boolean)))
  if (!ids.length) return []

  const query = await client
    .from('attorney_firms')
    .select('id, name, email, phone, created_by, is_active')
    .in('id', ids)

  if (query.error) {
    if (isMissingTableError(query.error, 'attorney_firms')) return []
    throw query.error
  }
  return query.data || []
}

export async function resolveCurrentWorkspace(userId, options = {}) {
  const client = requireClient(options.client)
  const safeUserId = normalizeText(userId)
  if (!safeUserId) {
    return buildWorkspaceResolution({ user: null, profile: null })
  }

  let user = options.user || null
  if (!user?.id && client.auth?.getUser) {
    const userResult = await client.auth.getUser()
    if (userResult.error) throw userResult.error
    user = userResult.data?.user || null
  }
  if (!user?.id) user = { id: safeUserId, email: options.email || '' }

  const profile = normalizeProfile(options.profile || await getOrCreateUserProfile({ user }))
  const preference = options.storedWorkspaceId
    ? { workspaceId: normalizeText(options.storedWorkspaceId), missingSchema: false }
    : await fetchServerWorkspacePreference(client, safeUserId)

  const [organisationMembershipRows, attorneyMembershipRows] = await Promise.all([
    fetchOrganisationMembershipRows(client, user, profile),
    fetchAttorneyMembershipRows(client, user, profile),
  ])
  const [organisationRows, attorneyFirmRows] = await Promise.all([
    fetchOrganisationRows(client, organisationMembershipRows.map((row) => row.organisation_id)),
    fetchAttorneyFirmRows(client, attorneyMembershipRows.map((row) => row.firm_id)),
  ])

  const resolution = buildWorkspaceResolution({
    user,
    profile,
    organisationMembershipRows,
    organisationRows,
    attorneyMembershipRows,
    attorneyFirmRows,
    requestedWorkspaceId: options.requestedWorkspaceId,
    storedWorkspaceId: preference.workspaceId,
  })

  if (preference.missingSchema) {
    resolution.diagnostics.warnings = [...(resolution.diagnostics.warnings || []), 'workspace_preference_schema_missing']
  }

  if (resolution.ok && resolution.currentWorkspace?.id && options.persistPreference !== false && !preference.missingSchema) {
    const shouldPersist =
      normalizeText(options.requestedWorkspaceId) ||
      !preference.workspaceId ||
      preference.workspaceId !== resolution.currentWorkspace.id

    if (shouldPersist) {
      await client
        .from('user_workspace_preferences')
        .upsert(
          {
            user_id: safeUserId,
            active_workspace_id: resolution.currentWorkspace.id,
            active_workspace_source: normalizeText(options.requestedWorkspaceId) ? 'user_selected' : 'auth_boot',
          },
          { onConflict: 'user_id' },
        )
    }
  }

  return resolution
}

export class WorkspaceResolutionError extends Error {
  constructor(message, diagnostics = {}) {
    super(message)
    this.name = 'WorkspaceResolutionError'
    this.code = 'WORKSPACE_CONTEXT_REQUIRED'
    this.diagnostics = diagnostics
  }
}

export function assertResolvedWorkspaceContext(context = {}, options = {}) {
  const workspaceId = normalizeText(
    context.workspaceId ||
      context.organisationId ||
      context.currentWorkspace?.id ||
      context.currentMembership?.workspaceId ||
      context.authState?.currentWorkspace?.id,
  )
  const membership = context.currentMembership || context.authState?.currentMembership || null
  const appRole = normalizeCanonicalAppRole(context.appRole || context.role || context.profile?.role || context.authState?.appRole, '')

  if (appRole === APP_ROLES.client || appRole === APP_ROLES.platformAdmin) {
    return { workspaceId, appRole }
  }

  if (!workspaceId || workspaceId === 'default' || workspaceId === 'all') {
    throw new WorkspaceResolutionError(options.message || 'A resolved workspace context is required before loading professional data.', {
      reason: 'missing_workspace_id',
      workspaceId: workspaceId || null,
      service: options.service || '',
    })
  }

  if (membership?.id && !isActiveMembershipStatus(membership.status)) {
    throw new WorkspaceResolutionError(options.message || 'Active workspace membership is required before loading professional data.', {
      reason: 'inactive_membership',
      workspaceId,
      membershipId: membership.id,
      membershipStatus: membership.status,
      service: options.service || '',
    })
  }

  return { workspaceId, appRole, membership }
}

export const __workspaceResolutionTestUtils = Object.freeze({
  buildWorkspaceResolution,
  selectMembership,
  sortMemberships,
  getPermissionMapForMembership,
})
