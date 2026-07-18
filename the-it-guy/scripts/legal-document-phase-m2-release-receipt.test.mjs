import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { assessLegalDocumentReleaseReceipt, buildLegalDocumentReleaseReceiptPayload, canonicalLegalDocumentReleaseValue, LEGAL_DOCUMENT_M2_RECEIPT_CONTRACT } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const now = Date.parse('2026-07-18T10:00:00.000Z')
const m1 = { status: 'READY_FOR_M2', authorized: true, checkedAt: new Date(now - 60_000).toISOString(), evidenceAgeLimitMinutes: 15, releaseTarget: { environment: 'production', projectRef: 'project-ref', organisationIds: ['org-b', 'org-a'] } }
const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
const payload = buildLegalDocumentReleaseReceiptPayload({ m1, issuedBy: 'release-owner', releaseReference: 'REL-2', issuedAt: new Date(now).toISOString(), m1Digest: 'sha256:m1' })
const receipt = { ...payload, receiptDigest: digest(payload) }
assert.equal(receipt.contract, LEGAL_DOCUMENT_M2_RECEIPT_CONTRACT)
assert.deepEqual(receipt.releaseTarget.organisationIds, ['org-a', 'org-b'])
assert.equal(assessLegalDocumentReleaseReceipt({ m1, receipt, now, digest }).ready, true)
const tampered = { ...receipt, issuedBy: 'somebody-else' }
assert.ok(assessLegalDocumentReleaseReceipt({ m1, receipt: tampered, now, digest }).blockers.some((row) => row.code === 'M2_RECEIPT_DIGEST_INVALID'))
const driftedM1 = { ...m1, releaseTarget: { ...m1.releaseTarget, projectRef: 'other-project' } }
assert.ok(assessLegalDocumentReleaseReceipt({ m1: driftedM1, receipt, now, digest }).blockers.some((row) => row.code === 'M2_RELEASE_TARGET_DRIFT'))
assert.ok(assessLegalDocumentReleaseReceipt({ m1, receipt, now: Date.parse(receipt.expiresAt), digest }).blockers.some((row) => row.code === 'M2_RECEIPT_EXPIRED_OR_INVALID'))
assert.ok(assessLegalDocumentReleaseReceipt({ m1: { status: 'RELEASE_HOLD', authorized: false }, receipt: null, now, digest }).blockers.some((row) => row.code === 'M2_M1_NOT_AUTHORIZED'))

const issue = fs.readFileSync('scripts/legal-document-phase-m2-issue-receipt.mjs', 'utf8')
assert.match(issue, /LEGAL_DOCUMENT_PHASE_M2_WRITE/)
assert.match(issue, /M2_UNEXPIRED_RECEIPT_EXISTS/)
assert.match(issue, /--apply/)
const verify = fs.readFileSync('scripts/legal-document-phase-m2-verify-receipt.mjs', 'utf8')
assert.match(verify, /legal-document-phase-m1-release-authority\.mjs/)
assert.match(verify, /mutatedData: false/)
assert.doesNotMatch(verify, /\.insert\(|\.upsert\(|\.delete\(/)
const state = JSON.parse(fs.readFileSync('config/legal-document-release-receipt.json', 'utf8'))
assert.equal(state.status, 'not_issued')
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-m2', 'issue:legal-documents:phase-m2', 'verify:legal-documents:phase-m2']) assert.ok(pkg.scripts?.[name])
console.log('Legal document M2 guarded release receipt passed.')
