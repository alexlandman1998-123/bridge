import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  buildAttorneyDocumentControl,
  CONVEYANCING_DOCUMENT_SHORTCUTS,
  getConveyancingDocumentPurpose,
  normalizeConveyancingDocumentStatus,
} from '../src/core/transactions/attorneyDocumentControl.js'

assert.deepEqual(
  CONVEYANCING_DOCUMENT_SHORTCUTS.map((item) => item.key),
  ['rates_clearance', 'levy_clearance', 'transfer_duty', 'guarantee'],
  'common conveyancing documents should have one-click request and upload presets',
)
assert.equal(getConveyancingDocumentPurpose({ displayName: 'Municipal rates clearance certificate' }), 'clearances')
assert.equal(getConveyancingDocumentPurpose({ displayName: 'Purchase price guarantee' }), 'finance_guarantees')
assert.equal(getConveyancingDocumentPurpose({ displayName: 'Buyer proof of address' }), 'client_compliance')
assert.equal(getConveyancingDocumentPurpose({ displayName: 'Deeds office lodgement cover' }), 'lodgement_registration')
assert.equal(normalizeConveyancingDocumentStatus('uploaded', true), 'pending_review')
assert.equal(normalizeConveyancingDocumentStatus('approved', true), 'verified')
assert.equal(normalizeConveyancingDocumentStatus('reupload_required', true), 'rejected')

const control = buildAttorneyDocumentControl({
  requiredDocumentRows: [
    {
      id: 'rates',
      displayName: 'Rates clearance certificate',
      status: 'missing',
      statusLabel: 'Missing',
      requiredParty: 'Municipality',
      blocksStage: true,
      requirement: { key: 'rates_clearance_certificate' },
    },
    {
      id: 'fica',
      displayName: 'Seller identity document',
      status: 'approved',
      fileUrl: '/seller-id.pdf',
      requiredParty: 'Seller',
      requirement: { key: 'seller_id_document' },
    },
  ],
  additionalRequests: [
    { id: 'guarantee', title: 'Purchase price guarantee', requestedFrom: 'bond_originator', status: 'requested', priority: 'urgent' },
  ],
})

assert.equal(control.rows.length, 3)
assert.equal(control.blockerCount, 2)
assert.equal(control.counts.missing, 1)
assert.equal(control.counts.requested, 1)
assert.equal(control.counts.verified, 1)
assert.equal(control.groups.find((group) => group.key === 'clearances')?.items[0].displayName, 'Rates clearance certificate')
assert.equal(control.attentionRows[0].blocksStage, true)

const source = await readFile(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
for (const expected of [
  'function AttorneyDocumentControl',
  'Common conveyancing documents',
  'Matter document register',
  'Show detailed register',
  'openConveyancingDocumentRequest',
  'openConveyancingDocumentUpload',
  "showDetailedDocumentRegister || isAgentTransactionView || workspaceRole === 'bond_originator'",
]) {
  assert.ok(source.includes(expected), `Phase 3 document control should include: ${expected}`)
}
assert.ok(!source.includes('aria-label={`More actions for ${row.displayName}`}'), 'document register must not retain an inert more-actions control')

console.log('Attorney document control Phase 3 checks passed.')
