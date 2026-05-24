import { INTEGRITY_ISSUES } from './integrityChecks'

const REPAIR_ACTIONS = {
  [INTEGRITY_ISSUES.profileMissing]: {
    action: 'recreate_profile',
    label: 'Recreate profile',
    requiresReview: true,
  },
  [INTEGRITY_ISSUES.workspaceMissing]: {
    action: 'reassign_workspace',
    label: 'Relink workspace',
    requiresReview: true,
  },
  [INTEGRITY_ISSUES.membershipMissing]: {
    action: 'create_or_reactivate_membership',
    label: 'Create or reactivate membership',
    requiresReview: true,
  },
  [INTEGRITY_ISSUES.defaultBranchMissing]: {
    action: 'create_default_branch',
    label: 'Create default branch',
    requiresReview: true,
  },
  [INTEGRITY_ISSUES.settingsMissing]: {
    action: 'repair_workspace_settings',
    label: 'Repair workspace settings',
    requiresReview: true,
  },
  [INTEGRITY_ISSUES.invalidAssignment]: {
    action: 'repair_assignment',
    label: 'Repair assignment',
    requiresReview: true,
  },
  [INTEGRITY_ISSUES.onboardingCorrupted]: {
    action: 'repair_onboarding_state',
    label: 'Repair onboarding state',
    requiresReview: true,
  },
  [INTEGRITY_ISSUES.invalidOrganisationRole]: {
    action: 'normalize_legacy_role',
    label: 'Normalize legacy role',
    requiresReview: true,
  },
  [INTEGRITY_ISSUES.invalidWorkspaceType]: {
    action: 'set_workspace_type',
    label: 'Set workspace type',
    requiresReview: true,
  },
  [INTEGRITY_ISSUES.orphanedTransaction]: {
    action: 'relink_transaction',
    label: 'Relink transaction',
    requiresReview: true,
  },
}

export function getRepairActions(entityType, entityId, issues = []) {
  return issues.map((issue) => {
    const suggestion = REPAIR_ACTIONS[issue.code] || {
      action: 'manual_review',
      label: 'Manual review',
      requiresReview: true,
    }
    return {
      entityType: entityType || issue.entityType,
      entityId: entityId || issue.entityId,
      issueCode: issue.code,
      severity: issue.severity,
      ...suggestion,
      description: issue.message,
      metadata: issue.metadata || {},
    }
  })
}

export function buildRepairState(entityType, entityId, validationResult = {}) {
  const actions = getRepairActions(entityType, entityId, validationResult.issues || [])
  return {
    entityType,
    entityId,
    status: actions.length ? 'repair_recommended' : 'no_repair_needed',
    actions,
  }
}
