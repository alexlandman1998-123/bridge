import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { buildLegalDocumentNextExpansionApproval } from '../src/core/documents/legalDocumentNextExpansionApproval.js'
import { buildLegalDocumentNextExpansionHandoff } from '../src/core/documents/legalDocumentNextExpansionHandoff.js'
import { assessLegalDocumentNextPendingExpansion, buildLegalDocumentNextPendingExpansion, LEGAL_DOCUMENT_U2_PENDING_EXPANSION_CONTRACT } from '../src/core/documents/legalDocumentNextPendingExpansion.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
const continuation = { status: 'continued', recordDigest: 'sha256:t1', sourceActivationDigest: 'sha256:q2', releaseTarget: { environment: 'production', projectRef: 'project-ref', organisationIds: ['org-1', 'org-2'] } }
const activation = { status: 'activated', activationDigest: 'sha256:q2', activationTarget: { environment: 'production', projectRef: 'project-ref', organisationIds: ['org-1', 'org-2'] }, activatedOrganisationIds: ['org-1', 'org-2'] }
const pilot = {
  enabled: true, environment: 'production', organisationIds: ['org-1', 'org-2'],
  releasePreparation: { organisationIds: ['org-1', 'org-2'] },
  activation: { status: 'active', targetProjectRef: 'project-ref', activatedOrganisationIds: ['org-1', 'org-2'] },
  limits: { maxOrganisations: 5 },
}
const t3 = {
  status: 'READY_FOR_T4', ready: true, checkedAt: '2026-07-20T10:05:00.000Z',
  proposal: { sourceContinuationDigest: 'sha256:t1', sourceActivationDigest: 'sha256:q2', currentOrganisationIds: ['org-1', 'org-2'], addedOrganisationId: 'org-3', proposedOrganisationIds: ['org-1', 'org-2', 'org-3'], maximumOrganisations: 5, trancheSize: 1 },
  candidateAssessments: [{ organisationId: 'org-3', organisationName: 'Agency Three', activeAgentCount: 2, status: 'READY', blockers: [] }],
}
const handoffPayload = buildLegalDocumentNextExpansionHandoff({ t3, continuation, activation, handedOffAt: '2026-07-20T10:06:00.000Z', evidenceAgeLimitMinutes: 15 })
const handoff = { ...handoffPayload, handoffDigest: digest(handoffPayload) }
const approvalPayload = buildLegalDocumentNextExpansionApproval({ handoff, approvedBy: 'rollout-owner', approvalReference: 'EXP-U1-1', approvedAt: '2026-07-20T10:07:00.000Z' })
const approval = { ...approvalPayload, approvalDigest: digest(approvalPayload) }
const pendingPayload = buildLegalDocumentNextPendingExpansion({ approval, stagedBy: 'staging-owner', stagingReference: 'EXP-U2-1', stagedAt: '2026-07-20T10:08:00.000Z' })
const pending = { ...pendingPayload, pendingDigest: digest(pendingPayload) }
assert.equal(pending.contract, LEGAL_DOCUMENT_U2_PENDING_EXPANSION_CONTRACT)
assert.equal(assessLegalDocumentNextPendingExpansion({ pending, approval, continuation, activation, pilot, digest }).ready, true)
const edited = assessLegalDocumentNextPendingExpansion({ pending: { ...pending, stagedBy: 'edited' }, approval, continuation, activation, pilot, digest })
assert.ok(edited.blockers.some((row) => row.code === 'U2_PENDING_DIGEST_INVALID'))
const wrongApproval = assessLegalDocumentNextPendingExpansion({ pending, approval: { ...approval, approvalDigest: 'sha256:other' }, continuation, activation, pilot, digest })
assert.ok(wrongApproval.blockers.some((row) => row.code === 'U2_APPROVAL_BINDING_INVALID'))
assert.ok(wrongApproval.blockers.some((row) => row.code === 'U2_SOURCE_APPROVAL_DIGEST_INVALID'))
const exposedEarly = assessLegalDocumentNextPendingExpansion({ pending, approval, continuation, activation, pilot: { ...pilot, organisationIds: ['org-1', 'org-2', 'org-3'] }, digest })
assert.ok(exposedEarly.blockers.some((row) => row.code === 'U2_CURRENT_ALLOWLIST_CHANGED'))
const targetDrift = assessLegalDocumentNextPendingExpansion({ pending, approval, continuation, activation: { ...activation, activationTarget: { ...activation.activationTarget, projectRef: 'other' } }, pilot, digest })
assert.ok(targetDrift.blockers.some((row) => row.code === 'U2_RELEASE_TARGET_DRIFT'))
const missing = assessLegalDocumentNextPendingExpansion({ pending: null, approval: null, continuation: null, activation: null, pilot, digest })
for (const code of ['U2_EXPANSION_NOT_STAGED', 'U2_SOURCE_APPROVAL_MISSING', 'U2_CONTINUATION_RECORD_MISSING', 'U2_ACTIVATION_RECORD_MISSING']) assert.ok(missing.blockers.some((row) => row.code === code), code)
const stager = fs.readFileSync('scripts/legal-document-phase-u2-stage-expansion.mjs', 'utf8')
assert.match(stager, /legal-document-phase-u1-verify-expansion\.mjs/)
assert.match(stager, /LEGAL_DOCUMENT_PHASE_U2_WRITE/)
assert.match(stager, /effectiveAllowlistChanged: false/)
assert.match(stager, /runtimeActivationChanged: false/)
assert.match(stager, /row\?\.status === 'staged'/)
const verifier = fs.readFileSync('scripts/legal-document-phase-u2-verify-expansion.mjs', 'utf8')
assert.match(verifier, /mutatedData: false/)
assert.doesNotMatch(verifier, /\.insert\(|\.upsert\(|\.delete\(|writeFileSync/)
const state = JSON.parse(fs.readFileSync('config/legal-document-next-pending-expansion.json', 'utf8'))
assert.equal(state.status, 'not_staged')
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-u2', 'stage:legal-documents:phase-u2', 'verify:legal-documents:phase-u2']) assert.ok(pkg.scripts?.[name])
console.log('Legal document U2 pending next-expansion staging passed.')
