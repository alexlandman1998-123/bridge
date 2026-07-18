import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assessLegalDocumentCanaryAcceptance } from '../src/core/documents/legalDocumentCanaryAcceptance.js'

const now = Date.parse('2026-07-18T10:10:00.000Z')
const claim = { status: 'claimed', claimedAt: '2026-07-18T10:00:00.000Z', expiresAt: '2026-07-18T10:15:00.000Z' }
const n2 = { status: 'READY_FOR_N3', ready: true, rolloutEnvelope: { target: { organisationIds: ['org-1'] } } }
function canary(packetType, seed) {
  return { packetType, packetId: `packet-${seed}`, versionId: `version-${seed}`, organisationId: 'org-1', finalArtifactSha256: seed.repeat(64), status: 'passed', reasons: [], milestoneTimes: { generated: '2026-07-18T10:01:00.000Z', delivered: '2026-07-18T10:09:00.000Z' } }
}
const otp = canary('otp', 'a')
const mandate = canary('mandate', 'b')
const ready = assessLegalDocumentCanaryAcceptance({ n2, claim, canaries: [otp, mandate], now })
assert.equal(ready.ready, true)
assert.deepEqual(ready.acceptedCanaries.map((row) => row.packetType), ['otp', 'mandate'])

const held = assessLegalDocumentCanaryAcceptance({ n2: { status: 'NO_GO', ready: false }, claim: null, canaries: [], storeAvailable: false, now })
for (const code of ['N3_N2_NOT_READY', 'N3_RELEASE_CLAIM_MISSING', 'N3_CANARY_STORE_UNAVAILABLE', 'N3_CANARY_PAIR_INCOMPLETE']) assert.ok(held.blockers.some((row) => row.code === code), code)
assert.ok(held.blockers.every((row) => row.solution))
const preClaim = assessLegalDocumentCanaryAcceptance({ n2, claim, canaries: [{ ...otp, milestoneTimes: { ...otp.milestoneTimes, generated: '2026-07-18T09:59:00.000Z' } }, mandate], now })
assert.ok(preClaim.blockers.some((row) => row.code === 'N3_CANARY_OUTSIDE_CLAIM_WINDOW'))
const outside = assessLegalDocumentCanaryAcceptance({ n2, claim, canaries: [{ ...otp, organisationId: 'other' }, mandate], now })
assert.ok(outside.blockers.some((row) => row.code === 'N3_CANARY_OUTSIDE_COHORT'))
const collision = assessLegalDocumentCanaryAcceptance({ n2, claim, canaries: [otp, { ...mandate, packetId: otp.packetId }], now })
assert.ok(collision.blockers.some((row) => row.code === 'N3_CANARY_IDENTITY_INVALID'))

const verifier = fs.readFileSync('scripts/legal-document-phase-n3-canary-acceptance.mjs', 'utf8')
assert.match(verifier, /legal-document-phase-n2-rollout-envelope\.mjs/)
for (const table of ['document_packets', 'document_packet_versions', 'document_packet_signers', 'document_packet_events', 'legal_final_artifact_evidence', 'legal_final_artifact_deliveries', 'legal_final_artifact_publications']) assert.match(verifier, new RegExp(table))
assert.match(verifier, /assessControlledLifecyclePair/)
assert.match(verifier, /mutatedData: false/)
assert.doesNotMatch(verifier, /\.insert\(|\.upsert\(|\.delete\(/)
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-n3', 'verify:legal-documents:phase-n3']) assert.ok(pkg.scripts?.[name])
console.log('Legal document N3 dual-canary acceptance passed.')
