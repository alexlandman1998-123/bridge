import assert from 'node:assert/strict'
import test from 'node:test'
import sharp from 'sharp'
import { buildDevelopmentPageHtml, createDevelopmentPageResponse, createDevelopmentShareImageResponse } from './publicDevelopmentShareApi.js'

const shell = '<!doctype html><html><head><title>Arch9 | Platform</title><meta name="description" content="old" /><meta property="og:title" content="The Future of Property" /><meta property="og:image" content="https://app.arch9.co.za/brand/old.jpg" /></head><body><div id="root"></div><script type="module" src="/assets/app.js"></script></body></html>'
const cover = 'https://example.supabase.co/storage/v1/object/sign/documents/developments/abc/cover/front.png?token=expired'
const landing = { name: 'Madison Place', marketing: { listingOverview: { seoTitle: 'Madison Place | Bardene', seoMetaDescription: 'New homes in Boksburg.' }, mediaLibrary: { coverImageUrl: cover } } }

test('development HTML contains saved SEO metadata and retains the app shell', async () => {
  const result = await createDevelopmentPageResponse({
    url: '/api/public/development-page?slug=madison-place-abcf1b8a',
    headers: { host: 'app.arch9.co.za' },
    dependencies: { loadLanding: async () => landing, fetchShell: async () => ({ ok: true, text: async () => shell }) },
  })
  assert.equal(result.status, 200)
  assert.match(result.body, /<title>Madison Place \| Bardene<\/title>/)
  assert.match(result.body, /property="og:image" content="https:\/\/app\.arch9\.co\.za\/api\/public\/development-share-image\?slug=madison-place-abcf1b8a&amp;v=[a-f0-9]{12}"/)
  assert.match(result.body, /src="\/assets\/app\.js"/)
  assert.doesNotMatch(result.body, /The Future of Property|brand\/old\.jpg/)
})

test('metadata escapes saved text', () => {
  const html = buildDevelopmentPageHtml(shell, { title: '<Bad & Co>', description: 'A "home"', url: 'https://app.arch9.co.za/development/test', image: '' })
  assert.match(html, /&lt;Bad &amp; Co&gt;/)
  assert.match(html, /A &quot;home&quot;/)
})

test('share image URL directly serves an optimized current cover', async () => {
  let signedPath = ''
  const source = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#aec2bd' } }).png().toBuffer()
  const result = await createDevelopmentShareImageResponse({
    url: '/api/public/development-share-image?slug=madison-place-abcf1b8a',
    headers: { host: 'app.arch9.co.za' },
    env: { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-key' },
    dependencies: {
      loadLanding: async () => landing,
      signCover: async (path) => { signedPath = path; return { data: { signedUrl: `${cover}&fresh=yes` }, error: null } },
      fetchImage: async () => ({ ok: true, arrayBuffer: async () => source }),
    },
  })
  assert.equal(result.status, 200)
  assert.equal(signedPath, 'developments/abc/cover/front.png')
  assert.equal(result.headers['Content-Type'], 'image/jpeg')
  assert.deepEqual(await sharp(result.body).metadata().then(({ width, height }) => ({ width, height })), { width: 1200, height: 630 })
})

test('invalid slug is rejected before fetching data', async () => {
  const result = await createDevelopmentPageResponse({ url: '/api/public/development-page?slug=../admin', headers: { host: 'app.arch9.co.za' } })
  assert.equal(result.status, 400)
})
