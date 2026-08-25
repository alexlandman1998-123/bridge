import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildListingWorkspacePortalSummary,
} from '../src/services/listings/listingWorkspaceUiModel.js'

const root = resolve(process.cwd())
const shellSource = readFileSync(resolve(root, 'src/components/listings/ListingWorkspaceShell.jsx'), 'utf8')
const modelSource = readFileSync(resolve(root, 'src/services/listings/listingWorkspaceUiModel.js'), 'utf8')
const salesSource = readFileSync(resolve(root, 'src/pages/AgentListingDetail.jsx'), 'utf8')
const rentalSource = readFileSync(resolve(root, 'src/pages/rentals/RentalListingDetailPage.jsx'), 'utf8')
const docSource = readFileSync(resolve(root, 'docs/listing-portal-readiness-phase5.md'), 'utf8')

const publishedSummary = buildListingWorkspacePortalSummary({
  type: 'sales',
  portal: 'Property24',
  published: true,
  reference: 'P24-123',
  lastSynced: 'Last synced: today',
  detail: 'Live listing.',
  actionLabel: 'Open syndication',
  actionTarget: 'property24',
})

assert.equal(publishedSummary.type, 'sales')
assert.equal(publishedSummary.portal, 'Property24')
assert.equal(publishedSummary.label, 'Published')
assert.equal(publishedSummary.tone, 'success')
assert.equal(publishedSummary.reference, 'P24-123')
assert.equal(publishedSummary.actionTarget, 'property24')

const missingSummary = buildListingWorkspacePortalSummary({
  type: 'rentals',
  portal: 'Property24',
  checked: true,
  missingFields: ['Monthly rent'],
})

assert.equal(missingSummary.type, 'rentals')
assert.equal(missingSummary.label, 'Missing fields')
assert.equal(missingSummary.tone, 'warning')
assert.deepEqual(missingSummary.issues, ['Monthly rent'])

assert.match(modelSource, /export function buildListingWorkspacePortalSummary/)
assert.match(shellSource, /export function ListingWorkspacePortalReadinessGrid/)
assert.match(shellSource, /data-testid=\{testId\}/)
assert.match(shellSource, /ListingWorkspaceStatusPill/)

assert.match(salesSource, /ListingWorkspacePortalReadinessGrid/)
assert.match(salesSource, /buildListingWorkspacePortalSummary/)
assert.match(salesSource, /testId="sales-listing-portal-readiness"/)
assert.match(salesSource, /portal: 'Property24'/)
assert.match(salesSource, /portal: 'Private Property'/)
assert.match(salesSource, /handleSalesPortalReadinessAction/)

assert.match(rentalSource, /ListingWorkspacePortalReadinessGrid/)
assert.match(rentalSource, /buildListingWorkspacePortalSummary/)
assert.match(rentalSource, /testId="rental-listing-portal-readiness"/)
assert.match(rentalSource, /portal: 'Property24'/)
assert.match(rentalSource, /handleRentalPortalReadinessAction/)

assert.match(docSource, /No Property24 payload mapping changed/)
assert.match(docSource, /No Private Property payload mapping changed/)
assert.match(docSource, /Rental Private Property remains backend-supported/)

console.log('Listing portal readiness Phase 5 checks passed.')
