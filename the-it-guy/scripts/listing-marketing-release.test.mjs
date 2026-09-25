import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const detailSource = readFileSync(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
const websiteSource = readFileSync(new URL('../src/components/listings/WebsiteListingPublicationPanel.jsx', import.meta.url), 'utf8')
const lifecycleSource = readFileSync(new URL('../src/services/listings/listingPublicationState.js', import.meta.url), 'utf8')

test('withdrawal results close the publication lifecycle for every attempted channel', () => {
  assert.match(detailSource, /listing_channel_withdrawal_succeeded/)
  assert.match(detailSource, /listing_channel_withdrawal_failed/)
  assert.match(detailSource, /attemptedChannelKeys/)
  assert.match(lifecycleSource, /states\[key\]\.stage = 'withdrawn'/)
  assert.match(lifecycleSource, /states\[key\]\.stage = 'withdrawal_failed'/)
})

test('intentional withdrawals render as withdrawn instead of portal errors', () => {
  assert.match(detailSource, /property24IntentionallyInactive/)
  assert.match(detailSource, /privatePropertyIntentionallyInactive/)
  assert.match(detailSource, /Removed through the Arch9 withdrawal workflow/)
  assert.match(detailSource, /withdrawal_failed: 'Withdrawal needs attention'/)
  assert.match(websiteSource, /publicationState\?\.stage === 'withdrawn'/)
})
