import assert from 'node:assert/strict'

import {
  BUSINESS_WORKSPACES,
  resolveAvailableBusinessWorkspaces,
  resolveBusinessWorkspaceState,
} from '../the-it-guy/src/lib/businessWorkspaceAccess.js'

function assertWorkspaces(actual, expected, message) {
  assert.deepEqual(actual, expected, message)
}

assertWorkspaces(
  resolveAvailableBusinessWorkspaces({
    enabled: false,
    appRole: 'agent',
    workspaceType: 'agency',
    currentMembership: { role: 'principal' },
  }),
  [BUSINESS_WORKSPACES.sales],
  'disabled shell should preserve sales-only navigation',
)

assertWorkspaces(
  resolveAvailableBusinessWorkspaces({
    enabled: true,
    appRole: 'agent',
    workspaceType: 'agency',
    currentMembership: { role: 'agent' },
  }),
  [BUSINESS_WORKSPACES.sales],
  'generic agents should not receive rentals access without metadata',
)

assertWorkspaces(
  resolveAvailableBusinessWorkspaces({
    enabled: true,
    appRole: 'agent',
    workspaceType: 'agency',
    currentMembership: { role: 'principal' },
  }),
  [BUSINESS_WORKSPACES.sales, BUSINESS_WORKSPACES.rentals],
  'principals should see both staging workspaces',
)

assertWorkspaces(
  resolveAvailableBusinessWorkspaces({
    enabled: true,
    appRole: 'agent',
    workspaceType: 'agency',
    currentMembership: {
      role: 'agent',
      module_metadata: { businessWorkspaces: ['rentals'] },
    },
  }),
  [BUSINESS_WORKSPACES.rentals],
  'metadata can make a user rentals-only',
)

assertWorkspaces(
  resolveAvailableBusinessWorkspaces({
    enabled: true,
    appRole: 'agent',
    workspaceType: 'agency',
    currentMembership: {
      role: 'agent',
      module_metadata: { workspace_access: { sales: true, rentals: true } },
    },
  }),
  [BUSINESS_WORKSPACES.sales, BUSINESS_WORKSPACES.rentals],
  'metadata can make a user dual workspace',
)

const rentalsPreferred = resolveBusinessWorkspaceState({
  enabled: true,
  appRole: 'agent',
  workspaceType: 'agency',
  currentMembership: { role: 'principal' },
  preferredWorkspace: 'rentals',
})
assert.equal(rentalsPreferred.currentId, BUSINESS_WORKSPACES.rentals)
assert.equal(rentalsPreferred.showSwitcher, true)

const invalidPreferred = resolveBusinessWorkspaceState({
  enabled: true,
  appRole: 'agent',
  workspaceType: 'agency',
  currentMembership: {
    role: 'agent',
    module_metadata: { businessWorkspaces: ['rentals'] },
  },
  preferredWorkspace: 'sales',
})
assert.equal(invalidPreferred.currentId, BUSINESS_WORKSPACES.rentals)
assert.equal(invalidPreferred.showSwitcher, false)

console.log('business workspace access tests passed')
