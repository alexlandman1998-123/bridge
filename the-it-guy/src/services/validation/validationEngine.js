import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'
import { recordSecurityAuditEvent } from '../auditLogService'
import { logPlatformError } from '../errors/errorHandler'
import { summarizeIssues } from './integrityChecks'
import { validateOnboardingIntegrity } from './onboardingValidation'
import { validateMembershipState as validateSingleMembershipState, validateUserMemberships } from './membershipValidation'
import { validateProfileState } from './profileValidation'
import { buildRepairState, getRepairActions } from './repairSuggestions'
import { validateTransactionState } from './transactionValidation'
import { validateAttorneyFirmState, validateBondWorkspaceState, validateWorkspaceState } from './workspaceValidation'

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

async function persistValidationState(entityType, entityId, result = {}, workspaceId = null) {
  if (!entityType || !entityId || !isSupabaseConfigured || !supabase) return { persisted: false }
  const summary = summarizeIssues(result.issues || [])
  const payload = {
    entity_type: entityType,
    entity_id: String(entityId),
    workspace_id: workspaceId || null,
    validation_status: summary.status,
    issue_count: summary.issueCount,
    critical_count: summary.criticalCount,
    summary: {
      issues: result.issues || [],
      checkedAt: new Date().toISOString(),
    },
  }
  const write = await supabase
    .from('validation_states')
    .upsert(payload, { onConflict: 'entity_type,entity_id' })
    .select('id')
    .maybeSingle()
  if (write.error) {
    if (isMissingSchemaError(write.error, 'validation_states')) return { persisted: false, reason: 'schema_missing' }
    throw write.error
  }
  return { persisted: true, id: write.data?.id || null }
}

export async function validateUserState(userId, options = {}) {
  const profileResult = await validateProfileState(userId, options)
  const membershipResult = await validateUserMemberships(userId, { profile: profileResult.profile })
  const onboardingResult = await validateOnboardingIntegrity(userId, {
    profile: profileResult.profile,
    appRole: profileResult.appRole,
  })
  const issues = [
    ...profileResult.issues,
    ...membershipResult.issues,
    ...onboardingResult.issues,
  ]
  const result = {
    entityType: 'user',
    entityId: userId,
    profile: profileResult.profile,
    appRole: profileResult.appRole,
    memberships: membershipResult.memberships,
    sections: { profile: profileResult, memberships: membershipResult, onboarding: onboardingResult },
    issues,
    repair: buildRepairState('user', userId, { issues }),
    ...summarizeIssues(issues),
  }
  await persistValidationState('user', userId, result)
  return result
}

export async function validateWorkspaceStateById(workspaceId) {
  const result = await validateWorkspaceState(workspaceId)
  await persistValidationState('workspace', workspaceId, result, workspaceId)
  return { ...result, repair: buildRepairState('workspace', workspaceId, result) }
}

export async function validateMembershipState(membershipId) {
  const id = normalizeText(membershipId)
  if (!id) return { entityType: 'membership', entityId: '', issues: [], ok: false, status: 'invalid' }
  const client = requireClient()
  let result = await client
    .from('organisation_users')
    .select('id, organisation_id, user_id, branch_id, role, workspace_role, organisation_role, app_role, workspace_type, status, organisations:organisation_id(id, type, name)')
    .eq('id', id)
    .maybeSingle()
  if (result.error && isMissingSchemaError(result.error, 'workspace_role')) {
    result = await client
      .from('organisation_users')
      .select('id, organisation_id, user_id, branch_id, role, organisation_role, app_role, workspace_type, status, organisations:organisation_id(id, type, name)')
      .eq('id', id)
      .maybeSingle()
  }
  if (result.error && !isMissingSchemaError(result.error, 'organisation_users')) throw result.error
  const validation = await validateSingleMembershipState(id, { membership: result.data || null })
  await persistValidationState('membership', id, validation, result.data?.organisation_id || null)
  return { ...validation, repair: buildRepairState('membership', id, validation) }
}

export async function validateTransactionStateById(transactionId) {
  const result = await validateTransactionState(transactionId)
  await persistValidationState('transaction', transactionId, result, result.transaction?.organisation_id || null)
  return { ...result, repair: buildRepairState('transaction', transactionId, result) }
}

export async function validateBranchState(branchId) {
  const id = normalizeText(branchId)
  const result = await requireClient()
    .from('organisation_branches')
    .select('id, organisation_id, name, is_active, principal_user_id')
    .eq('id', id)
    .maybeSingle()
  if (result.error && !isMissingSchemaError(result.error, 'organisation_branches')) throw result.error
  const issues = []
  if (!result.data?.id) {
    issues.push({ code: 'orphaned_branch', severity: 'error', entityType: 'branch', entityId: id, message: 'Branch could not be found.' })
  }
  const validation = { entityType: 'branch', entityId: id, branch: result.data || null, issues, ...summarizeIssues(issues) }
  await persistValidationState('branch', id, validation, result.data?.organisation_id || null)
  return { ...validation, repair: buildRepairState('branch', id, validation) }
}

export { validateAttorneyFirmState, validateBondWorkspaceState }

export async function detectOrphans() {
  const client = requireClient()
  const checks = []

  const membershipCheck = await client
    .from('organisation_users')
    .select('id, organisation_id, user_id, organisations:organisation_id(id)')
    .limit(100)
  if (!membershipCheck.error) {
    checks.push(...(membershipCheck.data || [])
      .filter((row) => !row.organisations?.id || !row.user_id)
      .map((row) => ({
        entityType: 'membership',
        entityId: row.id,
        code: 'orphaned_membership',
        severity: 'error',
        message: 'Membership is missing a user or workspace reference.',
        suggestedRepair: 'manual_review',
      })))
  }

  const branchCheck = await client
    .from('organisation_branches')
    .select('id, organisation_id, organisations:organisation_id(id)')
    .limit(100)
  if (!branchCheck.error) {
    checks.push(...(branchCheck.data || [])
      .filter((row) => !row.organisations?.id)
      .map((row) => ({
        entityType: 'branch',
        entityId: row.id,
        code: 'orphaned_branch',
        severity: 'warning',
        message: 'Branch points to a missing workspace.',
        suggestedRepair: 'reassign_or_archive_branch',
      })))
  }

  return checks
}

export async function detectCorruption() {
  const client = requireClient()
  const issues = []
  const profiles = await client
    .from('profiles')
    .select('id, role, onboarding_completed')
    .eq('onboarding_completed', true)
    .limit(50)
  if (!profiles.error) {
    for (const profile of profiles.data || []) {
      try {
        const validation = await validateUserState(profile.id, { profile })
        issues.push(...validation.issues.filter((issue) => ['error', 'critical'].includes(issue.severity)))
      } catch (error) {
        await logPlatformError(error, { userId: profile.id, operation: 'detect_corruption' })
      }
    }
  }
  return issues
}

export async function runIntegrityChecks({ persistSnapshot = true, createdBy = null } = {}) {
  const orphanIssues = await detectOrphans()
  const corruptionIssues = await detectCorruption()
  const issues = [...orphanIssues, ...corruptionIssues]
  const summary = summarizeIssues(issues)

  if (persistSnapshot && isSupabaseConfigured && supabase) {
    const write = await supabase
      .from('system_health_snapshots')
      .insert({
        status: summary.status === 'invalid' ? (summary.criticalCount ? 'critical' : 'warning') : 'healthy',
        summary: {
          issueCount: summary.issueCount,
          criticalCount: summary.criticalCount,
          issues,
        },
        created_by: createdBy || null,
      })
    if (write.error && !isMissingSchemaError(write.error, 'system_health_snapshots')) throw write.error
  }

  await recordSecurityAuditEvent({
    userId: createdBy || '',
    action: 'integrity_checks_run',
    targetType: 'system_health',
    metadata: summary,
  })

  return {
    status: summary.status,
    summary,
    issues,
    repairActions: getRepairActions('system', 'integrity', issues),
  }
}

export function getRepairActionsForEntity(entityType, entityId, validationResult = {}) {
  return getRepairActions(entityType, entityId, validationResult.issues || [])
}
