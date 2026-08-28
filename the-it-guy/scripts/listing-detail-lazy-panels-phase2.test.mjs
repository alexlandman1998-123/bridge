import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const detailSource = await readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
const serviceSource = await readFile(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8')

test('listing detail renders from a base-record shell before hydrating panel data', () => {
  assert.match(detailSource, /const LISTING_DETAIL_SHELL_OPTIONS = Object\.freeze\(\{[\s\S]*includeOnboarding: false,[\s\S]*includeRequirementsAndDocuments: false,[\s\S]*includeDistributionData: false,[\s\S]*includeMandatePacket: false,[\s\S]*includeMedia: false,[\s\S]*includeAssignedAgent: false,/)
  assert.match(detailSource, /getPrivateListing\(dbLookupListingId, LISTING_DETAIL_SHELL_OPTIONS\)/)
  assert.match(detailSource, /markQueryBaselineFirstUsefulContent\(location\.pathname, \{ page: 'listing_detail' \}\)/)
})

test('panel hydration is incremental and retains sections loaded by earlier tabs', () => {
  assert.match(detailSource, /function getListingPanelHydrationOptions\(activeTab, sellerWorkspaceTab\)/)
  assert.match(detailSource, /const hasNewSection = optionNames\.some\(\(name\) => requestedOptions\[name\] && !previousOptions\[name\]\)/)
  assert.match(detailSource, /accumulator\[name\] = Boolean\(previousOptions\[name\] \|\| requestedOptions\[name\]\)/)
  assert.match(detailSource, /listingPanelHydrationRequestRef\.current !== requestId/)
})

test('private listing loader can skip every expensive relation without changing full-load defaults', () => {
  for (const defaultedOption of [
    'includeOnboarding = true',
    'includeRequirementsAndDocuments = true',
    'includeDistributionData = true',
    'includeMedia = true',
    'includeAssignedAgent = true',
  ]) {
    assert.match(serviceSource, new RegExp(defaultedOption))
  }
  assert.match(serviceSource, /includeMandatePacket = includeRequirementsAndDocuments/)
  assert.match(serviceSource, /includeOnboarding \? fetchOnboardingRowsForListings/)
  assert.match(serviceSource, /includeDistributionData \? fetchExternalLinkRowsForListings/)
  assert.match(serviceSource, /includeDistributionData \? fetchPublicationRowsForListings/)
  assert.match(serviceSource, /includeMandatePacket \? fetchMandatePacketRowsForListings/)
  assert.match(serviceSource, /includeMedia \? fetchMediaRowsForListings/)
  assert.match(serviceSource, /includeAssignedAgent \? fetchAssignedAgentProfilesForListings/)
})

test('secondary query groups only activate for their owning panel', () => {
  assert.match(detailSource, /activeTab !== 'seller' \|\| sellerWorkspaceTab !== 'seller'/)
  assert.match(detailSource, /activeTab !== 'offers'/)
  assert.match(detailSource, /isInterestedLeadsPanelActive/)
  assert.match(detailSource, /isCommunicationHistoryPanelActive/)
  assert.match(detailSource, /isSuggestionsPanelActive/)
  assert.match(detailSource, /activeTab !== 'pipeline' \|\| !listingId/)
})

