import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assessLegalDocumentExpandedCanaryAcceptance } from '../src/core/documents/legalDocumentExpandedCanaryAcceptance.js'

const now = Date.parse('2026-07-18T10:10:00.000Z')
const claim = { status: 'claimed', sourceActivationDigest: 'sha256:activation', claimedAt: '2026-07-18T10:00:00.000Z', expiresAt: '2026-07-18T10:15:00.000Z' }
const activation = { status: 'activated', activationDigest: 'sha256:activation', addedOrganisationId: 'org-2' }
const s2 = { status: 'READY_FOR_S3', ready: true, rolloutEnvelope: { sourceActivationDigest: 'sha256:activation', canaryOrganisationId: 'org-2' } }
function canary(packetType, seed) {
  return { packetType, packetId: `packet-${seed}`, versionId: `version-${seed}`, organisationId: 'org-2', finalArtifactSha256: seed.repeat(64), status: 'passed', reasons: [], milestoneTimes: { generated: '2026-07-18T10:01:00.000Z', delivered: '2026-07-18T10:09:00.000Z' } }
}
const otp = canary('otp', 'a')
const mandate = canary('mandate', 'b')
const ready = assessLegalDocumentExpandedCanaryAcceptance({ s2, claim, activation, canaries: [otp, mandate], now })
assert.equal(ready.ready, true)
assert.deepEqual(ready.acceptedCanaries.map((row) => row.packetType), ['otp', 'mandate'])
const held = assessLegalDocumentExpandedCanaryAcceptance({ s2: { status: 'NO_GO', ready: false }, claim: null, activation: null, canaries: [], storeAvailable: false, now })
for (const code of ['S3_S2_NOT_READY', 'S3_RELEASE_CLAIM_MISSING', 'S3_ACTIVATION_RECORD_MISSING', 'S3_CANARY_STORE_UNAVAILABLE', 'S3_CANARY_TARGET_BINDING_INVALID', 'S3_CANARY_PAIR_INCOMPLETE']) assert.ok(held.blockers.some((row) => row.code === code), code)
assert.ok(held.blockers.every((row) => row.solution))
const wrongOrg = assessLegalDocumentExpandedCanaryAcceptance({ s2, claim, activation, canaries: [{ ...otp, organisationId: 'org-1' }, mandate], now })
assert.ok(wrongOrg.blockers.some((row) => row.code === 'S3_CANARY_NOT_IN_ADDED_ORGANISATION'))
const preClaim = assessLegalDocumentExpandedCanaryAcceptance({ s2, claim, activation, canaries: [{ ...otp, milestoneTimes: { ...otp.milestoneTimes, generated: '2026-07-18T09:59:00.000Z' } }, mandate], now })
assert.ok(preClaim.blockers.some((row) => row.code === 'S3_CANARY_OUTSIDE_CLAIM_WINDOW'))
const collision = assessLegalDocumentExpandedCanaryAcceptance({ s2, claim, activation, canaries: [otp, { ...mandate, packetId: otp.packetId }], now })
assert.ok(collision.blockers.some((row) => row.code === 'S3_CANARY_IDENTITY_INVALID'))
const verifier = fs.readFileSync('scripts/legal-document-phase-s3-canary-acceptance.mjs', 'utf8')
assert.match(verifier, /legal-document-phase-s2-rollout-envelope\.mjs/)
for (const table of ['document_packets', 'document_packet_versions', 'document_packet_signers', 'document_packet_events', 'legal_final_artifact_evidence', 'legal_final_artifact_deliveries', 'legal_final_artifact_publications']) assert.match(verifier, new RegExp(table))
assert.match(verifier, /addedOrganisationId/)
assert.match(verifier, /assessControlledLifecyclePair/)
assert.match(verifier, /mutatedData: false/)
assert.doesNotMatch(verifier, /\.insert\(|\.upsert\(|\.delete\(/)
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-s3', 'verify:legal-documents:phase-s3']) assert.ok(pkg.scripts?.[name])
console.log('Legal document S3 added-organisation dual-canary acceptance passed.')
