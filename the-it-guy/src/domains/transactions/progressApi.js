// transactions owns these operations and their existing recovery behavior.
import { resolveActiveProfileContext } from '../access/actorContext.js'
import { resolveTransactionIdFromBondApplicationId } from './workspaceReadApi.js'
import { requireClient } from '../../lib/api/shared/readHelpers.js'
import { normalizeRoleType } from '../../core/transactions/permissions'

async function loadTransactionRollupAuditService() {
  return import("../../../server/services/transactionRollupAuditService.js")
}

async function loadTransactionRollupValidationService() {
  return import("../../../server/services/transactionRollupValidationService.js")
}

async function loadTransactionWorkflowMigrationService() {
  return import("../../../server/services/transactionWorkflowMigrationService.js")
}

async function loadWorkflowEngineHealthService() {
  return import("../../../server/services/workflowEngineHealthService.js")
}

export async function loadTransactionWorkflowRollup() {
  return import("../../../server/services/transactionWorkflowRollup.js")
}

export async function getTransactionRollup(transactionId, options = {}) {
  if (!transactionId) {
    return null
  }

  const client = requireClient()
  const activeProfile = await resolveActiveProfileContext(client)
  const actorRole = normalizeRoleType(options.actorRole || activeProfile.role || 'developer')
  const { resolveTransactionRollup } = await loadTransactionWorkflowRollup()
  let rollup = await resolveTransactionRollup(transactionId, {
    client,
    actorRole,
  })
  if (!rollup) {
    const resolvedTransactionId = await resolveTransactionIdFromBondApplicationId(client, transactionId)
    if (resolvedTransactionId && resolvedTransactionId !== transactionId) {
      rollup = await resolveTransactionRollup(resolvedTransactionId, {
        client,
        actorRole,
      })
    }
  }
  if (!rollup) {
    return null
  }

  return {
    ...rollup,
    lastWorkflowUpdatedAt: rollup.derivedAt || null,
    availableActions: Array.isArray(rollup.availableActions) ? rollup.availableActions : [],
  }
}

export async function getTransactionRollupAudit(transactionId, options = {}) {
  if (!transactionId) {
    return []
  }

  const client = requireClient()
  const activeProfile = await resolveActiveProfileContext(client)
  const actorRole = normalizeRoleType(options.actorRole || activeProfile.role || 'developer')
  if (!['developer', 'internal_admin', 'admin', 'agency_admin'].includes(actorRole)) {
    throw new Error('You do not have permission to inspect roll-up audit history.')
  }

  const { fetchTransactionRollupAudit } = await loadTransactionRollupAuditService()
  return fetchTransactionRollupAudit(transactionId, {
    client,
    limit: options.limit || 100,
  })
}

export async function getTransactionWorkflowMigrationValidation(options = {}) {
  const client = requireClient()
  const activeProfile = await resolveActiveProfileContext(client)
  const actorRole = normalizeRoleType(options.actorRole || activeProfile.role || 'developer')
  if (!['developer', 'internal_admin', 'admin', 'agency_admin', 'platform_admin'].includes(actorRole)) {
    throw new Error('You do not have permission to inspect workflow migration validation.')
  }

  const { fetchTransactionRollupValidationReport } = await loadTransactionRollupValidationService()
  return fetchTransactionRollupValidationReport({
    client,
    transactionId: options.transactionId || '',
    comparisonStatus: options.comparisonStatus || '',
    mismatchCategory: options.mismatchCategory || '',
    limit: options.limit || 250,
  })
}

export async function runTransactionWorkflowMigrationBackfill(options = {}) {
  const client = requireClient()
  const activeProfile = await resolveActiveProfileContext(client)
  const actorRole = normalizeRoleType(options.actorRole || activeProfile.role || 'developer')
  if (!['developer', 'internal_admin', 'admin', 'platform_admin'].includes(actorRole)) {
    throw new Error('You do not have permission to run workflow migration backfills.')
  }

  const { runTransactionWorkflowMigration } = await loadTransactionWorkflowMigrationService()
  return runTransactionWorkflowMigration({
    client,
    transactionId: options.transactionId || '',
    limit: options.limit || 100,
    offset: options.offset || 0,
    dryRun: options.dryRun === true,
    validateOnly: options.validateOnly === true,
    persistValidation: options.persistValidation !== false,
    createdBy: activeProfile.userId || null,
    source: 'platform_validation_dashboard',
  })
}

export async function getWorkflowEngineHealth(options = {}) {
  const client = requireClient()
  const activeProfile = await resolveActiveProfileContext(client)
  const actorRole = normalizeRoleType(options.actorRole || activeProfile.role || 'developer')
  if (!['developer', 'internal_admin', 'admin', 'platform_admin'].includes(actorRole)) {
    throw new Error('You do not have permission to inspect workflow engine health.')
  }

  const { getWorkflowEngineHealthSnapshot } = await loadWorkflowEngineHealthService()
  return getWorkflowEngineHealthSnapshot({
    client,
    staleThresholdMinutes: options.staleThresholdMinutes || 30,
  })
}
