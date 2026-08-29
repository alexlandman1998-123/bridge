import { createHash } from 'node:crypto'

import {
  runTransactionSyncPhase7CanaryCertification,
} from './transactionSyncPhase7CanaryCertificationService.js'

function text(value) {
  return String(value || '').trim()
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
}

function evidenceHash(value) {
  return createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex')
}

async function requiredQuery(promise, label) {
  const result = await promise
  if (result.error) throw new Error(`${label}: ${result.error.message || 'query failed'}`)
  return result
}

function isEligibleTransaction(row = {}, includeDemo = false) {
  const lifecycle = text(row.lifecycle_state).toLowerCase()
  return row.is_active !== false && !['archived', 'cancelled'].includes(lifecycle) && (includeDemo || row.is_demo_data !== true)
}

export async function fetchCompleteTransactionSyncFleet(client, options = {}) {
  const pageSize = Math.min(Math.max(Number(options.pageSize) || 50, 1), 250)
  const maxPages = Math.min(Math.max(Number(options.maxPages) || 10000, 1), 10000)
  const snapshotAt = options.now || new Date().toISOString()
  const rows = []
  const uniqueIds = new Set()
  let expectedRows = null
  let rowsRead = 0
  let page = 0
  while (page < maxPages) {
    const start = page * pageSize
    const result = await requiredQuery(client.from('transactions')
      .select('id,lifecycle_state,is_active,is_demo_data,created_at', page === 0 ? { count: 'exact' } : {})
      .lte('created_at', snapshotAt)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(start, start + pageSize - 1), 'transaction fleet page')
    const pageRows = result.data || []
    if (page === 0) expectedRows = Number(result.count ?? 0)
    rowsRead += pageRows.length
    for (const row of pageRows) {
      if (!row.id || uniqueIds.has(row.id)) continue
      uniqueIds.add(row.id)
      rows.push(row)
    }
    page += 1
    if (pageRows.length < pageSize) {
      return {
        complete: expectedRows !== null && uniqueIds.size === expectedRows,
        snapshotAt,
        expectedRows,
        pagesRead: page,
        rowsRead,
        transactions: rows.filter((row) => isEligibleTransaction(row, options.includeDemo === true)),
      }
    }
  }
  return {
    complete: false,
    snapshotAt,
    expectedRows,
    pagesRead: page,
    rowsRead,
    transactions: rows.filter((row) => isEligibleTransaction(row, options.includeDemo === true)),
  }
}

async function fetchRecentPassingCanaries(client, options) {
  const maxAgeHours = Math.min(Math.max(Number(options.canaryMaxAgeHours) || 24, 1), 168)
  const nowMs = options.now ? new Date(options.now).getTime() : Date.now()
  const cutoff = new Date(nowMs - maxAgeHours * 60 * 60 * 1000).toISOString()
  const result = await requiredQuery(client.from('transaction_sync_certification_runs')
    .select('id,transaction_id,evidence_hash,canonical_version,created_at')
    .eq('environment', options.environment)
    .eq('project_ref', options.projectRef)
    .eq('status', 'passed')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(100), 'passing canary certifications')
  return result.data || []
}

export function buildTransactionSyncFleetRelease({
  environment,
  projectRef,
  fleet,
  canaries = [],
  certifications = [],
  failures = [],
} = {}) {
  const issueCodes = []
  const fleetTransactionIds = new Set((fleet?.transactions || []).map((row) => row.id).filter(Boolean))
  const passedTransactionIds = new Set(certifications
    .filter((row) => fleetTransactionIds.has(row.transactionId) && row.certification?.certified)
    .map((row) => row.transactionId))
  const activeCount = fleetTransactionIds.size
  const fleetSnapshotAt = text(fleet?.snapshotAt)
  const enumeratedTransactionCount = Number.isInteger(fleet?.expectedRows) ? fleet.expectedRows : null
  if (!fleet?.complete || !fleetSnapshotAt || enumeratedTransactionCount === null || enumeratedTransactionCount < activeCount) {
    issueCodes.push('fleet_enumeration_truncated')
  }
  if (!activeCount) issueCodes.push('no_active_transactions')
  if (!canaries.length) issueCodes.push('passing_canary_missing')
  if (failures.length) issueCodes.push('certification_execution_failed')
  if (passedTransactionIds.size !== activeCount || certifications.some((row) => (
    !fleetTransactionIds.has(row.transactionId) || !row.certification?.certified
  ))) issueCodes.push('transaction_certification_failed')

  const transactionEvidenceHashes = Object.fromEntries(certifications
    .filter((row) => fleetTransactionIds.has(row.transactionId) && row.certification?.certified && row.certification?.evidenceHash)
    .map((row) => [row.transactionId, row.certification.evidenceHash])
    .sort(([left], [right]) => left.localeCompare(right)))
  const passedCount = passedTransactionIds.size
  const failedCount = Math.max(0, activeCount - passedCount)
  const releaseEvidence = {
    environment,
    projectRef,
    fleetSnapshotAt: fleetSnapshotAt || null,
    enumeratedTransactionCount: enumeratedTransactionCount ?? 0,
    canaryRunIds: canaries.map((row) => row.id).sort(),
    activeTransactionCount: activeCount,
    passedTransactionCount: passedCount,
    failedTransactionCount: failedCount,
    transactionEvidenceHashes,
    issueCodes: [...new Set(issueCodes)].sort(),
  }
  const uniqueIssueCodes = releaseEvidence.issueCodes
  return {
    status: uniqueIssueCodes.length ? 'failed' : 'passed',
    releaseReady: uniqueIssueCodes.length === 0,
    fleetSnapshotAt: releaseEvidence.fleetSnapshotAt,
    enumeratedTransactionCount: releaseEvidence.enumeratedTransactionCount,
    activeTransactionCount: activeCount,
    passedTransactionCount: passedCount,
    failedTransactionCount: failedCount,
    canaryRunIds: releaseEvidence.canaryRunIds,
    transactionEvidenceHashes,
    issueCodes: uniqueIssueCodes,
    evidenceHash: evidenceHash(releaseEvidence),
  }
}

export async function runTransactionSyncPhase8FleetRelease(client, options = {}) {
  const environment = text(options.environment).toLowerCase()
  const projectRef = text(options.projectRef).toLowerCase()
  const reason = text(options.reason)
  if (!environment || !projectRef) throw new Error('Environment and project ref are required.')
  if (reason.length < 12 || reason.length > 500) throw new Error('A release reason between 12 and 500 characters is required.')

  const [fleet, canaries] = await Promise.all([
    fetchCompleteTransactionSyncFleet(client, options),
    fetchRecentPassingCanaries(client, { ...options, environment, projectRef }),
  ])
  const certifications = []
  const failures = []
  for (const transaction of fleet.transactions) {
    try {
      const result = await runTransactionSyncPhase7CanaryCertification(client, {
        transactionId: transaction.id,
        environment,
        projectRef,
        reason,
        receiptLimit: options.receiptLimit,
        includeDemo: options.includeDemo === true,
        certify: false,
      })
      certifications.push({
        transactionId: transaction.id,
        certification: result.certification,
      })
    } catch (error) {
      failures.push({ transactionId: transaction.id, message: String(error?.message || error) })
    }
  }

  const release = buildTransactionSyncFleetRelease({
    environment,
    projectRef,
    fleet,
    canaries,
    certifications,
    failures,
  })
  let releaseRunId = null
  if (options.recordRelease === true) {
    const inserted = await requiredQuery(client.from('transaction_sync_fleet_release_runs').insert({
      environment,
      project_ref: projectRef,
      status: release.status,
      fleet_snapshot_at: release.fleetSnapshotAt,
      enumerated_transaction_count: release.enumeratedTransactionCount,
      active_transaction_count: release.activeTransactionCount,
      passed_transaction_count: release.passedTransactionCount,
      failed_transaction_count: release.failedTransactionCount,
      canary_run_ids_json: release.canaryRunIds,
      transaction_evidence_hashes_json: release.transactionEvidenceHashes,
      issue_codes_json: release.issueCodes,
      evidence_hash: release.evidenceHash,
      release_reason: reason,
    }).select('id').single(), 'fleet release receipt')
    releaseRunId = inserted.data?.id || null
  }

  return {
    phase: 8,
    mode: options.recordRelease === true ? 'record' : 'plan',
    releaseReady: release.releaseReady,
    releaseRunId,
    fleet: {
      complete: fleet.complete,
      snapshotAt: fleet.snapshotAt,
      expectedRows: fleet.expectedRows,
      pagesRead: fleet.pagesRead,
      rowsRead: fleet.rowsRead,
      activeTransactionCount: fleet.transactions.length,
    },
    canaryCount: canaries.length,
    release,
    failures,
    certifications,
  }
}
