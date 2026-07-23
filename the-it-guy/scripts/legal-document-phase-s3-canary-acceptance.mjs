import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { assessControlledLifecyclePair } from '../src/core/documents/legalDocumentLifecycleAssurance.js'
import { assessLegalDocumentExpandedCanaryAcceptance } from '../src/core/documents/legalDocumentExpandedCanaryAcceptance.js'

const execFileAsync = promisify(execFile)
async function run(script) {
  try {
    const { stdout } = await execFileAsync(process.execPath, [script], { cwd: process.cwd(), env: process.env, timeout: 1_700_000, maxBuffer: 30 * 1024 * 1024 })
    return JSON.parse(stdout)
  } catch (error) {
    try { return JSON.parse(error.stdout || '') } catch { return { status: 'UNAVAILABLE', ready: false, mutatedData: false } }
  }
}

const s2 = await run('scripts/legal-document-phase-s2-rollout-envelope.mjs')
let claimState
let activationState
try { claimState = JSON.parse(fs.readFileSync('config/legal-document-expanded-release-claim.json', 'utf8')) } catch { claimState = { status: 'unavailable', claim: null } }
try { activationState = JSON.parse(fs.readFileSync('config/legal-document-expansion-activation.json', 'utf8')) } catch { activationState = { status: 'unavailable', activation: null } }
const claim = claimState.claim
const activation = activationState.activation
let storeAvailable = true
let canaries = []
let storeError = null

if (s2.status === 'READY_FOR_S3' && claim?.claimedAt && activation?.addedOrganisationId) {
  try {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
    if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase URL and service role key are required for S3.')
    const require = createRequire(path.resolve('package.json'))
    const { createClient } = require('@supabase/supabase-js')
    const client = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    const packetsResult = await client.from('document_packets').select('id, organisation_id, packet_type, current_version_number, status, completed_at').eq('organisation_id', activation.addedOrganisationId).eq('status', 'completed').gte('completed_at', claim.claimedAt).order('completed_at', { ascending: false }).limit(100)
    if (packetsResult.error) throw packetsResult.error
    const selected = []
    for (const desiredType of ['otp', 'mandate']) {
      const packet = (packetsResult.data || []).find((row) => {
        const type = String(row.packet_type || '').toLowerCase()
        return desiredType === 'mandate' ? ['mandate', 'salesmandate', 'sales_mandate'].includes(type) : type === desiredType
      })
      if (packet) selected.push(packet)
    }
    const targets = []
    for (const packet of selected) {
      const versionResult = await client.from('document_packet_versions').select('id, packet_id, organisation_id, version_number, generated_at, finalised_at, validation_summary_json').eq('packet_id', packet.id).eq('version_number', packet.current_version_number).maybeSingle()
      if (versionResult.error || !versionResult.data) { if (versionResult.error) throw versionResult.error; continue }
      const version = versionResult.data
      const [signers, events, artifact, deliveries, publication] = await Promise.all([
        client.from('document_packet_signers').select('id, packet_id, packet_version_id, status, signed_at').eq('packet_id', packet.id).eq('packet_version_id', version.id),
        client.from('document_packet_events').select('version_id, event_type, event_payload_json, created_at').eq('packet_id', packet.id).in('event_type', ['version_generated', 'packet_regenerated', 'draft_approved', 'document_locked', 'signer_links_generated', 'signer_link_viewed', 'all_signers_completed', 'final_signed_document_generated', 'final_signed_delivery_completed']).order('created_at'),
        client.from('legal_final_artifact_evidence').select('packet_version_id, path, sha256').eq('packet_version_id', version.id).maybeSingle(),
        client.from('legal_final_artifact_deliveries').select('signer_id, artifact_sha256, artifact_path, attempt_number, status, attempted_at').eq('packet_version_id', version.id),
        client.from('legal_final_artifact_publications').select('packet_version_id, artifact_sha256, artifact_path, portal_surface, verified_at').eq('packet_version_id', version.id).maybeSingle(),
      ])
      const error = [signers, events, artifact, deliveries, publication].find((result) => result.error)?.error
      if (error) throw error
      targets.push({ packet, version, signers: signers.data || [], events: events.data || [], artifactEvidence: artifact.data || {}, deliveries: deliveries.data || [], publication: publication.data || {} })
    }
    const lifecycle = assessControlledLifecyclePair(targets)
    canaries = lifecycle.assessments.map((row) => ({ ...row, status: row.ready ? 'passed' : 'failed' }))
  } catch (error) {
    storeAvailable = false
    storeError = error.message
  }
}

const assessment = assessLegalDocumentExpandedCanaryAcceptance({ s2, claim, activation, canaries, storeAvailable })
console.log(JSON.stringify({
  phase: 'S3', status: assessment.ready ? 'READY_FOR_S4' : 'NO_GO', ready: assessment.ready,
  blockerCount: assessment.blockers.length, blockers: assessment.blockers, acceptedCanaries: assessment.acceptedCanaries,
  evidence: { s2Status: s2.status || 'UNAVAILABLE', claimState: claimState.status || 'UNAVAILABLE', activationState: activationState.status || 'UNAVAILABLE', addedOrganisationId: activation?.addedOrganisationId || null, storeAvailable, storeError },
  checkedAt: new Date().toISOString(), mutatedData: false,
}, null, 2))
if (!assessment.ready) process.exitCode = 1
