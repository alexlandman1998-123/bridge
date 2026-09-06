#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { ATTORNEY_RELEASE_ROLES } from '../src/constants/attorneyReleaseReadinessPhase0.js'
import { assertAttorneyStagingTarget } from './lib/attorney-staging-safety.mjs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const text = (value) => String(value || '').trim()
const option = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) || ''
const ledgerPath = resolve(projectRoot, option('--ledger') || 'output/attorney-release/phase5-controlled-batch-ledger.json')
const observationPath = resolve(projectRoot, option('--observation') || 'output/attorney-release/phase6-observation.json')
const rollbackPath = resolve(projectRoot, option('--rollback') || 'output/attorney-release/phase6-rollback-readiness.json')
const owner = text(option('--owner'))
const approvalReference = text(option('--approval-reference'))
const url = text(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
const serviceKey = text(process.env.SUPABASE_SERVICE_ROLE_KEY)
assertAttorneyStagingTarget({ supabaseUrl: url, expectedProjectRef: process.env.SUPABASE_STAGING_PROJECT_REF, productionProjectRef: process.env.VITE_PRODUCTION_SUPABASE_PROJECT_REF, environment: 'staging' })
if (!serviceKey) throw new Error('The staging service-role key is required for read-only Phase 6 observation.')
if (!existsSync(ledgerPath)) throw new Error('The Phase 5 controlled-batch ledger is required.')
const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'))
const { ledgerFingerprint, updatedAt, ...ledgerCore } = ledger
if (createHash('sha256').update(JSON.stringify(ledgerCore)).digest('hex') !== ledgerFingerprint) throw new Error('The Phase 5 ledger fingerprint is invalid.')
const applied = ledger.batches?.filter((item) => item.mode === 'apply') || []
if (!applied.length || Number(applied.at(-1)?.afterGapCount) !== 0) throw new Error('Phase 5 must end at zero gaps before observation starts.')
const previous = existsSync(observationPath) ? JSON.parse(readFileSync(observationPath, 'utf8')) : null
if (!previous && (!owner || !approvalReference)) throw new Error('Starting Phase 6 requires --owner and --approval-reference.')
if (previous?.sourceFingerprint && previous.sourceFingerprint !== ledgerFingerprint) throw new Error('The existing observation belongs to another Phase 5 ledger.')
const startedAt = previous?.startedAt || applied.at(-1).completedAt
const observedAt = new Date().toISOString()
const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const roles = ATTORNEY_RELEASE_ROLES.map(({ transactionRole }) => transactionRole)
const receipts = await db.from('transaction_sync_command_receipts').select('actor_role,status,created_at,completed_at').in('actor_role', roles).gte('created_at', startedAt).order('created_at', { ascending: true })
if (receipts.error) throw receipts.error
const rows = receipts.data || []
const actionsByRole = Object.fromEntries(roles.map((role) => [role, rows.filter((row) => row.actor_role === role).length]))
const successful = rows.filter((row) => row.status === 'projected').length
const latencies = rows.filter((row) => row.created_at && row.completed_at).map((row) => Math.max(0, (Date.parse(row.completed_at) - Date.parse(row.created_at)) / 1000)).sort((a, b) => a - b)
const p95 = latencies.length ? latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1)] : 0
const health = await db.rpc('bridge_transaction_progress_propagation_health_phase6', { p_transaction_id: null, p_stale_seconds: 120 })
if (health.error) throw health.error
const observationCore = {
  version: 'attorney-release-phase6-observation-v2', sourceFingerprint: ledgerFingerprint, projectRef: ledger.projectRef,
  startedAt, observedAt, observationHours: Math.max(0, Number(((Date.parse(observedAt) - Date.parse(startedAt)) / 3600000).toFixed(2))),
  cohortSize: 1, totalActions: rows.length, actionsByRole, successfulActionRate: rows.length ? Number((successful / rows.length).toFixed(4)) : 0,
  propagationP95Seconds: Number(p95.toFixed(3)), currentGapCount: Number(health.data?.gapCount ?? health.data?.gap_count ?? 0),
  securityIncidents: Number(previous?.securityIncidents || 0), visibilityBreaches: Number(previous?.visibilityBreaches || 0),
  dataIntegrityFailures: Number(previous?.dataIntegrityFailures || 0), unexpectedPermissionAllows: Number(previous?.unexpectedPermissionAllows || 0),
  unresolvedCriticalIncidents: Number(previous?.unresolvedCriticalIncidents || 0),
  incidentReview: previous?.incidentReview || { reviewedBy: owner, approvalReference, reviewedAt: observedAt },
}
const observation = { ...observationCore, observationFingerprint: createHash('sha256').update(JSON.stringify(observationCore)).digest('hex') }
const existingRollback = existsSync(rollbackPath) ? JSON.parse(readFileSync(rollbackPath, 'utf8')) : null
const rollbackCore = existingRollback ? (({ rollbackFingerprint, ...rest }) => rest)(existingRollback) : {
  version: 'attorney-release-phase6-rollback-v2', sourceFingerprint: ledgerFingerprint, owner, approvalReference, verifiedAt: observedAt,
  environment: 'staging', procedure: 'Stop the attorney pilot, preserve the audit ledger, disable pilot access, restore the recoverable staging backup if required, and rerun propagation health before reopening access.',
}
if (rollbackCore.sourceFingerprint !== ledgerFingerprint) throw new Error('Rollback evidence belongs to another Phase 5 ledger.')
const rollback = { ...rollbackCore, rollbackFingerprint: createHash('sha256').update(JSON.stringify(rollbackCore)).digest('hex') }
mkdirSync(dirname(observationPath), { recursive: true })
writeFileSync(observationPath, `${JSON.stringify(observation, null, 2)}\n`, { mode: 0o600 })
writeFileSync(rollbackPath, `${JSON.stringify(rollback, null, 2)}\n`, { mode: 0o600 })
console.log(JSON.stringify({ phase: 6, status: 'OBSERVED', projectRef: ledger.projectRef, sourceFingerprint: ledgerFingerprint, observationHours: observation.observationHours, totalActions: observation.totalActions, actionsByRole, successfulActionRate: observation.successfulActionRate, propagationP95Seconds: observation.propagationP95Seconds, currentGapCount: observation.currentGapCount, observationPath, rollbackPath }, null, 2))
