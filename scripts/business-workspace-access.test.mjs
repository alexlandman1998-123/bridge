import assert from 'node:assert/strict'

import {
  BUSINESS_WORKSPACES,
  resolveAvailableBusinessWorkspaces,
  resolveBusinessWorkspaceRolloutAccess,
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

assert.equal(
  resolveBusinessWorkspaceRolloutAccess({
    enabled: true,
    requiresAllowlist: false,
  }).enabled,
  true,
  'staging and preview rollout should not require a workspace allowlist',
)

const produktiveWorkspaceAllowed = resolveBusinessWorkspaceRolloutAccess({
  enabled: true,
  requiresAllowlist: true,
  allowedWorkspaceIdentifiers: ['produktive'],
  currentWorkspace: { id: 'workspace-123', name: 'Produktive' },
  currentMembership: { role: 'principal' },
})
assert.equal(produktiveWorkspaceAllowed.enabled, true)
assert.equal(produktiveWorkspaceAllowed.reason, 'workspace_allowlisted')

const workspaceUuidAllowed = resolveBusinessWorkspaceRolloutAccess({
  enabled: true,
  requiresAllowlist: true,
  allowedWorkspaceIdentifiers: ['9d6c96f1-1358-44b4-8a46-3f927fc83c4b'],
  currentWorkspace: { id: '9d6c96f1-1358-44b4-8a46-3f927fc83c4b', name: 'Another Agency' },
})
assert.equal(workspaceUuidAllowed.enabled, true)

const userAllowed = resolveBusinessWorkspaceRolloutAccess({
  enabled: true,
  requiresAllowlist: true,
  allowedUserIdentifiers: ['alex@arch9.co.za'],
  user: { id: 'user-1', email: 'alex@arch9.co.za' },
  currentWorkspace: { id: 'workspace-456', name: 'Other Agency' },
})
assert.equal(userAllowed.enabled, true)
assert.equal(userAllowed.reason, 'user_allowlisted')

const allowlistMiss = resolveBusinessWorkspaceRolloutAccess({
  enabled: true,
  requiresAllowlist: true,
  allowedWorkspaceIdentifiers: ['produktive'],
  currentWorkspace: { id: 'workspace-456', name: 'Other Agency' },
})
assert.equal(allowlistMiss.enabled, false)
assert.equal(allowlistMiss.reason, 'allowlist_miss')

console.log('business workspace access tests passed')
