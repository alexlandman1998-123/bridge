// Extracted from the legacy API; query, mapping and error behaviour are preserved.
import { normalizeBondHybridFinanceStage, BOND_HYBRID_FINANCE_WORKFLOW_TYPE, getBondHybridFinanceStageLabel, buildBondHybridFinanceStageSteps, summarizeBondHybridFinanceWorkflow } from '../../core/transactions/bondHybridFinanceWorkflow'
import { isMissingTableError, isMissingSchemaError, isPermissionDeniedError, normalizeOptionalNumber, isMissingColumnError, normalizeTextValue, requireClient } from '../../lib/api/shared/readHelpers.js'
import { selectWithoutKnownMissingColumns, registerKnownMissingColumns } from '../../lib/api/shared/schemaReadCompatibility.js'
import { normalizeStage, normalizeMainStage, latestTimestamp } from '../../core/transactions/legacyReadModel.js'
import { loadTransactionDocumentRequestsByIds } from '../documents/requirementReadModel.js'
import { createPerfTimer } from '../../lib/performanceTrace'
import { fetchDevelopmentIdsForOrganisation } from '../developments/scopeReadApi.js'
import { financeTypeMatchesFilter } from '../../core/transactions/financeType'

export const TRANSACTION_SUMMARY_SELECT_CLAUSE =
  'id, organisation_id, assigned_branch_id, lifecycle_state, matter_number, transaction_reference, transaction_type, property_type, development_id, unit_id, buyer_id, property_address_line_1, property_address_line_2, suburb, city, province, property_description, sales_price, purchase_price, finance_type, purchaser_type, cash_amount, bond_amount, deposit_amount, reservation_required, reservation_amount, reservation_amount_type, reservation_treatment, reservation_payable_to, alteration_charge_treatment, onboarding_status, stage, current_main_stage, current_sub_stage_summary, assigned_agent, assigned_agent_email, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, bank, next_action, comment, expected_transfer_date, bond_workspace_id, bond_region_id, bond_workspace_unit_id, primary_bond_consultant_user_id, assigned_bond_processor_user_id, assigned_bond_manager_user_id, assigned_bond_compliance_user_id, bond_assignment_status, bond_assignment_source, finance_status, compliance_status, compliance_review_required, application_prepared, submitted_to_banks, documents_complete, finance_documents_complete, documents_missing, required_documents_missing, finance_documents_missing, missing_documents_count, uploaded_documents_count, total_required_documents, bank_feedback_pending, bank_feedback_status, next_action_due_at, finance_due_at, attorney_stage, risk_status, operational_state, processor_name, assigned_bond_processor_name, compliance_name, gross_commission_percentage, gross_commission_amount, agent_split_percentage_snapshot, agency_split_percentage_snapshot, agent_commission_amount, agency_commission_amount, registered_at, completed_at, archived_at, cancelled_at, deleted_at, last_meaningful_activity_at, updated_at, created_at, is_active'

export const TRANSACTION_SUMMARY_FALLBACK_SELECT_CLAUSE =
  'id, organisation_id, bond_workspace_id, development_id, unit_id, buyer_id, finance_type, purchaser_type, purchase_price, sales_price, cash_amount, bond_amount, deposit_amount, reservation_required, reservation_amount, reservation_amount_type, reservation_treatment, reservation_payable_to, alteration_charge_treatment, onboarding_status, stage, attorney, bond_originator, next_action, updated_at, created_at'

export function normalizeBondHybridWorkflowRow(row = {}, profileById = {}) {
  if (!row) return null
  const currentStage = normalizeBondHybridFinanceStage(row.current_stage)
  const lastUpdatedBy = row.last_updated_by || null
  const profile = lastUpdatedBy ? profileById[lastUpdatedBy] : null

  return {
    id: row.id,
    transactionId: row.transaction_id,
    workflowType: row.workflow_type || BOND_HYBRID_FINANCE_WORKFLOW_TYPE,
    currentStage,
    currentStageLabel: getBondHybridFinanceStageLabel(currentStage),
    status: row.status || 'active',
    lastUpdatedBy,
    lastUpdatedByName: profile?.full_name || profile?.name || profile?.email || null,
    lastUpdatedByEmail: profile?.email || null,
    lastUpdatedAt: row.last_updated_at || row.updated_at || row.created_at || null,
    completedAt: row.completed_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }
}

export function normalizeBondInstructionRow(row = {}, profileById = {}) {
  if (!row) return null
  const instructionSentBy = row.instruction_sent_by || null
  const grantReceivedBy = row.grant_received_by || null
  const grantSignedBy = row.grant_signed_by || null
  const grantSubmittedBy = row.grant_submitted_by || null
  return {
    id: row.id,
    transactionId: row.transaction_id,
    acceptedBondOfferId: row.accepted_bond_offer_id || null,
    grantReceived: row.grant_received === true,
    grantReceivedAt: row.grant_received_at || null,
    grantReceivedBy,
    grantReceivedByName: grantReceivedBy
      ? profileById[grantReceivedBy]?.full_name || profileById[grantReceivedBy]?.email || null
      : null,
    grantDocumentId: row.grant_document_id || null,
    grantSigned: row.grant_signed === true,
    grantSignedAt: row.grant_signed_at || null,
    grantSignedBy,
    grantSignedByName: grantSignedBy
      ? profileById[grantSignedBy]?.full_name || profileById[grantSignedBy]?.email || null
      : null,
    signedGrantDocumentId: row.signed_grant_document_id || null,
    grantSubmitted: row.grant_submitted === true,
    grantSubmittedAt: row.grant_submitted_at || null,
    grantSubmittedBy,
    grantSubmittedByName: grantSubmittedBy
      ? profileById[grantSubmittedBy]?.full_name || profileById[grantSubmittedBy]?.email || null
      : null,
    instructionSent: row.instruction_sent === true,
    instructionSentAt: row.instruction_sent_at || null,
    instructionSentBy,
    instructionSentByName: instructionSentBy
      ? profileById[instructionSentBy]?.full_name || profileById[instructionSentBy]?.email || null
      : null,
    instructionDocumentId: row.instruction_document_id || null,
    notes: row.notes || '',
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }
}

export async function loadBondHybridFinanceWorkflowSummariesByTransactionIds(client, transactionIds = []) {
  const ids = [...new Set((transactionIds || []).filter(Boolean))]
  if (!ids.length) return {}

  const workflowsQuery = await client
    .from('transaction_finance_workflows')
    .select(
      'id, transaction_id, workflow_type, current_stage, status, last_updated_by, last_updated_at, completed_at, created_at, updated_at',
    )
    .eq('workflow_type', BOND_HYBRID_FINANCE_WORKFLOW_TYPE)
    .in('transaction_id', ids)

  if (workflowsQuery.error) {
    if (
      isMissingTableError(workflowsQuery.error, 'transaction_finance_workflows') ||
      isMissingSchemaError(workflowsQuery.error) ||
      isPermissionDeniedError(workflowsQuery.error)
    ) {
      return {}
    }
    throw workflowsQuery.error
  }

  const instructionsQuery = await client.from('transaction_bond_instructions').select('*').in('transaction_id', ids)

  if (
    instructionsQuery.error &&
    !isMissingTableError(instructionsQuery.error, 'transaction_bond_instructions') &&
    !isMissingSchemaError(instructionsQuery.error) &&
    !isPermissionDeniedError(instructionsQuery.error)
  ) {
    throw instructionsQuery.error
  }

  const workflowsByTransactionId = new Map()
  for (const row of workflowsQuery.data || []) {
    const transactionId = row?.transaction_id
    if (!transactionId) continue
    const existing = workflowsByTransactionId.get(transactionId)
    const existingTimestamp = new Date(
      existing?.last_updated_at || existing?.updated_at || existing?.created_at || 0,
    ).getTime()
    const rowTimestamp = new Date(row?.last_updated_at || row?.updated_at || row?.created_at || 0).getTime()
    if (!existing || rowTimestamp >= existingTimestamp) workflowsByTransactionId.set(transactionId, row)
  }

  const instructionsByTransactionId = new Map()
  if (!instructionsQuery.error) {
    for (const row of instructionsQuery.data || []) {
      const transactionId = row?.transaction_id
      if (!transactionId) continue
      const existing = instructionsByTransactionId.get(transactionId)
      const existingTimestamp = new Date(existing?.updated_at || existing?.created_at || 0).getTime()
      const rowTimestamp = new Date(row?.updated_at || row?.created_at || 0).getTime()
      if (!existing || rowTimestamp >= existingTimestamp) instructionsByTransactionId.set(transactionId, row)
    }
  }

  return ids.reduce((accumulator, transactionId) => {
    const workflow = workflowsByTransactionId.get(transactionId)
    if (!workflow) return accumulator

    const snapshot = {
      workflow: normalizeBondHybridWorkflowRow(workflow),
      applications: [],
      quotes: [],
      offers: [],
      events: [],
      decisions: [],
      acceptedOffer: null,
      instruction: normalizeBondInstructionRow(instructionsByTransactionId.get(transactionId) || null),
    }

    accumulator[transactionId] = {
      ...snapshot,
      steps: buildBondHybridFinanceStageSteps(snapshot),
      summary: summarizeBondHybridFinanceWorkflow(snapshot),
    }
    return accumulator
  }, {})
}

export function normalizeCommissionSnapshotRow(snapshot = null) {
  if (!snapshot || typeof snapshot !== 'object') return null

  return {
    gross_commission_percentage: normalizeOptionalNumber(
      snapshot.gross_commission_percentage ?? snapshot.grossCommissionPercentage,
    ),
    gross_commission_amount: normalizeOptionalNumber(
      snapshot.gross_commission_amount ?? snapshot.grossCommissionAmount,
    ),
    agent_split_percentage_snapshot: normalizeOptionalNumber(
      snapshot.agent_split_percentage_snapshot ??
        snapshot.agentSplitPercentageSnapshot ??
        snapshot.agentSplitPercentage,
    ),
    agency_split_percentage_snapshot: normalizeOptionalNumber(
      snapshot.agency_split_percentage_snapshot ??
        snapshot.agencySplitPercentageSnapshot ??
        snapshot.agencySplitPercentage,
    ),
    agent_commission_amount: normalizeOptionalNumber(
      snapshot.agent_commission_amount ?? snapshot.agentCommissionAmount,
    ),
    agency_commission_amount: normalizeOptionalNumber(
      snapshot.agency_commission_amount ?? snapshot.agencyCommissionAmount,
    ),
  }
}

export function deriveSnapshotFromTransactionRow(transaction = {}) {
  const normalized = normalizeCommissionSnapshotRow(transaction)
  if (!normalized) return null
  const hasSnapshot =
    normalized.gross_commission_amount !== null ||
    normalized.agent_commission_amount !== null ||
    normalized.agency_commission_amount !== null ||
    normalized.gross_commission_percentage !== null
  return hasSnapshot ? normalized : null
}

export function applyCommissionSnapshotToTransaction(transaction = {}, snapshot = null) {
  if (!transaction || typeof transaction !== 'object' || !snapshot) {
    return transaction
  }
  return {
    ...transaction,
    commission_amount: snapshot.gross_commission_amount,
    gross_commission_amount: snapshot.gross_commission_amount,
    gross_commission_percentage: snapshot.gross_commission_percentage,
    agent_commission: snapshot.agent_commission_amount,
    agent_commission_earned: snapshot.agent_commission_amount,
    agency_commission_amount: snapshot.agency_commission_amount,
    agent_split_percentage_snapshot: snapshot.agent_split_percentage_snapshot,
    agency_split_percentage_snapshot: snapshot.agency_split_percentage_snapshot,
    commission_snapshot_source: 'snapshot',
  }
}

export const TRANSACTION_COMMISSION_SNAPSHOTS_ENABLED = import.meta.env.VITE_ENABLE_TRANSACTION_COMMISSION_SNAPSHOTS === 'true'

export let transactionCommissionSnapshotsAvailable = TRANSACTION_COMMISSION_SNAPSHOTS_ENABLED

export async function hydrateRowsWithCommissionSnapshots(client, rows = []) {
  const baseRows = Array.isArray(rows) ? rows : []
  const transactionIds = [...new Set(baseRows.map((row) => row?.transaction?.id).filter(Boolean))]
  if (!transactionIds.length || !TRANSACTION_COMMISSION_SNAPSHOTS_ENABLED || !transactionCommissionSnapshotsAvailable) {
    return baseRows
  }

  const commissionQuery = await client
    .from('transaction_commissions')
    .select(
      'transaction_id, gross_commission_amount, gross_commission_percentage, agent_commission_amount, agency_commission_amount, agent_split_percentage_snapshot, agency_split_percentage_snapshot',
    )
    .in('transaction_id', transactionIds)

  const commissionByTransactionId = new Map()
  if (!commissionQuery.error) {
    for (const item of commissionQuery.data || []) {
      commissionByTransactionId.set(String(item.transaction_id), normalizeCommissionSnapshotRow(item))
    }
  } else if (
    isMissingTableError(commissionQuery.error, 'transaction_commissions') ||
    isMissingSchemaError(commissionQuery.error) ||
    isMissingColumnError(commissionQuery.error) ||
    isPermissionDeniedError(commissionQuery.error)
  ) {
    transactionCommissionSnapshotsAvailable = false
    console.warn('[TRANSACTIONS] commission snapshots unavailable; using transaction rows only.', commissionQuery.error)
  } else if (!isPermissionDeniedError(commissionQuery.error)) {
    throw commissionQuery.error
  }

  return baseRows.map((row) => {
    const transactionId = row?.transaction?.id ? String(row.transaction.id) : ''
    if (!transactionId || !row?.transaction) return row
    const snapshot = commissionByTransactionId.get(transactionId) || deriveSnapshotFromTransactionRow(row.transaction)
    if (!snapshot) return row
    return {
      ...row,
      transaction: applyCommissionSnapshotToTransaction(row.transaction, snapshot),
    }
  })
}

export async function fetchActiveTransactionsForUnitIds(client, unitIds) {
  if (!unitIds.length) {
    return []
  }

  const baseQuery = client
    .from('transactions')
    .select(
      selectWithoutKnownMissingColumns(
        'id, organisation_id, unit_id, buyer_id, finance_type, purchaser_type, stage, current_main_stage, current_sub_stage_summary, risk_status, sales_price, purchase_price, cash_amount, bond_amount, deposit_amount, bank, assigned_agent, assigned_agent_email, attorney, bond_originator, next_action, comment, owner_user_id, access_level, lifecycle_state, attorney_stage, operational_state, waiting_on_role, registration_date, title_deed_number, registered_at, completed_at, archived_at, cancelled_at, last_meaningful_activity_at, final_report_generated_at, updated_at, created_at',
      ),
    )
    .in('unit_id', unitIds)
    .order('updated_at', { ascending: false })

  const withActiveFlag = await baseQuery.eq('is_active', true)
  if (!withActiveFlag.error) {
    return (withActiveFlag.data || []).filter((item) => normalizeStage(item?.stage, null) !== 'Available')
  }

  if (
    !isMissingColumnError(withActiveFlag.error, 'risk_status') &&
    !isMissingColumnError(withActiveFlag.error, 'organisation_id') &&
    !isMissingColumnError(withActiveFlag.error, 'is_active') &&
    !isMissingColumnError(withActiveFlag.error, 'sales_price') &&
    !isMissingColumnError(withActiveFlag.error, 'purchase_price') &&
    !isMissingColumnError(withActiveFlag.error, 'cash_amount') &&
    !isMissingColumnError(withActiveFlag.error, 'bond_amount') &&
    !isMissingColumnError(withActiveFlag.error, 'deposit_amount') &&
    !isMissingColumnError(withActiveFlag.error, 'bank') &&
    !isMissingColumnError(withActiveFlag.error, 'assigned_agent') &&
    !isMissingColumnError(withActiveFlag.error, 'assigned_agent_email') &&
    !isMissingColumnError(withActiveFlag.error, 'owner_user_id') &&
    !isMissingColumnError(withActiveFlag.error, 'access_level') &&
    !isMissingColumnError(withActiveFlag.error, 'current_main_stage') &&
    !isMissingColumnError(withActiveFlag.error, 'current_sub_stage_summary') &&
    !isMissingColumnError(withActiveFlag.error, 'purchaser_type') &&
    !isMissingColumnError(withActiveFlag.error, 'comment') &&
    !isMissingColumnError(withActiveFlag.error, 'lifecycle_state') &&
    !isMissingColumnError(withActiveFlag.error, 'attorney_stage') &&
    !isMissingColumnError(withActiveFlag.error, 'operational_state') &&
    !isMissingColumnError(withActiveFlag.error, 'waiting_on_role') &&
    !isMissingColumnError(withActiveFlag.error, 'registration_date') &&
    !isMissingColumnError(withActiveFlag.error, 'title_deed_number') &&
    !isMissingColumnError(withActiveFlag.error, 'registered_at') &&
    !isMissingColumnError(withActiveFlag.error, 'completed_at') &&
    !isMissingColumnError(withActiveFlag.error, 'archived_at') &&
    !isMissingColumnError(withActiveFlag.error, 'cancelled_at') &&
    !isMissingColumnError(withActiveFlag.error, 'last_meaningful_activity_at') &&
    !isMissingColumnError(withActiveFlag.error, 'final_report_generated_at')
  ) {
    throw withActiveFlag.error
  }

  registerKnownMissingColumns(withActiveFlag.error, [
    'risk_status',
    'organisation_id',
    'is_active',
    'sales_price',
    'purchase_price',
    'cash_amount',
    'bond_amount',
    'deposit_amount',
    'bank',
    'assigned_agent',
    'assigned_agent_email',
    'owner_user_id',
    'access_level',
    'current_main_stage',
    'current_sub_stage_summary',
    'purchaser_type',
    'comment',
    'lifecycle_state',
    'attorney_stage',
    'operational_state',
    'waiting_on_role',
    'registration_date',
    'title_deed_number',
    'registered_at',
    'completed_at',
    'archived_at',
    'cancelled_at',
    'last_meaningful_activity_at',
    'final_report_generated_at',
  ])

  let fallbackQuery = await client
    .from('transactions')
    .select(
      selectWithoutKnownMissingColumns(
        'id, organisation_id, unit_id, buyer_id, finance_type, purchaser_type, stage, current_main_stage, current_sub_stage_summary, sales_price, purchase_price, cash_amount, bond_amount, deposit_amount, bank, assigned_agent, assigned_agent_email, attorney, bond_originator, next_action, comment, owner_user_id, access_level, lifecycle_state, attorney_stage, operational_state, waiting_on_role, registration_date, title_deed_number, registered_at, completed_at, archived_at, cancelled_at, last_meaningful_activity_at, final_report_generated_at, updated_at, created_at',
      ),
    )
    .in('unit_id', unitIds)
    .order('updated_at', { ascending: false })

  if (
    fallbackQuery.error &&
    (isMissingColumnError(fallbackQuery.error, 'organisation_id') ||
      isMissingColumnError(fallbackQuery.error, 'sales_price') ||
      isMissingColumnError(fallbackQuery.error, 'purchase_price') ||
      isMissingColumnError(fallbackQuery.error, 'cash_amount') ||
      isMissingColumnError(fallbackQuery.error, 'bond_amount') ||
      isMissingColumnError(fallbackQuery.error, 'deposit_amount') ||
      isMissingColumnError(fallbackQuery.error, 'bank') ||
      isMissingColumnError(fallbackQuery.error, 'assigned_agent') ||
      isMissingColumnError(fallbackQuery.error, 'assigned_agent_email') ||
      isMissingColumnError(fallbackQuery.error, 'owner_user_id') ||
      isMissingColumnError(fallbackQuery.error, 'access_level') ||
      isMissingColumnError(fallbackQuery.error, 'current_main_stage') ||
      isMissingColumnError(fallbackQuery.error, 'current_sub_stage_summary') ||
      isMissingColumnError(fallbackQuery.error, 'purchaser_type') ||
      isMissingColumnError(fallbackQuery.error, 'comment') ||
      isMissingColumnError(fallbackQuery.error, 'lifecycle_state') ||
      isMissingColumnError(fallbackQuery.error, 'attorney_stage') ||
      isMissingColumnError(fallbackQuery.error, 'operational_state') ||
      isMissingColumnError(fallbackQuery.error, 'waiting_on_role') ||
      isMissingColumnError(fallbackQuery.error, 'registration_date') ||
      isMissingColumnError(fallbackQuery.error, 'title_deed_number') ||
      isMissingColumnError(fallbackQuery.error, 'registered_at') ||
      isMissingColumnError(fallbackQuery.error, 'completed_at') ||
      isMissingColumnError(fallbackQuery.error, 'archived_at') ||
      isMissingColumnError(fallbackQuery.error, 'cancelled_at') ||
      isMissingColumnError(fallbackQuery.error, 'last_meaningful_activity_at') ||
      isMissingColumnError(fallbackQuery.error, 'final_report_generated_at'))
  ) {
    registerKnownMissingColumns(fallbackQuery.error, [
      'organisation_id',
      'sales_price',
      'purchase_price',
      'cash_amount',
      'bond_amount',
      'deposit_amount',
      'bank',
      'assigned_agent',
      'assigned_agent_email',
      'owner_user_id',
      'access_level',
      'current_main_stage',
      'current_sub_stage_summary',
      'purchaser_type',
      'comment',
      'lifecycle_state',
      'attorney_stage',
      'operational_state',
      'waiting_on_role',
      'registration_date',
      'title_deed_number',
      'registered_at',
      'completed_at',
      'archived_at',
      'cancelled_at',
      'last_meaningful_activity_at',
      'final_report_generated_at',
    ])
    fallbackQuery = await client
      .from('transactions')
      .select(
        selectWithoutKnownMissingColumns(
          'id, organisation_id, unit_id, buyer_id, finance_type, stage, assigned_agent, assigned_agent_email, attorney, bond_originator, next_action, updated_at, created_at',
        ),
      )
      .in('unit_id', unitIds)
      .order('updated_at', { ascending: false })
  }

  if (fallbackQuery.error) {
    throw fallbackQuery.error
  }

  return (fallbackQuery.data || []).filter((item) => normalizeStage(item?.stage, null) !== 'Available')
}

export async function loadBondApplicationScopesByTransactionIds(client, transactionIds = []) {
  const ids = [...new Set((transactionIds || []).filter(Boolean))]
  if (!ids.length) return {}

  let query = await client
    .from('transaction_bond_applications')
    .select(
      'id, transaction_id, application_type, bank_name, assigned_organisation_id, assigned_region_id, assigned_workspace_unit_id, assigned_branch_id, assigned_team_id, assigned_user_id, scope_level, scope_metadata, assignment_status, assignment_source, status, updated_at, created_at',
    )
    .in('transaction_id', ids)

  if (
    query.error &&
    (isMissingColumnError(query.error, 'application_type') ||
      isMissingColumnError(query.error, 'bank_name') ||
      isMissingColumnError(query.error, 'assigned_organisation_id') ||
      isMissingColumnError(query.error, 'assigned_region_id') ||
      isMissingColumnError(query.error, 'assigned_workspace_unit_id') ||
      isMissingColumnError(query.error, 'assigned_branch_id') ||
      isMissingColumnError(query.error, 'assigned_team_id') ||
      isMissingColumnError(query.error, 'assigned_user_id') ||
      isMissingColumnError(query.error, 'scope_level') ||
      isMissingColumnError(query.error, 'scope_metadata') ||
      isMissingColumnError(query.error, 'assignment_status') ||
      isMissingColumnError(query.error, 'assignment_source'))
  ) {
    query = await client
      .from('transaction_bond_applications')
      .select('id, transaction_id, status, updated_at, created_at')
      .in('transaction_id', ids)
  }

  if (query.error) {
    if (
      isMissingTableError(query.error, 'transaction_bond_applications') ||
      isMissingSchemaError(query.error) ||
      isPermissionDeniedError(query.error)
    ) {
      return {}
    }
    throw query.error
  }

  return (query.data || []).reduce((accumulator, row) => {
    if (!row?.transaction_id) return accumulator
    if (!accumulator[row.transaction_id]) accumulator[row.transaction_id] = []
    accumulator[row.transaction_id].push(row)
    return accumulator
  }, {})
}

export function scoreBondApplicationScopeRow(row = {}) {
  let score = 0
  const status = normalizeTextValue(row?.assignment_status || row?.status || '').toLowerCase()
  if (!['removed', 'declined', 'rejected', 'inactive', 'suspended'].includes(status)) score += 20
  if (normalizeTextValue(row?.application_type).toLowerCase() === 'originator_intake') score += 10
  if (normalizeTextValue(row?.bank_name).toLowerCase() === 'bond originator intake') score += 10
  if (normalizeTextValue(row?.assigned_organisation_id)) score += 5
  if (normalizeTextValue(row?.assigned_user_id)) score += 3
  if (normalizeTextValue(row?.assigned_workspace_unit_id || row?.assigned_branch_id || row?.assigned_team_id))
    score += 2
  if (normalizeTextValue(row?.assigned_region_id)) score += 1
  return score
}

export function pickPrimaryBondApplicationScope(applicationRows = []) {
  const rows = (Array.isArray(applicationRows) ? applicationRows : []).filter(Boolean)
  if (!rows.length) return null
  return [...rows].sort((left, right) => {
    const scoreDelta = scoreBondApplicationScopeRow(right) - scoreBondApplicationScopeRow(left)
    if (scoreDelta) return scoreDelta
    return new Date(right?.updated_at || right?.created_at || 0) - new Date(left?.updated_at || left?.created_at || 0)
  })[0]
}

export function mergeTransactionBondApplicationScope(transaction = {}, applicationScope = null) {
  if (!applicationScope) return transaction
  return {
    ...transaction,
    assigned_organisation_id: transaction.assigned_organisation_id || applicationScope.assigned_organisation_id || null,
    assigned_region_id: transaction.assigned_region_id || applicationScope.assigned_region_id || null,
    assigned_workspace_unit_id:
      transaction.assigned_workspace_unit_id || applicationScope.assigned_workspace_unit_id || null,
    assigned_branch_id: transaction.assigned_branch_id || applicationScope.assigned_branch_id || null,
    assigned_team_id: transaction.assigned_team_id || applicationScope.assigned_team_id || null,
    assigned_user_id: transaction.assigned_user_id || applicationScope.assigned_user_id || null,
    bond_workspace_id: transaction.bond_workspace_id || applicationScope.assigned_organisation_id || null,
    bond_region_id: transaction.bond_region_id || applicationScope.assigned_region_id || null,
    bond_workspace_unit_id:
      transaction.bond_workspace_unit_id ||
      applicationScope.assigned_workspace_unit_id ||
      applicationScope.assigned_branch_id ||
      applicationScope.assigned_team_id ||
      null,
    bond_assignment_status:
      transaction.bond_assignment_status || applicationScope.assignment_status || applicationScope.status || null,
    bond_assignment_source: transaction.bond_assignment_source || applicationScope.assignment_source || null,
    scope_level: transaction.scope_level || applicationScope.scope_level || null,
    scope_metadata: transaction.scope_metadata || applicationScope.scope_metadata || null,
  }
}

export async function enrichRowsWithBondIntakeContext(rows = []) {
  const safeRows = Array.isArray(rows) ? rows : []
  if (!safeRows.length) return safeRows

  const transactionIds = [...new Set(safeRows.map((row) => row?.transaction?.id).filter(Boolean))]
  if (!transactionIds.length) return safeRows

  const client = requireClient()

  const onboardingPromise = (async () => {
    const query = await client
      .from('onboarding_form_data')
      .select('id, transaction_id, purchaser_type, form_data, created_at, updated_at')
      .in('transaction_id', transactionIds)
    if (query.error) {
      if (
        isMissingTableError(query.error, 'onboarding_form_data') ||
        isMissingSchemaError(query.error) ||
        isPermissionDeniedError(query.error)
      ) {
        return {}
      }
      throw query.error
    }
    return (query.data || []).reduce((accumulator, row) => {
      accumulator[row.transaction_id] = row
      return accumulator
    }, {})
  })()

  const documentsPromise = (async () => {
    let query = await client
      .from('documents')
      .select('id, transaction_id, name, category, document_type, status, created_at')
      .in('transaction_id', transactionIds)
    if (
      query.error &&
      (isMissingColumnError(query.error, 'document_type') ||
        isMissingColumnError(query.error, 'status'))
    ) {
      query = await client
        .from('documents')
        .select('id, transaction_id, name, category, created_at')
        .in('transaction_id', transactionIds)
    }
    if (query.error) {
      if (
        isMissingTableError(query.error, 'documents') ||
        isMissingSchemaError(query.error) ||
        isPermissionDeniedError(query.error)
      ) {
        return {}
      }
      throw query.error
    }
    return (query.data || []).reduce((accumulator, row) => {
      if (!accumulator[row.transaction_id]) accumulator[row.transaction_id] = []
      accumulator[row.transaction_id].push(row)
      return accumulator
    }, {})
  })()

  const documentRequestsPromise = (async () => {
    try {
      return await loadTransactionDocumentRequestsByIds(client, transactionIds)
    } catch (error) {
      if (
        isMissingTableError(error, 'document_requests') ||
        isMissingSchemaError(error) ||
        isPermissionDeniedError(error)
      ) {
        return {}
      }
      throw error
    }
  })()

  const rolePlayersPromise = (async () => {
    let query = await client
      .from('transaction_role_players')
      .select(
        'id, transaction_id, role_type, selection_source, preferred_partner_id, partner_relationship_id, organisation_id, partner_name, contact_person, email_address, phone_number, status, assignment_status, activation_trigger, removed_at, snapshot_json, created_at, updated_at',
      )
      .in('transaction_id', transactionIds)
    if (
      query.error &&
      (isMissingColumnError(query.error, 'selection_source') ||
        isMissingColumnError(query.error, 'preferred_partner_id') ||
        isMissingColumnError(query.error, 'partner_relationship_id') ||
        isMissingColumnError(query.error, 'partner_name') ||
        isMissingColumnError(query.error, 'contact_person') ||
        isMissingColumnError(query.error, 'email_address') ||
        isMissingColumnError(query.error, 'phone_number') ||
        isMissingColumnError(query.error, 'status') ||
        isMissingColumnError(query.error, 'assignment_status') ||
        isMissingColumnError(query.error, 'activation_trigger') ||
        isMissingColumnError(query.error, 'removed_at') ||
        isMissingColumnError(query.error, 'organisation_id') ||
        isMissingColumnError(query.error, 'snapshot_json'))
    ) {
      query = await client
        .from('transaction_role_players')
        .select('id, transaction_id, role_type, created_at, updated_at')
        .in('transaction_id', transactionIds)
    }
    if (query.error) {
      if (
        isMissingTableError(query.error, 'transaction_role_players') ||
        isMissingSchemaError(query.error) ||
        isPermissionDeniedError(query.error)
      ) {
        return {}
      }
      throw query.error
    }
    return (query.data || []).reduce((accumulator, row) => {
      if (!accumulator[row.transaction_id]) accumulator[row.transaction_id] = []
      accumulator[row.transaction_id].push(row)
      return accumulator
    }, {})
  })()

  const bondApplicationsPromise = loadBondApplicationScopesByTransactionIds(client, transactionIds)
  const bondFinanceWorkflowsPromise = loadBondHybridFinanceWorkflowSummariesByTransactionIds(client, transactionIds)

  const [
    onboardingByTransactionId,
    documentsByTransactionId,
    documentRequestsByTransactionId,
    rolePlayersByTransactionId,
    bondApplicationsByTransactionId,
    bondFinanceWorkflowsByTransactionId,
  ] = await Promise.all([
    onboardingPromise,
    documentsPromise,
    documentRequestsPromise,
    rolePlayersPromise,
    bondApplicationsPromise,
    bondFinanceWorkflowsPromise,
  ])

  return safeRows.map((row) => {
    const transactionId = row?.transaction?.id
    if (!transactionId) return row
    const documentRequests = documentRequestsByTransactionId[transactionId] || []
    const documents = documentsByTransactionId[transactionId] || []
    const bondApplications = bondApplicationsByTransactionId[transactionId] || []
    const primaryBondApplication = pickPrimaryBondApplicationScope(bondApplications)
    return {
      ...row,
      transaction: mergeTransactionBondApplicationScope(row.transaction, primaryBondApplication),
      onboardingFormData: onboardingByTransactionId[transactionId] || null,
      bondApplications,
      primaryBondApplication,
      documentRequests,
      documents,
      rolePlayers: rolePlayersByTransactionId[transactionId] || [],
      transactionFinanceWorkflow:
        bondFinanceWorkflowsByTransactionId[transactionId] || row.transactionFinanceWorkflow || null,
      documentSummary: row.documentSummary || {
        uploadedCount: documents.length,
        totalRequired: documentRequests.length,
        missingCount: Math.max(documentRequests.length - documents.length, 0),
      },
    }
  })
}

export async function fetchTransactionsListSummary({
  developmentId = null,
  organisationId = '',
  stage = 'all',
  financeType = 'all',
  activeTransactionsOnly = true,
} = {}) {
  const normalizedOrganisationId = String(organisationId || '').trim()
  const timer = createPerfTimer('api.fetchTransactionsListSummary', {
    developmentId: developmentId || 'all',
    organisationId: normalizedOrganisationId,
    stage,
    financeType,
    activeTransactionsOnly,
  })
  const client = requireClient()
  const scopedDevelopmentIds = normalizedOrganisationId
    ? await fetchDevelopmentIdsForOrganisation(client, normalizedOrganisationId)
    : []
  const scopedDevelopmentIdSet = new Set(scopedDevelopmentIds)
  const canScopeByDevelopmentIds = normalizedOrganisationId && scopedDevelopmentIds.length > 0

  let transactionsQuery = client
    .from('transactions')
    .select(selectWithoutKnownMissingColumns(TRANSACTION_SUMMARY_SELECT_CLAUSE))

  if (developmentId) {
    transactionsQuery = transactionsQuery.eq('development_id', developmentId)
  } else if (canScopeByDevelopmentIds) {
    transactionsQuery = transactionsQuery.in('development_id', scopedDevelopmentIds)
  } else if (normalizedOrganisationId) {
    transactionsQuery = transactionsQuery.eq('organisation_id', normalizedOrganisationId)
  }

  const baseResult = await transactionsQuery
  let query = baseResult
  if (query.error && isMissingColumnError(query.error)) {
    if (normalizedOrganisationId && isMissingColumnError(query.error, 'organisation_id')) {
      timer.end({ rowCount: 0, missingOrganisationScope: true })
      return []
    }
    registerKnownMissingColumns(query.error, [
      'matter_number',
      'transaction_reference',
      'transaction_type',
      'property_type',
      'reservation_required',
      'reservation_amount',
      'reservation_amount_type',
      'reservation_treatment',
      'reservation_payable_to',
      'alteration_charge_treatment',
      'current_main_stage',
      'current_sub_stage_summary',
      'assigned_agent',
      'assigned_agent_email',
      'assigned_attorney_email',
      'assigned_bond_originator_email',
      'comment',
      'expected_transfer_date',
      'bond_workspace_id',
      'bond_region_id',
      'bond_workspace_unit_id',
      'primary_bond_consultant_user_id',
      'assigned_bond_processor_user_id',
      'assigned_bond_manager_user_id',
      'assigned_bond_compliance_user_id',
      'bond_assignment_status',
      'bond_assignment_source',
      'finance_status',
      'compliance_status',
      'compliance_review_required',
      'application_prepared',
      'submitted_to_banks',
      'documents_complete',
      'finance_documents_complete',
      'documents_missing',
      'required_documents_missing',
      'finance_documents_missing',
      'missing_documents_count',
      'uploaded_documents_count',
      'total_required_documents',
      'bank_feedback_pending',
      'bank_feedback_status',
      'next_action_due_at',
      'finance_due_at',
      'attorney_stage',
      'risk_status',
      'operational_state',
      'processor_name',
      'assigned_bond_processor_name',
      'compliance_name',
      'organisation_id',
      'assigned_branch_id',
      'lifecycle_state',
      'registered_at',
      'completed_at',
      'archived_at',
      'cancelled_at',
      'deleted_at',
      'last_meaningful_activity_at',
      'gross_commission_percentage',
      'gross_commission_amount',
      'agent_split_percentage_snapshot',
      'agency_split_percentage_snapshot',
      'agent_commission_amount',
      'agency_commission_amount',
      'purchase_price',
      'cash_amount',
      'bond_amount',
      'deposit_amount',
      'onboarding_status',
      'bank',
      'is_active',
    ])
    let fallbackQuery = client
      .from('transactions')
      .select(selectWithoutKnownMissingColumns(TRANSACTION_SUMMARY_FALLBACK_SELECT_CLAUSE))
    if (developmentId) {
      fallbackQuery = fallbackQuery.eq('development_id', developmentId)
    } else if (canScopeByDevelopmentIds) {
      fallbackQuery = fallbackQuery.in('development_id', scopedDevelopmentIds)
    } else if (normalizedOrganisationId) {
      fallbackQuery = fallbackQuery.eq('organisation_id', normalizedOrganisationId)
    }
    query = await fallbackQuery
    if (query.error && normalizedOrganisationId && isMissingColumnError(query.error, 'organisation_id')) {
      timer.end({ rowCount: 0, missingOrganisationScope: true })
      return []
    }
  }

  if (query.error) {
    throw query.error
  }

  let transactionRows = (query.data || []).filter((row) => {
    if (activeTransactionsOnly && row?.is_active === false) {
      return false
    }
    if (
      normalizedOrganisationId &&
      String(row?.organisation_id || '').trim() !== normalizedOrganisationId &&
      !scopedDevelopmentIdSet.has(String(row?.development_id || '').trim())
    ) {
      return false
    }
    return true
  })

  if (financeType !== 'all') {
    transactionRows = transactionRows.filter((row) => financeTypeMatchesFilter(row?.finance_type, financeType))
  }

  const buyerIds = [...new Set(transactionRows.map((item) => item?.buyer_id).filter(Boolean))]
  const unitIds = [...new Set(transactionRows.map((item) => item?.unit_id).filter(Boolean))]
  const developmentIds = [...new Set(transactionRows.map((item) => item?.development_id).filter(Boolean))]

  const [buyersQuery, unitsQuery] = await Promise.all([
    buyerIds.length
      ? client.from('buyers').select('id, name, phone, email').in('id', buyerIds)
      : Promise.resolve({ data: [], error: null }),
    unitIds.length
      ? client.from('units').select('id, development_id, unit_number, phase, price, status').in('id', unitIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (buyersQuery.error && !isMissingSchemaError(buyersQuery.error)) {
    throw buyersQuery.error
  }
  if (unitsQuery.error && !isMissingSchemaError(unitsQuery.error)) {
    throw unitsQuery.error
  }

  const linkedDevelopmentIds = new Set(developmentIds)
  for (const unit of unitsQuery.data || []) {
    if (unit?.development_id) {
      linkedDevelopmentIds.add(unit.development_id)
    }
  }
  const allDevelopmentIds = [...linkedDevelopmentIds]
  const developmentsQuery = allDevelopmentIds.length
    ? await client.from('developments').select('id, name, location').in('id', allDevelopmentIds)
    : { data: [], error: null }
  if (developmentsQuery.error && !isMissingSchemaError(developmentsQuery.error)) {
    throw developmentsQuery.error
  }

  const buyersById = (buyersQuery.data || []).reduce((accumulator, item) => {
    accumulator[item.id] = item
    return accumulator
  }, {})
  const unitsById = (unitsQuery.data || []).reduce((accumulator, item) => {
    accumulator[item.id] = item
    return accumulator
  }, {})
  const developmentsById = (developmentsQuery.data || []).reduce((accumulator, item) => {
    accumulator[item.id] = item
    return accumulator
  }, {})

  let rows = transactionRows.map((transaction) => {
    const unit = transaction?.unit_id ? unitsById[transaction.unit_id] || null : null
    const developmentIdFromRow = transaction?.development_id || unit?.development_id || null
    const development = developmentIdFromRow ? developmentsById[developmentIdFromRow] || null : null
    const buyer = transaction?.buyer_id ? buyersById[transaction.buyer_id] || null : null
    const resolvedStage = normalizeStage(transaction?.stage, unit?.status || 'Available')

    return {
      unit,
      development,
      transaction,
      buyer,
      stage: resolvedStage,
      mainStage: normalizeMainStage(transaction?.current_main_stage, resolvedStage),
      handover: null,
      snagSummary: {
        totalCount: 0,
        openCount: 0,
        latestUpdatedAt: null,
        status: 'clear',
      },
      onboarding: null,
      documentSummary: {
        uploadedCount: 0,
        totalRequired: 0,
        missingCount: 0,
      },
    }
  })

  if (stage !== 'all') {
    rows = rows.filter((row) => row.stage === stage)
  }

  rows = await hydrateRowsWithCommissionSnapshots(client, rows)
  rows = await enrichRowsWithBondIntakeContext(rows)
  rows.sort((left, right) => new Date(latestTimestamp(right) || 0) - new Date(latestTimestamp(left) || 0))
  timer.end({ rowCount: rows.length })
  return rows
}
