import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import path from 'node:path'
import { assessFinalSignedCompletion } from '../src/core/documents/finalSignedCompletionAssurance.js'

const e2Run = spawnSync(process.execPath, ['scripts/legal-document-phase-e2-verify.mjs'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 300_000, maxBuffer: 10 * 1024 * 1024 })
let e2 = null
try { e2 = JSON.parse(e2Run.stdout) } catch {}
const blockers = []
const evidence = []
if (e2?.status !== 'READY_FOR_E3') blockers.push({ code: 'F2_E2_NOT_READY' })

if (!blockers.length) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase URL and service role key are required for F2.')
  const require = createRequire(path.resolve('package.json'))
  const { createClient } = require('@supabase/supabase-js')
  const client = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  for (const target of e2.evidence || []) {
    const [packetResult, versionResult, signersResult, fieldsResult, eventsResult, finalEvidenceResult] = await Promise.all([
      client.from('document_packets').select('id, organisation_id, packet_type, current_version_number, status, completed_at').eq('id', target.packetId).maybeSingle(),
      client.from('document_packet_versions').select('id, packet_id, organisation_id, version_number, render_status, validation_summary_json, final_signed_file_path, final_signed_file_bucket, final_signed_file_name, finalised_at, finalised_by').eq('id', target.versionId).maybeSingle(),
      client.from('document_packet_signers').select('id, packet_id, packet_version_id, signer_role, signer_email, status, viewed_at, signed_at').eq('packet_id', target.packetId).eq('packet_version_id', target.versionId),
      client.from('document_signing_fields').select('id, packet_id, packet_version_id, signer_role, signer_email, field_type, required, status, signature_asset_path').eq('packet_id', target.packetId).eq('packet_version_id', target.versionId),
      client.from('document_packet_events').select('version_id, event_type, event_payload_json, created_at').eq('packet_id', target.packetId).in('event_type', ['signer_link_viewed', 'signer_completed_signing', 'all_signers_completed', 'final_signed_document_generated']),
      client.from('legal_final_artifact_evidence').select('organisation_id, packet_id, packet_version_id, bucket, path, file_name, media_type, sha256, byte_length, signer_evidence_sha256, field_evidence_sha256, generated_at').eq('packet_version_id', target.versionId).maybeSingle(),
    ])
    for (const result of [packetResult, versionResult, signersResult, fieldsResult, eventsResult]) if (result.error) throw result.error
    if (finalEvidenceResult.error) {
      blockers.push({ code: 'F2_EVIDENCE_STORE_UNAVAILABLE', packetType: target.packetType, detail: finalEvidenceResult.error.message })
      continue
    }
    if (!packetResult.data || !versionResult.data) {
      blockers.push({ code: 'F2_COMPLETION_TARGET_MISSING', packetType: target.packetType })
      continue
    }
    const assessment = assessFinalSignedCompletion({ packet: packetResult.data, version: versionResult.data, signers: signersResult.data || [], fields: fieldsResult.data || [], events: eventsResult.data || [], evidence: finalEvidenceResult.data || {} })
    const reasons = [...assessment.reasons]
    let actualSha256 = ''
    let actualByteLength = 0
    const finalEvidence = finalEvidenceResult.data
    if (finalEvidence?.bucket && finalEvidence?.path) {
      const download = await client.storage.from(finalEvidence.bucket).download(finalEvidence.path)
      if (download.error || !download.data) reasons.push('F2_FINAL_ARTIFACT_UNREADABLE')
      else {
        const bytes = Buffer.from(await download.data.arrayBuffer())
        actualByteLength = bytes.length
        actualSha256 = createHash('sha256').update(bytes).digest('hex')
        if (bytes.subarray(0, 4).toString() !== '%PDF' || !bytes.subarray(Math.max(0, bytes.length - 1024)).toString().includes('%%EOF')) reasons.push('F2_FINAL_ARTIFACT_INVALID_PDF')
        if (actualSha256 !== finalEvidence.sha256 || actualByteLength !== Number(finalEvidence.byte_length)) reasons.push('F2_FINAL_ARTIFACT_MISMATCH')
      }
    }
    const finalEvent = (eventsResult.data || []).some((event) => event.version_id === target.versionId && event.event_type === 'final_signed_document_generated' && event.event_payload_json?.finalArtifactSha256 === finalEvidence?.sha256)
    if (!finalEvent) reasons.push('F2_FINAL_EVENT_EVIDENCE_MISSING')
    if (reasons.length) blockers.push({ code: 'F2_FINAL_COMPLETION_INVALID', packetType: target.packetType, reasons: [...new Set(reasons)] })
    evidence.push({ packetType: target.packetType, packetId: target.packetId, versionId: target.versionId, status: reasons.length ? 'failed' : 'passed', signerCount: assessment.signerCount, requiredFieldCount: assessment.requiredFieldCount, finalArtifactPath: finalEvidence?.path || null, expectedSha256: finalEvidence?.sha256 || null, actualSha256: actualSha256 || null, expectedByteLength: Number(finalEvidence?.byte_length) || null, actualByteLength: actualByteLength || null, reasons: [...new Set(reasons)] })
  }
}

const solutions = {
  F2_E2_NOT_READY: 'Complete the exact-version approval and immutable lock chain before final signing.',
  F2_EVIDENCE_STORE_UNAVAILABLE: 'Deploy the F2 migration before generating the controlled final signed artifacts.',
  F2_COMPLETION_TARGET_MISSING: 'Regenerate and repeat the governed workflow because the locked completion target is missing.',
  F2_FINAL_COMPLETION_INVALID: 'Complete every signer field on the exact locked version and regenerate the immutable final signed PDF through the F2 finaliser.',
}
const unique = [...new Map(blockers.map((row) => [`${row.code}:${row.packetType || ''}`, row])).values()]
console.log(JSON.stringify({ phase: 'F2', status: unique.length ? 'NO_GO' : 'READY_FOR_F3', blockerCount: unique.length, blockers: unique.map((row) => ({ ...row, solution: solutions[row.code] })), e2Status: e2?.status || 'UNAVAILABLE', evidence, checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
if (unique.length) process.exitCode = 1
