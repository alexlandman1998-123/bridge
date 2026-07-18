import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assessLegalDocumentCohortExpansionProposal } from '../src/core/documents/legalDocumentCohortExpansionProposal.js'

const o2 = { status: 'READY_FOR_O3', ready: true }
const record = { status: 'continued', releaseTarget: { organisationIds: ['org-1'] } }
const pilot = { organisationIds: ['org-1'], limits: { maxOrganisations: 3 } }
const candidates = [{ organisationId: 'org-2', organisationName: 'Agency Two', status: 'READY', blockers: [] }, { organisationId: 'org-3', organisationName: 'Agency Three', status: 'READY', blockers: [] }]
const ready = assessLegalDocumentCohortExpansionProposal({ o2, record, pilot, candidates, storeAvailable: true })
assert.equal(ready.ready, true)
assert.equal(ready.status, 'READY_FOR_P1')
assert.equal(ready.proposal.addedOrganisationId, 'org-2')
assert.deepEqual(ready.proposal.proposedOrganisationIds, ['org-1', 'org-2'])
assert.equal(ready.proposal.trancheSize, 1)
assert.equal(ready.proposal.requiresFreshAuthority, true)

const upstream = assessLegalDocumentCohortExpansionProposal({ o2: { status: 'NO_GO', ready: false }, record: null, pilot, candidates: [] })
assert.equal(upstream.status, 'NO_GO')
for (const code of ['O3_O2_NOT_READY', 'O3_CONTINUATION_RECORD_MISSING']) assert.ok(upstream.blockers.some((row) => row.code === code), code)
const waiting = assessLegalDocumentCohortExpansionProposal({ o2, record, pilot, candidates: [{ organisationId: 'org-2', status: 'NOT_READY', blockers: ['ACTIVE_AGENT_MISSING'] }] })
assert.equal(waiting.status, 'EXPANSION_WAITING')
assert.ok(waiting.blockers.some((row) => row.code === 'O3_NO_READY_EXPANSION_CANDIDATE'))
const drift = assessLegalDocumentCohortExpansionProposal({ o2, record, pilot: { ...pilot, organisationIds: ['other'] }, candidates })
assert.equal(drift.status, 'EXPANSION_BLOCKED')
assert.ok(drift.blockers.some((row) => row.code === 'O3_CURRENT_COHORT_DRIFT'))
const maximum = assessLegalDocumentCohortExpansionProposal({ o2, record, pilot: { ...pilot, limits: { maxOrganisations: 1 } }, candidates })
assert.equal(maximum.status, 'EXPANSION_BLOCKED')

const verifier = fs.readFileSync('scripts/legal-document-phase-o3-expansion-proposal.mjs', 'utf8')
assert.match(verifier, /legal-document-phase-o2-soak-gate\.mjs/)
for (const table of ['organisations', 'organisation_users', 'document_packet_templates', 'organisation_preferred_partners']) assert.match(verifier, new RegExp(table))
assert.match(verifier, /mutatedData: false/)
assert.doesNotMatch(verifier, /\.insert\(|\.upsert\(|\.delete\(/)
assert.match(fs.readFileSync('src/core/documents/legalDocumentCohortExpansionProposal.js', 'utf8'), /trancheSize: 1/)
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-o3', 'verify:legal-documents:phase-o3']) assert.ok(pkg.scripts?.[name])
console.log('Legal document O3 single-organisation expansion proposal passed.')
