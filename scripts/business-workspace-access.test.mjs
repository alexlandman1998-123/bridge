import assert from 'node:assert/strict'

import {
  BUSINESS_WORKSPACES,
  normalizeBusinessWorkspaceList,
  resolveAvailableBusinessWorkspaces,
  resolveBusinessWorkspaceRolloutAccess,
  resolveBusinessWorkspaceRoute,
  resolveBusinessWorkspaceState,
  resolveMembershipDepartmentBusinessWorkspaces,
  resolveOrganisationBusinessWorkspaces,
} from '../the-it-guy/src/lib/businessWorkspaceAccess.js'
import {
  getAgencyBusinessFocusFromLines,
  mergeAgencyOnboardingDraft,
  normalizeAgencyBusinessLines,
} from '../the-it-guy/src/lib/agencyOnboarding.js'

function assertWorkspaces(actual, expected, message) {
  assert.deepEqual(actual, expected, message)
}

assertWorkspaces(
  normalizeAgencyBusinessLines('sales_rentals'),
  [BUSINESS_WORKSPACES.sales, BUSINESS_WORKSPACES.rentals],
  'agency business focus should normalize to canonical business lines',
)

assert.equal(getAgencyBusinessFocusFromLines(['rentals']), 'rentals')

const mergedAgencyDraft = mergeAgencyOnboardingDraft({
  agencyInformation: { businessFocus: 'rentals' },
})
assertWorkspaces(
  mergedAgencyDraft.agencyInformation.businessLines,
  [BUSINESS_WORKSPACES.rentals],
  'legacy agency business focus should be mirrored into businessLines',
)
assert.equal(mergedAgencyDraft.agencyInformation.businessFocus, 'rentals')

assertWorkspaces(
  normalizeBusinessWorkspaceList('both', []),
  [BUSINESS_WORKSPACES.sales, BUSINESS_WORKSPACES.rentals],
  'business workspace list should normalize dual access aliases',
)

assertWorkspaces(
  resolveMembershipDepartmentBusinessWorkspaces({
    departmentUnit: { unitType: 'hq_department', code: 'rentals', name: 'Lettings' },
  }),
  [BUSINESS_WORKSPACES.rentals],
  'department unit codes should provide structured business workspace inheritance',
)

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

assertWorkspaces(
  resolveOrganisationBusinessWorkspaces({
    currentWorkspace: { settings: { agencyInformation: { businessFocus: 'sales_rentals' } } },
  }),
  [BUSINESS_WORKSPACES.sales, BUSINESS_WORKSPACES.rentals],
  'organisation source of truth should normalize business focus settings',
)

assertWorkspaces(
  resolveOrganisationBusinessWorkspaces({
    currentWorkspace: { settingsJson: { businessLines: ['sales', 'rentals'] } },
  }),
  [BUSINESS_WORKSPACES.sales, BUSINESS_WORKSPACES.rentals],
  'workspace settingsJson should be treated as an organisation business-line source',
)

assertWorkspaces(
  resolveAvailableBusinessWorkspaces({
    enabled: true,
    appRole: 'agent',
    workspaceType: 'agency',
    currentWorkspace: { businessFocus: 'sales' },
    currentMembership: { role: 'principal' },
  }),
  [BUSINESS_WORKSPACES.sales],
  'sales-only organisations should hide rentals even from principals',
)

assertWorkspaces(
  resolveAvailableBusinessWorkspaces({
    enabled: true,
    appRole: 'agent',
    workspaceType: 'agency',
    currentWorkspace: { businessFocus: 'rentals' },
    currentMembership: { role: 'agent' },
  }),
  [BUSINESS_WORKSPACES.rentals],
  'rentals-only organisations should default ordinary agents to rentals',
)

assertWorkspaces(
  resolveAvailableBusinessWorkspaces({
    enabled: true,
    appRole: 'agent',
    workspaceType: 'agency',
    currentWorkspace: { businessLines: ['sales', 'rentals'] },
    currentMembership: { role: 'agent' },
  }),
  [BUSINESS_WORKSPACES.sales],
  'dual-line organisations should keep ordinary agents sales-only until user-level access is set',
)

assertWorkspaces(
  resolveAvailableBusinessWorkspaces({
    enabled: true,
    appRole: 'agent',
    workspaceType: 'agency',
    currentWorkspace: { businessLines: ['rentals'] },
    currentMembership: {
      role: 'agent',
      module_metadata: { businessWorkspaces: ['sales', 'rentals'] },
    },
  }),
  [BUSINESS_WORKSPACES.rentals],
  'agent access should be intersected with organisation business lines',
)

assertWorkspaces(
  resolveAvailableBusinessWorkspaces({
    enabled: true,
    appRole: 'agent',
    workspaceType: 'agency',
    currentWorkspace: { settingsJson: { businessLines: ['sales', 'rentals'] } },
    currentMembership: {
      role: 'agent',
      module_metadata: { businessWorkspaces: ['rentals'] },
    },
  }),
  [BUSINESS_WORKSPACES.rentals],
  'agent-level business workspace metadata should determine whether an ordinary agent can switch',
)

assertWorkspaces(
  resolveAvailableBusinessWorkspaces({
    enabled: true,
    appRole: 'agent',
    workspaceType: 'agency',
    currentWorkspace: { settingsJson: { businessLines: ['sales', 'rentals'] } },
    currentMembership: {
      role: 'agent',
      departmentUnit: { unitType: 'hq_department', code: 'rentals', name: 'Lettings' },
    },
  }),
  [BUSINESS_WORKSPACES.rentals],
  'ordinary agents should inherit business workspace access from their department when user access is not explicit',
)

assertWorkspaces(
  resolveAvailableBusinessWorkspaces({
    enabled: true,
    appRole: 'agent',
    workspaceType: 'agency',
    currentWorkspace: { settingsJson: { businessLines: ['sales', 'rentals'] } },
    currentMembership: {
      role: 'agent',
      module_metadata: { businessWorkspaces: ['sales'] },
      departmentUnit: { unitType: 'hq_department', code: 'rentals', name: 'Lettings' },
    },
  }),
  [BUSINESS_WORKSPACES.sales],
  'explicit user business workspace access should override department inheritance',
)

const rentalsPreferred = resolveBusinessWorkspaceState({
  enabled: true,
  appRole: 'agent',
  workspaceType: 'agency',
  currentWorkspace: { businessFocus: 'sales_rentals' },
  currentMembership: { role: 'principal' },
  preferredWorkspace: 'rentals',
})
assert.equal(rentalsPreferred.currentId, BUSINESS_WORKSPACES.rentals)
assert.equal(rentalsPreferred.showSwitcher, true)

const salesOnlyPrincipal = resolveBusinessWorkspaceState({
  enabled: true,
  appRole: 'agent',
  workspaceType: 'agency',
  currentWorkspace: { businessFocus: 'sales' },
  currentMembership: { role: 'principal' },
  preferredWorkspace: 'rentals',
})
assert.equal(salesOnlyPrincipal.currentId, BUSINESS_WORKSPACES.sales)
assert.equal(salesOnlyPrincipal.showSwitcher, false)

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

assert.equal(
  resolveBusinessWorkspaceRoute({
    pathname: '/dashboard',
    targetWorkspace: BUSINESS_WORKSPACES.rentals,
  }),
  '/agent/rentals/dashboard',
  'switching from the sales dashboard should open the rentals dashboard',
)

assert.equal(
  resolveBusinessWorkspaceRoute({
    pathname: '/transactions/transfer-123',
    targetWorkspace: BUSINESS_WORKSPACES.rentals,
  }),
  '/agent/rentals/tenancies',
  'switching from a sales transaction route should land on rental tenancies',
)

assert.equal(
  resolveBusinessWorkspaceRoute({
    pathname: '/agent/rentals/tenancies',
    targetWorkspace: BUSINESS_WORKSPACES.sales,
  }),
  '/transactions',
  'switching from rental tenancies should land on sales transactions',
)

assert.equal(
  resolveBusinessWorkspaceRoute({
    pathname: '/settings',
    search: '?tab=users',
    targetWorkspace: BUSINESS_WORKSPACES.rentals,
  }),
  '/settings?tab=users',
  'shared settings routes should be preserved while switching workspace context',
)

assert.equal(
  resolveBusinessWorkspaceRoute({
    pathname: '/agent/rentals/pipeline/calendar',
    targetWorkspace: BUSINESS_WORKSPACES.sales,
  }),
  '/pipeline/calendar',
  'rental calendar should map back to the sales calendar',
)

console.log('business workspace access tests passed')
