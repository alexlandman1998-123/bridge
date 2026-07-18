import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { assessLegalDocumentReleaseClaim, buildLegalDocumentReleaseClaimPayload, LEGAL_DOCUMENT_M3_CLAIM_CONTRACT } from '../src/core/documents/legalDocumentReleaseClaim.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const now = Date.parse('2026-07-18T10:00:00.000Z')
const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
const receipt = { status: 'issued', receiptDigest: 'sha256:receipt', issuedAt: new Date(now - 60_000).toISOString(), expiresAt: new Date(now + 10 * 60_000).toISOString(), releaseTarget: { environment: 'production', projectRef: 'project-ref', organisationIds: ['org-2', 'org-1'] } }
const m2 = { status: 'READY_FOR_M3', ready: true }
const payload = buildLegalDocumentReleaseClaimPayload({ receipt, claimedBy: 'release-operator', executionReference: 'DEPLOY-1', claimedAt: new Date(now).toISOString() })
const claim = { ...payload, claimDigest: digest(payload) }
assert.equal(claim.contract, LEGAL_DOCUMENT_M3_CLAIM_CONTRACT)
assert.deepEqual(claim.releaseTarget.organisationIds, ['org-1', 'org-2'])
assert.equal(assessLegalDocumentReleaseClaim({ m2, receipt, claim, now, digest }).ready, true)
assert.ok(assessLegalDocumentReleaseClaim({ m2, receipt: { ...receipt, receiptDigest: 'sha256:new' }, claim, now, digest }).blockers.some((row) => row.code === 'M3_RECEIPT_BINDING_INVALID'))
assert.ok(assessLegalDocumentReleaseClaim({ m2, receipt, claim: { ...claim, executionReference: 'EDITED' }, now, digest }).blockers.some((row) => row.code === 'M3_CLAIM_DIGEST_INVALID'))
assert.ok(assessLegalDocumentReleaseClaim({ m2, receipt, claim, now: Date.parse(receipt.expiresAt), digest }).blockers.some((row) => row.code === 'M3_CLAIM_EXPIRED_OR_INVALID'))
assert.ok(assessLegalDocumentReleaseClaim({ m2: { status: 'NO_GO', ready: false }, receipt: null, claim: null, now, digest }).blockers.some((row) => row.code === 'M3_M2_NOT_READY'))

const claimScript = fs.readFileSync('scripts/legal-document-phase-m3-claim-receipt.mjs', 'utf8')
assert.match(claimScript, /LEGAL_DOCUMENT_PHASE_M3_WRITE/)
assert.match(claimScript, /M3_RECEIPT_ALREADY_CLAIMED/)
assert.match(claimScript, /--apply/)
const verifier = fs.readFileSync('scripts/legal-document-phase-m3-verify-claim.mjs', 'utf8')
assert.match(verifier, /legal-document-phase-m2-verify-receipt\.mjs/)
assert.match(verifier, /mutatedData: false/)
assert.doesNotMatch(verifier, /\.insert\(|\.upsert\(|\.delete\(/)
const state = JSON.parse(fs.readFileSync('config/legal-document-release-claim.json', 'utf8'))
assert.equal(state.status, 'not_claimed')
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-m3', 'claim:legal-documents:phase-m3', 'verify:legal-documents:phase-m3']) assert.ok(pkg.scripts?.[name])
console.log('Legal document M3 one-time release claim passed.')
