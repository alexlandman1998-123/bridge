import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { assessLegalDocumentExpansionApproval, buildLegalDocumentExpansionApprovalPayload, LEGAL_DOCUMENT_P1_EXPANSION_APPROVAL_CONTRACT } from '../src/core/documents/legalDocumentExpansionApproval.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
const continuation = { status: 'continued', recordDigest: 'sha256:continuation', releaseTarget: { environment: 'production', projectRef: 'project-ref', organisationIds: ['org-1'] } }
const o3 = { status: 'READY_FOR_P1', ready: true, checkedAt: '2026-07-20T10:00:00.000Z', proposal: { currentOrganisationIds: ['org-1'], addedOrganisationId: 'org-2', proposedOrganisationIds: ['org-1', 'org-2'], maximumOrganisations: 5, trancheSize: 1, requiredNextPhases: ['A2', 'L1', 'M1'] }, candidateAssessments: [{ organisationId: 'org-2', organisationName: 'Agency Two', activeAgentCount: 2, status: 'READY', blockers: [] }] }
const payload = buildLegalDocumentExpansionApprovalPayload({ o3, continuation, approvedBy: 'release-owner', approvalReference: 'EXP-1', approvedAt: '2026-07-20T10:05:00.000Z' })
const approval = { ...payload, approvalDigest: digest(payload) }
assert.equal(approval.contract, LEGAL_DOCUMENT_P1_EXPANSION_APPROVAL_CONTRACT)
assert.equal(assessLegalDocumentExpansionApproval({ approval, continuation, configuredOrganisationIds: ['org-1'], digest }).ready, true)
assert.ok(assessLegalDocumentExpansionApproval({ approval: { ...approval, approvedBy: 'edited' }, continuation, configuredOrganisationIds: ['org-1'], digest }).blockers.some((row) => row.code === 'P1_APPROVAL_DIGEST_INVALID'))
assert.ok(assessLegalDocumentExpansionApproval({ approval, continuation: { ...continuation, recordDigest: 'other' }, configuredOrganisationIds: ['org-1'], digest }).blockers.some((row) => row.code === 'P1_CONTINUATION_BINDING_INVALID'))
assert.ok(assessLegalDocumentExpansionApproval({ approval: { ...approval, proposedOrganisationIds: ['org-1', 'org-2', 'org-3'] }, continuation, configuredOrganisationIds: ['org-1'], digest }).blockers.some((row) => row.code === 'P1_TRANCHE_INVALID'))
assert.ok(assessLegalDocumentExpansionApproval({ approval: null, continuation: null, configuredOrganisationIds: [], digest }).blockers.some((row) => row.code === 'P1_EXPANSION_NOT_APPROVED'))

const approver = fs.readFileSync('scripts/legal-document-phase-p1-approve-expansion.mjs', 'utf8')
assert.match(approver, /legal-document-phase-o3-expansion-proposal\.mjs/)
assert.match(approver, /LEGAL_DOCUMENT_PHASE_P1_WRITE/)
assert.match(approver, /P1_PROPOSAL_ALREADY_APPROVED/)
const verifier = fs.readFileSync('scripts/legal-document-phase-p1-verify-expansion.mjs', 'utf8')
assert.match(verifier, /mutatedData: false/)
assert.doesNotMatch(verifier, /\.insert\(|\.upsert\(|\.delete\(/)
const state = JSON.parse(fs.readFileSync('config/legal-document-expansion-approval.json', 'utf8'))
assert.equal(state.status, 'not_approved')
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-p1', 'approve:legal-documents:phase-p1', 'verify:legal-documents:phase-p1']) assert.ok(pkg.scripts?.[name])
console.log('Legal document P1 accountable expansion approval passed.')
