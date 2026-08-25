import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildListingWorkspacePortalFixGuide,
  buildListingWorkspacePortalSummary,
} from '../src/services/listings/listingWorkspaceUiModel.js'

const root = resolve(process.cwd())
const shellSource = readFileSync(resolve(root, 'src/components/listings/ListingWorkspaceShell.jsx'), 'utf8')
const modelSource = readFileSync(resolve(root, 'src/services/listings/listingWorkspaceUiModel.js'), 'utf8')
const salesSource = readFileSync(resolve(root, 'src/pages/AgentListingDetail.jsx'), 'utf8')
const rentalSource = readFileSync(resolve(root, 'src/pages/rentals/RentalListingDetailPage.jsx'), 'utf8')
const docSource = readFileSync(resolve(root, 'docs/listing-portal-fix-guide-phase8.md'), 'utf8')
const packageSource = readFileSync(resolve(root, 'package.json'), 'utf8')

const guide = buildListingWorkspacePortalFixGuide([
  buildListingWorkspacePortalSummary({
    type: 'sales',
    portal: 'Property24',
    setupBlockers: ['Property24 agent mapping'],
    missingFields: [
      'Listing description',
      'Suburb',
      'Seller mobile number',
      'Photo gallery',
      'Mandate expiry date',
    ],
  }),
], { type: 'sales' })

const targetsByIssue = new Map(guide.map((item) => [item.issue, item.actionTarget]))

assert.equal(targetsByIssue.get('Property24 agent mapping'), 'syndication')
assert.equal(targetsByIssue.get('Listing description'), 'marketing')
assert.equal(targetsByIssue.get('Suburb'), 'property')
assert.equal(targetsByIssue.get('Seller mobile number'), 'owner')
assert.equal(targetsByIssue.get('Photo gallery'), 'media')
assert.equal(targetsByIssue.get('Mandate expiry date'), 'mandate')

const rentalGuide = buildListingWorkspacePortalFixGuide([
  buildListingWorkspacePortalSummary({
    type: 'rentals',
    portal: 'Property24',
    missingFields: ['Available from date'],
  }),
], { type: 'rentals' })

assert.equal(rentalGuide[0].type, 'rentals')
assert.equal(rentalGuide[0].actionTarget, 'property')
assert.equal(rentalGuide[0].actionLabel, 'Open property details')

assert.match(modelSource, /export function buildListingWorkspacePortalFixGuide/)
assert.match(modelSource, /resolveListingIssueWorkspaceTarget/)
assert.match(shellSource, /export function ListingWorkspacePortalFixGuide/)
assert.match(shellSource, /Where to fix/)

assert.match(salesSource, /ListingWorkspacePortalFixGuide/)
assert.match(salesSource, /buildListingWorkspacePortalFixGuide/)
assert.match(salesSource, /salesPortalFixGuide/)
assert.match(salesSource, /handleSalesPortalFixGuideAction/)
assert.match(salesSource, /testId="sales-listing-portal-fix-guide"/)

assert.match(rentalSource, /ListingWorkspacePortalFixGuide/)
assert.match(rentalSource, /buildListingWorkspacePortalFixGuide/)
assert.match(rentalSource, /rentalPortalFixGuide/)
assert.match(rentalSource, /handleRentalPortalFixGuideAction/)
assert.match(rentalSource, /testId="rental-listing-portal-fix-guide"/)

assert.match(docSource, /No Property24 payload mapping changed/)
assert.match(docSource, /where to fix/)
assert.match(packageSource, /test:listing-portal-fix-guide-phase8/)

console.log('Listing portal fix guide Phase 8 checks passed.')
