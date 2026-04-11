import {
  getAttorneyOperationalState,
  getAttorneyTransferStage,
  selectAttorneyRecentActivity,
  stageLabelFromAttorneyKey,
} from './attorneySelectors'

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
  return row?.transaction?.updated_at || row?.transaction?.created_at || row?.unit?.updated_at || row?.unit?.created_at || null
}

function getDaysSince(value) {
  const date = new Date(value || 0)
  if (Number.isNaN(date.getTime())) return 0
  const diff = Date.now() - date.getTime()
  if (!Number.isFinite(diff) || diff <= 0) return 0
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function inferPipelineStage(row, state) {
  const signal = getSignalText(row)
  const transferStage = state.transferStage

  if (transferStage === 'registered') {
    return 'registered'
  }

  if (transferStage === 'lodged_at_deeds_office') {
    return 'lodgement'
  }

  if (transferStage === 'ready_for_lodgement') {
    return 'registration_preparation'
  }

  if (!state.clearanceStatus.ready) {
    return 'clearances'
  }

  if (!state.financeStatus.ready) {
    return 'guarantees'
  }

  if (/(signing|signature|signed)/i.test(signal)) {
    return 'signing'
  }

  if (transferStage === 'preparation_in_progress') {
    return 'drafting'
  }

  if (!state.documentReadiness.ready) {
    return 'fica_onboarding'
  }

  return 'instruction_received'
}

const PIPELINE_STAGES = [
  { key: 'instruction_received', label: 'Instruction Received' },
  { key: 'fica_onboarding', label: 'FICA / Onboarding' },
  { key: 'drafting', label: 'Drafting' },
  { key: 'signing', label: 'Signing' },
  { key: 'guarantees', label: 'Guarantees' },
  { key: 'clearances', label: 'Clearances' },
  { key: 'lodgement', label: 'Lodgement' },
  { key: 'registration_preparation', label: 'Registration Preparation' },
  { key: 'registered', label: 'Registered' },
]

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

const PIPELINE_FILTERS = {
  instruction_received: {},
  fica_onboarding: { stage: 'awaiting_documents', missingDocs: 'missing' },
  drafting: { stage: 'awaiting_documents', search: 'prepare' },
  signing: { search: 'sign' },
  guarantees: { stage: 'awaiting_bond' },
  clearances: { stage: 'awaiting_clearance' },
  lodgement: { stage: 'lodged' },
  registration_preparation: { stage: 'ready_for_lodgement' },
  registered: { stage: 'registered' },
}

const ATTENTION_DEFINITIONS = [
  {
    key: 'missing_fica',
    label: 'Missing FICA documents',
    description: 'Buyer or seller compliance documents are still outstanding.',
    severity: 'warning',
    filter: { missingDocs: 'missing', stage: 'awaiting_documents' },
    match: (record) => record.stageKey !== 'registered' && !record.documentReadiness.ready,
    previewLabel: (record) => `Missing ${record.documentReadiness.missingCount || 1} required document(s)`,
  },
  {
    key: 'awaiting_guarantees',
    label: 'Awaiting guarantees',
    description: 'Finance outputs are incomplete before legal transfer can progress.',
    severity: 'warning',
    filter: { stage: 'awaiting_bond' },
    match: (record) => record.stageKey !== 'registered' && !record.financeStatus.ready,
    previewLabel: () => 'Guarantee or bond confirmation still outstanding',
  },
  {
    key: 'awaiting_clearances',
    label: 'Awaiting clearance figures',
    description: 'Clearance certificates or duties are still pending.',
    severity: 'warning',
    filter: { stage: 'awaiting_clearance' },
    match: (record) => record.stageKey !== 'registered' && !record.clearanceStatus.ready,
    previewLabel: () => 'Municipal or levy clearance still pending',
  },
  {
    key: 'no_recent_activity',
    label: 'No activity > 7 days',
    description: 'Files are stale and need an update or follow-up.',
    severity: 'risk',
    filter: { risk: 'stale' },
    match: (record) => record.stageKey !== 'registered' && record.daysSinceUpdate >= 7,
    previewLabel: (record) => `No movement for ${record.daysSinceUpdate} days`,
  },
  {
    key: 'blocked_files',
    label: 'Blocked files',
    description: 'These files have blockers that are preventing stage movement.',
    severity: 'critical',
    filter: { risk: 'blocked', missingDocs: 'missing' },
    match: (record) => record.stageKey !== 'registered' && record.blocked,
    previewLabel: (record) => getPrimaryBlocker(record) || 'File blocked',
  },
  {
    key: 'signing_outstanding',
    label: 'Signing outstanding',
    description: 'Signing sequence started but still awaiting completion.',
    severity: 'warning',
    filter: { search: 'sign' },
    match: (record) => record.stageKey !== 'registered' && /(signing|signature|signed)/i.test(record.signal),
    previewLabel: () => 'Signing pack awaiting final signatures',
  },
]

function getPrimaryBlocker(record) {
  if (!record.documentReadiness.ready) {
    return `Waiting on ${record.documentReadiness.missingCount || 1} required document(s)`
  }
  if (!record.financeStatus.ready) {
    return 'Waiting on finance guarantees'
  }
  if (!record.clearanceStatus.ready) {
    return 'Waiting on clearance figures'
  }
  if (record.daysSinceUpdate >= 10) {
    return `No activity for ${record.daysSinceUpdate} days`
  }
  return ''
}

function getRiskStatus(record) {
  if (record.stageKey === 'registered') return 'Closed'
  if (record.daysSinceUpdate >= 14 || (record.blocked && record.daysSinceUpdate >= 10)) return 'Critical'
  if (record.blocked || record.daysSinceUpdate >= 10) return 'High'
  return 'Watch'
}

function getRiskScore(record) {
  let score = record.daysSinceUpdate * 2 + Math.min(record.daysOpen, 30)

  if (!record.documentReadiness.ready) score += 25
  if (!record.financeStatus.ready) score += 20
  if (!record.clearanceStatus.ready) score += 20
  if (record.stageKey === 'lodged_at_deeds_office' && record.daysSinceUpdate >= 7) score += 25
  if (record.stageKey === 'ready_for_lodgement' && record.daysSinceUpdate >= 5) score += 15
  if (record.daysSinceUpdate >= 14) score += 35
  if (record.daysSinceUpdate >= 21) score += 35

  return score
}

function getNextAction(record) {
  if (!record.documentReadiness.ready && record.documentReadiness.uploadedCount > 0) {
    return 'Review uploaded client documents'
  }
  if (!record.documentReadiness.ready) {
    return 'Follow up on outstanding client documents'
  }
  if (!record.financeStatus.ready) {
    return 'Follow up with bond originator or bank'
  }
  if (!record.clearanceStatus.ready) {
    return 'Follow up on municipal or levy clearances'
  }
  if (record.stageKey === 'ready_for_lodgement') {
    return 'Prepare and lodge file'
  }
  if (record.stageKey === 'lodged_at_deeds_office') {
    return 'Track deeds office progression'
  }
  return record.nextAction || 'Open file and continue progression'
}

function getActivityCategory(record) {
  if (/comment|note|message/.test(record.signal)) return 'comments'
  if (/upload|fica|document|id copy|passport|proof of address|bank statement|payslip/.test(record.signal)) return 'documents'
  return 'stage_changes'
}

function getActivitySummary(record) {
  const category = getActivityCategory(record)

  if (category === 'documents') {
    if (!record.documentReadiness.ready) {
      return `Client documents updated. ${record.documentReadiness.missingCount || 1} requirement(s) still outstanding.`
    }
    return 'Required documents received and ready for legal review.'
  }

  if (category === 'comments') {
    return record.nextAction || 'New comment captured on this matter.'
  }

  if (record.stageKey === 'registered') return 'Matter moved to Registered and is ready for close-out.'
  if (record.stageKey === 'lodged_at_deeds_office') return 'Matter lodged at deeds office and under progression.'
  if (record.stageKey === 'ready_for_lodgement') return 'Matter is ready for lodgement prep and filing.'

  return record.nextAction || 'Transfer workflow moved forward.'
}

function normalizeConveyancerRows(rows = []) {
  return rows
    .filter((row) => row?.transaction)
    .map((row) => {
      const state = getAttorneyOperationalState(row)
      const stageKey = getAttorneyTransferStage(row)
      const updatedAt = getUpdatedAt(row)
      const createdAt = getCreatedAt(row)
      const signal = getSignalText(row)
      const daysSinceUpdate = state.daysSinceUpdate || getDaysSince(updatedAt)
      const daysOpen = getDaysSince(createdAt)
      const pipelineStage = inferPipelineStage(row, state)
      const blocked =
        !state.documentReadiness.ready ||
        !state.financeStatus.ready ||
        !state.clearanceStatus.ready ||
        daysSinceUpdate >= 10

      const buyerName = row?.buyer?.name || row?.transaction?.buyer_name || 'Client pending'
      const property = getMatterPropertyLabel(row)
      const unitNumber = getMatterUnitLabel(row)

      return {
        row,
        transactionId: row?.transaction?.id || null,
        unitId: row?.unit?.id || null,
        reference: buildMatterReference(row?.transaction?.id),
        property,
        unitNumber,
        developmentName: property,
        buyerName,
        clientName: buyerName,
        stageKey,
        stageLabel: stageLabelFromAttorneyKey(stageKey),
        pipelineStage,
        nextAction: row?.transaction?.next_action || '',
        signal,
        documentReadiness: state.documentReadiness,
        financeStatus: state.financeStatus,
        clearanceStatus: state.clearanceStatus,
        lodgementReadiness: state.lodgementReadiness,
        daysSinceUpdate,
        daysOpen,
        lastActivityAt: updatedAt,
        createdAt,
        blocked,
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
    stageKey: record.stageKey,
    stage: record.stageLabel,
    currentStage: record.stageLabel,
    lastActivityAt: record.lastActivityAt,
  }
}

function resolveAttentionDefinition(issueKey) {
  return ATTENTION_DEFINITIONS.find((item) => item.key === issueKey) || null
}

export function selectConveyancerSummary(rows = []) {
  const records = normalizeConveyancerRows(rows)
  const now = new Date()
  const month = now.getMonth()
  const year = now.getFullYear()

  let activeTransactions = 0
  let lodged = 0
  let registeredThisMonth = 0
  let blocked = 0

  for (const record of records) {
    const updatedAt = new Date(record.lastActivityAt || 0)

    if (record.stageKey !== 'registered') activeTransactions += 1
    if (record.stageKey === 'lodged_at_deeds_office') lodged += 1

    if (
      record.stageKey === 'registered' &&
      !Number.isNaN(updatedAt.getTime()) &&
      updatedAt.getMonth() === month &&
      updatedAt.getFullYear() === year
    ) {
      registeredThisMonth += 1
    }

    if (record.stageKey !== 'registered' && record.blocked) {
      blocked += 1
    }
  }

  return {
    activeTransactions,
    lodged,
    registeredThisMonth,
    blocked,
  }
}

export function selectConveyancerPriorityActions(rows = []) {
  const records = normalizeConveyancerRows(rows)
  const activeRecords = records.filter((record) => record.stageKey !== 'registered')
  const needsAttentionCount = activeRecords.filter((record) => record.blocked || record.daysSinceUpdate >= 7).length
  const awaitingClientDocsCount = activeRecords.filter((record) => !record.documentReadiness.ready).length
  const stuckOver7DaysCount = activeRecords.filter((record) => record.daysSinceUpdate > 7).length
  const readyToLodgeCount = activeRecords.filter(
    (record) =>
      record.lodgementReadiness.ready &&
      record.stageKey !== 'lodged_at_deeds_office' &&
      record.stageKey !== 'registered',
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
  const records = normalizeConveyancerRows(rows)
  const queue = []

  for (const record of records) {
    if (record.stageKey === 'registered') continue

    let reason = ''
    let actionLabel = 'Open file'
    let priority = 0
    let filter = {}

    if (!record.documentReadiness.ready && record.documentReadiness.uploadedCount > 0) {
      reason = 'Buyer FICA uploaded - review required'
      actionLabel = 'Review documents'
      priority = 96
      filter = { stage: 'awaiting_documents', missingDocs: 'missing' }
    } else if (!record.documentReadiness.ready) {
      reason = 'Outstanding client documents still required'
      actionLabel = 'Follow up'
      priority = 90
      filter = { stage: 'awaiting_documents', missingDocs: 'missing' }
    } else if (!record.financeStatus.ready) {
      reason = 'Finance outputs incomplete and blocking transfer'
      actionLabel = 'Follow up'
      priority = 84
      filter = { stage: 'awaiting_bond' }
    } else if (!record.clearanceStatus.ready) {
      reason = 'Clearance figures still pending'
      actionLabel = 'Chase clearances'
      priority = 80
      filter = { stage: 'awaiting_clearance' }
    } else if (record.stageKey === 'ready_for_lodgement') {
      reason = 'Matter ready for lodgement'
      actionLabel = 'Prepare lodgement'
      priority = 92
      filter = { stage: 'ready_for_lodgement' }
    } else if (record.stageKey === 'preparation_in_progress' && /(signing|signature|signed)/i.test(record.signal)) {
      reason = 'Signing pack ready to send'
      actionLabel = 'Send for signing'
      priority = 78
      filter = { search: 'sign' }
    } else if (record.stageKey === 'preparation_in_progress') {
      reason = 'Draft documents need completion'
      actionLabel = 'Continue drafting'
      priority = 72
      filter = { stage: 'awaiting_documents', search: 'prepare' }
    } else if (record.stageKey === 'lodged_at_deeds_office') {
      reason = 'Lodgement in progress and needs active monitoring'
      actionLabel = 'Track progress'
      priority = record.daysSinceUpdate >= 5 ? 70 : 58
      filter = { stage: 'lodged' }
    } else if (record.daysSinceUpdate >= 7) {
      reason = `No movement for ${record.daysSinceUpdate} days`
      actionLabel = 'Escalate'
      priority = 68
      filter = { risk: 'stale' }
    } else {
      continue
    }

    queue.push({
      ...asLegacyMatterRow(record),
      reason,
      actionLabel,
      priority,
      filter,
      why: reason,
    })
  }

  return queue
    .sort((left, right) => right.priority - left.priority || new Date(right.lastActivityAt || 0) - new Date(left.lastActivityAt || 0))
    .slice(0, limit)
}

export function selectConveyancerNeedsAttentionDetailed(rows = [], previewLimit = 2) {
  const records = normalizeConveyancerRows(rows)

  return ATTENTION_DEFINITIONS.map((definition) => {
    const matched = records
      .filter((record) => definition.match(record))
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
  const definition = resolveAttentionDefinition(issueKey)
  if (!definition) return []

  return normalizeConveyancerRows(rows)
    .filter((record) => definition.match(record))
    .map((record) => ({
      ...asLegacyMatterRow(record),
      stage: record.stageLabel,
      issue: definition.previewLabel(record),
      lastActivityAt: record.lastActivityAt,
    }))
    .sort((left, right) => new Date(right.lastActivityAt || 0) - new Date(left.lastActivityAt || 0))
}

export function selectConveyancerPipelineDetailed(rows = []) {
  const records = normalizeConveyancerRows(rows)

  return PIPELINE_STAGES.map((stage) => {
    const stageRecords = records.filter((record) => record.pipelineStage === stage.key)
    const stuckCount = stageRecords.filter((record) => record.stageKey !== 'registered' && record.daysSinceUpdate >= 5).length

    return {
      key: stage.key,
      label: stage.label,
      count: stageRecords.length,
      stuckCount,
      helperText: PIPELINE_HELPER_TEXT[stage.key] || 'Open matching files.',
      filter: PIPELINE_FILTERS[stage.key] || {},
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
        (record.blocked || record.daysSinceUpdate >= 7 || (record.stageKey === 'lodged_at_deeds_office' && record.daysSinceUpdate >= 5)),
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
    }))
    .sort((left, right) => right.riskScore - left.riskScore || right.daysSinceUpdate - left.daysSinceUpdate)
    .slice(0, limit)
}

export function selectConveyancerStuckFiles(rows = [], limit = 8) {
  return selectConveyancerRiskRows(rows, limit).map((item) => ({
    ...item,
    statusLabel: item.riskStatus === 'Watch' ? 'In Progress' : 'Blocked / Aged',
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
      const updatedDate = new Date(record.lastActivityAt || 0)
      return !Number.isNaN(updatedDate.getTime()) && updatedDate.getMonth() === month && updatedDate.getFullYear() === year
    })
    .map((record) => ({
      transactionId: record.transactionId,
      unitId: record.unitId,
      reference: record.reference,
      developmentName: record.developmentName,
      unitNumber: record.unitNumber,
      buyerName: record.buyerName,
      registeredAt: record.lastActivityAt,
      statusNote: 'Registration completed and ready for close-out or handover follow-through.',
    }))
    .sort((left, right) => new Date(right.registeredAt || 0) - new Date(left.registeredAt || 0))
    .slice(0, limit)
}
