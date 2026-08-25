import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildListingWorkspacePortalPublishGate,
  buildListingWorkspacePortalSummary,
} from '../src/services/listings/listingWorkspaceUiModel.js'

const root = resolve(process.cwd())
const shellSource = readFileSync(resolve(root, 'src/components/listings/ListingWorkspaceShell.jsx'), 'utf8')
const modelSource = readFileSync(resolve(root, 'src/services/listings/listingWorkspaceUiModel.js'), 'utf8')
const salesSource = readFileSync(resolve(root, 'src/pages/AgentListingDetail.jsx'), 'utf8')
const rentalSource = readFileSync(resolve(root, 'src/pages/rentals/RentalListingDetailPage.jsx'), 'utf8')
const docSource = readFileSync(resolve(root, 'docs/listing-portal-publish-gate-phase9.md'), 'utf8')
const packageSource = readFileSync(resolve(root, 'package.json'), 'utf8')

const setupBlockedGate = buildListingWorkspacePortalPublishGate([
  buildListingWorkspacePortalSummary({
    type: 'sales',
    portal: 'Property24',
    setupBlockers: ['Property24 agent mapping'],
  }),
], { type: 'sales' })

assert.equal(setupBlockedGate.label, 'Blocked by setup')
assert.equal(setupBlockedGate.status, 'Blocked')
assert.equal(setupBlockedGate.canPublish, false)
assert.equal(setupBlockedGate.counts.blocked, 1)
assert.deepEqual(setupBlockedGate.blockers.map((item) => item.label), ['Property24: Property24 agent mapping'])

const missingFieldsGate = buildListingWorkspacePortalPublishGate([
  buildListingWorkspacePortalSummary({
    type: 'sales',
    portal: 'Private Property',
    missingFields: ['Listing description', 'Photo gallery'],
  }),
], { type: 'sales' })

assert.equal(missingFieldsGate.label, 'Blocked by listing details')
assert.equal(missingFieldsGate.status, 'Blocked')
assert.equal(missingFieldsGate.counts.blocked, 2)

const uncheckedGate = buildListingWorkspacePortalPublishGate([
  buildListingWorkspacePortalSummary({
    type: 'rentals',
    portal: 'Property24',
  }),
], { type: 'rentals' })

assert.equal(uncheckedGate.type, 'rentals')
assert.equal(uncheckedGate.label, 'Readiness check needed')
assert.equal(uncheckedGate.counts.unchecked, 1)
assert.equal(uncheckedGate.canPublish, false)

const readyGate = buildListingWorkspacePortalPublishGate([
  buildListingWorkspacePortalSummary({
    type: 'sales',
    portal: 'Property24',
    checked: true,
    actionTarget: 'property24',
  }),
], { type: 'sales' })

assert.equal(readyGate.label, 'Ready for publish review')
assert.equal(readyGate.status, 'Ready')
assert.equal(readyGate.canPublish, true)
assert.equal(readyGate.counts.ready, 1)
assert.equal(readyGate.actionTarget, 'property24')

const liveGate = buildListingWorkspacePortalPublishGate([
  buildListingWorkspacePortalSummary({
    type: 'sales',
    portal: 'Property24',
    published: true,
  }),
], { type: 'sales' })

assert.equal(liveGate.label, 'Live listing monitoring')
assert.equal(liveGate.status, 'Live')
assert.equal(liveGate.counts.live, 1)

assert.match(modelSource, /export function buildListingWorkspacePortalPublishGate/)
assert.match(shellSource, /export function ListingWorkspacePortalPublishGate/)
assert.match(shellSource, /Publish decision/)

assert.match(salesSource, /ListingWorkspacePortalPublishGate/)
assert.match(salesSource, /buildListingWorkspacePortalPublishGate/)
assert.match(salesSource, /salesPortalPublishGate/)
assert.match(salesSource, /testId="sales-listing-portal-publish-gate"/)

assert.match(rentalSource, /ListingWorkspacePortalPublishGate/)
assert.match(rentalSource, /buildListingWorkspacePortalPublishGate/)
assert.match(rentalSource, /rentalPortalPublishGate/)
assert.match(rentalSource, /testId="rental-listing-portal-publish-gate"/)

assert.match(docSource, /No Property24 payload mapping changed/)
assert.match(docSource, /No automatic live publishing was added/)
assert.match(packageSource, /test:listing-portal-publish-gate-phase9/)

console.log('Listing portal publish gate Phase 9 checks passed.')
