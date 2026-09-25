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

test('unpublished changes have a channel-aware review interface', () => {
  assert.match(detail, /title="Publication changes"/)
  assert.match(detail, /Compare the current Arch9 record with the last snapshot accepted by each channel/)
  assert.match(detail, /Unpublished changes/)
  assert.match(detail, /Changes not published/)
  assert.match(detail, /Matches verified snapshot/)
  assert.match(detail, /Snapshot starts on next update/)
})

test('agency website publication participates in the same lifecycle ledger', () => {
  assert.match(websitePanel, /onPublicationAction/)
  assert.match(websitePanel, /stage: 'submitted'/)
  assert.match(websitePanel, /stage: 'accepted'/)
  assert.match(websitePanel, /stage: 'failed'/)
  assert.match(detail, /onPublicationAction=\{handleAgencyWebsitePublicationAction\}/)
  assert.match(detail, /publicationState=\{listingPublicationStates\.agency_website\}/)
})
