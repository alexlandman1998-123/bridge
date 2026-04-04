import { getMainStageFromDetailedStage } from './stageConfig'
import { normalizeFinanceType } from './financeType'

export const DEVELOPER_FUNNEL_STAGES = [
  { key: 'AVAIL', label: 'Available' },
  { key: 'DEP', label: 'Deposit' },
  { key: 'OTP', label: 'OTP Signed' },
  { key: 'FIN', label: 'Finance' },
  { key: 'ATTY', label: 'Transfer Preparation' },
  { key: 'XFER', label: 'Transfer' },
  { key: 'REG', label: 'Registered' },
]

export const STAGE_AGING_BUCKETS = [
  { key: '0_7', label: '0-7d', maxDays: 7 },
  { key: '8_14', label: '8-14d', maxDays: 14 },
  { key: '15_30', label: '15-30d', maxDays: 30 },
  { key: '31_plus', label: '31+d', maxDays: Infinity },
]

const DEFAULT_BOTTLENECK_THRESHOLDS = {
  DEP: 7,
  OTP: 7,
  FIN: 14,
  ATTY: 21,
  XFER: 14,
}

function toMainStage(row) {
  const explicitMain = String(row?.mainStage || row?.transaction?.current_main_stage || '')
    .trim()
    .toUpperCase()
  if (explicitMain) {
    return explicitMain
  }

  return getMainStageFromDetailedStage(row?.stage || row?.transaction?.stage || row?.unit?.status || 'Available')
}

function getComparableTimestamp(row) {
  return row?.transaction?.updated_at || row?.transaction?.created_at || row?.unit?.updated_at || row?.unit?.created_at || null
}

function getDaysInStage(row) {
  const dateLike = getComparableTimestamp(row)
  const date = new Date(dateLike || 0)
  if (Number.isNaN(date.getTime())) {
    return 0
  }

  const now = Date.now()
  const diff = now - date.getTime()
  if (!Number.isFinite(diff) || diff <= 0) {
    return 0
  }

  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function getMonetaryValue(row) {
  const value = Number(row?.transaction?.sales_price ?? row?.unit?.price)
  return Number.isFinite(value) ? value : 0
}

function formatSource(value) {
  const source = String(value || '').trim()
  if (!source) {
    return 'Unknown'
  }

  return source
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function deriveAgeGroup(buyer) {
  if (!buyer) {
    return 'Unknown'
  }

  const explicit = String(buyer.age_group || '')
    .trim()
    .toLowerCase()

  if (explicit) {
    if (explicit.includes('18') || explicit.includes('29')) return '18-29'
    if (explicit.includes('30') || explicit.includes('39')) return '30-39'
    if (explicit.includes('40') || explicit.includes('49')) return '40-49'
    if (explicit.includes('50') || explicit.includes('60') || explicit.includes('70')) return '50+'
  }

  const dob = buyer.date_of_birth
  if (!dob) {
    return 'Unknown'
  }

  const date = new Date(dob)
  if (Number.isNaN(date.getTime())) {
    return 'Unknown'
  }

  const now = new Date()
  let age = now.getFullYear() - date.getFullYear()
  const hasBirthdayPassed =
    now.getMonth() > date.getMonth() || (now.getMonth() === date.getMonth() && now.getDate() >= date.getDate())

  if (!hasBirthdayPassed) {
    age -= 1
  }

  if (age >= 50) return '50+'
  if (age >= 40) return '40-49'
  if (age >= 30) return '30-39'
  if (age >= 18) return '18-29'
  return 'Unknown'
}

function normalizeGender(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  if (!normalized) return 'Unknown'
  if (normalized.startsWith('m')) return 'Male'
  if (normalized.startsWith('f')) return 'Female'
  return 'Other'
}

export function selectPortfolioMetrics(rows = [], { totalDevelopmentsOverride = null } = {}) {
  const stageCounts = DEVELOPER_FUNNEL_STAGES.reduce((accumulator, item) => {
    accumulator[item.key] = 0
    return accumulator
  }, {})

  let totalSalesValue = 0
  let pipelineValue = 0
  let dealsInProgress = 0
  let unitsSold = 0
  let unitsAvailable = 0
  let unitsRegistered = 0

  for (const row of rows) {
    const main = toMainStage(row)
    stageCounts[main] = (stageCounts[main] || 0) + 1
    const value = getMonetaryValue(row)

    if (main === 'AVAIL') {
      unitsAvailable += 1
      continue
    }

    unitsSold += 1
    totalSalesValue += value

    if (main !== 'REG') {
      dealsInProgress += 1
      pipelineValue += value
    } else {
      unitsRegistered += 1
    }
  }

  const totalDevelopments =
    Number.isFinite(totalDevelopmentsOverride) && totalDevelopmentsOverride !== null
      ? totalDevelopmentsOverride
      : new Set(rows.map((row) => row?.development?.id || row?.unit?.development_id).filter(Boolean)).size

  return {
    totalDevelopments,
    totalUnits: rows.length,
    unitsSold,
    unitsAvailable,
    dealsInProgress,
    unitsRegistered,
    totalSalesValue,
    pipelineValue,
    stageCounts,
  }
}

export function selectStageDistribution(rows = []) {
  const counts = DEVELOPER_FUNNEL_STAGES.reduce((accumulator, stage) => {
    accumulator[stage.key] = 0
    return accumulator
  }, {})

  for (const row of rows) {
    const key = toMainStage(row)
    counts[key] = (counts[key] || 0) + 1
  }

  let previousCount = null
  const total = rows.length || 1
  const max = Math.max(...Object.values(counts), 1)

  return DEVELOPER_FUNNEL_STAGES.map((stage) => {
    const count = counts[stage.key] || 0
    const conversion = previousCount && previousCount > 0 ? (count / previousCount) * 100 : null
    previousCount = count

    return {
      ...stage,
      count,
      width: (count / max) * 100,
      share: (count / total) * 100,
      conversion,
    }
  })
}

export function selectDevelopmentPerformance(rows = []) {
  const grouped = {}

  for (const row of rows) {
    const developmentId = row?.development?.id || row?.unit?.development_id
    const developmentName = row?.development?.name || 'Unknown Development'
    if (!developmentId) {
      continue
    }

    if (!grouped[developmentId]) {
      grouped[developmentId] = {
        id: developmentId,
        name: developmentName,
        totalUnits: 0,
        unitsSold: 0,
        unitsAvailable: 0,
        unitsInProgress: 0,
        unitsRegistered: 0,
        revenueSecured: 0,
        pipelineValue: 0,
        lastActivity: null,
      }
    }

    const main = toMainStage(row)
    const value = getMonetaryValue(row)
    const item = grouped[developmentId]
    item.totalUnits += 1

    if (main === 'AVAIL') {
      item.unitsAvailable += 1
    } else {
      item.unitsSold += 1
      item.revenueSecured += value

      if (main !== 'REG') {
        item.unitsInProgress += 1
        item.pipelineValue += value
      } else {
        item.unitsRegistered += 1
      }
    }

    const activity = getComparableTimestamp(row)
    if (activity && (!item.lastActivity || new Date(activity) > new Date(item.lastActivity))) {
      item.lastActivity = activity
    }
  }

  return Object.values(grouped)
    .map((item) => {
      const total = item.totalUnits || 1
      const sellThroughPercent = item.totalUnits ? (item.unitsSold / item.totalUnits) * 100 : 0

      return {
        ...item,
        available: item.unitsAvailable,
        inProgress: item.unitsInProgress,
        registered: item.unitsRegistered,
        sellThroughPercent,
        soldPercent: sellThroughPercent,
        availableWidth: (item.unitsAvailable / total) * 100,
        inProgressWidth: (item.unitsInProgress / total) * 100,
        registeredWidth: (item.unitsRegistered / total) * 100,
      }
    })
    .sort((left, right) => right.sellThroughPercent - left.sellThroughPercent)
}

export function selectBottlenecks(rows = [], thresholds = DEFAULT_BOTTLENECK_THRESHOLDS) {
  return rows
    .map((row) => {
      const main = toMainStage(row)
      const limit = thresholds[main]
      if (!limit) {
        return null
      }

      const daysInStage = getDaysInStage(row)
      if (daysInStage <= limit) {
        return null
      }

      return {
        transactionId: row?.transaction?.id || null,
        unitId: row?.unit?.id || null,
        developmentName: row?.development?.name || 'Unknown Development',
        unitNumber: row?.unit?.unit_number || '-',
        buyerName: row?.buyer?.name || 'Buyer pending',
        stageKey: main,
        stageLabel: DEVELOPER_FUNNEL_STAGES.find((item) => item.key === main)?.label || main,
        daysInStage,
        thresholdDays: limit,
        nextAction: row?.report?.nextStep || row?.transaction?.next_action || 'No next action set',
      }
    })
    .filter(Boolean)
    .sort((left, right) => right.daysInStage - left.daysInStage)
}

export function selectStageAging(rows = []) {
  const matrix = Object.fromEntries(
    DEVELOPER_FUNNEL_STAGES.map((stage) => [
      stage.key,
      Object.fromEntries(STAGE_AGING_BUCKETS.map((bucket) => [bucket.key, 0])),
    ]),
  )

  for (const row of rows) {
    const stage = toMainStage(row)
    if (!matrix[stage]) {
      continue
    }

    const days = getDaysInStage(row)
    const bucket = STAGE_AGING_BUCKETS.find((item) => days <= item.maxDays) || STAGE_AGING_BUCKETS[STAGE_AGING_BUCKETS.length - 1]
    matrix[stage][bucket.key] += 1
  }

  const stages = DEVELOPER_FUNNEL_STAGES.map((stage) => ({
    ...stage,
    cells: STAGE_AGING_BUCKETS.map((bucket) => ({
      ...bucket,
      count: matrix[stage.key][bucket.key] || 0,
    })),
  }))

  return {
    stages,
    totalTracked: rows.length,
    maxCellCount: Math.max(...stages.flatMap((stage) => stage.cells.map((cell) => cell.count)), 0),
  }
}

export function selectFinanceMix(rows = []) {
  const buckets = {
    cash: { key: 'cash', label: 'Cash', count: 0, value: 0 },
    bond: { key: 'bond', label: 'Bond', count: 0, value: 0 },
    combination: { key: 'combination', label: 'Combination', count: 0, value: 0 },
    unknown: { key: 'unknown', label: 'Unknown', count: 0, value: 0 },
  }

  for (const row of rows) {
    const main = toMainStage(row)
    if (main === 'AVAIL') {
      continue
    }

    const type = normalizeFinanceType(row?.transaction?.finance_type, { allowUnknown: true })
    const key = ['cash', 'bond', 'combination'].includes(type) ? type : 'unknown'
    buckets[key].count += 1
    buckets[key].value += getMonetaryValue(row)
  }

  return Object.values(buckets)
}

export function selectDealBottleneckSummary(rows = []) {
  const counters = {
    missing_documents: { key: 'missing_documents', label: 'Missing Documents', count: 0, severity: 'warning' },
    awaiting_finance: { key: 'awaiting_finance', label: 'Awaiting Finance Approval', count: 0, severity: 'warning' },
    with_attorneys: { key: 'with_attorneys', label: 'With Attorneys', count: 0, severity: 'normal' },
    ready_for_lodgement: { key: 'ready_for_lodgement', label: 'Ready for Lodgement', count: 0, severity: 'positive' },
    stale: { key: 'stale', label: 'Stale', count: 0, severity: 'critical' },
  }

  for (const row of rows) {
    if (!row?.transaction) {
      continue
    }

    const stageKey = toMainStage(row)
    const daysInStage = getDaysInStage(row)
    const missingCount = Number(row?.documentSummary?.missingCount || 0)

    if (missingCount > 0 && stageKey !== 'REG') {
      counters.missing_documents.count += 1
    }

    if (stageKey === 'FIN') {
      counters.awaiting_finance.count += 1
    }

    if (stageKey === 'ATTY') {
      counters.with_attorneys.count += 1
    }

    if (stageKey === 'XFER') {
      counters.ready_for_lodgement.count += 1
    }

    if (stageKey !== 'REG' && stageKey !== 'AVAIL' && daysInStage > 21) {
      counters.stale.count += 1
    }
  }

  const items = Object.values(counters)
  const maxCount = Math.max(...items.map((item) => item.count), 0)
  const totalFlagged = items.reduce((sum, item) => sum + item.count, 0)
  const lead = [...items].sort((left, right) => right.count - left.count)[0]

  return {
    items: items.map((item) => ({
      ...item,
      width: maxCount > 0 ? (item.count / maxCount) * 100 : 0,
      share: totalFlagged > 0 ? (item.count / totalFlagged) * 100 : 0,
    })),
    totalFlagged,
    leadLabel: lead?.count ? lead.label : 'No bottlenecks flagged',
  }
}

export function selectBuyerIntelligence(rows = []) {
  const ageGroups = {
    '18-29': 0,
    '30-39': 0,
    '40-49': 0,
    '50+': 0,
    Unknown: 0,
  }
  const genders = {
    Male: 0,
    Female: 0,
    Other: 0,
    Unknown: 0,
  }
  const sources = {}

  for (const row of rows) {
    if (!row?.transaction) {
      continue
    }

    const age = deriveAgeGroup(row.buyer)
    ageGroups[age] = (ageGroups[age] || 0) + 1

    const gender = normalizeGender(row?.buyer?.gender)
    genders[gender] = (genders[gender] || 0) + 1

    const source = formatSource(row?.transaction?.marketing_source || row?.transaction?.lead_source)
    sources[source] = (sources[source] || 0) + 1
  }

  const sourceList = Object.entries(sources)
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => right.value - left.value)
    .slice(0, 6)

  return {
    ageGroups: Object.entries(ageGroups).map(([label, value]) => ({ label, value })),
    genders: Object.entries(genders).map(([label, value]) => ({ label, value })),
    sources: sourceList.length ? sourceList : [{ label: 'Unknown', value: rows.filter((row) => row.transaction).length || 0 }],
  }
}

export function selectActiveTransactions(rows = []) {
  const stageIndexByKey = DEVELOPER_FUNNEL_STAGES.reduce((accumulator, stage, index) => {
    accumulator[stage.key] = index
    return accumulator
  }, {})
  const stageLabelByKey = DEVELOPER_FUNNEL_STAGES.reduce((accumulator, stage) => {
    accumulator[stage.key] = stage.label
    return accumulator
  }, {})

  return rows
    .filter((row) => row?.transaction)
    .map((row) => {
      const stageKey = toMainStage(row)
      const stageIndex = stageIndexByKey[stageKey] ?? 0
      const progressPercent = Math.max(0, Math.min(100, Math.round((stageIndex / (DEVELOPER_FUNNEL_STAGES.length - 1)) * 100)))
      const buyerName = String(row?.buyer?.name || row?.transaction?.buyer_name || '').trim() || 'Buyer pending'
      const nextAction = String(row?.report?.nextStep || row?.transaction?.next_action || '').trim() || 'No next action set'
      const uploadedCount = Number(row?.documentSummary?.uploadedCount || 0)
      const totalRequired = Number(row?.documentSummary?.totalRequired || 0)
      const missingCount = Math.max(Number(row?.documentSummary?.missingCount ?? totalRequired - uploadedCount), 0)
      const financeType = normalizeFinanceType(row?.transaction?.finance_type || 'cash', { allowUnknown: true })

      return {
        id: row?.transaction?.id || row?.unit?.id || `${row?.development?.id || 'dev'}-${row?.unit?.unit_number || 'unit'}`,
        transactionId: row?.transaction?.id || null,
        unitId: row?.unit?.id || null,
        buyerId: row?.transaction?.buyer_id || row?.buyer?.id || null,
        developmentName: row?.development?.name || 'Development',
        unitNumber: row?.unit?.unit_number || '-',
        buyerName,
        stageKey,
        stageLabel: stageLabelByKey[stageKey] || stageKey,
        progressPercent,
        nextAction,
        financeType,
        purchaserType: row?.transaction?.purchaser_type || 'individual',
        attorneyName: String(row?.transaction?.attorney || '').trim() || 'Unassigned',
        uploadedCount,
        totalRequired,
        missingCount,
        updatedAt: getComparableTimestamp(row),
      }
    })
    .filter((item) => item.stageKey !== 'REG')
    .sort((left, right) => {
      if (right.progressPercent !== left.progressPercent) {
        return right.progressPercent - left.progressPercent
      }
      return new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime()
    })
}
