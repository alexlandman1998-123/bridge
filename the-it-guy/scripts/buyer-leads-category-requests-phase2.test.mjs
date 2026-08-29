import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const pipeline = readFileSync(resolve(root, 'src/pages/agency/AgencyPipelinePage.jsx'), 'utf8')
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))

function getBlockBefore(needle, startNeedle, maxLength = 5000) {
  const needleIndex = pipeline.indexOf(needle)
  assert.notEqual(needleIndex, -1, `${needle} should remain in the agency controller`)
  const blockStart = pipeline.lastIndexOf(startNeedle, needleIndex)
  assert.notEqual(blockStart, -1, `${needle} should remain inside ${startNeedle}`)
  return pipeline.slice(blockStart, Math.min(pipeline.length, needleIndex + maxLength))
}

assert.match(pipeline, /buyerLeadWorkspaceRequestPolicy/)
assert.match(pipeline, /const selectedLeadCategory = resolveLeadCategoryView\(selectedLead\)/)

const offersEffect = getBlockBefore('loadBuyerOfferWorkspaceData({', 'useEffect(() => {')
assert.match(offersEffect, /shouldLoadLeadWorkspaceRequest\([\s\S]*LEAD_WORKSPACE_REQUEST_FAMILIES\.offers/)
assert.ok(offersEffect.indexOf('shouldLoadLeadWorkspaceRequest') < offersEffect.indexOf('loadBuyerOfferWorkspaceData({'))

const lifecycleEffect = getBlockBefore('loadBuyerFinanceTransactionData({', 'useEffect(() => {')
assert.match(lifecycleEffect, /shouldLoadLeadWorkspaceRequest\([\s\S]*LEAD_WORKSPACE_REQUEST_FAMILIES\.lifecycleDiagnostic/)
assert.ok(lifecycleEffect.indexOf('shouldLoadLeadWorkspaceRequest') < lifecycleEffect.indexOf('loadBuyerFinanceTransactionData({'))

const privateActivityEffect = getBlockBefore('getPrivateListingActivity(listingId)', 'useEffect(() => {')
assert.match(privateActivityEffect, /LEAD_WORKSPACE_REQUEST_FAMILIES\.privateListingActivity/)
assert.ok(privateActivityEffect.indexOf('shouldLoadLeadWorkspaceRequest') < privateActivityEffect.indexOf('getPrivateListingActivity(listingId)'))

const buyerViewingLoader = getBlockBefore('listBuyerViewingPreferenceLinks(workspaceId', 'const reloadBuyerViewingPreferenceLinks')
assert.match(buyerViewingLoader, /LEAD_WORKSPACE_REQUEST_FAMILIES\.buyerViewingPreferences/)

const sellerCoordinationLoader = getBlockBefore('listSellerViewingCoordinationLinks(workspaceId', 'const reloadSellerViewingCoordinationLinks')
assert.match(sellerCoordinationLoader, /LEAD_WORKSPACE_REQUEST_FAMILIES\.sellerViewingCoordination/)

assert.match(
  packageJson.scripts['verify:buyer-leads-performance'],
  /^npm run test:buyer-leads-performance-phase1 && npm run test:buyer-leads-category-requests-phase2(?: && |$)/,
)

console.log('buyer leads Phase 2 category request isolation checks passed')
