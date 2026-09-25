import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const detailSource = fs.readFileSync(path.join(root, 'src/pages/AgentListingDetail.jsx'), 'utf8')

test('marketing actions are consolidated at the bottom of the tab', () => {
  assert.match(detailSource, /Unsaved marketing changes/)
  assert.match(detailSource, /Marketing changes saved/)
  assert.match(detailSource, /Preview listing/)
  assert.match(detailSource, /Review channels/)
  assert.match(detailSource, /Save changes/)
  assert.doesNotMatch(detailSource, /<section className="space-y-5">\s*<div className="flex flex-wrap justify-end gap-2">/)
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
