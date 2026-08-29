import assert from 'node:assert/strict'
import {
  RENTAL_BOUNDARY_RULES,
  RENTAL_COMMAND_CATALOG,
  RENTAL_DOMAIN_CONTRACT_VERSION,
  RENTAL_DOMAIN_ENTITIES,
  RENTAL_SHARED_INFRASTRUCTURE,
  RENTAL_STATUS,
  assertRentalStatusTransition,
  canTransitionRentalStatus,
  getRentalCommandContract,
} from '../rentalDomainContract.js'

assert.equal(RENTAL_DOMAIN_CONTRACT_VERSION, 'arch9_rental_domain_contract_v1')
for (const entity of ['party', 'property', 'unit', 'vacancy', 'listing', 'application', 'screening', 'lease', 'tenancy']) {
  assert.ok(RENTAL_DOMAIN_ENTITIES[entity], `expected ${entity} ownership contract`)
}
assert.equal(RENTAL_DOMAIN_ENTITIES.listing.owner, 'shared_listings')
assert.equal(RENTAL_DOMAIN_ENTITIES.tenancy.owner, 'rentals')
assert.match(RENTAL_SHARED_INFRASTRUCTURE.crm, /do not create a second CRM/i)
assert.ok(RENTAL_BOUNDARY_RULES.some((rule) => /at most one active Tenancy/i.test(rule)))
assert.ok(RENTAL_BOUNDARY_RULES.some((rule) => /never repurposed for Rentals/i.test(rule)))

assert.deepEqual(RENTAL_STATUS.application, [
  'started', 'incomplete', 'submitted', 'screening', 'ready_for_review', 'approved', 'declined', 'withdrawn',
])
assert.equal(canTransitionRentalStatus('application', 'screening', 'ready_for_review'), true)
assert.equal(canTransitionRentalStatus('application', 'screening', 'approved'), false)
assert.equal(canTransitionRentalStatus('vacancy', 'lease_pending', 'filled'), true)
assert.equal(canTransitionRentalStatus('tenancy', 'closed', 'active'), false)
assert.throws(() => assertRentalStatusTransition('tenancy', 'closed', 'active'), /Invalid tenancy transition/)

const approval = getRentalCommandContract('approve_rental_application')
assert.equal(approval?.humanDecisionRequired, true)
const conversion = getRentalCommandContract('create_tenancy_from_application')
assert.equal(conversion?.transactional, true)
assert.equal(conversion?.idempotent, true)
assert.equal(getRentalCommandContract('unknown'), null)
assert.ok(RENTAL_COMMAND_CATALOG.some((command) => command.key === 'close_tenancy_and_create_vacancy'))

console.log('Rental domain contract tests passed.')
