import { runRecoverableDocumentUpload, readSavedUploadByPath, isDefiniteUploadSaveRejection } from '../src/lib/documentUploadRecovery.js'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const migration = fs.readFileSync('../supabase/migrations/20260905090353_document_trust_phase1_seller_atomic_link.sql', 'utf8')
const sellerService = fs.readFileSync('src/services/privateListingService.js', 'utf8')
const docs = fs.readFileSync('docs/document-trust-phase1-atomic-linking.md', 'utf8')
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))

assert.equal(packageJson.scripts['test:document-trust-phase1'], 'node scripts/document-trust-phase1-atomic-linking.test.mjs')
assert.match(migration, /document_trust_state', 'pending_transaction_link'/)
assert.match(migration, /document_trust_state', 'canonically_linked'/)
assert.match(migration, /canonical_requirement_instance_id is null/)
assert.match(migration, /raise exception 'Seller upload could not be linked to the canonical transaction document requirement.'/)
assert.match(migration, /bridge_promote_private_listing_document_row/)
assert.match(sellerService, /removePrivateListingDocumentObject/)
assert.match(sellerService, /seller_document_canonical_link_failed/)
assert.match(sellerService, /Your document was not linked to the transaction file/)
assert.match(sellerService, /document_trust_state/)
assert.match(sellerService, /canonically_linked/)
assert.match(sellerService, /pending_transaction_link/)
assert.doesNotMatch(sellerService, /const usedFallbackUpload/)
assert.match(docs, /legacy-only records/)
assert.match(docs, /pending_transaction_link/)

console.log('document trust Phase 1 atomic-linking tests passed')

test('seller upload failures clean Storage and retain the portal recovery action', async () => {
  const start = sellerService.indexOf('export async function uploadSellerClientPortalDocument(')
  const end = sellerService.indexOf('export const __privateListingServiceTestUtils', start)
  const classifierStart = sellerService.indexOf('export function isSellerPortalSessionExpiredError(')
  const classifierEnd = sellerService.indexOf('\nfunction normalizeKey(', classifierStart)
  assert.ok(start >= 0 && end > start && classifierStart >= 0 && classifierEnd > classifierStart)
  const normalizeText = value => String(value ?? '').trim()
  const normalizeKey = value => normalizeText(value).toLowerCase()
  const isSellerPortalSessionExpiredError = Function('normalizeKey',
    `${sellerService.slice(classifierStart, classifierEnd).replace('export function', 'function')}\nreturn isSellerPortalSessionExpiredError`,
  )(normalizeKey)

  for (const [serverMessage, expectedCode, expectedRecovery] of [
    ['Seller portal link is invalid or inactive.', 'seller_portal_link_rejected', /check the link/],
    ['Seller portal session has expired. Please sign in again.', 'seller_portal_session_expired', /sign in again/],
    ['Seller portal password is required.', 'seller_portal_session_expired', /sign in again/],
    ['Seller upload could not be linked to the canonical transaction document requirement.', 'seller_document_canonical_link_failed', /not linked to the transaction file/],
  ]) {
    const serverError = { code: 'P0001', message: serverMessage }
    const events = []
    const scope = {
      runRecoverableDocumentUpload, readSavedUploadByPath, isDefiniteUploadSaveRejection, DOCUMENTS_BUCKET_CANDIDATES: ['documents'],
      normalizeText, normalizeKey, normalizeUuid: value => value || '', isSellerPortalSessionExpiredError,
      requireClient: () => ({ rpc: async () => { events.push('rpc'); return { error: serverError } } }),
      getStoredSellerPortalAccessToken: () => 'session',
      getSellerOnboardingByToken: async () => ({ listing: { id: 'listing', documentRequirements: [{ requirement_key: 'id_copy' }] } }),
      getSellerPortalSignedUploadReference: async () => null,
      requireSellerPortalStorageClient: () => ({}),
      validateDocumentUploadFile: file => ({ safeName: file.name }),
      resolveExactSellerRequirement: ({ requirements }) => requirements[0],
      assertSellerUploadTarget: () => {}, sanitizeDocumentFileName: value => value,
      uploadToPrivateListingDocumentsBucket: async () => { events.push('storage'); return 'private-bucket' },
      removePrivateListingDocumentObject: async () => { events.push('cleanup') },
    }
    const upload = Function(...Object.keys(scope),
      `${sellerService.slice(start, end).replace('export async function', 'async function')}\nreturn uploadSellerClientPortalDocument`,
    )(...Object.values(scope))
    await assert.rejects(upload({ token: 'stable-link', file: { name: 'identity.jpg', type: 'image/jpeg', size: 97000 }, requirementKey: 'id_copy' }), error => {
      assert.equal(error.code, expectedCode)
      assert.match(error.message, expectedRecovery)
      assert.equal(error.cause, serverError)
      assert.equal(isSellerPortalSessionExpiredError(error), expectedCode === 'seller_portal_session_expired', 'Expired upload sessions must reopen the existing portal password flow')
      return true
    })
    assert.deepEqual(events, ['storage', 'rpc', 'cleanup'], 'No failed upload skips Storage cleanup')
  }
})

// Exercise the real upload commands and the stable-link correction in local
// PostgreSQL, including session checks and all-or-nothing transaction linking.
await import('./seller-portal-upload-token-resolution.test.mjs')
