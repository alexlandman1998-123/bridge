import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { assessLegalDocumentExpandedCohortReleaseReceipt, buildLegalDocumentExpandedCohortReleaseReceipt, LEGAL_DOCUMENT_R2_RELEASE_RECEIPT_CONTRACT } from '../src/core/documents/legalDocumentExpandedCohortReleaseReceipt.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
const now = Date.parse('2026-07-18T10:00:00.000Z')
const authorityPayload = { contract: 'legal-document-expanded-cohort-release-authority-r1-v1', status: 'authorized', authorizedAt: new Date(now - 60_000).toISOString(), sourceActivationDigest: 'sha256:activation', sourceQ3VerificationDigest: 'sha256:q3', sourceM1Digest: 'sha256:m1', releaseTarget: { environment: 'production', projectRef: 'project-ref', organisationIds: ['org-1', 'org-2'] }, evidenceWindowMinutes: 15, requiredNextPhases: ['R2', 'R3'] }
const authority = { ...authorityPayload, authorityDigest: digest(authorityPayload) }
const receiptPayload = buildLegalDocumentExpandedCohortReleaseReceipt({ authority, issuedBy: 'release-owner', releaseReference: 'REL-2', issuedAt: new Date(now - 30_000).toISOString() })
const receipt = { ...receiptPayload, receiptDigest: digest(receiptPayload) }
const r1 = { status: 'READY_FOR_R2', authorized: true, authority, mutatedData: false }
const activation = { status: 'activated', activationDigest: 'sha256:activation', activatedOrganisationIds: ['org-1', 'org-2'] }
const ready = assessLegalDocumentExpandedCohortReleaseReceipt({ receipt, currentR1: r1, activation, now, digest })
assert.equal(ready.ready, true)
assert.equal(receipt.contract, LEGAL_DOCUMENT_R2_RELEASE_RECEIPT_CONTRACT)
assert.equal(receipt.sourceAuthorityDigest, authority.authorityDigest)
const expired = assessLegalDocumentExpandedCohortReleaseReceipt({ receipt, currentR1: r1, activation, now: now + 16 * 60_000, digest })
assert.ok(expired.blockers.some((row) => row.code === 'R2_RECEIPT_EXPIRED_OR_MISORDERED'))
const targetDrift = assessLegalDocumentExpandedCohortReleaseReceipt({ receipt, currentR1: { ...r1, authority: { ...authority, releaseTarget: { ...authority.releaseTarget, organisationIds: ['org-1'] } } }, activation, now, digest })
assert.ok(targetDrift.blockers.some((row) => row.code === 'R2_CURRENT_AUTHORITY_DRIFT'))
const tampered = { ...receipt, releaseReference: 'changed' }
const invalid = assessLegalDocumentExpandedCohortReleaseReceipt({ receipt: tampered, currentR1: r1, activation, now, digest })
assert.ok(invalid.blockers.some((row) => row.code === 'R2_RECEIPT_DIGEST_INVALID'))
const issuer = fs.readFileSync('scripts/legal-document-phase-r2-issue-receipt.mjs', 'utf8')
assert.match(issuer, /LEGAL_DOCUMENT_PHASE_R2_WRITE/)
assert.match(issuer, /legal-document-phase-r1-release-authority\.mjs/)
const verifier = fs.readFileSync('scripts/legal-document-phase-r2-verify-receipt.mjs', 'utf8')
assert.match(verifier, /mutatedData: false/)
assert.doesNotMatch(verifier, /writeFileSync|renameSync|\.insert\(|\.upsert\(|\.delete\(/)
const state = JSON.parse(fs.readFileSync('config/legal-document-expanded-release-receipt.json', 'utf8'))
assert.deepEqual(state, { version: 1, status: 'not_issued', receipt: null, history: [] })
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-r2', 'issue:legal-documents:phase-r2', 'verify:legal-documents:phase-r2']) assert.ok(pkg.scripts?.[name])
console.log('Legal document R2 expanded-cohort release receipt passed.')
