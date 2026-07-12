import { APP_ROLES, isCanonicalAppRole, normalizeCanonicalAppRole } from '../constants/appRoles'
import { MEMBERSHIP_STATUSES, isActiveMembershipStatus, normalizeMembershipStatus } from '../constants/membershipStatuses'
import { ONBOARDING_REQUIRED_REASONS } from '../constants/onboardingStatuses'
import { getDefaultBranchScope, normalizeBranchScope } from '../constants/workspaceUnits'
import { WORKSPACE_TYPES, inferWorkspaceTypeFromAppRole, normalizeWorkspaceType } from '../constants/workspaceTypes'
import { permissionsByWorkspaceRole } from '../auth/permissions/permissionRegistry'
import { getOrCreateUserProfile } from '../lib/profileApi'
import { getUnsafeFallbackEnvironmentDiagnostics } from '../lib/envValidation'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { isCommercialBrokerMember } from '../lib/commercialAccess'
import { resolveSystemRole, resolveWorkspaceRole } from './roleResolutionService'

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

const INVALID_SERVICE_WORKSPACE_IDS = new Set([
  'default',
  'all',
  'all_workspace',
  'all-workspace',
  'all branches',
  'all_branches',
  'agency-default',
  'bridge-workspace',
  'demo',
  'demo-workspace',
  'mock',
  'mock-workspace',
  'local',
  'local-workspace',
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
    systemRole: resolveSystemRole(profile),
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
    workspaceKind: normalizeText(row.workspace_kind || row.workspaceKind),
    name: normalizeText(row.display_name || row.name) || 'Workspace',
    legalName: normalizeText(row.legal_name || row.name),
    email: normalizeEmail(row.company_email || row.support_email),
    phone: normalizeText(row.company_phone || row.support_phone),
    raw: row,
  }
}

function normalizeAttorneyFirmRow(row = null) {
  if (!row) return null
  const logoUrl = normalizeText(row.logo_url || row.logoUrl)
  const logoIconUrl = normalizeText(row.logo_icon_url || row.logoIconUrl)
  return {
    id: row.id,
    type: WORKSPACE_TYPES.attorneyFirm,
    name: normalizeText(row.name) || 'Attorney Firm',
    legalName: normalizeText(row.name),
    email: normalizeEmail(row.email),
    phone: normalizeText(row.phone),
    logoUrl,
    logo_url: logoUrl || null,
    logoIconUrl,
    logo_icon_url: logoIconUrl || null,
    primaryColour: normalizeText(row.primary_colour || row.primaryColour),
    secondaryColour: normalizeText(row.secondary_colour || row.secondaryColour),
    organisationId: normalizeText(row.organisation_id || row.organisationId),
    organisation_id: normalizeText(row.organisation_id || row.organisationId) || null,
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
  primaryBranchId = null,
  branchScope = '',
  departmentId = null,
  teamId = null,
  regionId = null,
  workspaceUnitId = null,
  scopeLevel = '',
  scopeMetadata = null,
  moduleContext = '',
  moduleMetadata = null,
  isPrimaryOwner = false,
  activeWorkspaceSelectedAt = null,
  invitedBy = null,
  joinedAt = null,
  acceptedAt = null,
  raw = null,
}) {
  const normalizedWorkspaceType = normalizeWorkspaceType(workspaceType, inferWorkspaceTypeFromAppRole(appRole))
  const normalizedStatus = normalizeMembershipStatus(status)
  const workspaceRole = resolveWorkspaceRole(
    { workspace_role: role, role, app_role: appRole, workspace_type: normalizedWorkspaceType },
    { appRole, workspaceType: normalizedWorkspaceType },
  )
  const resolvedBranchScope = normalizeBranchScope(branchScope, getDefaultBranchScope(workspaceRole, { appRole, workspaceType: normalizedWorkspaceType }))
  const resolvedBranchId = branchId || primaryBranchId || null
  const resolvedWorkspace = workspace || null
  const resolvedWorkspaceId = normalizeText(workspaceId || resolvedWorkspace?.id)
  return {
    id,
    source,
    userId,
    workspaceId: resolvedWorkspaceId || null,
    workspace_id: resolvedWorkspaceId || null,
    workspace: resolvedWorkspace,
    workspaceType: normalizedWorkspaceType,
    appRole: normalizeCanonicalAppRole(appRole, ''),
    role: workspaceRole,
    workspaceRole,
    rawRole: normalizeText(role).toLowerCase(),
    status: normalizedStatus,
    isActive: isActiveMembershipStatus(normalizedStatus),
    branchId: resolvedBranchId,
    primaryBranchId: primaryBranchId || resolvedBranchId,
    branchScope: resolvedBranchScope,
    departmentId,
    teamId,
    regionId,
    workspaceUnitId,
    scopeLevel,
    scopeMetadata,
    moduleContext: normalizeText(moduleContext),
    module_context: normalizeText(moduleContext),
    moduleMetadata: moduleMetadata && typeof moduleMetadata === 'object' ? moduleMetadata : {},
    module_metadata: moduleMetadata && typeof moduleMetadata === 'object' ? moduleMetadata : {},
    isPrimaryOwner: Boolean(isPrimaryOwner),
    activeWorkspaceSelectedAt,
    invitedBy,
    joinedAt,
    acceptedAt,
    raw,
  }
}

function sortMemberships(left, right) {
  if (left.workspace && !right.workspace) return -1
  if (!left.workspace && right.workspace) return 1
  const leftKey = `${left.workspaceType || ''}:${left.workspace?.name || ''}:${getMembershipWorkspaceId(left) || ''}:${left.id || ''}`
  const rightKey = `${right.workspaceType || ''}:${right.workspace?.name || ''}:${getMembershipWorkspaceId(right) || ''}:${right.id || ''}`
  return leftKey.localeCompare(rightKey)
}

function getMembershipWorkspaceId(membership = null) {
  return normalizeText(
    membership?.workspaceId ||
      membership?.workspace_id ||
      membership?.workspace?.id ||
      membership?.raw?.workspace_id ||
      membership?.raw?.organisation_id ||
      membership?.raw?.organization_id ||
      membership?.raw?.firm_id,
  )
}

function membershipMatchesWorkspaceId(membership = null, workspaceId = '') {
  const resolvedWorkspaceId = getMembershipWorkspaceId(membership)
  const requestedWorkspaceId = normalizeText(workspaceId)
  return Boolean(requestedWorkspaceId && (resolvedWorkspaceId === requestedWorkspaceId || membership?.id === requestedWorkspaceId))
}

function getWorkspacePreferenceReason({
  requestedWorkspaceId = '',
  storedWorkspaceId = '',
  selectedMembership = null,
  activeMemberships = [],
}) {
  const requested = normalizeText(requestedWorkspaceId)
  const stored = normalizeText(storedWorkspaceId)
  if (requested && membershipMatchesWorkspaceId(selectedMembership, requested)) return 'requested_workspace'
  if (stored && membershipMatchesWorkspaceId(selectedMembership, stored)) return 'stored_preference'
  if (requested && !activeMemberships.some((membership) => membershipMatchesWorkspaceId(membership, requested))) {
    return 'requested_workspace_invalid'
  }
  if (stored && !activeMemberships.some((membership) => membershipMatchesWorkspaceId(membership, stored))) {
    return 'stored_preference_invalid'
  }
  return selectedMembership ? 'first_active_membership' : 'none'
}

function selectMembership(activeMemberships = [], { requestedWorkspaceId = '', storedWorkspaceId = '' } = {}) {
  const requested = normalizeText(requestedWorkspaceId)
  if (requested) {
    const selected = activeMemberships.find((membership) => membership.workspace && membershipMatchesWorkspaceId(membership, requested))
    if (selected) return selected
  }

  const stored = normalizeText(storedWorkspaceId)
  if (stored) {
    const selected = activeMemberships.find((membership) => membership.workspace && membershipMatchesWorkspaceId(membership, stored))
    if (selected) return selected
  }

  const commercialBrokerMembership = activeMemberships.find((membership) => membership.workspace && isCommercialBrokerMember(membership))
  if (commercialBrokerMembership) return commercialBrokerMembership

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
    systemRole: profile?.systemRole || '',
    requestedWorkspaceId: normalizeText(requestedWorkspaceId) || null,
    storedWorkspaceId: normalizeText(storedWorkspaceId) || null,
    currentWorkspaceId: getMembershipWorkspaceId(currentMembership) || null,
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
  const workspaceRole = currentMembership ? resolveWorkspaceRole(currentMembership, { appRole: profile?.role, workspaceType }) : ''
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

  const organisationMemberships = (organisationMembershipRows || []).filter(Boolean).map((row) => {
    const workspace = organisationById.get(row.organisation_id) || normalizeOrganisationRow(row.organisations, { appRole })
    return createMembershipRecord({
      id: row.id,
      source: row.source_table || 'organisation_users',
      userId: row.user_id || null,
      workspaceId: row.organisation_id || null,
      workspace,
      workspaceType: row.workspace_type || workspace?.type || inferWorkspaceTypeFromAppRole(appRole),
      appRole: row.app_role || appRole,
      role: row.workspace_role || row.organisation_role || row.organization_role || row.role,
      status: row.status || row.membership_status,
      branchId: row.branch_id || null,
      primaryBranchId: row.primary_branch_id || row.branch_id || null,
      branchScope: row.branch_scope || null,
      regionId: row.region_id || null,
      workspaceUnitId: row.workspace_unit_id || null,
      scopeLevel: row.scope_level || '',
      scopeMetadata: row.scope_metadata || null,
      moduleContext: row.module_context || '',
      moduleMetadata: row.module_metadata || null,
      isPrimaryOwner: Boolean(row.is_primary_owner),
      activeWorkspaceSelectedAt: row.active_workspace_selected_at || null,
      teamId: row.team_id || null,
      departmentId: row.department_id || null,
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
      branchId: row.branch_id || null,
      primaryBranchId: row.primary_branch_id || row.branch_id || null,
      branchScope: row.branch_scope || null,
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
  const membershipSelect =
    'id, organisation_id, user_id, branch_id, primary_branch_id, branch_scope, region_id, workspace_unit_id, scope_level, scope_metadata, module_context, module_metadata, is_primary_owner, active_workspace_selected_at, department_id, team_id, first_name, last_name, email, role, workspace_role, organisation_role, app_role, workspace_type, status, invited_by_user_id, invited_at, joined_at, accepted_at, last_active_at, created_at, updated_at'
  const fallbackSelect = 'id, organisation_id, user_id, branch_id, first_name, last_name, email, role, organisation_role, app_role, workspace_type, status, invited_by_user_id, invited_at, joined_at, accepted_at, last_active_at, created_at, updated_at'
  const currentMembershipSelect = 'id, organization_id, user_id, organization_role, membership_status, created_at, updated_at'
  let byUserId = await client
    .from('organisation_users')
    .select(membershipSelect)
    .eq('user_id', userId)

  if (byUserId.error) {
    if (
      isMissingColumnError(byUserId.error, 'branch_scope') ||
      isMissingColumnError(byUserId.error, 'primary_branch_id') ||
      isMissingColumnError(byUserId.error, 'workspace_role') ||
      isMissingColumnError(byUserId.error, 'scope_level') ||
      isMissingColumnError(byUserId.error, 'region_id') ||
      isMissingColumnError(byUserId.error, 'workspace_unit_id') ||
      isMissingColumnError(byUserId.error, 'scope_metadata') ||
      isMissingColumnError(byUserId.error, 'module_context') ||
      isMissingColumnError(byUserId.error, 'module_metadata') ||
      isMissingColumnError(byUserId.error, 'is_primary_owner') ||
      isMissingColumnError(byUserId.error, 'active_workspace_selected_at')
    ) {
      byUserId = await client
        .from('organisation_users')
        .select(fallbackSelect)
        .eq('user_id', userId)
    }
  }

  if (byUserId.error) {
    if (isRecoverableSchemaError(byUserId.error, 'organisation_users', 'organisation_id')) return []
    throw byUserId.error
  }

  let invitedRows = []
  if (userEmail) {
    let byEmail = await client
      .from('organisation_users')
      .select(membershipSelect)
      .eq('email', userEmail)
      .in('status', [MEMBERSHIP_STATUSES.invited, MEMBERSHIP_STATUSES.pending])

    if (
      byEmail.error &&
      (isMissingColumnError(byEmail.error, 'branch_scope') ||
        isMissingColumnError(byEmail.error, 'primary_branch_id') ||
        isMissingColumnError(byEmail.error, 'workspace_role') ||
        isMissingColumnError(byEmail.error, 'scope_level') ||
        isMissingColumnError(byEmail.error, 'region_id') ||
        isMissingColumnError(byEmail.error, 'workspace_unit_id') ||
        isMissingColumnError(byEmail.error, 'scope_metadata') ||
        isMissingColumnError(byEmail.error, 'module_context') ||
        isMissingColumnError(byEmail.error, 'module_metadata') ||
        isMissingColumnError(byEmail.error, 'is_primary_owner') ||
        isMissingColumnError(byEmail.error, 'active_workspace_selected_at'))
    ) {
      byEmail = await client
        .from('organisation_users')
        .select(fallbackSelect)
        .eq('email', userEmail)
        .in('status', [MEMBERSHIP_STATUSES.invited, MEMBERSHIP_STATUSES.pending])
    }

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

  const currentSchemaRows = await client
    .from('organization_members')
    .select(currentMembershipSelect)
    .eq('user_id', userId)

  if (!currentSchemaRows.error) {
    for (const row of currentSchemaRows.data || []) {
      if (!row?.id || rowsById.has(row.id)) continue
      rowsById.set(row.id, {
        id: row.id,
        organisation_id: row.organization_id,
        organization_id: row.organization_id,
        user_id: row.user_id,
        role: row.organization_role,
        organisation_role: row.organization_role,
        organization_role: row.organization_role,
        status: row.membership_status,
        membership_status: row.membership_status,
        created_at: row.created_at,
        updated_at: row.updated_at,
        source_table: 'organization_members',
        raw: row,
      })
    }
  } else if (!isRecoverableSchemaError(currentSchemaRows.error, 'organization_members', 'organization_id')) {
    throw currentSchemaRows.error
  }

  return [...rowsById.values()]
}

async function fetchOrganisationRows(client, organisationIds = []) {
  const ids = Array.from(new Set(organisationIds.map((id) => normalizeText(id)).filter(Boolean)))
  if (!ids.length) return []

  let query = await client
    .from('organisations')
    .select('id, name, display_name, company_email, company_phone, support_email, support_phone, legal_name, type, workspace_kind')
    .in('id', ids)

  if (query.error && isMissingColumnError(query.error, 'workspace_kind')) {
    query = await client
      .from('organisations')
      .select('id, name, display_name, company_email, company_phone, support_email, support_phone, legal_name, type')
      .in('id', ids)
  }

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
  let query = await client
    .from('attorney_firm_members')
    .select('id, firm_id, user_id, branch_id, primary_branch_id, branch_scope, department_id, role, status, invited_by, joined_at, created_at, updated_at')
    .eq('user_id', user.id)

  if (query.error && (isMissingColumnError(query.error, 'branch_scope') || isMissingColumnError(query.error, 'branch_id') || isMissingColumnError(query.error, 'primary_branch_id'))) {
    query = await client
      .from('attorney_firm_members')
      .select('id, firm_id, user_id, department_id, role, status, invited_by, joined_at, created_at, updated_at')
      .eq('user_id', user.id)
  }

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
    .select('id, organisation_id, name, email, phone, logo_url, primary_colour, secondary_colour, created_by, is_active')
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

export class WorkspaceContextError extends Error {
  constructor(code = 'workspace_context_missing', details = {}) {
    super(code)
    this.name = 'WorkspaceContextError'
    this.code = code
    this.details = details
    this.diagnostics = details
  }
}

function normalizeWorkspaceContextId(value) {
  return normalizeText(value).toLowerCase()
}

function isInvalidServiceWorkspaceId(value) {
  const normalized = normalizeWorkspaceContextId(value)
  return !normalized || INVALID_SERVICE_WORKSPACE_IDS.has(normalized)
}

export function logUnsafeFallbackBlocked({
  userId = '',
  route = '',
  service = '',
  missingContextType = '',
  attemptedFallbackType = '',
  workspaceId = '',
  metadata = {},
} = {}) {
  const event = {
    event: 'unsafe_fallback_blocked',
    user_id: normalizeText(userId) || null,
    route: normalizeText(route) || (typeof window !== 'undefined' ? window.location.pathname : ''),
    service: normalizeText(service),
    missing_context_type: normalizeText(missingContextType),
    attempted_fallback_type: normalizeText(attemptedFallbackType),
    workspace_id: normalizeText(workspaceId) || null,
    environment: getUnsafeFallbackEnvironmentDiagnostics(),
    timestamp: new Date().toISOString(),
    metadata,
  }
  console.warn('[WORKSPACE_CONTEXT] unsafe fallback blocked', event)
  return event
}

export function requireResolvedWorkspaceContext(context = {}, options = {}) {
  const workspaceId = normalizeText(
    context.workspaceId ||
      context.organisationId ||
      context.currentWorkspace?.id ||
      context.currentMembership?.workspaceId ||
      context.authState?.currentWorkspace?.id,
  )
  const membership = context.currentMembership || context.authState?.currentMembership || null
  const workspaceRole = normalizeText(
    context.workspaceRole ||
      context.role ||
      context.currentMembership?.workspaceRole ||
      context.currentMembership?.role ||
      context.authState?.workspaceRole ||
      context.authState?.currentMembership?.workspaceRole ||
      context.authState?.currentMembership?.role,
  )
  const appRole = normalizeCanonicalAppRole(context.appRole || context.profile?.role || context.authState?.appRole, '')
  const service = options.service || context.service || ''

  if (appRole === APP_ROLES.client || appRole === APP_ROLES.platformAdmin) {
    return { workspaceId, appRole, membership, workspaceRole }
  }

  if (isInvalidServiceWorkspaceId(workspaceId)) {
    const code = workspaceId ? 'invalid_service_workspace_context' : 'workspace_context_missing'
    const details = {
      reason: code,
      workspaceId: workspaceId || null,
      service,
      userId: context.userId || context.profile?.id || context.authState?.user?.id || '',
    }
    logUnsafeFallbackBlocked({
      userId: details.userId,
      service,
      missingContextType: 'workspace_id',
      attemptedFallbackType: workspaceId || 'missing_workspace',
      workspaceId,
      metadata: details,
    })
    throw new WorkspaceContextError(code, details)
  }

  if (!membership?.id) {
    const details = {
      reason: 'membership_context_missing',
      workspaceId,
      service,
      userId: context.userId || context.profile?.id || context.authState?.user?.id || '',
    }
    logUnsafeFallbackBlocked({
      userId: details.userId,
      service,
      missingContextType: 'membership_id',
      attemptedFallbackType: 'query_without_membership',
      workspaceId,
      metadata: details,
    })
    throw new WorkspaceContextError('membership_context_missing', details)
  }

  if (!isActiveMembershipStatus(membership.status)) {
    throw new WorkspaceContextError('inactive_membership', {
      workspaceId,
      membershipId: membership.id,
      membershipStatus: membership.status,
      service,
    })
  }

  if (!workspaceRole) {
    throw new WorkspaceContextError('workspace_role_missing', {
      workspaceId,
      membershipId: membership.id,
      service,
    })
  }

  return { workspaceId, appRole, membership, workspaceRole }
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

  if (isInvalidServiceWorkspaceId(workspaceId)) {
    logUnsafeFallbackBlocked({
      userId: context.userId || context.profile?.id || context.authState?.user?.id || '',
      service: options.service || '',
      missingContextType: 'workspace_id',
      attemptedFallbackType: workspaceId || 'missing_workspace',
      workspaceId,
    })
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
