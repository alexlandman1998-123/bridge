import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  FINAL_LISTING_MODULE_ROUTES,
  FINAL_LISTING_MODULE_VERSION,
  buildFinalListingModuleOverview,
  resolveFinalListingModuleType,
} from '../src/services/listings/finalListingModuleModel.js'

const root = resolve(process.cwd())
const componentSource = readFileSync(
  resolve(root, 'src/components/listings/FinalListingModuleOverview.jsx'),
  'utf8',
)
const salesPageSource = readFileSync(
  resolve(root, 'src/pages/AgentListings.jsx'),
  'utf8',
)
const rentalPageSource = readFileSync(
  resolve(root, 'src/pages/rentals/RentalListingsPage.jsx'),
  'utf8',
)

assert.equal(FINAL_LISTING_MODULE_VERSION, 'arch9_final_listing_module_v1')

assert.equal(resolveFinalListingModuleType('sale'), 'sales')
assert.equal(resolveFinalListingModuleType('sales'), 'sales')
assert.equal(resolveFinalListingModuleType('rental'), 'rentals')
assert.equal(resolveFinalListingModuleType('rentals'), 'rentals')

assert.equal(FINAL_LISTING_MODULE_ROUTES.sales.indexPath, '/listings')
assert.equal(FINAL_LISTING_MODULE_ROUTES.sales.createPath, '/listings/new')
assert.equal(FINAL_LISTING_MODULE_ROUTES.rentals.indexPath, '/agent/rentals/listings')
assert.equal(FINAL_LISTING_MODULE_ROUTES.rentals.createPath, '/agent/rentals/listings/new')

const salesOverview = buildFinalListingModuleOverview({
  activeType: 'sales',
  salesCount: 7,
  rentalCount: null,
  developmentCount: 2,
})

assert.equal(salesOverview.activeType, 'sales')
assert.equal(salesOverview.lanes.find((lane) => lane.key === 'sales')?.active, true)
assert.equal(salesOverview.lanes.find((lane) => lane.key === 'sales')?.ownerLabel, 'Seller')
assert.equal(salesOverview.lanes.find((lane) => lane.key === 'sales')?.count, 7)
assert.equal(salesOverview.lanes.find((lane) => lane.key === 'sales')?.countKnown, true)
assert.equal(salesOverview.lanes.find((lane) => lane.key === 'rentals')?.ownerLabel, 'Landlord')
assert.equal(salesOverview.lanes.find((lane) => lane.key === 'rentals')?.countKnown, false)
assert.equal(salesOverview.actions.createSale, '/listings/new')
assert.equal(salesOverview.actions.createRental, '/agent/rentals/listings/new')

const rentalOverview = buildFinalListingModuleOverview({
  activeType: 'rentals',
  rentalCount: 3,
  property24Enabled: true,
})

assert.equal(rentalOverview.activeType, 'rentals')
assert.equal(rentalOverview.lanes.find((lane) => lane.key === 'rentals')?.active, true)
assert.equal(rentalOverview.lanes.find((lane) => lane.key === 'rentals')?.count, 3)
assert.equal(rentalOverview.portalSummary.connectedCount, 1)
assert.equal(rentalOverview.portalSummary.tone, 'success')

assert.match(componentSource, /export default function FinalListingModuleOverview/)
assert.match(componentSource, /New sale listing/)
assert.match(componentSource, /New rental listing/)
assert.match(componentSource, /lane\.ownerLabel/)
assert.match(componentSource, /first flow/)
assert.doesNotMatch(componentSource, /PropCtrl/i)

assert.match(salesPageSource, /FinalListingModuleOverview/)
assert.match(salesPageSource, /buildFinalListingModuleOverview/)
assert.match(salesPageSource, /activeType: 'sales'/)

assert.match(rentalPageSource, /FinalListingModuleOverview/)
assert.match(rentalPageSource, /buildFinalListingModuleOverview/)
assert.match(rentalPageSource, /activeType: 'rentals'/)

console.log('Final listing module Phase 11 checks passed.')
