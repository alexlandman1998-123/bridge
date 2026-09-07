import assert from 'node:assert/strict'
import { getOrganisationOwnershipHealth, isPrimaryOrganisationOwnerMembership } from '../organisationMembershipResolution.js'

const activeOwner = { source: 'organisation_users', status: 'active', role: 'owner', isPrimaryOwner: true }
const activeAdditionalOwner = { source: 'organisation_users', status: 'active', role: 'owner', isPrimaryOwner: false }
const activePrincipal = { source: 'organisation_users', status: 'active', role: 'principal', isPrimaryOwner: false }

assert.equal(isPrimaryOrganisationOwnerMembership(activeOwner), true)
assert.equal(isPrimaryOrganisationOwnerMembership({ ...activePrincipal, isPrimaryOwner: true }), false)

const healthy = getOrganisationOwnershipHealth([activeOwner, activeAdditionalOwner, activePrincipal])
assert.equal(healthy.status, 'healthy')
assert.equal(healthy.activeOwnerCount, 2)
assert.equal(healthy.activePrimaryOwnerCount, 1)

const primaryPrincipal = getOrganisationOwnershipHealth([{ ...activePrincipal, isPrimaryOwner: true }])
assert.equal(primaryPrincipal.status, 'recovery_required')
assert.deepEqual(primaryPrincipal.issues, ['no_active_owner', 'primary_owner_role_mismatch', 'invalid_primary_owner'])

const duplicatePrimary = getOrganisationOwnershipHealth([activeOwner, { ...activeAdditionalOwner, isPrimaryOwner: true }])
assert.equal(duplicatePrimary.status, 'recovery_required')
assert.deepEqual(duplicatePrimary.issues, ['multiple_primary_owners'])

console.log('organisation membership ownership health: passed')
