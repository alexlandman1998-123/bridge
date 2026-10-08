import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runRecoverableDocumentUpload, readSavedUploadByPath, isDefiniteUploadSaveRejection } from '../documentUploadRecovery.js'
import { buildPrivateListingDocumentPersistenceReceipt } from '../../services/listings/listingSellerDocumentPersistenceModel.js'

function extract(path, name, values) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const start = source.indexOf(`export async function ${name}(`)
  assert.ok(start >= 0)
  const body = source.slice(start, source.indexOf('\n}\n', start) + 2).replace(/^export /, '')
  const scope = new Proxy({ runRecoverableDocumentUpload, readSavedUploadByPath, isDefiniteUploadSaveRejection, buildPrivateListingDocumentPersistenceReceipt, ...values }, {
    has: () => true,
    get: (object, key) => key === Symbol.unscopables ? undefined : key in object ? object[key] : key in globalThis ? globalThis[key] : () => null,
  })
  return Function('scope', `with (scope) { return (${body}) }`)(scope)
}

function fixture() {
  const id = crypto.randomUUID()
  const file = new File(['%PDF-1.4 diagnostic'], 'proof.pdf', { type: 'application/pdf', lastModified: 10 })
  const state = { uploads: 0, saves: 0, deletes: 0, row: null, readable: true }
  const client = {
    from: table => ({
      filters: {}, select() { return this }, eq(key, value) { this.filters[key] = value; return this },
      insert(payload) { this.payload = payload; return this },
      async single() {
        state.saves++
        state.row = { ...this.payload, id: crypto.randomUUID() }
        return { error: new TypeError('Insert reply lost after commit') }
      },
      async throwOnError() { throw new Error('Notification processing unavailable') },
      async maybeSingle() {
        if (table === 'transactions') return { data: { id, finance_type: 'cash' } }
        if (!state.readable) return { error: new TypeError('Read connection lost') }
        return { data: state.row && Object.entries(this.filters).every(([key, value]) => state.row[key] === value) ? state.row : null }
      },
    }),
    auth: { getUser: async () => ({ data: { user: { id: 'actor' } } }) },
    storage: { from: () => ({ upload: async () => { state.uploads++; return {} }, remove: async () => { state.deletes++; return {} } }) },
    rpc: async (name, parameters) => {
      if (name === 'bridge_client_portal_matter_financial_accounts') return { data: { accounts: [{ id, documents: state.row ? [state.row] : [], requests: [] }] } }
      if (name === 'bridge_promote_private_listing_document_row') return { data: { promotion_status: 'pending_transaction' } }
      state.saves++
      state.row = { id: crypto.randomUUID(), transaction_id: id, private_listing_id: id, name: 'proof.pdf', document_name: 'proof.pdf', file_path: parameters.p_file_path || parameters.p_storage_path, storage_path: parameters.p_storage_path, status: 'uploaded' }
      return { error: new TypeError('Response lost after commit') }
    },
  }
  const noop = async () => null
  const text = value => String(value || '').trim()
  const values = {
    DOCUMENTS_BUCKET_CANDIDATES: ['documents'], requireClient: () => client, requireClientPortalTokenClient: () => client, requirePortalClient: () => client,
    resolveClientPortalLinkByToken: async () => ({ transaction_id: id, development_id: id }),
    ensureDevelopmentSettings: async () => ({ client_portal_enabled: true }),
    validateDocumentUploadFile: value => ({ safeName: value.name }),
    normalizeText: text, normalizeKey: value => text(value).toLowerCase(), normalizeUuid: text, normalizeNullableUuid: value => value || null,
    normalizeNullableText: value => value || null, normalizeTextValue: text, normalizeDocumentKeyCandidate: text,
    normalizePortalDocumentType: text, normalizePurchaserType: value => value || 'individual', normalizeCompatibilityKey: text,
    normalizeDocumentRows: rows => rows, isReservationProofDocumentKey: () => false, isBondFinanceType: () => false,
    getCurrentUser: async () => ({ id: 'actor' }), fetchOnboardingFormDataForTransaction: async () => ({ formData: {} }), computeTransactionReadinessSnapshot: noop,
    uploadToBuyerPortalDocumentsBucket: async () => { state.uploads++; return 'documents' }, uploadToPrivateListingDocumentsBucket: async () => { state.uploads++; return 'documents' },
    removeUploadedDocumentObject: async () => { state.deletes++ }, removePrivateListingDocumentObject: async () => { state.deletes++ },
    uploadToDocumentsBucket: async () => { state.uploads++; return 'documents' },
    fetchMatterFinancialAccountForMutation: async () => ({ id, transaction_id: id }), resolveActiveProfileContext: async () => ({ userId: 'actor' }),
    normalizeMatterFinancialDocumentType: text, normalizeMatterFinancialAudienceRole: text, normalizeOptionalNumber: value => value ?? null, normalizeOptionalDate: value => value || null, normalizeMatterFinancialCurrencyCode: value => value || 'ZAR',
    buildMatterFinancialDocumentViewModel: row => row, buildClientPortalMatterFinancialDocumentViewModel: row => row,
    getSignedUrl: noop, createPrivateListingDocumentSignedUrl: noop, updateDocumentRequestFromUploadIfPossible: noop, runDocumentAutomationIfPossible: noop,
    deriveFinanceManagedBy: () => 'agent', syncSellerJourneyLeadStageForListingId: noop, createPrivateListingActivity: noop, updatePrivateListingRequirementStatus: noop,
    getPrivateListingById: async () => ({ id }), getPrivateListingDocumentRequirements: async () => [], resolvePrivateListingDocumentRequirement: () => null, isMandateDocumentRow: () => false,
    requireSellerPortalStorageClient: () => client,
    getSellerOnboardingByToken: async () => ({ listing: { id, documentRequirements: [{ id, requirement_key: 'id_copy' }], documents: state.row ? [state.row] : [] }, onboardingFormData: { formData: {} } }),
    getSellerPortalSignedUploadReference: noop, resolveExactSellerRequirement: ({ requirements }) => requirements[0],
    assertSellerUploadTarget() {}, linkSellerPortalDocumentRequestUpload: noop,
    getCommercialPortalWorkspaceData: async () => ({ access: { id, organisationId: id, role: 'buyer' } }), getPortalClient: () => client,
    chooseUploadTarget: () => ({ entityType: 'commercial_transaction', entityId: id }),
    uploadPortalFile: async (_client, { attempt }) => { state.uploads++; return { bucket: 'documents', path: attempt.path(`commercial/${id}/proof.pdf`) } },
    COMMERCIAL_DOCUMENTS_TABLE: 'commercial_documents', PORTAL_NOTIFICATIONS_TABLE: 'commercial_portal_notifications', COMMERCIAL_DOCUMENT_BUCKET_CANDIDATES: ['documents'],
    recordPortalAuditEvent: noop, updatePortalAccessActivity: noop,
    clientFor: () => client,
    saveRecruitmentLead: async (_org, payload) => { state.saves++; state.row = payload; throw new TypeError('Recruitment save reply lost after commit') },
    getRecruitmentLead: async () => state.row,
    safeFileName: text, DOCUMENTS_BUCKET: 'documents', DEVELOPER_DOCUMENT_PORTAL_MAX_FILE_BYTES: 20 * 1024 * 1024,
    fetchDeveloperDocumentPortal: async () => { if (!state.readable) throw new Error('Read unavailable'); return { documents: state.row ? [{ ...state.row, filePath: state.row.file_path }] : [] } },
    insertPrivateListingDocumentRow: async (_client, payload) => { state.saves++; state.row = { ...payload, id: crypto.randomUUID() }; return { error: new TypeError('Insert reply lost after commit') } },
  }
  return { id, file, state, values }
}

for (const [label, path, name, parameters] of [
  ['buyer', '../api.js', 'uploadClientPortalDocument', f => ({ token: f.id, file: f.file })],
  ['seller', '../../services/privateListingService.js', 'uploadSellerClientPortalDocument', f => ({ token: f.id, accessToken: 'session', requirementKey: 'id_copy', file: f.file })],
  ['agent listing', '../../services/privateListingService.js', 'uploadPrivateListingDocument', f => [f.id, f.file]],
  ['developer', '../../services/developerDocumentPortalService.js', 'uploadDeveloperDocumentPortalFile', f => ({ token: f.id, portalId: f.id, transactionId: f.id, file: f.file })],
  ['commercial portal', '../../modules/commercial/services/commercialPortalApi.js', 'uploadCommercialPortalDocument', f => ({ token: f.id, file: f.file })],
  ['attorney financial register', '../api.js', 'registerMatterFinancialDocument', f => ({ accountId: f.id, transactionId: f.id, file: f.file })],
  ['client financial proof', '../api.js', 'uploadClientPortalMatterFinancialProof', f => ({ token: f.id, accountId: f.id, file: f.file })],
  ['client financial request', '../api.js', 'uploadClientPortalMatterFinancialRequestDocument', f => ({ token: f.id, accountId: f.id, requestId: f.id, file: f.file })],
  ['recruitment', '../../services/recruitmentService.js', 'uploadRecruitmentDocument', f => [f.id, { id: f.id, documents_json: [] }, f.file, 'identity']],
]) {
  test(`${label}: actual upload action recovers a lost commit reply; retries retain one file and record`, async () => {
    const f = fixture()
    const action = extract(path, name, f.values)
    const args = parameters(f)
    const invoke = () => Array.isArray(args) ? action(...args) : action(args)
    const saved = await invoke()
    assert.equal(saved.id || saved.document?.id, f.state.row.id)
    assert.equal(f.state.deletes, 0)
    const results = await Promise.all([invoke(), invoke(), invoke()])
    assert.ok(results.every(row => (row.id || row.document?.id) === (saved.id || saved.document?.id)))
    assert.equal(f.state.uploads, 1)
    assert.equal(f.state.saves, 1)
  })
}

test('developer: actual action retains bytes when the save cannot be read and recovers on a later retry', async () => {
  const f = fixture(); f.state.readable = false
  const action = extract('../../services/developerDocumentPortalService.js', 'uploadDeveloperDocumentPortalFile', f.values)
  const input = { token: f.id, portalId: f.id, transactionId: f.id, file: f.file }
  await assert.rejects(action(input), { code: 'document_save_unconfirmed' })
  f.state.readable = true
  assert.equal((await action(input)).id, f.state.row.id)
  assert.equal(f.state.uploads, 1)
  assert.equal(f.state.saves, 1)
  assert.equal(f.state.deletes, 0)
})
