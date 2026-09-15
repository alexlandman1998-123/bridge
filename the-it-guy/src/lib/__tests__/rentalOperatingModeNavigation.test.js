import assert from 'node:assert/strict'
import { getRoleNavItems } from '../roles.js'
import { BUSINESS_WORKSPACES } from '../businessWorkspaceAccess.js'
import { RENTAL_OPERATING_MODES } from '../../services/rentals/shortTermRentalFoundation.js'

const context = {
  baseRole: 'agent',
  profile: { id: 'agent-1', role: 'agent' },
  membershipRole: 'agent',
  currentMembership: { id: 'membership-1', status: 'active', workspaceRole: 'agent', organisationId: 'organisation-1' },
  businessWorkspace: BUSINESS_WORKSPACES.rentals,
}

const longTermNav = getRoleNavItems('agent', { ...context, rentalOperatingMode: RENTAL_OPERATING_MODES.longTerm })
const shortTermNav = getRoleNavItems('agent', { ...context, rentalOperatingMode: RENTAL_OPERATING_MODES.shortTerm })

assert.equal(longTermNav[0].to, '/agent/rentals/long-term/dashboard')
assert.deepEqual(longTermNav.map((item) => item.key), ['rental_dashboard', 'rental_properties', 'rental_listings', 'rental_leads', 'rental_applications', 'rental_operations'])
assert.equal(longTermNav.find((item) => item.key === 'rental_properties')?.label, 'Properties & units')
assert.equal(longTermNav.find((item) => item.key === 'rental_properties')?.children, undefined)
assert.equal(longTermNav.find((item) => item.key === 'rental_listings')?.label, 'Listings')
assert.equal(longTermNav.find((item) => item.key === 'rental_leads')?.label, 'Leads')
assert.deepEqual(longTermNav.find((item) => item.key === 'rental_operations')?.children?.map((item) => item.key), ['rental_maintenance', 'rental_inspections'])
assert.deepEqual(shortTermNav.map((item) => item.key), ['short_term_dashboard', 'short_term_calendar', 'short_term_bookings', 'short_term_properties', 'short_term_turnovers', 'short_term_rates'])
assert.equal(shortTermNav[0].to, '/agent/rentals/short-term/dashboard')

console.log('Rental operating mode navigation tests passed.')
