import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { assessLegalDocumentCohortSoak } from '../src/core/documents/legalDocumentCohortSoakGate.js'

const run = spawnSync(process.execPath, ['scripts/legal-document-phase-o1-verify-continuation.mjs'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 120_000, maxBuffer: 10 * 1024 * 1024 })
let o1
try { o1 = JSON.parse(run.stdout) } catch { o1 = { status: 'UNAVAILABLE', ready: false, mutatedData: false } }
const pilot = JSON.parse(fs.readFileSync('config/legal-document-pilot.json', 'utf8'))
let continuationState
try { continuationState = JSON.parse(fs.readFileSync('config/legal-document-cohort-continuation.json', 'utf8')) } catch { continuationState = { status: 'unavailable', record: null } }
const record = continuationState.record
let storeAvailable = true
let storeError = null
let metrics = { generationFailures: 0, staleSigningPackets: 0, completedOtp: 0, completedMandate: 0 }
let watchdogs = []
let targetAligned = false

if (o1.status === 'READY_FOR_O2' && record?.recordedAt) {
  try {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
    if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase URL and service role key are required for O2.')
    const require = createRequire(path.resolve('package.json'))
    const { createClient } = require('@supabase/supabase-js')
    const client = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    const organisationIds = record.releaseTarget?.organisationIds || []
    const staleBefore = new Date(Date.now() - Number(pilot.limits?.staleSigningHours || 2) * 3_600_000).toISOString()
    const [failures, stale, completed, health] = await Promise.all([
      client.from('document_packet_events').select('id, organisation_id, event_type, created_at').in('organisation_id', organisationIds).eq('event_type', 'generation_failed').gte('created_at', record.recordedAt),
      client.from('document_packets').select('id, organisation_id, packet_type, status, updated_at').in('organisation_id', organisationIds).in('packet_type', ['otp', 'mandate', 'salesmandate', 'sales_mandate']).in('status', ['sent', 'partially_signed']).lt('updated_at', staleBefore),
      client.from('document_packets').select('id, organisation_id, packet_type, status, completed_at').in('organisation_id', organisationIds).eq('status', 'completed').gte('completed_at', record.recordedAt),
      client.from('system_health_snapshots').select('id, status, summary, created_at').contains('summary', { kind: 'legal_document_watchdog_v1' }).gte('created_at', record.recordedAt).order('created_at', { ascending: false }).limit(200),
    ])
    const error = [failures, stale, completed, health].find((result) => result.error)?.error
    if (error) throw error
    const completedRows = completed.data || []
    metrics = {
      generationFailures: (failures.data || []).length,
      staleSigningPackets: (stale.data || []).length,
      completedOtp: completedRows.filter((row) => String(row.packet_type || '').toLowerCase() === 'otp').length,
      completedMandate: completedRows.filter((row) => ['mandate', 'salesmandate', 'sales_mandate'].includes(String(row.packet_type || '').toLowerCase())).length,
    }
    watchdogs = health.data || []
    const normalized = (value) => [...new Set(value || [])].sort().join(',')
    targetAligned = record.releaseTarget?.environment === pilot.environment
      && record.releaseTarget?.projectRef === pilot.activation?.targetProjectRef
      && normalized(record.releaseTarget?.organisationIds) === normalized(pilot.organisationIds)
      && normalized(record.releaseTarget?.organisationIds) === normalized(pilot.activation?.activatedOrganisationIds)
  } catch (error) {
    storeAvailable = false
    storeError = error.message
  }
}

const assessment = assessLegalDocumentCohortSoak({ o1, record, metrics, watchdogs, targetAligned, storeAvailable })
console.log(JSON.stringify({
  phase: 'O2', status: assessment.status, ready: assessment.ready, decision: assessment.decision,
  blockerCount: assessment.blockers.length, blockers: assessment.blockers,
  observation: { soakHours: assessment.soakHours, elapsedHours: assessment.elapsedHours, remainingHours: assessment.remainingHours, watchdogFreshnessMinutes: assessment.watchdogFreshnessMinutes },
  evidence: { o1Status: o1.status || 'UNAVAILABLE', continuationState: continuationState.status || 'UNAVAILABLE', metrics, watchdogCount: watchdogs.length, targetAligned, storeAvailable, storeError },
  checkedAt: new Date().toISOString(), mutatedData: false,
}, null, 2))
if (!assessment.ready) process.exitCode = 1
