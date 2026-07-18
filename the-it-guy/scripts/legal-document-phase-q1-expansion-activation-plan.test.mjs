import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { assessLegalDocumentExpansionActivationPlan, buildLegalDocumentExpansionActivationPlan, LEGAL_DOCUMENT_Q1_ACTIVATION_PLAN_CONTRACT } from '../src/core/documents/legalDocumentExpansionActivationPlan.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
const now = Date.parse('2026-07-18T10:00:00.000Z')
const certifiedAt = new Date(now - 60_000).toISOString()
const certificatePayload = { contract: 'legal-document-expanded-cohort-certification-p3-v1', status: 'certified', certifiedAt, sourcePendingDigest: 'sha256:pending', releaseTarget: { environment: 'production', projectRef: 'project-ref', organisationIds: ['org-1'] }, currentOrganisationIds: ['org-1'], addedOrganisationId: 'org-2', proposedOrganisationIds: ['org-1', 'org-2'], maximumOrganisations: 3, addedOrganisationEvidence: { organisationId: 'org-2', activeAgentCount: 1, templates: { otp: true, mandate: true }, preferredTransferAttorney: true }, terminalCertification: { status: 'READY_FOR_L2', coverage: { otp: true, mandate: true } }, requiredNextPhases: [] }
const certification = { ...certificatePayload, certificationDigest: digest(certificatePayload) }
const payload = buildLegalDocumentExpansionActivationPlan({ certification, plannedBy: 'release-owner', planningReference: 'CHG-1', plannedAt: new Date(now - 30_000).toISOString() })
const plan = { ...payload, planDigest: digest(payload) }
const p3 = { status: 'READY_FOR_FRESH_AUTHORITY', ready: true, certification }
const pending = { status: 'staged', pendingDigest: 'sha256:pending', currentOrganisationIds: ['org-1'], addedOrganisationId: 'org-2', proposedOrganisationIds: ['org-1', 'org-2'] }
const ready = assessLegalDocumentExpansionActivationPlan({ plan, currentP3: p3, pending, configuredOrganisationIds: ['org-1'], now, digest })
assert.equal(ready.ready, true)
assert.equal(plan.contract, LEGAL_DOCUMENT_Q1_ACTIVATION_PLAN_CONTRACT)
assert.deepEqual(plan.activationTarget.organisationIds, ['org-1', 'org-2'])

const exposed = assessLegalDocumentExpansionActivationPlan({ plan, currentP3: p3, pending, configuredOrganisationIds: ['org-1', 'org-2'], now, digest })
assert.ok(exposed.blockers.some((row) => row.code === 'Q1_EFFECTIVE_ALLOWLIST_CHANGED'))
const stale = assessLegalDocumentExpansionActivationPlan({ plan, currentP3: p3, pending, configuredOrganisationIds: ['org-1'], now: now + 16 * 60_000, digest })
assert.ok(stale.blockers.some((row) => row.code === 'Q1_PLAN_EXPIRED_OR_MISORDERED'))
const tampered = { ...plan, proposedOrganisationIds: ['org-1', 'org-3'] }
const invalid = assessLegalDocumentExpansionActivationPlan({ plan: tampered, currentP3: p3, pending, configuredOrganisationIds: ['org-1'], now, digest })
for (const code of ['Q1_CERTIFIED_TARGET_MISMATCH', 'Q1_PLAN_DIGEST_INVALID']) assert.ok(invalid.blockers.some((row) => row.code === code), code)

const planner = fs.readFileSync('scripts/legal-document-phase-q1-plan-activation.mjs', 'utf8')
assert.match(planner, /LEGAL_DOCUMENT_PHASE_Q1_WRITE/)
assert.match(planner, /legal-document-phase-p3-expanded-cohort-certification\.mjs/)
assert.match(planner, /effectiveAllowlistChanged: false/)
const verifier = fs.readFileSync('scripts/legal-document-phase-q1-verify-activation-plan.mjs', 'utf8')
assert.match(verifier, /mutatedData: false/)
assert.doesNotMatch(verifier, /writeFileSync|renameSync|\.from\(|\.insert\(|\.upsert\(|\.delete\(/)
const state = JSON.parse(fs.readFileSync('config/legal-document-expansion-activation-plan.json', 'utf8'))
assert.deepEqual(state, { version: 1, status: 'not_planned', plan: null, history: [] })
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-q1', 'plan:legal-documents:phase-q1', 'verify:legal-documents:phase-q1']) assert.ok(pkg.scripts?.[name])
console.log('Legal document Q1 expansion activation plan passed.')
