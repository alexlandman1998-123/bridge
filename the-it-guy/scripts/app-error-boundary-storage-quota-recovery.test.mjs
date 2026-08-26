import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/components/AppErrorBoundary.jsx', import.meta.url), 'utf8')

assert.match(
  source,
  /CREATE_LISTING_DRAFT_STORAGE_PREFIX\s*=\s*'itg:agent-listings:create-draft:v1:'/,
  'App error recovery should target only create-listing draft storage keys.',
)

assert.match(
  source,
  /function isBrowserStorageQuotaError[\s\S]*?storage[\s\S]*?setitem[\s\S]*?quota/,
  'App error boundary should recognise browser storage quota failures.',
)

assert.match(
  source,
  /function clearCreateListingDraftStorage[\s\S]*?startsWith\(CREATE_LISTING_DRAFT_STORAGE_PREFIX\)[\s\S]*?localStorage\.removeItem/,
  'Storage quota recovery should clear only listing draft keys.',
)

assert.match(
  source,
  /Local listing draft is too large/,
  'Storage quota recovery should show a plain-English recovery title.',
)

assert.match(
  source,
  /Clear Local Draft/,
  'Storage quota recovery should expose a user-facing button.',
)

console.log('App error boundary storage quota recovery checks passed.')
