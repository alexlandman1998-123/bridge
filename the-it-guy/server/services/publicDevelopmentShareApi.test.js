import assert from 'node:assert/strict'
import test from 'node:test'
import sharp from 'sharp'
import { buildDevelopmentPageHtml, createDevelopmentLandingResponse, createDevelopmentPageResponse, createDevelopmentShareImageResponse } from './publicDevelopmentShareApi.js'

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

test('Madison domain serves its own shell and canonical homepage without a redirect', async () => {
  for (const host of ['madisonplace.co.za', 'www.madisonplace.co.za']) {
    const result = await createDevelopmentPageResponse({
      url: '/api/public/development-page?slug=madison-place-abcf1b8a',
      headers: { host },
      dependencies: {
        loadLanding: async () => landing,
        fetchShell: async (url) => {
          assert.equal(url, `https://${host}/index.html`)
          return { ok: true, text: async () => shell }
        },
      },
    })
    assert.equal(result.status, 200)
    assert.equal(result.headers.Location, undefined)
    assert.match(result.body, /rel="canonical" href="https:\/\/madisonplace\.co\.za\/"/)
    assert.match(result.body, /property="og:url" content="https:\/\/madisonplace\.co\.za\/"/)
  }
})

test('unrecognized hosts cannot control shell fetches and other development links retain their paths', async () => {
  for (const [host, origin] of [['attacker.test', 'https://app.arch9.co.za'], ['madisonplace.co.za', 'https://madisonplace.co.za']]) {
    const result = await createDevelopmentPageResponse({
      url: '/api/public/development-page?slug=another-development',
      headers: { host },
      dependencies: {
        loadLanding: async () => landing,
        fetchShell: async (url) => {
          assert.equal(url, `${origin}/index.html`)
          return { ok: true, text: async () => shell }
        },
      },
    })
    assert.equal(result.status, 200)
    assert.ok(result.body.includes(`rel="canonical" href="${origin}/development/another-development"`))
  }
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

test('published media is renewed everywhere it is referenced, including nested visual-map scenes', async () => {
  const plan = cover.replace('/cover/front.png', '/site_plan/plan.png')
  const data = { ...landing, id: 'abc', assets: [{ fileUrl: cover }, { fileUrl: plan }], marketing: { mediaLibrary: { coverImageUrl: cover, gallery: [cover], visualMap: { scenes: [{ imageUrl: plan }] } } } }
  const result = await createDevelopmentLandingResponse({
    url: '/api/public/development-landing?slug=madison-place-abcf1b8a',
    env: { SUPABASE_URL: 'https://example.supabase.co' },
    dependencies: {
      loadLanding: async () => data,
      signPaths: async (paths) => {
        assert.deepEqual(paths, ['developments/abc/cover/front.png', 'developments/abc/site_plan/plan.png'])
        return { data: paths.map(path => ({ path, signedUrl: `https://example.supabase.co/fresh/${path}` })), error: null }
      },
    },
  })
  assert.equal(result.status, 200)
  assert.equal(result.headers['Cache-Control'], 'no-store')
  const renewed = JSON.parse(result.body)
  assert.equal(renewed.marketing.mediaLibrary.coverImageUrl, 'https://example.supabase.co/fresh/developments/abc/cover/front.png')
  assert.equal(renewed.marketing.mediaLibrary.gallery[0], renewed.assets[0].fileUrl)
  assert.equal(renewed.marketing.mediaLibrary.visualMap.scenes[0].imageUrl, renewed.assets[1].fileUrl)
  assert.equal(data.assets[0].fileUrl, cover, 'Do not mutate persisted content or source payloads.')
})

test('signing is restricted to the published development and public marketing categories', async () => {
  const foreign = cover.replace('example.supabase.co', 'attacker.test')
  const anotherDevelopment = cover.replace('/abc/', '/other/')
  const legalDocument = cover.replace('/cover/', '/legal/')
  const unlisted = cover.replace('front.png', 'not-in-public-assets.png')
  const result = await createDevelopmentLandingResponse({
    url: '/api/public/development-landing?slug=madison-place-abcf1b8a&path=developments/abc/legal/private.pdf',
    env: { SUPABASE_URL: 'https://example.supabase.co' },
    dependencies: {
      loadLanding: async () => ({ id: 'abc', assets: [cover, foreign, anotherDevelopment, legalDocument].map(fileUrl => ({ fileUrl })), marketing: { arbitraryUrl: unlisted } }),
      signPaths: async (paths) => {
        assert.deepEqual(paths, ['developments/abc/cover/front.png'])
        return { data: [{ path: paths[0], signedUrl: 'https://example.supabase.co/fresh.png' }], error: null }
      },
    },
  })
  const data = JSON.parse(result.body)
  assert.equal(result.status, 200)
  assert.equal(data.assets[1].fileUrl, foreign)
  assert.equal(data.assets[2].fileUrl, anotherDevelopment)
  assert.equal(data.assets[3].fileUrl, legalDocument)
  assert.equal(data.marketing.arbitraryUrl, unlisted)
})

test('unpublished, invalid and non-read requests never sign files', async () => {
  let signed = false
  const dependencies = { loadLanding: async () => null, signPaths: async () => { signed = true } }
  assert.equal((await createDevelopmentLandingResponse({ url: '/?slug=hidden', dependencies })).status, 404)
  assert.equal((await createDevelopmentLandingResponse({ url: '/?slug=../private', dependencies })).status, 400)
  assert.equal((await createDevelopmentLandingResponse({ method: 'POST', url: '/?slug=test', dependencies })).status, 405)
  assert.equal(signed, false)
})

test('failed or incomplete signing returns a recoverable response instead of expired media', async () => {
  for (const signing of [{ data: [], error: null }, { data: null, error: new Error('private detail') }]) {
    const result = await createDevelopmentLandingResponse({
      url: '/?slug=madison-place-abcf1b8a',
      env: { SUPABASE_URL: 'https://example.supabase.co' },
      dependencies: { loadLanding: async () => ({ ...landing, id: 'abc', assets: [{ fileUrl: cover }] }), signPaths: async () => signing },
    })
    assert.equal(result.status, 503)
    assert.doesNotMatch(result.body, /private detail|token=expired/)
  }
})

test('renews variant logos and every URL in saved multiline galleries', async () => {
  const darkLogo = cover.replace('/cover/front.png', '/logo-dark/dark.png')
  const second = cover.replace('/cover/front.png', '/marketing/kitchen.png')
  const result = await createDevelopmentLandingResponse({
    url: '/?slug=madison-place-abcf1b8a',
    env: { SUPABASE_URL: 'https://example.supabase.co' },
    dependencies: {
      loadLanding: async () => ({ id: 'abc', assets: [], marketing: { mediaLibrary: { developmentLogoDarkUrl: darkLogo, galleryImageUrls: `${cover}\n${second}`, visualMap: { scenes: [{ background: { url: second } }] } } } }),
      signPaths: async (paths) => {
        assert.deepEqual(paths, ['developments/abc/logo-dark/dark.png', 'developments/abc/cover/front.png', 'developments/abc/marketing/kitchen.png'])
        return { data: paths.map(path => ({ path, signedUrl: `https://example.supabase.co/fresh/${path}` })), error: null }
      },
    },
  })
  const media = JSON.parse(result.body).marketing.mediaLibrary
  assert.equal(result.status, 200)
  assert.match(media.developmentLogoDarkUrl, /\/fresh\/developments\/abc\/logo-dark\/dark.png$/)
  assert.equal(media.galleryImageUrls, 'https://example.supabase.co/fresh/developments/abc/cover/front.png\nhttps://example.supabase.co/fresh/developments/abc/marketing/kitchen.png')
  assert.equal(media.visualMap.scenes[0].background.url, media.galleryImageUrls.split('\n')[1])
})
