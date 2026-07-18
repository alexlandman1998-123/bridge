import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { assessLegalDocumentExpandedCohortReleaseClaim, buildLegalDocumentExpandedCohortReleaseClaim, LEGAL_DOCUMENT_R3_RELEASE_CLAIM_CONTRACT } from '../src/core/documents/legalDocumentExpandedCohortReleaseClaim.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const now = Date.parse('2026-07-18T10:00:00.000Z')
const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
const target = { environment: 'production', projectRef: 'project-ref', organisationIds: ['org-2', 'org-1'] }
const receipt = { status: 'issued', receiptDigest: 'sha256:receipt', sourceAuthorityDigest: 'sha256:authority', sourceActivationDigest: 'sha256:activation', issuedAt: new Date(now - 60_000).toISOString(), expiresAt: new Date(now + 10 * 60_000).toISOString(), releaseTarget: target }
const activation = { status: 'activated', activationDigest: 'sha256:activation', activationTarget: target }
const r2 = { status: 'READY_FOR_R3', ready: true, mutatedData: false }
const payload = buildLegalDocumentExpandedCohortReleaseClaim({ receipt, claimedBy: 'release-operator', executionReference: 'EXPAND-1', claimedAt: new Date(now).toISOString() })
const claim = { ...payload, claimDigest: digest(payload) }
assert.equal(claim.contract, LEGAL_DOCUMENT_R3_RELEASE_CLAIM_CONTRACT)
assert.deepEqual(claim.releaseTarget.organisationIds, ['org-1', 'org-2'])
assert.equal(assessLegalDocumentExpandedCohortReleaseClaim({ r2, receipt, claim, activation, now, digest }).ready, true)
assert.ok(assessLegalDocumentExpandedCohortReleaseClaim({ r2, receipt: { ...receipt, receiptDigest: 'sha256:new' }, claim, activation, now, digest }).blockers.some((row) => row.code === 'R3_RECEIPT_BINDING_INVALID'))
assert.ok(assessLegalDocumentExpandedCohortReleaseClaim({ r2, receipt, claim: { ...claim, executionReference: 'EDITED' }, activation, now, digest }).blockers.some((row) => row.code === 'R3_CLAIM_DIGEST_INVALID'))
assert.ok(assessLegalDocumentExpandedCohortReleaseClaim({ r2, receipt, claim, activation, now: Date.parse(receipt.expiresAt), digest }).blockers.some((row) => row.code === 'R3_CLAIM_EXPIRED_OR_INVALID'))
assert.ok(assessLegalDocumentExpandedCohortReleaseClaim({ r2: { status: 'NO_GO', ready: false }, receipt: null, claim: null, activation: null, now, digest }).blockers.some((row) => row.code === 'R3_R2_NOT_READY'))
const claimScript = fs.readFileSync('scripts/legal-document-phase-r3-claim-receipt.mjs', 'utf8')
assert.match(claimScript, /LEGAL_DOCUMENT_PHASE_R3_WRITE/)
assert.match(claimScript, /R3_RECEIPT_ALREADY_CLAIMED/)
assert.match(claimScript, /confirm-receipt-digest/)
const verifier = fs.readFileSync('scripts/legal-document-phase-r3-verify-claim.mjs', 'utf8')
assert.match(verifier, /legal-document-phase-r2-verify-receipt\.mjs/)
assert.match(verifier, /mutatedData: false/)
assert.doesNotMatch(verifier, /writeFileSync|renameSync|\.insert\(|\.upsert\(|\.delete\(/)
const state = JSON.parse(fs.readFileSync('config/legal-document-expanded-release-claim.json', 'utf8'))
assert.deepEqual(state, { version: 1, status: 'not_claimed', claim: null, history: [] })
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-r3', 'claim:legal-documents:phase-r3', 'verify:legal-documents:phase-r3']) assert.ok(pkg.scripts?.[name])
console.log('Legal document R3 one-time expanded-cohort release claim passed.')
