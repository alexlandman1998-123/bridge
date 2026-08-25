import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildListingWorkspacePortalChecklist,
  buildListingWorkspacePortalSummary,
} from '../src/services/listings/listingWorkspaceUiModel.js'

const root = resolve(process.cwd())
const shellSource = readFileSync(resolve(root, 'src/components/listings/ListingWorkspaceShell.jsx'), 'utf8')
const modelSource = readFileSync(resolve(root, 'src/services/listings/listingWorkspaceUiModel.js'), 'utf8')
const salesSource = readFileSync(resolve(root, 'src/pages/AgentListingDetail.jsx'), 'utf8')
const rentalSource = readFileSync(resolve(root, 'src/pages/rentals/RentalListingDetailPage.jsx'), 'utf8')
const docSource = readFileSync(resolve(root, 'docs/listing-portal-checklist-phase7.md'), 'utf8')
const packageSource = readFileSync(resolve(root, 'package.json'), 'utf8')

const checklist = buildListingWorkspacePortalChecklist([
  buildListingWorkspacePortalSummary({
    type: 'sales',
    portal: 'Property24',
    checked: true,
    missingFields: ['Listing description'],
    setupBlockers: ['Property24 agent mapping'],
  }),
  buildListingWorkspacePortalSummary({
    type: 'sales',
    portal: 'Private Property',
    published: true,
  }),
], { type: 'sales' })

assert.equal(checklist.length, 4)
assert.equal(checklist[0].key, 'portal_setup')
assert.equal(checklist[0].status, 'Needs setup')
assert.equal(checklist[0].tone, 'warning')
assert.deepEqual(checklist[0].issues, ['Property24: Property24 agent mapping'])

assert.equal(checklist[1].key, 'listing_fields')
assert.equal(checklist[1].status, 'Incomplete')
assert.deepEqual(checklist[1].issues, ['Property24: Listing description'])

assert.equal(checklist[2].key, 'readiness_check')
assert.equal(checklist[2].status, 'Checked')
assert.equal(checklist[3].key, 'publish_tracking')
assert.equal(checklist[3].status, '1 live')

const rentalChecklist = buildListingWorkspacePortalChecklist([
  buildListingWorkspacePortalSummary({
    type: 'rentals',
    portal: 'Property24',
  }),
], { type: 'rentals' })

assert.equal(rentalChecklist[1].label, 'Rental listing details')
assert.equal(rentalChecklist[2].status, 'Check needed')
assert.equal(rentalChecklist[3].status, 'Not live yet')

assert.match(modelSource, /export function buildListingWorkspacePortalChecklist/)
assert.match(modelSource, /buildPortalIssueList/)
assert.match(shellSource, /export function ListingWorkspacePortalChecklist/)
assert.match(shellSource, /Publishing checklist/)

assert.match(salesSource, /ListingWorkspacePortalChecklist/)
assert.match(salesSource, /buildListingWorkspacePortalChecklist/)
assert.match(salesSource, /salesPortalChecklist/)
assert.match(salesSource, /testId="sales-listing-portal-checklist"/)

assert.match(rentalSource, /ListingWorkspacePortalChecklist/)
assert.match(rentalSource, /buildListingWorkspacePortalChecklist/)
assert.match(rentalSource, /rentalPortalChecklist/)
assert.match(rentalSource, /testId="rental-listing-portal-checklist"/)

assert.match(docSource, /No Property24 payload mapping changed/)
assert.match(docSource, /portal setup issues from listing field issues/)
assert.match(packageSource, /test:listing-portal-checklist-phase7/)

console.log('Listing portal checklist Phase 7 checks passed.')
