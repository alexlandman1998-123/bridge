import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { assessFinalDelivery } from '../src/core/documents/finalDeliveryAssurance.js'

const f2Run = spawnSync(process.execPath, ['scripts/legal-document-phase-f2-verify.mjs'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 300_000, maxBuffer: 10 * 1024 * 1024 })
let f2 = null
try { f2 = JSON.parse(f2Run.stdout) } catch {}
const blockers = []
const evidence = []
if (f2?.status !== 'READY_FOR_F3') blockers.push({ code: 'F3_F2_NOT_READY' })
if (!blockers.length) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase URL and service role key are required for F3.')
  const require = createRequire(path.resolve('package.json'))
  const { createClient } = require('@supabase/supabase-js')
  const client = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  for (const target of f2.evidence || []) {
    const [packetResult, versionResult, signersResult, artifactResult, deliveriesResult, publicationResult, eventsResult] = await Promise.all([
      client.from('document_packets').select('id, packet_type, status, current_version_number').eq('id', target.packetId).maybeSingle(),
      client.from('document_packet_versions').select('id, packet_id, version_number, final_signed_file_path, final_signed_file_bucket, finalised_at').eq('id', target.versionId).maybeSingle(),
      client.from('document_packet_signers').select('id, packet_version_id, signer_role, signer_email, status, signed_at').eq('packet_id', target.packetId).eq('packet_version_id', target.versionId),
      client.from('legal_final_artifact_evidence').select('packet_id, packet_version_id, bucket, path, sha256, byte_length').eq('packet_version_id', target.versionId).maybeSingle(),
      client.from('legal_final_artifact_deliveries').select('packet_version_id, signer_id, recipient_role, recipient_email, artifact_sha256, artifact_path, attempt_number, status, provider_message_id, attempted_at').eq('packet_version_id', target.versionId),
      client.from('legal_final_artifact_publications').select('packet_version_id, artifact_sha256, artifact_path, portal_surface, verified_at').eq('packet_version_id', target.versionId).maybeSingle(),
      client.from('document_packet_events').select('version_id, event_type, event_payload_json, created_at').eq('packet_id', target.packetId).in('event_type', ['final_signed_delivery_completed', 'final_signed_delivery_incomplete']),
    ])
    const queryError = [packetResult, versionResult, signersResult, artifactResult, deliveriesResult, publicationResult, eventsResult].find((result) => result.error)?.error
    if (queryError) { blockers.push({ code: 'F3_DELIVERY_STORE_UNAVAILABLE', packetType: target.packetType, detail: queryError.message }); continue }
    if (!packetResult.data || !versionResult.data || !artifactResult.data) { blockers.push({ code: 'F3_DELIVERY_TARGET_MISSING', packetType: target.packetType }); continue }
    const assessment = assessFinalDelivery({ packet: packetResult.data, version: versionResult.data, signers: signersResult.data || [], artifactEvidence: artifactResult.data, deliveries: deliveriesResult.data || [], publication: publicationResult.data || {}, events: eventsResult.data || [] })
    if (!assessment.ready) blockers.push({ code: 'F3_FINAL_DELIVERY_INVALID', packetType: target.packetType, reasons: assessment.reasons })
    evidence.push({ packetType: target.packetType, packetId: target.packetId, versionId: target.versionId, status: assessment.ready ? 'passed' : 'failed', recipientCount: assessment.recipientCount, sentRecipientCount: assessment.sentRecipientCount, portalSurface: assessment.portalSurface, reasons: assessment.reasons })
  }
}
const solutions = { F3_F2_NOT_READY: 'Complete F2 immutable final-artifact assurance before distribution.', F3_DELIVERY_STORE_UNAVAILABLE: 'Deploy the F3 migration and delivery function before retrying distribution.', F3_DELIVERY_TARGET_MISSING: 'Restore the exact F2 artifact and signer records before distribution.', F3_FINAL_DELIVERY_INVALID: 'Rerun exact-version finalisation to retry missing per-recipient delivery and portal publication.' }
const unique = [...new Map(blockers.map((row) => [`${row.code}:${row.packetType || ''}`, row])).values()]
console.log(JSON.stringify({ phase: 'F3', status: unique.length ? 'NO_GO' : 'READY_FOR_G1', blockerCount: unique.length, blockers: unique.map((row) => ({ ...row, solution: solutions[row.code] })), f2Status: f2?.status || 'UNAVAILABLE', evidence, checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
if (unique.length) process.exitCode = 1
