import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveDevelopmentCoverImage } from '../developmentMediaStorage.js'

const origin = 'https://project.supabase.co'
const path = 'developments/dev-one/marketing/cover.jpg'
const source = `${origin}/storage/v1/object/sign/documents/${path}?token=original`
const resized = `${origin}/storage/v1/render/image/sign/documents/${path}?token=resized`
function fixture(sign = async () => ({ data: { signedUrl: resized } })) {
  const calls = []
  let authChanged
  const client = {
    supabaseUrl: origin,
    auth: { onAuthStateChange(callback) { authChanged = callback } },
    storage: { from(bucket) { return {
      createSignedUrl(...args) { calls.push({ bucket, args }); return sign(...args) },
      getPublicUrl(...args) { calls.push({ bucket, args }); return { data: { publicUrl: resized } } },
    } } },
  }
  return { client, calls, signOut: () => authChanged('SIGNED_OUT', null) }
}
test('requests a bounded compressed cover without changing the original reference', async () => {
  const { client, calls } = fixture()
  assert.equal(await resolveDevelopmentCoverImage(client, source, 'dev-one', 5000), resized)
  assert.deepEqual(calls, [{ bucket: 'documents', args: [path, 86400, { transform: { width: 1600, quality: 70, resize: 'contain' } }] }])
  assert.ok(source.includes('/object/sign/'))
})
test('uses smaller widths on mobile and only three bounded variants', async () => {
  const { client, calls } = fixture()
  for (const width of [390, 780, 1200]) await resolveDevelopmentCoverImage(client, source, 'dev-one', width)
  assert.deepEqual(calls.map(x => x.args[2].transform.width), [640, 1024, 1600])
})
test('coalesces simultaneous cover readers and reuses the signed derivative', async () => {
  const { client, calls } = fixture()
  await Promise.all(Array.from({ length: 10 }, () => resolveDevelopmentCoverImage(client, source, 'dev-one')))
  await resolveDevelopmentCoverImage(client, source, 'dev-one')
  assert.equal(calls.length, 1)
})
test('invalidates cached and in-flight derivatives on sign out', async () => {
  let resolve
  const { client, calls, signOut } = fixture(() => new Promise(done => { resolve = done }))
  const result = resolveDevelopmentCoverImage(client, source, 'dev-one')
  await Promise.resolve()
  signOut()
  resolve({ data: { signedUrl: resized } })
  assert.equal(await result, '')
  const next = resolveDevelopmentCoverImage(client, source, 'dev-one')
  await Promise.resolve()
  resolve({ data: { signedUrl: resized } })
  assert.equal(await next, resized)
  assert.equal(calls.length, 2)
})
test('leaves foreign, external, invalid and other-development URLs untouched', async () => {
  const { client, calls } = fixture()
  for (const url of ['https://example.com/cover.jpg', source.replace('project.', 'other.'), source.replace('dev-one', 'dev-two'), 'bad-url']) {
    assert.equal(await resolveDevelopmentCoverImage(client, url, 'dev-one'), url)
  }
  assert.equal(calls.length, 0)
})
test('supports existing public images without creating private signatures', async () => {
  const { client, calls } = fixture()
  assert.equal(await resolveDevelopmentCoverImage(client, source.replace('/sign/', '/public/'), 'dev-one'), resized)
  assert.deepEqual(calls[0].args, [path, { transform: { width: 1600, quality: 70, resize: 'contain' } }])
})
test('retains the original cover on unavailable transformations or signing failure', async () => {
  for (const sign of [async () => ({ error: { message: 'disabled' } }), async () => { throw new Error('offline') }]) {
    const { client, calls } = fixture(sign)
    assert.equal(await resolveDevelopmentCoverImage(client, source, 'dev-one'), source)
    assert.equal(await resolveDevelopmentCoverImage(client, source, 'dev-one'), source)
    assert.equal(calls.length, 1)
  }
})
test('renews expired derivatives and retries temporary signing failures after a short cooldown', async t => {
  let now = Date.now()
  t.mock.method(Date, 'now', () => now)
  let unavailable = true
  const { client, calls } = fixture(async () => unavailable ? { error: true } : { data: { signedUrl: resized } })
  assert.equal(await resolveDevelopmentCoverImage(client, source, 'dev-one'), source)
  unavailable = false
  now += 60_001
  assert.equal(await resolveDevelopmentCoverImage(client, source, 'dev-one'), resized)
  now += 56 * 60_000
  assert.equal(await resolveDevelopmentCoverImage(client, source, 'dev-one'), resized)
  assert.equal(calls.length, 3)
})
test('a new cover source cannot reuse the old cover derivative', async () => {
  const { client, calls } = fixture()
  await resolveDevelopmentCoverImage(client, source, 'dev-one')
  await resolveDevelopmentCoverImage(client, source.replace('cover.jpg', 'replacement.jpg'), 'dev-one')
  assert.equal(calls.length, 2)
  assert.equal(calls[1].args[0], path.replace('cover.jpg', 'replacement.jpg'))
})
