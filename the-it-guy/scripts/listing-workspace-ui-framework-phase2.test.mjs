import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  LISTING_WORKSPACE_TAB_KEYS,
  LISTING_WORKSPACE_UI_FRAMEWORK_VERSION,
  buildListingWorkspacePortalReadiness,
  buildListingWorkspaceStepModel,
  buildListingWorkspaceTabs,
  getListingWorkspaceOwnerLabel,
  resolveListingWorkspaceTab,
  resolveListingWorkspaceType,
} from '../src/services/listings/listingWorkspaceUiModel.js'

const root = resolve(process.cwd())
const componentSource = readFileSync(
  resolve(root, 'src/components/listings/ListingWorkspaceShell.jsx'),
  'utf8',
)
const docSource = readFileSync(
  resolve(root, 'docs/listing-workspace-ui-framework-phase2.md'),
  'utf8',
)

assert.equal(
  LISTING_WORKSPACE_UI_FRAMEWORK_VERSION,
  'arch9_listing_workspace_ui_framework_phase2_v1',
)

assert.equal(resolveListingWorkspaceType('sale'), 'sales')
assert.equal(resolveListingWorkspaceType('residential'), 'sales')
assert.equal(resolveListingWorkspaceType('rental'), 'rentals')
assert.equal(resolveListingWorkspaceType('letting'), 'rentals')
assert.equal(resolveListingWorkspaceType('unknown'), 'sales')

assert.equal(getListingWorkspaceOwnerLabel('sales'), 'Seller')
assert.equal(getListingWorkspaceOwnerLabel('rentals'), 'Landlord')

const salesTabs = buildListingWorkspaceTabs('sales')
const rentalTabs = buildListingWorkspaceTabs('rentals')
assert.deepEqual(
  salesTabs.map((tab) => tab.key),
  LISTING_WORKSPACE_TAB_KEYS,
)
assert.deepEqual(
  rentalTabs.map((tab) => tab.key),
  LISTING_WORKSPACE_TAB_KEYS,
)
assert.equal(salesTabs.find((tab) => tab.key === 'owner')?.label, 'Seller')
assert.equal(rentalTabs.find((tab) => tab.key === 'owner')?.label, 'Landlord')
assert.equal(resolveListingWorkspaceTab('does-not-exist', 'rentals'), 'overview')
assert.equal(resolveListingWorkspaceTab('Syndication', 'sales'), 'syndication')

const salesSteps = buildListingWorkspaceStepModel('sales', {
  overview: true,
  owner: true,
})
const rentalSteps = buildListingWorkspaceStepModel('rentals', {
  overview: true,
})
assert.equal(salesSteps.find((step) => step.key === 'owner')?.title, 'Capture seller')
assert.equal(rentalSteps.find((step) => step.key === 'owner')?.title, 'Capture landlord')
assert.equal(salesSteps.find((step) => step.key === 'property')?.status, 'current')
assert.equal(rentalSteps.find((step) => step.key === 'owner')?.status, 'current')

const missingFieldsReadiness = buildListingWorkspacePortalReadiness({
  type: 'rentals',
  portal: 'Property24',
  missingFields: ['Rental amount', 'Availability date'],
  checked: true,
})
assert.equal(missingFieldsReadiness.ready, false)
assert.equal(missingFieldsReadiness.label, 'Missing fields')
assert.equal(missingFieldsReadiness.tone, 'warning')
assert.equal(missingFieldsReadiness.type, 'rentals')

const readyState = buildListingWorkspacePortalReadiness({
  type: 'sales',
  portal: 'Private Property',
  checked: true,
})
assert.equal(readyState.ready, true)
assert.equal(readyState.label, 'Ready')
assert.equal(readyState.tone, 'success')

for (const expectedExport of [
  'ListingWorkspaceShell',
  'ListingWorkspaceTabs',
  'ListingWorkspacePanel',
  'ListingWorkspaceFieldGrid',
  'ListingWorkspaceSummaryBar',
  'ListingWorkspaceReadinessList',
  'ListingWorkspaceStatusPill',
]) {
  assert.match(
    componentSource,
    new RegExp(`export function ${expectedExport}`),
    `${expectedExport} should be exported`,
  )
}

assert.match(componentSource, /role="tablist"/)
assert.match(componentSource, /aria-selected=/)
assert.doesNotMatch(componentSource, /Seller \/ Mandate/)
assert.doesNotMatch(componentSource, /PropCtrl/i)

assert.match(docSource, /Sales uses `Seller`/)
assert.match(docSource, /Rentals uses `Landlord`/)
assert.match(docSource, /does not change any Property24 or Private Property payload logic/)

console.log('Listing workspace UI framework Phase 2 checks passed.')
