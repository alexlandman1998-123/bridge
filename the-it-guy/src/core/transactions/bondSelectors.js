import { getMainStageFromDetailedStage } from './stageConfig'

export const BOND_APPLICATION_STAGES = [
  { key: 'docs_requested', label: 'Documents Requested' },
  { key: 'docs_received', label: 'Documents Received' },
  { key: 'application_submitted', label: 'Application Submitted' },
  { key: 'bank_reviewing', label: 'Bank Reviewing' },
  { key: 'approval_granted', label: 'Approval Granted' },
  { key: 'declined', label: 'Declined' },
]

const BOND_STAGE_LABELS = BOND_APPLICATION_STAGES.reduce((accumulator, item) => {
  accumulator[item.key] = item.label
  return accumulator
}, {})

function getMainStage(row) {
  return getMainStageFromDetailedStage(row?.stage || row?.transaction?.stage || row?.unit?.status || 'Available')
}

function getUpdatedTimestamp(row) {
  return row?.transaction?.updated_at || row?.transaction?.created_at || row?.unit?.updated_at || row?.unit?.created_at || null
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

function getFinanceSignalText(row) {
  return `${row?.transaction?.next_action || ''} ${row?.transaction?.comment || ''} ${row?.stage || ''}`
    .toLowerCase()
    .trim()
}

export function getBondApplicationStage(row) {
  const signal = getFinanceSignalText(row)
  const mainStage = getMainStage(row)

  if (/(declined|rejected|unsuccessful)/i.test(signal)) {
    return 'declined'
  }

  if (/(approved|grant signed|final approval|proof of funds)/i.test(signal)) {
    return 'approval_granted'
  }

  if (mainStage === 'ATTY' || mainStage === 'XFER' || mainStage === 'REG') {
    return 'approval_granted'
  }

  if (/(review|bank feedback|query|valuation|underwriting|credit committee)/i.test(signal)) {
    return 'bank_reviewing'
  }

  if (/(submitted|submission|sent to bank|application lodged)/i.test(signal)) {
    return 'application_submitted'
  }

  if (/(documents received|all docs in|pack complete|fica complete)/i.test(signal)) {
    return 'docs_received'
  }

  if (/(missing|request|awaiting|pending|document|bank statement|payslip|income|proof)/i.test(signal)) {
    return 'docs_requested'
  }

  if (mainStage === 'FIN') {
    return 'application_submitted'
  }

  return 'docs_requested'
}

export function isReadyForAttorneys(row) {
  const stage = getBondApplicationStage(row)
  const mainStage = getMainStage(row)
  return stage === 'approval_granted' && ['ATTY', 'XFER', 'REG'].includes(mainStage)
}

export function selectBondSummary(rows = []) {
  const applications = rows.filter((row) => row?.transaction)
  const counts = {
    active: 0,
    docsPending: 0,
    submittedToBanks: 0,
    approvals: 0,
    declined: 0,
  }

  for (const row of applications) {
    const stage = getBondApplicationStage(row)
    if (stage !== 'declined') {
      counts.active += 1
    }
    if (stage === 'docs_requested') {
      counts.docsPending += 1
    }
    if (['application_submitted', 'bank_reviewing'].includes(stage)) {
      counts.submittedToBanks += 1
    }
    if (stage === 'approval_granted') {
      counts.approvals += 1
    }
    if (stage === 'declined') {
      counts.declined += 1
    }
  }

  return counts
}

export function selectBondPipeline(rows = []) {
  const counts = BOND_APPLICATION_STAGES.reduce((accumulator, stage) => {
    accumulator[stage.key] = 0
    return accumulator
  }, {})

  for (const row of rows) {
    const stage = getBondApplicationStage(row)
    counts[stage] = (counts[stage] || 0) + 1
  }

  const total = rows.length || 1
  const max = Math.max(...Object.values(counts), 1)

  return BOND_APPLICATION_STAGES.map((stage) => ({
    ...stage,
    count: counts[stage.key] || 0,
    width: ((counts[stage.key] || 0) / max) * 100,
    share: ((counts[stage.key] || 0) / total) * 100,
  }))
}

export function selectBondAttention(rows = []) {
  return [...rows]
    .filter((row) => row?.transaction)
    .map((row) => {
      const stage = getBondApplicationStage(row)
      const missingDocuments = Number(row?.documentSummary?.missingCount || 0)
      const daysSinceUpdate = getDaysSinceUpdate(row)
      const nextAction = row?.transaction?.next_action || 'No next action set'
      let score = missingDocuments * 50 + daysSinceUpdate

      if (stage === 'docs_requested') {
        score += 20
      }
      if (stage === 'bank_reviewing' && daysSinceUpdate > 5) {
        score += 30
      }
      if (stage === 'declined') {
        score += 15
      }

      return {
        transactionId: row?.transaction?.id || null,
        unitId: row?.unit?.id || null,
        unitNumber: row?.unit?.unit_number || '-',
        developmentName: row?.development?.name || 'Unknown Development',
        buyerName: row?.buyer?.name || 'Buyer pending',
        bank: row?.transaction?.bank || 'Not set',
        stageKey: stage,
        stageLabel: BOND_STAGE_LABELS[stage] || stage,
        nextAction,
        missingDocuments,
        daysSinceUpdate,
        score,
      }
    })
    .filter((item) => item.score > 25)
    .sort((left, right) => right.score - left.score)
}

export function selectBondRecentActivity(rows = [], limit = 8) {
  return [...rows]
    .filter((row) => row?.transaction)
    .sort((left, right) => new Date(getUpdatedTimestamp(right) || 0) - new Date(getUpdatedTimestamp(left) || 0))
    .slice(0, limit)
    .map((row) => {
      const stage = getBondApplicationStage(row)
      return {
        transactionId: row?.transaction?.id || null,
        unitId: row?.unit?.id || null,
        unitNumber: row?.unit?.unit_number || '-',
        developmentName: row?.development?.name || 'Unknown Development',
        buyerName: row?.buyer?.name || 'Buyer pending',
        bank: row?.transaction?.bank || 'Not set',
        stageLabel: BOND_STAGE_LABELS[stage] || stage,
        nextAction: row?.transaction?.next_action || 'No next action set',
        updatedAt: getUpdatedTimestamp(row),
      }
    })
}

