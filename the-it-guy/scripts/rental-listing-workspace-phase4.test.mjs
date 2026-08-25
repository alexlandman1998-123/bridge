import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildListingWorkspaceTabs,
  resolveRentalListingWorkspaceTabFromDetailTab,
  resolveRentalListingWorkspaceTarget,
} from '../src/services/listings/listingWorkspaceUiModel.js'

const root = resolve(process.cwd())
const source = readFileSync(resolve(root, 'src/pages/rentals/RentalListingDetailPage.jsx'), 'utf8')
const docSource = readFileSync(resolve(root, 'docs/rental-listing-workspace-phase4.md'), 'utf8')

assert.match(source, /ListingWorkspaceTabs/)
assert.match(source, /from '\.\.\/\.\.\/components\/listings\/ListingWorkspaceShell'/)
assert.match(source, /buildListingWorkspaceTabs/)
assert.match(source, /resolveRentalListingWorkspaceTabFromDetailTab/)
assert.match(source, /resolveRentalListingWorkspaceTarget/)
assert.match(source, /data-testid="rental-listing-shared-workspace-tabs"/)
assert.match(source, /ariaLabel="Rental listing workspace sections"/)
assert.match(source, /onTabChange=\{openRentalListingWorkspaceTab\}/)
assert.doesNotMatch(source, /detail\.tabs\.map\(\(tab\)/)

const rentalTabs = buildListingWorkspaceTabs('rentals')
const ownerTab = rentalTabs.find((tab) => tab.key === 'owner')
assert.equal(ownerTab?.label, 'Landlord')
assert.equal(ownerTab?.shortLabel, 'Landlord')

assert.equal(resolveRentalListingWorkspaceTabFromDetailTab('landlord'), 'owner')
assert.equal(resolveRentalListingWorkspaceTabFromDetailTab('terms'), 'mandate')
assert.equal(resolveRentalListingWorkspaceTabFromDetailTab('mandate'), 'mandate')
assert.equal(resolveRentalListingWorkspaceTabFromDetailTab('inspection'), 'property')
assert.equal(resolveRentalListingWorkspaceTabFromDetailTab('property'), 'property')
assert.equal(resolveRentalListingWorkspaceTabFromDetailTab('marketing'), 'marketing')
assert.equal(resolveRentalListingWorkspaceTabFromDetailTab('syndication'), 'syndication')
assert.equal(resolveRentalListingWorkspaceTabFromDetailTab('applications'), 'activity')
assert.equal(resolveRentalListingWorkspaceTabFromDetailTab('activity'), 'activity')

assert.deepEqual(resolveRentalListingWorkspaceTarget('owner'), {
  workspaceTab: 'owner',
  detailTab: 'landlord',
})
assert.deepEqual(resolveRentalListingWorkspaceTarget('features'), {
  workspaceTab: 'features',
  detailTab: 'property',
})
assert.deepEqual(resolveRentalListingWorkspaceTarget('media'), {
  workspaceTab: 'media',
  detailTab: 'marketing',
})
assert.deepEqual(resolveRentalListingWorkspaceTarget('syndication'), {
  workspaceTab: 'syndication',
  detailTab: 'syndication',
})
assert.equal(resolveRentalListingWorkspaceTarget('unknown').workspaceTab, 'overview')

assert.match(docSource, /No Property24 rental payload, preview, publish, or backend handoff logic changed/)
assert.match(docSource, /Landlord/)
assert.match(docSource, /Sales and rentals can now share the same high-level listing navigation/)

console.log('Rental listing workspace Phase 4 checks passed.')
