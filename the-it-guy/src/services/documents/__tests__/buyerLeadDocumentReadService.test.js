import assert from 'node:assert/strict'
import test from 'node:test'
import { buildBuyerLeadDocumentReadModel, fetchBuyerLeadCanonicalDocumentRows } from '../buyerLeadDocumentReadService.js'

const id = '11111111-1111-4111-8111-111111111111'
const transactionId = '22222222-2222-4222-8222-222222222222'
const leadId = '33333333-3333-4333-8333-333333333333'
const sharedBuyer = {
  id: 'document-1', file_bucket: 'documents', file_path: 'organisations/file.pdf',
  document_type: 'buyer_id_document', source: 'agent_buyer_document_upload',
  visibility_scope: 'shared', is_client_visible: true, client_recipient_role: 'buyer',
  uploaded_by_party: 'buyer', status: 'uploaded',
}

test('canonical buyer file supersedes its staged lead mirror and remains unmatched', () => {
  const model = buildBuyerLeadDocumentReadModel({
    leadRows: [{ key: 'buyer_id_document', storageBucket: 'documents', storagePath: sharedBuyer.file_path }],
    canonicalRows: [sharedBuyer],
    hasTransaction: true,
  })
  assert.equal(model.uploads.length, 1)
  assert.equal(model.canonicalCount, 1)
  assert.equal(model.stagedCount, 0)
  assert.equal(model.uploads[0].statusLabel, 'Uploaded · awaiting matching')
})

test('portal-uploaded buyer files appear while seller files do not', () => {
  const model = buildBuyerLeadDocumentReadModel({ canonicalRows: [
    { ...sharedBuyer, id: 'portal', source: 'client_portal_atomic_upload' },
    { ...sharedBuyer, id: 'request', file_path: 'requested.pdf', source: 'client_portal_requested_document_upload' },
    { ...sharedBuyer, id: 'seller', file_path: 'seller.pdf', client_recipient_role: 'seller', uploaded_by_party: 'seller' },
  ], hasTransaction: true })
  assert.deepEqual(model.uploads.map((row) => row.id), ['portal', 'request'])
  assert.equal(model.unmatchedCount, 0)
})

test('agent read rejects a transaction belonging to another buyer lead', async () => {
  let documentsQueried = false
  const client = { from(table) {
    if (table === 'documents') documentsQueried = true
    const builder = {
      select() { return builder }, eq() { return builder },
      async maybeSingle() { return { data: { id: transactionId, organisation_id: id, originating_buyer_lead_id: 'different-lead' }, error: null } },
    }
    return builder
  } }
  await assert.rejects(fetchBuyerLeadCanonicalDocumentRows(client, { transactionId, organisationId: id, leadId }), /not linked/)
  assert.equal(documentsQueried, false)
})

test('agent read returns only buyer-visible files from the linked transaction', async () => {
  const rows = [sharedBuyer, { ...sharedBuyer, id: 'seller', file_path: 'seller.pdf', client_recipient_role: 'seller', uploaded_by_party: 'seller' }]
  const client = { from(table) {
    const builder = {
      select() { return builder }, eq() { return builder },
      async maybeSingle() { return { data: { id: transactionId, organisation_id: id, originating_buyer_lead_id: leadId }, error: null } },
      then(resolve) { return Promise.resolve({ data: table === 'documents' ? rows : [], error: null }).then(resolve) },
    }
    return builder
  } }
  const visible = await fetchBuyerLeadCanonicalDocumentRows(client, { transactionId, organisationId: id, leadId })
  assert.deepEqual(visible.map((row) => row.id), ['document-1'])
})
