import { MAIN_STAGE_LABELS, getMainStageFromDetailedStage } from './stageConfig'
import { isBondFinanceType } from './financeType'

export const AGENT_PIPELINE_STAGES = [
  { key: 'DEP', label: MAIN_STAGE_LABELS.DEP },
  { key: 'OTP', label: MAIN_STAGE_LABELS.OTP },
  { key: 'FIN', label: MAIN_STAGE_LABELS.FIN },
  { key: 'ATTY', label: MAIN_STAGE_LABELS.ATTY },
  { key: 'XFER', label: MAIN_STAGE_LABELS.XFER },
  { key: 'REG', label: MAIN_STAGE_LABELS.REG },
]

export const AGENT_READINESS_OPTIONS = [
  { key: 'all', label: 'All Readiness' },
  { key: 'onboarding_incomplete', label: 'Buyer Onboarding Incomplete' },
  { key: 'docs_missing', label: 'Documents Missing' },
  { key: 'ready_otp', label: 'Ready for OTP' },
  { key: 'ready_finance_handoff', label: 'Ready for Finance Handoff' },
  { key: 'ready_attorney_handoff', label: 'Ready for Attorney Handoff' },
  { key: 'finance_handoff_complete', label: 'Finance Handoff Complete' },
  { key: 'attorney_handoff_complete', label: 'Attorney Handoff Complete' },
  { key: 'registered', label: 'Registered' },
]

function toMainStage(row) {
  return getMainStageFromDetailedStage(row?.stage || row?.transaction?.stage || row?.unit?.status || 'Available')
}

function getUpdatedTimestamp(row) {
  return row?.transaction?.updated_at || row?.transaction?.created_at || row?.unit?.updated_at || row?.unit?.created_at || null
}

function getDocumentSummary(row) {
  const uploadedCount = Number(row?.documentSummary?.uploadedCount || 0)
  const totalRequired = Number(row?.documentSummary?.totalRequired || 0)
  const missingCountFromSource = Number(row?.documentSummary?.missingCount)
  const missingCount = Number.isFinite(missingCountFromSource)
    ? missingCountFromSource
    : Math.max(totalRequired - uploadedCount, 0)

  return {
    uploadedCount,
    totalRequired,
    missingCount,
  }
}

function normalizeOnboardingStatus(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  if (normalized === 'submitted') return 'submitted'
  if (normalized === 'in progress') return 'in_progress'
  return 'not_started'
}

export function getAgentReadinessState(row) {
  const mainStage = toMainStage(row)
  const financeType = String(row?.transaction?.finance_type || '').toLowerCase()
  const onboardingStatus = normalizeOnboardingStatus(row?.onboarding?.status)
  const documentSummary = getDocumentSummary(row)

  if (mainStage === 'REG') {
    return { key: 'registered', label: 'Registered', tone: 'success' }
  }

  if (onboardingStatus !== 'submitted') {
    return { key: 'onboarding_incomplete', label: 'Buyer Onboarding Incomplete', tone: 'warning' }
  }

  if (documentSummary.missingCount > 0) {
    return { key: 'docs_missing', label: 'Documents Missing', tone: 'warning' }
  }

  if (mainStage === 'DEP') {
    return { key: 'ready_otp', label: 'Ready for OTP', tone: 'info' }
  }

  if (mainStage === 'OTP') {
    if (isBondFinanceType(financeType)) {
      return { key: 'ready_finance_handoff', label: 'Ready for Finance Handoff', tone: 'info' }
    }

    return { key: 'ready_attorney_handoff', label: 'Ready for Attorney Handoff', tone: 'info' }
  }

  if (mainStage === 'FIN') {
    if (isBondFinanceType(financeType)) {
      return { key: 'finance_handoff_complete', label: 'Finance Handoff Complete', tone: 'success' }
    }

    return { key: 'ready_attorney_handoff', label: 'Ready for Attorney Handoff', tone: 'info' }
  }

  if (mainStage === 'ATTY' || mainStage === 'XFER') {
    return { key: 'attorney_handoff_complete', label: 'Attorney Handoff Complete', tone: 'success' }
  }

  return { key: 'in_progress', label: 'In Progress', tone: 'neutral' }
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

function isAttentionNextAction(value) {
  const text = String(value || '')
    .trim()
    .toLowerCase()

  if (!text) {
    return false
  }

  return /(await|waiting|missing|required|follow up|urgent|pending)/i.test(text)
}

function getAttentionScore(row) {
  const missingDocuments = getDocumentSummary(row).missingCount
  const daysSinceUpdate = getDaysSinceUpdate(row)
  const nextAction = row?.transaction?.next_action || ''
  const readiness = getAgentReadinessState(row)
  let score = missingDocuments * 50 + daysSinceUpdate

  if (isAttentionNextAction(nextAction)) {
    score += 20
  }

  if (readiness.key === 'onboarding_incomplete') {
    score += 20
  }
  if (readiness.key === 'docs_missing') {
    score += 15
  }

  if (toMainStage(row) === 'REG') {
    score = 0
  }

  return score
}

export function selectAgentSummary(rows = []) {
  const activeRows = rows.filter((row) => row?.transaction)
  const readinessRows = activeRows.map((row) => getAgentReadinessState(row))
  const missingDocuments = activeRows.filter((row) => getDocumentSummary(row).missingCount > 0).length
  const awaitingBuyerAction = readinessRows.filter((item) => item.key === 'onboarding_incomplete').length
  const readyForNextStage = readinessRows.filter((item) => item.key.startsWith('ready_')).length
  const reservedDeals = activeRows.filter((row) => toMainStage(row) === 'DEP').length
  const inProgressDeals = activeRows.filter((row) => {
    const main = toMainStage(row)
    return !['DEP', 'REG'].includes(main)
  }).length
  const registeredDeals = activeRows.filter((row) => toMainStage(row) === 'REG').length
  const requiresAttention = activeRows.filter((row) => getAttentionScore(row) > 25).length

  return {
    activeTransactions: activeRows.length,
    awaitingBuyerAction,
    missingDocuments,
    readyForNextStage,
    registeredDeals,
    activeDeals: activeRows.length,
    reservedDeals,
    inProgressDeals,
    requiresAttention,
  }
}

export function selectAgentPipeline(rows = []) {
  const counts = AGENT_PIPELINE_STAGES.reduce((accumulator, stage) => {
    accumulator[stage.key] = 0
    return accumulator
  }, {})

  for (const row of rows) {
    const main = toMainStage(row)
    if (counts[main] !== undefined) {
      counts[main] += 1
    }
  }

  const total = rows.length || 1
  const max = Math.max(...Object.values(counts), 1)

  return AGENT_PIPELINE_STAGES.map((stage) => {
    const count = counts[stage.key] || 0
    return {
      ...stage,
      count,
      width: (count / max) * 100,
      share: (count / total) * 100,
    }
  })
}

export function selectAgentAttention(rows = []) {
  return [...rows]
    .filter((row) => row?.transaction)
    .map((row) => {
      const documentSummary = getDocumentSummary(row)
      const daysSinceUpdate = getDaysSinceUpdate(row)
      const readiness = getAgentReadinessState(row)
      return {
        transactionId: row?.transaction?.id || null,
        unitId: row?.unit?.id || null,
        unitNumber: row?.unit?.unit_number || '-',
        developmentName: row?.development?.name || 'Unknown Development',
        buyerName: row?.buyer?.name || 'Buyer pending',
        stageLabel: MAIN_STAGE_LABELS[toMainStage(row)] || row?.stage || 'Unknown',
        nextAction: row?.transaction?.next_action || 'No next action set',
        missingDocuments: documentSummary.missingCount,
        daysSinceUpdate,
        readinessLabel: readiness.label,
        score: getAttentionScore(row),
      }
    })
    .filter((item) => item.score > 25)
    .sort((left, right) => right.score - left.score)
}

export function selectAgentRecentActivity(rows = [], limit = 8) {
  return [...rows]
    .filter((row) => row?.transaction)
    .sort((left, right) => new Date(getUpdatedTimestamp(right) || 0) - new Date(getUpdatedTimestamp(left) || 0))
    .slice(0, limit)
    .map((row) => ({
      transactionId: row?.transaction?.id || null,
      unitId: row?.unit?.id || null,
      unitNumber: row?.unit?.unit_number || '-',
      developmentName: row?.development?.name || 'Unknown Development',
      buyerName: row?.buyer?.name || 'Buyer pending',
      stageLabel: MAIN_STAGE_LABELS[toMainStage(row)] || row?.stage || 'Unknown',
      nextAction: row?.transaction?.next_action || 'No next action set',
      updatedAt: getUpdatedTimestamp(row),
    }))
}
