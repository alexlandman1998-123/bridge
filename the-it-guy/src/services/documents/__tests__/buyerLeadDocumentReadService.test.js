import assert from 'node:assert/strict'
import test from 'node:test'
import { buyerLeadDocumentContext, buildBuyerLeadDocumentReadModel, fetchBuyerLeadCanonicalDocumentRows, assertBuyerLeadTransactionDocumentContext, mergeBuyerLeadFicaChecklistRows } from '../buyerLeadDocumentReadService.js'
import { BUYER_LEAD_DOCUMENT_TYPES } from '../../../core/documents/buyerLeadDocumentContract.js'

const ficaGroup = (role, id = role) => ({ role, items: [
  ['id_or_passport', 'ID / Passport'], ['proof_of_address', 'Proof of Residential Address'],
  ['tax_number_confirmation', 'Tax Number / SARS Confirmation'], ['source_of_funds', 'Source of Funds Evidence'],
].map(([kind, label]) => ({ key: `buyer_fica_${id}_${kind}`, ficaDocumentKind: kind, label, status: 'In review' })) })

test('primary buyer checklist shows ID and address once and keeps declaration, tax and source of funds', () => {
  const configured = BUYER_LEAD_DOCUMENT_TYPES.map(row => ({ ...row, status: 'missing' }))
  const group = ficaGroup('primary_purchaser')
  const rows = mergeBuyerLeadFicaChecklistRows(configured, [group])
  assert.equal(rows.length, configured.length + 2)
  assert.deepEqual(rows.slice(configured.length).map(row => row.ficaDocumentKind), ['tax_number_confirmation', 'source_of_funds'])
  assert.equal(rows.find(row => row.key === 'buyer_id_document').status, 'missing', 'onboarding submission alone is not uploaded evidence')
  assert(rows.some(row => row.key === 'buyer_fica_declaration'))
  const uploaded = { ...configured[0], status: 'under_review', storagePath: 'buyer-id.pdf', canonicalRequirementInstanceId: 'exact-id' }
  assert.equal(mergeBuyerLeadFicaChecklistRows([uploaded, ...configured.slice(1)], [group])[0], uploaded)
})

test('co-buyers, spouses, directors and trustees retain their separate identity and address slots', () => {
  const groups = ['primary_purchaser', 'co_purchaser', 'spouse_purchaser', 'authorised_director', 'authorised_trustee'].map(role => ficaGroup(role))
  const rows = mergeBuyerLeadFicaChecklistRows(BUYER_LEAD_DOCUMENT_TYPES, groups)
  for (const group of groups.slice(1)) {
    for (const row of group.items) assert(rows.includes(row))
  }
  assert.equal(rows.length, BUYER_LEAD_DOCUMENT_TYPES.length + 2 + 4 * 4)
})

test('FICA prompts remain when no corresponding configured slot exists; labels never establish identity', () => {
  const group = ficaGroup('primary_purchaser')
  assert.deepEqual(mergeBuyerLeadFicaChecklistRows([], [group]), group.items)
  const custom = { key: 'additional_identity', label: 'ID / Passport' }
  const rows = mergeBuyerLeadFicaChecklistRows([custom], [group])
  assert.equal(rows.length, 5)
  assert.equal(rows[0], custom)
  assert.deepEqual(mergeBuyerLeadFicaChecklistRows(BUYER_LEAD_DOCUMENT_TYPES, []), BUYER_LEAD_DOCUMENT_TYPES)
})

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

test('developer-uploaded buyer files remain visible in the shared buyer lead read model', () => {
  const model = buildBuyerLeadDocumentReadModel({ canonicalRows: [{ ...sharedBuyer, source: 'developer_buyer_document_upload' }], hasTransaction: true })
  assert.equal(model.canonicalCount, 1)
  assert.equal(model.uploads[0].status, 'uploaded_unmatched')
  const linked = buildBuyerLeadDocumentReadModel({ canonicalRows: [{ ...sharedBuyer, source: 'developer_buyer_document_upload', canonical_requirement_instance_id: 'exact-buyer-id' }], hasTransaction: true })
  assert.equal(linked.uploads[0].status, 'under_review')
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

test('shared custom uploads use current requirement review state and suppress removed or superseded staged mirrors', () => {
  const current = { ...sharedBuyer, id: 'new', file_path: 'new.pdf', source: 'document_requirement_command', visibility_scope: 'client_visible', document_type: 'custom_slot', canonical_requirement_instance_id: 'slot', requirement_label: 'Divorce papers', requirement_status: 'under_review', review_status: 'approved', is_current_evidence: true }
  const previous = { ...current, id: 'old', file_path: 'old.pdf', is_current_evidence: false }
  const snapshot = { requirements: [{ id: 'slot' }], documents: [current, previous] }
  const model = buildBuyerLeadDocumentReadModel({ leadRows: [{ storageBucket: 'documents', storagePath: 'old.pdf' }], snapshot })
  assert.equal(model.uploads.length, 1)
  assert.equal(model.uploads[0].label, 'Divorce papers')
  assert.equal(model.uploads[0].status, 'under_review')
  assert.equal(buildBuyerLeadDocumentReadModel({ snapshot: { ...snapshot, documents: [{ ...current, applicability_override: 'removed' }] } }).uploads.length, 0)
})


test('onboarding files retain their buyer audience and actual Storage bucket in the lead read model', () => {
  const model = buildBuyerLeadDocumentReadModel({ canonicalRows: [{ ...sharedBuyer,
    source: 'buyer_onboarding_upload', file_bucket: 'private-documents', canonical_requirement_instance_id: 'buyer-id',
  }] })
  assert.equal(model.canonicalCount, 1)
  assert.equal(model.uploads[0].storageBucket, 'private-documents')
  assert.equal(model.uploads[0].status, 'under_review')
  assert.equal(buildBuyerLeadDocumentReadModel({ canonicalRows: [{ ...sharedBuyer, source: 'buyer_onboarding_upload', is_client_visible: false }] }).uploads.length, 0)
})


test('converted buyer lead reads and uploads in the same document room as its portal and transaction', () => {
  assert.deepEqual(buyerLeadDocumentContext({ leadId, transactionId }), { contextType: 'transaction', contextId: transactionId })
  assert.deepEqual(buyerLeadDocumentContext({ leadId }), { contextType: 'buyer_lead', contextId: leadId })
})


test('signed OTP files saved by the agent remain visible awaiting review in the buyer document room', () => {
  const otp = { ...sharedBuyer, id: 'signed-otp', source: 'agent_otp_upload', document_type: 'uploaded_otp', client_recipient_role: null, canonical_requirement_instance_id: 'exact-signed-otp' }
  const model = buildBuyerLeadDocumentReadModel({ canonicalRows: [otp], hasTransaction: true })
  assert.equal(model.canonicalCount, 1)
  assert.equal(model.uploads[0].key, 'uploaded_otp')
  assert.equal(model.uploads[0].status, 'under_review')
  assert.equal(buildBuyerLeadDocumentReadModel({ canonicalRows: [{ ...otp, is_client_visible: false }] }).uploads.length, 0)
})


test('shared command uploads with the legacy client buyer role remain visible without exposing sellers', () => {
  const client = { ...sharedBuyer, id: 'client-upload', source: 'document_requirement_command', client_recipient_role: 'client', uploaded_by_party: 'client' }
  assert.deepEqual(buildBuyerLeadDocumentReadModel({ canonicalRows: [client] }).uploads.map(row => row.id), ['client-upload'])
  assert.deepEqual(buildBuyerLeadDocumentReadModel({ canonicalRows: [{ ...client, client_recipient_role: 'seller' }] }).uploads, [])
})


test('shared reads and mutations reject a lead pointer with no verified reverse buyer origin', async () => {
  let documentReads = 0
  const client = { from(table) { if (table === 'documents') documentReads++; return { select() { return this }, eq() { return this }, maybeSingle: async () => ({ data: { id: 'tx', organisation_id: 'org', originating_lead_id: null, originating_buyer_lead_id: null } }) } } }
  await assert.rejects(assertBuyerLeadTransactionDocumentContext(client, { transactionId: 'tx', organisationId: 'org', leadId: 'buyer' }), /not linked/)
  await assert.rejects(fetchBuyerLeadCanonicalDocumentRows(client, { transactionId: 'tx', organisationId: 'org', leadId: 'buyer' }), /not linked/)
  assert.equal(documentReads, 0)
})
