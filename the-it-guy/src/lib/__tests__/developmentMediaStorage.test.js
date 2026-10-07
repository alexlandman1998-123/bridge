import assert from 'node:assert/strict'
import test from 'node:test'
import { developmentMediaReference, persistDevelopmentMedia, refreshDevelopmentMedia } from '../developmentMediaStorage.js'

const origin = 'https://project.supabase.co'
const developmentId = 'junoah-estate'
const path = `developments/${developmentId}/marketing/cover.png`
const expired = `${origin}/storage/v1/object/sign/documents/${path}?token=expired`
const profile = () => ({ development_id: developmentId, image_links: [expired], marketing_content: { mediaLibrary: { heroImageUrl: expired } } })

function fixture(sign) {
  const calls = []
  let authChanged
  const client = {
    supabaseUrl: origin,
    auth: { onAuthStateChange(callback) { authChanged = callback } },
    storage: { from(bucket) { return { async createSignedUrls(paths, seconds) {
      calls.push({ bucket, paths, seconds })
      if (sign) return sign(paths, calls.length)
      return { data: paths.map((path) => ({ path, signedUrl: `${origin}/storage/v1/object/sign/${bucket}/${path}?token=fresh-${calls.length}` })) }
    } } } },
  }
  return { client, calls, changeUser: (id) => authChanged(id ? 'SIGNED_IN' : 'SIGNED_OUT', id ? { user: { id } } : null) }
}

test('recovers expired cover, gallery, floorplan and visual-map images without mutating saved data', async () => {
  const { client, calls } = fixture()
  const original = profile()
  original.marketing_content.mediaLibrary.galleryImageUrls = `${expired}\n${expired}`
  original.marketing_content.mediaLibrary.visualMap = { scenes: [{ background: { url: expired, sources: [{ url: expired }] } }] }
  original.marketing_content.floorplans = [{ imageUrls: expired, floorplanUrl: expired }]
  original.site_plans = [expired]
  const [resolved] = await refreshDevelopmentMedia(client, [original])
  const url = resolved.image_links[0]
  assert.match(url, /token=fresh-1$/)
  assert.equal(resolved.marketing_content.mediaLibrary.heroImageUrl, url)
  assert.equal(resolved.marketing_content.mediaLibrary.galleryImageUrls, `${url}\n${url}`)
  assert.equal(resolved.marketing_content.mediaLibrary.visualMap.scenes[0].background.sources[0].url, url)
  assert.equal(resolved.marketing_content.floorplans[0].floorplanUrl, url)
  assert.equal(resolved.site_plans[0], url)
  assert.equal(original.image_links[0], expired)
  assert.deepEqual(calls, [{ bucket: 'documents', paths: [path], seconds: 86400 }])
})

test('recovers durable locations from legacy documents and honours explicit paths', async () => {
  const { client } = fixture()
  const [legacy, modern, pathOnly] = await refreshDevelopmentMedia(client, [
    { development_id: developmentId, file_url: expired, storage_bucket: null, storage_path: null },
    { development_id: developmentId, file_url: expired, storage_bucket: 'media', storage_path: `developments/${developmentId}/floorplan/type-a.png` },
    { development_id: developmentId, file_url: null, storage_path: path },
  ])
  assert.equal(legacy.storage_bucket, 'documents')
  assert.equal(legacy.storage_path, path)
  assert.match(legacy.file_url, /token=fresh-/)
  assert.match(modern.file_url, /\/sign\/media\/.*type-a.png\?token=fresh-/)
  assert.match(pathOnly.file_url, /cover.png\?token=fresh-/)
})

test('saves permanent references across nested media without storing access tokens', async () => {
  const { client } = fixture()
  const saved = persistDevelopmentMedia(client, profile(), developmentId)
  assert.equal(saved.image_links[0], expired.split('?')[0])
  assert.equal(saved.marketing_content.mediaLibrary.heroImageUrl, expired.split('?')[0])
  const [view] = await refreshDevelopmentMedia(client, [saved])
  assert.match(view.image_links[0], /token=fresh-/)
})

test('leaves external, public, foreign-project and other-development images unchanged', async () => {
  const { client, calls } = fixture()
  const urls = [
    'https://cdn.example.test/image.jpg',
    expired.replace('/object/sign/', '/object/public/'),
    expired.replace('project.supabase.co', 'foreign.supabase.co'),
    expired.replace(developmentId, 'other-development'),
    `${origin}/storage/v1/object/sign/documents/developments/${developmentId}/marketing/%2e%2e%2fsecret.png`,
    `${origin}/storage/v1/object/sign/documents/developments/${developmentId}/marketing/%5csecret.png`,
  ]
  const [row] = await refreshDevelopmentMedia(client, [{ development_id: developmentId, image_links: urls }])
  assert.deepEqual(row.image_links, urls)
  assert.equal(calls.length, 0)
  assert.equal(developmentMediaReference(client, 'invalid', developmentId), null)
})

test('deduplicates concurrent readers and reuses the viewing cache', async () => {
  const { client, calls } = fixture()
  const results = await Promise.all([
    refreshDevelopmentMedia(client, [profile()]),
    refreshDevelopmentMedia(client, [{ development_id: developmentId, file_url: expired }]),
  ])
  assert.equal(calls.length, 1)
  assert.equal(results[0][0].image_links[0], results[1][0].file_url)
  await refreshDevelopmentMedia(client, [profile()])
  assert.equal(calls.length, 1)
})

test('bounds portfolio signing requests and separates buckets', async () => {
  const { client, calls } = fixture()
  const rows = Array.from({ length: 250 }, (_, index) => ({
    development_id: `development-${index}`,
    file_url: '', storage_bucket: 'documents', storage_path: `developments/development-${index}/marketing/cover.png`,
  }))
  rows.push({ development_id: developmentId, file_url: '', storage_bucket: 'media', storage_path: path })
  const resolved = await refreshDevelopmentMedia(client, rows)
  assert.equal(resolved.length, 251)
  assert.deepEqual(calls.map((call) => call.paths.length), [100, 100, 50, 1])
  assert.equal(calls.at(-1).bucket, 'media')
})

test('renews after cache expiry and drops cached links on account changes', async () => {
  const { client, calls, changeUser } = fixture()
  const originalNow = Date.now
  let now = originalNow()
  Date.now = () => now
  try {
    await refreshDevelopmentMedia(client, [profile()])
    changeUser('alice')
    await refreshDevelopmentMedia(client, [profile()])
    assert.equal(calls.length, 1)
    now += 56 * 60 * 1000
    await refreshDevelopmentMedia(client, [profile()])
    assert.equal(calls.length, 2)
    changeUser('bob')
    await refreshDevelopmentMedia(client, [profile()])
    assert.equal(calls.length, 3)
    changeUser(null)
    await refreshDevelopmentMedia(client, [profile()])
    assert.equal(calls.length, 4)
  } finally { Date.now = originalNow }
})

test('caps cached objects while retaining recently loaded images', async () => {
  const { client, calls } = fixture()
  const rows = Array.from({ length: 2001 }, (_, index) => ({
    development_id: developmentId,
    image_links: [`${origin}/storage/v1/object/sign/documents/developments/${developmentId}/marketing/${index}.png?token=expired`],
  }))
  await refreshDevelopmentMedia(client, rows)
  const count = calls.length
  await refreshDevelopmentMedia(client, [rows.at(-1)])
  assert.equal(calls.length, count)
  await refreshDevelopmentMedia(client, [rows[0]])
  assert.equal(calls.length, count + 1, 'the oldest entry was evicted instead of growing the cache')
})

test('does not publish a viewing URL if the account changes during signing', async () => {
  let finish
  const { client, changeUser } = fixture(() => new Promise((resolve) => { finish = resolve }))
  const pending = refreshDevelopmentMedia(client, [profile()])
  await Promise.resolve()
  changeUser(null)
  finish({ data: [{ path, signedUrl: 'https://example.test/alice-only.png' }] })
  await assert.rejects(pending, /Development media could not be loaded/)
})

test('failed signing retains source data and retries on the next load', async () => {
  for (const failure of [{ error: true }, { data: [{ path, error: 'not allowed' }] }, { data: [] }, new Error('network unavailable')]) {
    const { client, calls } = fixture((paths, count) => {
      if (count === 1) {
        if (failure instanceof Error) throw failure
        return failure
      }
      return { data: paths.map((path) => ({ path, signedUrl: 'https://example.test/recovered.png' })) }
    })
    const original = profile()
    await assert.rejects(refreshDevelopmentMedia(client, [original]), /Development media could not be loaded/)
    assert.equal(original.image_links[0], expired)
    const [resolved] = await refreshDevelopmentMedia(client, [original])
    assert.equal(resolved.image_links[0], 'https://example.test/recovered.png')
    assert.equal(calls.length, 2)
  }
})

test('an unavailable optional cover does not prevent portfolio cards from loading', async () => {
  const { client } = fixture(() => ({ error: true }))
  const original = profile()
  const [row] = await refreshDevelopmentMedia(client, [original], { strict: false })
  assert.equal(row.image_links[0], '')
  assert.equal(row.marketing_content.mediaLibrary.heroImageUrl, '')
  assert.equal(original.image_links[0], expired)
})
