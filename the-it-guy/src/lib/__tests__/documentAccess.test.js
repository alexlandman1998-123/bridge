import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createFreshDocumentSignedUrl, documentStorageReference } from '../documentAccess.js'

function fixture(responses) {
  const calls = []
  const client = { storage: { from: (bucket) => ({ createSignedUrl: async (...args) => { calls.push({ bucket, args }); return responses.shift() } }) } }
  return { client, calls }
}

test('signs the durable object each time, including the attachment filename', async () => {
  const { client, calls } = fixture([{ data: { signedUrl: 'https://storage/fresh-one' } }, { data: { signedUrl: 'https://storage/fresh-two' } }])
  const document = { file_path: 'tenant/doc.pdf', file_bucket: 'documents', name: 'Proof.pdf', url: 'https://storage/expired' }
  const options = { client, ...documentStorageReference(document), download: true }
  assert.equal(await createFreshDocumentSignedUrl(options), 'https://storage/fresh-one')
  assert.equal(await createFreshDocumentSignedUrl(options), 'https://storage/fresh-two')
  assert.deepEqual(calls[0], { bucket: 'documents', args: ['tenant/doc.pdf', 1800, { download: 'Proof.pdf' }] })
})

for (const error of [{ code: '403', message: 'Access denied' }, { code: '404', message: 'Object not found' }, { code: 'bucket_missing', message: 'Bucket not found' }]) {
  test(`a saved bucket never falls back after ${error.message}`, async () => {
    const { client, calls } = fixture([{ error }, { data: { signedUrl: 'https://wrong-tenant' } }])
    await assert.rejects(createFreshDocumentSignedUrl({ client, filePath: 'same.pdf', fileBucket: 'documents', candidateBuckets: ['alternate'], isBucketMissing: () => true }), { code: error.code })
    assert.equal(calls.length, 1)
  })
}

test('legacy records may try another bucket only when the bucket itself is missing', async () => {
  const { client, calls } = fixture([{ error: { code: 'bucket_missing' } }, { data: { signedUrl: 'https://storage/legacy' } }])
  assert.equal(await createFreshDocumentSignedUrl({ client, filePath: 'legacy.pdf', candidateBuckets: ['missing', 'documents'], isBucketMissing: (error) => error?.code === 'bucket_missing' }), 'https://storage/legacy')
  assert.equal(calls.length, 2)
})

test('legacy authorization denial also stops bucket search', async () => {
  const { client, calls } = fixture([{ error: { code: '403' } }])
  await assert.rejects(createFreshDocumentSignedUrl({ client, filePath: 'legacy.pdf', candidateBuckets: ['documents', 'alternate'] }), { code: '403' })
  assert.equal(calls.length, 1)
})

test('does not parse a cached URL into a durable storage identity', async () => {
  assert.equal(documentStorageReference(null).filePath, '')
  const { client, calls } = fixture([])
  await assert.rejects(createFreshDocumentSignedUrl({ client, ...documentStorageReference({ url: 'https://storage/expired' }) }), /storage path/)
  assert.equal(calls.length, 0)
})

function apiAction(name, client) {
  const source = readFileSync(new URL('../api.js', import.meta.url), 'utf8')
  const start = source.indexOf(`async function ${name}(`)
  assert.ok(start > 0)
  const body = source.slice(start, source.indexOf('\n}\n', start) + 2)
  return Function('createFreshDocumentSignedUrl', 'requireClient', 'DOCUMENTS_BUCKET_CANDIDATES', 'isStorageBucketNotFoundError', `return (${body})`)(createFreshDocumentSignedUrl, () => client, ['documents', 'alternate'], (error) => error?.code === 'bucket_missing')
}

test('the actual API action forwards authenticated download requests through the fresh resolver', async () => {
  const { client, calls } = fixture([{ data: { signedUrl: 'https://storage/fresh' } }])
  const action = apiAction('createTransactionDocumentSignedUrl', client)
  assert.equal(await action({ filePath: 'tenant/proof.pdf', fileBucket: 'documents', download: true, filename: 'Proof.pdf' }), 'https://storage/fresh')
  assert.deepEqual(calls[0].args, ['tenant/proof.pdf', 1800, { download: 'Proof.pdf' }])
})

test('metadata signing preserves a supplied portal client and cannot retry with the workspace actor', async () => {
  const main = fixture([{ data: { signedUrl: 'https://privileged-wrong-actor' } }])
  const portal = fixture([{ error: { code: '403', message: 'Portal revoked' } }])
  assert.equal(await apiAction('getSignedUrl', main.client)('tenant/proof.pdf', { client: portal.client, fileBucket: 'documents' }), null)
  assert.equal(main.calls.length, 0)
  assert.equal(portal.calls.length, 1)
})
