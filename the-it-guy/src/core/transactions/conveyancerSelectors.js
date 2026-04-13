import { selectAttorneyRecentActivity } from './attorneySelectors'
import {
  ATTORNEY_OPERATIONAL_STAGE_SEQUENCE,
  deriveAttorneyOperationalStateForRow,
  getAttorneyWorkQueueForRows,
} from './attorneyOperationalEngine'

function buildMatterReference(transactionId) {
  return transactionId ? `TRX-${String(transactionId).replaceAll('-', '').slice(0, 8).toUpperCase()}` : 'Pending'
}

function isPrivateMatter(row) {
  const type = String(row?.transaction?.transaction_type || '').toLowerCase()
  return type === 'private' || (!row?.development?.id && !row?.unit?.id)
}

export function getMatterPropertyLabel(row) {
  if (!isPrivateMatter(row)) {
    return row?.development?.name || 'Unknown Development'
  }

  return (
    [
      row?.transaction?.property_address_line_1,
      row?.transaction?.suburb || row?.transaction?.city,
    ]
      .filter(Boolean)
      .join(', ') ||
    row?.transaction?.property_description ||
    'Private property matter'
  )
}

export function getMatterUnitLabel(row) {
  if (!isPrivateMatter(row)) {
    return row?.unit?.unit_number || '-'
  }

  return row?.transaction?.property_description || 'Private Matter'
}

export function getMatterDisplayLabel(row) {
  if (!isPrivateMatter(row)) {
    return `${getMatterPropertyLabel(row)} • Unit ${getMatterUnitLabel(row)}`
  }

  return getMatterPropertyLabel(row)
}

function getSignalText(row) {
  return `${row?.transaction?.next_action || ''} ${row?.transaction?.comment || ''} ${row?.stage || ''}`
    .toLowerCase()
    .trim()
}

function getCreatedAt(row) {
  return row?.transaction?.created_at || row?.unit?.created_at || null
}

function getUpdatedAt(row) {
  return (
    row?.transaction?.last_meaningful_activity_at ||
    row?.transaction?.updated_at ||
    row?.transaction?.created_at ||
    row?.unit?.updated_at ||
    row?.unit?.created_at ||
    null
  )
}

function getDaysSince(value) {
  const date = new Date(value || 0)
  if (Number.isNaN(date.getTime())) return 0
  const diff = Date.now() - date.getTime()
  if (!Number.isFinite(diff) || diff <= 0) return 0
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function normalizeLifecycleState(row) {
  const explicit = String(row?.transaction?.lifecycle_state || '').trim().toLowerCase()
  if (explicit) return explicit

  const currentMainStage = String(row?.transaction?.current_main_stage || '').toUpperCase()
  const stage = String(row?.transaction?.stage || '').toLowerCase()
  if (currentMainStage === 'REG' || stage === 'registered') return 'registered'
  if (row?.transaction?.is_active === false) return 'archived'
  return 'active'
}

function normalizeFinanceType(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return null
  if (normalized === 'combination') return 'hybrid'
  if (normalized === 'cash' || normalized === 'bond' || normalized === 'hybrid') return normalized
  return null
}

function getWaitingOnDisplayLabel(role, fallbackLabel = null) {
  if (fallbackLabel) return fallbackLabel

  switch (role) {
    case 'buyer':
      return 'Waiting on Buyer'
    case 'seller':
      return 'Waiting on Seller'
    case 'attorney':
      return 'Waiting on Attorney'
    case 'bank':
      return 'Waiting on Bank'
    case 'developer':
      return 'Waiting on Developer'
    case 'agent':
      return 'Waiting on Agent'
    case 'bond_originator':
      return 'Waiting on Bond Originator'
    case 'client':
      return 'Waiting on Client'
    default:
      return null
  }
}

function toQueueFilterStage(stageKey) {
  switch (stageKey) {
    case 'instruction_received':
    case 'fica_onboarding':
    case 'drafting':
    case 'signing':
      return 'awaiting_documents'
    case 'guarantees':
      return 'awaiting_bond'
    case 'clearances':
      return 'awaiting_clearance'
    case 'lodgement':
      return 'lodged'
    case 'registration_preparation':
      return 'ready_for_lodgement'
    case 'registered':
      return 'registered'
    default:
      return ''
  }
}

const PIPELINE_HELPER_TEXT = {
  instruction_received: 'File opened and transfer instructions captured.',
  fica_onboarding: 'Waiting for FICA and onboarding requirements.',
  drafting: 'Drafting or legal pack prep in progress.',
  signing: 'Signing sequence active and awaiting completion.',
  guarantees: 'Finance guarantees or bond outputs still pending.',
  clearances: 'Municipal, levy, or transfer duty clearances in flight.',
  lodgement: 'Matter lodged and waiting for deeds progression.',
  registration_preparation: 'Ready for lodgement and final filing checks.',
  registered: 'Matter fully registered and ready for close-out.',
}

const ATTENTION_DEFINITIONS = [
  {
    key: 'missing_required_documents',
    label: 'Missing required documents',
    description: 'Required request items are still open and blocking progression.',
    severity: 'warning',
    filter: { missingDocs: 'missing', stage: 'awaiting_documents' },
    matches: (record) => record.issueTypes.has('missing_required_documents'),
    previewLabel: (record) => `${record.requestSummary.requiredOpenCount || 1} required request(s) still open`,
  },
  {
    key: 'awaiting_guarantees',
    label: 'Awaiting guarantees',
    description: 'Guarantee outputs are incomplete before transfer can progress.',
    severity: 'warning',
    filter: { stage: 'awaiting_bond' },
    matches: (record) => record.issueTypes.has('guarantees_missing') || record.waitingOnRole === 'bank',
    previewLabel: () => 'Guarantee or bank confirmation still outstanding',
  },
  {
    key: 'awaiting_clearances',
    label: 'Awaiting clearance figures',
    description: 'Clearance certificates or duties are still pending.',
    severity: 'warning',
    filter: { stage: 'awaiting_clearance' },
    matches: (record) => record.issueTypes.has('clearance_missing'),
    previewLabel: () => 'Municipal or levy clearance still pending',
  },
  {
    key: 'no_recent_activity',
    label: 'No activity > 7 days',
    description: 'Files are stale and need an update or follow-up.',
    severity: 'risk',
    filter: { risk: 'stale' },
    matches: (record) => record.issueTypes.has('no_activity_risk') || record.daysSinceUpdate >= 7,
    previewLabel: (record) => `No movement for ${record.daysSinceUpdate} days`,
  },
  {
    key: 'blocked_files',
    label: 'Blocked files',
    description: 'These files have blockers preventing stage movement.',
    severity: 'critical',
    filter: { risk: 'blocked' },
    matches: (record) => record.stateKey === 'blocked' || record.blockers.length > 0,
    previewLabel: (record) => getPrimaryBlocker(record) || 'File blocked',
  },
  {
    key: 'waiting_on_attorney',
    label: 'Waiting on attorney',
    description: 'Files waiting for attorney progression or review.',
    severity: 'warning',
    filter: { risk: 'blocked' },
    matches: (record) => record.issueTypes.has('waiting_on_attorney'),
    previewLabel: (record) => record.waitingOnReason || 'Attorney action required',
  },
]

function getPrimaryBlocker(record) {
  const firstBlocker = record.blockers[0]
  if (firstBlocker?.description) return firstBlocker.description
  if (firstBlocker?.label) return firstBlocker.label
  if (record.requestSummary.requiredOpenCount > 0) {
    return `Waiting on ${record.requestSummary.requiredOpenCount} required document request(s)`
  }
  if (record.daysSinceUpdate >= 10) {
    return `No activity for ${record.daysSinceUpdate} days`
  }
  return ''
}

function getRiskStatus(record) {
  if (record.lifecycleState === 'cancelled') return 'Cancelled'
  if (record.lifecycleState === 'archived') return 'Archived'
  if (record.lifecycleState === 'completed') return 'Completed'
  if (record.stageKey === 'registered') return 'Closed'
  if (record.stateKey === 'blocked') return 'Critical'
  if (record.stateKey === 'at_risk' || record.daysSinceUpdate >= 10) return 'High'
  if (record.daysSinceUpdate >= 7) return 'Watch'
  return 'On Track'
}

function getRiskScore(record) {
  let score = record.daysSinceUpdate * 3 + Math.min(record.daysOpen, 45)
  if (record.stateKey === 'blocked') score += 60
  if (record.issueTypes.has('missing_required_documents')) score += 35
  if (record.issueTypes.has('document_rejected')) score += 25
  if (record.issueTypes.has('guarantees_missing')) score += 20
  if (record.issueTypes.has('clearance_missing')) score += 20
  if (record.issueTypes.has('waiting_on_attorney')) score += 18
  if (record.daysSinceUpdate >= 14) score += 24
  if (record.daysSinceUpdate >= 21) score += 24
  return score
}

function getNextAction(record) {
  if (record.topTask?.label) return record.topTask.label
  if (record.issueTypes.has('missing_required_documents') && record.requestSummary.uploadedCount > 0) {
    return 'Review uploaded client documents'
  }
  if (record.issueTypes.has('missing_required_documents')) {
    return 'Follow up on outstanding client documents'
  }
  if (record.issueTypes.has('guarantees_missing')) {
    return 'Follow up with bond originator or bank'
  }
  if (record.issueTypes.has('clearance_missing')) {
    return 'Follow up on municipal or levy clearances'
  }
  if (record.stageKey === 'registration_preparation') {
    return 'Prepare and lodge file'
  }
  if (record.stageKey === 'lodgement') {
    return 'Track deeds office progression'
  }
  return record.nextAction || 'Open file and continue progression'
}

function getActivityCategory(record) {
  if (/comment|note|message/.test(record.signal)) return 'comments'
  if (/upload|document|fica|id copy|passport|proof of address|bank statement|payslip/.test(record.signal)) return 'documents'
  return 'stage_changes'
}

function getActivitySummary(record) {
  const category = getActivityCategory(record)
  if (category === 'documents') {
    if (record.requestSummary.requiredOpenCount > 0) {
      return `Documents updated. ${record.requestSummary.requiredOpenCount} required request(s) still outstanding.`
    }
    return 'Required documents received and ready for legal review.'
  }

  if (category === 'comments') {
    return record.nextAction || 'New comment captured on this matter.'
  }

  if (record.stageKey === 'registered') return 'Matter moved to Registered and is ready for close-out.'
  if (record.stageKey === 'lodgement') return 'Matter lodged at deeds office and under progression.'
  if (record.stageKey === 'registration_preparation') return 'Matter is ready for lodgement prep and filing.'
  return record.nextAction || 'Transfer workflow moved forward.'
}

function normalizeConveyancerRows(rows = []) {
  const queue = getAttorneyWorkQueueForRows(rows)
  const topTaskByTransactionId = new Map(queue.map((item) => [item.transactionId, item.task]))

  return rows
    .filter((row) => row?.transaction)
    .map((row) => {
      const operational = deriveAttorneyOperationalStateForRow(row)
      const updatedAt = getUpdatedAt(row)
      const createdAt = getCreatedAt(row)
      const signal = getSignalText(row)
      const daysSinceUpdate = operational.inactivity?.daysSinceLastActivity ?? getDaysSince(updatedAt)
      const daysOpen = getDaysSince(createdAt)
      const buyerName = row?.buyer?.name || row?.transaction?.buyer_name || 'Client pending'
      const sellerName =
        row?.seller?.name ||
        row?.transaction?.seller_name ||
        row?.transaction?.seller ||
        row?.transaction?.counterparty_name ||
        'Not captured'
      const property = getMatterPropertyLabel(row)
      const unitNumber = getMatterUnitLabel(row)
      const lifecycleState = normalizeLifecycleState(row)
      const issueTypes = new Set((operational.issues || []).map((issue) => issue.issueType))

      return {
        row,
        transactionId: row?.transaction?.id || null,
        unitId: row?.unit?.id || null,
        reference: buildMatterReference(row?.transaction?.id),
        property,
        unitNumber,
        developmentName: property,
        buyerName,
        sellerName,
        clientName: buyerName,
        stageKey: operational.stageKey,
        stageLabel: operational.stageLabel,
        pipelineStage: operational.stageKey,
        queueStage: toQueueFilterStage(operational.stageKey),
        stateKey: operational.stateKey,
        stateLabel: operational.stateLabel,
        waitingOnRole: operational.waitingOnRole,
        waitingOnLabel: operational.waitingOnLabel,
        waitingOnReason: operational.waitingOnReason,
        blockers: operational.blockers || [],
        issues: operational.issues || [],
        issueTypes,
        requestSummary: operational.requestSummary || {
          requiredOpenCount: 0,
          uploadedCount: 0,
          openCount: 0,
        },
        checklistSummary: operational.checklistSummary || {
          requiredPendingCount: 0,
        },
        topTask: topTaskByTransactionId.get(row?.transaction?.id) || null,
        nextAction: row?.transaction?.next_action || '',
        signal,
        daysSinceUpdate,
        daysOpen,
        lastActivityAt: updatedAt,
        createdAt,
        blocked: operational.stateKey === 'blocked' || (operational.blockers || []).length > 0,
        lifecycleState,
        transactionStatusRaw: String(row?.transaction?.status || '').trim().toLowerCase(),
        operationalStateRaw: String(row?.transaction?.operational_state || '').trim().toLowerCase(),
      }
    })
}

function asLegacyMatterRow(record) {
  return {
    transactionId: record.transactionId,
    unitId: record.unitId,
    reference: record.reference,
    property: record.property,
    unitNumber: record.unitNumber,
    developmentName: record.developmentName,
    clientName: record.clientName,
    buyerName: record.buyerName,
    sellerName: record.sellerName,
    stageKey: record.stageKey,
    stage: record.stageLabel,
    currentStage: record.stageLabel,
    lastActivityAt: record.lastActivityAt,
  }
}

function isOperationallyActive(record) {
  return !['completed', 'archived', 'cancelled'].includes(record.lifecycleState)
}

function isBlockedOrOnHold(record) {
  if (record.stateKey === 'blocked') return true
  if (record.transactionStatusRaw === 'blocked' || record.transactionStatusRaw === 'on_hold') return true
  if (record.operationalStateRaw === 'blocked' || record.operationalStateRaw === 'on_hold') return true
  return false
}

export function selectConveyancerSummary(rows = []) {
  const records = normalizeConveyancerRows(rows)
  const now = new Date()
  const month = now.getMonth()
  const year = now.getFullYear()

  let activeTransactions = 0
  let lodged = 0
  let registeredThisMonth = 0
  let blockedOrOnHold = 0

  for (const record of records) {
    const registeredAt = new Date(record.row?.transaction?.registration_date || record.row?.transaction?.registered_at || record.lastActivityAt || 0)

    if (isOperationallyActive(record) && record.stageKey !== 'registered') activeTransactions += 1
    if (isOperationallyActive(record) && ['lodgement', 'registration_preparation'].includes(record.stageKey)) lodged += 1

    if (
      record.stageKey === 'registered' &&
      !Number.isNaN(registeredAt.getTime()) &&
      registeredAt.getMonth() === month &&
      registeredAt.getFullYear() === year
    ) {
      registeredThisMonth += 1
    }

    if (isOperationallyActive(record) && isBlockedOrOnHold(record)) {
      blockedOrOnHold += 1
    }
  }

  return {
    activeTransactions,
    lodged,
    registeredThisMonth,
    blocked: blockedOrOnHold,
    blockedOrOnHold,
  }
}

export function selectConveyancerActiveTransactionsStrip(rows = [], limit = 10) {
  const records = normalizeConveyancerRows(rows)
  const queue = getAttorneyWorkQueueForRows(rows)
  const queuedTransactionIds = new Set(queue.map((item) => item.transactionId).filter(Boolean))
  const totalStages = ATTORNEY_OPERATIONAL_STAGE_SEQUENCE.length

  return records
    .filter((record) => isOperationallyActive(record) && record.stageKey !== 'registered')
    .map((record) => {
      const lastActivityAt = record.lastActivityAt
      const lastActivityTs = new Date(lastActivityAt || 0).getTime()
      const hasDirectTask = queuedTransactionIds.has(record.transactionId)
      const requiresAction = hasDirectTask || record.stateKey === 'blocked' || record.issues.length > 0
      const stageIndex = ATTORNEY_OPERATIONAL_STAGE_SEQUENCE.findIndex((stage) => stage.key === record.stageKey)
      const progressPercent =
        stageIndex >= 0 && totalStages > 1
          ? Math.round((stageIndex / (totalStages - 1)) * 100)
          : 0

      return {
        transactionId: record.transactionId,
        unitId: record.unitId,
        reference: record.reference,
        property: record.property,
        unitNumber: record.unitNumber,
        developmentName: record.developmentName,
        buyerName: record.buyerName,
        sellerName: record.sellerName,
        stageKey: record.stageKey,
        currentStage: record.stageLabel,
        stateKey: record.stateKey,
        stateLabel: record.stateLabel,
        financeType: normalizeFinanceType(record.row?.transaction?.finance_type),
        waitingOnRole: record.waitingOnRole,
        waitingOnLabel: getWaitingOnDisplayLabel(record.waitingOnRole, record.waitingOnLabel),
        progressPercent,
        daysOpen: record.daysOpen,
        lastActivityAt,
        hasDirectTask,
        requiresAction,
        lastActivityTs: Number.isNaN(lastActivityTs) ? 0 : lastActivityTs,
      }
    })
    .sort((left, right) => {
      if (left.hasDirectTask !== right.hasDirectTask) {
        return Number(right.hasDirectTask) - Number(left.hasDirectTask)
      }
      if (left.requiresAction !== right.requiresAction) {
        return Number(right.requiresAction) - Number(left.requiresAction)
      }
      if (left.lastActivityTs !== right.lastActivityTs) {
        return right.lastActivityTs - left.lastActivityTs
      }
      if (left.daysOpen !== right.daysOpen) {
        return right.daysOpen - left.daysOpen
      }
      return String(left.reference || '').localeCompare(String(right.reference || ''))
    })
    .slice(0, limit)
}

export function selectConveyancerPriorityActions(rows = []) {
  const records = normalizeConveyancerRows(rows).filter((record) => isOperationallyActive(record) && record.stageKey !== 'registered')
  const needsAttentionCount = records.filter((record) => record.issues.length > 0 || record.stateKey === 'blocked').length
  const awaitingClientDocsCount = records.filter(
    (record) => record.issueTypes.has('missing_required_documents') || record.issueTypes.has('waiting_on_client'),
  ).length
  const stuckOver7DaysCount = records.filter((record) => record.daysSinceUpdate > 7).length
  const readyToLodgeCount = records.filter(
    (record) => record.stageKey === 'registration_preparation' && record.blockers.length === 0,
  ).length

  return [
    {
      key: 'needs_attention',
      label: 'Needs Attention',
      count: needsAttentionCount,
      helperText: 'Files needing immediate follow-up.',
      tone: 'critical',
      filter: { risk: 'blocked' },
    },
    {
      key: 'awaiting_client_docs',
      label: 'Awaiting Client Docs',
      count: awaitingClientDocsCount,
      helperText: 'Outstanding onboarding or FICA items.',
      tone: 'warning',
      filter: { stage: 'awaiting_documents', missingDocs: 'missing' },
    },
    {
      key: 'stuck_over_7_days',
      label: 'Stuck > 7 Days',
      count: stuckOver7DaysCount,
      helperText: 'No meaningful movement in the last week.',
      tone: 'warning',
      filter: { risk: 'stale' },
    },
    {
      key: 'ready_to_lodge',
      label: 'Ready to Lodge',
      count: readyToLodgeCount,
      helperText: 'Matters prepared for the next legal step.',
      tone: 'success',
      filter: { stage: 'ready_for_lodgement' },
    },
  ]
}

export function selectConveyancerWorkQueue(rows = [], limit = 8) {
  const queue = getAttorneyWorkQueueForRows(rows)
  return queue
    .map((item) => {
      const row = item.row
      const property = getMatterPropertyLabel(row)
      const unitNumber = getMatterUnitLabel(row)
      const buyerName = row?.buyer?.name || row?.transaction?.buyer_name || 'Client pending'
      const lastActivityAt = getUpdatedAt(row)
      return {
        transactionId: item.transactionId,
        unitId: row?.unit?.id || null,
        reference: buildMatterReference(item.transactionId),
        property,
        unitNumber,
        buyerName,
        stageKey: item.stageKey,
        stage: item.stageLabel,
        reason: item.task?.reason || item.task?.label || 'Attorney action required',
        actionLabel: item.task?.label || 'Open file',
        priority: item.priorityScore || 0,
        filter: { stage: toQueueFilterStage(item.stageKey) || undefined },
        why: item.task?.reason || item.task?.label || '',
        lastActivityAt,
      }
    })
    .filter((item) => item.stageKey !== 'registered')
    .sort((left, right) => right.priority - left.priority || new Date(right.lastActivityAt || 0) - new Date(left.lastActivityAt || 0))
    .slice(0, limit)
}

export function selectConveyancerNeedsAttentionDetailed(rows = [], previewLimit = 2) {
  const records = normalizeConveyancerRows(rows).filter((record) => isOperationallyActive(record) && record.stageKey !== 'registered')

  return ATTENTION_DEFINITIONS.map((definition) => {
    const matched = records
      .filter((record) => definition.matches(record))
      .sort((left, right) => right.daysSinceUpdate - left.daysSinceUpdate || new Date(right.lastActivityAt || 0) - new Date(left.lastActivityAt || 0))

    const preview = matched.slice(0, previewLimit).map((record) => ({
      transactionId: record.transactionId,
      unitId: record.unitId,
      label: `${record.property} • ${record.unitNumber}`,
      buyerName: record.buyerName,
      stage: record.stageLabel,
      note: definition.previewLabel(record),
    }))

    return {
      ...definition,
      count: matched.length,
      preview,
    }
  })
}

export function selectConveyancerNeedsAttention(rows = []) {
  return selectConveyancerNeedsAttentionDetailed(rows).map((item) => ({
    key: item.key,
    label: item.label,
    count: item.count,
    filter: item.filter,
  }))
}

export function selectConveyancerAttentionRows(rows = [], issueKey = '') {
  const definition = ATTENTION_DEFINITIONS.find((item) => item.key === issueKey)
  if (!definition) return []

  return normalizeConveyancerRows(rows)
    .filter((record) => definition.matches(record))
    .map((record) => ({
      ...asLegacyMatterRow(record),
      stage: record.stageLabel,
      issue: definition.previewLabel(record),
      lastActivityAt: record.lastActivityAt,
    }))
    .sort((left, right) => new Date(right.lastActivityAt || 0) - new Date(left.lastActivityAt || 0))
}

export function selectConveyancerPipelineDetailed(rows = []) {
  const records = normalizeConveyancerRows(rows).filter((record) => !['archived', 'cancelled'].includes(record.lifecycleState))

  return ATTORNEY_OPERATIONAL_STAGE_SEQUENCE.map((stage) => {
    const stageRecords = records.filter((record) => record.pipelineStage === stage.key)
    const stuckCount = stageRecords.filter((record) => record.stageKey !== 'registered' && record.daysSinceUpdate >= 5).length
    return {
      key: stage.key,
      label: stage.label,
      count: stageRecords.length,
      stuckCount,
      helperText: PIPELINE_HELPER_TEXT[stage.key] || 'Open matching files.',
      filter: { stage: toQueueFilterStage(stage.key) },
    }
  })
}

export function selectConveyancerPipeline(rows = []) {
  return selectConveyancerPipelineDetailed(rows).map((item) => ({
    key: item.key,
    label: item.label,
    count: item.count,
  }))
}

export function selectConveyancerPipelineRows(rows = [], pipelineKey = '') {
  return normalizeConveyancerRows(rows)
    .filter((record) => record.pipelineStage === pipelineKey)
    .map((record) => ({
      ...asLegacyMatterRow(record),
      stage: record.stageLabel,
      lastActivityAt: record.lastActivityAt,
    }))
    .sort((left, right) => new Date(right.lastActivityAt || 0) - new Date(left.lastActivityAt || 0))
}

export function selectConveyancerRiskRows(rows = [], limit = 10) {
  return normalizeConveyancerRows(rows)
    .filter(
      (record) =>
        record.stageKey !== 'registered' &&
        !['completed', 'archived', 'cancelled'].includes(record.lifecycleState) &&
        (record.blocked || record.daysSinceUpdate >= 7 || record.stateKey === 'at_risk' || record.issues.length > 0),
    )
    .map((record) => ({
      ...asLegacyMatterRow(record),
      currentStage: record.stageLabel,
      daysOpen: record.daysOpen,
      daysSinceUpdate: record.daysSinceUpdate,
      lastActivityAt: record.lastActivityAt,
      riskStatus: getRiskStatus(record),
      riskScore: getRiskScore(record),
      nextAction: getNextAction(record),
      primaryBlocker: getPrimaryBlocker(record),
      sellerName: record.sellerName,
    }))
    .sort((left, right) => right.riskScore - left.riskScore || right.daysSinceUpdate - left.daysSinceUpdate)
    .slice(0, limit)
}

export function selectConveyancerStuckFiles(rows = [], limit = 8) {
  return selectConveyancerRiskRows(rows, limit).map((item) => ({
    ...item,
    statusLabel: ['On Track', 'Watch'].includes(item.riskStatus) ? 'In Progress' : 'Blocked / Aged',
    sortScore: item.riskScore,
    buyerName: item.buyerName || item.clientName,
  }))
}

export function selectConveyancerLiveActivity(rows = [], limit = 12) {
  return normalizeConveyancerRows(rows)
    .sort((left, right) => new Date(right.lastActivityAt || 0) - new Date(left.lastActivityAt || 0))
    .slice(0, limit)
    .map((record) => {
      const category = getActivityCategory(record)
      const actor = category === 'documents' ? 'Buyer' : category === 'comments' ? 'Internal Team' : 'Bridge Workflow'
      const roleLabel = category === 'documents' ? 'Documents' : category === 'comments' ? 'Comments' : 'Stage Change'
      return {
        ...asLegacyMatterRow(record),
        category,
        actor,
        roleLabel,
        eventLabel: record.stageLabel,
        title: `${record.stageLabel} • ${record.buyerName}`,
        summary: getActivitySummary(record),
        description: getActivitySummary(record),
        updatedAt: record.lastActivityAt,
      }
    })
}

export function selectConveyancerRecentFeed(rows = [], limit = 8) {
  const live = selectConveyancerLiveActivity(rows, limit)
  if (live.length) return live

  return selectAttorneyRecentActivity(rows, limit).map((item) => ({
    ...item,
    category: 'stage_changes',
    actor: 'Bridge Workflow',
    roleLabel: 'Stage Change',
    eventLabel: item.stageLabel,
    title: `${item.stageLabel} • ${item.buyerName}`,
    summary: item.nextAction || 'Matter updated',
    description: item.nextAction || 'Matter updated',
  }))
}

export function selectConveyancerRegistrations(rows = [], limit = 6) {
  const now = new Date()
  const month = now.getMonth()
  const year = now.getFullYear()

  return normalizeConveyancerRows(rows)
    .filter((record) => record.stageKey === 'registered')
    .filter((record) => {
      const registeredAt = new Date(record.row?.transaction?.registered_at || record.lastActivityAt || 0)
      return !Number.isNaN(registeredAt.getTime()) && registeredAt.getMonth() === month && registeredAt.getFullYear() === year
    })
    .map((record) => ({
      transactionId: record.transactionId,
      unitId: record.unitId,
      reference: record.reference,
      developmentName: record.developmentName,
      unitNumber: record.unitNumber,
      buyerName: record.buyerName,
      registeredAt: record.row?.transaction?.registered_at || record.lastActivityAt,
      statusNote: 'Registration completed and ready for close-out or handover follow-through.',
    }))
    .sort((left, right) => new Date(right.registeredAt || 0) - new Date(left.registeredAt || 0))
    .slice(0, limit)
}
