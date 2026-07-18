import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { assessLegalDocumentNextExpansionActivationPlan, buildLegalDocumentNextExpansionActivationPlan, LEGAL_DOCUMENT_V1_ACTIVATION_PLAN_CONTRACT } from '../src/core/documents/legalDocumentNextExpansionActivationPlan.js'
import { LEGAL_DOCUMENT_U3_CERTIFICATION_CONTRACT } from '../src/core/documents/legalDocumentNextExpandedCohortCertification.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
const now = Date.parse('2026-07-20T10:10:00.000Z')
const continuation = { status: 'continued', recordDigest: 'sha256:t1', sourceActivationDigest: 'sha256:q2', releaseTarget: { environment: 'production', projectRef: 'project-ref', organisationIds: ['org-1', 'org-2'] } }
const activation = { status: 'activated', activationDigest: 'sha256:q2', activationTarget: { environment: 'production', projectRef: 'project-ref', organisationIds: ['org-1', 'org-2'] }, activatedOrganisationIds: ['org-1', 'org-2'] }
const pilot = {
  enabled: true, environment: 'production', organisationIds: ['org-1', 'org-2'], releasePreparation: { organisationIds: ['org-1', 'org-2'] },
  activation: { status: 'active', targetProjectRef: 'project-ref', activatedOrganisationIds: ['org-1', 'org-2'] }, limits: { maxOrganisations: 5 }, cohortPreparation: { minimumActiveAgents: 1 },
}
const pending = {
  status: 'staged', pendingDigest: 'sha256:u2', sourceApprovalDigest: 'sha256:u1', sourceHandoffDigest: 'sha256:t4', sourceContinuationDigest: 'sha256:t1', sourceActivationDigest: 'sha256:q2',
  releaseTarget: continuation.releaseTarget, currentOrganisationIds: ['org-1', 'org-2'], addedOrganisationId: 'org-3', proposedOrganisationIds: ['org-1', 'org-2', 'org-3'], maximumOrganisations: 5, trancheSize: 1,
}
const readiness = (organisationId) => ({ organisationId, organisationName: `Agency ${organisationId}`, activeAgentCount: 2, templates: { otp: true, mandate: true }, preferredTransferAttorney: true })
const certificatePayload = canonicalLegalDocumentReleaseValue({
  contract: LEGAL_DOCUMENT_U3_CERTIFICATION_CONTRACT, status: 'certified', certifiedAt: '2026-07-20T10:08:00.000Z',
  sourcePendingDigest: 'sha256:u2', sourceApprovalDigest: 'sha256:u1', sourceHandoffDigest: 'sha256:t4', sourceContinuationDigest: 'sha256:t1', sourceActivationDigest: 'sha256:q2',
  releaseTarget: continuation.releaseTarget, currentOrganisationIds: ['org-1', 'org-2'], addedOrganisationId: 'org-3', proposedOrganisationIds: ['org-1', 'org-2', 'org-3'], maximumOrganisations: 5, trancheSize: 1,
  cohortReadinessEvidence: ['org-1', 'org-2', 'org-3'].map(readiness), terminalCertification: { status: 'READY_FOR_L2', coverage: { otp: true, mandate: true } }, requiredNextPhases: [],
})
const certification = { ...certificatePayload, certificationDigest: digest(certificatePayload) }
const planPayload = buildLegalDocumentNextExpansionActivationPlan({ certification, plannedBy: 'activation-planner', planningReference: 'EXP-V1-1', plannedAt: '2026-07-20T10:09:00.000Z', evidenceAgeLimitMinutes: 15 })
const plan = { ...planPayload, planDigest: digest(planPayload) }
const currentU3 = { status: 'READY_FOR_V1', ready: true, certification }
const ready = assessLegalDocumentNextExpansionActivationPlan({ plan, currentU3, pending, continuation, activation, pilot, now, digest })
assert.equal(ready.ready, true)
assert.equal(plan.contract, LEGAL_DOCUMENT_V1_ACTIVATION_PLAN_CONTRACT)
assert.deepEqual(plan.activationTarget.organisationIds, ['org-1', 'org-2', 'org-3'])
const exposed = assessLegalDocumentNextExpansionActivationPlan({ plan, currentU3, pending, continuation, activation, pilot: { ...pilot, organisationIds: ['org-1', 'org-2', 'org-3'] }, now, digest })
assert.ok(exposed.blockers.some((row) => row.code === 'V1_EFFECTIVE_ALLOWLIST_CHANGED'))
const stale = assessLegalDocumentNextExpansionActivationPlan({ plan, currentU3, pending, continuation, activation, pilot, now: Date.parse('2026-07-20T10:24:00.000Z'), digest })
assert.ok(stale.blockers.some((row) => row.code === 'V1_PLAN_EXPIRED_OR_MISORDERED'))
const tampered = assessLegalDocumentNextExpansionActivationPlan({ plan: { ...plan, addedOrganisationId: 'org-4' }, currentU3, pending, continuation, activation, pilot, now, digest })
assert.ok(tampered.blockers.some((row) => row.code === 'V1_CERTIFIED_TARGET_MISMATCH'))
assert.ok(tampered.blockers.some((row) => row.code === 'V1_PLAN_DIGEST_INVALID'))
const drift = assessLegalDocumentNextExpansionActivationPlan({ plan, currentU3, pending, continuation, activation: { ...activation, activationDigest: 'sha256:other' }, pilot, now, digest })
assert.ok(drift.blockers.some((row) => row.code === 'V1_ACTIVATION_BINDING_INVALID'))
const missing = assessLegalDocumentNextExpansionActivationPlan({ plan: null, currentU3: {}, pending: null, continuation: null, activation: null, pilot, now, digest })
for (const code of ['V1_ACTIVATION_PLAN_MISSING', 'V1_U3_NOT_READY', 'V1_PENDING_CHANGESET_MISSING', 'V1_CONTINUATION_RECORD_MISSING', 'V1_ACTIVATION_RECORD_MISSING']) assert.ok(missing.blockers.some((row) => row.code === code), code)
const planner = fs.readFileSync('scripts/legal-document-phase-v1-plan-activation.mjs', 'utf8')
assert.match(planner, /LEGAL_DOCUMENT_PHASE_V1_WRITE/)
assert.match(planner, /legal-document-phase-u3-expanded-cohort-certification\.mjs/)
assert.match(planner, /effectiveAllowlistChanged: false/)
assert.match(planner, /runtimeActivationChanged: false/)
assert.match(planner, /row\?\.status === 'planned'/)
const verifier = fs.readFileSync('scripts/legal-document-phase-v1-verify-activation-plan.mjs', 'utf8')
assert.match(verifier, /mutatedData: false/)
assert.doesNotMatch(verifier, /writeFileSync|renameSync|\.from\(|\.insert\(|\.upsert\(|\.delete\(/)
const state = JSON.parse(fs.readFileSync('config/legal-document-next-expansion-activation-plan.json', 'utf8'))
assert.deepEqual(state, { version: 1, status: 'not_planned', plan: null, history: [] })
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-v1', 'plan:legal-documents:phase-v1', 'verify:legal-documents:phase-v1']) assert.ok(pkg.scripts?.[name])
console.log('Legal document V1 next-expansion activation plan passed.')
