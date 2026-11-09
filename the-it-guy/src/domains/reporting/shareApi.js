// reporting owns these operations and their existing recovery behavior.
import { latestTimestamp } from '../../core/transactions/legacyReadModel.js'
import { fetchDashboardOverview } from './portfolioReadApi.js'
import { requireClient, isMissingTableError, isMissingColumnError, isMissingSchemaError, isPermissionDeniedError } from '../../lib/api/shared/readHelpers.js'
import { STAGES, isInTransferStage, normalizeStageLabel } from '../../core/transactions/stageConfig'
import { selectReportStageSummary } from '../../core/transactions/selectors'
import { requireScopedClient } from '../transactions/contactSupport.js'
import { normalizeSubprocessStepStatus, summarizeSubprocess } from '../transactions/subprocessApi.js'
import { normalizeTransactionCommentRow } from '../transactions/participantInfrastructure.js'

const SNAPSHOT_OWNER_KEY_STORAGE = 'itg:snapshot-owner-key'

function requireSnapshotTokenClient(token) {
  return requireScopedClient({
    'x-bridge-snapshot-token': String(token || '').trim(),
  })
}

function getFallbackOwnerKey() {
  if (typeof window === 'undefined') {
    return 'anon:server'
  }

  let ownerKey = window.localStorage.getItem(SNAPSHOT_OWNER_KEY_STORAGE)
  if (!ownerKey) {
    ownerKey = `anon:${crypto.randomUUID()}`
    window.localStorage.setItem(SNAPSHOT_OWNER_KEY_STORAGE, ownerKey)
  }

  return ownerKey
}

async function resolveSnapshotOwner(client) {
  const { data, error } = await client.auth.getSession()
  if (error) {
    throw error
  }

  const userId = data?.session?.user?.id || null
  if (userId) {
    return {
      userId,
      ownerKey: `user:${userId}`,
    }
  }

  return {
    userId: null,
    ownerKey: getFallbackOwnerKey(),
  }
}

function generateSnapshotToken() {
  return `snap${crypto.randomUUID().replaceAll('-', '')}`
}

export async function fetchReportRows({ developmentId = null, organisationId = null } = {}) {
  const client = requireClient()
  const overview = await fetchDashboardOverview({
    developmentId,
    organisationId,
  })
  const transactionRows = overview.rows.filter((row) => row.transaction)

  if (!transactionRows.length) {
    return []
  }

  const transactionIds = transactionRows.map((row) => row.transaction.id)

  let transactionsDetailsQuery = await client
    .from('transactions')
    .select(
      'id, stage_date, expected_transfer_date, risk_status, sales_price, next_action, attorney, bond_originator, comment, current_main_stage, current_sub_stage_summary, updated_at',
    )
    .in('id', transactionIds)

  if (
    isMissingColumnError(transactionsDetailsQuery.error, 'risk_status') ||
    isMissingColumnError(transactionsDetailsQuery.error, 'stage_date') ||
    isMissingColumnError(transactionsDetailsQuery.error, 'expected_transfer_date') ||
    isMissingColumnError(transactionsDetailsQuery.error, 'sales_price') ||
    isMissingColumnError(transactionsDetailsQuery.error, 'comment') ||
    isMissingColumnError(transactionsDetailsQuery.error, 'current_main_stage') ||
    isMissingColumnError(transactionsDetailsQuery.error, 'current_sub_stage_summary')
  ) {
    transactionsDetailsQuery = await client
      .from('transactions')
      .select('id, next_action, attorney, bond_originator, updated_at')
      .in('id', transactionIds)
  }

  if (transactionsDetailsQuery.error && !isPermissionDeniedError(transactionsDetailsQuery.error)) {
    throw transactionsDetailsQuery.error
  }

  const transactionDetailById = (transactionsDetailsQuery.data || []).reduce((accumulator, row) => {
    accumulator[row.id] = row
    return accumulator
  }, {})

  let discussionRows = []
  const discussionQuery = await client
    .from('transaction_comments')
    .select('id, transaction_id, author_name, author_role, comment_text, created_at')
    .in('transaction_id', transactionIds)
    .order('created_at', { ascending: false })

  if (!discussionQuery.error) {
    discussionRows = (discussionQuery.data || []).map((row) => normalizeTransactionCommentRow(row))
  } else if (
    !isMissingTableError(discussionQuery.error, 'transaction_comments') &&
    !isPermissionDeniedError(discussionQuery.error)
  ) {
    throw discussionQuery.error
  }

  const latestDiscussionByTransactionId = {}
  for (const discussionRow of discussionRows) {
    if (!discussionRow.transactionId) {
      continue
    }

    if (!latestDiscussionByTransactionId[discussionRow.transactionId]) {
      latestDiscussionByTransactionId[discussionRow.transactionId] = discussionRow
    }
  }

  let noteRows = []
  let notesUseUnitReference = false
  let notesQuery = await client
    .from('notes')
    .select('transaction_id, body, created_at')
    .in('transaction_id', transactionIds)
    .order('created_at', { ascending: false })

  if (notesQuery.error && isMissingColumnError(notesQuery.error, 'transaction_id')) {
    notesUseUnitReference = true
    const unitIds = transactionRows.map((row) => row.unit.id)
    notesQuery = await client
      .from('notes')
      .select('unit_id, body, created_at')
      .in('unit_id', unitIds)
      .order('created_at', { ascending: false })
  }

  if (!notesQuery.error) {
    noteRows = notesQuery.data || []
  } else if (!isMissingSchemaError(notesQuery.error) && !isPermissionDeniedError(notesQuery.error)) {
    throw notesQuery.error
  }

  const latestNoteByTransactionId = {}
  const transactionIdByUnitId = transactionRows.reduce((accumulator, row) => {
    accumulator[row.unit.id] = row.transaction.id
    return accumulator
  }, {})

  for (const note of noteRows) {
    const key = notesUseUnitReference ? transactionIdByUnitId[note.unit_id] : note.transaction_id
    if (!key) {
      continue
    }

    if (!latestNoteByTransactionId[key]) {
      latestNoteByTransactionId[key] = note
    }
  }

  const subprocessInsightsByTransactionId = {}
  const subprocessQuery = await client
    .from('transaction_subprocesses')
    .select('id, transaction_id, process_type, status')
    .in('transaction_id', transactionIds)

  if (!subprocessQuery.error) {
    const subprocessRows = subprocessQuery.data || []
    const subprocessIds = subprocessRows.map((item) => item.id).filter(Boolean)
    let stepRows = []

    if (subprocessIds.length) {
      const stepQuery = await client
        .from('transaction_subprocess_steps')
        .select('subprocess_id, step_key, step_label, status, completed_at, comment, sort_order')
        .in('subprocess_id', subprocessIds)

      if (!stepQuery.error) {
        stepRows = stepQuery.data || []
      } else if (!isMissingSchemaError(stepQuery.error) && !isPermissionDeniedError(stepQuery.error)) {
        throw stepQuery.error
      }
    }

    const stepsBySubprocessId = stepRows.reduce((accumulator, step) => {
      if (!accumulator[step.subprocess_id]) {
        accumulator[step.subprocess_id] = []
      }

      accumulator[step.subprocess_id].push({
        ...step,
        status: normalizeSubprocessStepStatus(step.status),
      })
      return accumulator
    }, {})

    for (const subprocess of subprocessRows) {
      const steps = (stepsBySubprocessId[subprocess.id] || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      const summary = summarizeSubprocess({
        ...subprocess,
        steps,
      })

      if (!subprocessInsightsByTransactionId[subprocess.transaction_id]) {
        subprocessInsightsByTransactionId[subprocess.transaction_id] = {}
      }

      subprocessInsightsByTransactionId[subprocess.transaction_id][subprocess.process_type] = {
        ...subprocess,
        steps,
        summary,
      }
    }
  } else if (!isMissingSchemaError(subprocessQuery.error) && !isPermissionDeniedError(subprocessQuery.error)) {
    throw subprocessQuery.error
  }

  const developmentIds = [
    ...new Set(transactionRows.map((row) => row.development?.id || row.unit?.development_id).filter(Boolean)),
  ]
  let developmentPhaseById = {}

  if (developmentIds.length) {
    const developmentProfileQuery = await client
      .from('development_profiles')
      .select('development_id, status')
      .in('development_id', developmentIds)

    if (!developmentProfileQuery.error) {
      developmentPhaseById = (developmentProfileQuery.data || []).reduce((accumulator, row) => {
        accumulator[row.development_id] = row.status || null
        return accumulator
      }, {})
    } else if (
      !isMissingTableError(developmentProfileQuery.error, 'development_profiles') &&
      !isPermissionDeniedError(developmentProfileQuery.error)
    ) {
      throw developmentProfileQuery.error
    }
  }

  return transactionRows.map((row) => {
    const detail = transactionDetailById[row.transaction.id] || {}
    const subprocessInsight = subprocessInsightsByTransactionId[row.transaction.id] || {}
    const nextTargetDate = detail.expected_transfer_date || null
    const riskStatus = detail.risk_status || row.transaction?.risk_status || 'On Track'
    const latestOperationalNote =
      latestDiscussionByTransactionId[row.transaction.id]?.commentBody ||
      latestDiscussionByTransactionId[row.transaction.id]?.commentText ||
      latestNoteByTransactionId[row.transaction.id]?.body ||
      null
    const notesSummary = detail.next_action || row.transaction?.next_action || null
    const purchasePrice = detail.sales_price || row.transaction?.sales_price || row.unit?.price || null
    const developmentId = row.development?.id || row.unit?.development_id || null
    const developmentPhase = row.unit?.phase || (developmentId ? developmentPhaseById[developmentId] || null : null)
    const stageSummary = selectReportStageSummary({
      detailedStage: row.stage,
      currentMainStage: detail.current_main_stage || row.transaction?.current_main_stage,
      transactionDetail: detail,
      subprocessByType: subprocessInsight,
      latestOperationalNote,
    })

    return {
      ...row,
      report: {
        stageDate: stageSummary.stageDate || detail.stage_date || null,
        nextTargetDate,
        riskStatus,
        latestOperationalNote,
        workflowComment: stageSummary.workflowComment,
        notesSummary,
        purchasePrice,
        developmentPhase,
        currentMainStage: stageSummary.currentMainStage,
        subprocess: subprocessInsight,
        financeSummary: stageSummary.financeSummary || null,
        attorneySummary: stageSummary.attorneySummary || null,
        milestoneIndex: stageSummary.milestoneIndex,
        lastCompletedStep: stageSummary.lastCompletedStep,
        nextStep: stageSummary.nextStep,
      },
    }
  })
}

export async function getOrCreateSnapshotLink() {
  const client = requireClient()

  const owner = await resolveSnapshotOwner(client)

  const { data: existing, error: existingError } = await client
    .from('snapshot_links')
    .select('id, user_id, owner_key, token, is_active, created_at, updated_at')
    .eq('owner_key', owner.ownerKey)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingError) {
    if (isMissingTableError(existingError, 'snapshot_links')) {
      return null
    }

    throw existingError
  }

  if (existing) {
    return existing
  }

  let attempt = 0
  while (attempt < 3) {
    const { data, error } = await client
      .from('snapshot_links')
      .insert({
        user_id: owner.userId,
        owner_key: owner.ownerKey,
        token: generateSnapshotToken(),
        is_active: true,
      })
      .select('id, user_id, owner_key, token, is_active, created_at, updated_at')
      .single()

    if (!error) {
      return data
    }

    if (isMissingTableError(error, 'snapshot_links')) {
      return null
    }

    if (!['23505', '42501'].includes(error.code)) {
      throw error
    }

    if (error.code === '42501') {
      throw new Error('Snapshot link permissions are not configured for this user.')
    }

    const { data: retryExisting, error: retryError } = await client
      .from('snapshot_links')
      .select('id, user_id, owner_key, token, is_active, created_at, updated_at')
      .eq('owner_key', owner.ownerKey)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (retryError && retryError.code !== 'PGRST116') {
      throw retryError
    }

    if (retryExisting) {
      return retryExisting
    }

    attempt += 1
  }

  throw new Error('Unable to generate snapshot link. Please try again.')
}

function buildExecutiveDevelopmentSummaries(rows) {
  const map = new Map()

  for (const row of rows) {
    const developmentName = row.development?.name || 'Unknown Development'
    const developmentId = row.development?.id || row.unit?.development_id || `unknown:${developmentName}`
    const unitValue = Number(row.transaction?.sales_price ?? row.unit?.price)
    const normalizedValue = Number.isFinite(unitValue) ? unitValue : 0

    const existing = map.get(developmentId) || {
      id: developmentId,
      name: developmentName,
      totalUnits: 0,
      availableUnits: 0,
      soldActiveUnits: 0,
      unitsInTransfer: 0,
      unitsRegistered: 0,
      dealsInProgress: 0,
      revenueSecured: 0,
      remainingInventoryValue: 0,
      totalPortfolioValue: 0,
      sellThroughPercent: 0,
      latestActivity: null,
    }

    existing.totalUnits += 1
    existing.totalPortfolioValue += normalizedValue

    if (row.stage === 'Available') {
      existing.availableUnits += 1
      existing.remainingInventoryValue += normalizedValue
    } else {
      existing.soldActiveUnits += 1
      existing.revenueSecured += normalizedValue
    }

    if (isInTransferStage(row.stage)) {
      existing.unitsInTransfer += 1
    }

    if (row.stage === 'Registered') {
      existing.unitsRegistered += 1
    }

    if (row.stage !== 'Available' && row.stage !== 'Registered') {
      existing.dealsInProgress += 1
    }

    const activity = latestTimestamp(row)
    if (activity && (!existing.latestActivity || new Date(activity) > new Date(existing.latestActivity))) {
      existing.latestActivity = activity
    }

    existing.sellThroughPercent = existing.totalUnits ? (existing.soldActiveUnits / existing.totalUnits) * 100 : 0

    map.set(developmentId, existing)
  }

  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

function buildExecutiveMetrics(rows) {
  const totalUnits = rows.length
  const stageCounts = STAGES.reduce((accumulator, stage) => {
    accumulator[stage] = 0
    return accumulator
  }, {})

  let totalPortfolioValue = 0
  let remainingInventoryValue = 0
  let revenueSecured = 0
  let availableUnits = 0
  let unitsInTransfer = 0
  let unitsRegistered = 0
  let dealsInProgress = 0

  for (const row of rows) {
    const stage = normalizeStageLabel(row.stage)
    if (stageCounts[stage] === undefined) {
      stageCounts[stage] = 0
    }

    stageCounts[stage] += 1

    const unitValue = Number(row.transaction?.sales_price ?? row.unit?.price)
    const normalizedValue = Number.isFinite(unitValue) ? unitValue : 0
    totalPortfolioValue += normalizedValue

    if (stage === 'Available') {
      availableUnits += 1
      remainingInventoryValue += normalizedValue
    } else {
      revenueSecured += normalizedValue
    }

    if (isInTransferStage(stage)) {
      unitsInTransfer += 1
    }

    if (stage === 'Registered') {
      unitsRegistered += 1
    }

    if (stage !== 'Available' && stage !== 'Registered') {
      dealsInProgress += 1
    }
  }

  const soldActiveUnits = totalUnits - availableUnits
  const health = {
    available: availableUnits,
    early: (stageCounts['Reserved'] || 0) + (stageCounts['OTP Signed'] || 0) + (stageCounts['Deposit Paid'] || 0),
    finance: (stageCounts['Finance Pending'] || 0) + (stageCounts['Bond Approved / Proof of Funds'] || 0),
    transfer:
      (stageCounts['Proceed to Attorneys'] || 0) +
      (stageCounts['Transfer in Progress'] || 0) +
      (stageCounts['Transfer Lodged'] || 0),
    registered: unitsRegistered,
  }

  return {
    totalDevelopments: new Set(rows.map((row) => row.development?.id || row.unit?.development_id).filter(Boolean)).size,
    totalUnits,
    soldActiveUnits,
    dealsInProgress,
    unitsInTransfer,
    unitsRegistered,
    availableUnits,
    totalPortfolioValue,
    revenueSecured,
    remainingInventoryValue,
    sellThroughPercent: totalUnits ? (soldActiveUnits / totalUnits) * 100 : 0,
    stageCounts,
    health,
  }
}

function buildExecutiveAlerts(rows) {
  const oldestFirst = (a, b) => new Date(latestTimestamp(a) || 0) - new Date(latestTimestamp(b) || 0)
  const toAlertItem = (row, issue) => ({
    unitId: row.unit.id,
    unitNumber: row.unit.unit_number,
    developmentName: row.development?.name || 'Unknown Development',
    buyerName: row.buyer?.name || 'No buyer assigned',
    stage: row.stage,
    nextAction: row.transaction?.next_action || row.stage,
    updatedAt: latestTimestamp(row),
    issue,
  })
  const group = (groupRows, issue) => ({
    count: groupRows.length,
    items: [...groupRows]
      .sort(oldestFirst)
      .slice(0, 4)
      .map((row) => toAlertItem(row, issue)),
  })

  const waitingDepositRows = rows.filter((row) => normalizeStageLabel(row.stage) === 'OTP Signed')
  const waitingOtpRows = rows.filter((row) => normalizeStageLabel(row.stage) === 'Reserved')
  const waitingBondRows = rows.filter((row) => normalizeStageLabel(row.stage) === 'Finance Pending')
  const waitingAttorneyRows = rows.filter((row) => normalizeStageLabel(row.stage) === 'Proceed to Attorneys')
  const delayedRows = rows.filter((row) =>
    ['Delayed', 'Blocked'].includes(String(row.transaction?.risk_status || '').trim()),
  )

  return {
    waitingDeposit: group(waitingDepositRows, 'Deposit due'),
    waitingOtp: group(waitingOtpRows, 'OTP pending'),
    waitingBondApproval: group(waitingBondRows, 'Bond approval pending'),
    waitingAttorneys: group(waitingAttorneyRows, 'Attorney handover pending'),
    delayedTransactions: group(delayedRows, 'Marked delayed / blocked'),
    totalAttention:
      waitingDepositRows.length +
      waitingOtpRows.length +
      waitingBondRows.length +
      waitingAttorneyRows.length +
      delayedRows.length,
  }
}

function buildRecentMovement(rows) {
  return rows
    .filter((row) => row.transaction)
    .sort((a, b) => new Date(latestTimestamp(b) || 0) - new Date(latestTimestamp(a) || 0))
    .slice(0, 5)
    .map((row) => ({
      unitId: row.unit.id,
      unitNumber: row.unit.unit_number,
      developmentName: row.development?.name || 'Unknown Development',
      stage: row.stage,
      buyerName: row.buyer?.name || 'No buyer assigned',
      nextAction: row.transaction?.next_action || row.stage,
      updatedAt: latestTimestamp(row),
    }))
}

export async function fetchExecutiveSnapshotByToken(token) {
  const client = requireSnapshotTokenClient(token)
  const normalizedToken = String(token || '').trim()

  if (!normalizedToken) {
    throw new Error('Snapshot token is required.')
  }

  const { data: snapshotLink, error: snapshotLinkError } = await client
    .from('snapshot_links')
    .select('id, user_id, owner_key, token, is_active, created_at, updated_at')
    .eq('token', normalizedToken)
    .eq('is_active', true)
    .maybeSingle()

  if (snapshotLinkError) {
    if (isMissingTableError(snapshotLinkError, 'snapshot_links')) {
      throw new Error('Snapshot links are not set up yet. Run sql/schema.sql to create snapshot_links.')
    }

    throw snapshotLinkError
  }

  if (!snapshotLink) {
    throw new Error('Snapshot link is invalid or inactive.')
  }

  const overview = await fetchDashboardOverview({ client })
  const rows = overview.rows

  return {
    snapshotLink,
    generatedAt: new Date().toISOString(),
    metrics: buildExecutiveMetrics(rows),
    developments: buildExecutiveDevelopmentSummaries(rows),
    alerts: buildExecutiveAlerts(rows),
    recentMovement: buildRecentMovement(rows),
  }
}
