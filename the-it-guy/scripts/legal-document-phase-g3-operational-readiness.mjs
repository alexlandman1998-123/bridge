import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { assessLegalDocumentOperationalReadiness } from '../src/core/documents/legalDocumentOperationalReadiness.js'

function runJson(script, timeout = 300_000) {
  const run = spawnSync(process.execPath, [script], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout, maxBuffer: 10 * 1024 * 1024 })
  try { return { report: JSON.parse(run.stdout), error: null } } catch { return { report: null, error: run.stderr || run.stdout || `${script} returned no JSON.` } }
}
const config = JSON.parse(fs.readFileSync('config/legal-document-g3-operations.json', 'utf8'))
const g2Run = runJson('scripts/legal-document-phase-g2-browser-usability.mjs')
const monitorRun = runJson('scripts/legal-document-phase4-monitor.mjs')
const reconciliationRun = runJson('scripts/legal-document-phase5-reconcile.mjs')
const blockers = []
if (!g2Run.report) blockers.push({ code: 'G3_G2_CHECK_UNAVAILABLE', detail: g2Run.error })
if (!monitorRun.report) blockers.push({ code: 'G3_MONITOR_CHECK_UNAVAILABLE', detail: monitorRun.error })
if (!reconciliationRun.report) blockers.push({ code: 'G3_RECONCILIATION_CHECK_UNAVAILABLE', detail: reconciliationRun.error })

let watchdog = {}
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  blockers.push({ code: 'G3_WATCHDOG_STORE_UNAVAILABLE', detail: 'Supabase URL and service role key are required.' })
} else {
  const require = createRequire(path.resolve('package.json'))
  const { createClient } = require('@supabase/supabase-js')
  const client = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const result = await client.from('system_health_snapshots').select('id, status, summary, created_at').contains('summary', { kind: 'legal_document_watchdog_v1' }).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (result.error) blockers.push({ code: 'G3_WATCHDOG_STORE_UNAVAILABLE', detail: result.error.message })
  else watchdog = result.data || {}
}

for (const reference of [config.supportRunbookReference, config.rollbackRunbookReference]) {
  const file = String(reference || '').split('#')[0]
  if (file && !fs.existsSync(file)) blockers.push({ code: 'G3_RUNBOOK_REFERENCE_INVALID', detail: file })
}
const assessment = assessLegalDocumentOperationalReadiness({ config, g2: g2Run.report || {}, monitor: monitorRun.report || {}, reconciliation: reconciliationRun.report || {}, watchdog })
blockers.push(...assessment.reasons.map((code) => ({ code })))
const solutions = {
  G3_G2_NOT_READY: 'Complete G2 desktop and mobile usability verification before operational sign-off.',
  G3_G2_CHECK_UNAVAILABLE: 'Restore the G2 browser verifier and its staging actor configuration.',
  G3_MONITOR_CHECK_UNAVAILABLE: 'Restore the read-only 24-hour monitoring check.',
  G3_RECONCILIATION_CHECK_UNAVAILABLE: 'Restore the dry-run reconciliation check.',
  G3_MONITORING_UNHEALTHY: 'Resolve every generation failure and stale signing packet reported by the 24-hour monitor.',
  G3_RECONCILIATION_NOT_CLEAN: 'Review every ambiguous completed packet; only superseded controlled fixtures may use guarded archival.',
  G3_OPERATIONAL_EVIDENCE_PENDING: 'After all G3 evidence is real and reviewed, set the operations configuration status to ready.',
  G3_OPERATIONS_OWNER_MISSING: 'Name the person accountable for document service health and incident decisions.',
  G3_SUPPORT_OWNER_MISSING: 'Name the first-line support owner for agent, seller, buyer, and signer issues.',
  G3_INCIDENT_CHANNEL_MISSING: 'Record the real incident channel or escalation reference.',
  G3_MONITORING_REFERENCE_MISSING: 'Record the deployed scheduler/dashboard evidence reference.',
  G3_RUNBOOK_REFERENCE_MISSING: 'Record both support and rollback runbook references.',
  G3_RUNBOOK_REFERENCE_INVALID: 'Correct the runbook path so the referenced operational procedure exists.',
  G3_WATCHDOG_STORE_UNAVAILABLE: 'Deploy the watchdog and restore access to its health snapshots.',
  G3_WATCHDOG_NOT_FRESH_HEALTHY: 'Run the protected watchdog and obtain a healthy snapshot within the configured freshness window.',
  G3_WATCHDOG_COVERAGE_INVALID: 'Deploy the G3 watchdog update so F2 evidence, F3 delivery, and portal publication are monitored.',
  G3_WATCHDOG_ACTIVE_BLOCKERS: 'Resolve every blocker in the latest watchdog snapshot before release.',
}
const unique = [...new Map(blockers.map((row) => [`${row.code}:${row.detail || ''}`, row])).values()]
console.log(JSON.stringify({
  phase: 'G3',
  status: unique.length ? 'NO_GO' : 'READY_FOR_G4',
  blockerCount: unique.length,
  blockers: unique.map((row) => ({ ...row, solution: solutions[row.code] || 'Resolve this operational gate and rerun G3.' })),
  evidence: {
    g2Status: g2Run.report?.status || 'UNAVAILABLE',
    monitorStatus: monitorRun.report?.status || 'UNAVAILABLE',
    reconciliationStatus: reconciliationRun.report?.status || 'UNAVAILABLE',
    watchdog: watchdog.id ? { id: watchdog.id, status: watchdog.status, createdAt: watchdog.created_at, metrics: watchdog.summary?.metrics || {}, blockerCount: watchdog.summary?.blockers?.length || 0, ageMinutes: assessment.watchdogAgeMinutes } : null,
    operations: { status: config.status, operationsOwner: config.operationsOwner, supportOwner: config.supportOwner, incidentChannelReference: config.incidentChannelReference, monitoringReference: config.monitoringReference, supportRunbookReference: config.supportRunbookReference, rollbackRunbookReference: config.rollbackRunbookReference },
  },
  checkedAt: new Date().toISOString(),
  mutatedData: false,
}, null, 2))
if (unique.length) process.exitCode = 1
