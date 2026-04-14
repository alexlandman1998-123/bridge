import { getMainStageFromDetailedStage } from './stageConfig'

export const ATTORNEY_TRANSFER_STAGES = [
  { key: 'instruction_received', label: 'Instruction Received' },
  { key: 'documents_pending', label: 'FICA / Onboarding' },
  { key: 'preparation_in_progress', label: 'Drafting' },
  { key: 'ready_for_lodgement', label: 'Registration Preparation' },
  { key: 'lodged_at_deeds_office', label: 'Lodgement' },
  { key: 'registered', label: 'Registered' },
]

export const ATTORNEY_QUEUE_FILTERS = [
  { key: 'all', label: 'All Matters' },
  { key: 'ready_for_lodgement', label: 'Ready for Lodgement' },
  { key: 'awaiting_documents', label: 'Awaiting Documents' },
  { key: 'awaiting_bond', label: 'Awaiting Bond' },
  { key: 'awaiting_clearance', label: 'Awaiting Clearance' },
  { key: 'lodged', label: 'Lodged' },
  { key: 'registered', label: 'Registered' },
]

const ATTORNEY_FUNNEL_STAGES = [
  { key: 'reservation', label: 'Reservation' },
  { key: 'otp_signed', label: 'OTP Signed' },
  { key: 'documents_complete', label: 'Documents Complete' },
  { key: 'finance_approved', label: 'Finance Approved' },
  { key: 'ready_for_lodgement', label: 'Ready for Lodgement' },
  { key: 'lodged', label: 'Lodged' },
  { key: 'registered', label: 'Registered' },
]

const ATTORNEY_FUNNEL_FILTER_MAP = {
  reservation: { stage: 'awaiting_documents' },
  otp_signed: { stage: 'awaiting_documents' },
  documents_complete: { stage: 'awaiting_bond' },
  finance_approved: { stage: 'awaiting_clearance' },
  ready_for_lodgement: { stage: 'ready_for_lodgement' },
  lodged: { stage: 'lodged' },
  registered: { stage: 'registered' },
}

const ATTORNEY_STAGE_LABELS = ATTORNEY_TRANSFER_STAGES.reduce((accumulator, item) => {
  accumulator[item.key] = item.label
  return accumulator
}, {})

function getMainStage(row) {
  return getMainStageFromDetailedStage(row?.stage || row?.transaction?.stage || row?.unit?.status || 'Available')
}

function getSignalText(row) {
  return `${row?.transaction?.next_action || ''} ${row?.transaction?.comment || ''} ${row?.stage || ''}`
    .toLowerCase()
    .trim()
}

function getUpdatedTimestamp(row) {
  return row?.transaction?.updated_at || row?.transaction?.created_at || row?.unit?.updated_at || row?.unit?.created_at || null
}

function getInstructionDate(row) {
  return row?.transaction?.created_at || row?.unit?.created_at || null
}

function isPrivateMatter(row) {
  const type = String(row?.transaction?.transaction_type || '').toLowerCase()
  return type === 'private' || type === 'private_property' || (!row?.development?.id && !row?.unit?.id)
}

function getMatterPropertyLabel(row) {
  if (!isPrivateMatter(row)) {
    return row?.development?.name || 'Unknown Development'
  }

  return (
    [row?.transaction?.property_address_line_1, row?.transaction?.suburb || row?.transaction?.city].filter(Boolean).join(', ') ||
    row?.transaction?.property_description ||
    'Private property matter'
  )
}

function getMatterUnitLabel(row) {
  if (!isPrivateMatter(row)) {
    return row?.unit?.unit_number || '-'
  }

  return row?.transaction?.property_description || 'Private Matter'
}

function getDaysSinceUpdate(row) {
  const value = getUpdatedTimestamp(row)
  const date = new Date(value || 0)
  if (Number.isNaN(date.getTime())) {
    return 0
  }

  const diff = Date.now() - date.getTime()
  if (!Number.isFinite(diff) || diff <= 0) {
    return 0
  }

  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function getNumericValue(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function getPurchaseValue(row) {
  return getNumericValue(row?.transaction?.purchase_price || row?.transaction?.sales_price || row?.unit?.price)
}

function getDocumentReadiness(row) {
  const uploadedCount = getNumericValue(row?.documentSummary?.uploadedCount)
  const totalRequired = getNumericValue(row?.documentSummary?.totalRequired)
  const missingFallback = Math.max(totalRequired - uploadedCount, 0)
  const missingCountSource = Number(row?.documentSummary?.missingCount)
  const missingCount = Number.isFinite(missingCountSource) ? missingCountSource : missingFallback

  if (totalRequired <= 0) {
    return {
      uploadedCount,
      totalRequired,
      missingCount,
      ready: false,
      tone: 'neutral',
      label: 'Not configured',
    }
  }

  if (missingCount <= 0) {
    return {
      uploadedCount,
      totalRequired,
      missingCount: 0,
      ready: true,
      tone: 'success',
      label: `${uploadedCount}/${totalRequired} complete`,
    }
  }

  return {
    uploadedCount,
    totalRequired,
    missingCount,
    ready: false,
    tone: uploadedCount ? 'info' : 'warning',
    label: `${uploadedCount}/${totalRequired} uploaded`,
  }
}

function getFinanceStatus(row) {
  const financeType = String(row?.transaction?.finance_type || '').toLowerCase()
  const signal = getSignalText(row)
  const mainStage = getMainStage(row)

  if (
    financeType === 'cash' &&
    !/(bond|bank|guarantee|grant|approval|mortgage)/i.test(signal) &&
    !['FIN'].includes(mainStage)
  ) {
    return { key: 'cash', label: 'Cash Purchase', ready: true }
  }

  if (
    /(bond approved|approval granted|grant signed|proof of funds|guarantees received|bank guarantee)/i.test(signal) ||
    ['ATTY', 'XFER', 'REG'].includes(mainStage)
  ) {
    return { key: 'approved', label: 'Bond Approved', ready: true }
  }

  if (financeType === 'cash') {
    return { key: 'cash', label: 'Cash Purchase', ready: true }
  }

  if (
    /(submitted|bank reviewing|underwriting|credit committee|valuation|awaiting bank|bond pending|finance pending|awaiting bond)/i.test(
      signal,
    ) ||
    mainStage === 'FIN'
  ) {
    return { key: 'awaiting_bond', label: 'Awaiting Bond Approval', ready: false }
  }

  return { key: 'pending', label: 'Finance Pending', ready: false }
}

function getClearanceStatus(row) {
  const signal = getSignalText(row)
  const transferComplete = ['XFER', 'REG'].includes(getMainStage(row))
  const hasClearanceSignal = /(clearance|levy|body corporate|transfer duty|municipal|rates)/i.test(signal)

  if (transferComplete) {
    return { key: 'received', label: 'Received', ready: true }
  }

  if (/(clearance received|levy clearance received|consent received|transfer duty paid|rates clearance issued)/i.test(signal)) {
    return { key: 'received', label: 'Received', ready: true }
  }

  if (/(clearance requested|request municipal|request levy|requested clearance|applied for clearance|duty submitted)/i.test(signal)) {
    return { key: 'requested', label: 'Requested', ready: false }
  }

  if (hasClearanceSignal || /(awaiting clearance|pending clearance|clearance pending)/i.test(signal)) {
    return { key: 'pending', label: 'Pending', ready: false }
  }

  return { key: 'not_required', label: 'Not Required', ready: true }
}

function getLodgementReadiness(row, { transferStage, documentReadiness, financeStatus, clearanceStatus }) {
  if (transferStage === 'registered') {
    return { key: 'registered', label: 'Registered', ready: true }
  }

  if (transferStage === 'lodged_at_deeds_office') {
    return { key: 'lodged', label: 'Lodged', ready: true }
  }

  const ready = documentReadiness.ready && financeStatus.ready && clearanceStatus.ready
  if (ready) {
    return { key: 'ready', label: 'Ready', ready: true }
  }

  return { key: 'not_ready', label: 'Not Ready', ready: false }
}

function getPrimaryBlocker(state, signalText) {
  if (!state.documentReadiness.ready) {
    if (/fica|proof of address|id document|id copy|passport/i.test(signalText)) {
      return 'Waiting on buyer FICA documents'
    }
    if (/sale pack|otp|offer to purchase/i.test(signalText)) {
      return 'Waiting on sale pack documentation'
    }
    return `Waiting on ${state.documentReadiness.missingCount} required document${
      state.documentReadiness.missingCount === 1 ? '' : 's'
    }`
  }

  if (!state.financeStatus.ready) {
    if (/guarantee/i.test(signalText)) {
      return 'Awaiting bank guarantees'
    }
    return 'Awaiting finance approval'
  }

  if (!state.clearanceStatus.ready) {
    if (/municipal|rates|city|council/i.test(signalText)) {
      return 'Awaiting municipal clearance'
    }
    if (/levy/i.test(signalText)) {
      return 'Awaiting levy clearance'
    }
    if (/body corporate|hoa|consent/i.test(signalText)) {
      return 'Awaiting body corporate consent'
    }
    if (/transfer duty|duty/i.test(signalText)) {
      return 'Awaiting transfer duty receipt'
    }
    return 'Awaiting clearances'
  }

  if (state.daysSinceUpdate >= 10) {
    return `No activity for ${state.daysSinceUpdate} days`
  }

  return null
}

function getPrimaryAction(state, signalText) {
  if (!state.documentReadiness.ready) {
    if (state.documentReadiness.uploadedCount > 0) {
      return 'Review uploaded document pack'
    }
    return 'Collect outstanding buyer documents'
  }

  if (!state.financeStatus.ready) {
    if (/guarantee/i.test(signalText)) {
      return 'Follow up on guarantees'
    }
    return 'Follow up with bond originator'
  }

  if (!state.clearanceStatus.ready) {
    return 'Follow up on clearances'
  }

  if (state.transferStage === 'ready_for_lodgement') {
    return 'Approve matter for lodgement'
  }

  if (state.transferStage === 'preparation_in_progress') {
    if (/signature|signing|signed/i.test(signalText)) {
      return 'Finalize signature pack'
    }
    return 'Prepare transfer file for lodgement'
  }

  if (state.transferStage === 'lodged_at_deeds_office') {
    return 'Track deeds office progression'
  }

  if (state.transferStage === 'registered') {
    return 'Matter completed'
  }

  return 'Prepare transfer documents'
}

function getProgressForTransferStage(stageKey) {
  if (stageKey === 'registered') return 100
  if (stageKey === 'lodged_at_deeds_office') return 94
  if (stageKey === 'ready_for_lodgement') return 84
  if (stageKey === 'preparation_in_progress') return 62
  if (stageKey === 'documents_pending') return 36
  return 18
}

function isActiveTransferStage(transferStage) {
  return transferStage !== 'registered'
}

function getStatusNote(row, state) {
  if (row?.transaction?.current_sub_stage_summary) {
    return row.transaction.current_sub_stage_summary
  }
  if (row?.transaction?.next_action) {
    return row.transaction.next_action
  }
  if (state.lodgementReadiness.ready) {
    return 'Matter is ready for lodgement.'
  }
  return 'Transfer file in progress.'
}

function isBlockedState(state) {
  if (state.transferStage === 'registered') {
    return false
  }
  return !state.documentReadiness.ready || !state.financeStatus.ready || !state.clearanceStatus.ready || state.daysSinceUpdate >= 10
}

export function getAttorneyOperationalState(row) {
  const transferStage = getAttorneyTransferStage(row)
  const transferStageLabel = stageLabelFromAttorneyKey(transferStage)
  const documentReadiness = getDocumentReadiness(row)
  const financeStatus = getFinanceStatus(row)
  const clearanceStatus = getClearanceStatus(row)
  const lodgementReadiness = getLodgementReadiness(row, {
    transferStage,
    documentReadiness,
    financeStatus,
    clearanceStatus,
  })

  return {
    transferStage,
    transferStageLabel,
    documentReadiness,
    financeStatus,
    clearanceStatus,
    lodgementReadiness,
    daysSinceUpdate: getDaysSinceUpdate(row),
  }
}

export function getAttorneyQueueFilterKey(row) {
  const state = getAttorneyOperationalState(row)

  if (state.transferStage === 'registered') {
    return 'registered'
  }

  if (state.transferStage === 'lodged_at_deeds_office') {
    return 'lodged'
  }

  if (state.lodgementReadiness.ready) {
    return 'ready_for_lodgement'
  }

  if (!state.documentReadiness.ready) {
    return 'awaiting_documents'
  }

  if (!state.financeStatus.ready) {
    return 'awaiting_bond'
  }

  if (!state.clearanceStatus.ready) {
    return 'awaiting_clearance'
  }

  return 'all'
}

function getAttorneyFunnelStage(row) {
  const mainStage = getMainStage(row)
  const transferStage = getAttorneyTransferStage(row)
  const state = getAttorneyOperationalState(row)

  if (transferStage === 'registered') {
    return 'registered'
  }

  if (transferStage === 'lodged_at_deeds_office') {
    return 'lodged'
  }

  if (state.lodgementReadiness.ready) {
    return 'ready_for_lodgement'
  }

  if (state.financeStatus.ready && ['FIN', 'ATTY', 'XFER', 'REG'].includes(mainStage)) {
    return 'finance_approved'
  }

  if (state.documentReadiness.ready && ['OTP', 'FIN', 'ATTY', 'XFER', 'REG'].includes(mainStage)) {
    return 'documents_complete'
  }

  if (['OTP', 'FIN', 'ATTY', 'XFER', 'REG'].includes(mainStage)) {
    return 'otp_signed'
  }

  return 'reservation'
}

export function getAttorneyTransferStage(row) {
  const signal = getSignalText(row)
  const mainStage = getMainStage(row)

  if (/(registered|registration confirmed|title deed|deed registered)/i.test(signal) || mainStage === 'REG') {
    return 'registered'
  }

  if (/(lodged|lodgement|deeds office|deeds reference|examination)/i.test(signal)) {
    return 'lodged_at_deeds_office'
  }

  if (/(ready for lodgement|prep complete|ready to lodge|guarantees received)/i.test(signal)) {
    return 'ready_for_lodgement'
  }

  if (/(preparation|docs prepared|draft|signed documents|signing|guarantees)/i.test(signal)) {
    return 'preparation_in_progress'
  }

  if (/(missing|awaiting|pending|fica|otp|proof|certificate|document)/i.test(signal)) {
    return 'documents_pending'
  }

  if (mainStage === 'XFER') {
    return 'lodged_at_deeds_office'
  }

  if (mainStage === 'ATTY') {
    return 'preparation_in_progress'
  }

  return 'instruction_received'
}

export function stageLabelFromAttorneyKey(key) {
  return ATTORNEY_STAGE_LABELS[key] || 'Instruction Received'
}

export function mapAttorneyTransferStageToDetailedStage(stageKey) {
  if (stageKey === 'registered') {
    return { stage: 'Registered', mainStage: 'REG' }
  }
  if (stageKey === 'lodged_at_deeds_office') {
    return { stage: 'Transfer Lodged', mainStage: 'XFER' }
  }
  if (stageKey === 'ready_for_lodgement' || stageKey === 'preparation_in_progress') {
    return { stage: 'Transfer in Progress', mainStage: 'XFER' }
  }
  if (stageKey === 'documents_pending' || stageKey === 'instruction_received') {
    return { stage: 'Proceed to Attorneys', mainStage: 'ATTY' }
  }

  return { stage: 'Proceed to Attorneys', mainStage: 'ATTY' }
}

export function selectAttorneySummary(rows = []) {
  const transfers = rows.filter((row) => row?.transaction)
  const now = new Date()
  const month = now.getMonth()
  const year = now.getFullYear()
  const counts = {
    activeTransfers: 0,
    readyForLodgement: 0,
    registeredThisMonth: 0,
    totalActiveTransferValue: 0,
  }

  for (const row of transfers) {
    const queueKey = getAttorneyQueueFilterKey(row)
    const stage = getAttorneyTransferStage(row)
    const updatedAt = new Date(getUpdatedTimestamp(row) || 0)
    const purchasePrice = getNumericValue(row?.transaction?.purchase_price || row?.transaction?.sales_price || row?.unit?.price)

    if (stage !== 'registered' && stage !== 'lodged_at_deeds_office') {
      counts.activeTransfers += 1
      counts.totalActiveTransferValue += purchasePrice
    }

    if (queueKey === 'ready_for_lodgement' || stage === 'ready_for_lodgement') {
      counts.readyForLodgement += 1
    }

    if (
      stage === 'registered' &&
      !Number.isNaN(updatedAt.getTime()) &&
      updatedAt.getMonth() === month &&
      updatedAt.getFullYear() === year
    ) {
      counts.registeredThisMonth += 1
    }
  }

  return counts
}

export function selectAttorneyFunnel(rows = []) {
  const counts = ATTORNEY_FUNNEL_STAGES.reduce((accumulator, stage) => {
    accumulator[stage.key] = 0
    return accumulator
  }, {})

  for (const row of rows) {
    const stage = getAttorneyFunnelStage(row)
    counts[stage] = (counts[stage] || 0) + 1
  }

  const total = rows.length || 1
  const max = Math.max(...Object.values(counts), 1)

  return ATTORNEY_FUNNEL_STAGES.map((stage) => ({
    ...stage,
    count: counts[stage.key] || 0,
    width: ((counts[stage.key] || 0) / max) * 100,
    share: ((counts[stage.key] || 0) / total) * 100,
  }))
}

export function selectAttorneyAttention(rows = []) {
  return [...rows]
    .filter((row) => row?.transaction)
    .map((row) => {
      const state = getAttorneyOperationalState(row)
      const queueKey = getAttorneyQueueFilterKey(row)
      const missingDocuments = state.documentReadiness.missingCount
      const daysSinceUpdate = state.daysSinceUpdate
      const nextAction = row?.transaction?.next_action || 'No next action set'
      let score = missingDocuments * 50 + daysSinceUpdate
      let blockerReason = 'General transfer delay'

      if (queueKey === 'awaiting_documents') {
        score += 20
        blockerReason = 'Waiting for required documents'
      }
      if (queueKey === 'awaiting_bond') {
        score += 25
        blockerReason = 'Waiting for bond approval'
      }
      if (queueKey === 'awaiting_clearance') {
        score += 25
        blockerReason = 'Waiting for municipal or levy clearances'
      }
      if (state.transferStage === 'preparation_in_progress' && daysSinceUpdate > 7) {
        score += 25
      }
      if (state.transferStage === 'lodged_at_deeds_office' && daysSinceUpdate > 10) {
        score += 30
      }
      if (daysSinceUpdate >= 14) {
        blockerReason = `No update for ${daysSinceUpdate} days`
      }

      return {
        transactionId: row?.transaction?.id || null,
        unitId: row?.unit?.id || null,
        unitNumber: row?.unit?.unit_number || '-',
        developmentName: row?.development?.name || 'Unknown Development',
        buyerName: row?.buyer?.name || 'Buyer pending',
        stageKey: state.transferStage,
        stageLabel: ATTORNEY_STAGE_LABELS[state.transferStage] || state.transferStage,
        nextAction,
        missingDocuments,
        daysSinceUpdate,
        blockerReason,
        score,
      }
    })
    .filter((item) => item.score > 25)
    .sort((left, right) => right.score - left.score)
}

export function selectAttorneyRecentActivity(rows = [], limit = 8) {
  return [...rows]
    .filter((row) => row?.transaction)
    .sort((left, right) => new Date(getUpdatedTimestamp(right) || 0) - new Date(getUpdatedTimestamp(left) || 0))
    .slice(0, limit)
    .map((row) => {
      const stage = getAttorneyTransferStage(row)
      return {
        transactionId: row?.transaction?.id || null,
        unitId: row?.unit?.id || null,
        unitNumber: getMatterUnitLabel(row),
        developmentName: getMatterPropertyLabel(row),
        buyerName: row?.buyer?.name || 'Buyer pending',
        stageLabel: ATTORNEY_STAGE_LABELS[stage] || stage,
        instructionDate: getInstructionDate(row),
        nextAction: row?.transaction?.next_action || 'No next action set',
        updatedAt: getUpdatedTimestamp(row),
      }
    })
}

export function selectAttorneyReadinessGroups(rows = []) {
  const transfers = rows.filter((row) => row?.transaction)
  let ready = 0
  let almostReady = 0
  let blocked = 0

  for (const row of transfers) {
    const state = getAttorneyOperationalState(row)
    const queueKey = getAttorneyQueueFilterKey(row)

    if (queueKey === 'ready_for_lodgement') {
      ready += 1
      continue
    }

    if (queueKey === 'lodged' || queueKey === 'registered') {
      continue
    }

    const componentsReady = [state.documentReadiness.ready, state.financeStatus.ready, state.clearanceStatus.ready].filter(Boolean).length

    if (componentsReady >= 2 && state.daysSinceUpdate <= 10) {
      almostReady += 1
    } else {
      blocked += 1
    }
  }

  return {
    ready,
    almostReady,
    blocked,
  }
}

export function selectAttorneyClearanceTracker(rows = []) {
  const clearanceCards = [
    { key: 'municipal', label: 'Municipal Clearance', regex: /(municipal|rates|city|council)/i, pending: 0 },
    { key: 'levy', label: 'Levy Clearance', regex: /(levy)/i, pending: 0 },
    { key: 'body_corporate', label: 'Body Corporate Consent', regex: /(body corporate|hoa|consent)/i, pending: 0 },
    { key: 'transfer_duty', label: 'Transfer Duty', regex: /(transfer duty|duty)/i, pending: 0 },
  ]

  for (const row of rows) {
    if (!row?.transaction) {
      continue
    }

    const queueKey = getAttorneyQueueFilterKey(row)
    const signal = getSignalText(row)
    const pendingHint = queueKey === 'awaiting_clearance' || /(pending|awaiting|requested|request|outstanding)/i.test(signal)
    const settledHint = /(received|issued|paid|verified|complete)/i.test(signal)

    if (!pendingHint || settledHint) {
      continue
    }

    let matched = false
    for (const card of clearanceCards) {
      if (card.regex.test(signal)) {
        card.pending += 1
        matched = true
      }
    }

    if (!matched && queueKey === 'awaiting_clearance') {
      clearanceCards[0].pending += 1
    }
  }

  return clearanceCards
}

export function selectAttorneyTodayFocus(rows = []) {
  const transfers = rows.filter((row) => row?.transaction)
  const awaitingDocuments = []
  const awaitingClearance = []
  const awaitingBond = []
  const readyForLodgement = []
  const staleUpdates = []

  for (const row of transfers) {
    const queueKey = getAttorneyQueueFilterKey(row)
    const state = getAttorneyOperationalState(row)

    if (queueKey === 'ready_for_lodgement') {
      readyForLodgement.push(row)
    }
    if (queueKey === 'awaiting_documents') {
      awaitingDocuments.push(row)
    }
    if (queueKey === 'awaiting_clearance') {
      awaitingClearance.push(row)
    }
    if (queueKey === 'awaiting_bond') {
      awaitingBond.push(row)
    }
    if (state.daysSinceUpdate >= 10) {
      staleUpdates.push(row)
    }
  }

  return [
    {
      key: 'ready_for_lodgement',
      label: `${readyForLodgement.length} matters ready for lodgement`,
      description: 'Prepared and ready to lodge at deeds.',
      tone: readyForLodgement.length ? 'success' : 'neutral',
      count: readyForLodgement.length,
      filter: { stage: 'ready_for_lodgement' },
    },
    {
      key: 'awaiting_clearance',
      label: `${awaitingClearance.length} matters waiting on clearances`,
      description: 'Municipal, levy, body corporate, or transfer duty still pending.',
      tone: awaitingClearance.length ? 'warning' : 'neutral',
      count: awaitingClearance.length,
      filter: { stage: 'awaiting_clearance' },
    },
    {
      key: 'awaiting_documents',
      label: `${awaitingDocuments.length} matters missing client or sale documents`,
      description: 'Document pack incomplete for transfer preparation.',
      tone: awaitingDocuments.length ? 'warning' : 'neutral',
      count: awaitingDocuments.length,
      filter: { stage: 'awaiting_documents' },
    },
    {
      key: 'awaiting_bond',
      label: `${awaitingBond.length} matters waiting for finance clearance`,
      description: 'Bond approval/guarantee handoff still outstanding.',
      tone: awaitingBond.length ? 'info' : 'neutral',
      count: awaitingBond.length,
      filter: { stage: 'awaiting_bond' },
    },
    {
      key: 'stale_updates',
      label: `${staleUpdates.length} matters stale for 10+ days`,
      description: 'No recent activity logged and likely needs intervention.',
      tone: staleUpdates.length ? 'danger' : 'neutral',
      count: staleUpdates.length,
      filter: {},
    },
  ]
}

export function selectAttorneyDashboardSnapshot(rows = []) {
  const transfers = rows.filter((row) => row?.transaction)
  const snapshot = {
    readyForLodgement: 0,
    blockedMatters: 0,
    activeMatters: 0,
    activeTransferValue: 0,
  }

  for (const row of transfers) {
    const state = getAttorneyOperationalState(row)
    const queueKey = getAttorneyQueueFilterKey(row)
    const transferValue = getPurchaseValue(row)

    if (isActiveTransferStage(state.transferStage)) {
      snapshot.activeMatters += 1
      snapshot.activeTransferValue += transferValue
    }
    if (queueKey === 'ready_for_lodgement' || state.transferStage === 'ready_for_lodgement') {
      snapshot.readyForLodgement += 1
    }
    if (isBlockedState(state)) {
      snapshot.blockedMatters += 1
    }
  }

  return snapshot
}

export function selectAttorneyActiveMatters(rows = []) {
  return rows
    .filter((row) => row?.transaction)
    .map((row) => {
      const state = getAttorneyOperationalState(row)
      const signalText = getSignalText(row)
      const blocker = getPrimaryBlocker(state, signalText)
      const action = getPrimaryAction(state, signalText)
      const transferValue = getPurchaseValue(row)
      const urgencyScore =
        (blocker ? 100 : 0) +
        (state.daysSinceUpdate >= 10 ? 40 : 0) +
        Math.max(state.documentReadiness.missingCount, 0) * 10 +
        (state.transferStage === 'ready_for_lodgement' ? 30 : 0) +
        (state.transferStage === 'lodged_at_deeds_office' ? -10 : 0)

      return {
        id: row?.transaction?.id || row?.unit?.id || `${row?.development?.id || 'dev'}-${row?.unit?.id || 'unit'}`,
        transactionId: row?.transaction?.id || null,
        unitId: row?.unit?.id || null,
        developmentName: row?.development?.name || 'Unknown Development',
        unitNumber: row?.unit?.unit_number || '-',
        buyerName: row?.buyer?.name || 'Buyer pending',
        stageKey: state.transferStage,
        stageLabel: stageLabelFromAttorneyKey(state.transferStage),
        progressPercent: getProgressForTransferStage(state.transferStage),
        primaryBlocker: blocker,
        primaryAction: action,
        statusNote: getStatusNote(row, state),
        assignedAttorney: row?.transaction?.attorney || row?.transaction?.assigned_attorney_email || 'Attorney Team',
        lastActivityAt: getUpdatedTimestamp(row),
        daysSinceUpdate: state.daysSinceUpdate,
        isBlocked: Boolean(blocker),
        transferValue,
        urgencyScore,
      }
    })
    .filter((item) => isActiveTransferStage(item.stageKey))
    .sort((left, right) => {
      if (left.isBlocked !== right.isBlocked) {
        return left.isBlocked ? -1 : 1
      }
      if (left.stageKey === 'ready_for_lodgement' && right.stageKey !== 'ready_for_lodgement') {
        return -1
      }
      if (right.stageKey === 'ready_for_lodgement' && left.stageKey !== 'ready_for_lodgement') {
        return 1
      }
      if (left.urgencyScore !== right.urgencyScore) {
        return right.urgencyScore - left.urgencyScore
      }
      return new Date(getUpdatedTimestamp(right) || 0) - new Date(getUpdatedTimestamp(left) || 0)
    })
}

export function selectAttorneyExecutionQueue(rows = []) {
  const transfers = rows.filter((row) => row?.transaction)

  const counters = {
    docsToReview: 0,
    transferPackPrep: 0,
    signaturesPending: 0,
    readyForLodgement: 0,
    waitingClientDocs: 0,
    waitingGuarantees: 0,
    waitingClearances: 0,
    staleNoActivity: 0,
    missingCriticalDocs: 0,
    unresolvedDependencies: 0,
  }

  for (const row of transfers) {
    const state = getAttorneyOperationalState(row)
    const signal = getSignalText(row)
    const queueKey = getAttorneyQueueFilterKey(row)
    const isRegistered = state.transferStage === 'registered'
    if (isRegistered) {
      continue
    }

    if (!state.documentReadiness.ready && state.documentReadiness.uploadedCount > 0) {
      counters.docsToReview += 1
    }
    if (['instruction_received', 'documents_pending', 'preparation_in_progress'].includes(state.transferStage)) {
      counters.transferPackPrep += 1
    }
    if (/signature|signing|signed documents|buyer signed|seller signed/i.test(signal)) {
      counters.signaturesPending += 1
    }
    if (queueKey === 'ready_for_lodgement') {
      counters.readyForLodgement += 1
    }

    if (!state.documentReadiness.ready) {
      counters.waitingClientDocs += 1
      if (state.documentReadiness.uploadedCount === 0) {
        counters.missingCriticalDocs += 1
      }
    }
    if (!state.financeStatus.ready) {
      counters.waitingGuarantees += 1
    }
    if (!state.clearanceStatus.ready) {
      counters.waitingClearances += 1
    }

    if (state.daysSinceUpdate >= 10) {
      counters.staleNoActivity += 1
    }
    if (!state.lodgementReadiness.ready && state.daysSinceUpdate >= 7) {
      counters.unresolvedDependencies += 1
    }
  }

  return [
    {
      key: 'needs_your_action',
      label: 'Needs Your Action',
      description: 'Direct legal tasks that need execution now.',
      items: [
        {
          key: 'docs_to_review',
          label: 'Documents ready for legal review',
          description: 'Uploaded packs waiting for attorney validation.',
          count: counters.docsToReview,
          filter: { stage: 'awaiting_documents', missingDocs: 'missing' },
          tone: 'info',
        },
        {
          key: 'transfer_pack_prep',
          label: 'Transfer packs to prepare',
          description: 'Matters still in transfer preparation workflow.',
          count: counters.transferPackPrep,
          filter: { stage: 'all', search: 'prepare' },
          tone: 'neutral',
        },
        {
          key: 'signatures_pending',
          label: 'Matters needing signature coordination',
          description: 'Buyer/seller signing still in progress.',
          count: counters.signaturesPending,
          filter: { stage: 'all', search: 'sign' },
          tone: 'warning',
        },
        {
          key: 'ready_for_lodgement',
          label: 'Matters ready for lodgement approval',
          description: 'Prepared files ready to move to deeds.',
          count: counters.readyForLodgement,
          filter: { stage: 'ready_for_lodgement' },
          tone: 'success',
        },
      ],
    },
    {
      key: 'needs_follow_up',
      label: 'Needs Follow-Up',
      description: 'Dependencies with external parties and support lanes.',
      items: [
        {
          key: 'waiting_client_docs',
          label: 'Matters waiting on client/FICA docs',
          description: 'Buyer-side document pack remains incomplete.',
          count: counters.waitingClientDocs,
          filter: { stage: 'awaiting_documents', missingDocs: 'missing' },
          tone: 'warning',
        },
        {
          key: 'waiting_guarantees',
          label: 'Matters waiting on finance guarantees',
          description: 'Bond approval or guarantee handoff still outstanding.',
          count: counters.waitingGuarantees,
          filter: { stage: 'awaiting_bond' },
          tone: 'info',
        },
        {
          key: 'waiting_clearances',
          label: 'Matters waiting on municipal/levy clearances',
          description: 'Transfer dependencies with municipality or body corporate.',
          count: counters.waitingClearances,
          filter: { stage: 'awaiting_clearance' },
          tone: 'warning',
        },
      ],
    },
    {
      key: 'at_risk',
      label: 'At Risk',
      description: 'Stalled or blocked matters requiring escalation.',
      items: [
        {
          key: 'stale_no_activity',
          label: 'No activity in 10+ days',
          description: 'Files are stale and likely need direct intervention.',
          count: counters.staleNoActivity,
          filter: { stage: 'all', risk: 'stale' },
          tone: 'danger',
        },
        {
          key: 'missing_critical_docs',
          label: 'Blocked by critical missing docs',
          description: 'No baseline document pack has been uploaded.',
          count: counters.missingCriticalDocs,
          filter: { stage: 'awaiting_documents', missingDocs: 'missing', risk: 'blocked' },
          tone: 'danger',
        },
        {
          key: 'unresolved_dependencies',
          label: 'Unresolved dependencies 7+ days',
          description: 'Matters need escalation to unblock execution.',
          count: counters.unresolvedDependencies,
          filter: { stage: 'all', risk: 'blocked' },
          tone: 'warning',
        },
      ],
    },
  ]
}

export function selectAttorneyPipelineNavigator(rows = []) {
  const counts = ATTORNEY_FUNNEL_STAGES.reduce((accumulator, stage) => {
    accumulator[stage.key] = 0
    return accumulator
  }, {})

  for (const row of rows) {
    if (!row?.transaction) {
      continue
    }
    const stage = getAttorneyFunnelStage(row)
    counts[stage] = (counts[stage] || 0) + 1
  }

  const total = Math.max(rows.filter((row) => row?.transaction).length, 1)
  return ATTORNEY_FUNNEL_STAGES.map((stage) => ({
    ...stage,
    count: counts[stage.key] || 0,
    share: ((counts[stage.key] || 0) / total) * 100,
    filter: ATTORNEY_FUNNEL_FILTER_MAP[stage.key] || { stage: 'all' },
  }))
}
