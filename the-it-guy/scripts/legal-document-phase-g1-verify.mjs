import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { assessControlledLifecyclePair } from '../src/core/documents/legalDocumentLifecycleAssurance.js'

const f3Run = spawnSync(process.execPath, ['scripts/legal-document-phase-f3-verify.mjs'], {
  cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 300_000, maxBuffer: 10 * 1024 * 1024,
})
let f3 = null
try { f3 = JSON.parse(f3Run.stdout) } catch {}
const blockers = []
const targets = []
if (f3?.status !== 'READY_FOR_G1') blockers.push({ code: 'G1_F3_NOT_READY' })

if (!blockers.length) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase URL and service role key are required for G1.')
  const require = createRequire(path.resolve('package.json'))
  const { createClient } = require('@supabase/supabase-js')
  const client = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  for (const target of f3.evidence || []) {
    const [packetResult, versionResult, signersResult, eventsResult, artifactResult, deliveriesResult, publicationResult] = await Promise.all([
      client.from('document_packets').select('id, organisation_id, packet_type, current_version_number, status, completed_at').eq('id', target.packetId).maybeSingle(),
      client.from('document_packet_versions').select('id, packet_id, organisation_id, version_number, generated_at, finalised_at, validation_summary_json').eq('id', target.versionId).maybeSingle(),
      client.from('document_packet_signers').select('id, packet_id, packet_version_id, status, signed_at').eq('packet_id', target.packetId).eq('packet_version_id', target.versionId),
      client.from('document_packet_events').select('version_id, event_type, event_payload_json, created_at').eq('packet_id', target.packetId).in('event_type', ['version_generated', 'packet_regenerated', 'draft_approved', 'document_locked', 'signer_links_generated', 'signer_link_viewed', 'all_signers_completed', 'final_signed_document_generated', 'final_signed_delivery_completed']).order('created_at'),
      client.from('legal_final_artifact_evidence').select('packet_version_id, path, sha256').eq('packet_version_id', target.versionId).maybeSingle(),
      client.from('legal_final_artifact_deliveries').select('signer_id, artifact_sha256, artifact_path, attempt_number, status, attempted_at').eq('packet_version_id', target.versionId),
      client.from('legal_final_artifact_publications').select('packet_version_id, artifact_sha256, artifact_path, portal_surface, verified_at').eq('packet_version_id', target.versionId).maybeSingle(),
    ])
    const queryError = [packetResult, versionResult, signersResult, eventsResult, artifactResult, deliveriesResult, publicationResult].find((result) => result.error)?.error
    if (queryError) { blockers.push({ code: 'G1_LIFECYCLE_STORE_UNAVAILABLE', packetType: target.packetType, detail: queryError.message }); continue }
    if (!packetResult.data || !versionResult.data || !artifactResult.data || !publicationResult.data) { blockers.push({ code: 'G1_LIFECYCLE_TARGET_MISSING', packetType: target.packetType }); continue }
    targets.push({ packet: packetResult.data, version: versionResult.data, signers: signersResult.data || [], events: eventsResult.data || [], artifactEvidence: artifactResult.data, deliveries: deliveriesResult.data || [], publication: publicationResult.data })
  }
  if (!blockers.length) {
    const assessment = assessControlledLifecyclePair(targets)
    if (!assessment.ready) blockers.push({ code: assessment.reasons.includes('G1_CONTROLLED_PAIR_INCOMPLETE') ? 'G1_CONTROLLED_PAIR_INCOMPLETE' : 'G1_LIFECYCLE_COHERENCE_INVALID', reasons: assessment.reasons })
  }
}

const solutions = {
  G1_F3_NOT_READY: 'Complete exact final-artifact delivery and portal publication for the controlled OTP and mandate before lifecycle certification.',
  G1_LIFECYCLE_STORE_UNAVAILABLE: 'Deploy the required lifecycle evidence migrations and restore read access before rerunning G1.',
  G1_LIFECYCLE_TARGET_MISSING: 'Regenerate the missing controlled document through the governed workflow; do not splice historical evidence onto another version.',
  G1_CONTROLLED_PAIR_INCOMPLETE: 'Complete one controlled OTP and one controlled mandate for the same pilot organisation through F3.',
  G1_LIFECYCLE_COHERENCE_INVALID: 'Repeat the affected controlled journey on one exact version and investigate the reported lineage, ordering, signer, or artifact mismatch.',
}
const unique = [...new Map(blockers.map((row) => [`${row.code}:${row.packetType || ''}`, row])).values()]
const assessment = targets.length ? assessControlledLifecyclePair(targets) : null
const evidence = assessment?.assessments?.map((item) => ({ packetType: item.packetType, packetId: item.packetId, versionId: item.versionId, organisationId: item.organisationId, generationAttemptId: item.generationAttemptId, finalArtifactSha256: item.finalArtifactSha256, status: item.ready ? 'passed' : 'failed', milestoneTimes: item.milestoneTimes, reasons: item.reasons })) || []
console.log(JSON.stringify({ phase: 'G1', status: unique.length ? 'NO_GO' : 'READY_FOR_G2', blockerCount: unique.length, blockers: unique.map((row) => ({ ...row, solution: solutions[row.code] })), f3Status: f3?.status || 'UNAVAILABLE', evidence, checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
if (unique.length) process.exitCode = 1
