import { normalizeFinanceType } from '../core/transactions/financeType'
import {
  getOperationalStepDefinition,
  getOperationalStepsForLane,
  isClientVisibleOperationalStep,
} from '../core/workflows/operationalStepMapping'
import {
  isMissingColumnError,
  isMissingTableError,
  requireClient,
} from './attorneyFirmServiceShared'

const WARNING_PREFIX = '[operational-checklist]'
const LEGACY_TRANSFER_STEP_ALIASES = {
  fica_review: 'fica_received',
  buyer_signed_transfer_documents: 'buyer_signed_documents',
  seller_signed_transfer_documents: 'seller_signed_documents',
}

function toLower(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function nowIso() {
  return new Date().toISOString()
}

function normalizeChecklistStatus(value, fallback = 'pending') {
  const normalized = toLower(value)
  if (['pending', 'in_progress', 'completed', 'blocked', 'waived'].includes(normalized)) {
    return normalized
  }
  return fallback
}

function normalizeChecklistPriority(value, fallback = 'required') {
  const normalized = toLower(value)
  if (['required', 'important', 'optional'].includes(normalized)) {
    return normalized
  }
  return fallback
}

function normalizeSubprocessStepStatus(value, fallback = 'not_started') {
  const normalized = toLower(value)
  if (['not_started', 'in_progress', 'completed', 'blocked'].includes(normalized)) {
    return normalized
  }
  return fallback
}

function normalizeLaneFromProcessType(processType) {
  const normalized = toLower(processType)
  if (normalized === 'attorney') return 'transfer'
  return normalized
}

function ownerRoleToParticipantRole(ownerRole) {
  const normalized = toLower(ownerRole)
  if (normalized === 'transfer_attorney' || normalized === 'bond_attorney') return 'attorney'
  return normalized
}

function getChecklistPriorityFromActionType(actionType) {
  const normalized = toLower(actionType)
  if (['milestone', 'internal_progress'].includes(normalized)) return 'important'
  return 'required'
}

function buildOperationalDedupeKey({ lane, stepKey, ownerRole }) {
  return `operational:${toLower(lane)}:${toLower(stepKey)}:${toLower(ownerRole)}`
}

function parseOperationalDedupeKey(value = '') {
  const parts = String(value || '').trim().split(':')
  if (parts.length < 4 || parts[0] !== 'operational') return null
  return {
    lane: parts[1] || '',
    stepKey: parts[2] || '',
    ownerRole: parts[3] || '',
  }
}

function findMatchingDocument(documents = [], requiredDocumentType = '') {
  if (!requiredDocumentType) return null
  const needle = toLower(requiredDocumentType)

  return (
    (documents || []).find((document) => {
      const status = toLower(document?.status)
      if (status === 'archived') return false
      const haystack = `${document?.document_type || ''} ${document?.category || ''} ${document?.name || ''}`.toLowerCase()
      return haystack.includes(needle)
    }) || null
  )
}

function findMatchingDocumentRequest(requests = [], requiredDocumentType = '') {
  if (!requiredDocumentType) return null
  const needle = toLower(requiredDocumentType)

  return (
    (requests || []).find((request) => {
      const haystack = `${request?.document_type || ''} ${request?.title || ''}`.toLowerCase()
      return haystack.includes(needle)
    }) || null
  )
}

function mapChecklistRow(row = {}) {
  return {
    id: row.id || null,
    transactionId: row.transaction_id || null,
    stage: row.stage || '',
    label: row.label || '',
    description: row.description || '',
    status: normalizeChecklistStatus(row.status),
    priority: normalizeChecklistPriority(row.priority),
    ownerRole: row.owner_role || 'attorney',
    ownerUserId: row.owner_user_id || null,
    linkedDocumentRequestId: row.linked_document_request_id || null,
    linkedDocumentId: row.linked_document_id || null,
    autoRuleKey: row.auto_rule_key || '',
    isAutoManaged: row.is_auto_managed === true,
    completedAt: row.completed_at || null,
    sortOrder: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }
}

function buildWarningsError(message, error = null) {
  const warning = error?.message ? `${message}: ${error.message}` : message
  console.warn(WARNING_PREFIX, warning)
  return warning
}

async function fetchTransactionContext(client, transactionId, warnings) {
  let query = await client
    .from('transactions')
    .select('id, finance_type, property_type, assigned_agent_email, assigned_attorney_email, assigned_bond_originator_email')
    .eq('id', transactionId)
    .maybeSingle()

  if (
    query.error &&
    (isMissingColumnError(query.error, 'property_type') ||
      isMissingColumnError(query.error, 'assigned_agent_email') ||
      isMissingColumnError(query.error, 'assigned_attorney_email') ||
      isMissingColumnError(query.error, 'assigned_bond_originator_email'))
  ) {
    query = await client
      .from('transactions')
      .select('id, finance_type')
      .eq('id', transactionId)
      .maybeSingle()
  }

  if (query.error) {
    warnings.push(buildWarningsError('Failed to load transaction for operational checklist', query.error))
    return null
  }

  return query.data || null
}

async function fetchSubprocessGraph(client, transactionId, warnings) {
  const subprocessQuery = await client
    .from('transaction_subprocesses')
    .select('id, transaction_id, process_type, owner_type, status, created_at')
    .eq('transaction_id', transactionId)

  if (subprocessQuery.error) {
    if (isMissingTableError(subprocessQuery.error, 'transaction_subprocesses')) {
      warnings.push(buildWarningsError('transaction_subprocesses table missing'))
      return []
    }
    warnings.push(buildWarningsError('Failed to load subprocesses', subprocessQuery.error))
    return []
  }

  const subprocesses = subprocessQuery.data || []
  const subprocessIds = subprocesses.map((item) => item.id).filter(Boolean)
  if (!subprocessIds.length) return []

  const stepsQuery = await client
    .from('transaction_subprocess_steps')
    .select('id, subprocess_id, step_key, step_label, status, sort_order, completed_at, comment')
    .in('subprocess_id', subprocessIds)

  if (stepsQuery.error) {
    if (isMissingTableError(stepsQuery.error, 'transaction_subprocess_steps')) {
      warnings.push(buildWarningsError('transaction_subprocess_steps table missing'))
      return subprocesses.map((item) => ({
        ...item,
        laneKey: normalizeLaneFromProcessType(item.process_type),
        steps: [],
      }))
    }
    warnings.push(buildWarningsError('Failed to load subprocess steps', stepsQuery.error))
    return []
  }

  const stepsBySubprocessId = (stepsQuery.data || []).reduce((accumulator, step) => {
    if (!accumulator[step.subprocess_id]) accumulator[step.subprocess_id] = []
    accumulator[step.subprocess_id].push({
      ...step,
      status: normalizeSubprocessStepStatus(step.status),
    })
    return accumulator
  }, {})

  return subprocesses.map((item) => ({
    ...item,
    laneKey: normalizeLaneFromProcessType(item.process_type),
    steps: (stepsBySubprocessId[item.id] || []).sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)),
  }))
}

async function fetchParticipants(client, transactionId, warnings) {
  const query = await client
    .from('transaction_participants')
    .select('id, transaction_id, user_id, role_type, status, participant_email')
    .eq('transaction_id', transactionId)

  if (query.error) {
    if (isMissingTableError(query.error, 'transaction_participants')) {
      warnings.push(buildWarningsError('transaction_participants table missing'))
      return []
    }
    warnings.push(buildWarningsError('Failed to load transaction participants', query.error))
    return []
  }

  return query.data || []
}

async function fetchChecklistRows(client, transactionId, warnings) {
  let query = await client
    .from('transaction_checklist_items')
    .select(
      'id, transaction_id, stage, label, description, status, priority, owner_role, owner_user_id, linked_document_request_id, linked_document_id, auto_rule_key, is_auto_managed, completed_at, sort_order, created_at, updated_at',
    )
    .eq('transaction_id', transactionId)

  if (
    query.error &&
    (isMissingColumnError(query.error, 'owner_user_id') ||
      isMissingColumnError(query.error, 'linked_document_request_id') ||
      isMissingColumnError(query.error, 'linked_document_id') ||
      isMissingColumnError(query.error, 'auto_rule_key') ||
      isMissingColumnError(query.error, 'is_auto_managed') ||
      isMissingColumnError(query.error, 'updated_at'))
  ) {
    query = await client
      .from('transaction_checklist_items')
      .select('id, transaction_id, stage, label, description, status, priority, owner_role, completed_at, sort_order, created_at')
      .eq('transaction_id', transactionId)
  }

  if (query.error) {
    if (isMissingTableError(query.error, 'transaction_checklist_items')) {
      warnings.push(buildWarningsError('transaction_checklist_items table missing'))
      return []
    }
    warnings.push(buildWarningsError('Failed to load checklist rows', query.error))
    return []
  }

  return (query.data || []).map(mapChecklistRow)
}

async function fetchDocuments(client, transactionId, warnings) {
  const query = await client
    .from('documents')
    .select('id, transaction_id, document_type, category, name, status, created_at')
    .eq('transaction_id', transactionId)

  if (query.error) {
    if (isMissingTableError(query.error, 'documents')) {
      warnings.push(buildWarningsError('documents table missing'))
      return []
    }
    warnings.push(buildWarningsError('Failed to load transaction documents', query.error))
    return []
  }

  return query.data || []
}

async function fetchDocumentRequests(client, transactionId, warnings) {
  const query = await client
    .from('document_requests')
    .select('id, transaction_id, document_type, title, status, assigned_to_role, visibility_scope, created_at')
    .eq('transaction_id', transactionId)

  if (query.error) {
    if (isMissingTableError(query.error, 'document_requests')) {
      warnings.push(buildWarningsError('document_requests table missing'))
      return []
    }
    warnings.push(buildWarningsError('Failed to load document requests', query.error))
    return []
  }

  return query.data || []
}

function getOwnerUserId(ownerRole, participants = []) {
  const participantRole = ownerRoleToParticipantRole(ownerRole)
  const participant = (participants || []).find(
    (item) =>
      toLower(item?.role_type) === participantRole &&
      !['removed', 'inactive'].includes(toLower(item?.status)),
  )
  return participant?.user_id || null
}

function resolveStepForDefinition(subprocess = null, definition = null) {
  if (!subprocess || !definition) return null
  const stepKey = toLower(definition.stepKey)
  const byCanonical = (subprocess.steps || []).find((step) => toLower(step.step_key) === stepKey)
  if (byCanonical) return byCanonical
  if (subprocess.laneKey === 'transfer' && LEGACY_TRANSFER_STEP_ALIASES[definition.stepKey]) {
    return (subprocess.steps || []).find(
      (step) => toLower(step.step_key) === toLower(LEGACY_TRANSFER_STEP_ALIASES[definition.stepKey]),
    ) || null
  }
  return null
}

function deriveChecklistStatus({ definition, linkedStep = null, linkedDocument = null }) {
  const stepStatus = normalizeSubprocessStepStatus(linkedStep?.status)
  if (stepStatus === 'completed') return 'completed'
  if (stepStatus === 'blocked') return 'blocked'
  if (stepStatus === 'in_progress') return 'in_progress'

  const actionType = toLower(definition?.actionType)
  const requiresDocument = ['document_upload', 'document_review'].includes(actionType) && Boolean(definition?.requiredDocumentType)
  if (requiresDocument && !linkedDocument?.id && ['in_progress', 'not_started'].includes(stepStatus)) {
    return 'blocked'
  }

  if (actionType === 'document_upload' && linkedDocument?.id) {
    return 'completed'
  }

  return 'pending'
}

function buildDesiredLaneChecklistItems({
  laneKey,
  subprocess = null,
  transaction = null,
  participants = [],
  documents = [],
  documentRequests = [],
}) {
  const rows = []
  const steps = getOperationalStepsForLane(laneKey, {
    financeType: transaction?.finance_type || 'cash',
    propertyType: transaction?.property_type || '',
  })

  for (const [index, definition] of steps.entries()) {
    const linkedStep = resolveStepForDefinition(subprocess, definition)
    if (!linkedStep) {
      continue
    }

    const linkedDocument = findMatchingDocument(documents, definition.requiredDocumentType)
    const linkedRequest = findMatchingDocumentRequest(documentRequests, definition.requiredDocumentType)
    const dedupeKey = buildOperationalDedupeKey({
      lane: laneKey,
      stepKey: definition.stepKey,
      ownerRole: definition.ownerRole,
    })

    rows.push({
      dedupeKey,
      laneKey,
      stepKey: definition.stepKey,
      stepLabel: linkedStep.step_label || definition.label,
      label: definition.label,
      description: definition.clientUpdateText || linkedStep.step_label || definition.label,
      status: deriveChecklistStatus({ definition, linkedStep, linkedDocument }),
      priority: getChecklistPriorityFromActionType(definition.actionType),
      ownerRole: definition.ownerRole,
      ownerUserId: getOwnerUserId(definition.ownerRole, participants),
      linkedDocumentId: linkedDocument?.id || null,
      linkedDocumentRequestId: linkedRequest?.id || null,
      sortOrder: Number(index + 1),
      actionType: definition.actionType,
      clientVisible: isClientVisibleOperationalStep(definition),
      clientUpdateText: definition.clientUpdateText || '',
      completionEventType: definition.completionEventType || 'workflow_step_completed',
      linkedSubprocessStepId: linkedStep.id || null,
    })
  }

  return rows
}

function buildAgentOversightChecklistItems({
  transaction = null,
  participants = [],
  checklistRows = [],
}) {
  const financeType = normalizeFinanceType(transaction?.finance_type || 'cash')
  const items = []
  const steps = getOperationalStepsForLane('agent_oversight', { financeType })

  const hasOnboardingComplete = Boolean(transaction?.onboarding_completed_at)
  const hasOtpSigned = (checklistRows || []).some((item) => toLower(item?.label).includes('signed otp') || toLower(item?.label).includes('otp'))
  const hasAttorneyAssigned = (participants || []).some(
    (item) => toLower(item?.role_type) === 'attorney' && !['removed', 'inactive'].includes(toLower(item?.status)),
  )
  const hasBondOriginatorAssigned = financeType === 'cash'
    ? true
    : (participants || []).some(
        (item) => toLower(item?.role_type) === 'bond_originator' && !['removed', 'inactive'].includes(toLower(item?.status)),
      )

  for (const [index, definition] of steps.entries()) {
    const dedupeKey = buildOperationalDedupeKey({
      lane: 'agent_oversight',
      stepKey: definition.stepKey,
      ownerRole: definition.ownerRole,
    })
    let status = 'pending'
    if (definition.stepKey === 'onboarding_completed' && hasOnboardingComplete) status = 'completed'
    if (definition.stepKey === 'otp_signed' && hasOtpSigned) status = 'completed'
    if (definition.stepKey === 'role_players_assigned' && hasAttorneyAssigned && hasBondOriginatorAssigned) status = 'completed'
    if (definition.stepKey === 'monitor_transaction_blockers') status = 'in_progress'

    items.push({
      dedupeKey,
      laneKey: 'agent_oversight',
      stepKey: definition.stepKey,
      stepLabel: definition.label,
      label: definition.label,
      description: definition.clientUpdateText || definition.label,
      status,
      priority: getChecklistPriorityFromActionType(definition.actionType),
      ownerRole: definition.ownerRole,
      ownerUserId: getOwnerUserId(definition.ownerRole, participants),
      linkedDocumentId: null,
      linkedDocumentRequestId: null,
      sortOrder: Number(index + 1),
      actionType: definition.actionType,
      clientVisible: false,
      clientUpdateText: '',
      completionEventType: definition.completionEventType || 'agent_oversight_updated',
      linkedSubprocessStepId: null,
    })
  }

  return items
}

function dedupeChecklistRowsByRuleKey(rows = []) {
  const byKey = new Map()
  for (const row of rows || []) {
    const key = row.autoRuleKey || `${row.stage}:${row.label}:${row.ownerRole}`
    if (!byKey.has(key)) {
      byKey.set(key, row)
    }
  }
  return byKey
}

async function logOperationalChecklistEvent(client, {
  transactionId,
  eventType = 'WorkflowStepUpdated',
  eventData = {},
  visibilityScope = 'internal',
} = {}) {
  if (!transactionId) return
  const insert = await client.from('transaction_events').insert({
    transaction_id: transactionId,
    event_type: eventType,
    event_data: eventData,
    visibility_scope: visibilityScope,
    created_at: nowIso(),
  })

  if (insert.error && !isMissingTableError(insert.error, 'transaction_events')) {
    console.warn(WARNING_PREFIX, 'Failed to log transaction event', insert.error)
  }
}

async function applyChecklistUpserts(client, transactionId, desiredRows = [], existingRows = [], warnings) {
  const now = nowIso()
  const existingByRuleKey = dedupeChecklistRowsByRuleKey(existingRows)
  const existingByFallbackKey = new Map(
    (existingRows || []).map((item) => [`${toLower(item.stage)}:${toLower(item.label)}:${toLower(item.ownerRole)}`, item]),
  )

  const insertRows = []
  const updateRows = []

  for (const row of desiredRows) {
    const fallbackKey = `${toLower(row.laneKey)}:${toLower(row.label)}:${toLower(row.ownerRole)}`
    const existing =
      existingByRuleKey.get(row.dedupeKey) ||
      existingByFallbackKey.get(fallbackKey) ||
      null

    if (!existing?.id) {
      insertRows.push({
        transaction_id: transactionId,
        stage: row.laneKey,
        label: row.label,
        description: row.description,
        status: row.status,
        priority: row.priority,
        owner_role: row.ownerRole,
        owner_user_id: row.ownerUserId || null,
        linked_document_request_id: row.linkedDocumentRequestId || null,
        linked_document_id: row.linkedDocumentId || null,
        auto_rule_key: row.dedupeKey,
        is_auto_managed: true,
        sort_order: row.sortOrder,
        created_at: now,
        updated_at: now,
      })
      continue
    }

    const nextStatus =
      existing.status === 'completed' && row.status !== 'completed'
        ? 'completed'
        : row.status

    const shouldUpdate =
      existing.label !== row.label ||
      (existing.description || '') !== (row.description || '') ||
      existing.ownerRole !== row.ownerRole ||
      String(existing.ownerUserId || '') !== String(row.ownerUserId || '') ||
      String(existing.linkedDocumentId || '') !== String(row.linkedDocumentId || '') ||
      String(existing.linkedDocumentRequestId || '') !== String(row.linkedDocumentRequestId || '') ||
      existing.priority !== row.priority ||
      existing.status !== nextStatus ||
      existing.stage !== row.laneKey ||
      (existing.autoRuleKey || '') !== row.dedupeKey ||
      Number(existing.sortOrder || 0) !== Number(row.sortOrder || 0)

    if (!shouldUpdate) continue

    updateRows.push({
      id: existing.id,
      stage: row.laneKey,
      label: row.label,
      description: row.description,
      status: nextStatus,
      priority: row.priority,
      owner_role: row.ownerRole,
      owner_user_id: row.ownerUserId || null,
      linked_document_request_id: row.linkedDocumentRequestId || null,
      linked_document_id: row.linkedDocumentId || null,
      auto_rule_key: row.dedupeKey,
      is_auto_managed: true,
      sort_order: row.sortOrder,
      updated_at: now,
      completed_at: nextStatus === 'completed' ? existing.completedAt || now : null,
    })
  }

  let inserted = []
  if (insertRows.length) {
    let insert = await client
      .from('transaction_checklist_items')
      .insert(insertRows)
      .select(
        'id, transaction_id, stage, label, description, status, priority, owner_role, owner_user_id, linked_document_request_id, linked_document_id, auto_rule_key, is_auto_managed, completed_at, sort_order, created_at, updated_at',
      )

    if (
      insert.error &&
      (isMissingColumnError(insert.error, 'owner_user_id') ||
        isMissingColumnError(insert.error, 'linked_document_request_id') ||
        isMissingColumnError(insert.error, 'linked_document_id') ||
        isMissingColumnError(insert.error, 'auto_rule_key') ||
        isMissingColumnError(insert.error, 'is_auto_managed') ||
        isMissingColumnError(insert.error, 'updated_at'))
    ) {
      insert = await client
        .from('transaction_checklist_items')
        .insert(
          insertRows.map((row) => ({
            transaction_id: row.transaction_id,
            stage: row.stage,
            label: row.label,
            description: row.description,
            status: row.status,
            priority: row.priority,
            owner_role: row.owner_role,
            sort_order: row.sort_order,
            created_at: row.created_at,
          })),
        )
        .select('id, transaction_id, stage, label, description, status, priority, owner_role, completed_at, sort_order, created_at')
    }

    if (insert.error) {
      warnings.push(buildWarningsError('Failed to insert operational checklist rows', insert.error))
    } else {
      inserted = (insert.data || []).map(mapChecklistRow)
    }
  }

  if (updateRows.length) {
    for (const row of updateRows) {
      let update = await client
        .from('transaction_checklist_items')
        .update({
          stage: row.stage,
          label: row.label,
          description: row.description,
          status: row.status,
          priority: row.priority,
          owner_role: row.owner_role,
          owner_user_id: row.owner_user_id,
          linked_document_request_id: row.linked_document_request_id,
          linked_document_id: row.linked_document_id,
          auto_rule_key: row.auto_rule_key,
          is_auto_managed: row.is_auto_managed,
          sort_order: row.sort_order,
          updated_at: row.updated_at,
          completed_at: row.completed_at,
        })
        .eq('id', row.id)

      if (
        update.error &&
        (isMissingColumnError(update.error, 'owner_user_id') ||
          isMissingColumnError(update.error, 'linked_document_request_id') ||
          isMissingColumnError(update.error, 'linked_document_id') ||
          isMissingColumnError(update.error, 'auto_rule_key') ||
          isMissingColumnError(update.error, 'is_auto_managed') ||
          isMissingColumnError(update.error, 'updated_at'))
      ) {
        update = await client
          .from('transaction_checklist_items')
          .update({
            stage: row.stage,
            label: row.label,
            description: row.description,
            status: row.status,
            priority: row.priority,
            owner_role: row.owner_role,
            sort_order: row.sort_order,
          })
          .eq('id', row.id)
      }

      if (update.error) {
        warnings.push(buildWarningsError(`Failed to update operational checklist item ${row.id}`, update.error))
      }
    }
  }

  if (inserted.length) {
    await logOperationalChecklistEvent(client, {
      transactionId,
      eventData: {
        source: 'operational_checklist_seed',
        insertedCount: inserted.length,
      },
    })
  }

  return {
    insertedCount: inserted.length,
    updatedCount: updateRows.length,
  }
}

function resolveActiveSubprocessesForSync(subprocesses = [], targetLaneKey = null) {
  const lanes = (subprocesses || []).filter((item) => ['finance', 'transfer', 'bond'].includes(item.laneKey))
  if (!targetLaneKey) return lanes
  return lanes.filter((item) => item.laneKey === targetLaneKey)
}

export async function syncOperationalChecklistForLane(transactionId, laneKey) {
  const result = await syncOperationalChecklistForTransaction(transactionId, {
    laneKey,
  })
  return result
}

export async function syncOperationalChecklistForTransaction(transactionId, options = {}) {
  const client = options.client || requireClient()
  const warnings = []
  const targetLane = options?.laneKey ? toLower(options.laneKey) : null
  if (!transactionId) {
    return { items: [], warnings: ['Transaction id is required.'], insertedCount: 0, updatedCount: 0 }
  }

  const transaction = await fetchTransactionContext(client, transactionId, warnings)
  if (!transaction?.id) {
    return { items: [], warnings, insertedCount: 0, updatedCount: 0 }
  }

  const [subprocesses, participants, existingChecklistRows, documents, documentRequests] = await Promise.all([
    fetchSubprocessGraph(client, transactionId, warnings),
    fetchParticipants(client, transactionId, warnings),
    fetchChecklistRows(client, transactionId, warnings),
    fetchDocuments(client, transactionId, warnings),
    fetchDocumentRequests(client, transactionId, warnings),
  ])

  const desiredRows = []
  const activeSubprocesses = resolveActiveSubprocessesForSync(subprocesses, targetLane)
  for (const subprocess of activeSubprocesses) {
    desiredRows.push(
      ...buildDesiredLaneChecklistItems({
        laneKey: subprocess.laneKey,
        subprocess,
        transaction,
        participants,
        documents,
        documentRequests,
      }),
    )
  }

  if (!targetLane || targetLane === 'agent_oversight') {
    desiredRows.push(
      ...buildAgentOversightChecklistItems({
        transaction,
        participants,
        checklistRows: existingChecklistRows,
      }),
    )
  }

  const { insertedCount, updatedCount } = await applyChecklistUpserts(
    client,
    transactionId,
    desiredRows,
    existingChecklistRows,
    warnings,
  )

  const refreshedRows = await fetchChecklistRows(client, transactionId, warnings)
  return {
    items: refreshedRows,
    warnings,
    insertedCount,
    updatedCount,
  }
}

export async function getOperationalChecklistForTransaction(transactionId) {
  const client = requireClient()
  const warnings = []
  const rows = await fetchChecklistRows(client, transactionId, warnings)

  const items = rows
    .filter((row) => String(row.autoRuleKey || '').startsWith('operational:'))
    .map((row) => {
      const parsed = parseOperationalDedupeKey(row.autoRuleKey)
      const definition = parsed ? getOperationalStepDefinition(parsed.lane, parsed.stepKey) : null
      return {
        ...row,
        laneKey: parsed?.lane || toLower(row.stage),
        stepKey: parsed?.stepKey || '',
        actionType: definition?.actionType || 'confirmation',
        clientVisible: Boolean(definition?.clientVisible),
        clientUpdateText: definition?.clientUpdateText || '',
        completionEventType: definition?.completionEventType || null,
      }
    })

  return {
    items,
    warnings,
  }
}

export async function getOperationalChecklistForRole(transactionId, role) {
  const normalizedRole = ownerRoleToParticipantRole(role)
  const result = await getOperationalChecklistForTransaction(transactionId)
  return {
    ...result,
    items: (result.items || []).filter((item) => ownerRoleToParticipantRole(item.ownerRole) === normalizedRole),
  }
}

async function resolveActorUserId(client) {
  const { data, error } = await client.auth.getUser()
  if (error) return null
  return data?.user?.id || null
}

async function fetchChecklistItemById(client, itemId) {
  let query = await client
    .from('transaction_checklist_items')
    .select(
      'id, transaction_id, stage, label, description, status, priority, owner_role, owner_user_id, linked_document_request_id, linked_document_id, auto_rule_key, is_auto_managed, completed_at, sort_order, created_at, updated_at',
    )
    .eq('id', itemId)
    .maybeSingle()

  if (
    query.error &&
    (isMissingColumnError(query.error, 'owner_user_id') ||
      isMissingColumnError(query.error, 'linked_document_request_id') ||
      isMissingColumnError(query.error, 'linked_document_id') ||
      isMissingColumnError(query.error, 'auto_rule_key') ||
      isMissingColumnError(query.error, 'is_auto_managed') ||
      isMissingColumnError(query.error, 'updated_at'))
  ) {
    query = await client
      .from('transaction_checklist_items')
      .select('id, transaction_id, stage, label, description, status, priority, owner_role, completed_at, sort_order, created_at')
      .eq('id', itemId)
      .maybeSingle()
  }

  if (query.error) {
    throw query.error
  }
  return query.data ? mapChecklistRow(query.data) : null
}

async function completeLinkedSubprocessStepFromChecklist(client, checklistRow) {
  const parsed = parseOperationalDedupeKey(checklistRow?.autoRuleKey || '')
  if (!parsed?.lane || !parsed?.stepKey) return null
  if (!['finance', 'transfer', 'bond'].includes(parsed.lane)) return null

  const subprocessQuery = await client
    .from('transaction_subprocesses')
    .select('id, process_type')
    .eq('transaction_id', checklistRow.transactionId)
    .in('process_type', parsed.lane === 'transfer' ? ['transfer', 'attorney'] : [parsed.lane])

  if (subprocessQuery.error || !(subprocessQuery.data || []).length) {
    return null
  }

  const subprocessIds = (subprocessQuery.data || []).map((item) => item.id)
  const stepKeys = parsed.lane === 'transfer' && LEGACY_TRANSFER_STEP_ALIASES[parsed.stepKey]
    ? [parsed.stepKey, LEGACY_TRANSFER_STEP_ALIASES[parsed.stepKey]]
    : [parsed.stepKey]

  const stepQuery = await client
    .from('transaction_subprocess_steps')
    .select('id, subprocess_id, step_key, status')
    .in('subprocess_id', subprocessIds)
    .in('step_key', stepKeys)
    .limit(1)

  if (stepQuery.error || !(stepQuery.data || []).length) {
    return null
  }

  const step = stepQuery.data[0]
  if (normalizeSubprocessStepStatus(step.status) === 'completed') {
    return step.id
  }

  const update = await client
    .from('transaction_subprocess_steps')
    .update({
      status: 'completed',
      completed_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq('id', step.id)

  if (update.error) {
    console.warn(WARNING_PREFIX, 'Failed to update linked subprocess step', update.error)
    return null
  }
  return step.id
}

export async function completeOperationalChecklistItem(itemId, payload = {}) {
  const client = requireClient()
  if (!itemId) throw new Error('Checklist item id is required.')

  const item = await fetchChecklistItemById(client, itemId)
  if (!item) {
    throw new Error('Checklist item not found.')
  }
  if (normalizeChecklistStatus(item.status) === 'completed') {
    return item
  }

  const actorUserId = await resolveActorUserId(client)
  const now = nowIso()
  const update = await client
    .from('transaction_checklist_items')
    .update({
      status: 'completed',
      completed_at: now,
      completed_by: actorUserId,
      override_reason: null,
      updated_at: now,
    })
    .eq('id', itemId)

  if (update.error) {
    throw update.error
  }

  await completeLinkedSubprocessStepFromChecklist(client, item)
  const parsed = parseOperationalDedupeKey(item.autoRuleKey || '')
  const definition = parsed ? getOperationalStepDefinition(parsed.lane, parsed.stepKey) : null
  await logOperationalChecklistEvent(client, {
    transactionId: item.transactionId,
    eventData: {
      source: 'operational_checklist_completed',
      checklistItemId: item.id,
      completionEventType: definition?.completionEventType || payload?.completionEventType || 'workflow_step_completed',
      lane: parsed?.lane || item.stage,
      stepKey: parsed?.stepKey || '',
    },
    visibilityScope: definition?.clientVisible ? 'client_visible' : 'internal',
  })

  return (await fetchChecklistItemById(client, itemId)) || item
}

export async function blockOperationalChecklistItem(itemId, reason = '') {
  const client = requireClient()
  if (!itemId) throw new Error('Checklist item id is required.')

  const now = nowIso()
  const update = await client
    .from('transaction_checklist_items')
    .update({
      status: 'blocked',
      override_reason: String(reason || '').trim() || 'Blocked by operational dependency.',
      updated_at: now,
    })
    .eq('id', itemId)

  if (update.error) {
    throw update.error
  }

  return fetchChecklistItemById(client, itemId)
}

export async function linkChecklistItemToDocument(itemId, documentId) {
  const client = requireClient()
  if (!itemId) throw new Error('Checklist item id is required.')
  if (!documentId) throw new Error('Document id is required.')

  const now = nowIso()
  const update = await client
    .from('transaction_checklist_items')
    .update({
      linked_document_id: documentId,
      status: 'completed',
      completed_at: now,
      updated_at: now,
    })
    .eq('id', itemId)

  if (update.error) {
    throw update.error
  }

  return fetchChecklistItemById(client, itemId)
}

export async function linkChecklistItemToDocumentRequest(itemId, requestId) {
  const client = requireClient()
  if (!itemId) throw new Error('Checklist item id is required.')
  if (!requestId) throw new Error('Document request id is required.')

  const update = await client
    .from('transaction_checklist_items')
    .update({
      linked_document_request_id: requestId,
      updated_at: nowIso(),
    })
    .eq('id', itemId)

  if (update.error) {
    throw update.error
  }

  return fetchChecklistItemById(client, itemId)
}
