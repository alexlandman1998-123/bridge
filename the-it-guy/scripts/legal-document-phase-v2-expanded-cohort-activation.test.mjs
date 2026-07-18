import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { assessLegalDocumentNextExpandedCohortActivation, buildLegalDocumentNextExpandedCohortActivation, LEGAL_DOCUMENT_V2_ACTIVATION_CONTRACT } from '../src/core/documents/legalDocumentNextExpandedCohortActivation.js'
import { LEGAL_DOCUMENT_V1_ACTIVATION_PLAN_CONTRACT } from '../src/core/documents/legalDocumentNextExpansionActivationPlan.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
const now = Date.parse('2026-07-20T10:10:00.000Z')
const approval = { status: 'approved', approvalDigest: 'sha256:u1', approvedBy: 'rollout-owner', approvedAt: '2026-07-20T10:00:00.000Z', approvalReference: 'EXP-U1-1' }
const pending = { status: 'staged', pendingDigest: 'sha256:u2', sourceApprovalDigest: 'sha256:u1', sourceHandoffDigest: 'sha256:t4', sourceContinuationDigest: 'sha256:t1', sourceActivationDigest: 'sha256:q2', currentOrganisationIds: ['org-1', 'org-2'], addedOrganisationId: 'org-3', proposedOrganisationIds: ['org-1', 'org-2', 'org-3'] }
const continuation = { status: 'continued', recordDigest: 'sha256:t1', sourceActivationDigest: 'sha256:q2', releaseTarget: { environment: 'production', projectRef: 'project-ref', organisationIds: ['org-1', 'org-2'] } }
const previousActivation = { status: 'activated', activationDigest: 'sha256:q2', activatedOrganisationIds: ['org-1', 'org-2'] }
const planPayload = canonicalLegalDocumentReleaseValue({
  contract: LEGAL_DOCUMENT_V1_ACTIVATION_PLAN_CONTRACT, status: 'planned', plannedAt: '2026-07-20T10:08:00.000Z', expiresAt: '2026-07-20T10:20:00.000Z', plannedBy: 'planner', planningReference: 'EXP-V1-1',
  sourceCertificationDigest: 'sha256:u3', sourcePendingDigest: 'sha256:u2', sourceApprovalDigest: 'sha256:u1', sourceHandoffDigest: 'sha256:t4', sourceContinuationDigest: 'sha256:t1', sourceActivationDigest: 'sha256:q2',
  activationTarget: { environment: 'production', projectRef: 'project-ref', organisationIds: ['org-1', 'org-2', 'org-3'] }, currentOrganisationIds: ['org-1', 'org-2'], addedOrganisationId: 'org-3', proposedOrganisationIds: ['org-1', 'org-2', 'org-3'], maximumOrganisations: 5, trancheSize: 1,
})
const plan = { ...planPayload, planDigest: digest(planPayload) }
const activationPayload = buildLegalDocumentNextExpandedCohortActivation({ plan, approval, activatedBy: 'activation-operator', activationReference: 'EXP-V2-1', activatedAt: '2026-07-20T10:09:00.000Z' })
const activation = { ...activationPayload, activationDigest: digest(activationPayload) }
const pilot = {
  enabled: true, environment: 'production', organisationIds: ['org-1', 'org-2', 'org-3'],
  releasePreparation: { status: 'approved', organisationIds: ['org-1', 'org-2', 'org-3'], approvedBy: approval.approvedBy, approvedAt: approval.approvedAt, approvalReference: approval.approvalReference, nextExpansionSourceApprovalDigest: approval.approvalDigest },
  activation: { status: 'active', targetProjectRef: 'project-ref', activatedOrganisationIds: ['org-1', 'org-2', 'org-3'] },
}
const ready = assessLegalDocumentNextExpandedCohortActivation({ activation, plan, approval, pending, continuation, previousActivation, pilot, runtimeSecretsVerified: true, now, digest })
assert.equal(ready.ready, true)
assert.equal(activation.contract, LEGAL_DOCUMENT_V2_ACTIVATION_CONTRACT)
assert.equal(activation.sourcePreviousActivationDigest, 'sha256:q2')
const secretDrift = assessLegalDocumentNextExpandedCohortActivation({ activation, plan, approval, pending, continuation, previousActivation, pilot, runtimeSecretsVerified: false, now, digest })
assert.ok(secretDrift.blockers.some((row) => row.code === 'V2_RUNTIME_SECRET_MISMATCH'))
const cohortDrift = assessLegalDocumentNextExpandedCohortActivation({ activation, plan, approval, pending, continuation, previousActivation, pilot: { ...pilot, organisationIds: ['org-1', 'org-2'] }, runtimeSecretsVerified: true, now, digest })
assert.ok(cohortDrift.blockers.some((row) => row.code === 'V2_REPOSITORY_COHORT_MISMATCH'))
const priorDrift = assessLegalDocumentNextExpandedCohortActivation({ activation, plan, approval, pending, continuation, previousActivation: { ...previousActivation, activationDigest: 'sha256:other' }, pilot, runtimeSecretsVerified: true, now, digest })
assert.ok(priorDrift.blockers.some((row) => row.code === 'V2_PREVIOUS_ACTIVATION_BINDING_INVALID'))
const tampered = assessLegalDocumentNextExpandedCohortActivation({ activation: { ...activation, activatedOrganisationIds: ['org-1', 'org-2', 'org-4'] }, plan, approval, pending, continuation, previousActivation, pilot, runtimeSecretsVerified: true, now, digest })
assert.ok(tampered.blockers.some((row) => row.code === 'V2_PLANNED_TARGET_MISMATCH'))
assert.ok(tampered.blockers.some((row) => row.code === 'V2_ACTIVATION_DIGEST_INVALID'))
const missing = assessLegalDocumentNextExpandedCohortActivation({ activation: null, plan: null, approval: null, pending: null, continuation: null, previousActivation: null, pilot, runtimeSecretsVerified: false, now, digest })
for (const code of ['V2_ACTIVATION_RECORD_MISSING', 'V2_SOURCE_PLAN_MISSING', 'V2_SOURCE_APPROVAL_MISSING', 'V2_SOURCE_PENDING_MISSING', 'V2_CONTINUATION_RECORD_MISSING', 'V2_PREVIOUS_ACTIVATION_MISSING']) assert.ok(missing.blockers.some((row) => row.code === code), code)
const activator = fs.readFileSync('scripts/legal-document-phase-v2-activate-expansion.mjs', 'utf8')
for (const token of ['LEGAL_DOCUMENT_PHASE_V2_WRITE', 'LEGAL_DOCUMENT_PILOT_ENABLED=true', 'LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS=', 'legal-document-phase-v1-verify-activation-plan.mjs', 'secretDigestsVerified: true', 'previous cohort was restored']) assert.match(activator, new RegExp(token.replaceAll('.', '\\.')))
assert.match(activator, /row\?\.status === 'activated'/)
const verifier = fs.readFileSync('scripts/legal-document-phase-v2-verify-expansion.mjs', 'utf8')
assert.match(verifier, /runtimeSecretsVerified/)
assert.match(verifier, /mutatedData: false/)
assert.doesNotMatch(verifier, /writeFileSync|renameSync|\.insert\(|\.upsert\(|\.delete\(/)
const state = JSON.parse(fs.readFileSync('config/legal-document-next-expansion-activation.json', 'utf8'))
assert.deepEqual(state, { version: 1, status: 'not_activated', activation: null, history: [] })
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-v2', 'activate:legal-documents:phase-v2', 'verify:legal-documents:phase-v2']) assert.ok(pkg.scripts?.[name])
console.log('Legal document V2 guarded next-expansion activation passed.')
