import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const detailSource = readFileSync(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
const panelSource = readFileSync(new URL('../src/components/listings/ListingShowDaysPanel.jsx', import.meta.url), 'utf8')
const repositorySource = readFileSync(new URL('../src/services/marketingEventRepository.js', import.meta.url), 'utf8')

const channelsIndex = detailSource.indexOf('id="listing-distribution-channels"')
const showDaysIndex = detailSource.indexOf('<ListingShowDaysPanel')
assert.ok(channelsIndex >= 0 && showDaysIndex > channelsIndex, 'Show Days must appear below Listing Channels.')
assert.match(panelSource, /createMarketingEvent/, 'Listing show days must use the canonical marketing-event repository.')
assert.match(panelSource, /buildListingShowDayRsvpPath/, 'A saved show day must expose its canonical RSVP route.')
assert.match(panelSource, /section=show-days&view=detail&id=/, 'Created show days must link into Marketing → Events → Show Days.')
assert.match(panelSource, /Publish and create RSVP/, 'The modal must expose the publish-and-RSVP action.')
assert.match(panelSource, /Save draft/, 'An unpublished listing must still support a safe show-day draft.')
assert.match(repositorySource, /from\('marketing_events'\)/, 'Show Days and the listing modal must share the marketing_events table.')

console.log('Listing marketing phase 4 show-day workflow contract passed')
