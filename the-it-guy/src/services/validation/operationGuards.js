import { assertPermission } from '../../auth/permissions/permissionResolver'
import { BridgeValidationError } from '../errors/validationErrors'
import { validateUserState, validateWorkspaceStateById } from './validationEngine'

export async function assertValidWorkspaceOperation({
  userId,
  workspaceId,
  permission,
  permissionContext,
  operation = 'workspace_operation',
} = {}) {
  if (!userId) {
    throw new BridgeValidationError('User id is required for operation validation.', {
      code: 'missing_user',
      severity: 'error',
      entityType: 'operation',
      userMessage: 'Sign in again before continuing.',
    })
  }
  if (!workspaceId) {
    throw new BridgeValidationError('Workspace id is required for operation validation.', {
      code: 'missing_workspace',
      severity: 'error',
      entityType: 'operation',
      userMessage: 'Select a valid workspace before continuing.',
    })
  }

  if (permission) {
    assertPermission(permission, permissionContext || {})
  }

  const [userValidation, workspaceValidation] = await Promise.all([
    validateUserState(userId),
    validateWorkspaceStateById(workspaceId),
  ])
  const blockingIssues = [...userValidation.issues, ...workspaceValidation.issues]
    .filter((issue) => ['error', 'critical'].includes(issue.severity))

  if (blockingIssues.length) {
    throw new BridgeValidationError(`Operation blocked by integrity validation: ${operation}`, {
      code: 'operation_integrity_blocked',
      severity: 'error',
      entityType: 'operation',
      entityId: workspaceId,
      userMessage: 'This action is blocked until workspace integrity issues are repaired.',
      metadata: { operation, blockingIssues },
    })
  }

  return {
    ok: true,
    userValidation,
    workspaceValidation,
  }
}
