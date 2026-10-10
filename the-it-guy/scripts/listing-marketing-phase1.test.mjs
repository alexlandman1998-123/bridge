import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const detailSource = fs.readFileSync(path.join(root, 'src/pages/AgentListingDetail.jsx'), 'utf8')

test('marketing has one edit route and no duplicate save toolbar', () => {
  assert.match(detailSource, /onClick=\{openPropertyDetailsFromMarketing\}/)
  assert.doesNotMatch(detailSource, /Marketing changes saved/)
  assert.doesNotMatch(detailSource, /Save the Arch9 record before reviewing/)
  assert.doesNotMatch(detailSource, /Save Arch9 changes/)
  assert.match(detailSource, /onEdit=\{openPropertyDetailsFromMarketing\}/)
})

test('marketing navigation and unsafe media have explicit safeguards', () => {
  assert.match(detailSource, /addEventListener\('beforeunload'/)
  assert.match(detailSource, /You have unsaved marketing changes/)
  assert.match(detailSource, /Local previews cannot be published/)
  assert.match(detailSource, /ensureMarketingMediaReady\(marketingDraft, 'publishing to Property24'\)/)
  assert.match(detailSource, /ensureMarketingMediaReady\(marketingDraft, 'publishing to Private Property'\)/)
})

test('canonical onboarding persistence allows intentional marketing clears', () => {
  for (const field of [
    'amenities',
    'propertyDescription',
    'listingDescription',
    'listingPreviewDescription',
    'imageGallery',
    'floorplans',
    'videoLink',
    'virtualTourLink',
  ]) {
    assert.match(detailSource, new RegExp(`'${field}'`))
  }
})
