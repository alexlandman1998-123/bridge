import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  buildListingLeadMetrics,
  isBookedListingViewing,
} from '../src/services/listings/listingLeadMetrics.js'

const now = new Date('2026-09-24T12:00:00.000Z')
const rows = [
  {
    leadId: 'lead-new-contacted',
    createdAt: '2026-09-23T10:00:00.000Z',
    contactedAt: '2026-09-23T11:00:00.000Z',
    statusGroup: 'contacted',
    viewings: [],
  },
  {
    leadId: 'lead-confirmed-viewing',
    createdAt: '2026-09-16T10:00:00.000Z',
    statusGroup: 'viewing',
    viewings: [{ status: 'confirmed' }],
  },
  {
    leadId: 'lead-cancelled-viewing',
    createdAt: '2026-08-01T10:00:00.000Z',
    statusGroup: 'new',
    viewings: [{ status: 'cancelled' }],
  },
  {
    leadId: 'lead-advanced-without-timestamp',
    createdAt: '2026-07-01T10:00:00.000Z',
    statusGroup: 'offer',
    viewings: [],
  },
  {
    leadId: 'lead-future-data-error',
    createdAt: '2026-09-25T10:00:00.000Z',
    statusGroup: 'new',
    viewings: [],
  },
]

const metrics = buildListingLeadMetrics(rows, { now })
assert.equal(metrics.total, 5)
assert.equal(metrics.newThisWeek, 1)
assert.equal(metrics.contacted, 3)
assert.equal(metrics.viewingsBooked, 1)
assert.equal(metrics.percent(1), '20% of total')
assert.equal(buildListingLeadMetrics([], { now }).percent(0), '0% of total')
assert.equal(isBookedListingViewing({ status: 'confirmed' }), true)
assert.equal(isBookedListingViewing({ status: 'completed' }), true)
assert.equal(isBookedListingViewing({ status: 'no_show' }), true)
assert.equal(isBookedListingViewing({ status: 'pending_approval' }), false)
assert.equal(isBookedListingViewing({ status: 'declined' }), false)
assert.equal(isBookedListingViewing({ status: 'cancelled' }), false)

const listingDetail = await readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
const listingInterestService = await readFile(new URL('../src/services/leadListingInterestService.js', import.meta.url), 'utf8')
const leadsTabStart = listingDetail.indexOf("sellerWorkspaceTab === 'leads'")
const leadsTabEnd = listingDetail.indexOf("sellerWorkspaceTab === 'marketing'", leadsTabStart)
const leadsTab = listingDetail.slice(leadsTabStart, leadsTabEnd > leadsTabStart ? leadsTabEnd : undefined)

assert.match(listingDetail, /buildListingLeadMetrics\(listingLeadRows\)/)
assert.match(listingDetail, /bookedViewingCount: viewingRows\.filter\(isBookedListingViewing\)\.length/)
assert.match(listingInterestService, /firstContactedAt: row\?\.firstContactedAt \|\| row\?\.first_contacted_at/)
assert.match(listingInterestService, /lastContactedAt: row\?\.lastContactedAt \|\| row\?\.last_contacted_at/)
assert.match(leadsTab, /label: 'Total leads'/)
assert.match(leadsTab, /label: 'New this week'/)
assert.match(leadsTab, /label: 'Contacted'/)
assert.match(leadsTab, /label: 'Viewings booked'/)
assert.doesNotMatch(leadsTab, /label: 'Offers'/)
assert.doesNotMatch(leadsTab, /label: 'Converted'/)
assert.match(leadsTab, /sm:grid-cols-2 xl:grid-cols-4/)

console.log('Listing Leads Phase 3 metric contract passed')
