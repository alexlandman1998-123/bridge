import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { assessLegalDocumentNextExpandedCohortActivationVerification, buildLegalDocumentNextExpandedCohortVerification, LEGAL_DOCUMENT_V3_MAX_EVIDENCE_AGE_MINUTES, LEGAL_DOCUMENT_V3_VERIFICATION_CONTRACT } from '../src/core/documents/legalDocumentNextExpandedCohortActivationVerification.js'
import { LEGAL_DOCUMENT_V2_ACTIVATION_CONTRACT } from '../src/core/documents/legalDocumentNextExpandedCohortActivation.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
const now = Date.parse('2026-07-20T10:10:00.000Z')
const checkedAt = '2026-07-20T10:09:00.000Z'
const activationPayload = canonicalLegalDocumentReleaseValue({
  contract: LEGAL_DOCUMENT_V2_ACTIVATION_CONTRACT, status: 'activated', activatedAt: '2026-07-20T10:07:00.000Z', activatedBy: 'operator', activationReference: 'EXP-V2-1',
  sourcePlanDigest: 'sha256:v1', sourceCertificationDigest: 'sha256:u3', sourcePendingDigest: 'sha256:u2', sourceApprovalDigest: 'sha256:u1', sourceHandoffDigest: 'sha256:t4', sourceContinuationDigest: 'sha256:t1', sourcePreviousActivationDigest: 'sha256:q2',
  activationTarget: { environment: 'production', projectRef: 'project-ref', organisationIds: ['org-1', 'org-2', 'org-3'] }, previousOrganisationIds: ['org-1', 'org-2'], addedOrganisationId: 'org-3', activatedOrganisationIds: ['org-1', 'org-2', 'org-3'], requiredNextPhases: [],
})
const activation = { ...activationPayload, activationDigest: digest(activationPayload) }
const v2 = { status: 'READY_FOR_V3', ready: true, checkedAt, mutatedData: false }
const pilot = {
  enabled: true, environment: 'production', organisationIds: ['org-1', 'org-2', 'org-3'], releasePreparation: { organisationIds: ['org-1', 'org-2', 'org-3'] },
  activation: { status: 'active', targetProjectRef: 'project-ref', activatedOrganisationIds: ['org-1', 'org-2', 'org-3'], nextExpansionActivationDigest: activation.activationDigest },
  cohortPreparation: { minimumActiveAgents: 1 },
}
const a3 = { status: 'HEALTHY', secretDigestsVerified: true, releaseStatus: 'GO', organisationIds: ['org-1', 'org-2', 'org-3'], checkedAt, mutatedData: false }
const readiness = (organisationId) => ({ organisationId, organisationName: `Agency ${organisationId}`, status: 'READY', blockers: [], activeAgentCount: 2, templates: { otp: true, mandate: true }, preferredTransferAttorney: true })
const cohort = { status: 'READY', readyOrganisationIds: ['org-1', 'org-2', 'org-3'], assessments: ['org-1', 'org-2', 'org-3'].map(readiness), checkedAt, mutatedData: false }
const ready = assessLegalDocumentNextExpandedCohortActivationVerification({ v2, activation, pilot, a3, cohort, now, digest })
assert.equal(ready.ready, true)
assert.equal(ready.evidenceAgeLimitMinutes, 15)
assert.equal(LEGAL_DOCUMENT_V3_MAX_EVIDENCE_AGE_MINUTES, 15)
const verification = buildLegalDocumentNextExpandedCohortVerification({ activation, a3, cohort, checkedAt })
assert.equal(verification.contract, LEGAL_DOCUMENT_V3_VERIFICATION_CONTRACT)
assert.equal(verification.sourceActivationDigest, activation.activationDigest)
assert.equal(verification.sourcePreviousActivationDigest, 'sha256:q2')
assert.equal(verification.cohortReadinessEvidence.length, 3)
const runtimeDrift = assessLegalDocumentNextExpandedCohortActivationVerification({ v2, activation, pilot, a3: { ...a3, secretDigestsVerified: false }, cohort, now, digest })
assert.ok(runtimeDrift.blockers.some((row) => row.code === 'V3_A3_HEALTH_INVALID'))
const receiptDrift = assessLegalDocumentNextExpandedCohortActivationVerification({ v2, activation, pilot: { ...pilot, activation: { ...pilot.activation, nextExpansionActivationDigest: 'sha256:other' } }, a3, cohort, now, digest })
assert.ok(receiptDrift.blockers.some((row) => row.code === 'V3_ACTIVATION_RECEIPT_BINDING_INVALID'))
const cohortDrift = assessLegalDocumentNextExpandedCohortActivationVerification({ v2, activation, pilot, a3, cohort: { ...cohort, status: 'NOT_READY', readyOrganisationIds: ['org-1', 'org-2'], assessments: [...cohort.assessments.slice(0, 2), { ...readiness('org-3'), status: 'NOT_READY', blockers: ['MANDATE_TEMPLATE_MISSING'], templates: { otp: true, mandate: false } }] }, now, digest })
for (const code of ['V3_COHORT_READINESS_NOT_READY', 'V3_EXPANDED_COHORT_NOT_READY', 'V3_ADDED_ORGANISATION_EVIDENCE_INVALID']) assert.ok(cohortDrift.blockers.some((row) => row.code === code), code)
const stale = assessLegalDocumentNextExpandedCohortActivationVerification({ v2: { ...v2, checkedAt: '2026-07-20T09:50:00.000Z' }, activation, pilot, a3, cohort, now, digest })
assert.ok(stale.blockers.some((row) => row.code === 'V3_EVIDENCE_STALE_OR_MISORDERED'))
const tampered = assessLegalDocumentNextExpandedCohortActivationVerification({ v2, activation: { ...activation, addedOrganisationId: 'org-4' }, pilot, a3, cohort, now, digest })
assert.ok(tampered.blockers.some((row) => row.code === 'V3_ACTIVATION_DIGEST_INVALID'))
const upstream = assessLegalDocumentNextExpandedCohortActivationVerification({ v2: { status: 'NO_GO', ready: false, mutatedData: false }, activation: null, pilot, a3: { status: 'NOT_RUN', mutatedData: false }, cohort: { status: 'NOT_RUN', mutatedData: false }, now, digest })
for (const code of ['V3_V2_NOT_READY', 'V3_ACTIVATION_RECORD_MISSING']) assert.ok(upstream.blockers.some((row) => row.code === code), code)
const verifier = fs.readFileSync('scripts/legal-document-phase-v3-verify-activation.mjs', 'utf8')
for (const item of ['legal-document-phase-v2-verify-expansion.mjs', 'legal-document-phase-a3-verify.mjs', 'organisations', 'organisation_users', 'document_packet_templates', 'organisation_preferred_partners']) assert.match(verifier, new RegExp(item.replaceAll('.', '\\.')))
assert.doesNotMatch(verifier, /legal-document-phase4-cohort-readiness/)
assert.match(verifier, /mutatedData: false/)
assert.doesNotMatch(verifier, /writeFileSync|renameSync|\.insert\(|\.upsert\(|\.delete\(/)
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-v3', 'verify:legal-documents:phase-v3']) assert.ok(pkg.scripts?.[name])
console.log('Legal document V3 post-activation verification passed.')
