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

export function selectConveyancerSummary(rows = []) {
  const transactions = rows.filter((row) => row?.transaction)
  const now = new Date()
  const month = now.getMonth()
  const year = now.getFullYear()

  let activeTransactions = 0
  let lodged = 0
  let registeredThisMonth = 0
  let blocked = 0

  for (const row of transactions) {
    const state = getAttorneyOperationalState(row)
    const updatedAt = new Date(getUpdatedAt(row) || 0)

    if (state.transferStage !== 'registered') {
      activeTransactions += 1
    }
    if (state.transferStage === 'lodged_at_deeds_office') {
      lodged += 1
    }
    if (
      state.transferStage === 'registered' &&
      !Number.isNaN(updatedAt.getTime()) &&
      updatedAt.getMonth() === month &&
      updatedAt.getFullYear() === year
    ) {
      registeredThisMonth += 1
    }
    if (
      state.transferStage !== 'registered' &&
      (!state.documentReadiness.ready || !state.financeStatus.ready || !state.clearanceStatus.ready || state.daysSinceUpdate >= 10)
    ) {
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

export function selectConveyancerNeedsAttention(rows = []) {
  const transactions = rows.filter((row) => row?.transaction)
  const counters = {
    missing_fica: 0,
    awaiting_guarantees: 0,
    awaiting_clearances: 0,
    no_recent_activity: 0,
    blocked_files: 0,
    signing_outstanding: 0,
  }

  for (const row of transactions) {
    const state = getAttorneyOperationalState(row)
    const signal = getSignalText(row)

    if (!state.documentReadiness.ready) {
      counters.missing_fica += 1
    }
    if (!state.financeStatus.ready) {
      counters.awaiting_guarantees += 1
    }
    if (!state.clearanceStatus.ready) {
      counters.awaiting_clearances += 1
    }
    if (state.daysSinceUpdate >= 7) {
      counters.no_recent_activity += 1
    }
    if (
      state.transferStage !== 'registered' &&
      (!state.documentReadiness.ready || !state.financeStatus.ready || !state.clearanceStatus.ready || state.daysSinceUpdate >= 10)
    ) {
      counters.blocked_files += 1
    }
    if (/(signing|signature|signed)/i.test(signal)) {
      counters.signing_outstanding += 1
    }
  }

  return [
    { key: 'missing_fica', label: 'Missing FICA documents', count: counters.missing_fica, filter: { missingDocs: 'missing', stage: 'awaiting_documents' } },
    { key: 'awaiting_guarantees', label: 'Awaiting guarantees', count: counters.awaiting_guarantees, filter: { stage: 'awaiting_bond' } },
    { key: 'awaiting_clearances', label: 'Awaiting clearance figures', count: counters.awaiting_clearances, filter: { stage: 'awaiting_clearance' } },
    { key: 'no_recent_activity', label: 'No activity > 7 days', count: counters.no_recent_activity, filter: { risk: 'stale' } },
    { key: 'blocked_files', label: 'Blocked files', count: counters.blocked_files, filter: { risk: 'blocked', missingDocs: 'missing' } },
    { key: 'signing_outstanding', label: 'Signing outstanding', count: counters.signing_outstanding, filter: { search: 'sign' } },
  ]
}

export function selectConveyancerAttentionRows(rows = [], issueKey = '') {
  const transactions = rows.filter((row) => row?.transaction)

  return transactions
    .map((row) => {
      const state = getAttorneyOperationalState(row)
      const signal = getSignalText(row)
      const buyerName = row?.buyer?.name || 'Client pending'
      const item = {
        transactionId: row?.transaction?.id || null,
        unitId: row?.unit?.id || null,
        reference: buildMatterReference(row?.transaction?.id),
        property: getMatterPropertyLabel(row),
        unitNumber: getMatterUnitLabel(row),
        clientName: buyerName,
        stage: stageLabelFromAttorneyKey(getAttorneyTransferStage(row)),
        lastActivityAt: getUpdatedAt(row),
      }

      switch (issueKey) {
        case 'missing_fica':
          return !state.documentReadiness.ready ? item : null
        case 'awaiting_guarantees':
          return !state.financeStatus.ready ? item : null
        case 'awaiting_clearances':
          return !state.clearanceStatus.ready ? item : null
        case 'no_recent_activity':
          return state.daysSinceUpdate >= 7 ? item : null
        case 'blocked_files':
          return !state.documentReadiness.ready || !state.financeStatus.ready || !state.clearanceStatus.ready || state.daysSinceUpdate >= 10
            ? item
            : null
        case 'signing_outstanding':
          return /(signing|signature|signed)/i.test(signal) ? item : null
        default:
          return null
      }
    })
    .filter(Boolean)
    .sort((left, right) => new Date(right.lastActivityAt || 0) - new Date(left.lastActivityAt || 0))
}

export function selectConveyancerPipeline(rows = []) {
  const transactions = rows.filter((row) => row?.transaction)
  const counts = Object.fromEntries(PIPELINE_STAGES.map((item) => [item.key, 0]))

  for (const row of transactions) {
    const state = getAttorneyOperationalState(row)
    counts[inferPipelineStage(row, state)] += 1
  }

  return PIPELINE_STAGES.map((item) => ({
    ...item,
    count: counts[item.key] || 0,
  }))
}

export function selectConveyancerPipelineRows(rows = [], pipelineKey = '') {
  return rows
    .filter((row) => row?.transaction)
    .map((row) => {
      const state = getAttorneyOperationalState(row)
      const pipelineStage = inferPipelineStage(row, state)
      if (pipelineStage !== pipelineKey) {
        return null
      }

      return {
        transactionId: row?.transaction?.id || null,
        unitId: row?.unit?.id || null,
        reference: buildMatterReference(row?.transaction?.id),
        property: getMatterPropertyLabel(row),
        unitNumber: getMatterUnitLabel(row),
        clientName: row?.buyer?.name || 'Client pending',
        stage: stageLabelFromAttorneyKey(getAttorneyTransferStage(row)),
        lastActivityAt: getUpdatedAt(row),
      }
    })
    .filter(Boolean)
    .sort((left, right) => new Date(right.lastActivityAt || 0) - new Date(left.lastActivityAt || 0))
}

export function selectConveyancerStuckFiles(rows = [], limit = 8) {
  return rows
    .filter((row) => row?.transaction)
    .map((row) => {
      const state = getAttorneyOperationalState(row)
      const daysOpen = getDaysSince(getCreatedAt(row))
      const daysSinceUpdate = state.daysSinceUpdate
      const blocked =
        !state.documentReadiness.ready || !state.financeStatus.ready || !state.clearanceStatus.ready || daysSinceUpdate >= 10

      return {
        transactionId: row?.transaction?.id || null,
        unitId: row?.unit?.id || null,
        reference: buildMatterReference(row?.transaction?.id),
        property: getMatterPropertyLabel(row),
        unitNumber: getMatterUnitLabel(row),
        buyerName: row?.buyer?.name || 'Client pending',
        currentStage: stageLabelFromAttorneyKey(getAttorneyTransferStage(row)),
        daysOpen,
        lastActivityAt: getUpdatedAt(row),
        statusLabel: blocked ? 'Blocked / Aged' : 'In Progress',
        sortScore: blocked ? daysSinceUpdate + daysOpen : daysSinceUpdate,
      }
    })
    .filter((item) => item.statusLabel === 'Blocked / Aged' || item.daysOpen >= 21)
    .sort((left, right) => right.sortScore - left.sortScore)
    .slice(0, limit)
}

export function selectConveyancerRecentFeed(rows = [], limit = 8) {
  return selectAttorneyRecentActivity(rows, limit).map((item) => ({
    ...item,
    eventLabel: item.stageLabel,
    description: item.nextAction || 'Matter updated',
  }))
}

export function selectConveyancerRegistrations(rows = [], limit = 6) {
  const now = new Date()
  const month = now.getMonth()
  const year = now.getFullYear()

  return rows
    .filter((row) => row?.transaction)
    .map((row) => {
      const state = getAttorneyOperationalState(row)
      if (state.transferStage !== 'registered') {
        return null
      }

      const updatedAt = getUpdatedAt(row)
      const updatedDate = new Date(updatedAt || 0)
      if (Number.isNaN(updatedDate.getTime()) || updatedDate.getMonth() !== month || updatedDate.getFullYear() !== year) {
        return null
      }

      return {
        transactionId: row?.transaction?.id || null,
        unitId: row?.unit?.id || null,
        reference: buildMatterReference(row?.transaction?.id),
        developmentName: getMatterPropertyLabel(row),
        unitNumber: getMatterUnitLabel(row),
        buyerName: row?.buyer?.name || 'Client pending',
        registeredAt: updatedAt,
        statusNote: 'Registration completed and ready for close-out or handover follow-through.',
      }
    })
    .filter(Boolean)
    .sort((left, right) => new Date(right.registeredAt || 0) - new Date(left.registeredAt || 0))
    .slice(0, limit)
}
