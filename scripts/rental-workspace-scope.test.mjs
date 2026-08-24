import assert from 'node:assert/strict'

import {
  buildRentalListingQueryOptions,
  resolveRentalWorkspaceScope,
} from '../the-it-guy/src/services/rentals/rentalWorkspaceScope.js'

const principalScope = resolveRentalWorkspaceScope({
  currentWorkspace: { id: 'org-1' },
  profile: { id: 'user-1' },
  currentMembership: {
    role: 'principal',
    branch_id: 'branch-1',
  },
})
assert.equal(principalScope.includeAllOrganisationListings, true)
assert.equal(principalScope.scopeLevel, 'organisation')
assert.equal(buildRentalListingQueryOptions(principalScope).branchId, '')

const branchManagerScope = resolveRentalWorkspaceScope({
  currentWorkspace: { id: 'org-1' },
  profile: { id: 'user-2' },
  currentMembership: {
    role: 'branch_manager',
    branch_id: 'branch-2',
  },
})
assert.equal(branchManagerScope.includeAllOrganisationListings, true)
assert.equal(branchManagerScope.scopeLevel, 'branch')
assert.equal(buildRentalListingQueryOptions(branchManagerScope).branchId, 'branch-2')

const rentalDepartmentManagerScope = resolveRentalWorkspaceScope({
  currentWorkspace: { id: 'org-1' },
  profile: { id: 'user-3' },
  currentMembership: {
    role: 'rental_manager',
    department_id: 'department-rentals',
  },
})
assert.equal(rentalDepartmentManagerScope.includeAllOrganisationListings, false)
assert.equal(rentalDepartmentManagerScope.scopeLevel, 'department')
assert.equal(buildRentalListingQueryOptions(rentalDepartmentManagerScope).branchId, '')

const agentScope = resolveRentalWorkspaceScope({
  currentWorkspace: { id: 'org-1' },
  profile: { id: 'user-4' },
  currentMembership: {
    role: 'agent',
  },
})
assert.equal(agentScope.includeAllOrganisationListings, false)
assert.equal(agentScope.scopeLevel, 'assigned')
assert.equal(agentScope.assignedAgentId, 'user-4')

console.log('rental workspace scope tests passed')
