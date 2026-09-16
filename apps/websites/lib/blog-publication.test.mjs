import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { applyBlogMediaAssets, visiblePublishedBlogPosts } from './blog-publication.ts'

const now = new Date('2026-09-13T12:00:00Z')
const post = {
  id: 'post-a', organisation_id: 'organisation-a', website_site_id: 'site-a', revision_id: 'revision-live', title: 'A market update', slug: 'market-update', summary: 'A concise update.', body: 'A useful update for buyers and sellers.', status: 'published', published_at: '2026-09-12T09:00:00Z',
}

test('only published posts for the resolved organisation and site reach a public route', () => {
  const visible = visiblePublishedBlogPosts([
    post,
    { ...post, id: 'draft', status: 'draft' },
    { ...post, id: 'other-site', website_site_id: 'site-b' },
    { ...post, id: 'other-organisation', organisation_id: 'organisation-b' },
    { ...post, id: 'archived-revision', revision_id: 'revision-archived' },
    { ...post, id: 'future', published_at: '2026-10-01T09:00:00Z' },
  ], 'site-a', 'organisation-a', 'revision-live', now)
  assert.deepEqual(visible.map((item) => item.id), ['post-a'])
})

test('invalid public slugs and unsafe cover-image URLs are rejected or withheld', () => {
  assert.equal(visiblePublishedBlogPosts([{ ...post, slug: 'unsafe slug' }], 'site-a', 'organisation-a', 'revision-live', now).length, 0)
  const [visible] = visiblePublishedBlogPosts([{ ...post, cover_image_url: 'http://insecure.example/image.jpg', cover_image_alt: 'Image' }], 'site-a', 'organisation-a', 'revision-live', now)
  assert.equal(visible.coverImageUrl, undefined)
})

test('structured media and listing blocks keep only safe, reference-based content', () => {
  const [visible] = visiblePublishedBlogPosts([{ ...post, content_blocks: [
    { id: 'tip-1', type: 'tip', text: 'Ask for the rates clearance certificate.', tipRole: 'seller' },
    { id: 'image-1', type: 'image', assetId: 'asset-1', caption: 'A view from the terrace.' },
    { id: 'listing-1', type: 'listing_card', listingId: 'listing-1' },
    { id: 'unsafe-image', type: 'image', text: 'https://untrusted.example/image.jpg' },
  ] }], 'site-a', 'organisation-a', 'revision-live', now)
  assert.deepEqual(visible.contentBlocks.map((block) => block.type), ['tip', 'image', 'listing_card'])
  assert.equal(visible.contentBlocks[1].assetId, 'asset-1')
  assert.equal(visible.contentBlocks[2].listingId, 'listing-1')
})

test('published articles retain their featured and inline images after public media resolution', () => {
  const [visible] = visiblePublishedBlogPosts([{ ...post,
    cover_image_url: 'https://project.supabase.co/storage/v1/object/public/website-media/cover.jpg',
    cover_image_alt: 'A Moot home at sunset',
    content_blocks: [{ id: 'image-1', type: 'image', assetId: 'asset-1', caption: 'A local street scene.' }],
  }], 'site-a', 'organisation-a', 'revision-live', now)
  const [resolved] = applyBlogMediaAssets([visible], [{
    id: 'asset-1',
    public_url: 'https://project.supabase.co/storage/v1/object/public/website-media/inline.jpg',
    alt_text: 'A leafy Moot street',
  }])
  assert.equal(resolved.coverImageUrl, 'https://project.supabase.co/storage/v1/object/public/website-media/cover.jpg')
  assert.equal(resolved.coverImageAlt, 'A Moot home at sunset')
  assert.equal(resolved.contentBlocks[0].imageUrl, 'https://project.supabase.co/storage/v1/object/public/website-media/inline.jpg')
  assert.equal(resolved.contentBlocks[0].imageAlt, 'A leafy Moot street')
})

test('the public repository selects structured blocks and publishing lifecycle fields', () => {
  const repository = readFileSync(new URL('./site-repository.ts', import.meta.url), 'utf8')
  assert.match(repository, /content_blocks, author_name, status, lifecycle_status, scheduled_for, published_at/)
  assert.match(repository, /applyBlogMediaAssets\(posts, assets \|\| \[\]\)/)
})

test('archived and future scheduled articles remain out of the public route', () => {
  const visible = visiblePublishedBlogPosts([
    { ...post, id: 'archived', lifecycle_status: 'archived' },
    { ...post, id: 'scheduled-later', lifecycle_status: 'scheduled', scheduled_for: '2026-09-14T09:00:00Z' },
    { ...post, id: 'scheduled-now', lifecycle_status: 'scheduled', scheduled_for: '2026-09-12T09:00:00Z' },
  ], 'site-a', 'organisation-a', 'revision-live', now)
  assert.deepEqual(visible.map((item) => item.id), ['scheduled-now'])
})

test('the homepage uses published blog posts instead of static neighbourhood content', () => {
  const contentBlocks = readFileSync(new URL('../components/content-blocks.tsx', import.meta.url), 'utf8')
  const homePage = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8')

  assert.match(contentBlocks, /function LatestBlogPosts/, 'renders a dedicated published-post preview')
  assert.match(contentBlocks, /if \(!latestPosts\.length\) return null/, 'does not show placeholder content when no posts are published')
  assert.match(contentBlocks, /href=\{`\/blog\/\$\{post\.slug\}`\}/, 'links cards to the public article route')
  assert.doesNotMatch(contentBlocks, /Find your neighbourhood|Waterkloof|Brooklyn|Lynnwood/, 'removes the static neighbourhood cards')
  assert.match(homePage, /getPublicBlogPosts/, 'loads public posts through the tenant-scoped repository')
  assert.match(homePage, /blogPosts=\{blogPosts\}/, 'passes published posts into the homepage renderer')
})
