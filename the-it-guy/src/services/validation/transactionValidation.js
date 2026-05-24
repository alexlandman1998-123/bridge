import { getMainStageFromDetailedStage } from '../../lib/stages'
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'
import { validateTransactionStageTransition } from '../transitions/stateTransitionEngine'
import { createIntegrityIssue, INTEGRITY_ISSUES, INTEGRITY_SEVERITIES, summarizeIssues } from './integrityChecks'

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

export async function loadTransactionForValidation(transactionId) {
  const id = normalizeText(transactionId)
  if (!id) return null
  const result = await requireClient()
    .from('transactions')
    .select('id, organisation_id, development_id, unit_id, buyer_id, stage, current_main_stage, assigned_agent, assigned_agent_email, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, created_at, updated_at')
    .eq('id', id)
    .maybeSingle()

  if (result.error) {
    if (isMissingSchemaError(result.error, 'transactions')) return null
    throw result.error
  }
  return result.data || null
}

export async function validateTransactionState(transactionId, options = {}) {
  const transaction = options.transaction || await loadTransactionForValidation(transactionId)
  const issues = []
  const id = normalizeText(transactionId || transaction?.id)

  if (!transaction?.id) {
    issues.push(createIntegrityIssue({
      code: INTEGRITY_ISSUES.orphanedTransaction,
      severity: INTEGRITY_SEVERITIES.critical,
      entityType: 'transaction',
      entityId: id,
      message: 'Transaction record is missing.',
    }))
    return { entityType: 'transaction', entityId: id, transaction: null, issues, ...summarizeIssues(issues) }
  }

  if (!transaction.organisation_id && !transaction.development_id) {
    issues.push(createIntegrityIssue({
      code: INTEGRITY_ISSUES.orphanedTransaction,
      severity: INTEGRITY_SEVERITIES.error,
      entityType: 'transaction',
      entityId: transaction.id,
      message: 'Transaction is not linked to a workspace or development.',
    }))
  }

  if (!transaction.buyer_id && !transaction.assigned_agent_email && !transaction.assigned_attorney_email) {
    issues.push(createIntegrityIssue({
      code: 'missing_participant_references',
      severity: INTEGRITY_SEVERITIES.warning,
      entityType: 'transaction',
      entityId: transaction.id,
      message: 'Transaction has weak or missing participant references.',
    }))
  }

  const expectedMainStage = getMainStageFromDetailedStage(transaction.stage)
  if (transaction.current_main_stage && expectedMainStage && transaction.current_main_stage !== expectedMainStage) {
    issues.push(createIntegrityIssue({
      code: 'invalid_main_stage',
      severity: INTEGRITY_SEVERITIES.warning,
      entityType: 'transaction',
      entityId: transaction.id,
      message: 'Transaction detailed stage and main stage are inconsistent.',
      metadata: { stage: transaction.stage, currentMainStage: transaction.current_main_stage, expectedMainStage },
    }))
  }

  return {
    entityType: 'transaction',
    entityId: transaction.id,
    transaction,
    issues,
    ...summarizeIssues(issues),
  }
}

export function validateTransactionTransitionContract(input = {}) {
  const result = validateTransactionStageTransition(input)
  if (result.ok) return { ...result, issues: [] }
  return {
    ...result,
    issues: [
      createIntegrityIssue({
        code: INTEGRITY_ISSUES.invalidStageTransition,
        severity: INTEGRITY_SEVERITIES.error,
        entityType: 'transaction',
        entityId: input.transactionId,
        message: 'Transaction stage transition failed validation.',
        metadata: result,
      }),
    ],
  }
}
