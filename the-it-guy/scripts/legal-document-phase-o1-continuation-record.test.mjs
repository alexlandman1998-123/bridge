import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { assessLegalDocumentCohortContinuationRecord, buildLegalDocumentCohortContinuationPayload, LEGAL_DOCUMENT_O1_CONTINUATION_CONTRACT } from '../src/core/documents/legalDocumentCohortContinuationRecord.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
const claim = { status: 'claimed', claimDigest: 'sha256:claim', receiptDigest: 'sha256:receipt', claimedAt: '2026-07-18T10:00:00.000Z', expiresAt: '2026-07-18T10:15:00.000Z', releaseTarget: { environment: 'production', projectRef: 'project-ref', organisationIds: ['org-1'] } }
const canary = (packetType, seed) => ({ packetType, packetId: `packet-${seed}`, versionId: `version-${seed}`, finalArtifactSha256: seed.repeat(64), deliveredAt: '2026-07-18T10:09:00.000Z' })
const n4 = { status: 'READY_FOR_O1', ready: true, decision: 'CONTINUE_CONTROLLED_COHORT', checkedAt: '2026-07-18T10:10:00.000Z', launchTarget: claim.releaseTarget, acceptedCanaries: [canary('otp', 'a'), canary('mandate', 'b')], evidence: { watchdog: { id: 'health-1', status: 'healthy', blockerCount: 0, createdAt: '2026-07-18T10:08:00.000Z' } } }
const payload = buildLegalDocumentCohortContinuationPayload({ n4, claim, recordedBy: 'release-owner', continuationReference: 'CONT-1', recordedAt: '2026-07-18T10:11:00.000Z' })
const record = { ...payload, recordDigest: digest(payload) }
assert.equal(record.contract, LEGAL_DOCUMENT_O1_CONTINUATION_CONTRACT)
assert.equal(assessLegalDocumentCohortContinuationRecord({ record, claim, digest }).ready, true)
assert.ok(assessLegalDocumentCohortContinuationRecord({ record: { ...record, recordedBy: 'edited' }, claim, digest }).blockers.some((row) => row.code === 'O1_CONTINUATION_DIGEST_INVALID'))
assert.ok(assessLegalDocumentCohortContinuationRecord({ record, claim: { ...claim, claimDigest: 'other' }, digest }).blockers.some((row) => row.code === 'O1_AUTHORITY_BINDING_INVALID'))
assert.ok(assessLegalDocumentCohortContinuationRecord({ record: { ...record, canaries: [record.canaries[0]] }, claim, digest }).blockers.some((row) => row.code === 'O1_CANARY_BINDING_INVALID'))
assert.ok(assessLegalDocumentCohortContinuationRecord({ record: null, claim: null, digest }).blockers.some((row) => row.code === 'O1_CONTINUATION_NOT_RECORDED'))

const recorder = fs.readFileSync('scripts/legal-document-phase-o1-record-continuation.mjs', 'utf8')
assert.match(recorder, /legal-document-phase-n4-continuation-gate\.mjs/)
assert.match(recorder, /LEGAL_DOCUMENT_PHASE_O1_WRITE/)
assert.match(recorder, /O1_CLAIM_ALREADY_RECORDED/)
const verifier = fs.readFileSync('scripts/legal-document-phase-o1-verify-continuation.mjs', 'utf8')
assert.match(verifier, /mutatedData: false/)
assert.doesNotMatch(verifier, /\.insert\(|\.upsert\(|\.delete\(/)
const state = JSON.parse(fs.readFileSync('config/legal-document-cohort-continuation.json', 'utf8'))
assert.equal(state.status, 'not_recorded')
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-o1', 'record:legal-documents:phase-o1', 'verify:legal-documents:phase-o1']) assert.ok(pkg.scripts?.[name])
console.log('Legal document O1 durable cohort continuation record passed.')
