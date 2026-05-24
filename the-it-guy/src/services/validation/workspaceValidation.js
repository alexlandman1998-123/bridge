import { MEMBERSHIP_STATUSES } from '../../constants/membershipStatuses'
import { WORKSPACE_TYPES, normalizeWorkspaceType } from '../../constants/workspaceTypes'
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'
import {
  createIntegrityIssue,
  hasAuthorityMembership,
  INTEGRITY_ISSUES,
  INTEGRITY_SEVERITIES,
  requiresDefaultBranch,
  summarizeIssues,
  validateWorkspaceTypeValue,
} from './integrityChecks'

function requireClient() {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase is required for validation.')
  return supabase
}

function normalizeText(value) {
  return String(value || '').trim()
}

function isMissingSchemaError(error, token = '') {
  const code = String(error?.code || '').toLowerCase()
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return code === '42p01' || code === '42703' || code === 'pgrst204' || code === 'pgrst205' || message.includes(token.toLowerCase())
}

export async function loadWorkspaceForValidation(workspaceId) {
  const id = normalizeText(workspaceId)
  if (!id) return null
  const result = await requireClient()
    .from('organisations')
    .select('id, name, display_name, type, status, created_by')
    .eq('id', id)
    .maybeSingle()

  if (result.error) {
    if (isMissingSchemaError(result.error, 'organisations')) return null
    throw result.error
  }
  return result.data || null
}

async function loadWorkspaceMemberships(workspaceId) {
  const result = await requireClient()
    .from('organisation_users')
    .select('id, organisation_id, user_id, branch_id, role, status, app_role, workspace_type')
    .eq('organisation_id', workspaceId)

  if (result.error) {
    if (isMissingSchemaError(result.error, 'organisation_users')) return []
    throw result.error
  }
  return result.data || []
}

async function hasSettings(workspaceId) {
  const result = await requireClient()
    .from('organisation_settings')
    .select('organisation_id')
    .eq('organisation_id', workspaceId)
    .maybeSingle()
  if (result.error) {
    if (isMissingSchemaError(result.error, 'organisation_settings')) return false
    throw result.error
  }
  return Boolean(result.data?.organisation_id)
}

async function hasDefaultBranch(workspaceId) {
  const result = await requireClient()
    .from('organisation_branches')
    .select('id')
    .eq('organisation_id', workspaceId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()
  if (result.error) {
    if (isMissingSchemaError(result.error, 'organisation_branches')) return false
    throw result.error
  }
  return Boolean(result.data?.id)
}

export async function validateWorkspaceState(workspaceId, options = {}) {
  const workspace = options.workspace || await loadWorkspaceForValidation(workspaceId)
  const issues = []
  if (!workspace?.id) {
    issues.push(createIntegrityIssue({
      code: INTEGRITY_ISSUES.workspaceMissing,
      severity: INTEGRITY_SEVERITIES.critical,
      entityType: 'workspace',
      entityId: workspaceId,
      message: 'Workspace record is missing.',
    }))
    return { entityType: 'workspace', entityId: workspaceId, workspace: null, issues, ...summarizeIssues(issues) }
  }

  issues.push(...validateWorkspaceTypeValue(workspace.type, { id: workspace.id, type: 'workspace' }))
  const workspaceType = normalizeWorkspaceType(workspace.type)
  const memberships = options.memberships || await loadWorkspaceMemberships(workspace.id)
  const activeMemberships = memberships.filter((membership) => membership.status === MEMBERSHIP_STATUSES.active)
  if (!hasAuthorityMembership(activeMemberships)) {
    issues.push(createIntegrityIssue({
      code: INTEGRITY_ISSUES.ownerMissing,
      severity: INTEGRITY_SEVERITIES.critical,
      entityType: 'workspace',
      entityId: workspace.id,
      message: 'Workspace has no active owner, principal, director, partner, or manager membership.',
    }))
  }

  if (![WORKSPACE_TYPES.attorneyFirm].includes(workspaceType) && !(await hasSettings(workspace.id))) {
    issues.push(createIntegrityIssue({
      code: INTEGRITY_ISSUES.settingsMissing,
      severity: INTEGRITY_SEVERITIES.error,
      entityType: 'workspace',
      entityId: workspace.id,
      message: 'Workspace settings/profile record is missing.',
    }))
  }

  if (requiresDefaultBranch(workspaceType) && !(await hasDefaultBranch(workspace.id))) {
    issues.push(createIntegrityIssue({
      code: INTEGRITY_ISSUES.defaultBranchMissing,
      severity: INTEGRITY_SEVERITIES.error,
      entityType: 'workspace',
      entityId: workspace.id,
      message: 'Agency workspace has no active default branch.',
    }))
  }

  return {
    entityType: 'workspace',
    entityId: workspace.id,
    workspace,
    memberships,
    issues,
    ...summarizeIssues(issues),
  }
}

export async function validateAttorneyFirmState(firmId) {
  const id = normalizeText(firmId)
  const client = requireClient()
  const firmResult = await client
    .from('attorney_firms')
    .select('id, name, created_by, is_active')
    .eq('id', id)
    .maybeSingle()
  if (firmResult.error) {
    if (isMissingSchemaError(firmResult.error, 'attorney_firms')) {
      return { entityType: 'attorney_firm', entityId: id, issues: [createIntegrityIssue({
        code: INTEGRITY_ISSUES.schemaMissing,
        severity: INTEGRITY_SEVERITIES.critical,
        entityType: 'attorney_firm',
        entityId: id,
        message: 'Attorney firm table is unavailable.',
      })], ok: false, status: 'invalid', issueCount: 1, criticalCount: 1 }
    }
    throw firmResult.error
  }
  const memberResult = await client
    .from('attorney_firm_members')
    .select('id, firm_id, user_id, role, status, department_id')
    .eq('firm_id', id)
  if (memberResult.error && !isMissingSchemaError(memberResult.error, 'attorney_firm_members')) throw memberResult.error
  const issues = []
  if (!firmResult.data?.id) {
    issues.push(createIntegrityIssue({ code: INTEGRITY_ISSUES.workspaceMissing, severity: INTEGRITY_SEVERITIES.critical, entityType: 'attorney_firm', entityId: id, message: 'Attorney firm is missing.' }))
  }
  if (!(memberResult.data || []).some((member) => member.status === MEMBERSHIP_STATUSES.active)) {
    issues.push(createIntegrityIssue({ code: INTEGRITY_ISSUES.ownerMissing, severity: INTEGRITY_SEVERITIES.error, entityType: 'attorney_firm', entityId: id, message: 'Attorney firm has no active members.' }))
  }
  return { entityType: 'attorney_firm', entityId: id, firm: firmResult.data || null, memberships: memberResult.data || [], issues, ...summarizeIssues(issues) }
}

export async function validateBondWorkspaceState(workspaceId) {
  return validateWorkspaceState(workspaceId, { workspaceType: WORKSPACE_TYPES.bondOriginator })
}
