import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assessLegalDocumentExpandedCohortCertification, buildLegalDocumentExpandedCohortCertification, LEGAL_DOCUMENT_P3_CERTIFICATION_CONTRACT, LEGAL_DOCUMENT_P3_MAX_EVIDENCE_AGE_MINUTES } from '../src/core/documents/legalDocumentExpandedCohortCertification.js'

const now = Date.parse('2026-07-18T10:00:00.000Z')
const stagedAt = new Date(now - 120_000).toISOString()
const checkedAt = new Date(now - 60_000).toISOString()
const pending = { status: 'staged', stagedAt, pendingDigest: 'sha256:pending', releaseTarget: { environment: 'production', projectRef: 'project-ref', organisationIds: ['org-1'] }, currentOrganisationIds: ['org-1'], addedOrganisationId: 'org-2', proposedOrganisationIds: ['org-1', 'org-2'], maximumOrganisations: 3 }
const p2 = { status: 'READY_FOR_P3', ready: true, checkedAt, mutatedData: false }
const pilot = { organisationIds: ['org-1'], cohortPreparation: { candidateOrganisationIds: ['org-1', 'org-2'] } }
const assessment = { organisationId: 'org-2', status: 'READY', blockers: [], activeAgentCount: 1, templates: { otp: true, mandate: true }, preferredTransferAttorney: true }
const cohort = { status: 'READY', readyOrganisationIds: ['org-1', 'org-2'], assessments: [{ ...assessment, organisationId: 'org-1' }, assessment], checkedAt, mutatedData: false }
const l1 = { status: 'READY_FOR_L2', coverage: { otp: true, mandate: true }, checkedAt, mutatedData: false }

const ready = assessLegalDocumentExpandedCohortCertification({ p2, pending, pilot, cohort, l1, now })
assert.equal(ready.ready, true)
assert.equal(ready.evidenceAgeLimitMinutes, 15)
assert.equal(LEGAL_DOCUMENT_P3_MAX_EVIDENCE_AGE_MINUTES, 15)
const certificate = buildLegalDocumentExpandedCohortCertification({ pending, cohort, l1, checkedAt })
assert.equal(certificate.contract, LEGAL_DOCUMENT_P3_CERTIFICATION_CONTRACT)
assert.equal(certificate.sourcePendingDigest, pending.pendingDigest)
assert.deepEqual(certificate.proposedOrganisationIds, ['org-1', 'org-2'])
assert.equal(certificate.addedOrganisationEvidence.templates.otp, true)

const drift = assessLegalDocumentExpandedCohortCertification({ p2, pending, pilot: { ...pilot, organisationIds: ['org-1', 'org-2'] }, cohort, l1, now })
assert.ok(drift.blockers.some((row) => row.code === 'P3_CURRENT_COHORT_DRIFT'))
const unready = assessLegalDocumentExpandedCohortCertification({ p2, pending, pilot, cohort: { ...cohort, readyOrganisationIds: ['org-1'], assessments: [{ ...assessment, status: 'NOT_READY', blockers: ['OTP_TEMPLATE_MISSING'] }] }, l1, now })
for (const code of ['P3_PROPOSED_COHORT_NOT_READY', 'P3_ADDED_ORGANISATION_EVIDENCE_INVALID']) assert.ok(unready.blockers.some((row) => row.code === code), code)
const stale = assessLegalDocumentExpandedCohortCertification({ p2: { ...p2, checkedAt: new Date(now - 16 * 60_000).toISOString() }, pending, pilot, cohort, l1, now })
assert.ok(stale.blockers.some((row) => row.code === 'P3_EVIDENCE_STALE_OR_MISORDERED'))
const upstream = assessLegalDocumentExpandedCohortCertification({ p2: { status: 'NO_GO', ready: false, mutatedData: false }, pending: null, pilot, cohort: { status: 'NOT_RUN', mutatedData: false }, l1: { status: 'NOT_RUN', mutatedData: false }, now })
for (const code of ['P3_P2_NOT_READY', 'P3_PENDING_CHANGESET_MISSING']) assert.ok(upstream.blockers.some((row) => row.code === code), code)

const verifier = fs.readFileSync('scripts/legal-document-phase-p3-expanded-cohort-certification.mjs', 'utf8')
for (const script of ['legal-document-phase-p2-verify-expansion.mjs', 'legal-document-phase4-cohort-readiness.mjs', 'legal-document-phase-l1-launch-certification.mjs']) assert.match(verifier, new RegExp(script.replaceAll('.', '\\.') ))
assert.match(verifier, /effectiveAllowlistChanged: false/)
assert.match(verifier, /mutatedData: false/)
assert.doesNotMatch(verifier, /\.from\(|\.insert\(|\.upsert\(|\.delete\(|writeFileSync|renameSync/)
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-p3', 'verify:legal-documents:phase-p3']) assert.ok(pkg.scripts?.[name])
console.log('Legal document P3 expanded-cohort certification passed.')
