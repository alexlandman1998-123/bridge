import { isMissingTableError, requireClient } from '../attorneyFirmServiceShared'
import { getTransactionAttorneyAssignments } from '../transactionAttorneyAssignments'
import { resolveAttorneyLanes, resolveLegalRequirements } from './attorneyWorkflowResolver.js'
import { resolveAttorneyUpdateOptions } from '../../constants/attorneyUpdateTypes.js'
import { resolveTransactionFacts } from './transactionFactsResolver.js'

async function fetchTransactionById(transactionId) {
  const client = requireClient()
  const normalizedTransactionId = String(transactionId || '').trim()
  if (!normalizedTransactionId) {
    throw new Error('Transaction id is required.')
  }

  const query = await client
    .from('transactions')
    .select('*')
    .eq('id', normalizedTransactionId)
    .maybeSingle()

  if (query.error) {
    if (isMissingTableError(query.error, 'transactions')) {
      throw new Error('Unable to load transaction workflow facts.')
    }
    throw query.error
  }

  if (!query.data) {
    throw new Error('Transaction not found.')
  }

  return query.data
}

function isDevelopmentMode() {
  return Boolean(import.meta.env?.DEV)
}

function logWorkflowResolution(transactionId, workflow) {
  if (!isDevelopmentMode()) return
  console.debug('[attorneyWorkflow]', {
    transactionId,
    financeType: workflow?.facts?.financeType,
    requiredRoles: workflow?.requiredAttorneyRoles,
    missingFields: workflow?.facts?.missingFields,
  })
}

export function resolveAttorneyWorkflowForTransaction(transaction = {}, assignments = []) {
  const facts = resolveTransactionFacts(transaction)
  const lanes = resolveAttorneyLanes(facts)
  const legalRequirements = resolveLegalRequirements(facts)
  const activeAssignments = (assignments || []).filter((assignment) => {
    const status = String(assignment?.assignmentStatus || assignment?.status || '').trim().toLowerCase()
    return status !== 'removed'
  })
  const assignedRoles = [...new Set(activeAssignments.map((assignment) => assignment.attorneyRole).filter(Boolean))]
  const missingRequiredRoles = legalRequirements.requiredAttorneyRoles.filter((role) => !assignedRoles.includes(role))

  const workflow = {
    transactionId: facts.transactionId,
    facts,
    lanes,
    requiredAttorneyRoles: legalRequirements.requiredAttorneyRoles,
    assignedAttorneyRoles: assignedRoles,
    missingRequiredRoles,
    documentRequirements: legalRequirements.documentRequirements,
    dataRequirements: legalRequirements.dataRequirements,
    updateOptions: legalRequirements.updateOptions,
    signingRequirements: legalRequirements.signingRequirements,
    warnings: legalRequirements.warnings,
  }

  logWorkflowResolution(facts.transactionId, workflow)
  return workflow
}

export async function getAttorneyWorkflowForTransaction(transactionId) {
  const transaction = await fetchTransactionById(transactionId)
  const assignments = await getTransactionAttorneyAssignments(transactionId).catch(() => [])
  return resolveAttorneyWorkflowForTransaction(transaction, assignments)
}

export async function getRequiredAttorneyRolesForTransaction(transactionId) {
  const workflow = await getAttorneyWorkflowForTransaction(transactionId)
  return workflow.requiredAttorneyRoles
}

export async function getLegalRequirementsForTransaction(transactionId) {
  const workflow = await getAttorneyWorkflowForTransaction(transactionId)
  return {
    requiredAttorneyRoles: workflow.requiredAttorneyRoles,
    documentRequirements: workflow.documentRequirements,
    dataRequirements: workflow.dataRequirements,
    updateOptions: workflow.updateOptions,
    signingRequirements: workflow.signingRequirements,
    warnings: workflow.warnings,
  }
}

export async function getAttorneyUpdateOptionsForTransaction(transactionId, attorneyRole) {
  const transaction = await fetchTransactionById(transactionId)
  return resolveAttorneyUpdateOptions(transaction, attorneyRole)
}
