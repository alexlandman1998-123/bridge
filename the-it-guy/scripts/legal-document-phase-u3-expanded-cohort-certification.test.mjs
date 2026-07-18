import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { assessLegalDocumentNextExpandedCohortCertification, buildLegalDocumentNextExpandedCohortCertification, LEGAL_DOCUMENT_U3_CERTIFICATION_CONTRACT, LEGAL_DOCUMENT_U3_MAX_EVIDENCE_AGE_MINUTES } from '../src/core/documents/legalDocumentNextExpandedCohortCertification.js'
import { LEGAL_DOCUMENT_U2_PENDING_EXPANSION_CONTRACT } from '../src/core/documents/legalDocumentNextPendingExpansion.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
const now = Date.parse('2026-07-20T10:10:00.000Z')
const checkedAt = '2026-07-20T10:09:00.000Z'
const continuation = { status: 'continued', recordDigest: 'sha256:t1', sourceActivationDigest: 'sha256:q2', releaseTarget: { environment: 'production', projectRef: 'project-ref', organisationIds: ['org-1', 'org-2'] } }
const activation = { status: 'activated', activationDigest: 'sha256:q2', activationTarget: { environment: 'production', projectRef: 'project-ref', organisationIds: ['org-1', 'org-2'] }, activatedOrganisationIds: ['org-1', 'org-2'] }
const pilot = {
  enabled: true, environment: 'production', organisationIds: ['org-1', 'org-2'],
  releasePreparation: { organisationIds: ['org-1', 'org-2'] }, activation: { status: 'active', targetProjectRef: 'project-ref', activatedOrganisationIds: ['org-1', 'org-2'] },
  limits: { maxOrganisations: 5 }, cohortPreparation: { candidateOrganisationIds: ['org-3'], minimumActiveAgents: 1 },
}
const pendingPayload = canonicalLegalDocumentReleaseValue({
  contract: LEGAL_DOCUMENT_U2_PENDING_EXPANSION_CONTRACT, status: 'staged', stagedAt: '2026-07-20T10:05:00.000Z', stagedBy: 'staging-owner', stagingReference: 'EXP-U2-1',
  sourceApprovalDigest: 'sha256:u1', sourceHandoffDigest: 'sha256:t4', sourceContinuationDigest: 'sha256:t1', sourceActivationDigest: 'sha256:q2',
  releaseTarget: continuation.releaseTarget, currentOrganisationIds: ['org-1', 'org-2'], addedOrganisationId: 'org-3', proposedOrganisationIds: ['org-1', 'org-2', 'org-3'], maximumOrganisations: 5, trancheSize: 1,
})
const pending = { ...pendingPayload, pendingDigest: digest(pendingPayload) }
const u2 = { status: 'READY_FOR_U3', ready: true, checkedAt, mutatedData: false }
const readiness = (organisationId) => ({ organisationId, organisationName: `Agency ${organisationId}`, activeAgentCount: 2, templates: { otp: true, mandate: true }, preferredTransferAttorney: true, status: 'READY', blockers: [] })
const cohort = { status: 'READY', readyOrganisationIds: ['org-1', 'org-2', 'org-3'], assessments: ['org-1', 'org-2', 'org-3'].map(readiness), checkedAt, mutatedData: false }
const l1 = { status: 'READY_FOR_L2', coverage: { otp: true, mandate: true }, checkedAt, mutatedData: false }
const ready = assessLegalDocumentNextExpandedCohortCertification({ u2, pending, continuation, activation, pilot, cohort, l1, now, digest })
assert.equal(ready.ready, true)
assert.equal(ready.evidenceAgeLimitMinutes, 15)
assert.equal(LEGAL_DOCUMENT_U3_MAX_EVIDENCE_AGE_MINUTES, 15)
const certificate = buildLegalDocumentNextExpandedCohortCertification({ pending, cohort, l1, checkedAt })
assert.equal(certificate.contract, LEGAL_DOCUMENT_U3_CERTIFICATION_CONTRACT)
assert.equal(certificate.sourcePendingDigest, pending.pendingDigest)
assert.equal(certificate.sourceActivationDigest, 'sha256:q2')
assert.deepEqual(certificate.proposedOrganisationIds, ['org-1', 'org-2', 'org-3'])
assert.equal(certificate.cohortReadinessEvidence.length, 3)
const exposedEarly = assessLegalDocumentNextExpandedCohortCertification({ u2, pending, continuation, activation, pilot: { ...pilot, organisationIds: ['org-1', 'org-2', 'org-3'] }, cohort, l1, now, digest })
assert.ok(exposedEarly.blockers.some((row) => row.code === 'U3_CURRENT_COHORT_DRIFT'))
const unreadyCohort = { ...cohort, status: 'NOT_READY', readyOrganisationIds: ['org-1', 'org-2'], assessments: [...cohort.assessments.slice(0, 2), { ...readiness('org-3'), status: 'NOT_READY', templates: { otp: false, mandate: true }, blockers: ['OTP_TEMPLATE_MISSING'] }] }
const unready = assessLegalDocumentNextExpandedCohortCertification({ u2, pending, continuation, activation, pilot, cohort: unreadyCohort, l1, now, digest })
for (const code of ['U3_COHORT_READINESS_NOT_READY', 'U3_PROPOSED_COHORT_NOT_READY', 'U3_ADDED_ORGANISATION_EVIDENCE_INVALID']) assert.ok(unready.blockers.some((row) => row.code === code), code)
const stale = assessLegalDocumentNextExpandedCohortCertification({ u2: { ...u2, checkedAt: '2026-07-20T09:50:00.000Z' }, pending, continuation, activation, pilot, cohort, l1, now, digest })
assert.ok(stale.blockers.some((row) => row.code === 'U3_EVIDENCE_STALE_OR_MISORDERED'))
const tampered = assessLegalDocumentNextExpandedCohortCertification({ u2, pending: { ...pending, stagedBy: 'edited' }, continuation, activation, pilot, cohort, l1, now, digest })
assert.ok(tampered.blockers.some((row) => row.code === 'U3_PENDING_DIGEST_INVALID'))
const upstream = assessLegalDocumentNextExpandedCohortCertification({ u2: { status: 'NO_GO', ready: false, mutatedData: false }, pending: null, continuation: null, activation: null, pilot, cohort: { status: 'NOT_RUN', mutatedData: false }, l1: { status: 'NOT_RUN', mutatedData: false }, now, digest })
for (const code of ['U3_U2_NOT_READY', 'U3_PENDING_CHANGESET_MISSING', 'U3_CONTINUATION_RECORD_MISSING', 'U3_ACTIVATION_RECORD_MISSING']) assert.ok(upstream.blockers.some((row) => row.code === code), code)
const verifier = fs.readFileSync('scripts/legal-document-phase-u3-expanded-cohort-certification.mjs', 'utf8')
for (const item of ['legal-document-phase-u2-verify-expansion.mjs', 'legal-document-phase-l1-launch-certification.mjs', 'organisations', 'organisation_users', 'document_packet_templates', 'organisation_preferred_partners']) assert.match(verifier, new RegExp(item.replaceAll('.', '\\.')))
assert.doesNotMatch(verifier, /legal-document-phase4-cohort-readiness/)
assert.match(verifier, /effectiveAllowlistChanged: false/)
assert.match(verifier, /runtimeActivationChanged: false/)
assert.match(verifier, /mutatedData: false/)
assert.doesNotMatch(verifier, /\.insert\(|\.upsert\(|\.delete\(|writeFileSync|renameSync/)
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-u3', 'verify:legal-documents:phase-u3']) assert.ok(pkg.scripts?.[name])
console.log('Legal document U3 fresh expanded-cohort certification passed.')
