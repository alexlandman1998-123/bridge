import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { assessLegalDocumentExpandedCohortActivation, buildLegalDocumentExpandedCohortActivation, LEGAL_DOCUMENT_Q2_ACTIVATION_CONTRACT } from '../src/core/documents/legalDocumentExpandedCohortActivation.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
const now = Date.parse('2026-07-18T10:00:00.000Z')
const plan = { status: 'planned', plannedAt: new Date(now - 60_000).toISOString(), expiresAt: new Date(now + 14 * 60_000).toISOString(), planDigest: 'sha256:plan', sourceCertificationDigest: 'sha256:cert', sourcePendingDigest: 'sha256:pending', activationTarget: { environment: 'production', projectRef: 'project-ref', organisationIds: ['org-1', 'org-2'] }, currentOrganisationIds: ['org-1'], addedOrganisationId: 'org-2', proposedOrganisationIds: ['org-1', 'org-2'] }
const approval = { status: 'approved', approvalDigest: 'sha256:approval', approvedBy: 'owner', approvedAt: new Date(now - 300_000).toISOString(), approvalReference: 'APP-1' }
const pending = { status: 'staged', pendingDigest: 'sha256:pending', sourceApprovalDigest: 'sha256:approval' }
const payload = buildLegalDocumentExpandedCohortActivation({ plan, approval, activatedBy: 'operator', activationReference: 'CHG-2', activatedAt: new Date(now - 30_000).toISOString() })
const activation = { ...payload, activationDigest: digest(payload) }
const pilot = { enabled: true, environment: 'production', organisationIds: ['org-1', 'org-2'], releasePreparation: { status: 'approved', organisationIds: ['org-1', 'org-2'], approvedBy: 'owner', approvedAt: approval.approvedAt, approvalReference: 'APP-1' }, activation: { status: 'active', targetProjectRef: 'project-ref', activatedOrganisationIds: ['org-1', 'org-2'] } }
const ready = assessLegalDocumentExpandedCohortActivation({ activation, plan, approval, pending, pilot, runtimeSecretsVerified: true, now, digest })
assert.equal(ready.ready, true)
assert.equal(activation.contract, LEGAL_DOCUMENT_Q2_ACTIVATION_CONTRACT)
const secretDrift = assessLegalDocumentExpandedCohortActivation({ activation, plan, approval, pending, pilot, runtimeSecretsVerified: false, now, digest })
assert.ok(secretDrift.blockers.some((row) => row.code === 'Q2_RUNTIME_SECRET_MISMATCH'))
const cohortDrift = assessLegalDocumentExpandedCohortActivation({ activation, plan, approval, pending, pilot: { ...pilot, organisationIds: ['org-1'] }, runtimeSecretsVerified: true, now, digest })
assert.ok(cohortDrift.blockers.some((row) => row.code === 'Q2_REPOSITORY_COHORT_MISMATCH'))
const tampered = { ...activation, activatedOrganisationIds: ['org-1', 'org-3'] }
const invalid = assessLegalDocumentExpandedCohortActivation({ activation: tampered, plan, approval, pending, pilot, runtimeSecretsVerified: true, now, digest })
for (const code of ['Q2_PLANNED_TARGET_MISMATCH', 'Q2_ACTIVATION_DIGEST_INVALID']) assert.ok(invalid.blockers.some((row) => row.code === code), code)

const activator = fs.readFileSync('scripts/legal-document-phase-q2-activate-expansion.mjs', 'utf8')
for (const token of ['LEGAL_DOCUMENT_PHASE_Q2_WRITE', 'LEGAL_DOCUMENT_PILOT_ENABLED=true', 'LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS=', 'legal-document-phase-q1-verify-activation-plan.mjs', 'secretDigestsVerified: true']) assert.match(activator, new RegExp(token.replaceAll('.', '\\.')))
assert.match(activator, /previous cohort was restored/)
const verifier = fs.readFileSync('scripts/legal-document-phase-q2-verify-expansion.mjs', 'utf8')
assert.match(verifier, /runtimeSecretsVerified/)
assert.match(verifier, /mutatedData: false/)
assert.doesNotMatch(verifier, /writeFileSync|renameSync|\.insert\(|\.upsert\(|\.delete\(/)
const state = JSON.parse(fs.readFileSync('config/legal-document-expansion-activation.json', 'utf8'))
assert.deepEqual(state, { version: 1, status: 'not_activated', activation: null, history: [] })
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-q2', 'activate:legal-documents:phase-q2', 'verify:legal-documents:phase-q2']) assert.ok(pkg.scripts?.[name])
console.log('Legal document Q2 guarded expanded-cohort activation passed.')
