import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { assessLegalDocumentExpandedCohortContinuationRecord, buildLegalDocumentExpandedCohortContinuationPayload, LEGAL_DOCUMENT_T1_CONTINUATION_CONTRACT } from '../src/core/documents/legalDocumentExpandedCohortContinuationRecord.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
const releaseTarget = { environment: 'production', projectRef: 'project-ref', organisationIds: ['org-1', 'org-2'] }
const claim = { status: 'claimed', claimDigest: 'sha256:claim', sourceReceiptDigest: 'sha256:receipt', sourceAuthorityDigest: 'sha256:authority', sourceActivationDigest: 'sha256:activation', claimedAt: '2026-07-18T10:00:00.000Z', expiresAt: '2026-07-18T10:15:00.000Z', releaseTarget }
const activation = { status: 'activated', activationDigest: 'sha256:activation', activationTarget: releaseTarget, previousOrganisationIds: ['org-1'], addedOrganisationId: 'org-2' }
const canary = (packetType, seed) => ({ packetType, packetId: `packet-${seed}`, versionId: `version-${seed}`, organisationId: 'org-2', finalArtifactSha256: seed.repeat(64), deliveredAt: '2026-07-18T10:09:00.000Z' })
const s4 = { status: 'READY_FOR_T1', ready: true, decision: 'CONTINUE_EXPANDED_COHORT', checkedAt: '2026-07-18T10:10:00.000Z', launchTarget: releaseTarget, acceptedCanaries: [canary('otp', 'a'), canary('mandate', 'b')], evidence: { watchdog: { id: 'health-1', status: 'healthy', blockerCount: 0, createdAt: '2026-07-18T10:08:00.000Z' } } }
const payload = buildLegalDocumentExpandedCohortContinuationPayload({ s4, claim, activation, recordedBy: 'release-owner', continuationReference: 'CONT-T1', recordedAt: '2026-07-18T10:11:00.000Z' })
const record = { ...payload, recordDigest: digest(payload) }
assert.equal(record.contract, LEGAL_DOCUMENT_T1_CONTINUATION_CONTRACT)
assert.equal(assessLegalDocumentExpandedCohortContinuationRecord({ record, claim, activation, digest }).ready, true)
assert.ok(assessLegalDocumentExpandedCohortContinuationRecord({ record: { ...record, recordedBy: 'edited' }, claim, activation, digest }).blockers.some((row) => row.code === 'T1_CONTINUATION_DIGEST_INVALID'))
assert.ok(assessLegalDocumentExpandedCohortContinuationRecord({ record, claim: { ...claim, claimDigest: 'other' }, activation, digest }).blockers.some((row) => row.code === 'T1_AUTHORITY_BINDING_INVALID'))
assert.ok(assessLegalDocumentExpandedCohortContinuationRecord({ record: { ...record, canaries: [record.canaries[0]] }, claim, activation, digest }).blockers.some((row) => row.code === 'T1_CANARY_BINDING_INVALID'))
assert.ok(assessLegalDocumentExpandedCohortContinuationRecord({ record: null, claim: null, activation: null, digest }).blockers.some((row) => row.code === 'T1_CONTINUATION_NOT_RECORDED'))
const recorder = fs.readFileSync('scripts/legal-document-phase-t1-record-continuation.mjs', 'utf8')
assert.match(recorder, /legal-document-phase-s4-continuation-gate\.mjs/)
assert.match(recorder, /LEGAL_DOCUMENT_PHASE_T1_WRITE/)
assert.match(recorder, /T1_CLAIM_ALREADY_RECORDED/)
const verifier = fs.readFileSync('scripts/legal-document-phase-t1-verify-continuation.mjs', 'utf8')
assert.match(verifier, /mutatedData: false/)
assert.doesNotMatch(verifier, /writeFileSync|renameSync|\.insert\(|\.upsert\(|\.delete\(/)
const state = JSON.parse(fs.readFileSync('config/legal-document-expanded-cohort-continuation.json', 'utf8'))
assert.deepEqual(state, { version: 1, status: 'not_recorded', record: null, history: [] })
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-t1', 'record:legal-documents:phase-t1', 'verify:legal-documents:phase-t1']) assert.ok(pkg.scripts?.[name])
console.log('Legal document T1 durable expanded-cohort continuation record passed.')
