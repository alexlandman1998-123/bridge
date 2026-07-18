import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assessLegalDocumentNextExpansionProposal } from '../src/core/documents/legalDocumentNextExpansionProposal.js'

const t2 = { status: 'READY_FOR_T3', ready: true }
const record = { status: 'continued', recordDigest: 'sha256:t1', sourceActivationDigest: 'sha256:activation', releaseTarget: { organisationIds: ['org-1', 'org-2'] } }
const activation = { status: 'activated', activationDigest: 'sha256:activation', activatedOrganisationIds: ['org-1', 'org-2'] }
const pilot = { organisationIds: ['org-1', 'org-2'], limits: { maxOrganisations: 4 } }
const candidates = [{ organisationId: 'org-3', organisationName: 'Agency Three', status: 'READY', blockers: [] }, { organisationId: 'org-4', status: 'READY', blockers: [] }]
const ready = assessLegalDocumentNextExpansionProposal({ t2, record, activation, pilot, candidates, storeAvailable: true })
assert.equal(ready.ready, true)
assert.equal(ready.status, 'READY_FOR_T4')
assert.equal(ready.proposal.addedOrganisationId, 'org-3')
assert.deepEqual(ready.proposal.proposedOrganisationIds, ['org-1', 'org-2', 'org-3'])
assert.equal(ready.proposal.sourceContinuationDigest, 'sha256:t1')
assert.equal(ready.proposal.sourceActivationDigest, 'sha256:activation')
const upstream = assessLegalDocumentNextExpansionProposal({ t2: { status: 'NO_GO', ready: false }, record: null, activation: null, pilot, candidates: [] })
assert.equal(upstream.status, 'NO_GO')
for (const code of ['T3_T2_NOT_READY', 'T3_CONTINUATION_RECORD_MISSING', 'T3_ACTIVATION_RECORD_MISSING']) assert.ok(upstream.blockers.some((row) => row.code === code), code)
const waiting = assessLegalDocumentNextExpansionProposal({ t2, record, activation, pilot, candidates: [{ organisationId: 'org-3', status: 'NOT_READY', blockers: ['ACTIVE_AGENT_MISSING'] }] })
assert.equal(waiting.status, 'EXPANSION_WAITING')
assert.ok(waiting.blockers.some((row) => row.code === 'T3_NO_READY_EXPANSION_CANDIDATE'))
const drift = assessLegalDocumentNextExpansionProposal({ t2, record, activation: { ...activation, activatedOrganisationIds: ['other'] }, pilot, candidates })
assert.equal(drift.status, 'EXPANSION_BLOCKED')
assert.ok(drift.blockers.some((row) => row.code === 'T3_CURRENT_COHORT_DRIFT'))
const binding = assessLegalDocumentNextExpansionProposal({ t2, record, activation: { ...activation, activationDigest: 'other' }, pilot, candidates })
assert.ok(binding.blockers.some((row) => row.code === 'T3_ACTIVATION_BINDING_INVALID'))
const maximum = assessLegalDocumentNextExpansionProposal({ t2, record, activation, pilot: { ...pilot, limits: { maxOrganisations: 2 } }, candidates })
assert.equal(maximum.status, 'EXPANSION_BLOCKED')
const verifier = fs.readFileSync('scripts/legal-document-phase-t3-expansion-proposal.mjs', 'utf8')
assert.match(verifier, /legal-document-phase-t2-soak-gate\.mjs/)
for (const table of ['organisations', 'organisation_users', 'document_packet_templates', 'organisation_preferred_partners']) assert.match(verifier, new RegExp(table))
assert.match(verifier, /mutatedData: false/)
assert.doesNotMatch(verifier, /\.insert\(|\.upsert\(|\.delete\(/)
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-t3', 'verify:legal-documents:phase-t3']) assert.ok(pkg.scripts?.[name])
console.log('Legal document T3 next single-organisation expansion proposal passed.')
