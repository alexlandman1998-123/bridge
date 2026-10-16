import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../privateListingService.js', import.meta.url), 'utf8')
const start = source.indexOf('export async function createSellerClientPortalDocumentSignedUrl(')
const end = source.indexOf('\nexport async function createPrivateListingDocumentDownloadUrl(', start)
assert.ok(start >= 0 && end > start)

function fixture({ documents, finalPath = '', denied = false } = {}) {
  const calls = []
  const filePath = 'seller-portal/listing/synthetic.pdf'
  const scope = {
    normalizeText: value => String(value || '').trim(),
    requireClient: () => ({}),
    getStoredSellerPortalAccessToken: () => 'stored-session',
    getSellerOnboardingByToken: async (token, options) => {
      calls.push(['portal', token, options])
      if (denied) throw new Error('Session expired')
      return { listing: { id: 'listing', documents: documents ?? [{ storage_path: filePath, file_bucket: 'seller-documents' }] } }
    },
    // Agent reads cannot authorize an anonymous seller's document access.
    resolvePrivateListingDocumentDownload: async () => { throw new Error('Agent-only listing lookup') },
    privateListingDocumentPathMatches: (row, path) => row.storage_path === path,
    getPrivateListingDocumentStorageBucket: row => row.file_bucket || '',
    getPrivateListingMandateArtifactMatch: (_listing, path) => path === finalPath ? { filePath: path } : null,
    requireSellerPortalStorageClient: (token, session) => { calls.push(['scope', token, session]); return 'scoped-client' },
    createPrivateListingDocumentSignedUrl: async (...args) => { calls.push(['sign', ...args]); return 'https://storage.invalid/fresh' },
  }
  const action = Function('scope', `with(scope) { return (${source.slice(start, end).replace(/^export /, '')}) }`)(scope)
  return { action, calls, filePath }
}

test('seller opens its persisted upload using portal authorization and its saved bucket', async () => {
  const f = fixture()
  assert.equal(await f.action({ token: 'link', accessToken: 'session', filePath: f.filePath }), 'https://storage.invalid/fresh')
  assert.deepEqual(f.calls[0], ['portal', 'link', { includeRequirementsAndDocuments: true, requirePortalAccess: true, sellerPortalAccessToken: 'session' }])
  assert.deepEqual(f.calls.slice(1), [['scope', 'link', 'session'], ['sign', 'scoped-client', f.filePath, 60, 'seller-documents']])
})

test('seller cannot sign an unlinked path even under its listing prefix', async () => {
  const f = fixture({ documents: [] })
  await assert.rejects(f.action({ token: 'link', filePath: f.filePath }), /not available in this client portal/)
  assert.equal(f.calls.some(call => call[0] === 'sign'), false)
})

test('expired seller access never reaches storage signing', async () => {
  const f = fixture({ denied: true })
  await assert.rejects(f.action({ token: 'link', filePath: f.filePath }), /Session expired/)
  assert.equal(f.calls.some(call => call[0] === 'sign'), false)
})

test('canonical files still require a linked canonical request', async () => {
  const filePath = 'document-requirements/request/synthetic.pdf'
  const f = fixture({ documents: [{ storage_path: filePath }] })
  await assert.rejects(f.action({ token: 'link', filePath }), /not available in this client portal/)
})

test('linked canonical files retain the stored seller session and requested expiry', async () => {
  const filePath = 'document-requirements/request/synthetic.pdf'
  const f = fixture({ documents: [{ storage_path: filePath, canonical_requirement_instance_id: 'request', file_bucket: 'documents' }] })
  await f.action({ token: 'link', filePath, expiresInSeconds: 120 })
  assert.deepEqual(f.calls.slice(1), [['scope', 'link', 'stored-session'], ['sign', 'scoped-client', filePath, 120, 'documents']])
})

test('final mandate artifacts still require the secure completion route', async () => {
  const finalPath = 'seller-portal/listing/final.pdf'
  const f = fixture({ documents: [{ storage_path: finalPath }], finalPath })
  await assert.rejects(f.action({ token: 'link', filePath: finalPath }), /secure completion record/)
  assert.equal(f.calls.some(call => call[0] === 'sign'), false)
})

test('a final artifact descriptor cannot use the generic download route', async () => {
  const filePath = 'seller-portal/listing/final.pdf'
  const f = fixture({ documents: [{ storage_path: filePath, canonicalFinalArtifact: true }] })
  await assert.rejects(f.action({ token: 'link', filePath }), /secure completion record/)
  assert.equal(f.calls.some(call => call[0] === 'sign'), false)
})

const { prepareSellerPortalOptionalUploadTarget } = await import('../sellerDocumentSatisfactionAssuranceService.js')
for (const key of ['title_deed_copy', 'seller_bank_account_confirmation']) {
  test(`prepares missing optional ${key} before transferring bytes and reuses its exact identity`, async () => {
    const row = { id: 'request', private_listing_id: 'own-listing', requirement_key: key, is_required: false, status: 'required', document_visibility: 'seller_visible' }
    let calls = 0
    const client = { rpc: async (name, args) => {
      calls++; assert.equal(name, 'bridge_prepare_seller_optional_document_upload')
      assert.deepEqual(args, { p_token: 'own-token', p_access_token: 'own-session', p_requirement_key: key })
      return { data: row }
    } }
    const input = { client, token: 'own-token', accessToken: 'own-session', listingId: 'own-listing', requirementKey: key, currentOptionalKeys: [key] }
    assert.equal(await prepareSellerPortalOptionalUploadTarget(input), row)
    assert.equal(await prepareSellerPortalOptionalUploadTarget({ ...input, requirements: [row] }), row)
    assert.equal(calls, 1)
    await assert.rejects(prepareSellerPortalOptionalUploadTarget({ ...input, listingId: 'other-listing' }), /could not be verified/)
  })
}
test('portal preparation cannot invent conditional requests or revive retired optional requests', async () => {
  const client = { rpc: () => { throw new Error('Must not write') } }
  for (const key of ['gas_compliance_certificate', 'signed_mandate', 'seller_bank_account_confirmation']) {
    assert.equal(await prepareSellerPortalOptionalUploadTarget({ client, requirementKey: key, currentOptionalKeys: [] }), null)
  }
  const retired = { id: 'retired', requirement_key: 'title_deed_copy', status: 'not_applicable', is_required: false }
  assert.equal(await prepareSellerPortalOptionalUploadTarget({ client, requirements: [retired], requirementKey: 'title_deed_copy', currentOptionalKeys: ['title_deed_copy'] }), retired)
})
test('a rejected preparation cannot continue with an unverified request', async () => {
  const denied = Object.assign(new Error('Session expired'), { code: 'P0001' })
  await assert.rejects(prepareSellerPortalOptionalUploadTarget({ client: { rpc: async () => ({ error: denied }) }, requirementKey: 'title_deed_copy', currentOptionalKeys: ['title_deed_copy'] }), denied)
})
