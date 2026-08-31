import assert from 'node:assert/strict'
import { ACCESS_SCOPES } from '../../../../../auth/permissions/permissionRegistry.js'
import {
  RENTAL_CAPABILITIES,
  RENTAL_CAPABILITY_CONTRACT_VERSION,
  RENTAL_RLS_ENTITY_CONTRACTS,
  buildRentalCapabilityQueryScope,
  buildRentalRlsContract,
  canUseRentalCapability,
  getRentalCapabilityScope,
} from '../rentalCapabilities.js'

const ownerContext = {
  role: 'agent',
  workspaceType: 'agency',
  currentWorkspace: { id: 'organisation-1', type: 'agency' },
  currentMembership: { id: 'membership-1', status: 'active', workspaceRole: 'owner', organisationId: 'organisation-1' },
  profile: { id: 'owner-1', role: 'agent' },
}
const agentContext = {
  ...ownerContext,
  currentMembership: { ...ownerContext.currentMembership, workspaceRole: 'agent' },
  profile: { id: 'agent-1', role: 'agent' },
}

assert.equal(RENTAL_CAPABILITY_CONTRACT_VERSION, 'arch9_rentals_capability_contract_v2')
assert.equal(canUseRentalCapability(RENTAL_CAPABILITIES.portfolioView, agentContext), true)
assert.equal(canUseRentalCapability(RENTAL_CAPABILITIES.applicationApprove, agentContext), false)
assert.equal(canUseRentalCapability(RENTAL_CAPABILITIES.applicationApprove, ownerContext), true)
assert.equal(canUseRentalCapability(RENTAL_CAPABILITIES.shortTermView, agentContext), true)
assert.equal(getRentalCapabilityScope(RENTAL_CAPABILITIES.collectionsReversePayment, ownerContext), ACCESS_SCOPES.allWorkspace)
assert.equal(getRentalCapabilityScope('rentals.unknown', ownerContext), ACCESS_SCOPES.none)

const queryScope = buildRentalCapabilityQueryScope(RENTAL_CAPABILITIES.vacancyView, agentContext)
assert.equal(queryScope.capability, RENTAL_CAPABILITIES.vacancyView)
assert.equal(queryScope.canRead, true)
assert.equal(queryScope.organisationId, 'organisation-1')
assert.equal(buildRentalCapabilityQueryScope(RENTAL_CAPABILITIES.applicationApprove, agentContext).canRead, false)

assert.ok(RENTAL_RLS_ENTITY_CONTRACTS.includes('rental_tenancies'))
assert.ok(RENTAL_RLS_ENTITY_CONTRACTS.includes('rental_unit_operating_modes'))
assert.ok(RENTAL_RLS_ENTITY_CONTRACTS.includes('rental_unit_occupancy_blocks'))
assert.ok(RENTAL_RLS_ENTITY_CONTRACTS.includes('rental_short_term_bookings'))
assert.ok(RENTAL_RLS_ENTITY_CONTRACTS.includes('rental_short_term_turnovers'))
const rls = buildRentalRlsContract('rental_tenancies')
assert.deepEqual(rls?.grants.anon, [])
assert.ok(rls?.rules.some((rule) => /WITH CHECK/.test(rule)))
assert.equal(buildRentalRlsContract('private_listings'), null)

console.log('Rental capability and RLS contract tests passed.')
