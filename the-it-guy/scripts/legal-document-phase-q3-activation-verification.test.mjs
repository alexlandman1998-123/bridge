import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assessLegalDocumentExpandedCohortActivationVerification, buildLegalDocumentExpandedCohortVerification, LEGAL_DOCUMENT_Q3_VERIFICATION_CONTRACT } from '../src/core/documents/legalDocumentExpandedCohortActivationVerification.js'

const now = Date.parse('2026-07-18T10:00:00.000Z')
const activatedAt = new Date(now - 120_000).toISOString()
const checkedAt = new Date(now - 60_000).toISOString()
const activation = { status: 'activated', activatedAt, activationDigest: 'sha256:activation', activationTarget: { environment: 'production', projectRef: 'project-ref', organisationIds: ['org-1', 'org-2'] }, previousOrganisationIds: ['org-1'], addedOrganisationId: 'org-2', activatedOrganisationIds: ['org-1', 'org-2'] }
const q2 = { status: 'READY_FOR_Q3', ready: true, checkedAt, mutatedData: false }
const pilot = { enabled: true, environment: 'production', organisationIds: ['org-1', 'org-2'], activation: { status: 'active', targetProjectRef: 'project-ref', activatedOrganisationIds: ['org-1', 'org-2'], expansionActivationDigest: 'sha256:activation' } }
const a3 = { status: 'HEALTHY', secretDigestsVerified: true, releaseStatus: 'GO', organisationIds: ['org-1', 'org-2'], checkedAt, mutatedData: false }
const assessment = (organisationId) => ({ organisationId, status: 'READY', blockers: [], activeAgentCount: 1, templates: { otp: true, mandate: true }, preferredTransferAttorney: true })
const cohort = { status: 'READY', readyOrganisationIds: ['org-1', 'org-2'], configuredOrganisationIds: ['org-1', 'org-2'], assessments: [assessment('org-1'), assessment('org-2')], checkedAt, mutatedData: false }
const ready = assessLegalDocumentExpandedCohortActivationVerification({ q2, activation, pilot, a3, cohort, now })
assert.equal(ready.ready, true)
const verification = buildLegalDocumentExpandedCohortVerification({ activation, a3, cohort, checkedAt })
assert.equal(verification.contract, LEGAL_DOCUMENT_Q3_VERIFICATION_CONTRACT)
assert.equal(verification.sourceActivationDigest, activation.activationDigest)
const runtimeDrift = assessLegalDocumentExpandedCohortActivationVerification({ q2, activation, pilot, a3: { ...a3, secretDigestsVerified: false }, cohort, now })
assert.ok(runtimeDrift.blockers.some((row) => row.code === 'Q3_A3_HEALTH_INVALID'))
const cohortDrift = assessLegalDocumentExpandedCohortActivationVerification({ q2, activation, pilot, a3, cohort: { ...cohort, readyOrganisationIds: ['org-1'] }, now })
assert.ok(cohortDrift.blockers.some((row) => row.code === 'Q3_EXPANDED_COHORT_NOT_READY'))
const stale = assessLegalDocumentExpandedCohortActivationVerification({ q2: { ...q2, checkedAt: new Date(now - 16 * 60_000).toISOString() }, activation, pilot, a3, cohort, now })
assert.ok(stale.blockers.some((row) => row.code === 'Q3_EVIDENCE_STALE_OR_MISORDERED'))
const verifier = fs.readFileSync('scripts/legal-document-phase-q3-verify-activation.mjs', 'utf8')
for (const script of ['legal-document-phase-q2-verify-expansion.mjs', 'legal-document-phase-a3-verify.mjs', 'legal-document-phase4-cohort-readiness.mjs']) assert.match(verifier, new RegExp(script.replaceAll('.', '\\.')))
assert.match(verifier, /mutatedData: false/)
assert.doesNotMatch(verifier, /writeFileSync|renameSync|\.insert\(|\.upsert\(|\.delete\(/)
const m1 = fs.readFileSync('scripts/legal-document-phase-m1-release-authority.mjs', 'utf8')
assert.match(m1, /legal-document-phase-q3-verify-activation\.mjs/)
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-q3', 'verify:legal-documents:phase-q3']) assert.ok(pkg.scripts?.[name])
console.log('Legal document Q3 post-activation verification passed.')
