import assert from 'node:assert/strict'
import test from 'node:test'
import { buildImportedDealRecoveryPlan } from '../importedDealRecoveryPlan.js'

const record = (id, filename) => ({ transaction: {
  id, organisation_id: 'org', transaction_reference: `PR-OTP-IMP-R${id}`,
  comment: `Internal import draft from batch.xlsx row ${id}. Source PDF: ${filename}. Workbook status: Ready.`,
  buyer_id: 'captured', sale_date: null, stage: 'Available',
}, buyerProfile: { id: 'captured', name: 'Captured' }, documents: [], buyerParties: [] })
const file = (name, path = `/sources/${name}`) => ({ name, path, sha256: 'hash', size: 100 })
const plan = (records, sourceFiles) => buildImportedDealRecoveryPlan({ snapshot: { organisationId: 'org', records }, sourceFiles })

test('exact and download-copy matches stay unverified and preserve historical values', () => {
  const records = [record('2', 'source.pdf'), record('3', 'other.pdf')]
  const before = structuredClone(records)
  const result = plan(records, [file('source.pdf'), file('other (1).pdf')])
  assert.deepEqual(records, before)
  assert.equal(result.automaticWritesAllowed, false)
  assert.equal(result.counts.localSourceCandidates, 2)
  assert.equal(result.rows[0].sourceRecovery.status, 'exact_filename_candidate')
  assert.equal(result.rows[1].sourceRecovery.status, 'download_copy_candidate')
  assert.equal(result.rows[0].sourceRecovery.requiresContentVerification, true)
  assert.equal(result.rows[0].buyerRecovery.automaticMatchAllowed, false)
  assert.equal(result.rows[0].saleDate, null)
})

test('generic files shared across imports and duplicate local names remain ambiguous', () => {
  const shared = plan([record('2', 'Offer to Purchase.pdf'), record('3', 'Offer to Purchase (1).pdf')], [file('Offer to Purchase.pdf')])
  assert.equal(shared.counts.ambiguousSourceMatches, 2)
  assert.equal(shared.counts.localSourceCandidates, 0)
  const duplicate = plan([record('2', 'specific.pdf')], [file('specific.pdf', '/a/specific.pdf'), file('specific.pdf', '/b/specific.pdf')])
  assert.equal(duplicate.rows[0].sourceRecovery.status, 'ambiguous')
})

test('linked document metadata does not prove an available stored PDF', () => {
  const input = record('2', 'source.pdf')
  input.documents = [{ id: 'doc', file_name: 'source.pdf', available: false }]
  assert.equal(plan([input], []).rows[0].sourceRecovery.status, 'not_found')
  assert.equal(plan([input], []).counts.missingAvailableSourceDocuments, 1)
  input.documents[0].available = true
  const result = plan([input], [])
  assert.equal(result.rows[0].sourceRecovery.status, 'linked_source_requires_review')
  assert.deepEqual(result.rows[0].sourceRecovery.availableDocumentIds, ['doc'])
})

test('uncertain import provenance stays outside automatic recovery and cross-organisation input fails', () => {
  const input = record('2', 'source.pdf')
  input.transaction.comment = ''
  const result = plan([input], [file('source.pdf')])
  assert.equal(result.counts.candidatesRequiringScopeConfirmation, 1)
  assert.equal(result.rows[0].scopeConfirmed, false)
  assert.equal(result.rows[0].sourceRecovery.status, 'not_found')
  input.transaction.organisation_id = 'other'
  assert.throws(() => plan([input], []), /selected organisation/)
})
