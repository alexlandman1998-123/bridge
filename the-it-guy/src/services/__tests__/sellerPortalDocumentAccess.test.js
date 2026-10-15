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
