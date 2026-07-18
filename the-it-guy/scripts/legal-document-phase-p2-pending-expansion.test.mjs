import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { assessLegalDocumentPendingExpansion, buildLegalDocumentPendingExpansionPayload, LEGAL_DOCUMENT_P2_PENDING_EXPANSION_CONTRACT } from '../src/core/documents/legalDocumentPendingExpansion.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
const approval = { status: 'approved', approvalDigest: 'sha256:approval', approvedAt: '2026-07-20T10:00:00.000Z', releaseTarget: { environment: 'production', projectRef: 'project-ref', organisationIds: ['org-1'] }, currentOrganisationIds: ['org-1'], addedOrganisationId: 'org-2', proposedOrganisationIds: ['org-1', 'org-2'], maximumOrganisations: 5 }
const payload = buildLegalDocumentPendingExpansionPayload({ approval, stagedBy: 'release-owner', stagingReference: 'STAGE-1', stagedAt: '2026-07-20T10:05:00.000Z' })
const pending = { ...payload, pendingDigest: digest(payload) }
assert.equal(pending.contract, LEGAL_DOCUMENT_P2_PENDING_EXPANSION_CONTRACT)
assert.equal(assessLegalDocumentPendingExpansion({ pending, approval, configuredOrganisationIds: ['org-1'], digest }).ready, true)
assert.ok(assessLegalDocumentPendingExpansion({ pending: { ...pending, stagedBy: 'edited' }, approval, configuredOrganisationIds: ['org-1'], digest }).blockers.some((row) => row.code === 'P2_PENDING_DIGEST_INVALID'))
assert.ok(assessLegalDocumentPendingExpansion({ pending, approval: { ...approval, approvalDigest: 'other' }, configuredOrganisationIds: ['org-1'], digest }).blockers.some((row) => row.code === 'P2_APPROVAL_BINDING_INVALID'))
assert.ok(assessLegalDocumentPendingExpansion({ pending, approval, configuredOrganisationIds: ['org-1', 'org-2'], digest }).blockers.some((row) => row.code === 'P2_CURRENT_ALLOWLIST_CHANGED'))
assert.ok(assessLegalDocumentPendingExpansion({ pending: null, approval: null, configuredOrganisationIds: [], digest }).blockers.some((row) => row.code === 'P2_EXPANSION_NOT_STAGED'))

const stager = fs.readFileSync('scripts/legal-document-phase-p2-stage-expansion.mjs', 'utf8')
assert.match(stager, /legal-document-phase-p1-verify-expansion\.mjs/)
assert.match(stager, /LEGAL_DOCUMENT_PHASE_P2_WRITE/)
assert.match(stager, /effectiveAllowlistChanged: false/)
const verifier = fs.readFileSync('scripts/legal-document-phase-p2-verify-expansion.mjs', 'utf8')
assert.match(verifier, /mutatedData: false/)
assert.doesNotMatch(verifier, /\.insert\(|\.upsert\(|\.delete\(/)
const state = JSON.parse(fs.readFileSync('config/legal-document-pending-expansion.json', 'utf8'))
assert.equal(state.status, 'not_staged')
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-p2', 'stage:legal-documents:phase-p2', 'verify:legal-documents:phase-p2']) assert.ok(pkg.scripts?.[name])
console.log('Legal document P2 pending expansion staging passed.')
