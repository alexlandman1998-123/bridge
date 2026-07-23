import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { assessDocumentGeneratorOperationalReadiness } from '../src/core/documents/documentGeneratorOperationalReadiness.js'

function runJson(script, timeout = 360_000) {
  const run = spawnSync(process.execPath, [script], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout, maxBuffer: 20 * 1024 * 1024 })
  const output = String(run.stdout || '').trim()
  try { return { report: JSON.parse(output), error: null } } catch { return { report: null, error: String(run.stderr || output || `${script} returned no report.`).trim() } }
}

const config = JSON.parse(fs.readFileSync('config/legal-document-g3-operations.json', 'utf8'))
const g1Run = runJson('scripts/document-generator-phase-g1-verify.mjs')
const g2Run = runJson('scripts/document-generator-phase-g2-browser-usability.mjs')
const reconciliationRun = runJson('scripts/legal-document-phase5-reconcile.mjs')
const preflightBlockers = []
if (!g1Run.report) preflightBlockers.push({ code: 'G3_G1_CHECK_UNAVAILABLE', detail: g1Run.error, solution: 'Restore the read-only G1 verifier and its staging service credentials.' })
if (!g2Run.report) preflightBlockers.push({ code: 'G3_G2_CHECK_UNAVAILABLE', detail: g2Run.error, solution: 'Restore the G2 browser actor and staging application access.' })
if (!reconciliationRun.report) preflightBlockers.push({ code: 'G3_RECONCILIATION_CHECK_UNAVAILABLE', detail: reconciliationRun.error, solution: 'Restore the read-only Phase 5 reconciliation verifier and service credentials.' })

let watchdog = {}
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
if (!url || !serviceKey) {
  preflightBlockers.push({ code: 'G3_WATCHDOG_STORE_UNAVAILABLE', detail: 'Supabase URL and service role key are required.', solution: 'Configure staging read credentials so G3 can inspect health snapshots.' })
} else {
  const require = createRequire(path.resolve('package.json'))
  const { createClient } = require('@supabase/supabase-js')
  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const result = await client.from('system_health_snapshots').select('id,status,summary,created_at').contains('summary', { kind: 'legal_document_watchdog_v1' }).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (result.error) preflightBlockers.push({ code: 'G3_WATCHDOG_STORE_UNAVAILABLE', detail: result.error.message, solution: 'Restore the watchdog snapshot table and service-role read access.' })
  else watchdog = result.data || {}
}

for (const reference of [config.supportRunbookReference, config.rollbackRunbookReference]) {
  const file = String(reference || '').split('#')[0]
  if (file && !fs.existsSync(file)) preflightBlockers.push({ code: 'G3_RUNBOOK_REFERENCE_INVALID', detail: file, solution: 'Correct the configured runbook path to an existing operational procedure.' })
}

const assessment = assessDocumentGeneratorOperationalReadiness({ g1: g1Run.report || {}, g2: g2Run.report || {}, reconciliation: reconciliationRun.report || {}, watchdog, config })
const blockers = [...new Map([...preflightBlockers, ...assessment.blockers].map((item) => [item.code, item])).values()]
console.log(JSON.stringify({
  phase: 'G3',
  status: blockers.length ? 'NO_GO' : 'READY_FOR_G4',
  ready: blockers.length === 0,
  blockerCount: blockers.length,
  blockers,
  evidence: {
    g1Status: g1Run.report?.status || 'UNAVAILABLE',
    g2Status: g2Run.report?.status || 'UNAVAILABLE',
    reconciliationStatus: reconciliationRun.report?.status || 'UNAVAILABLE',
    watchdog: watchdog.id ? { id: watchdog.id, status: watchdog.status, createdAt: watchdog.created_at, ageMinutes: assessment.watchdogAgeMinutes, metrics: watchdog.summary?.metrics || {}, blockers: watchdog.summary?.blockers || [] } : null,
    operations: { status: config.status, operationsOwner: config.operationsOwner, supportOwner: config.supportOwner, incidentChannelReference: config.incidentChannelReference, monitoringReference: config.monitoringReference, supportRunbookReference: config.supportRunbookReference, rollbackRunbookReference: config.rollbackRunbookReference },
  },
  checkedAt: new Date().toISOString(),
  mutatedData: false,
}, null, 2))
if (blockers.length) process.exitCode = 1
