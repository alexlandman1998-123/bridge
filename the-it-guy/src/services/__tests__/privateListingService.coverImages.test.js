import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const FIRST_LISTING_ID = '11111111-1111-4111-8111-111111111111'
const SECOND_LISTING_ID = '22222222-2222-4222-8222-222222222222'

test('loads one cover URL per requested listing and falls back to image order', async () => {
  const server = await createServer({
    root: PROJECT_ROOT,
    logLevel: 'silent',
    server: { middlewareMode: true },
  })

  try {
    const { getPrivateListingCoverImageUrls } = await server.ssrLoadModule('/src/services/privateListingService.js')
    const queries = []
    const mediaRows = [
      { listing_id: FIRST_LISTING_ID, media_type: 'image', file_url: 'https://example.test/first.jpg', sort_order: 0, is_cover: false },
      { listing_id: FIRST_LISTING_ID, media_type: 'image', file_url: 'https://example.test/cover.jpg', sort_order: 3, is_cover: true },
      { listing_id: SECOND_LISTING_ID, media_type: 'image', file_url: 'https://example.test/later.jpg', sort_order: 2, is_cover: false },
      { listing_id: SECOND_LISTING_ID, media_type: 'image', file_url: 'https://example.test/earlier.jpg', sort_order: 1, is_cover: false },
      { listing_id: SECOND_LISTING_ID, media_type: 'floor_plan', file_url: 'https://example.test/plan.jpg', sort_order: 0, is_cover: true },
    ]
    const client = {
      from(table) {
        assert.equal(table, 'listing_media')
        const query = {
          select(columns) {
            assert.match(columns, /file_url/)
            return this
          },
          in(column, ids) {
            assert.equal(column, 'listing_id')
            this.ids = ids
            return this
          },
          eq(column, value) {
            this.filters.push({ column, value })
            return this
          },
          order() {
            return this
          },
          limit(value) { this.maximum = value; return this },
          then(resolve) {
            queries.push({ ids: [...this.ids], filters: [...this.filters] })
            resolve({
              data: mediaRows.filter((row) => this.ids.includes(row.listing_id) && this.filters.every(({ column, value }) => row[column] === value)).sort((a, b) => a.sort_order - b.sort_order).slice(0, this.maximum),
              error: null,
            })
          },
        }
        query.filters = []
        return query
      },
    }

    const urls = await getPrivateListingCoverImageUrls([FIRST_LISTING_ID, SECOND_LISTING_ID], { client })
    assert.deepEqual(queries, [
      {
        ids: [FIRST_LISTING_ID, SECOND_LISTING_ID],
        filters: [{ column: 'media_type', value: 'image' }, { column: 'is_cover', value: true }],
      },
      { ids: [SECOND_LISTING_ID], filters: [{ column: 'media_type', value: 'image' }] },
    ])
    assert.deepEqual(urls, {
      [FIRST_LISTING_ID]: 'https://example.test/cover.jpg',
      [SECOND_LISTING_ID]: 'https://example.test/earlier.jpg',
    })
  } finally {
    await server.close()
  }
})

test('uses a card-sized public image and retains its original as a fallback', async () => {
  const server = await createServer({ root: PROJECT_ROOT, logLevel: 'silent', server: { middlewareMode: true } })
  try {
    const { getListingCardImageSource } = await server.ssrLoadModule('/src/services/privateListingService.js')
    const original = 'https://arch9.supabase.co/storage/v1/object/public/listing-media/listings/front%20view.jpg'
    const transformCalls = []
    const client = {
      supabaseUrl: 'https://arch9.supabase.co',
      storage: {
        from(bucket) {
          assert.equal(bucket, 'listing-media')
          return {
            getPublicUrl(path, options) {
              transformCalls.push({ path, options })
              return { data: { publicUrl: 'https://arch9.supabase.co/storage/v1/render/image/public/listing-media/card.jpg?width=480' } }
            },
          }
        },
      },
    }
    assert.deepEqual(getListingCardImageSource(original, { client }), {
      src: 'https://arch9.supabase.co/storage/v1/render/image/public/listing-media/card.jpg?width=480',
      fallbackSrc: original,
    })
    assert.deepEqual(transformCalls, [{
      path: 'listings/front view.jpg',
      options: { transform: { width: 480, height: 264, resize: 'cover', quality: 72 } },
    }])
    const external = 'https://property24.example/image.jpg'
    assert.deepEqual(getListingCardImageSource(external, { client }), { src: external, fallbackSrc: '' })
    assert.deepEqual(getListingCardImageSource(`${original}?token=private`, { client }), {
      src: `${original}?token=private`,
      fallbackSrc: '',
    })
  } finally {
    await server.close()
  }
})

test('private cover thumbnails retain an original fallback and report cards progressively', async () => {
  const server = await createServer({ root: PROJECT_ROOT, logLevel: 'silent', server: { middlewareMode: true } })
  try {
    const { getPrivateListingCoverImageUrls, getListingCardImageSource } = await server.ssrLoadModule('/src/services/privateListingService.js')
    const path = `private-listings/${FIRST_LISTING_ID}/gallery/cover.jpg`
    const original = 'https://arch9.supabase.co/storage/v1/object/sign/documents/cover?token=fixture'
    const thumbnail = 'https://arch9.supabase.co/storage/v1/render/image/sign/documents/cover?token=fixture'
    const signedPaths = [], progress = []
    const client = {
      supabaseUrl: 'https://arch9.supabase.co',
      from: () => ({ select() { return this }, in() { return this }, eq() { return this }, order() { return this },
        then(resolve) { resolve({ data: [{ listing_id: FIRST_LISTING_ID, media_type: 'image', is_cover: true, storage_bucket: 'documents', storage_path: path }] }) } }),
      storage: { from(bucket) {
        assert.equal(bucket, 'documents')
        return {
          async createSignedUrls(paths) { signedPaths.push(...paths); return { data: paths.map(path => ({ path, signedUrl: original })) } },
          async createSignedUrl(actual, expiry, options) {
            assert.equal(actual, path); assert.equal(expiry, 3600)
            assert.deepEqual(options.transform, { width: 480, height: 264, resize: 'cover', quality: 72 })
            return { data: { signedUrl: thumbnail } }
          },
        }
      } },
    }
    const urls = await getPrivateListingCoverImageUrls([FIRST_LISTING_ID], { client, thumbnail: true, onCover: value => progress.push(value) })
    assert.deepEqual(signedPaths, [path])
    assert.deepEqual(progress, [{ [FIRST_LISTING_ID]: thumbnail }])
    assert.deepEqual(getListingCardImageSource(urls[FIRST_LISTING_ID], { client }), { src: thumbnail, fallbackSrc: original })
    client.storage.from = () => ({ createSignedUrls: async () => ({ data: [{ path, signedUrl: original }] }), createSignedUrl: async () => ({ error: new Error('Transformation unavailable') }) })
    assert.equal((await getPrivateListingCoverImageUrls([FIRST_LISTING_ID], { client, thumbnail: true }))[FIRST_LISTING_ID], original)
  } finally { await server.close() }
})
