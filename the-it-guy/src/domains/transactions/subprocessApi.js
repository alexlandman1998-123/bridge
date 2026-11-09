// transactions owns these operations and their existing recovery behavior.
import { getOrCreateTransactionOnboardingRecord } from '../onboarding/workflow.js'
import { logTransactionEventIfPossible, publishWorkflowChangedIfPossible } from './eventActions.js'
import { resolveActiveProfileContext } from '../access/actorContext.js'
import { buildDefaultSubprocessState, getSubprocessTemplate, normalizeWorkflowProcessType } from './workspaceReadApi.js'
import { isOptionalRelationKnownMissing, rememberMissingOptionalRelation } from '../../lib/api/shared/schemaReadCompatibility.js'
import { normalizeNullableText, isUuidLike, requireClient, isMissingTableError, isMissingColumnError, isMissingSchemaError } from '../../lib/api/shared/readHelpers.js'
import { normalizeMainStage } from '../../core/transactions/legacyReadModel.js'
import { normalizeStageLabel } from '../../core/transactions/stageConfig'
import { normalizeFinanceType } from '../../core/transactions/financeType'
import { resolveSalesWorkflowSnapshot } from '../../core/transactions/salesWorkflow'
import { SUBPROCESS_DEFAULT_OWNERS, SUBPROCESS_STEP_STATUSES } from '../../core/transactions/roleConfig'
import { normalizeRoleType } from '../../core/transactions/permissions'
import { resolveWorkflowLanePermissions } from '../../core/workflows/permissions'
import { OPERATIONAL_STEP_DEFINITIONS, getOperationalStepDefinition } from '../../core/workflows/operationalStepMapping.js'
import { syncOperationalChecklistForLane as syncOperationalChecklistForLaneService, syncOperationalChecklistForTransaction as syncOperationalChecklistForTransactionService } from '../../services/transactionOperationalChecklistService'
import { publishTransactionSharedProgress } from '../../services/transactionSharedProgressService.js'

const WORKFLOW_COMMENT_META_PREFIX = '__bridge_workflow_meta__'

export function normalizeSubprocessStepStatus(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return SUBPROCESS_STEP_STATUSES.includes(normalized) ? normalized : 'not_started'
}

export function parseWorkflowStepComment(value) {
  const rawValue = String(value || '')
  const trimmedValue = rawValue.trim()

  if (!trimmedValue.startsWith(WORKFLOW_COMMENT_META_PREFIX)) {
    return {
      note: rawValue.trim(),
      checklist: {},
    }
  }

  const newlineIndex = trimmedValue.indexOf('\n')
  const metaSource =
    newlineIndex >= 0
      ? trimmedValue.slice(WORKFLOW_COMMENT_META_PREFIX.length, newlineIndex).trim()
      : trimmedValue.slice(WORKFLOW_COMMENT_META_PREFIX.length).trim()
  const note = newlineIndex >= 0 ? trimmedValue.slice(newlineIndex + 1).trim() : ''

  try {
    const parsed = JSON.parse(metaSource || '{}')
    return {
      note,
      checklist: parsed?.checklist && typeof parsed.checklist === 'object' ? parsed.checklist : {},
    }
  } catch {
    return {
      note: rawValue.replace(WORKFLOW_COMMENT_META_PREFIX, '').trim(),
      checklist: {},
    }
  }
}

export function buildWorkflowStepComment({ note = '', checklist = {} } = {}) {
  const normalizedNote = String(note || '').trim()
  const normalizedChecklist = Object.entries(checklist || {}).reduce((accumulator, [key, checked]) => {
    accumulator[key] = Boolean(checked)
    return accumulator
  }, {})

  const hasChecklistData = Object.keys(normalizedChecklist).length > 0
  if (!hasChecklistData) {
    return normalizedNote
  }

  const meta = JSON.stringify({ checklist: normalizedChecklist })
  return `${WORKFLOW_COMMENT_META_PREFIX}${meta}${normalizedNote ? `\n${normalizedNote}` : ''}`
}

function getWorkflowStepVisibleComment(value) {
  return parseWorkflowStepComment(value).note
}

const WORKFLOW_SUBPROCESS_SORT_ORDER = ['finance', 'transfer', 'bond', 'attorney']

export const LEGACY_TRANSFER_STEP_KEY_ALIASES = {
  fica_review: 'fica_received',
  buyer_signed_transfer_documents: 'buyer_signed_documents',
  seller_signed_transfer_documents: 'seller_signed_documents',
}

function shouldIncludeLevyClearanceSteps(propertyType = '') {
  const normalized = String(propertyType || '')
    .trim()
    .toLowerCase()
  return normalized.includes('sectional')
}

export function summarizeSubprocess(process) {
  const steps = [...(process.steps || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
  const totalSteps = steps.length
  const completedSteps = steps.filter((step) => step.status === 'completed').length
  const inProgressStep = steps.find((step) => step.status === 'in_progress')
  const blockedStep = steps.find((step) => step.status === 'blocked')
  const nextStep = steps.find((step) => !['completed'].includes(step.status))
  const lastCompletedStep = [...steps].reverse().find((step) => step.status === 'completed')

  const waitingStep = blockedStep || inProgressStep || nextStep || null
  const visibleWaitingComment = getWorkflowStepVisibleComment(waitingStep?.comment)
  const summaryText = waitingStep
    ? visibleWaitingComment || `Waiting for ${String(waitingStep.step_label || '').toLowerCase()}`
    : 'Workflow complete'

  return {
    totalSteps,
    completedSteps,
    completionPercent: totalSteps ? Math.round((completedSteps / totalSteps) * 100) : 0,
    waitingStep,
    lastCompletedStep,
    summaryText,
  }
}

function resolveBaseSubprocessTypes(existingSubprocesses = []) {
  const hasTransfer = (existingSubprocesses || []).some((item) => item.process_type === 'transfer')
  const hasLegacyAttorney = (existingSubprocesses || []).some((item) => item.process_type === 'attorney')
  return ['finance', hasTransfer ? 'transfer' : hasLegacyAttorney ? 'attorney' : 'transfer']
}

export async function syncOperationalChecklistSafely(transactionId, { laneKey = null } = {}) {
  if (!transactionId) return null
  try {
    if (laneKey) {
      return await syncOperationalChecklistForLaneService(transactionId, laneKey)
    }
    return await syncOperationalChecklistForTransactionService(transactionId)
  } catch (error) {
    if (!isMissingSchemaError(error)) {
      console.warn('[workflow-checklist] Operational checklist sync failed', {
        transactionId,
        laneKey,
        error,
      })
    }
  }
  return null
}

function shouldActivateBondLane({
  financeType = 'cash',
  transaction = null,
  hasBondLane = false,
  hasBondAssignment = false,
} = {}) {
  if (hasBondLane) return true
  const normalizedFinanceType = normalizeFinanceType(financeType || 'cash')
  const financeRequiresBond = normalizedFinanceType === 'bond' || normalizedFinanceType === 'combination'
  if (!financeRequiresBond) return false

  const stage = normalizeStageLabel(transaction?.stage || 'Available')
  const mainStage = normalizeMainStage(transaction?.current_main_stage, stage)
  const hasFinanceToBondHandoffStage =
    stage === 'Bond Approved / Proof of Funds' || ['ATTY', 'XFER', 'REG'].includes(mainStage)

  return hasBondAssignment || hasFinanceToBondHandoffStage
}

async function hasBondAttorneyAssignmentForTransaction(client, transactionId) {
  const query = await client
    .from('transaction_attorney_assignments')
    .select('id, assignment_type, status')
    .eq('transaction_id', transactionId)
    .in('assignment_type', ['bond', 'transfer_and_bond'])
    .in('status', ['pending', 'active'])
    .limit(1)

  if (query.error) {
    if (isMissingTableError(query.error, 'transaction_attorney_assignments')) {
      return false
    }
    throw query.error
  }

  return Boolean((query.data || []).length)
}

export async function ensureTransactionSubprocesses(client, transactionId, { createIfMissing = true } = {}) {
  if (!transactionId) {
    return buildDefaultSubprocessState()
  }

  let transactionFinanceType = 'cash'
  let transactionMeta = null
  let includeLevyClearanceSteps = true
  let transactionMetaQuery = await client
    .from('transactions')
    .select('id, finance_type, stage, current_main_stage, property_type')
    .eq('id', transactionId)
    .maybeSingle()

  if (
    transactionMetaQuery.error &&
    (isMissingColumnError(transactionMetaQuery.error, 'current_main_stage') ||
      isMissingColumnError(transactionMetaQuery.error, 'property_type'))
  ) {
    transactionMetaQuery = await client
      .from('transactions')
      .select('id, finance_type, stage')
      .eq('id', transactionId)
      .maybeSingle()
  }

  if (!transactionMetaQuery.error && transactionMetaQuery.data) {
    transactionMeta = transactionMetaQuery.data
    transactionFinanceType = transactionMetaQuery.data.finance_type || 'cash'
    includeLevyClearanceSteps = shouldIncludeLevyClearanceSteps(transactionMetaQuery.data.property_type)
  } else if (transactionMetaQuery.error && !isMissingColumnError(transactionMetaQuery.error, 'finance_type')) {
    throw transactionMetaQuery.error
  }

  if (isOptionalRelationKnownMissing('transaction_subprocesses')) {
    return buildDefaultSubprocessState(transactionId, {
      financeType: transactionFinanceType,
      includeLevyClearanceSteps,
    })
  }

  let subprocessQuery = await client
    .from('transaction_subprocesses')
    .select('id, transaction_id, process_type, owner_type, status, created_at, updated_at')
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: true })

  if (subprocessQuery.error) {
    if (rememberMissingOptionalRelation('transaction_subprocesses', subprocessQuery.error) || isMissingSchemaError(subprocessQuery.error)) {
      return buildDefaultSubprocessState(transactionId, {
        financeType: transactionFinanceType,
        includeLevyClearanceSteps,
      })
    }

    throw subprocessQuery.error
  }

  let subprocesses = subprocessQuery.data || []
  let hasBondAssignment = false
  try {
    hasBondAssignment = await hasBondAttorneyAssignmentForTransaction(client, transactionId)
  } catch (assignmentError) {
    if (!isMissingSchemaError(assignmentError)) {
      throw assignmentError
    }
  }

  const hasBondLane = subprocesses.some((item) => item.process_type === 'bond')
  const requiredTypes = resolveBaseSubprocessTypes(subprocesses)
  if (
    shouldActivateBondLane({
      financeType: transactionFinanceType,
      transaction: transactionMeta,
      hasBondLane,
      hasBondAssignment,
    })
  ) {
    requiredTypes.push('bond')
  }

  const uniqueRequiredTypes = [...new Set(requiredTypes)]
  const subprocessByType = uniqueRequiredTypes.reduce((accumulator, processType) => {
    const existing = subprocesses.find((item) => item.process_type === processType)
    if (existing) {
      accumulator[processType] = existing
    }
    return accumulator
  }, {})

  const missingTypes = uniqueRequiredTypes.filter((processType) => !subprocessByType[processType])
  if (missingTypes.length) {
    if (!createIfMissing) {
      subprocesses = [
        ...subprocesses,
        ...missingTypes.map((processType) => ({
          id: `virtual-${transactionId}-${processType}`,
          transaction_id: transactionId,
          process_type: processType,
          owner_type: SUBPROCESS_DEFAULT_OWNERS[normalizeWorkflowProcessType(processType)] || 'internal',
          status: 'not_started',
          created_at: null,
          updated_at: null,
        })),
      ]
    } else {
      const patchRows = missingTypes.map((processType) => ({
        transaction_id: transactionId,
        process_type: processType,
        owner_type: SUBPROCESS_DEFAULT_OWNERS[normalizeWorkflowProcessType(processType)] || 'internal',
        status: 'not_started',
      }))

      const patchResult = await client
        .from('transaction_subprocesses')
        .upsert(patchRows, {
          onConflict: 'transaction_id,process_type',
          ignoreDuplicates: true,
        })
        .select('id, transaction_id, process_type, owner_type, status, created_at, updated_at')

      if (patchResult.error) {
        if (!isMissingSchemaError(patchResult.error)) {
          throw patchResult.error
        }
      } else if (patchResult.data?.length) {
        const byId = new Map(subprocesses.map((item) => [item.id, item]))
        for (const item of patchResult.data) {
          byId.set(item.id, item)
        }
        subprocesses = Array.from(byId.values())
      }
    }
  }

  const subprocessIds = subprocesses.map((item) => item.id).filter(Boolean)
  if (!subprocessIds.length) {
    return buildDefaultSubprocessState(transactionId, {
      financeType: transactionFinanceType,
      includeLevyClearanceSteps,
    })
  }

  const persistedSubprocessIds = subprocessIds.filter((id) => isUuidLike(id))
  let stepRows = []

  if (persistedSubprocessIds.length) {
    const stepQuery = await client
      .from('transaction_subprocess_steps')
      .select(
        'id, subprocess_id, step_key, step_label, status, completed_at, comment, owner_type, sort_order, created_at, updated_at',
      )
      .in('subprocess_id', persistedSubprocessIds)
      .order('sort_order', { ascending: true })

    if (stepQuery.error) {
      if (isMissingSchemaError(stepQuery.error)) {
        return buildDefaultSubprocessState(transactionId, {
          financeType: transactionFinanceType,
          includeLevyClearanceSteps,
        })
      }

      throw stepQuery.error
    }

    stepRows = stepQuery.data || []
  }

  const existingKeysBySubprocess = stepRows.reduce((accumulator, item) => {
    if (!accumulator[item.subprocess_id]) {
      accumulator[item.subprocess_id] = new Set()
    }
    accumulator[item.subprocess_id].add(item.step_key)
    return accumulator
  }, {})

  const missingStepRows = []
  for (const subprocess of subprocesses) {
    const template = getSubprocessTemplate(subprocess.process_type, {
      financeType: transactionFinanceType,
      includeLevyClearanceSteps,
    })
    const existingKeys = existingKeysBySubprocess[subprocess.id] || new Set()
    for (const step of template) {
      const legacyAliasKey = LEGACY_TRANSFER_STEP_KEY_ALIASES[step.key]
      if (!existingKeys.has(step.key) && (!legacyAliasKey || !existingKeys.has(legacyAliasKey))) {
        missingStepRows.push({
          subprocess_id: subprocess.id,
          step_key: step.key,
          step_label: step.label,
          status: 'not_started',
          owner_type:
            subprocess.owner_type ||
            SUBPROCESS_DEFAULT_OWNERS[normalizeWorkflowProcessType(subprocess.process_type)] ||
            'internal',
          sort_order: step.sortOrder,
        })
      }
    }
  }

  if (missingStepRows.length) {
    if (!createIfMissing) {
      stepRows = [
        ...stepRows,
        ...missingStepRows.map((row) => ({
          id: `virtual-${row.subprocess_id}-${row.step_key}`,
          ...row,
          completed_at: null,
          comment: null,
          created_at: null,
          updated_at: null,
        })),
      ]
    } else {
      const persistedMissingStepRows = missingStepRows.filter((row) => isUuidLike(row.subprocess_id))
      if (!persistedMissingStepRows.length) {
        return buildDefaultSubprocessState(transactionId, {
          financeType: transactionFinanceType,
          includeLevyClearanceSteps,
        })
      }

      const stepInsertResult = await client
        .from('transaction_subprocess_steps')
        .upsert(persistedMissingStepRows, {
          onConflict: 'subprocess_id,step_key',
          ignoreDuplicates: true,
        })
        .select(
          'id, subprocess_id, step_key, step_label, status, completed_at, comment, owner_type, sort_order, created_at, updated_at',
        )

      if (stepInsertResult.error) {
        if (!isMissingSchemaError(stepInsertResult.error)) {
          throw stepInsertResult.error
        }
      } else if (stepInsertResult.data?.length) {
        stepRows = [...stepRows, ...stepInsertResult.data]
      }
    }
  }

  const stepsBySubprocess = stepRows.reduce((accumulator, step) => {
    if (!accumulator[step.subprocess_id]) {
      accumulator[step.subprocess_id] = []
    }

    accumulator[step.subprocess_id].push({
      ...step,
      status: normalizeSubprocessStepStatus(step.status),
    })
    return accumulator
  }, {})

  const normalizedSubprocesses = subprocesses
    .sort(
      (a, b) =>
        WORKFLOW_SUBPROCESS_SORT_ORDER.indexOf(a.process_type) - WORKFLOW_SUBPROCESS_SORT_ORDER.indexOf(b.process_type),
    )
    .map((subprocess) => {
      const template = getSubprocessTemplate(subprocess.process_type, {
        financeType: transactionFinanceType,
        includeLevyClearanceSteps,
      })
      const templateByKey = new Map(template.map((step) => [step.key, step]))
      const visibleKeys = new Set(template.map((step) => step.key))
      const steps = (stepsBySubprocess[subprocess.id] || [])
        .filter(
          (step) =>
            visibleKeys.has(step.step_key) || Object.values(LEGACY_TRANSFER_STEP_KEY_ALIASES).includes(step.step_key),
        )
        .map((step) => ({
          ...step,
          step_label:
            templateByKey.get(step.step_key)?.label ||
            (Object.entries(LEGACY_TRANSFER_STEP_KEY_ALIASES).find(([, alias]) => alias === step.step_key)?.[0]
              ? templateByKey.get(
                  Object.entries(LEGACY_TRANSFER_STEP_KEY_ALIASES).find(([, alias]) => alias === step.step_key)?.[0],
                )?.label
              : null) ||
            step.step_label,
          sort_order:
            templateByKey.get(step.step_key)?.sortOrder ??
            (Object.entries(LEGACY_TRANSFER_STEP_KEY_ALIASES).find(([, alias]) => alias === step.step_key)?.[0]
              ? templateByKey.get(
                  Object.entries(LEGACY_TRANSFER_STEP_KEY_ALIASES).find(([, alias]) => alias === step.step_key)?.[0],
                )?.sortOrder
              : null) ??
            step.sort_order,
        }))
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      const summary = summarizeSubprocess({
        ...subprocess,
        steps,
      })

      return {
        ...subprocess,
        status: normalizeSubprocessStepStatus(subprocess.status),
        steps,
        summary,
      }
    })

  if (createIfMissing) {
    await syncOperationalChecklistSafely(transactionId)
  }

  return normalizedSubprocesses
}

async function fetchTransactionWorkflowDocumentsForSalesGate(client, transactionId) {
  let query = await client
    .from('documents')
    .select('id, transaction_id, name, category, document_type, stage_key, is_client_visible, created_at')
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: false })

  if (
    query.error &&
    (isMissingColumnError(query.error, 'document_type') ||
      isMissingColumnError(query.error, 'stage_key') ||
      isMissingColumnError(query.error, 'is_client_visible'))
  ) {
    query = await client
      .from('documents')
      .select('id, transaction_id, name, category, created_at')
      .eq('transaction_id', transactionId)
      .order('created_at', { ascending: false })
  }

  if (query.error) {
    if (isMissingSchemaError(query.error)) {
      return []
    }
    throw query.error
  }

  return query.data || []
}

async function fetchSalesRequiredDocumentsForGate(client, transactionId) {
  let query = await client
    .from('transaction_required_documents')
    .select('id, status, is_uploaded, is_required, enabled')
    .eq('transaction_id', transactionId)

  if (query.error && (isMissingColumnError(query.error, 'status') || isMissingColumnError(query.error, 'enabled'))) {
    query = await client
      .from('transaction_required_documents')
      .select('id, is_uploaded, is_required')
      .eq('transaction_id', transactionId)
  }

  if (query.error) {
    if (isMissingSchemaError(query.error)) {
      return []
    }
    throw query.error
  }

  return query.data || []
}

async function computeSalesWorkflowGateSnapshot(client, transactionId) {
  if (!transactionId) {
    return null
  }

  let transactionQuery = await client
    .from('transactions')
    .select('id, purchaser_type, onboarding_completed_at, external_onboarding_submitted_at')
    .eq('id', transactionId)
    .maybeSingle()

  if (
    transactionQuery.error &&
    (isMissingColumnError(transactionQuery.error, 'purchaser_type') ||
      isMissingColumnError(transactionQuery.error, 'onboarding_completed_at') ||
      isMissingColumnError(transactionQuery.error, 'external_onboarding_submitted_at'))
  ) {
    transactionQuery = await client
      .from('transactions')
      .select('id, purchaser_type')
      .eq('id', transactionId)
      .maybeSingle()
  }

  if (transactionQuery.error) {
    if (isMissingSchemaError(transactionQuery.error)) {
      return null
    }
    throw transactionQuery.error
  }

  const transaction = transactionQuery.data || null
  if (!transaction) {
    return null
  }

  const onboardingRecord = await getOrCreateTransactionOnboardingRecord(
    client,
    {
      transactionId,
      purchaserType: transaction.purchaser_type || 'individual',
    },
    { createIfMissing: false },
  )

  const [documents, requiredDocuments] = await Promise.all([
    fetchTransactionWorkflowDocumentsForSalesGate(client, transactionId),
    fetchSalesRequiredDocumentsForGate(client, transactionId),
  ])

  return resolveSalesWorkflowSnapshot({
    onboardingStatus: onboardingRecord?.status || 'Not Started',
    onboardingCompletedAt: transaction?.onboarding_completed_at || null,
    externalOnboardingSubmittedAt: transaction?.external_onboarding_submitted_at || null,
    documents,
    requiredDocuments,
  })
}

async function assertSalesWorkflowReadyForFinanceTransition(client, transactionId) {
  const snapshot = await computeSalesWorkflowGateSnapshot(client, transactionId)
  if (!snapshot || snapshot.readyForFinance) {
    return snapshot
  }

  const blockers = []
  if (!snapshot.onboardingComplete) {
    blockers.push('Client onboarding is not completed.')
  }
  if (!snapshot.signedOtpReceived) {
    blockers.push('Signed OTP has not been uploaded.')
  }
  if (!snapshot.supportingDocsComplete) {
    blockers.push('Supporting documentation is still incomplete.')
  }

  throw new Error(`Sales Workflow must be Ready for Finance before finance can start. ${blockers.join(' ')}`.trim())
}

function isFinanceReadyForTransferFromSubprocesses(subprocesses = []) {
  const financeProcess = (subprocesses || []).find((item) => item?.process_type === 'finance') || null
  const financeSteps = financeProcess?.steps || []
  return financeSteps.some(
    (step) =>
      String(step?.status || '')
        .trim()
        .toLowerCase() === 'completed' &&
      ['ready_for_transfer', 'bond_instruction_sent_to_attorneys'].includes(step?.step_key),
  )
}

async function assertTransferWorkflowReadyForTransition(client, transactionId) {
  const salesSnapshot = await computeSalesWorkflowGateSnapshot(client, transactionId)
  const subprocesses = await ensureTransactionSubprocesses(client, transactionId, {
    createIfMissing: false,
  })
  const financeReadyForTransfer = isFinanceReadyForTransferFromSubprocesses(subprocesses)

  const blockers = []
  if (!salesSnapshot?.readyForFinance) {
    blockers.push('Sales Workflow is not complete yet.')
  }
  if (!financeReadyForTransfer) {
    blockers.push('Finance Workflow is not marked Ready for Transfer.')
  }
  if (!salesSnapshot?.signedOtpReceived) {
    blockers.push('Signed contract / OTP is not available in transaction documents.')
  }

  if (!blockers.length) {
    return {
      salesReadyForFinance: Boolean(salesSnapshot?.readyForFinance),
      financeReadyForTransfer,
      signedOtpReceived: Boolean(salesSnapshot?.signedOtpReceived),
    }
  }

  throw new Error(
    `Transfer workflow unlocks once Finance is completed and the matter is ready for attorney processing. ${blockers.join(' ')}`.trim(),
  )
}

function resolveLaneKeyFromProcessType(processType) {
  const normalizedType = String(processType || '')
    .trim()
    .toLowerCase()
  if (normalizedType === 'finance') {
    return 'finance'
  }
  if (normalizedType === 'attorney' || normalizedType === 'transfer') {
    return 'transfer'
  }
  if (normalizedType === 'bond') {
    return 'bond'
  }
  return ''
}

function canEditWorkflowLaneFromParticipantRow({ laneKey, actorRole, participantRow }) {
  if (!laneKey || !participantRow) {
    return false
  }

  const lanePermissions = resolveWorkflowLanePermissions(laneKey, {
    actorRole,
    canEditCoreTransaction: Boolean(participantRow.can_edit_core_transaction),
    canEditFinanceWorkflow: Boolean(participantRow.can_edit_finance_workflow),
    canEditAttorneyWorkflow: Boolean(participantRow.can_edit_attorney_workflow),
    isFinanceOwner: normalizeRoleType(actorRole) === 'bond_originator',
    isTransactionOwner: Boolean(participantRow.can_edit_core_transaction),
  })

  return lanePermissions.canEditWorkflowLane
}

async function canAttorneyEditLaneByAssignment(client, { transactionId, laneKey, actorRole, actorUserId = null } = {}) {
  const normalizedActorRole = normalizeRoleType(actorRole)
  const normalizedLaneKey = String(laneKey || '')
    .trim()
    .toLowerCase()

  if (normalizedActorRole !== 'attorney') return true
  if (!['transfer', 'bond', 'cancellation'].includes(normalizedLaneKey)) return true
  if (!transactionId) return false

  const query = await client
    .from('transaction_attorney_assignments')
    .select(
      'id, assignment_type, attorney_role, status, assignment_status, is_primary, attorney_user_id, primary_attorney_id, secretary_id, admin_handler_id, can_update_workflow_lane',
    )
    .eq('transaction_id', transactionId)
    .in('assignment_status', ['pending', 'active'])

  if (query.error) {
    if (isMissingSchemaError(query.error) || isMissingTableError(query.error, 'transaction_attorney_assignments')) {
      return false
    }
    throw query.error
  }

  const assignments = Array.isArray(query.data) ? query.data : []
  if (!assignments.length) {
    return false
  }

  const allowedAssignmentTypes =
    normalizedLaneKey === 'bond'
      ? new Set(['bond', 'transfer_and_bond', 'bond_attorney'])
      : normalizedLaneKey === 'cancellation'
        ? new Set(['cancellation', 'cancellation_attorney'])
        : new Set(['transfer', 'transfer_and_bond', 'transfer_attorney'])

  const matchingAssignments = assignments.filter((item) =>
    allowedAssignmentTypes.has(
      String(item?.attorney_role || item?.assignment_type || '')
        .trim()
        .toLowerCase(),
    ),
  )

  if (!matchingAssignments.length) {
    return false
  }

  if (!actorUserId) {
    return false
  }

  return matchingAssignments.some(
    (item) =>
      item?.can_update_workflow_lane !== false &&
      [item?.attorney_user_id, item?.primary_attorney_id, item?.secretary_id, item?.admin_handler_id].some(
        (participantId) => participantId && String(participantId) === String(actorUserId),
      ),
  )
}

async function assertGuidedSubprocessSequentialTransition(client, { subprocessId, stepId, nextStatus, laneLabel }) {
  if (!subprocessId || !stepId) {
    return
  }

  const normalizedStatus = normalizeSubprocessStepStatus(nextStatus)
  if (normalizedStatus === 'not_started') {
    return
  }

  const financeStepsQuery = await client
    .from('transaction_subprocess_steps')
    .select('id, step_key, step_label, status, sort_order')
    .eq('subprocess_id', subprocessId)
    .order('sort_order', { ascending: true })

  if (financeStepsQuery.error) {
    if (isMissingSchemaError(financeStepsQuery.error)) {
      return
    }
    throw financeStepsQuery.error
  }

  const steps = (financeStepsQuery.data || []).map((step) => ({
    ...step,
    status: normalizeSubprocessStepStatus(step.status),
  }))

  if (!steps.length) {
    return
  }

  const targetIndex = steps.findIndex((step) => String(step.id) === String(stepId))
  if (targetIndex < 0) {
    throw new Error('Finance workflow step was not found for this transaction.')
  }

  const firstIncompleteIndex = steps.findIndex((step) => step.status !== 'completed')
  if (firstIncompleteIndex === -1) {
    throw new Error('Finance Workflow is already complete.')
  }

  if (targetIndex !== firstIncompleteIndex) {
    const currentStepLabel = steps[firstIncompleteIndex]?.step_label || 'the active finance stage'
    throw new Error(
      `${laneLabel || 'Workflow'} is controlled. Complete "${currentStepLabel}" before updating later stages.`,
    )
  }
}

export async function updateTransactionSubprocessStep({
  transactionId,
  subprocessId,
  stepId,
  status,
  comment,
  completedAt,
  actorRole,
  skipPermissionCheck = false,
  allowAnyWorkflowEdit = false,
}) {
  const client = requireClient()
  let resolvedSubprocessType = null
  let actorProfile = null

  if (!transactionId) {
    throw new Error('Transaction id is required.')
  }

  if (!stepId) {
    throw new Error('Step id is required.')
  }

  const normalizedActorRole = actorRole ? normalizeRoleType(actorRole) : null
  if (normalizedActorRole) {
    actorProfile = await resolveActiveProfileContext(client)
  }

  if (!skipPermissionCheck && normalizedActorRole && subprocessId) {
    const hasWorkspaceOverride =
      allowAnyWorkflowEdit && ['developer', 'internal_admin', 'agent'].includes(normalizedActorRole)
    if (hasWorkspaceOverride) {
      // Explicit workspace override: keep subprocess editing operational without lane-level locking.
    } else {
      const subprocessLookup = await client
        .from('transaction_subprocesses')
        .select('id, process_type')
        .eq('id', subprocessId)
        .maybeSingle()

      if (subprocessLookup.error && !isMissingSchemaError(subprocessLookup.error)) {
        throw subprocessLookup.error
      }

      if (subprocessLookup.data) {
        resolvedSubprocessType = subprocessLookup.data.process_type || null
        const participantLookup = await client
          .from('transaction_participants')
          .select('role_type, can_edit_finance_workflow, can_edit_attorney_workflow, can_edit_core_transaction')
          .eq('transaction_id', transactionId)
          .eq('role_type', normalizedActorRole)
          .maybeSingle()

        if (participantLookup.error && !isMissingSchemaError(participantLookup.error)) {
          throw participantLookup.error
        }

        if (participantLookup.data) {
          const laneKey = resolveLaneKeyFromProcessType(subprocessLookup.data.process_type)
          const canEdit = canEditWorkflowLaneFromParticipantRow({
            laneKey,
            actorRole: normalizedActorRole,
            participantRow: participantLookup.data,
          })

          const assignmentCanEdit = await canAttorneyEditLaneByAssignment(client, {
            transactionId,
            laneKey,
            actorRole: normalizedActorRole,
            actorUserId: actorProfile?.userId || null,
          })

          if (!canEdit || !assignmentCanEdit) {
            const laneLabel =
              subprocessLookup.data.process_type === 'finance'
                ? 'Finance Workflow'
                : subprocessLookup.data.process_type === 'bond'
                  ? 'Bond Workflow'
                  : 'Transfer Workflow'
            throw new Error(`Your role does not have permission to update ${laneLabel}.`)
          }
        }
      }
    }
  }

  if (!resolvedSubprocessType && subprocessId) {
    const subprocessTypeLookup = await client
      .from('transaction_subprocesses')
      .select('process_type')
      .eq('id', subprocessId)
      .maybeSingle()

    if (subprocessTypeLookup.error && !isMissingSchemaError(subprocessTypeLookup.error)) {
      throw subprocessTypeLookup.error
    }

    resolvedSubprocessType = subprocessTypeLookup.data?.process_type || null
  }

  const normalizedStatus = normalizeSubprocessStepStatus(status)
  if (!SUBPROCESS_STEP_STATUSES.includes(normalizedStatus)) {
    throw new Error('Invalid step status.')
  }

  if (resolvedSubprocessType === 'finance' && normalizedStatus !== 'not_started') {
    await assertSalesWorkflowReadyForFinanceTransition(client, transactionId)
    await assertGuidedSubprocessSequentialTransition(client, {
      subprocessId,
      stepId,
      nextStatus: normalizedStatus,
      laneLabel: 'Finance Workflow',
    })
  }

  if (
    (resolvedSubprocessType === 'attorney' || resolvedSubprocessType === 'transfer') &&
    normalizedStatus !== 'not_started'
  ) {
    await assertTransferWorkflowReadyForTransition(client, transactionId)
    await assertGuidedSubprocessSequentialTransition(client, {
      subprocessId,
      stepId,
      nextStatus: normalizedStatus,
      laneLabel: 'Transfer Workflow',
    })
  }

  if (resolvedSubprocessType === 'bond' && normalizedStatus !== 'not_started') {
    await assertTransferWorkflowReadyForTransition(client, transactionId)
    await assertGuidedSubprocessSequentialTransition(client, {
      subprocessId,
      stepId,
      nextStatus: normalizedStatus,
      laneLabel: 'Bond Workflow',
    })
  }

  const normalizedComment = normalizeNullableText(comment)
  const normalizedCompletedAt =
    normalizedStatus === 'completed' ? completedAt || new Date().toISOString() : completedAt || null

  const stepPayload = {
    status: normalizedStatus,
    comment: normalizedComment,
    completed_at: normalizedCompletedAt,
    updated_at: new Date().toISOString(),
  }

  const updateResult = await client
    .from('transaction_subprocess_steps')
    .update(stepPayload)
    .eq('id', stepId)
    .select(
      'id, subprocess_id, step_key, step_label, status, completed_at, comment, owner_type, sort_order, updated_at',
    )
    .single()

  if (updateResult.error) {
    if (isMissingSchemaError(updateResult.error)) {
      throw new Error('Sub-process tables are not set up yet. Run sql/schema.sql and refresh.')
    }
    throw updateResult.error
  }

  const refreshedSubprocesses = await ensureTransactionSubprocesses(client, transactionId)

  for (const process of refreshedSubprocesses) {
    const steps = process.steps || []
    const allCompleted = steps.length > 0 && steps.every((step) => step.status === 'completed')
    const hasBlocked = steps.some((step) => step.status === 'blocked')
    const hasStarted = steps.some((step) => ['in_progress', 'completed'].includes(step.status))
    const nextStatus = allCompleted ? 'completed' : hasBlocked ? 'blocked' : hasStarted ? 'in_progress' : 'not_started'

    let updateProcessResult = await client
      .from('transaction_subprocesses')
      .update({
        status: nextStatus,
        lane_status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', process.id)

    if (updateProcessResult.error && isMissingColumnError(updateProcessResult.error, 'lane_status')) {
      updateProcessResult = await client
        .from('transaction_subprocesses')
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq('id', process.id)
    }

    if (updateProcessResult.error && !isMissingSchemaError(updateProcessResult.error)) {
      throw updateProcessResult.error
    }
  }

  const financeSummary = refreshedSubprocesses.find((item) => item.process_type === 'finance')?.summary
  const transferSummary =
    refreshedSubprocesses.find((item) => item.process_type === 'transfer')?.summary ||
    refreshedSubprocesses.find((item) => item.process_type === 'attorney')?.summary
  const bondSummary = refreshedSubprocesses.find((item) => item.process_type === 'bond')?.summary
  const activeSummary =
    refreshedSubprocesses.find((item) => item.id === subprocessId)?.summary ||
    financeSummary ||
    transferSummary ||
    bondSummary ||
    null
  const workflowComment =
    getWorkflowStepVisibleComment(activeSummary?.waitingStep?.comment) ||
    (activeSummary?.waitingStep
      ? `Waiting for ${String(activeSummary.waitingStep.step_label || '').toLowerCase()}`
      : null)
  const subprocessSummary = [
    financeSummary
      ? `FIN ${financeSummary.completedSteps}/${financeSummary.totalSteps}${financeSummary.waitingStep ? ` · ${financeSummary.summaryText}` : ''}`
      : null,
    transferSummary
      ? `XFER ${transferSummary.completedSteps}/${transferSummary.totalSteps}${transferSummary.waitingStep ? ` · ${transferSummary.summaryText}` : ''}`
      : null,
    bondSummary
      ? `BOND ${bondSummary.completedSteps}/${bondSummary.totalSteps}${bondSummary.waitingStep ? ` · ${bondSummary.summaryText}` : ''}`
      : null,
  ]
    .filter(Boolean)
    .join(' | ')

  const transactionPayload = {
    current_sub_stage_summary: subprocessSummary || null,
    comment: workflowComment || subprocessSummary || null,
    updated_at: new Date().toISOString(),
  }

  let syncResult = await client.from('transactions').update(transactionPayload).eq('id', transactionId)
  if (syncResult.error && isMissingColumnError(syncResult.error, 'comment')) {
    const fallbackPayload = { ...transactionPayload }
    delete fallbackPayload.comment
    syncResult = await client.from('transactions').update(fallbackPayload).eq('id', transactionId)
  }

  if (syncResult.error && isMissingColumnError(syncResult.error, 'current_sub_stage_summary')) {
    const fallbackPayload = { ...transactionPayload }
    delete fallbackPayload.current_sub_stage_summary
    delete fallbackPayload.comment
    syncResult = await client.from('transactions').update(fallbackPayload).eq('id', transactionId)
  }

  if (syncResult.error) {
    throw syncResult.error
  }

  await logTransactionEventIfPossible(client, {
    transactionId,
    eventType: 'WorkflowStepUpdated',
    createdByRole: normalizedActorRole || null,
    eventData: {
      subprocessId: updateResult.data?.subprocess_id || subprocessId,
      stepId: updateResult.data?.id || stepId,
      stepKey: updateResult.data?.step_key || null,
      status: normalizedStatus,
      completedAt: normalizedCompletedAt || null,
      comment: normalizedComment || null,
    },
  })

  await publishWorkflowChangedIfPossible(client, {
    transactionId,
    triggerType: 'workflow_step',
    triggerId: updateResult.data?.id || stepId,
    reasonCode:
      normalizedStatus === 'completed'
        ? 'workflow_step_completed'
        : normalizedStatus === 'not_started'
          ? 'workflow_step_reopened'
          : `workflow_step_${normalizedStatus}`,
    userId: actorProfile?.userId || null,
    source: 'transaction_subprocess_step_update',
    payload: {
      subprocessId: updateResult.data?.subprocess_id || subprocessId,
      stepKey: updateResult.data?.step_key || null,
      status: normalizedStatus,
    },
  })

  const progressLane = resolvedSubprocessType === 'attorney' ? 'transfer' : resolvedSubprocessType
  const progressStepKey = updateResult.data?.step_key || null
  const progressDefinition = getOperationalStepDefinition(progressLane, progressStepKey)
  if (progressDefinition?.sharedProgress) {
    const laneSteps = OPERATIONAL_STEP_DEFINITIONS[progressLane] || []
    const progressIndex = laneSteps.findIndex((step) => step.stepKey === progressStepKey)
    await publishTransactionSharedProgress({
      client,
      definition: progressDefinition.sharedProgress,
      transactionId,
      status: normalizedStatus,
      visibility: progressDefinition.sharedProgress.defaultVisibility,
      safeExplanation: normalizedStatus === 'blocked'
        ? 'This step is blocked while the responsible team resolves the issue.'
        : '',
      expectedNextStep: progressIndex >= 0 && progressIndex < laneSteps.length - 1
        ? laneSteps[progressIndex + 1].label
        : '',
      sourceType: 'transaction_subprocess_step',
      sourceId: updateResult.data?.id || stepId,
    })
  }

  return {
    step: updateResult.data,
    subprocesses: refreshedSubprocesses,
  }
}

export async function completeTransactionSubprocess({
  transactionId,
  subprocessId,
  processType = null,
  actorRole,
  skipPermissionCheck = false,
  allowAnyWorkflowEdit = false,
  completedAt = null,
}) {
  const client = requireClient()

  if (!transactionId) {
    throw new Error('Transaction id is required.')
  }

  if (!subprocessId) {
    throw new Error('Subprocess id is required.')
  }

  const normalizedActorRole = actorRole ? normalizeRoleType(actorRole) : null
  let actorProfile = null
  if (normalizedActorRole) {
    actorProfile = await resolveActiveProfileContext(client)
  }

  const subprocessLookup = await client
    .from('transaction_subprocesses')
    .select('id, transaction_id, process_type')
    .eq('id', subprocessId)
    .eq('transaction_id', transactionId)
    .maybeSingle()

  if (subprocessLookup.error) {
    if (isMissingSchemaError(subprocessLookup.error)) {
      throw new Error('Sub-process tables are not set up yet. Run sql/schema.sql and refresh.')
    }
    throw subprocessLookup.error
  }

  if (!subprocessLookup.data) {
    throw new Error('Workflow lane not found for this transaction.')
  }

  const resolvedProcessType = subprocessLookup.data.process_type || processType || null

  if (resolvedProcessType === 'finance') {
    await assertSalesWorkflowReadyForFinanceTransition(client, transactionId)
    throw new Error('Finance Workflow uses guided stage actions. Use the next-step action to continue this lane.')
  }

  if (resolvedProcessType === 'attorney' || resolvedProcessType === 'transfer') {
    await assertTransferWorkflowReadyForTransition(client, transactionId)
    throw new Error('Transfer Workflow uses guided stage actions. Use the next-step action to continue this lane.')
  }

  if (resolvedProcessType === 'bond') {
    await assertTransferWorkflowReadyForTransition(client, transactionId)
    throw new Error('Bond Workflow uses guided stage actions. Use the next-step action to continue this lane.')
  }

  if (!skipPermissionCheck && normalizedActorRole && resolvedProcessType) {
    const hasWorkspaceOverride =
      allowAnyWorkflowEdit && ['developer', 'internal_admin', 'agent'].includes(normalizedActorRole)
    if (!hasWorkspaceOverride) {
      const participantLookup = await client
        .from('transaction_participants')
        .select('role_type, can_edit_finance_workflow, can_edit_attorney_workflow, can_edit_core_transaction')
        .eq('transaction_id', transactionId)
        .eq('role_type', normalizedActorRole)
        .maybeSingle()

      if (participantLookup.error && !isMissingSchemaError(participantLookup.error)) {
        throw participantLookup.error
      }

      if (participantLookup.data) {
        const laneKey = resolveLaneKeyFromProcessType(resolvedProcessType)
        const canEdit = canEditWorkflowLaneFromParticipantRow({
          laneKey,
          actorRole: normalizedActorRole,
          participantRow: participantLookup.data,
        })

        const assignmentCanEdit = await canAttorneyEditLaneByAssignment(client, {
          transactionId,
          laneKey,
          actorRole: normalizedActorRole,
          actorUserId: actorProfile?.userId || null,
        })

        if (!canEdit || !assignmentCanEdit) {
          const laneLabel =
            resolvedProcessType === 'finance'
              ? 'Finance Workflow'
              : resolvedProcessType === 'bond'
                ? 'Bond Workflow'
                : 'Transfer Workflow'
          throw new Error(`Your role does not have permission to update ${laneLabel}.`)
        }
      }
    }
  }

  const workflowStepsQuery = await client
    .from('transaction_subprocess_steps')
    .select('id, status')
    .eq('subprocess_id', subprocessId)

  if (workflowStepsQuery.error) {
    if (isMissingSchemaError(workflowStepsQuery.error)) {
      throw new Error('Sub-process tables are not set up yet. Run sql/schema.sql and refresh.')
    }
    throw workflowStepsQuery.error
  }

  const stepRows = workflowStepsQuery.data || []
  const updatedSteps = stepRows.filter((step) => normalizeSubprocessStepStatus(step.status) !== 'completed').length

  const nowIso = completedAt || new Date().toISOString()
  const stepUpdateResult = await client
    .from('transaction_subprocess_steps')
    .update({
      status: 'completed',
      completed_at: nowIso,
      updated_at: nowIso,
    })
    .eq('subprocess_id', subprocessId)

  if (stepUpdateResult.error) {
    if (isMissingSchemaError(stepUpdateResult.error)) {
      throw new Error('Sub-process tables are not set up yet. Run sql/schema.sql and refresh.')
    }
    throw stepUpdateResult.error
  }

  const refreshedSubprocesses = await ensureTransactionSubprocesses(client, transactionId)

  for (const process of refreshedSubprocesses) {
    const steps = process.steps || []
    const allCompleted = steps.length > 0 && steps.every((step) => step.status === 'completed')
    const hasBlocked = steps.some((step) => step.status === 'blocked')
    const hasStarted = steps.some((step) => ['in_progress', 'completed'].includes(step.status))
    const nextStatus = allCompleted ? 'completed' : hasBlocked ? 'blocked' : hasStarted ? 'in_progress' : 'not_started'

    const updateProcessResult = await client
      .from('transaction_subprocesses')
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', process.id)

    if (updateProcessResult.error && !isMissingSchemaError(updateProcessResult.error)) {
      throw updateProcessResult.error
    }
  }

  const financeSummary = refreshedSubprocesses.find((item) => item.process_type === 'finance')?.summary
  const transferSummary =
    refreshedSubprocesses.find((item) => item.process_type === 'transfer')?.summary ||
    refreshedSubprocesses.find((item) => item.process_type === 'attorney')?.summary
  const bondSummary = refreshedSubprocesses.find((item) => item.process_type === 'bond')?.summary
  const activeSummary =
    refreshedSubprocesses.find((item) => item.id === subprocessId)?.summary ||
    financeSummary ||
    transferSummary ||
    bondSummary ||
    null
  const workflowComment =
    getWorkflowStepVisibleComment(activeSummary?.waitingStep?.comment) ||
    (activeSummary?.waitingStep
      ? `Waiting for ${String(activeSummary.waitingStep.step_label || '').toLowerCase()}`
      : null)
  const subprocessSummary = [
    financeSummary
      ? `FIN ${financeSummary.completedSteps}/${financeSummary.totalSteps}${financeSummary.waitingStep ? ` · ${financeSummary.summaryText}` : ''}`
      : null,
    transferSummary
      ? `XFER ${transferSummary.completedSteps}/${transferSummary.totalSteps}${transferSummary.waitingStep ? ` · ${transferSummary.summaryText}` : ''}`
      : null,
    bondSummary
      ? `BOND ${bondSummary.completedSteps}/${bondSummary.totalSteps}${bondSummary.waitingStep ? ` · ${bondSummary.summaryText}` : ''}`
      : null,
  ]
    .filter(Boolean)
    .join(' | ')

  const transactionPayload = {
    current_sub_stage_summary: subprocessSummary || null,
    comment: workflowComment || subprocessSummary || null,
    updated_at: new Date().toISOString(),
  }

  let syncResult = await client.from('transactions').update(transactionPayload).eq('id', transactionId)
  if (syncResult.error && isMissingColumnError(syncResult.error, 'comment')) {
    const fallbackPayload = { ...transactionPayload }
    delete fallbackPayload.comment
    syncResult = await client.from('transactions').update(fallbackPayload).eq('id', transactionId)
  }

  if (syncResult.error && isMissingColumnError(syncResult.error, 'current_sub_stage_summary')) {
    const fallbackPayload = { ...transactionPayload }
    delete fallbackPayload.current_sub_stage_summary
    delete fallbackPayload.comment
    syncResult = await client.from('transactions').update(fallbackPayload).eq('id', transactionId)
  }

  if (syncResult.error) {
    throw syncResult.error
  }

  await logTransactionEventIfPossible(client, {
    transactionId,
    eventType: 'WorkflowStepUpdated',
    createdByRole: normalizedActorRole || null,
    eventData: {
      subprocessId,
      processType: resolvedProcessType,
      status: 'completed',
      completedAt: nowIso,
      action: 'bulk_complete',
      updatedSteps,
    },
  })

  return {
    subprocesses: refreshedSubprocesses,
    updatedSteps,
  }
}
