import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const detail = fs.readFileSync(path.join(root, 'src/pages/AgentListingDetail.jsx'), 'utf8')
const websitePanel = fs.readFileSync(path.join(root, 'src/components/listings/WebsiteListingPublicationPanel.jsx'), 'utf8')
const channelState = fs.readFileSync(path.join(root, 'src/services/listings/listingChannelUpdateState.js'), 'utf8')

test('listing marketing tracks submitted, accepted, verified and failed publication stages', () => {
  assert.match(detail, /listing_channel_publication_\$\{normalizedStage\}/)
  assert.match(detail, /recordListingPublicationStage\('Property24', 'submitted'/)
  assert.match(detail, /recordListingPublicationStage\('Property24', 'accepted'/)
  assert.match(detail, /recordListingPublicationStage\('Private Property', 'submitted'/)
  assert.match(detail, /recordListingPublicationStage\('Private Property', 'accepted'/)
  assert.match(detail, /recordListingPublicationStage\('Arch9 public catalogue', 'verified'/)
  assert.match(channelState, /listing_channel_publication_accepted/)
})

test('content publishing and error fixes belong to listing setup', () => {
  const marketing = detail.slice(detail.indexOf('function renderMarketingConsole()'), detail.indexOf('function renderListingLeads'))
  assert.doesNotMatch(marketing, /Publication changes|Unpublished changes|Review issues|Listing readiness|onReviewChanges/)
  assert.match(marketing, /onClick=\{openPropertyDetailsFromMarketing\}/)
  assert.match(marketing, /simpleChannelMenu/)
  assert.match(detail, /ListingChannelLastUpdate/)
})

test('agency website publication participates in the same lifecycle ledger', () => {
  assert.match(websitePanel, /onPublicationAction/)
  assert.match(websitePanel, /stage: 'submitted'/)
  assert.match(websitePanel, /stage: 'accepted'/)
  assert.match(websitePanel, /stage: 'failed'/)
  assert.match(detail, /onPublicationAction=\{handleAgencyWebsitePublicationAction\}/)
  assert.match(detail, /publicationState=\{listingPublicationStates\.agency_website\}/)
})
