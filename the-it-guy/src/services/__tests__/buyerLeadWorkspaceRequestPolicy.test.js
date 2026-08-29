import assert from 'node:assert/strict'
import {
  LEAD_WORKSPACE_REQUEST_FAMILIES,
  shouldLoadLeadWorkspaceRequest,
} from '../buyerLeadWorkspaceRequestPolicy.js'

const buyerOnlyFamilies = [
  LEAD_WORKSPACE_REQUEST_FAMILIES.offers,
  LEAD_WORKSPACE_REQUEST_FAMILIES.offerPortalSessions,
  LEAD_WORKSPACE_REQUEST_FAMILIES.lifecycleDiagnostic,
  LEAD_WORKSPACE_REQUEST_FAMILIES.buyerViewingPreferences,
  LEAD_WORKSPACE_REQUEST_FAMILIES.sellerViewingCoordination,
]

buyerOnlyFamilies.forEach((requestFamily) => {
  assert.equal(shouldLoadLeadWorkspaceRequest({ leadCategory: 'buyer', requestFamily }), true)
  assert.equal(shouldLoadLeadWorkspaceRequest({ leadCategory: 'seller', requestFamily }), false)
})

assert.equal(shouldLoadLeadWorkspaceRequest({
  leadCategory: 'seller',
  requestFamily: LEAD_WORKSPACE_REQUEST_FAMILIES.privateListingActivity,
}), true)
assert.equal(shouldLoadLeadWorkspaceRequest({
  leadCategory: 'buyer',
  requestFamily: LEAD_WORKSPACE_REQUEST_FAMILIES.privateListingActivity,
}), false)

for (const leadCategory of ['buyer', 'seller']) {
  assert.equal(shouldLoadLeadWorkspaceRequest({
    leadCategory,
    requestFamily: LEAD_WORKSPACE_REQUEST_FAMILIES.routeWorkspace,
  }), true)
  assert.equal(shouldLoadLeadWorkspaceRequest({
    leadCategory,
    requestFamily: LEAD_WORKSPACE_REQUEST_FAMILIES.journeyOverrides,
  }), true)
}

assert.equal(shouldLoadLeadWorkspaceRequest({ leadCategory: '', requestFamily: 'offers' }), false)
assert.equal(shouldLoadLeadWorkspaceRequest({ leadCategory: 'buyer', requestFamily: 'unknown' }), false)

console.log('buyer lead workspace request policy tests passed')

