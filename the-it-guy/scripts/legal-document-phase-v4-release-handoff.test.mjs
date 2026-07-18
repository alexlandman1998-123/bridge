import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { LEGAL_DOCUMENT_V2_ACTIVATION_CONTRACT } from '../src/core/documents/legalDocumentNextExpandedCohortActivation.js'
import { LEGAL_DOCUMENT_V3_VERIFICATION_CONTRACT } from '../src/core/documents/legalDocumentNextExpandedCohortActivationVerification.js'
import { assessLegalDocumentNextReleaseHandoff, buildLegalDocumentNextReleaseHandoff, LEGAL_DOCUMENT_V4_HANDOFF_CONTRACT } from '../src/core/documents/legalDocumentNextReleaseHandoff.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
const now = Date.parse('2026-07-20T10:10:00.000Z')
const chain = { sourcePlanDigest: 'sha256:v1', sourceCertificationDigest: 'sha256:u3', sourcePendingDigest: 'sha256:u2', sourceApprovalDigest: 'sha256:u1', sourceHandoffDigest: 'sha256:t4', sourceContinuationDigest: 'sha256:t1', sourcePreviousActivationDigest: 'sha256:q2' }
const activationPayload = canonicalLegalDocumentReleaseValue({
  contract: LEGAL_DOCUMENT_V2_ACTIVATION_CONTRACT, status: 'activated', activatedAt: '2026-07-20T10:05:00.000Z', activatedBy: 'operator', activationReference: 'EXP-V2-1', ...chain,
  activationTarget: { environment: 'production', projectRef: 'project-ref', organisationIds: ['org-1', 'org-2', 'org-3'] }, previousOrganisationIds: ['org-1', 'org-2'], addedOrganisationId: 'org-3', activatedOrganisationIds: ['org-1', 'org-2', 'org-3'], requiredNextPhases: [],
})
const activation = { ...activationPayload, activationDigest: digest(activationPayload) }
const readiness = (organisationId) => ({ organisationId, organisationName: `Agency ${organisationId}`, activeAgentCount: 2, templates: { otp: true, mandate: true }, preferredTransferAttorney: true })
const verificationPayload = canonicalLegalDocumentReleaseValue({
  contract: LEGAL_DOCUMENT_V3_VERIFICATION_CONTRACT, status: 'verified', verifiedAt: '2026-07-20T10:07:00.000Z', sourceActivationDigest: activation.activationDigest, ...chain,
  activationTarget: activation.activationTarget, previousOrganisationIds: ['org-1', 'org-2'], addedOrganisationId: 'org-3', activatedOrganisationIds: ['org-1', 'org-2', 'org-3'],
  runtimeAssurance: { a3Status: 'HEALTHY', secretDigestsVerified: true, releaseStatus: 'GO' }, cohortReadinessEvidence: ['org-1', 'org-2', 'org-3'].map(readiness), requiredNextPhases: [],
})
const verification = { ...verificationPayload, verificationDigest: digest(verificationPayload) }
const v3 = { status: 'READY_FOR_V4', ready: true, verification }
const pilot = {
  enabled: true, environment: 'production', organisationIds: ['org-1', 'org-2', 'org-3'], releasePreparation: { organisationIds: ['org-1', 'org-2', 'org-3'] },
  activation: { status: 'active', targetProjectRef: 'project-ref', activatedOrganisationIds: ['org-1', 'org-2', 'org-3'], nextExpansionActivationDigest: activation.activationDigest }, cohortPreparation: { minimumActiveAgents: 1 },
}
const handoffPayload = buildLegalDocumentNextReleaseHandoff({ v3, activation, handedOffAt: '2026-07-20T10:08:00.000Z', evidenceAgeLimitMinutes: 15 })
const handoff = { ...handoffPayload, handoffDigest: digest(handoffPayload) }
const ready = assessLegalDocumentNextReleaseHandoff({ v3, handoff, activation, pilot, now, digest })
assert.equal(ready.ready, true)
assert.equal(ready.status, 'READY_FOR_W1')
assert.equal(handoff.contract, LEGAL_DOCUMENT_V4_HANDOFF_CONTRACT)
assert.equal(handoff.sourceVerificationDigest, verification.verificationDigest)
assert.deepEqual(handoff.organisationIds, ['org-1', 'org-2', 'org-3'])
const stale = assessLegalDocumentNextReleaseHandoff({ v3, handoff, activation, pilot, now: Date.parse('2026-07-20T10:23:00.000Z'), digest })
assert.ok(stale.blockers.some((row) => row.code === 'V4_HANDOFF_EXPIRED_OR_MISORDERED'))
const receiptDrift = assessLegalDocumentNextReleaseHandoff({ v3, handoff, activation, pilot: { ...pilot, activation: { ...pilot.activation, nextExpansionActivationDigest: 'sha256:other' } }, now, digest })
assert.ok(receiptDrift.blockers.some((row) => row.code === 'V4_REPOSITORY_RECEIPT_BINDING_INVALID'))
const tampered = assessLegalDocumentNextReleaseHandoff({ v3, handoff: { ...handoff, addedOrganisationId: 'org-4' }, activation, pilot, now, digest })
assert.ok(tampered.blockers.some((row) => row.code === 'V4_TRANCHE_BINDING_INVALID'))
assert.ok(tampered.blockers.some((row) => row.code === 'V4_HANDOFF_DIGEST_INVALID'))
const missing = assessLegalDocumentNextReleaseHandoff({ v3: {}, handoff: null, activation: null, pilot, now, digest })
for (const code of ['V4_V3_NOT_READY', 'V4_ACTIVATION_RECORD_MISSING', 'V4_HANDOFF_MISSING']) assert.ok(missing.blockers.some((row) => row.code === code), code)
const verifier = fs.readFileSync('scripts/legal-document-phase-v4-release-handoff.mjs', 'utf8')
assert.match(verifier, /legal-document-phase-v3-verify-activation\.mjs/)
assert.match(verifier, /LEGAL_DOCUMENT_PHASE_V4_MAX_VERIFICATION_AGE_MINUTES/)
assert.match(verifier, /mutatedData: false/)
assert.doesNotMatch(verifier, /writeFileSync|renameSync|\.from\(|\.insert\(|\.upsert\(|\.delete\(/)
const v3Verifier = fs.readFileSync('scripts/legal-document-phase-v3-verify-activation.mjs', 'utf8')
assert.match(v3Verifier, /READY_FOR_V4/)
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-v4', 'verify:legal-documents:phase-v4']) assert.ok(pkg.scripts?.[name])
console.log('Legal document V4 post-activation integrity handoff passed.')
