import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { assessLegalDocumentCanaryContinuation } from '../src/core/documents/legalDocumentCanaryContinuationGate.js'

const run = spawnSync(process.execPath, ['scripts/legal-document-phase-n3-canary-acceptance.mjs'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 1_200_000, maxBuffer: 30 * 1024 * 1024 })
let n3
try { n3 = JSON.parse(run.stdout) } catch { n3 = { status: 'UNAVAILABLE', ready: false, acceptedCanaries: [], mutatedData: false } }
const pilot = JSON.parse(fs.readFileSync('config/legal-document-pilot.json', 'utf8'))
let claimState
try { claimState = JSON.parse(fs.readFileSync('config/legal-document-release-claim.json', 'utf8')) } catch { claimState = { status: 'unavailable', claim: null } }
const claim = claimState.claim
let storeAvailable = true
let storeError = null
let metrics = { generationFailures: 0, staleSigningPackets: 0 }
let watchdog = null
let targetAligned = false

if (n3.status === 'READY_FOR_N4' && claim?.claimedAt) {
  try {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
    if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase URL and service role key are required for N4.')
    const require = createRequire(path.resolve('package.json'))
    const { createClient } = require('@supabase/supabase-js')
    const client = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    const organisationIds = claim.releaseTarget?.organisationIds || []
    const staleBefore = new Date(Date.now() - Number(pilot.limits?.staleSigningHours || 2) * 60 * 60 * 1000).toISOString()
    const [failures, stale, health] = await Promise.all([
      client.from('document_packet_events').select('id, organisation_id, event_type, created_at').in('organisation_id', organisationIds).eq('event_type', 'generation_failed').gte('created_at', claim.claimedAt),
      client.from('document_packets').select('id, organisation_id, packet_type, status, updated_at').in('organisation_id', organisationIds).in('packet_type', ['otp', 'mandate', 'salesmandate', 'sales_mandate']).in('status', ['sent', 'partially_signed']).lt('updated_at', staleBefore),
      client.from('system_health_snapshots').select('id, status, summary, created_at').contains('summary', { kind: 'legal_document_watchdog_v1' }).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ])
    const error = [failures, stale, health].find((result) => result.error)?.error
    if (error) throw error
    metrics = { generationFailures: (failures.data || []).length, staleSigningPackets: (stale.data || []).length }
    watchdog = health.data || null
    const normalized = (value) => [...new Set(value || [])].sort().join(',')
    targetAligned = claim.releaseTarget?.environment === pilot.environment
      && claim.releaseTarget?.projectRef === pilot.activation?.targetProjectRef
      && normalized(claim.releaseTarget?.organisationIds) === normalized(pilot.organisationIds)
      && normalized(claim.releaseTarget?.organisationIds) === normalized(pilot.activation?.activatedOrganisationIds)
  } catch (error) {
    storeAvailable = false
    storeError = error.message
  }
}

const assessment = assessLegalDocumentCanaryContinuation({ n3, claim, metrics, watchdog, targetAligned, storeAvailable })
console.log(JSON.stringify({
  phase: 'N4', status: assessment.ready ? 'READY_FOR_O1' : 'HALT_AND_DEACTIVATE', ready: assessment.ready, decision: assessment.decision,
  blockerCount: assessment.blockers.length, blockers: assessment.blockers, nextAction: assessment.nextAction,
  acceptedCanaries: n3.acceptedCanaries || [], launchTarget: claim?.releaseTarget || null,
  evidence: { n3Status: n3.status || 'UNAVAILABLE', claimState: claimState.status || 'UNAVAILABLE', metrics, targetAligned, storeAvailable, storeError, watchdog: watchdog ? { id: watchdog.id, status: watchdog.status, createdAt: watchdog.created_at, blockerCount: (watchdog.summary?.blockers || []).length } : null },
  checkedAt: new Date().toISOString(), mutatedData: false,
}, null, 2))
if (!assessment.ready) process.exitCode = 1
