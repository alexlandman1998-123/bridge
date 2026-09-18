import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('public website identity is always resolved from the published revision', () => {
  const repository = read('./site-repository.ts')
  const chrome = read('../components/site-chrome.tsx')

  assert.match(repository, /\.eq\('id', site\.published_revision_id\)/)
  assert.match(repository, /\.eq\('status', 'published'\)/)
  assert.match(repository, /logoLightUrl: brand\.logoLightUrl/)
  assert.match(repository, /logoDarkUrl: brand\.logoDarkUrl/)
  assert.match(repository, /logoIconUrl: brand\.logoIconUrl/)
  assert.match(repository, /website: brand\.website/)
  assert.match(chrome, /selectWebsiteLogo\(site, dark\)/)
  assert.match(chrome, /publicWebsiteHref\(site\.website\)/)
})
