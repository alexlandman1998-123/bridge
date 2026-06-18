import { APP_ROLES, isCanonicalAppRole, normalizeCanonicalAppRole } from '../../constants/appRoles'
import { MEMBERSHIP_STATUSES } from '../../constants/membershipStatuses'
import { ONBOARDING_REQUIRED_REASONS } from '../../constants/onboardingStatuses'
import { ORG_ROLES } from '../../constants/orgRoles'
import { WORKSPACE_TYPES, inferWorkspaceTypeFromAppRole, normalizeWorkspaceType } from '../../constants/workspaceTypes'
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'
import { resolveSystemRole, resolveWorkspaceRole } from '../roleResolutionService'

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is required for onboarding validation.')
  }
  return supabase
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

const COMMERCIAL_MODULE_MARKERS = new Set(['commercial', 'commercial_brokerage', 'commercial_agency'])

function getMembershipMetadata(membership = {}) {
  return membership?.module_metadata && typeof membership.module_metadata === 'object'
    ? membership.module_metadata
    : membership?.moduleMetadata && typeof membership.moduleMetadata === 'object'
      ? membership.moduleMetadata
      : membership?.metadata && typeof membership.metadata === 'object'
        ? membership.metadata
        : {}
}

function hasCommercialMembershipMarker(membership = {}) {
  const metadata = getMembershipMetadata(membership)
  const moduleContext = normalizeKey(
    membership.module_context ||
      membership.moduleContext ||
      membership.module ||
      membership.module_type ||
      metadata.module_context ||
      metadata.moduleContext ||
      metadata.module ||
      metadata.module_type,
  )
  if (COMMERCIAL_MODULE_MARKERS.has(moduleContext)) return true

  const commercialRole = normalizeKey(
    metadata.commercial_role ||
      metadata.commercialRole ||
      metadata.role_label ||
      metadata.roleLabel,
  )
  if (commercialRole.startsWith('commercial_') || commercialRole === 'broker' || commercialRole === 'commercial_broker') return true

  const role = normalizeKey(
    membership.workspace_role ||
      membership.workspaceRole ||
      membership.organisation_role ||
      membership.organisationRole ||
      membership.role,
  )
  return role.startsWith('commercial_') || role.includes('commercial_broker')
}

function isMissingSchemaError(error, token = '') {
  if (!error) return false
  const code = String(error.code || '').toLowerCase()
  const message = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase()
  return code === '42p01' || code === '42703' || code === 'pgrst204' || code === 'pgrst205' || message.includes(token.toLowerCase())
}

async function loadProfile(client, userId) {
  const result = await client
    .from('profiles')
    .select('id, email, first_name, last_name, full_name, role, system_role, onboarding_completed, primary_attorney_firm_id, attorney_role')
    .eq('id', userId)
    .maybeSingle()

  if (result.error) {
    if (isMissingSchemaError(result.error, 'primary_attorney_firm_id') || isMissingSchemaError(result.error, 'system_role')) {
      const fallback = await client
        .from('profiles')
        .select('id, email, first_name, last_name, full_name, role, onboarding_completed')
        .eq('id', userId)
        .maybeSingle()
      if (fallback.error) throw fallback.error
      return fallback.data ? { ...fallback.data, systemRole: resolveSystemRole(fallback.data) } : null
    }
    throw result.error
  }
  return result.data ? { ...result.data, systemRole: resolveSystemRole(result.data) } : null
}

async function validateSettings(client, workspaceId, workspaceType) {
  if (!workspaceId) return { ok: false, reason: ONBOARDING_REQUIRED_REASONS.workspaceMissing }
  if (workspaceType === WORKSPACE_TYPES.attorneyFirm) return { ok: true }

  const result = await client
    .from('organisation_settings')
    .select('organisation_id')
    .eq('organisation_id', workspaceId)
    .maybeSingle()

  if (result.error) {
    if (isMissingSchemaError(result.error, 'organisation_settings')) return { ok: false, reason: ONBOARDING_REQUIRED_REASONS.missingSettings }
    throw result.error
  }
  return result.data?.organisation_id ? { ok: true } : { ok: false, reason: ONBOARDING_REQUIRED_REASONS.missingSettings }
}

async function validateBranch(client, workspaceId) {
  const result = await client
    .from('organisation_branches')
    .select('id')
    .eq('organisation_id', workspaceId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (result.error) {
    if (isMissingSchemaError(result.error, 'organisation_branches')) return { ok: false, reason: ONBOARDING_REQUIRED_REASONS.missingBranch }
    throw result.error
  }
  return result.data?.id ? { ok: true, branchId: result.data.id } : { ok: false, reason: ONBOARDING_REQUIRED_REASONS.missingBranch }
}

async function validateAttorneyDepartment(client, firmId) {
  const result = await client
    .from('attorney_firm_departments')
    .select('id')
    .eq('firm_id', firmId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (result.error) {
    if (isMissingSchemaError(result.error, 'attorney_firm_departments')) return { ok: true, skipped: true }
    throw result.error
  }
  return result.data?.id ? { ok: true, departmentId: result.data.id } : { ok: false, reason: ONBOARDING_REQUIRED_REASONS.missingDepartment }
}

async function validateAttorneyCompletion(client, { userId, appRole, workspaceId }) {
  const query = client
    .from('attorney_firm_members')
    .select('id, firm_id, user_id, department_id, role, status, attorney_firms:firm_id(id, name, is_active)')
    .eq('user_id', userId)
    .eq('status', MEMBERSHIP_STATUSES.active)

  if (workspaceId) query.eq('firm_id', workspaceId)
  const result = await query.limit(10)
  if (result.error) {
    if (isMissingSchemaError(result.error, 'attorney_firm_members')) {
      return { ok: false, reason: ONBOARDING_REQUIRED_REASONS.noActiveMembership }
    }
    throw result.error
  }

  const membership = (result.data || []).find((row) => row.attorney_firms?.id) || result.data?.[0] || null
  if (!membership?.id) return { ok: false, reason: ONBOARDING_REQUIRED_REASONS.noActiveMembership }
  if (!membership.attorney_firms?.id) return { ok: false, reason: ONBOARDING_REQUIRED_REASONS.workspaceMissing }

  const department = await validateAttorneyDepartment(client, membership.firm_id)
  if (!department.ok) return { ok: false, reason: department.reason, membership, workspaceId: membership.firm_id }

  return {
    ok: true,
    reason: '',
    appRole,
    workspaceType: WORKSPACE_TYPES.attorneyFirm,
    workspaceId: membership.firm_id,
    membership,
    requiredRecords: ['profile', 'attorney_firm', 'active_membership'],
    missingRecords: [],
  }
}

async function validateOrganisationCompletion(client, { userId, appRole, workspaceType, workspaceId }) {
  let query = client
    .from('organisation_users')
    .select('id, organisation_id, user_id, branch_id, role, workspace_role, organisation_role, status, app_role, workspace_type, module_context, module_metadata, organisations:organisation_id(id, name, display_name, type)')
    .eq('user_id', userId)
    .eq('status', MEMBERSHIP_STATUSES.active)

  if (workspaceId) query.eq('organisation_id', workspaceId)
  let result = await query.limit(20)
  if (
    result.error &&
    (isMissingSchemaError(result.error, 'workspace_role') ||
      isMissingSchemaError(result.error, 'module_context') ||
      isMissingSchemaError(result.error, 'module_metadata'))
  ) {
    query = client
      .from('organisation_users')
      .select('id, organisation_id, user_id, branch_id, role, organisation_role, status, app_role, workspace_type, organisations:organisation_id(id, name, display_name, type)')
      .eq('user_id', userId)
      .eq('status', MEMBERSHIP_STATUSES.active)
    if (workspaceId) query.eq('organisation_id', workspaceId)
    result = await query.limit(20)
  }
  if (result.error) {
    if (isMissingSchemaError(result.error, 'organisation_users')) {
      return { ok: false, reason: ONBOARDING_REQUIRED_REASONS.noActiveMembership }
    }
    throw result.error
  }

  const activeRows = result.data || []
  const membership = activeRows.find((row) => {
    const rowType = normalizeWorkspaceType(row.organisations?.type || row.workspace_type, inferWorkspaceTypeFromAppRole(appRole))
    return !workspaceType || rowType === workspaceType
  })
  if (!membership?.id) return { ok: false, reason: ONBOARDING_REQUIRED_REASONS.noActiveMembership }

  const resolvedWorkspaceType = normalizeWorkspaceType(
    membership.organisations?.type || membership.workspace_type,
    workspaceType || inferWorkspaceTypeFromAppRole(appRole),
  )
  if (!membership.organisations?.id) {
    return { ok: false, reason: ONBOARDING_REQUIRED_REASONS.workspaceMissing, membership }
  }

  const organisationRole = resolveWorkspaceRole(membership, { appRole, workspaceType: resolvedWorkspaceType })
  const missingRecords = []
  const isCommercialMembership = resolvedWorkspaceType === WORKSPACE_TYPES.agency && hasCommercialMembershipMarker(membership)

  if ([WORKSPACE_TYPES.agency, WORKSPACE_TYPES.attorneyFirm, WORKSPACE_TYPES.bondOriginator].includes(resolvedWorkspaceType) && !isCommercialMembership) {
    const branch = await validateBranch(client, membership.organisation_id)
    if (!branch.ok) missingRecords.push('default_branch')
  }

  if (resolvedWorkspaceType === WORKSPACE_TYPES.agency && !isCommercialMembership) {
    const settings = await validateSettings(client, membership.organisation_id, resolvedWorkspaceType)
    if (!settings.ok) missingRecords.push('agency_settings')
  }

  if ([WORKSPACE_TYPES.developerCompany, WORKSPACE_TYPES.bondOriginator].includes(resolvedWorkspaceType)) {
    const settings = await validateSettings(client, membership.organisation_id, resolvedWorkspaceType)
    if (!settings.ok) missingRecords.push('workspace_settings')
  }

  const requiresAssignment =
    [WORKSPACE_TYPES.agency, WORKSPACE_TYPES.attorneyFirm, WORKSPACE_TYPES.bondOriginator].includes(resolvedWorkspaceType) &&
    !isCommercialMembership &&
    ![ORG_ROLES.owner, ORG_ROLES.principal, ORG_ROLES.director, ORG_ROLES.partner].includes(organisationRole)
  if (requiresAssignment && !membership.branch_id) missingRecords.push('branch_assignment')

  if (missingRecords.length) {
    return {
      ok: false,
      reason: missingRecords.includes('branch_assignment') ? ONBOARDING_REQUIRED_REASONS.missingBranch : ONBOARDING_REQUIRED_REASONS.missingSettings,
      membership,
      workspaceId: membership.organisation_id,
      workspaceType: resolvedWorkspaceType,
      missingRecords,
    }
  }

  return {
    ok: true,
    reason: '',
    appRole,
    workspaceType: resolvedWorkspaceType,
    workspaceId: membership.organisation_id,
    membership,
    requiredRecords: ['profile', 'workspace', 'active_membership'],
    missingRecords: [],
  }
}

export async function validateOnboardingCompletion(userId, options = {}) {
  const id = normalizeText(userId)
  if (!id) return { ok: false, reason: 'missing_user', missingRecords: ['user'] }

  const client = requireClient()
  const profile = await loadProfile(client, id)
  if (!profile?.id) return { ok: false, reason: ONBOARDING_REQUIRED_REASONS.noProfile, missingRecords: ['profile'] }

  const appRole = normalizeCanonicalAppRole(options.appRole || options.app_role || profile.role, '')
  if (!isCanonicalAppRole(appRole)) {
    return { ok: false, reason: ONBOARDING_REQUIRED_REASONS.appRoleMissing, profile, missingRecords: ['app_role'] }
  }

  if (appRole === APP_ROLES.client) {
    return profile.onboarding_completed || options.clientAccessValidated
      ? { ok: true, reason: '', profile, appRole, workspaceType: '', requiredRecords: ['profile', 'client_access'], missingRecords: [] }
      : { ok: false, reason: ONBOARDING_REQUIRED_REASONS.onboardingIncomplete, profile, missingRecords: ['client_access'] }
  }

  const workspaceType = normalizeWorkspaceType(options.workspaceType || options.workspace_type, inferWorkspaceTypeFromAppRole(appRole))
  const workspaceId = normalizeText(options.workspaceId || options.workspace_id)

  const validation =
    appRole === APP_ROLES.attorney || workspaceType === WORKSPACE_TYPES.attorneyFirm
      ? await validateAttorneyCompletion(client, { userId: id, appRole, workspaceId })
      : await validateOrganisationCompletion(client, { userId: id, appRole, workspaceType, workspaceId })

  return {
    ...validation,
    profile,
    appRole,
  }
}
