import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildListingWorkspacePortalActionPlan,
  buildListingWorkspacePortalSummary,
} from '../src/services/listings/listingWorkspaceUiModel.js'

const root = resolve(process.cwd())
const shellSource = readFileSync(resolve(root, 'src/components/listings/ListingWorkspaceShell.jsx'), 'utf8')
const modelSource = readFileSync(resolve(root, 'src/services/listings/listingWorkspaceUiModel.js'), 'utf8')
const salesSource = readFileSync(resolve(root, 'src/pages/AgentListingDetail.jsx'), 'utf8')
const rentalSource = readFileSync(resolve(root, 'src/pages/rentals/RentalListingDetailPage.jsx'), 'utf8')
const docSource = readFileSync(resolve(root, 'docs/listing-portal-action-plan-phase6.md'), 'utf8')
const packageSource = readFileSync(resolve(root, 'package.json'), 'utf8')

const blockedPlan = buildListingWorkspacePortalActionPlan([
  buildListingWorkspacePortalSummary({
    type: 'sales',
    portal: 'Property24',
    missingFields: ['Listing description'],
    actionLabel: 'Open syndication',
    actionTarget: 'property24',
  }),
  buildListingWorkspacePortalSummary({
    type: 'sales',
    portal: 'Private Property',
    published: true,
  }),
], { type: 'sales' })

assert.equal(blockedPlan.type, 'sales')
assert.equal(blockedPlan.label, 'Fix listing details')
assert.equal(blockedPlan.tone, 'warning')
assert.equal(blockedPlan.portal, 'Property24')
assert.equal(blockedPlan.actionTarget, 'property24')
assert.deepEqual(blockedPlan.counts, {
  total: 2,
  live: 1,
  ready: 0,
  blocked: 1,
  notChecked: 0,
})

const readyPlan = buildListingWorkspacePortalActionPlan([
  buildListingWorkspacePortalSummary({
    type: 'rentals',
    portal: 'Property24',
    checked: true,
    actionLabel: 'Open syndication',
    actionTarget: 'property24',
  }),
], { type: 'rentals' })

assert.equal(readyPlan.type, 'rentals')
assert.equal(readyPlan.label, 'Ready to send')
assert.equal(readyPlan.tone, 'success')
assert.equal(readyPlan.counts.ready, 1)

const uncheckedPlan = buildListingWorkspacePortalActionPlan([
  buildListingWorkspacePortalSummary({
    type: 'rentals',
    portal: 'Property24',
    actionLabel: 'Check readiness',
    actionTarget: 'property24',
  }),
], { type: 'rentals' })

assert.equal(uncheckedPlan.label, 'Check readiness')
assert.equal(uncheckedPlan.counts.notChecked, 1)

assert.match(modelSource, /export function buildListingWorkspacePortalActionPlan/)
assert.match(shellSource, /export function ListingWorkspacePortalActionPanel/)
assert.match(shellSource, /Publishing next step/)
assert.match(shellSource, /data-testid=\{testId\}/)

assert.match(salesSource, /ListingWorkspacePortalActionPanel/)
assert.match(salesSource, /buildListingWorkspacePortalActionPlan/)
assert.match(salesSource, /salesPortalActionPlan/)
assert.match(salesSource, /testId="sales-listing-portal-action-plan"/)

assert.match(rentalSource, /ListingWorkspacePortalActionPanel/)
assert.match(rentalSource, /buildListingWorkspacePortalActionPlan/)
assert.match(rentalSource, /rentalPortalActionPlan/)
assert.match(rentalSource, /testId="rental-listing-portal-action-plan"/)

assert.match(docSource, /No Property24 payload mapping changed/)
assert.match(docSource, /No automatic live publishing was added/)
assert.match(packageSource, /test:listing-portal-action-plan-phase6/)

console.log('Listing portal action plan Phase 6 checks passed.')
