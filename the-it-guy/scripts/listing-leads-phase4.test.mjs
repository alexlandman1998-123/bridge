import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  clampListingLeadPage,
  escapeListingLeadCsvValue,
  filterListingLeadRows,
} from '../src/services/listings/listingLeadListModel.js'

const now = new Date(2026, 8, 24, 12, 0, 0)
const rows = [
  { leadId: 'same-day', name: 'Alice Buyer', sourceLabel: 'Property24', statusGroup: 'new', createdAt: new Date(2026, 8, 24, 1, 0, 0).toISOString(), bookedViewingCount: 0, offerCount: 0 },
  { leadId: 'previous-day', name: 'Bob Buyer', sourceLabel: 'Private Property', statusGroup: 'new', createdAt: new Date(2026, 8, 23, 20, 0, 0).toISOString(), bookedViewingCount: 0, offerCount: 0 },
  { leadId: 'booked', name: 'Carol Buyer', sourceLabel: 'Arch9', statusGroup: 'viewing', createdAt: new Date(2026, 8, 20, 9, 0, 0).toISOString(), bookedViewingCount: 1, viewingCount: 1, offerCount: 0 },
  { leadId: 'cancelled', name: 'Dan Buyer', sourceLabel: 'Arch9', statusGroup: 'new', createdAt: new Date(2026, 8, 19, 9, 0, 0).toISOString(), bookedViewingCount: 0, viewingCount: 1, offerCount: 0 },
  { leadId: 'contacted', name: 'Eve Buyer', sourceLabel: 'Manual', statusGroup: 'new', createdAt: new Date(2026, 8, 18, 9, 0, 0).toISOString(), firstContactedAt: new Date(2026, 8, 18, 10, 0, 0).toISOString(), bookedViewingCount: 0, offerCount: 0 },
  { leadId: 'future', name: 'Future Buyer', sourceLabel: 'Manual', statusGroup: 'new', createdAt: new Date(2026, 8, 25, 9, 0, 0).toISOString(), bookedViewingCount: 0, offerCount: 0 },
]

assert.deepEqual(filterListingLeadRows(rows, { date: 'today' }, { now }).map((row) => row.leadId), ['same-day'])
assert.deepEqual(filterListingLeadRows(rows, { activity: 'has_viewing' }, { now }).map((row) => row.leadId), ['booked'])
assert.deepEqual(filterListingLeadRows(rows, { activity: 'needs_follow_up' }, { now }).map((row) => row.leadId), ['same-day', 'previous-day', 'cancelled', 'future'])
assert.deepEqual(filterListingLeadRows(rows, { search: 'alice', source: 'Property24', status: 'new' }, { now }).map((row) => row.leadId), ['same-day'])
assert.deepEqual(clampListingLeadPage(4, 11, 10), { page: 2, pageCount: 2 })
assert.deepEqual(clampListingLeadPage(3, 0, 10), { page: 1, pageCount: 1 })
assert.equal(escapeListingLeadCsvValue('Normal "buyer"'), '"Normal ""buyer"""')
assert.equal(escapeListingLeadCsvValue('=HYPERLINK("bad")'), '"\'=HYPERLINK(""bad"")"')
assert.equal(escapeListingLeadCsvValue(' +SUM(1,2)'), '"\' +SUM(1,2)"')

const listingDetail = await readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
assert.match(listingDetail, /filterListingLeadRows\(listingLeadRows/)
assert.match(listingDetail, /clampListingLeadPage\(page, filteredListingLeadRows\.length/)
assert.match(listingDetail, /escapeListingLeadCsvValue/)
assert.match(listingDetail, /window\.addEventListener\(AGENCY_CRM_UPDATED_EVENT, refreshListingLeads\)/)
assert.match(listingDetail, /detail\.organisationId && detail\.organisationId !== listingOrganisationId/)
assert.match(listingDetail, /Clear filters/)

console.log('Listing Leads Phase 4 reliability contract passed')
