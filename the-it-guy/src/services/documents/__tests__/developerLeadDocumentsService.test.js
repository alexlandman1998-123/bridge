// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { fetchDeveloperLeadDocuments, uploadDeveloperLeadDocument, createDeveloperLeadDocumentSignedUrl } from '../developerLeadDocumentsService.js'

const mocks = vi.hoisted(() => ({ from: vi.fn(), workspace: vi.fn(), upload: vi.fn(), invalidate: vi.fn(), sign: vi.fn(), lead: null, onboarding: null, detail: null }))
vi.mock('../../../lib/supabaseClient.js', () => ({ isSupabaseConfigured: true, supabase: { from: mocks.from } }))
vi.mock('../../../lib/transactionWorkspaceApi.js', () => ({ fetchTransactionDocumentsWorkspace: mocks.workspace, uploadDocument: mocks.upload, invalidateTransactionWorkspaceCoreCache: mocks.invalidate, createTransactionDocumentSignedUrl: mocks.sign }))
const context = { developerOrgId: 'org-one', developerLeadId: 'lead-one' }
const file = () => new File(['persisted buyer evidence'], 'Buyer ID.pdf', { type: 'application/pdf' })
const requirement = (id = 'req-one', status = 'pending') => ({ id, status, document_definition_key: 'buyer_id_document', pack_key: 'buyer_identity_fica', requested_from_role: 'buyer', visible_to_roles: ['developer', 'buyer'], uploadable_by_roles: ['developer', 'buyer'], document_definitions: { key: 'buyer_id_document', display_label: 'Buyer ID' } })
beforeEach(() => {
  vi.resetAllMocks()
  mocks.lead = { developer_lead_id: 'lead-one', developer_org_id: 'org-one', lead_owner: 'developer', ownership_model: 'developer_direct', converted_transaction_id: 'tx-one' }
  mocks.onboarding = { transaction_id: 'tx-one', status: 'submitted', submitted_at: '2026-10-07T09:00:00Z' }
  mocks.detail = { transaction: { id: 'tx-one', onboarding_status: 'awaiting_signed_otp' }, documents: [], canonicalDocumentProjection: { transactionId: 'tx-one', requirements: [requirement()], documents: [] } }
  mocks.from.mockImplementation((table) => {
    const query = { select: vi.fn(() => query), eq: vi.fn(() => query), order: vi.fn(() => query), limit: vi.fn(() => query), maybeSingle: vi.fn(async () => ({ data: table === 'developer_leads' ? mocks.lead : table === 'transactions' ? mocks.detail.transaction : mocks.onboarding, error: null })) }
    return query
  })
  mocks.workspace.mockImplementation(async () => structuredClone(mocks.detail))
  mocks.invalidate.mockResolvedValue(undefined)
  mocks.upload.mockImplementation(async (payload) => {
    const document = { id: 'saved-one', transaction_id: payload.transactionId, name: payload.file.name, file_path: 'transaction-tx-one/saved.pdf', file_bucket: 'documents', document_type: payload.documentType, canonical_requirement_instance_id: payload.canonicalRequirementInstanceId, source: payload.source, status: 'uploaded', is_client_visible: payload.isClientVisible, visibility_scope: payload.visibilityScope, client_recipient_role: payload.clientRecipientRole, uploaded_by_party: payload.uploadedByParty, url: 'https://storage.example.test/saved.pdf' }
    mocks.detail.documents.push(document)
    return document
  })
})

it('waits for onboarding without querying a transaction when the lead has no linked context', async () => {
  mocks.lead.converted_transaction_id = null
  expect(await fetchDeveloperLeadDocuments(context)).toMatchObject({ state: 'awaiting_onboarding', documents: [], requirements: [] })
  expect(mocks.workspace).not.toHaveBeenCalled()
  const query = mocks.from.mock.results[0].value
  expect(query.eq.mock.calls).toEqual([['developer_org_id', 'org-one'], ['developer_lead_id', 'lead-one']])
})

it('does not mistake seeded onboarding answers or a manually advanced lead status for submission', async () => {
  mocks.lead.lead_status = 'onboarding_submitted'
  mocks.onboarding = { transaction_id: 'tx-one', status: 'sent', submitted_at: null }
  mocks.detail.transaction.onboarding_status = 'pending'
  mocks.detail.onboardingFormData = { id: 'seed-one', formData: { buyer_full_name: 'Saved Buyer' }, submittedAt: '2026-10-07' }
  expect(await fetchDeveloperLeadDocuments(context)).toMatchObject({ state: 'awaiting_onboarding', transactionId: 'tx-one', documents: [] })
  expect(mocks.workspace).not.toHaveBeenCalled()
  await expect(uploadDeveloperLeadDocument({ ...context, transactionId: 'tx-one', file: file() })).rejects.toThrow('Awaiting onboarding')
  expect(mocks.upload).not.toHaveBeenCalled()
})

it('retains submitted imported contexts and excludes seller documents from the buyer workspace', async () => {
  mocks.onboarding = null
  mocks.detail.canonicalDocumentProjection.requirements.push({ ...requirement('seller-one'), requested_from_role: 'seller', document_definition_key: 'seller_id_document' })
  mocks.detail.documents.push({ id: 'seller-file', client_recipient_role: 'seller', uploaded_by_party: 'seller', is_client_visible: true, visibility_scope: 'shared' })
  const model = await fetchDeveloperLeadDocuments(context)
  expect(model.state).toBe('ready')
  expect(model.requirements.map((row) => row.id)).toEqual(['req-one'])
  expect(model.documents).toEqual([])
})

it('persists one exact requirement link in the shared transaction store and reads it again after reopening', async () => {
  const selected = file()
  const changed = vi.fn()
  window.addEventListener('itg:transaction-updated', changed)
  try {
    const document = await uploadDeveloperLeadDocument({ ...context, transactionId: 'tx-one', requirementId: 'req-one', file: selected })
    expect(mocks.upload).toHaveBeenCalledWith(expect.objectContaining({ transactionId: 'tx-one', file: selected, canonicalRequirementInstanceId: 'req-one', requiredDocumentKey: 'buyer_id_document', inferCanonicalRequirement: true, visibilityScope: 'shared', isClientVisible: true, clientRecipientRole: 'buyer', uploadedByParty: 'buyer', source: 'developer_buyer_document_upload' }))
    expect(changed.mock.calls[0][0].detail.transactionId).toBe('tx-one')
    expect(mocks.invalidate).toHaveBeenCalledWith('tx-one')
    const reopened = await fetchDeveloperLeadDocuments(context)
    expect(reopened.documents[0].id).toBe(document.id)
    expect(reopened.requirements[0].status).toBe('under_review')
    expect(mocks.detail.canonicalDocumentProjection.requirements[0].status).toBe('pending')
  } finally { window.removeEventListener('itg:transaction-updated', changed) }
})

it('stores additional files without guessing a requirement or approving a document named Signed OTP', async () => {
  await uploadDeveloperLeadDocument({ ...context, transactionId: 'tx-one', file: file() })
  expect(mocks.upload).toHaveBeenCalledWith(expect.objectContaining({ canonicalRequirementInstanceId: null, requiredDocumentKey: null, inferCanonicalRequirement: false }))
  mocks.detail.documents.push({ id: 'signed', name: 'Signed OTP.pdf', canonical_requirement_instance_id: 'req-one', status: 'uploaded' })
  expect((await fetchDeveloperLeadDocuments(context)).requirements[0].status).toBe('under_review')
})

it('rechecks agency handover and the organisation before opening or uploading private documents', async () => {
  mocks.lead.lead_owner = 'agency'; mocks.lead.ownership_model = 'agency_introduced'; mocks.lead.visibility_state = 'limited'; mocks.lead.source_agency_org_id = 'other-agency'
  expect((await fetchDeveloperLeadDocuments(context)).state).toBe('protected')
  expect(mocks.workspace).not.toHaveBeenCalled()
  await expect(uploadDeveloperLeadDocument({ ...context, transactionId: 'tx-one', file: file() })).rejects.toThrow('handover')
  mocks.lead.developer_org_id = 'other-org'
  await expect(fetchDeveloperLeadDocuments(context)).rejects.toMatchObject({ code: 'lead_documents_access_denied' })
  expect(mocks.upload).not.toHaveBeenCalled()
})

it('rejects a changed transaction link and closed, hidden or stale requirement targets before uploading', async () => {
  await expect(uploadDeveloperLeadDocument({ ...context, transactionId: 'old-tx', requirementId: 'req-one', file: file() })).rejects.toThrow('linked transaction changed')
  for (const status of ['approved', 'completed', 'waived', 'not_applicable']) {
    mocks.detail.canonicalDocumentProjection.requirements[0].status = status
    await expect(uploadDeveloperLeadDocument({ ...context, transactionId: 'tx-one', requirementId: 'req-one', file: file() })).rejects.toThrow('no longer available')
  }
  mocks.detail.canonicalDocumentProjection.requirements[0].visible_to_roles = ['buyer']
  await expect(uploadDeveloperLeadDocument({ ...context, transactionId: 'tx-one', requirementId: 'req-one', file: file() })).rejects.toThrow('no longer available')
  expect(mocks.upload).not.toHaveBeenCalled()
})

it('blocks correction requests and rejects unsupported files without any upload', async () => {
  mocks.onboarding.status = 'correction_requested'
  expect((await fetchDeveloperLeadDocuments(context)).state).toBe('awaiting_onboarding')
  mocks.from.mockClear()
  await expect(uploadDeveloperLeadDocument({ ...context, transactionId: 'tx-one', file: new File(['bad'], 'file.exe') })).rejects.toThrow('Unsupported file type')
  expect(mocks.from).not.toHaveBeenCalled()
  expect(mocks.upload).not.toHaveBeenCalled()
})

it('reports unavailable document projections instead of an empty successful checklist', async () => {
  mocks.detail.canonicalDocumentProjection = null
  await expect(fetchDeveloperLeadDocuments(context)).rejects.toThrow('requirements could not be loaded')
  mocks.detail.transaction.id = 'wrong-transaction'
  await expect(fetchDeveloperLeadDocuments(context)).rejects.toMatchObject({ code: 'lead_documents_access_denied' })
})

it('keeps the durable upload successful when cache invalidation fails', async () => {
  mocks.invalidate.mockRejectedValueOnce(new Error('Cache unavailable'))
  expect((await uploadDeveloperLeadDocument({ ...context, transactionId: 'tx-one', file: file() })).id).toBe('saved-one')
})


it('signs a newly read visible document and ignores cached or caller-supplied locations', async () => {
  const saved = await uploadDeveloperLeadDocument({ ...context, transactionId: 'tx-one', requirementId: 'req-one', file: file() })
  mocks.sign.mockResolvedValue('https://storage.example.test/fresh')
  expect(await createDeveloperLeadDocumentSignedUrl({ ...context, transactionId: 'tx-one', documentId: saved.id, filePath: 'another-tenant/wrong.pdf' })).toBe('https://storage.example.test/fresh')
  expect(mocks.sign).toHaveBeenCalledWith({ filePath: saved.file_path, fileBucket: 'documents', filename: saved.name })
})

it('denies stale transaction, hidden document and revoked handover access before signing', async () => {
  const saved = await uploadDeveloperLeadDocument({ ...context, transactionId: 'tx-one', requirementId: 'req-one', file: file() })
  await expect(createDeveloperLeadDocumentSignedUrl({ ...context, transactionId: 'old-transaction', documentId: saved.id })).rejects.toMatchObject({ code: 'lead_documents_access_denied' })
  await expect(createDeveloperLeadDocumentSignedUrl({ ...context, transactionId: 'tx-one', documentId: 'other-tenant-document' })).rejects.toMatchObject({ code: 'lead_documents_access_denied' })
  mocks.detail.documents[0].transaction_id = 'another-transaction'
  await expect(createDeveloperLeadDocumentSignedUrl({ ...context, transactionId: 'tx-one', documentId: saved.id })).rejects.toMatchObject({ code: 'lead_documents_access_denied' })
  mocks.detail.documents[0].transaction_id = 'tx-one'
  mocks.lead.lead_owner = 'agency'
  mocks.lead.ownership_model = 'agency_owned'
  mocks.lead.visibility_state = 'protected'
  await expect(createDeveloperLeadDocumentSignedUrl({ ...context, transactionId: 'tx-one', documentId: saved.id })).rejects.toMatchObject({ code: 'lead_documents_access_denied' })
  expect(mocks.sign).not.toHaveBeenCalled()
})
