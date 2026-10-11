import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const server = await createServer({ root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true } })
after(() => server.close())
const { canonicalInstanceToTransactionRequiredDocument, canonicalInstanceToPrivateListingRequirement, canonicalInstanceToDocumentRequest } =
  await server.ssrLoadModule('/src/services/documents/canonicalDocumentAdapterService.js')

const custom = {
  id: '11111111-1111-4111-8111-111111111111', context_type: 'transaction', context_id: 'transaction-1',
  transaction_id: 'transaction-1', listing_id: 'listing-1', requirement_origin: 'manual',
  custom_label: 'Additional SARS correspondence', document_definition_key: null,
  requirement_level: 'required', pack_key: 'seller_identity_fica', requested_from_role: 'seller', status: 'pending',
}

test('custom requirements retain the same nonempty type key and name through existing adapters', () => {
  const transaction = canonicalInstanceToTransactionRequiredDocument(custom)
  const listing = canonicalInstanceToPrivateListingRequirement(custom)
  const request = canonicalInstanceToDocumentRequest(custom)
  assert(transaction.document_key.startsWith('custom_'))
  assert.equal(listing.requirement_key, transaction.document_key)
  assert.equal(request.document_type, transaction.document_key)
  assert.equal(transaction.document_label, custom.custom_label)
  assert.equal(listing.requirement_name, custom.custom_label)
  assert.equal(request.title, custom.custom_label)
  assert.equal(request.canonical_requirement_instance_id, custom.id)
})

test('equal custom names for different subjects do not collapse to one document slot', () => {
  const first = canonicalInstanceToTransactionRequiredDocument(custom)
  const second = canonicalInstanceToTransactionRequiredDocument({ ...custom, id: '22222222-2222-4222-8222-222222222222' })
  assert.equal(first.document_label, second.document_label)
  assert.notEqual(first.document_key, second.document_key)
})

test('explicit removal disables compatibility requirements', () => {
  const removed = { ...custom, applicability_override: 'removed', status: 'not_applicable' }
  const transaction = canonicalInstanceToTransactionRequiredDocument(removed)
  assert.equal(transaction.enabled, false)
  assert.equal(transaction.is_required, false)
  assert.equal(canonicalInstanceToPrivateListingRequirement(removed).is_required, false)
})
