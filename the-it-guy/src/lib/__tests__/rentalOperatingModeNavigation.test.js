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
assert.deepEqual(shortTermNav.map((item) => item.key), ['short_term_dashboard'])
assert.equal(shortTermNav[0].to, '/agent/rentals/short-term/dashboard')

console.log('Rental operating mode navigation tests passed.')
