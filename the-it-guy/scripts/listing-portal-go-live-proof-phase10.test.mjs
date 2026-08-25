import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildListingWorkspacePortalGoLiveProof,
  buildListingWorkspacePortalSummary,
} from '../src/services/listings/listingWorkspaceUiModel.js'

const root = resolve(process.cwd())
const shellSource = readFileSync(resolve(root, 'src/components/listings/ListingWorkspaceShell.jsx'), 'utf8')
const modelSource = readFileSync(resolve(root, 'src/services/listings/listingWorkspaceUiModel.js'), 'utf8')
const salesSource = readFileSync(resolve(root, 'src/pages/AgentListingDetail.jsx'), 'utf8')
const rentalSource = readFileSync(resolve(root, 'src/pages/rentals/RentalListingDetailPage.jsx'), 'utf8')
const docSource = readFileSync(resolve(root, 'docs/listing-portal-go-live-proof-phase10.md'), 'utf8')
const packageSource = readFileSync(resolve(root, 'package.json'), 'utf8')

const blockedProof = buildListingWorkspacePortalGoLiveProof([
  buildListingWorkspacePortalSummary({
    type: 'sales',
    portal: 'Property24',
    setupBlockers: ['Property24 agent mapping'],
    missingFields: ['Listing description'],
  }),
], { type: 'sales' })

assert.equal(blockedProof.label, 'Go-live proof')
assert.equal(blockedProof.status, 'Not ready')
assert.equal(blockedProof.tone, 'warning')
assert.equal(blockedProof.ready, false)
assert.equal(blockedProof.rows.find((row) => row.key === 'setup').value, '1 issue')
assert.equal(blockedProof.rows.find((row) => row.key === 'listing_data').value, '1 missing')

const uncheckedProof = buildListingWorkspacePortalGoLiveProof([
  buildListingWorkspacePortalSummary({
    type: 'rentals',
    portal: 'Property24',
  }),
], { type: 'rentals' })

assert.equal(uncheckedProof.type, 'rentals')
assert.equal(uncheckedProof.status, 'Check needed')
assert.equal(uncheckedProof.rows.find((row) => row.key === 'readiness').value, '0/1 checked')

const readyProof = buildListingWorkspacePortalGoLiveProof([
  buildListingWorkspacePortalSummary({
    type: 'sales',
    portal: 'Property24',
    checked: true,
    reference: 'P24-READY',
    lastSynced: 'Last synced today',
  }),
], { type: 'sales' })

assert.equal(readyProof.status, 'Evidence ready')
assert.equal(readyProof.tone, 'success')
assert.equal(readyProof.ready, true)
assert.equal(readyProof.rows.find((row) => row.key === 'readiness').value, '1/1 checked')
assert.equal(readyProof.portals[0].reference, 'P24-READY')
assert.equal(readyProof.portals[0].lastSynced, 'Last synced today')

const liveProof = buildListingWorkspacePortalGoLiveProof([
  buildListingWorkspacePortalSummary({
    type: 'sales',
    portal: 'Private Property',
    published: true,
  }),
], { type: 'sales' })

assert.equal(liveProof.status, 'Evidence ready')
assert.equal(liveProof.rows.find((row) => row.key === 'tracking').value, '1 live')

assert.match(modelSource, /export function buildListingWorkspacePortalGoLiveProof/)
assert.match(shellSource, /export function ListingWorkspacePortalGoLiveProof/)
assert.match(shellSource, /Go-live proof/)

assert.match(salesSource, /ListingWorkspacePortalGoLiveProof/)
assert.match(salesSource, /buildListingWorkspacePortalGoLiveProof/)
assert.match(salesSource, /salesPortalGoLiveProof/)
assert.match(salesSource, /testId="sales-listing-portal-go-live-proof"/)

assert.match(rentalSource, /ListingWorkspacePortalGoLiveProof/)
assert.match(rentalSource, /buildListingWorkspacePortalGoLiveProof/)
assert.match(rentalSource, /rentalPortalGoLiveProof/)
assert.match(rentalSource, /testId="rental-listing-portal-go-live-proof"/)

assert.match(docSource, /No Property24 payload mapping changed/)
assert.match(docSource, /No automatic live publishing was added/)
assert.match(packageSource, /test:listing-portal-go-live-proof-phase10/)

console.log('Listing portal go-live proof Phase 10 checks passed.')
