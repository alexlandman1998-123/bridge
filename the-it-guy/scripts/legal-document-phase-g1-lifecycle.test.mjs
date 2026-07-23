import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assessControlledLifecyclePair } from '../src/core/documents/legalDocumentLifecycleAssurance.js'

const times = ['2026-07-18T08:00:00Z', '2026-07-18T08:05:00Z', '2026-07-18T08:10:00Z', '2026-07-18T08:15:00Z', '2026-07-18T08:20:00Z', '2026-07-18T08:25:00Z', '2026-07-18T08:30:00Z', '2026-07-18T08:35:00Z', '2026-07-18T08:40:00Z']
function target(type, seed) {
  const packetId = `${seed}1111111-1111-4111-8111-111111111111`
  const versionId = `${seed}2222222-2222-4222-8222-222222222222`
  const signerId = `${seed}3333333-3333-4333-8333-333333333333`
  const attempt = `${seed}4444444-4444-4444-8444-444444444444`
  const draftSha = seed.repeat(64)
  const finalSha = seed === '1' ? 'a'.repeat(64) : 'b'.repeat(64)
  const finalPath = `signed/${type}.pdf`
  const event = (event_type, created_at, payload = {}) => ({ event_type, version_id: versionId, created_at, event_payload_json: payload })
  return {
    packet: { id: packetId, organisation_id: '99999999-9999-4999-8999-999999999999', packet_type: type, current_version_number: 1, status: 'completed' },
    version: { id: versionId, packet_id: packetId, version_number: 1, generated_at: times[0], finalised_at: times[6], validation_summary_json: { render_provenance: { generationAttemptId: attempt }, artifact_provenance: { sha256: draftSha }, approval_snapshot: { generationAttemptId: attempt, artifactSha256: draftSha, approvedAt: times[1] }, lock_snapshot: { generationAttemptId: attempt, artifactSha256: draftSha, lockedAt: times[2] } } },
    signers: [{ id: signerId, packet_version_id: versionId, status: 'signed', signed_at: times[5] }],
    artifactEvidence: { sha256: finalSha, path: finalPath },
    deliveries: [{ signer_id: signerId, status: 'sent', artifact_sha256: finalSha, artifact_path: finalPath, attempt_number: 1 }],
    publication: { artifact_sha256: finalSha, artifact_path: finalPath, verified_at: times[7] },
    events: [
      event('version_generated', times[0], { generationAttemptId: attempt }), event('draft_approved', times[1]), event('document_locked', times[2]),
      event('signer_links_generated', times[3]), event('signer_link_viewed', times[4]), event('all_signers_completed', times[5]),
      event('final_signed_document_generated', times[6], { finalArtifactSha256: finalSha }),
      event('final_signed_delivery_completed', times[8], { artifactSha256: finalSha }),
    ],
  }
}

const otp = target('otp', '1')
const mandate = target('mandate', '2')
assert.equal(assessControlledLifecyclePair([otp, mandate]).ready, true)
assert.ok(assessControlledLifecyclePair([otp]).reasons.includes('G1_CONTROLLED_PAIR_INCOMPLETE'))
assert.ok(assessControlledLifecyclePair([otp, { ...mandate, packet: { ...mandate.packet, organisation_id: '88888888-8888-4888-8888-888888888888' } }]).reasons.includes('G1_CONTROLLED_PAIR_ORGANISATION_MISMATCH'))
const outOfOrder = structuredClone(mandate)
outOfOrder.publication.verified_at = times[1]
assert.ok(assessControlledLifecyclePair([otp, outOfOrder]).reasons.includes('G1_LIFECYCLE_ORDER_INVALID'))

const verifier = fs.readFileSync('scripts/legal-document-phase-g1-verify.mjs', 'utf8')
assert.match(verifier, /legal-document-phase-f3-verify\.mjs/)
assert.match(verifier, /mutatedData: false/)
assert.doesNotMatch(verifier, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/)
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-g1', 'verify:legal-documents:phase-g1']) assert.ok(pkg.scripts?.[name])
console.log('Legal document G1 end-to-end lifecycle contract passed.')
