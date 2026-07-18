import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { assessLegalDocumentExpandedCohortSoak } from '../src/core/documents/legalDocumentExpandedCohortSoakGate.js'

const run = spawnSync(process.execPath, ['scripts/legal-document-phase-t1-verify-continuation.mjs'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 120_000, maxBuffer: 10 * 1024 * 1024 })
let t1
try { t1 = JSON.parse(run.stdout) } catch { t1 = { status: 'UNAVAILABLE', ready: false, mutatedData: false } }
const pilot = JSON.parse(fs.readFileSync('config/legal-document-pilot.json', 'utf8'))
let continuationState
let activationState
try { continuationState = JSON.parse(fs.readFileSync('config/legal-document-expanded-cohort-continuation.json', 'utf8')) } catch { continuationState = { status: 'unavailable', record: null } }
try { activationState = JSON.parse(fs.readFileSync('config/legal-document-expansion-activation.json', 'utf8')) } catch { activationState = { status: 'unavailable', activation: null } }
const record = continuationState.record
const activation = activationState.activation
let storeAvailable = true
let storeError = null
let metrics = { generationFailures: 0, staleSigningPackets: 0, addedOrganisationCompletedOtp: 0, addedOrganisationCompletedMandate: 0 }
let watchdogs = []
let targetAligned = false
let activationAligned = false

if (t1.status === 'READY_FOR_T2' && record?.recordedAt) {
  try {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
    if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase URL and service role key are required for T2.')
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
    const addedRows = (completed.data || []).filter((row) => row.organisation_id === record.addedOrganisationId)
    metrics = {
      generationFailures: (failures.data || []).length,
      staleSigningPackets: (stale.data || []).length,
      addedOrganisationCompletedOtp: addedRows.filter((row) => String(row.packet_type || '').toLowerCase() === 'otp').length,
      addedOrganisationCompletedMandate: addedRows.filter((row) => ['mandate', 'salesmandate', 'sales_mandate'].includes(String(row.packet_type || '').toLowerCase())).length,
    }
    watchdogs = health.data || []
    const normalized = (value) => [...new Set(value || [])].sort().join(',')
    targetAligned = record.releaseTarget?.environment === pilot.environment
      && record.releaseTarget?.projectRef === pilot.activation?.targetProjectRef
      && normalized(record.releaseTarget?.organisationIds) === normalized(pilot.organisationIds)
      && normalized(record.releaseTarget?.organisationIds) === normalized(pilot.activation?.activatedOrganisationIds)
    activationAligned = activation?.status === 'activated'
      && record.sourceActivationDigest === activation.activationDigest
      && record.addedOrganisationId === activation.addedOrganisationId
      && normalized(record.releaseTarget?.organisationIds) === normalized(activation.activatedOrganisationIds)
  } catch (error) {
    storeAvailable = false
    storeError = error.message
  }
}

const assessment = assessLegalDocumentExpandedCohortSoak({ t1, record, metrics, watchdogs, targetAligned, activationAligned, storeAvailable })
console.log(JSON.stringify({
  phase: 'T2', status: assessment.status, ready: assessment.ready, decision: assessment.decision,
  blockerCount: assessment.blockers.length, blockers: assessment.blockers,
  observation: { soakHours: assessment.soakHours, elapsedHours: assessment.elapsedHours, remainingHours: assessment.remainingHours, watchdogFreshnessMinutes: assessment.watchdogFreshnessMinutes },
  evidence: { t1Status: t1.status || 'UNAVAILABLE', continuationState: continuationState.status || 'UNAVAILABLE', activationState: activationState.status || 'UNAVAILABLE', addedOrganisationId: record?.addedOrganisationId || null, metrics, watchdogCount: watchdogs.length, targetAligned, activationAligned, storeAvailable, storeError },
  checkedAt: new Date().toISOString(), mutatedData: false,
}, null, 2))
if (!assessment.ready) process.exitCode = 1
