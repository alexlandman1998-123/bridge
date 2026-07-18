import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assessLegalDocumentExpandedCohortReleaseAuthority, buildLegalDocumentExpandedCohortReleaseAuthority, LEGAL_DOCUMENT_R1_RELEASE_AUTHORITY_CONTRACT } from '../src/core/documents/legalDocumentExpandedCohortReleaseAuthority.js'

const now = Date.parse('2026-07-18T10:00:00.000Z')
const activatedAt = new Date(now - 180_000).toISOString()
const q3At = new Date(now - 120_000).toISOString()
const m1At = new Date(now - 60_000).toISOString()
const activation = { status: 'activated', activatedAt, activationDigest: 'sha256:activation', activatedOrganisationIds: ['org-1', 'org-2'] }
const q3 = { status: 'READY_FOR_M1', ready: true, checkedAt: q3At, mutatedData: false, verification: { verificationDigest: 'sha256:q3', sourceActivationDigest: 'sha256:activation', activationTarget: { environment: 'production', projectRef: 'project-ref', organisationIds: ['org-1', 'org-2'] }, activatedOrganisationIds: ['org-1', 'org-2'] } }
const m1 = { status: 'READY_FOR_M2', authorized: true, checkedAt: m1At, mutatedData: false, releaseTarget: { environment: 'production', projectRef: 'project-ref', organisationIds: ['org-1', 'org-2'] }, evidenceAgeLimitMinutes: 15, evidence: { expansionRequired: true, q3Status: 'READY_FOR_M1', expansionActivationDigest: 'sha256:activation' } }
const ready = assessLegalDocumentExpandedCohortReleaseAuthority({ q3, m1, activation, now })
assert.equal(ready.ready, true)
const authority = buildLegalDocumentExpandedCohortReleaseAuthority({ q3, m1, m1Digest: 'sha256:m1', authorizedAt: new Date(now).toISOString() })
assert.equal(authority.contract, LEGAL_DOCUMENT_R1_RELEASE_AUTHORITY_CONTRACT)
assert.equal(authority.sourceActivationDigest, activation.activationDigest)
assert.deepEqual(authority.releaseTarget.organisationIds, ['org-1', 'org-2'])
const bypass = assessLegalDocumentExpandedCohortReleaseAuthority({ q3, m1: { ...m1, evidence: { expansionRequired: false } }, activation, now })
assert.ok(bypass.blockers.some((row) => row.code === 'R1_M1_EXPANSION_BYPASS'))
const targetDrift = assessLegalDocumentExpandedCohortReleaseAuthority({ q3, m1: { ...m1, releaseTarget: { ...m1.releaseTarget, organisationIds: ['org-1'] } }, activation, now })
assert.ok(targetDrift.blockers.some((row) => row.code === 'R1_RELEASE_TARGET_MISMATCH'))
const stale = assessLegalDocumentExpandedCohortReleaseAuthority({ q3: { ...q3, checkedAt: new Date(now - 16 * 60_000).toISOString() }, m1, activation, now })
assert.ok(stale.blockers.some((row) => row.code === 'R1_AUTHORITY_EVIDENCE_STALE_OR_MISORDERED'))
const upstream = assessLegalDocumentExpandedCohortReleaseAuthority({ q3: { status: 'NO_GO', ready: false, mutatedData: false }, m1: { status: 'NOT_RUN', mutatedData: false }, activation: null, now })
for (const code of ['R1_Q3_NOT_READY', 'R1_ACTIVATION_RECORD_MISSING']) assert.ok(upstream.blockers.some((row) => row.code === code), code)
assert.equal(upstream.blockers.some((row) => row.code === 'R1_M1_NOT_AUTHORIZED'), false)
const verifier = fs.readFileSync('scripts/legal-document-phase-r1-release-authority.mjs', 'utf8')
for (const script of ['legal-document-phase-q3-verify-activation.mjs', 'legal-document-phase-m1-release-authority.mjs']) assert.match(verifier, new RegExp(script.replaceAll('.', '\\.')))
assert.match(verifier, /mutatedData: false/)
assert.doesNotMatch(verifier, /writeFileSync|renameSync|\.insert\(|\.upsert\(|\.delete\(/)
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-r1', 'verify:legal-documents:phase-r1']) assert.ok(pkg.scripts?.[name])
console.log('Legal document R1 expanded-cohort release authority passed.')
