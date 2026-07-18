import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { assessLegalDocumentNextExpansionHandoff, buildLegalDocumentNextExpansionHandoff, LEGAL_DOCUMENT_T4_HANDOFF_CONTRACT } from '../src/core/documents/legalDocumentNextExpansionHandoff.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
const now = Date.parse('2026-07-20T10:10:00.000Z')
const continuation = { status: 'continued', recordDigest: 'sha256:t1', sourceActivationDigest: 'sha256:q2', releaseTarget: { environment: 'production', projectRef: 'project-ref', organisationIds: ['org-1', 'org-2'] } }
const activation = { status: 'activated', activationDigest: 'sha256:q2', activationTarget: { environment: 'production', projectRef: 'project-ref', organisationIds: ['org-1', 'org-2'] }, activatedOrganisationIds: ['org-1', 'org-2'] }
const pilot = { organisationIds: ['org-1', 'org-2'], limits: { maxOrganisations: 5 }, cohortPreparation: { minimumActiveAgents: 1 } }
const t3 = {
  status: 'READY_FOR_T4', ready: true, checkedAt: '2026-07-20T10:05:00.000Z',
  proposal: { sourceContinuationDigest: 'sha256:t1', sourceActivationDigest: 'sha256:q2', currentOrganisationIds: ['org-1', 'org-2'], addedOrganisationId: 'org-3', proposedOrganisationIds: ['org-1', 'org-2', 'org-3'], maximumOrganisations: 5, trancheSize: 1 },
  candidateAssessments: [{ organisationId: 'org-3', organisationName: 'Agency Three', activeAgentCount: 2, status: 'READY', blockers: [] }],
}
const payload = buildLegalDocumentNextExpansionHandoff({ t3, continuation, activation, handedOffAt: '2026-07-20T10:06:00.000Z', evidenceAgeLimitMinutes: 15 })
const handoff = { ...payload, handoffDigest: digest(payload) }
const ready = assessLegalDocumentNextExpansionHandoff({ t3, handoff, continuation, activation, pilot, now, digest })
assert.equal(handoff.contract, LEGAL_DOCUMENT_T4_HANDOFF_CONTRACT)
assert.equal(ready.ready, true)
assert.equal(ready.status, 'READY_FOR_U1')
assert.equal(handoff.addedOrganisationId, 'org-3')
assert.deepEqual(handoff.proposedOrganisationIds, ['org-1', 'org-2', 'org-3'])
const stale = assessLegalDocumentNextExpansionHandoff({ t3, handoff, continuation, activation, pilot, now: Date.parse('2026-07-20T10:21:00.000Z'), digest })
assert.ok(stale.blockers.some((row) => row.code === 'T4_HANDOFF_EXPIRED_OR_MISORDERED'))
const drift = assessLegalDocumentNextExpansionHandoff({ t3, handoff, continuation, activation: { ...activation, activatedOrganisationIds: ['org-1'] }, pilot, now, digest })
assert.ok(drift.blockers.some((row) => row.code === 'T4_CURRENT_COHORT_DRIFT'))
const targetDrift = assessLegalDocumentNextExpansionHandoff({ t3, handoff, continuation, activation: { ...activation, activationTarget: { ...activation.activationTarget, projectRef: 'other' } }, pilot, now, digest })
assert.ok(targetDrift.blockers.some((row) => row.code === 'T4_RELEASE_TARGET_DRIFT'))
const tampered = assessLegalDocumentNextExpansionHandoff({ t3, handoff: { ...handoff, addedOrganisationId: 'org-4' }, continuation, activation, pilot, now, digest })
assert.ok(tampered.blockers.some((row) => row.code === 'T4_HANDOFF_DIGEST_INVALID'))
assert.ok(tampered.blockers.some((row) => row.code === 'T4_CURRENT_PROPOSAL_DRIFT'))
const missing = assessLegalDocumentNextExpansionHandoff({ t3: {}, handoff: null, continuation: null, activation: null, pilot, now, digest })
for (const code of ['T4_T3_NOT_READY', 'T4_CONTINUATION_RECORD_MISSING', 'T4_ACTIVATION_RECORD_MISSING', 'T4_HANDOFF_MISSING']) assert.ok(missing.blockers.some((row) => row.code === code), code)
const verifier = fs.readFileSync('scripts/legal-document-phase-t4-expansion-handoff.mjs', 'utf8')
assert.match(verifier, /legal-document-phase-t3-expansion-proposal\.mjs/)
assert.match(verifier, /LEGAL_DOCUMENT_PHASE_T4_MAX_PROPOSAL_AGE_MINUTES/)
assert.match(verifier, /mutatedData: false/)
assert.doesNotMatch(verifier, /\.insert\(|\.upsert\(|\.delete\(|writeFileSync/)
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-t4', 'verify:legal-documents:phase-t4']) assert.ok(pkg.scripts?.[name])
console.log('Legal document T4 next-expansion integrity handoff passed.')
