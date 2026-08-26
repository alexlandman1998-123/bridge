import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/pages/AgentListings.jsx', import.meta.url), 'utf8')

assert.match(
  source,
  /CREATE_LISTING_DRAFT_UNSTORABLE_URL_PATTERN\s*=\s*\/\^\(data\|blob\):\/i/,
  'Create listing draft storage should treat data/blob image URLs as unsafe for localStorage.',
)

assert.match(
  source,
  /function saveCreateListingDraftToStorage[\s\S]*?try\s*{[\s\S]*?window\.localStorage\.setItem/,
  'Create listing draft saves should go through a guarded localStorage helper.',
)

assert.match(
  source,
  /catch\s*\(storageError\)[\s\S]*?window\.localStorage\.removeItem\(storageKey\)/,
  'Quota failures should remove the broken browser draft instead of crashing the application shell.',
)

assert.match(
  source,
  /if\s*\(isUnstorableCreateListingImageUrl\(draftImage\.url\)\)\s*{[\s\S]*?delete draftImage\.url/,
  'Draft serialization should strip base64/blob image previews before localStorage persistence.',
)

assert.doesNotMatch(
  source,
  /window\.localStorage\.setItem\(createListingDraftStorageKey/,
  'Create listing draft writes must not call localStorage.setItem directly.',
)

console.log('Create listing draft storage quota guard checks passed.')
