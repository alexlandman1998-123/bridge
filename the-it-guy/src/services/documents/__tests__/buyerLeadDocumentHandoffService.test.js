import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildBuyerLeadDocumentReconciliationPlan,
  buyerLeadDocumentIdempotencyKey,
  promoteStagedBuyerLeadDocuments,
  reconcileStagedBuyerLeadDocuments,
} from '../buyerLeadDocumentHandoffService.js'

const organisationId = '11111111-1111-4111-8111-111111111111'
const leadId = '22222222-2222-4222-8222-222222222222'
const transactionId = '33333333-3333-4333-8333-333333333333'
const storagePath = `organisations/${organisationId}/buyer-leads/${leadId}/buyer_id_document/id.pdf`

function clientFor({ transactionLeadId = leadId, rows = [], existingDocuments = [], storageError = null } = {}) {
  const documents = [...existingDocuments]
  const lead = {
    lead_id: leadId,
    organisation_id: organisationId,
    raw_enquiry_payload: { agentUploadedBuyerDocuments: rows },
  }
  const client = {
    documents,
    storage: { from() { return { async info() { return storageError ? { data: null, error: storageError } : { data: { size: 12 }, error: null } } } } },
    from(table) {
      let filters = []
      let inserting = null
      const builder = {
        select() { return builder },
        eq(field, value) { filters.push([field, value]); return builder },
        insert(value) { inserting = value; return builder },
        async maybeSingle() {
          const source = table === 'transactions'
            ? [{ id: transactionId, organisation_id: organisationId, originating_lead_id: transactionLeadId }]
            : table === 'leads' ? [lead] : documents
          return { data: source.find((row) => filters.every(([key, value]) => row[key] === value)) || null, error: null }
        },
        async single() {
          if (table !== 'documents') throw new Error('Unexpected insert')
          const data = { id: `document-${documents.length + 1}`, ...inserting }
          documents.push(data)
          return { data, error: null }
        },
        then(resolve) {
          const source = table === 'documents' ? documents : []
          return Promise.resolve({ data: source.filter((row) => filters.every(([key, value]) => row[key] === value)), error: null }).then(resolve)
        },
      }
      return builder
    },
  }
  return client
}

test('promotes a staged buyer file once without completing a requirement', async () => {
  const staged = { key: 'buyer_id_document', storageBucket: 'documents', storagePath, uploadedFileName: 'id.pdf' }
  const client = clientFor({ rows: [staged, staged] })
  const options = { transactionId, organisationId, leadId }
  const first = await promoteStagedBuyerLeadDocuments(client, options)
  const second = await promoteStagedBuyerLeadDocuments(client, options)
  assert.equal(first.length, 1)
  assert.equal(second[0].deduplicated, true)
  assert.equal(client.documents.length, 1)
  assert.equal(client.documents[0].visibility_scope, 'shared')
  assert.equal(client.documents[0].client_recipient_role, 'buyer')
  assert.equal(client.documents[0].is_client_visible, true)
  assert.equal(client.documents[0].canonical_requirement_instance_id, undefined)
  assert.equal(client.documents[0].upload_idempotency_key, buyerLeadDocumentIdempotencyKey({ leadId, bucket: 'documents', path: storagePath }))
})

test('refuses a transaction linked to a different lead', async () => {
  const client = clientFor({ transactionLeadId: '44444444-4444-4444-8444-444444444444' })
  await assert.rejects(promoteStagedBuyerLeadDocuments(client, { transactionId, organisationId, leadId }), /does not belong/)
  assert.equal(client.documents.length, 0)
})

test('refuses a staged object outside the verified buyer lead path', async () => {
  const client = clientFor({ rows: [{ key: 'buyer_id_document', storageBucket: 'documents', storagePath: 'organisations/other/buyer-leads/other/id.pdf' }] })
  await assert.rejects(promoteStagedBuyerLeadDocuments(client, { transactionId, organisationId, leadId }), /invalid storage location/)
  assert.equal(client.documents.length, 0)
})

test('historical snake-case rows are planned and handed off exactly once', async () => {
  const staged = { document_type: 'buyer_id_document', storage_bucket: 'documents', storage_path: storagePath, fileName: 'old-id.pdf' }
  const client = clientFor({ rows: [] })
  client.from = ((original) => (table) => {
    const builder = original(table)
    if (table === 'leads') {
      builder.maybeSingle = async () => ({ data: {
        lead_id: leadId, organisation_id: organisationId,
        raw_enquiry_payload: { agent_uploaded_buyer_documents: [staged] },
      }, error: null })
    }
    return builder
  })(client.from)
  const context = { transactionId, organisationId, leadId }
  const dryRun = await reconcileStagedBuyerLeadDocuments(client, context)
  assert.equal(dryRun.summary.needsHandoff, 1)
  assert.equal(client.documents.length, 0)
  const applied = await reconcileStagedBuyerLeadDocuments(client, context, { dryRun: false })
  assert.equal(applied.handedOff, 1)
  assert.equal(applied.summary.alreadyCanonical, 1)
  assert.equal(client.documents.length, 1)
  assert.equal(client.documents[0].canonical_requirement_instance_id, undefined)
})

test('historical document already copied by path is not inserted again', async () => {
  const row = { key: 'buyer_id_document', storageBucket: 'documents', storagePath }
  const document = {
    id: 'existing', transaction_id: transactionId, file_bucket: 'documents', file_path: storagePath,
    source: 'agent_buyer_document_upload', visibility_scope: 'shared', is_client_visible: true,
    client_recipient_role: 'buyer', uploaded_by_party: 'buyer',
  }
  const client = clientFor({ rows: [row], existingDocuments: [document] })
  const plan = await reconcileStagedBuyerLeadDocuments(client, { transactionId, organisationId, leadId })
  assert.equal(plan.summary.alreadyCanonical, 1)
  assert.equal(plan.summary.needsHandoff, 0)
  const outcomes = await promoteStagedBuyerLeadDocuments(client, { transactionId, organisationId, leadId })
  assert.deepEqual(outcomes, [{ id: 'existing', deduplicated: true }])
  assert.equal(client.documents.length, 1)
})

test('ambiguous historical audience blocks the whole reconciliation before writing', async () => {
  const good = { key: 'buyer_id_document', storageBucket: 'documents', storagePath }
  const unsafe = { key: 'buyer_proof_of_address', storageBucket: 'documents', storagePath: `organisations/${organisationId}/buyer-leads/${leadId}/address.pdf` }
  const existing = {
    id: 'private', transaction_id: transactionId, file_bucket: 'documents', file_path: unsafe.storagePath,
    visibility_scope: 'internal', is_client_visible: false, client_recipient_role: 'seller', uploaded_by_party: 'seller',
  }
  const client = clientFor({ rows: [good, unsafe], existingDocuments: [existing] })
  const context = { transactionId, organisationId, leadId }
  const plan = await reconcileStagedBuyerLeadDocuments(client, context)
  assert.equal(plan.summary.manualReview, 1)
  await assert.rejects(reconcileStagedBuyerLeadDocuments(client, context, { dryRun: false }), /manual review/)
  assert.equal(client.documents.length, 1)
})

test('missing stored file blocks historical handoff before writing', async () => {
  const client = clientFor({ rows: [{ key: 'buyer_id_document', storageBucket: 'documents', storagePath }], storageError: new Error('not found') })
  await assert.rejects(reconcileStagedBuyerLeadDocuments(client, { transactionId, organisationId, leadId }, { dryRun: false }), /could not be verified/)
  assert.equal(client.documents.length, 0)
})

test('plan flags a lead mirror whose canonical document id is missing', () => {
  const plan = buildBuyerLeadDocumentReconciliationPlan({
    lead: { raw_enquiry_payload: { agentUploadedBuyerDocuments: [
      { key: 'buyer_id_document', storageBucket: 'documents', storagePath, canonicalDocumentId: 'missing' },
    ] } }, documents: [], organisationId, leadId, transactionId,
  })
  assert.equal(plan.rows[0].reason, 'missing_or_mismatched_canonical_document')
})

test('conflicting historical types for one stored file require manual review', () => {
  const plan = buildBuyerLeadDocumentReconciliationPlan({
    lead: { raw_enquiry_payload: { agentUploadedBuyerDocuments: [
      { key: 'buyer_id_document', storageBucket: 'documents', storagePath },
      { key: 'buyer_proof_of_address', storageBucket: 'documents', storagePath },
    ] } }, documents: [], organisationId, leadId, transactionId,
  })
  assert.equal(plan.summary.manualReview, 1)
  assert.equal(plan.rows[0].reason, 'conflicting_lead_metadata')
})
