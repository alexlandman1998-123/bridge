import { test } from 'node:test'
import assert from 'node:assert/strict'
import { visibleArticles, publicArticles } from './articles.ts'

const now = new Date('2026-09-08T12:00:00Z')
const article = { slug: 'guide', title: 'Guide', status: 'published', publishedAt: '2026-09-01', audience: 'shared' }
test('draft and future articles cannot be published', () => {
  assert.deepEqual(visibleArticles([{ ...article, status: 'draft' }, { ...article, publishedAt: '2027-01-01' }, { ...article, publishedAt: 'invalid' }], 'site-a', now), [])
})
test('articles are isolated by resolved website site ID', () => {
  const privateArticle = { ...article, audience: 'site', siteIds: ['site-a'] }
  assert.equal(visibleArticles([privateArticle], 'site-a', now).length, 1)
  assert.equal(visibleArticles([privateArticle], 'site-b', now).length, 0)
  assert.equal(visibleArticles([{ ...privateArticle, audience: 'invalid' }], 'site-a', now).length, 0)
  assert.equal(visibleArticles([{ ...article, audience: 'site' }], 'site-a', now).length, 0)
})
test('explicitly shared guides are public and catalogue slugs are unique', () => {
  assert.equal(visibleArticles([article], 'site-b', now).length, 1)
  const posts = publicArticles('site-a', now)
  assert.equal(new Set(posts.map(post => post.slug)).size, posts.length)
  for (const post of posts) assert.match(post.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/)
})
