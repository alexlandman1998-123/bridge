import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { assessLegalDocumentNextExpansionApproval, buildLegalDocumentNextExpansionApproval, LEGAL_DOCUMENT_U1_APPROVAL_CONTRACT } from '../src/core/documents/legalDocumentNextExpansionApproval.js'
import { buildLegalDocumentNextExpansionHandoff } from '../src/core/documents/legalDocumentNextExpansionHandoff.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
const continuation = { status: 'continued', recordDigest: 'sha256:t1', sourceActivationDigest: 'sha256:q2', releaseTarget: { environment: 'production', projectRef: 'project-ref', organisationIds: ['org-1', 'org-2'] } }
const activation = { status: 'activated', activationDigest: 'sha256:q2', activationTarget: { environment: 'production', projectRef: 'project-ref', organisationIds: ['org-1', 'org-2'] }, activatedOrganisationIds: ['org-1', 'org-2'] }
const pilot = {
  enabled: true, environment: 'production', organisationIds: ['org-1', 'org-2'],
  releasePreparation: { organisationIds: ['org-1', 'org-2'] },
  activation: { status: 'active', targetProjectRef: 'project-ref', activatedOrganisationIds: ['org-1', 'org-2'] },
  limits: { maxOrganisations: 5 }, cohortPreparation: { minimumActiveAgents: 1 },
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
assert.equal(approval.contract, LEGAL_DOCUMENT_U1_APPROVAL_CONTRACT)
assert.equal(assessLegalDocumentNextExpansionApproval({ approval, continuation, activation, pilot, digest }).ready, true)
const edited = assessLegalDocumentNextExpansionApproval({ approval: { ...approval, approvedBy: 'edited' }, continuation, activation, pilot, digest })
assert.ok(edited.blockers.some((row) => row.code === 'U1_APPROVAL_DIGEST_INVALID'))
const wrongActivation = assessLegalDocumentNextExpansionApproval({ approval, continuation, activation: { ...activation, activationDigest: 'sha256:other' }, pilot, digest })
assert.ok(wrongActivation.blockers.some((row) => row.code === 'U1_ACTIVATION_BINDING_INVALID'))
const inactive = assessLegalDocumentNextExpansionApproval({ approval, continuation, activation, pilot: { ...pilot, enabled: false }, digest })
assert.ok(inactive.blockers.some((row) => row.code === 'U1_CURRENT_ROLLOUT_NOT_ACTIVE'))
const latePayload = buildLegalDocumentNextExpansionApproval({ handoff, approvedBy: 'rollout-owner', approvalReference: 'EXP-U1-LATE', approvedAt: handoff.expiresAt })
const late = { ...latePayload, approvalDigest: digest(latePayload) }
assert.ok(assessLegalDocumentNextExpansionApproval({ approval: late, continuation, activation, pilot, digest }).blockers.some((row) => row.code === 'U1_APPROVAL_TIME_INVALID'))
const missing = assessLegalDocumentNextExpansionApproval({ approval: null, continuation: null, activation: null, pilot, digest })
for (const code of ['U1_EXPANSION_NOT_APPROVED', 'U1_CONTINUATION_RECORD_MISSING', 'U1_ACTIVATION_RECORD_MISSING']) assert.ok(missing.blockers.some((row) => row.code === code), code)
const approver = fs.readFileSync('scripts/legal-document-phase-u1-approve-expansion.mjs', 'utf8')
assert.match(approver, /legal-document-phase-t4-expansion-handoff\.mjs/)
assert.match(approver, /LEGAL_DOCUMENT_PHASE_U1_WRITE/)
assert.match(approver, /U1_PROPOSAL_ALREADY_APPROVED/)
assert.match(approver, /proposalIdentityComplete/)
assert.match(approver, /row\?\.status === 'approved'/)
const verifier = fs.readFileSync('scripts/legal-document-phase-u1-verify-expansion.mjs', 'utf8')
assert.match(verifier, /mutatedData: false/)
assert.doesNotMatch(verifier, /\.insert\(|\.upsert\(|\.delete\(|writeFileSync/)
const state = JSON.parse(fs.readFileSync('config/legal-document-next-expansion-approval.json', 'utf8'))
assert.equal(state.status, 'not_approved')
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-u1', 'approve:legal-documents:phase-u1', 'verify:legal-documents:phase-u1']) assert.ok(pkg.scripts?.[name])
console.log('Legal document U1 accountable next-expansion approval passed.')
