import {
  getMainStageFromDetailedStage,
  normalizeStageLabel,
} from '../core/transactions/stageConfig'
import {
  isBondFinanceType,
  normalizeFinanceManagedBy,
} from '../core/transactions/financeType'
import { getOperationalStepDefinition } from '../core/workflows/operationalStepMapping'
import { attorneyStageKeyMatches } from '../constants/attorneyWorkflowStages.js'
import {
  getMainStageLabel,
  getSubprocessTypeLabel,
  getWorkflowStatusLabel,
  normalizeChecklistStatus,
  normalizeDetailedStage,
  normalizeDocumentRequestStatus,
  normalizeMainStage,
  normalizeSubprocessStepStatus,
  normalizeSubprocessType,
  normalizeVisibilityScope,
} from '../core/workflows/workflowConstants'
import {
  isMissingColumnError,
  isMissingTableError,
  requireClient,
} from './attorneyFirmServiceShared'
import { resolveTransactionParticipantShape } from './roleResolutionService'
import { buildMvpTransactionTruth } from '../core/transactions/mvpTransactionTruth.js'
import { buildMvpTransactionControlBoard } from '../core/transactions/mvpTransactionControlBoard.js'
import { buildMvpTransactionHealthPanel } from '../core/transactions/mvpTransactionHealthPanel.js'
import { buildMvpParticipantRoster } from '../core/transactions/mvpParticipantRoster.js'
import { buildMvpDocumentRoster } from '../core/transactions/mvpDocumentRoster.js'
import { assessMvpTestDataProtection } from '../core/transactions/mvpTestDataProtection.js'
import { buildMvpTransactionAuditRecovery } from '../core/transactions/mvpTransactionAuditRecovery.js'
import { getTransactionSharedProgress } from './transactionSharedProgressService.js'

const READ_MODEL_WARNING_PREFIX = '[workflow-read-model]'
const ATTORNEY_ASSIGNMENTS_MIGRATION_HINT = 'transaction_attorney_assignments table missing. Run migration 202605090011_transaction_attorney_assignments_foundation.sql.'

const DEFAULT_LANE_EDIT_ROLES = {
  finance: ['developer', 'agent', 'bond_originator', 'internal_admin', 'admin'],
  transfer: ['developer', 'agent', 'attorney', 'internal_admin', 'admin'],
  bond: ['developer', 'agent', 'attorney', 'bond_originator', 'internal_admin', 'admin'],
  attorney: ['developer', 'agent', 'attorney', 'internal_admin', 'admin'],
  transfer_attorney: ['developer', 'agent', 'attorney', 'internal_admin', 'admin'],
  bond_attorney: ['developer', 'agent', 'attorney', 'bond_originator', 'internal_admin', 'admin'],
  buyer: ['buyer', 'agent', 'developer', 'internal_admin', 'admin'],
  seller: ['seller', 'agent', 'developer', 'internal_admin', 'admin'],
  handover: ['agent', 'developer', 'internal_admin', 'admin'],
}

function toLower(value) {
  return String(value || '').trim().toLowerCase()
}

function toIsoString(value) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

function toDateOnly(value) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

function isOverdue(dateValue) {
  const dueDate = toDateOnly(dateValue)
  if (!dueDate) return false
  const today = new Date().toISOString().slice(0, 10)
  return dueDate < today
}

function createEmptyReadModel(transactionId = null, warnings = []) {
  return {
    transaction: transactionId ? { id: transactionId } : null,
    mainStage: {
      key: 'AVAIL',
      label: getMainStageLabel('AVAIL'),
    },
    detailedStage: {
      key: 'Available',
      label: normalizeDetailedStage('Available'),
    },
    lanes: [],
    checklistItems: [],
    documentRequests: [],
    transactionRequiredDocuments: [],
    documentRoster: buildMvpDocumentRoster(),
    rolePlayers: [],
    participantRequirements: [],
    participantRoster: buildMvpParticipantRoster(),
    blockers: [],
    clientVisibleMilestones: [],
    nextInternalActions: [],
    nextClientActions: [],
    sharedProgress: [],
    coordination: {
      status: 'not_ready',
      hasBondLane: false,
      transferReady: false,
      bondReady: true,
      checks: {},
    },
    warnings,
  }
}

function appendWarning(warnings, warning) {
  if (!warning) return
  if (warnings.includes(warning)) return
  warnings.push(warning)
  console.warn(READ_MODEL_WARNING_PREFIX, warning)
}

function mapTransactionRow(row = {}) {
  if (!row?.id) return null
  const detailedStage = normalizeStageLabel(row.stage || 'Available')
  const mainStage = normalizeMainStage(row.current_main_stage || getMainStageFromDetailedStage(detailedStage))

  const routingProfile = row.routing_profile_json && typeof row.routing_profile_json === 'object' ? row.routing_profile_json : null
  return {
    id: row.id,
    organisationId: row.organisation_id || null,
    transactionReference: row.transaction_reference || null,
    stage: detailedStage,
    currentMainStage: mainStage,
    currentSubStageSummary: row.current_sub_stage_summary || null,
    financeType: row.finance_type || null,
    financeManagedBy: row.finance_managed_by || null,
    purchaserType: row.purchaser_type || null,
    transactionType: row.transaction_type || null,
    propertyTenure: row.property_tenure || null,
    sellerEntityType: row.seller_type || null,
    sellerHasExistingBond: Boolean(row.seller_has_existing_bond || row.existing_bond),
    routingProfile,
    testDataProtection: assessMvpTestDataProtection({ transaction: { ...row, routingProfile } }),
    lifecycleState: row.lifecycle_state || null,
    riskStatus: row.risk_status || null,
    updatedAt: row.updated_at || null,
    createdAt: row.created_at || null,
  }
}

function mapSubprocessRows(rows = []) {
  return (rows || []).map((row) => ({
    id: row.id,
    transactionId: row.transaction_id,
    processType: normalizeSubprocessType(row.process_type, 'attorney'),
    ownerType: toLower(row.owner_type) || 'internal',
    status: normalizeSubprocessStepStatus(row.status),
    visibility: normalizeVisibilityScope(row.visibility_scope || 'shared_role_players', 'shared_role_players'),
    blockedReason: row.blocked_reason || null,
    startedAt: row.started_at || null,
    completedAt: row.completed_at || null,
    updatedAt: row.updated_at || null,
    createdAt: row.created_at || null,
  }))
}

function mapSubprocessStepRows(rows = []) {
  return (rows || []).map((row) => ({
    id: row.id,
    subprocessId: row.subprocess_id,
    key: row.step_key || row.id,
    label: row.step_label || row.step_key || 'Workflow Step',
    status: normalizeSubprocessStepStatus(row.status),
    ownerType: toLower(row.owner_type) || 'internal',
    dueDate: row.due_date || null,
    comment: row.comment || '',
    sortOrder: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0,
    completedAt: row.completed_at || null,
    updatedAt: row.updated_at || null,
    createdAt: row.created_at || null,
  }))
}

function mapChecklistRows(rows = []) {
  return (rows || []).map((row) => ({
    id: row.id,
    transactionId: row.transaction_id,
    stage: row.stage || null,
    label: row.label || row.auto_rule_key || 'Checklist Item',
    description: row.description || '',
    status: normalizeChecklistStatus(row.status),
    priority: toLower(row.priority) || 'required',
    ownerRole: toLower(row.owner_role) || 'attorney',
    linkedDocumentRequestId: row.linked_document_request_id || null,
    linkedDocumentId: row.linked_document_id || null,
    autoRuleKey: row.auto_rule_key || '',
    isAutoManaged: row.is_auto_managed === true,
    dueDate: row.due_date || null,
    sortOrder: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0,
    completedAt: row.completed_at || null,
    updatedAt: row.updated_at || null,
    createdAt: row.created_at || null,
  }))
}

function parseOperationalRuleKey(value = '') {
  const parts = String(value || '').trim().split(':')
  if (parts.length < 4 || parts[0] !== 'operational') return null
  return {
    laneKey: parts[1] || '',
    stepKey: parts[2] || '',
    ownerRole: parts[3] || '',
  }
}

function mapDocumentRequestRows(rows = []) {
  return (rows || []).map((row) => ({
    id: row.id,
    transactionId: row.transaction_id,
    category: row.category || null,
    documentType: row.document_type || null,
    title: row.title || 'Document Request',
    description: row.description || '',
    priority: toLower(row.priority) || 'required',
    dueDate: row.due_date || null,
    assignedToRole: toLower(row.assigned_to_role) || 'client',
    requestedFrom: toLower(row.requested_from) || null,
    status: normalizeDocumentRequestStatus(row.status),
    rejectedReason: row.rejected_reason || null,
    requestType: row.request_type || 'required',
    visibility: normalizeVisibilityScope(row.visibility_scope || 'shared_role_players', 'shared_role_players'),
    notes: row.notes || '',
    completedAt: row.completed_at || null,
    updatedAt: row.updated_at || null,
    createdAt: row.created_at || null,
  }))
}

function mapParticipantRows(rows = []) {
  return (rows || []).map((row) => {
    const shape = resolveTransactionParticipantShape(row)
    return {
      id: row.id,
      transactionId: row.transaction_id,
      userId: row.user_id || null,
      roleType: shape.roleType || 'unknown',
      legalRole: shape.legalRole || 'none',
      transactionRole: shape.transactionRole,
      status: toLower(row.status) || 'draft',
      visibility: normalizeVisibilityScope(row.visibility_scope || 'shared_role_players', 'shared_role_players'),
      participantName: row.participant_name || null,
      participantEmail: row.participant_email || null,
      firmId: row.firm_id || null,
      acceptedAt: row.accepted_at || null,
      updatedAt: row.updated_at || null,
      createdAt: row.created_at || null,
    }
  })
}

function mapParticipantRequirementRows(rows = []) {
  return (rows || []).map((row) => ({
    id: row.id,
    transactionId: row.transaction_id,
    roleKey: row.role_key,
    roleType: row.role_type,
    legalRole: row.legal_role || 'none',
    transactionRole: row.transaction_role,
    requiredBy: row.required_by,
    requiredAtCreation: Boolean(row.required_at_creation),
    status: row.status || 'pending_assignment',
    label: row.label || row.role_key || 'Transaction participant',
    reason: row.reason || '',
    participantId: row.participant_id || null,
    updatedAt: row.updated_at || null,
    createdAt: row.created_at || null,
  }))
}

function mapEventRows(rows = []) {
  return (rows || []).map((row) => ({
    id: row.id,
    eventType: row.event_type || 'TransactionUpdated',
    eventData: row.event_data && typeof row.event_data === 'object' ? row.event_data : {},
    visibility: normalizeVisibilityScope(row.visibility_scope || 'internal', 'internal'),
    createdByRole: row.created_by_role || null,
    createdAt: row.created_at || null,
  }))
}

function buildLaneReadiness({ steps = [], checklistItems = [], documentRequests = [] }) {
  const sortedSteps = [...steps].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
  const totalSteps = sortedSteps.length
  const completedSteps = sortedSteps.filter((step) => step.status === 'completed').length
  const blockedSteps = sortedSteps.filter((step) => step.status === 'blocked').length
  const overdueSteps = sortedSteps.filter((step) => step.status !== 'completed' && isOverdue(step.dueDate)).length

  const currentStep = sortedSteps.find((step) => step.status === 'in_progress') || null
  const nextStep = sortedSteps.find((step) => !['completed', 'blocked'].includes(step.status)) || null

  const incompleteChecklistItems = checklistItems.filter((item) => !['completed', 'waived'].includes(item.status))
  const overdueChecklistItems = incompleteChecklistItems.filter((item) => isOverdue(item.dueDate))

  const missingDocuments = documentRequests.filter((request) => ['requested', 'rejected'].includes(request.status))
  const clientVisibleBlockers = missingDocuments.filter((item) => item.visibility === 'client_visible')

  return {
    totalSteps,
    completedSteps,
    blockedSteps,
    completionPercent: totalSteps ? Math.round((completedSteps / totalSteps) * 100) : 0,
    currentStep,
    nextStep,
    overdueItems: overdueSteps + overdueChecklistItems.length,
    missingDocuments,
    clientVisibleBlockers,
  }
}

function buildLaneBlockers({ laneKey, steps = [], checklistItems = [], documentRequests = [] }) {
  const blockers = []

  for (const step of steps.filter((item) => item.status === 'blocked')) {
    blockers.push({
      id: `step-${step.id || step.key}`,
      type: 'subprocess_step_blocked',
      title: `${step.label} is blocked`,
      description: step.comment || `${step.label} requires intervention before this lane can continue.`,
      blockingRole: laneKey,
      visibility: 'internal',
      relatedEntityType: 'transaction_subprocess_step',
      relatedEntityId: step.id || step.key,
    })
  }

  for (const item of checklistItems.filter((entry) => ['pending', 'in_progress', 'blocked'].includes(entry.status))) {
    blockers.push({
      id: `checklist-${item.id}`,
      type: 'checklist_incomplete',
      title: item.label,
      description: item.description || `Checklist item is ${getWorkflowStatusLabel(item.status).toLowerCase()}.`,
      blockingRole: item.ownerRole || laneKey,
      visibility: 'shared_role_players',
      relatedEntityType: 'transaction_checklist_item',
      relatedEntityId: item.id,
    })
  }

  for (const request of documentRequests.filter((entry) => ['requested', 'rejected'].includes(entry.status))) {
    const isRejected = request.status === 'rejected'
    blockers.push({
      id: `document-${request.id}`,
      type: isRejected ? 'document_rejected' : 'document_missing',
      title: request.title,
      description: isRejected
        ? request.rejectedReason || 'Document was rejected and needs re-upload.'
        : 'Required document is still outstanding.',
      blockingRole: request.assignedToRole || laneKey,
      visibility: request.visibility,
      relatedEntityType: 'document_request',
      relatedEntityId: request.id,
    })
  }

  return blockers
}

function mapLaneProcessType(processType) {
  const normalized = normalizeSubprocessType(processType, 'attorney')
  if (normalized === 'attorney') return 'transfer'
  if (normalized === 'transfer_attorney') return 'transfer'
  if (normalized === 'bond_attorney') return 'bond'
  return normalized
}

function buildLanes({ subprocesses = [], subprocessSteps = [], checklistItems = [], documentRequests = [] }) {
  const stepsBySubprocessId = subprocessSteps.reduce((accumulator, step) => {
    if (!accumulator[step.subprocessId]) {
      accumulator[step.subprocessId] = []
    }
    accumulator[step.subprocessId].push(step)
    return accumulator
  }, {})

  return subprocesses.map((subprocess) => {
    const laneKey = mapLaneProcessType(subprocess.processType)
    const laneSteps = (stepsBySubprocessId[subprocess.id] || []).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    const ownerRole = subprocess.ownerType || laneKey

    const laneChecklistItems = checklistItems.filter((item) => item.ownerRole === ownerRole || item.ownerRole === laneKey)
      .map((item) => {
        const parsed = parseOperationalRuleKey(item.autoRuleKey)
        const definition = parsed ? getOperationalStepDefinition(parsed.laneKey, parsed.stepKey) : null
        return {
          ...item,
          operational: parsed
            ? {
                laneKey: parsed.laneKey,
                stepKey: parsed.stepKey,
                actionType: definition?.actionType || null,
                clientVisible: Boolean(definition?.clientVisible),
                clientUpdateText: definition?.clientUpdateText || '',
                completionEventType: definition?.completionEventType || null,
              }
            : null,
        }
      })
    const laneDocumentRequests = documentRequests.filter((item) => {
      if (item.assignedToRole === 'client' && (laneKey === 'buyer' || laneKey === 'seller')) return true
      return item.assignedToRole === ownerRole || item.assignedToRole === laneKey
    })

    const readiness = buildLaneReadiness({
      steps: laneSteps,
      checklistItems: laneChecklistItems,
      documentRequests: laneDocumentRequests,
    })

    const blockers = buildLaneBlockers({
      laneKey,
      steps: laneSteps,
      checklistItems: laneChecklistItems,
      documentRequests: laneDocumentRequests,
    })

    return {
      laneKey,
      laneLabel: getSubprocessTypeLabel(laneKey),
      ownerRole,
      status: normalizeSubprocessStepStatus(subprocess.status),
      statusLabel: getWorkflowStatusLabel(subprocess.status),
      steps: laneSteps,
      blockers,
      readiness,
      visibleToClient: subprocess.visibility === 'client_visible' || subprocess.visibility === 'shared_role_players',
      editableByRoles: DEFAULT_LANE_EDIT_ROLES[laneKey] || ['developer', 'agent', 'internal_admin', 'admin'],
    }
  })
}

function findLaneByKey(lanes = [], laneKey) {
  return (lanes || []).find((lane) => lane?.laneKey === laneKey) || null
}

function getStepStatusInLane(lane = null, stepKeys = []) {
  if (!lane || !Array.isArray(lane.steps)) return 'missing'
  const matchedStep = lane.steps.find((step) => attorneyStageKeyMatches(step.key, stepKeys, lane.laneKey))
  if (!matchedStep) return 'missing'
  return normalizeSubprocessStepStatus(matchedStep.status)
}

function buildTransferBondCoordination({ transaction = null, lanes = [] }) {
  const normalizedMainStage = normalizeMainStage(transaction?.currentMainStage)
  const transferLane = findLaneByKey(lanes, 'transfer')
  const bondLane = findLaneByKey(lanes, 'bond')
  const hasBondLane = Boolean(bondLane)

  const transferLodged = getStepStatusInLane(transferLane, ['lodgement_submitted']) === 'completed'
  const transferRegistered = getStepStatusInLane(transferLane, ['registration_confirmed']) === 'completed'
  const transferReadyChecks = {
    lodgementPackPrepared: getStepStatusInLane(transferLane, ['lodgement_pack_prepared']) === 'completed',
    guaranteesReceived: getStepStatusInLane(transferLane, ['guarantees_received']) === 'completed',
    ratesClearanceUploaded: getStepStatusInLane(transferLane, ['rates_clearance_uploaded']) === 'completed',
    levyClearanceUploaded:
      getStepStatusInLane(transferLane, ['levy_clearance_uploaded']) === 'completed' ||
      getStepStatusInLane(transferLane, ['levy_clearance_uploaded']) === 'missing',
  }

  const bondReadyChecks = {
    bondLodgementPackPrepared: getStepStatusInLane(bondLane, ['bond_lodgement_pack_prepared']) === 'completed',
    buyerSignedBondDocuments: getStepStatusInLane(bondLane, ['buyer_signed_bond_documents']) === 'completed',
  }

  const transferReady =
    transferReadyChecks.lodgementPackPrepared &&
    transferReadyChecks.guaranteesReceived &&
    transferReadyChecks.ratesClearanceUploaded &&
    transferReadyChecks.levyClearanceUploaded

  const bondReady = !hasBondLane || (bondReadyChecks.bondLodgementPackPrepared && bondReadyChecks.buyerSignedBondDocuments)

  let status = 'not_ready'
  if (transferRegistered || normalizedMainStage === 'REG') {
    status = 'registered'
  } else if (transferLodged) {
    status = 'lodged'
  } else if (transferReady && bondReady) {
    status = 'ready_for_lodgement'
  } else if (!transferReady) {
    status = 'waiting_on_transfer'
  } else if (!bondReady) {
    status = 'waiting_on_bond'
  }

  return {
    status,
    hasBondLane,
    transferReady,
    bondReady,
    checks: {
      ...transferReadyChecks,
      ...bondReadyChecks,
    },
  }
}

function buildMissingAssignmentBlockers({ transaction = null, participants = [], attorneyAssignments = [] }) {
  const blockers = []
  if (!transaction?.id) return blockers

  const hasAttorneyParticipant = participants.some((item) => item.roleType === 'attorney' && item.status !== 'removed')
  const hasBondParticipant = participants.some((item) => item.roleType === 'bond_originator' && item.status !== 'removed')

  const hasTransferAssignment = attorneyAssignments.some(
    (item) => ['transfer', 'transfer_and_bond'].includes(toLower(item.assignment_type)) && toLower(item.status) === 'active',
  )
  const hasBondAssignment = attorneyAssignments.some(
    (item) => ['bond', 'transfer_and_bond'].includes(toLower(item.assignment_type)) && toLower(item.status) === 'active',
  )

  if (!hasAttorneyParticipant && !hasTransferAssignment) {
    blockers.push({
      id: 'missing-transfer-attorney-assignment',
      type: 'missing_role_assignment',
      title: 'Transfer attorney assignment missing',
      description: 'Assign a transfer attorney participant to continue attorney lane coordination.',
      blockingRole: 'attorney',
      visibility: 'internal',
      relatedEntityType: 'transaction',
      relatedEntityId: transaction.id,
    })
  }

  const originatorManagedFinance =
    isBondFinanceType(transaction.financeType) &&
    normalizeFinanceManagedBy(transaction.financeManagedBy, { fallback: 'bond_originator' }) === 'bond_originator'

  if (originatorManagedFinance && !hasBondParticipant && !hasBondAssignment) {
    blockers.push({
      id: 'missing-bond-role-assignment',
      type: 'missing_role_assignment',
      title: 'Bond role-player assignment missing',
      description: 'Assign a bond originator or bond attorney to proceed with finance workflows.',
      blockingRole: 'bond_originator',
      visibility: 'internal',
      relatedEntityType: 'transaction',
      relatedEntityId: transaction.id,
    })
  }

  return blockers
}

function buildClientVisibleMilestones({ transaction = null, documentRequests = [], events = [] }) {
  const milestones = []
  if (!transaction) return milestones

  milestones.push({
    id: `stage-${transaction.id}`,
    key: normalizeMainStage(transaction.currentMainStage),
    title: `${normalizeDetailedStage(transaction.stage)} stage`,
    summary: transaction.currentSubStageSummary || `Your transaction is currently in ${normalizeDetailedStage(transaction.stage)}.`,
    updatedAt: transaction.updatedAt || null,
  })

  const recentlyCompletedDocs = documentRequests
    .filter((item) => item.visibility === 'client_visible' && item.status === 'completed')
    .sort((a, b) => new Date(b.completedAt || b.updatedAt || 0).getTime() - new Date(a.completedAt || a.updatedAt || 0).getTime())
    .slice(0, 3)

  for (const doc of recentlyCompletedDocs) {
    milestones.push({
      id: `doc-${doc.id}`,
      key: 'document_completed',
      title: `${doc.title} completed`,
      summary: 'A requested document was reviewed and completed.',
      updatedAt: doc.completedAt || doc.updatedAt || doc.createdAt,
    })
  }

  const visibleEvents = events
    .filter((event) => event.visibility === 'client_visible')
    .slice(0, 5)

  for (const event of visibleEvents) {
    milestones.push({
      id: `event-${event.id}`,
      key: toLower(event.eventType) || 'transaction_updated',
      title: event.eventData?.title || 'Transaction update',
      summary: event.eventData?.description || 'An update was shared on your transaction.',
      updatedAt: event.createdAt,
    })
  }

  return milestones
}

function buildNextActions({ blockers = [] }) {
  const nextInternalActions = blockers
    .filter((item) => item.visibility !== 'client_visible')
    .slice(0, 8)
    .map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      description: item.description,
      visibility: item.visibility,
      blockingRole: item.blockingRole,
    }))

  const nextClientActions = blockers
    .filter((item) => item.visibility === 'client_visible')
    .slice(0, 8)
    .map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      description: item.description,
      visibility: item.visibility,
      blockingRole: item.blockingRole,
    }))

  return {
    nextInternalActions,
    nextClientActions,
  }
}

async function fetchTransaction(client, transactionId, warnings) {
  const primary = await client
    .from('transactions')
    .select('id, transaction_reference, stage, current_main_stage, current_sub_stage_summary, finance_type, finance_managed_by, purchaser_type, transaction_type, property_tenure, seller_type, seller_has_existing_bond, existing_bond, routing_profile_json, lifecycle_state, risk_status, updated_at, created_at')
    .eq('id', transactionId)
    .maybeSingle()

  if (primary.error) {
    if (isMissingTableError(primary.error, 'transactions')) {
      appendWarning(warnings, 'transactions table missing. Workflow read-model returned empty state.')
      return null
    }

    if (
      isMissingColumnError(primary.error, 'current_main_stage') ||
      isMissingColumnError(primary.error, 'finance_managed_by')
    ) {
      const fallback = await client
        .from('transactions')
        .select('id, transaction_reference, stage, finance_type, purchaser_type, updated_at, created_at')
        .eq('id', transactionId)
        .maybeSingle()

      if (fallback.error) {
        appendWarning(warnings, `Failed to load transaction: ${fallback.error.message || 'Unknown error'}`)
        return null
      }

      return mapTransactionRow(fallback.data)
    }

    appendWarning(warnings, `Failed to load transaction: ${primary.error.message || 'Unknown error'}`)
    return null
  }

  return mapTransactionRow(primary.data)
}

async function fetchSubprocesses(client, transactionId, warnings) {
  const primary = await client
    .from('transaction_subprocesses')
    .select('id, transaction_id, process_type, owner_type, status, visibility_scope, blocked_reason, started_at, completed_at, updated_at, created_at')
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: true })

  if (primary.error) {
    if (isMissingTableError(primary.error, 'transaction_subprocesses')) {
      appendWarning(warnings, 'transaction_subprocesses table missing. Returning empty workflow lanes.')
      return []
    }

    if (isMissingColumnError(primary.error, 'visibility_scope')) {
      const fallback = await client
        .from('transaction_subprocesses')
        .select('id, transaction_id, process_type, owner_type, status, updated_at, created_at')
        .eq('transaction_id', transactionId)
        .order('created_at', { ascending: true })

      if (fallback.error) {
        appendWarning(warnings, `Failed to load subprocesses: ${fallback.error.message || 'Unknown error'}`)
        return []
      }

      return mapSubprocessRows(fallback.data)
    }

    appendWarning(warnings, `Failed to load subprocesses: ${primary.error.message || 'Unknown error'}`)
    return []
  }

  return mapSubprocessRows(primary.data)
}

async function fetchSubprocessSteps(client, subprocessIds = [], warnings = []) {
  if (!subprocessIds.length) return []

  const query = await client
    .from('transaction_subprocess_steps')
    .select('id, subprocess_id, step_key, step_label, status, owner_type, due_date, comment, sort_order, completed_at, updated_at, created_at')
    .in('subprocess_id', subprocessIds)
    .order('sort_order', { ascending: true })

  if (query.error) {
    if (isMissingTableError(query.error, 'transaction_subprocess_steps')) {
      appendWarning(warnings, 'transaction_subprocess_steps table missing. Lane step details unavailable.')
      return []
    }

    if (isMissingColumnError(query.error, 'due_date')) {
      const fallback = await client
        .from('transaction_subprocess_steps')
        .select('id, subprocess_id, step_key, step_label, status, owner_type, comment, sort_order, completed_at, updated_at, created_at')
        .in('subprocess_id', subprocessIds)
        .order('sort_order', { ascending: true })

      if (fallback.error) {
        appendWarning(warnings, `Failed to load subprocess steps: ${fallback.error.message || 'Unknown error'}`)
        return []
      }

      return mapSubprocessStepRows(fallback.data)
    }

    appendWarning(warnings, `Failed to load subprocess steps: ${query.error.message || 'Unknown error'}`)
    return []
  }

  return mapSubprocessStepRows(query.data)
}

async function fetchChecklistItems(client, transactionId, warnings = []) {
  const query = await client
    .from('transaction_checklist_items')
    .select('id, transaction_id, stage, label, description, status, priority, owner_role, linked_document_request_id, linked_document_id, due_date, sort_order, completed_at, updated_at, created_at, auto_rule_key')
    .eq('transaction_id', transactionId)
    .order('sort_order', { ascending: true })

  if (query.error) {
    if (isMissingTableError(query.error, 'transaction_checklist_items')) {
      appendWarning(warnings, 'transaction_checklist_items table missing. Checklist readiness unavailable.')
      return []
    }

    if (isMissingColumnError(query.error, 'due_date')) {
      const fallback = await client
        .from('transaction_checklist_items')
        .select('id, transaction_id, stage, label, description, status, priority, owner_role, linked_document_request_id, linked_document_id, sort_order, completed_at, updated_at, created_at, auto_rule_key')
        .eq('transaction_id', transactionId)
        .order('sort_order', { ascending: true })

      if (fallback.error) {
        appendWarning(warnings, `Failed to load checklist items: ${fallback.error.message || 'Unknown error'}`)
        return []
      }

      return mapChecklistRows(fallback.data)
    }

    appendWarning(warnings, `Failed to load checklist items: ${query.error.message || 'Unknown error'}`)
    return []
  }

  return mapChecklistRows(query.data)
}

async function fetchDocumentRequests(client, transactionId, warnings = []) {
  const query = await client
    .from('document_requests')
    .select('id, transaction_id, category, document_type, title, description, priority, due_date, assigned_to_role, requested_from, status, rejected_reason, request_type, visibility_scope, notes, completed_at, updated_at, created_at')
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: false })

  if (query.error) {
    if (isMissingTableError(query.error, 'document_requests')) {
      appendWarning(warnings, 'document_requests table missing. Document blockers unavailable.')
      return []
    }

    if (isMissingColumnError(query.error, 'visibility_scope') || isMissingColumnError(query.error, 'transaction_role')) {
      const fallback = await client
        .from('document_requests')
        .select('id, transaction_id, category, document_type, title, description, priority, due_date, assigned_to_role, status, rejected_reason, request_type, notes, completed_at, updated_at, created_at')
        .eq('transaction_id', transactionId)
        .order('created_at', { ascending: false })

      if (fallback.error) {
        appendWarning(warnings, `Failed to load document requests: ${fallback.error.message || 'Unknown error'}`)
        return []
      }

      return mapDocumentRequestRows(fallback.data)
    }

    appendWarning(warnings, `Failed to load document requests: ${query.error.message || 'Unknown error'}`)
    return []
  }

  return mapDocumentRequestRows(query.data)
}

async function fetchTransactionRequiredDocuments(client, transactionId, warnings = []) {
  const query = await client
    .from('transaction_required_documents')
    .select('id, transaction_id, document_key, document_label, is_required, is_uploaded, status, enabled, group_key, group_label, description, required_from_role, visibility_scope, allow_multiple, sort_order, created_at, updated_at')
    .eq('transaction_id', transactionId)
    .order('sort_order', { ascending: true })

  if (query.error) {
    if (isMissingTableError(query.error, 'transaction_required_documents')) {
      appendWarning(warnings, 'transaction_required_documents table missing. Atomic document roster unavailable.')
      return []
    }
    appendWarning(warnings, `Failed to load transaction required documents: ${query.error.message || 'Unknown error'}`)
    return []
  }

  return query.data || []
}

async function fetchParticipants(client, transactionId, warnings = []) {
  const query = await client
    .from('transaction_participants')
    .select('id, transaction_id, user_id, role_type, legal_role, transaction_role, status, visibility_scope, participant_name, participant_email, firm_id, accepted_at, updated_at, created_at')
    .eq('transaction_id', transactionId)

  if (query.error) {
    if (isMissingTableError(query.error, 'transaction_participants')) {
      appendWarning(warnings, 'transaction_participants table missing. Role-player linkage unavailable.')
      return []
    }

    if (isMissingColumnError(query.error, 'visibility_scope')) {
      const fallback = await client
        .from('transaction_participants')
        .select('id, transaction_id, user_id, role_type, legal_role, status, participant_name, participant_email, firm_id, accepted_at, updated_at, created_at')
        .eq('transaction_id', transactionId)

      if (fallback.error) {
        appendWarning(warnings, `Failed to load participants: ${fallback.error.message || 'Unknown error'}`)
        return []
      }

      return mapParticipantRows(fallback.data)
    }

    appendWarning(warnings, `Failed to load participants: ${query.error.message || 'Unknown error'}`)
    return []
  }

  return mapParticipantRows(query.data)
}

async function fetchParticipantRequirements(client, transactionId, warnings = []) {
  const query = await client
    .from('transaction_participant_requirements')
    .select('id, transaction_id, role_key, role_type, legal_role, transaction_role, required_by, required_at_creation, status, label, reason, participant_id, updated_at, created_at')
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: true })

  if (query.error) {
    if (isMissingTableError(query.error, 'transaction_participant_requirements')) {
      appendWarning(warnings, 'transaction_participant_requirements table missing. MVP participant roster unavailable.')
      return []
    }
    appendWarning(warnings, `Failed to load participant requirements: ${query.error.message || 'Unknown error'}`)
    return []
  }

  return mapParticipantRequirementRows(query.data)
}

async function fetchEvents(client, transactionId, warnings = []) {
  const query = await client
    .from('transaction_events')
    .select('id, transaction_id, event_type, event_data, visibility_scope, created_by_role, created_at')
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: false })
    .limit(25)

  if (query.error) {
    if (isMissingTableError(query.error, 'transaction_events')) {
      appendWarning(warnings, 'transaction_events table missing. Workflow milestones fallback to stage only.')
      return []
    }

    if (isMissingColumnError(query.error, 'visibility_scope')) {
      const fallback = await client
        .from('transaction_events')
        .select('id, transaction_id, event_type, event_data, created_by_role, created_at')
        .eq('transaction_id', transactionId)
        .order('created_at', { ascending: false })
        .limit(25)

      if (fallback.error) {
        appendWarning(warnings, `Failed to load transaction events: ${fallback.error.message || 'Unknown error'}`)
        return []
      }

      return mapEventRows(fallback.data)
    }

    appendWarning(warnings, `Failed to load transaction events: ${query.error.message || 'Unknown error'}`)
    return []
  }

  return mapEventRows(query.data)
}

async function fetchAttorneyAssignments(client, transactionId, warnings = []) {
  const query = await client
    .from('transaction_attorney_assignments')
    .select('id, transaction_id, assignment_type, status, firm_id, primary_attorney_id, secretary_id, admin_handler_id, assigned_at, updated_at, created_at')
    .eq('transaction_id', transactionId)

  if (query.error) {
    if (isMissingTableError(query.error, 'transaction_attorney_assignments')) {
      appendWarning(warnings, ATTORNEY_ASSIGNMENTS_MIGRATION_HINT)
      return []
    }

    appendWarning(warnings, `Failed to load attorney assignments: ${query.error.message || 'Unknown error'}`)
    return []
  }

  return query.data || []
}

async function fetchSharedProgress(client, transactionId, warnings = [], viewer = {}) {
  try {
    return await getTransactionSharedProgress(transactionId, {
      client,
      viewerRole: viewer.viewerRole || null,
      canViewPrivate: Boolean(viewer.canViewPrivate),
    })
  } catch (error) {
    if (isMissingTableError(error, 'transaction_shared_progress')) {
      appendWarning(warnings, 'Shared transaction progress is not deployed yet. Run the Phase 2 migration.')
      return []
    }
    appendWarning(warnings, `Failed to load shared transaction progress: ${error?.message || 'Unknown error'}`)
    return []
  }
}

export async function getTransactionWorkflowReadModel(transactionId, options = {}) {
  const client = options.client || requireClient()
  const warnings = []
  const normalizedTransactionId = String(transactionId || '').trim()

  if (!normalizedTransactionId) {
    appendWarning(warnings, 'Transaction id is required to build workflow read-model.')
    return createEmptyReadModel(null, warnings)
  }

  const transaction = await fetchTransaction(client, normalizedTransactionId, warnings)
  if (!transaction) {
    return createEmptyReadModel(normalizedTransactionId, warnings)
  }

  const subprocesses = await fetchSubprocesses(client, normalizedTransactionId, warnings)
  if (!subprocesses.length) {
    appendWarning(warnings, 'No subprocess rows found for this transaction. Returning safe empty lane list.')
  }
  const subprocessIds = subprocesses.map((item) => item.id).filter(Boolean)

  const [subprocessSteps, checklistItems, documentRequests, transactionRequiredDocuments, participants, participantRequirements, events, attorneyAssignments, sharedProgress] = await Promise.all([
    fetchSubprocessSteps(client, subprocessIds, warnings),
    fetchChecklistItems(client, normalizedTransactionId, warnings),
    fetchDocumentRequests(client, normalizedTransactionId, warnings),
    fetchTransactionRequiredDocuments(client, normalizedTransactionId, warnings),
    fetchParticipants(client, normalizedTransactionId, warnings),
    fetchParticipantRequirements(client, normalizedTransactionId, warnings),
    fetchEvents(client, normalizedTransactionId, warnings),
    fetchAttorneyAssignments(client, normalizedTransactionId, warnings),
    fetchSharedProgress(client, normalizedTransactionId, warnings, options),
  ])

  const lanes = buildLanes({
    subprocesses,
    subprocessSteps,
    checklistItems,
    documentRequests,
  })
  const coordination = buildTransferBondCoordination({
    transaction,
    lanes,
  })

  const laneBlockers = lanes.flatMap((lane) => lane.blockers)
  const assignmentBlockers = buildMissingAssignmentBlockers({
    transaction,
    participants,
    attorneyAssignments,
  })
  const participantRoster = buildMvpParticipantRoster({ requirements: participantRequirements, participants })
  const documentRoster = buildMvpDocumentRoster({ requiredDocuments: transactionRequiredDocuments, documentRequests })
  const participantCreationBlockers = participantRoster.creationBlockers.map((blocker) => ({
    id: `missing-${blocker.key}`,
    type: 'missing_role_assignment',
    title: `${blocker.roleKey.replace(/_/g, ' ')} assignment missing`,
    description: blocker.reason,
    blockingRole: blocker.ownerRole,
    visibility: 'internal',
    relatedEntityType: 'transaction_participant_requirement',
    relatedEntityId: blocker.roleKey,
  }))
  const documentRequirementBlockers = documentRoster.blockers.map((blocker) => ({
    id: `missing-${blocker.key}`,
    type: 'document_missing',
    title: blocker.documentKey.replace(/_/g, ' '),
    description: blocker.reason,
    blockingRole: blocker.ownerRole,
    visibility: 'shared_role_players',
    relatedEntityType: 'transaction_required_document',
    relatedEntityId: blocker.documentKey,
  }))

  const blockers = [...laneBlockers, ...assignmentBlockers, ...participantCreationBlockers, ...documentRequirementBlockers]

  const milestones = buildClientVisibleMilestones({
    transaction,
    documentRequests,
    events,
  })

  const { nextInternalActions, nextClientActions } = buildNextActions({ blockers })
  const mvpTruth = buildMvpTransactionTruth({
    transaction,
    routingProfile: transaction.routingProfile || {
      transactionType: transaction.transactionType,
      financeType: transaction.financeType,
      propertyTenure: transaction.propertyTenure,
      buyerEntityType: transaction.purchaserType,
      sellerEntityType: transaction.sellerEntityType,
      requiresCancellationAttorney: transaction.sellerHasExistingBond,
    },
    participants,
    documentRequirements: documentRoster.requirements,
    workflowLanes: lanes,
    events,
  })
  const gatedLanes = mvpTruth.workflow?.lanes || lanes
  const mvpTransactionHealth = buildMvpTransactionHealthPanel({
    truth: mvpTruth,
    transaction,
    participantRoster,
    documentRoster,
  })
  const mvpAudit = buildMvpTransactionAuditRecovery({
    transaction,
    truth: mvpTruth,
    health: mvpTransactionHealth,
    participantRoster,
    documentRoster,
    warnings,
  })
  const mvpControlBoard = {
    ...buildMvpTransactionControlBoard(mvpTruth),
    health: mvpTransactionHealth,
    audit: mvpAudit,
  }
  return {
    transaction,
    mainStage: {
      key: normalizeMainStage(transaction.currentMainStage),
      label: getMainStageLabel(transaction.currentMainStage),
    },
    detailedStage: {
      key: normalizeDetailedStage(transaction.stage),
      label: normalizeDetailedStage(transaction.stage),
    },
    lanes: gatedLanes,
    checklistItems,
    documentRequests,
    transactionRequiredDocuments,
    documentRoster,
    rolePlayers: participants,
    participantRequirements,
    participantRoster,
    blockers,
    clientVisibleMilestones: milestones,
    nextInternalActions,
    nextClientActions,
    sharedProgress,
    warnings,
    coordination,
    mvpTruth,
    mvpControlBoard,
    mvpTransactionHealth,
    mvpAudit,
    meta: {
      generatedAt: toIsoString(new Date()),
      schemaWarnings: warnings.length,
    },
  }
}
