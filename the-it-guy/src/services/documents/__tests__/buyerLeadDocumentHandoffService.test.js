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

function clientFor({ transactionLeadId = leadId, rows = [], existingDocuments = [], storageError = null, linkResult = { ok: true } } = {}) {
  const documents = [...existingDocuments]
  const lead = {
    lead_id: leadId,
    organisation_id: organisationId,
    raw_enquiry_payload: { agentUploadedBuyerDocuments: rows },
  }
  const client = {
    documents,
    lead,
    linkCalls: [],
    async rpc(name, args) {
      assert.equal(name, 'bridge_link_document_to_canonical_requirement_by_key')
      client.linkCalls.push(args)
      const document = documents.find(row => row.id === args.p_document_id)
      if (linkResult.ok) {
        document.canonical_requirement_instance_id = 'exact-request'
        document.status = 'under_review'
      }
      return { data: linkResult, error: null }
    },
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

test('an OTP saved before transaction creation joins the shared transaction room and exact checklist once', async () => {
  const otp = { key: 'uploaded_otp', source: 'agent_otp_upload', storageBucket: 'documents', storagePath: `buyer-otp-documents/${organisationId}/${leadId}/uploaded_otp/signed.pdf`, fileName: 'signed.pdf' }
  const client = clientFor()
  client.lead.raw_enquiry_payload = { buyerOtpDocument: otp, buyerOtpDocuments: [otp] }
  const context = { transactionId, organisationId, leadId }
  const before = await reconcileStagedBuyerLeadDocuments(client, context)
  assert.equal(before.summary.needsHandoff, 1)
  assert.equal(client.documents.length, 0)
  assert.equal(client.linkCalls.length, 0)
  await promoteStagedBuyerLeadDocuments(client, context)
  await promoteStagedBuyerLeadDocuments(client, context)
  assert.equal(client.documents.length, 1)
  assert.equal(client.documents[0].file_path, otp.storagePath)
  assert.equal(client.documents[0].document_type, 'signed_otp')
  assert.equal(client.documents[0].source, 'agent_otp_upload')
  assert.equal(client.documents[0].client_recipient_role, null, 'shared OTP must remain available to both client parties')
  assert.equal(client.documents[0].is_client_visible, true)
  assert.equal(client.documents[0].status, 'under_review', 'upload must not approve the agreement')
  assert.equal(client.linkCalls[0].p_document_key, 'signed_otp')
  assert.equal((await reconcileStagedBuyerLeadDocuments(client, context)).summary.alreadyCanonical, 1)
})

test('recognises historical snake-case OTP references and existing shared OTP documents without making copies', async () => {
  const otp = { document_type: 'uploaded_otp', source: 'agent_otp_upload', storage_bucket: 'documents', storage_path: `buyer-otp-documents/${organisationId}/${leadId}/uploaded_otp/signed.pdf` }
  const saved = { id: 'existing-otp', transaction_id: transactionId, file_path: otp.storage_path, file_bucket: 'documents', source: 'agent_otp_upload', document_type: 'uploaded_otp', visibility_scope: 'shared', is_client_visible: true, client_recipient_role: null, uploaded_by_party: 'buyer' }
  const client = clientFor({ existingDocuments: [saved] })
  client.lead.raw_enquiry_payload = JSON.stringify({ buyer_otp_documents: [otp] })
  await promoteStagedBuyerLeadDocuments(client, { transactionId, organisationId, leadId })
  assert.equal(client.documents.length, 1)
  assert.equal(client.linkCalls[0].p_document_id, saved.id)
})

test('does not broaden an OTP with a conflicting audience or accept another lead storage path', async () => {
  const otp = { key: 'uploaded_otp', source: 'agent_otp_upload', storageBucket: 'documents', storagePath: `buyer-otp-documents/${organisationId}/${leadId}/uploaded_otp/signed.pdf` }
  const client = clientFor({ existingDocuments: [{ id: 'private-otp', transaction_id: transactionId, file_bucket: 'documents', file_path: otp.storagePath, source: 'agent_otp_upload', document_type: 'uploaded_otp', visibility_scope: 'internal', is_client_visible: false, uploaded_by_party: 'buyer' }] })
  client.lead.raw_enquiry_payload = { buyerOtpDocuments: [otp] }
  await assert.rejects(promoteStagedBuyerLeadDocuments(client, { transactionId, organisationId, leadId }), /manual audience review/)
  client.lead.raw_enquiry_payload = { buyerOtpDocuments: [{ ...otp, storagePath: `buyer-otp-documents/${organisationId}/another-lead/uploaded_otp/signed.pdf` }] }
  await assert.rejects(promoteStagedBuyerLeadDocuments(client, { transactionId, organisationId, leadId }), /invalid storage location/)
  assert.equal(client.documents.length, 1)
  assert.equal(client.linkCalls.length, 0)
})

test('surfaces an ambiguous OTP checklist instead of reporting a completed handoff', async () => {
  const otp = { key: 'uploaded_otp', source: 'agent_otp_upload', storageBucket: 'documents', storagePath: `buyer-otp-documents/${organisationId}/${leadId}/uploaded_otp/signed.pdf` }
  const client = clientFor({ linkResult: { ok: false, reason: 'ambiguous_requirement' } })
  client.lead.raw_enquiry_payload = { buyerOtpDocument: otp }
  await assert.rejects(promoteStagedBuyerLeadDocuments(client, { transactionId, organisationId, leadId }), /signed OTP checklist requirement needs review/)
  assert.equal(client.documents.length, 1, 'the saved file stays available for review and retry')
  assert.equal(client.documents[0].status, 'uploaded')
})

test('carries historical OTP versions without replacing the current reviewed checklist evidence', async () => {
  const otp = name => ({ key: 'uploaded_otp', source: 'agent_otp_upload', storageBucket: 'documents', storagePath: `buyer-otp-documents/${organisationId}/${leadId}/uploaded_otp/${name}.pdf` })
  const older = otp('older'), current = otp('current')
  const saved = { id: 'current-document', transaction_id: transactionId, file_bucket: 'documents', file_path: current.storagePath, source: 'agent_otp_upload', document_type: 'uploaded_otp', visibility_scope: 'shared', is_client_visible: true, client_recipient_role: null, uploaded_by_party: 'buyer', canonical_requirement_instance_id: 'exact-request', status: 'approved' }
  const client = clientFor({ existingDocuments: [saved] })
  client.lead.raw_enquiry_payload = { buyerOtpDocument: current, buyerOtpDocuments: [older, current] }
  await promoteStagedBuyerLeadDocuments(client, { transactionId, organisationId, leadId })
  assert.equal(client.documents.length, 2)
  assert.deepEqual(client.linkCalls.map(call => call.p_document_id), ['current-document'])
  assert.equal(client.documents.find(row => row.file_path === older.storagePath).canonical_requirement_instance_id, undefined)
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


test('direct conversion handoff refuses missing bytes before inserting a document mirror', async () => {
  const client = clientFor({ rows: [{ key: 'buyer_id_document', storageBucket: 'documents', storagePath }], storageError: new Error('Object not found') })
  await assert.rejects(promoteStagedBuyerLeadDocuments(client, { transactionId, organisationId, leadId }), /could not be verified in storage/)
  assert.equal(client.documents.length, 0)
})

test('direct conversion preflights every file so a missing later object cannot produce a partial handoff', async () => {
  const client = clientFor({ rows: [
    { key: 'buyer_id_document', storageBucket: 'documents', storagePath },
    { key: 'buyer_proof_of_address', storageBucket: 'documents', storagePath: storagePath.replace('id.pdf', 'address.pdf') },
  ] })
  client.storage.from = () => ({ info: async path => path.endsWith('address.pdf') ? { error: new Error('Missing') } : { data: { size: 12 } } })
  await assert.rejects(promoteStagedBuyerLeadDocuments(client, { transactionId, organisationId, leadId }), /No files were handed off/)
  assert.equal(client.documents.length, 0)
})

test('direct conversion validates a canonical mirror before handing off any other lead files', async () => {
  const foreignId = '55555555-5555-4555-8555-555555555555'
  const client = clientFor({ rows: [
    { key: 'buyer_id_document', storageBucket: 'documents', storagePath },
    { key: 'buyer_proof_of_address', canonicalDocumentId: foreignId, storageBucket: 'documents', storagePath: `${storagePath}.address` },
  ], existingDocuments: [{ id: foreignId, transaction_id: '66666666-6666-4666-8666-666666666666' }] })
  await assert.rejects(promoteStagedBuyerLeadDocuments(client, { transactionId, organisationId, leadId }), /canonical|linked.*document|manual review/i)
  assert.equal(client.documents.length, 1, 'The first staged file must not be inserted before validating the second file.')
})

test('verified canonical transaction files are reconciled without requiring a former lead folder', async () => {
  const id = '55555555-5555-4555-8555-555555555555'
  const path = `client-portal/${transactionId}/identity.pdf`
  const document = { id, transaction_id: transactionId, file_bucket: 'documents', file_path: path,
    is_client_visible: true, visibility_scope: 'shared', client_recipient_role: 'buyer', uploaded_by_party: 'buyer' }
  const client = clientFor({ rows: [{ key: 'buyer_id_document', canonicalDocumentId: id, storageBucket: 'documents', storagePath: path }], existingDocuments: [document] })
  const context = { transactionId, organisationId, leadId }
  assert.equal((await reconcileStagedBuyerLeadDocuments(client, context)).summary.alreadyCanonical, 1)
  assert.deepEqual(await promoteStagedBuyerLeadDocuments(client, context), [{ id, deduplicated: true }])
  assert.equal(client.documents.length, 1)
})

test('a canonical mirror cannot bypass audience or Storage verification', async () => {
  const id = '55555555-5555-4555-8555-555555555555'
  const row = { key: 'buyer_id_document', canonicalDocumentId: id, storageBucket: 'documents', storagePath }
  const document = { id, transaction_id: transactionId, file_bucket: 'documents', file_path: storagePath,
    is_client_visible: true, visibility_scope: 'shared', client_recipient_role: 'buyer', uploaded_by_party: 'buyer' }
  const context = { transactionId, organisationId, leadId }
  await assert.rejects(promoteStagedBuyerLeadDocuments(clientFor({ rows: [row], existingDocuments: [{ ...document, client_recipient_role: 'seller' }] }), context), /manual review/)
  await assert.rejects(promoteStagedBuyerLeadDocuments(clientFor({ rows: [row], existingDocuments: [document], storageError: new Error('denied') }), context), /could not be verified/)
})

test('new typed agent files link to one exact request awaiting review and retry without another file', async () => {
  const staged = { key: 'buyer_id_document', requirementKey: 'buyer_id_document', source: 'agent_buyer_document_upload', storageBucket: 'documents', storagePath }
  const client = clientFor({ rows: [staged] })
  const context = { transactionId, organisationId, leadId }
  await promoteStagedBuyerLeadDocuments(client, context)
  await promoteStagedBuyerLeadDocuments(client, context)
  assert.equal(client.documents.length, 1)
  assert.equal(client.documents[0].canonical_requirement_instance_id, 'exact-request')
  assert.equal(client.documents[0].status, 'under_review')
  assert.equal(client.linkCalls.length, 2)
  assert(client.linkCalls.every(call => call.p_document_key === 'buyer_id_document' && call.p_transaction_id === transactionId))
})

test('ambiguous request identity leaves the typed file available but unmatched', async () => {
  const staged = { key: 'buyer_id_document', requirementKey: 'buyer_id_document', source: 'agent_buyer_document_upload', storageBucket: 'documents', storagePath }
  const client = clientFor({ rows: [staged], linkResult: { ok: false, reason: 'ambiguous_requirement' } })
  await promoteStagedBuyerLeadDocuments(client, { transactionId, organisationId, leadId })
  assert.equal(client.documents.length, 1)
  assert.equal(client.documents[0].canonical_requirement_instance_id, undefined)
  assert.equal(client.documents[0].status, 'uploaded')
})
