import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  resolveSalesListingWorkspaceTabFromLegacyState,
  resolveSalesListingWorkspaceTarget,
} from '../src/services/listings/listingWorkspaceUiModel.js'

const root = resolve(process.cwd())
const source = readFileSync(resolve(root, 'src/pages/AgentListingDetail.jsx'), 'utf8')
const docSource = readFileSync(resolve(root, 'docs/sales-listing-workspace-phase3.md'), 'utf8')

assert.match(source, /ListingWorkspaceTabs/)
assert.match(source, /from '\.\.\/components\/listings\/ListingWorkspaceShell'/)
assert.match(source, /buildListingWorkspaceTabs/)
assert.match(source, /resolveSalesListingWorkspaceTabFromLegacyState/)
assert.match(source, /resolveSalesListingWorkspaceTarget/)
assert.doesNotMatch(source, /const DETAIL_TABS = \[/)
assert.match(source, /data-testid="sales-listing-shared-workspace-tabs"/)
assert.match(source, /ariaLabel="Sales listing workspace sections"/)
assert.match(source, /onTabChange=\{openSalesListingWorkspaceTab\}/)

assert.equal(resolveSalesListingWorkspaceTabFromLegacyState({ activeTab: 'seller', sellerWorkspaceTab: 'seller' }), 'owner')
assert.equal(resolveSalesListingWorkspaceTabFromLegacyState({ activeTab: 'seller', sellerWorkspaceTab: 'overview' }), 'mandate')
assert.equal(resolveSalesListingWorkspaceTabFromLegacyState({ activeTab: 'seller', sellerWorkspaceTab: 'marketing' }), 'marketing')
assert.equal(resolveSalesListingWorkspaceTabFromLegacyState({ activeTab: 'seller', sellerWorkspaceTab: 'activity' }), 'activity')
assert.equal(resolveSalesListingWorkspaceTabFromLegacyState({ activeTab: 'property_details' }), 'property')
assert.equal(resolveSalesListingWorkspaceTabFromLegacyState({ activeTab: 'overview' }), 'overview')

assert.deepEqual(resolveSalesListingWorkspaceTarget('owner'), {
  workspaceTab: 'owner',
  activeTab: 'seller',
  sellerWorkspaceTab: 'seller',
})
assert.deepEqual(resolveSalesListingWorkspaceTarget('marketing'), {
  workspaceTab: 'marketing',
  activeTab: 'seller',
  sellerWorkspaceTab: 'marketing',
})
assert.deepEqual(resolveSalesListingWorkspaceTarget('syndication'), {
  workspaceTab: 'syndication',
  activeTab: 'seller',
  sellerWorkspaceTab: 'marketing',
  openProperty24Manage: true,
})
assert.equal(resolveSalesListingWorkspaceTarget('unknown').workspaceTab, 'overview')

assert.match(docSource, /No rental screens were changed/)
assert.match(docSource, /No Property24 payload logic changed/)
assert.match(docSource, /Syndication` opens the marketing console and the existing Property24 action panel/)

console.log('Sales listing workspace Phase 3 checks passed.')
