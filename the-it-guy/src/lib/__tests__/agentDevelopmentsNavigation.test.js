import { expect, it } from 'vitest'
import { getRoleNavItems } from '../roles.js'
import { filterNavigationItems } from '../../auth/permissions/navigationPermissions.js'

it('places the agent development portfolio after Listings for agents and principals', () => {
  for (const membershipRole of ['agent', 'principal']) {
    const items = getRoleNavItems('agent', { baseRole: 'agent', membershipRole, profile: { role: 'agent', workspaceRole: membershipRole } })
    const listings = items.findIndex(item => item.key === 'listings')
    expect(items[listings + 1]).toMatchObject({ key: 'developments', label: 'Developments', to: '/developments' })
  }
})
it('keeps developer navigation and hides portfolio navigation when access is denied', () => {
  expect(getRoleNavItems('developer').find(item => item.key === 'developments').to).toBe('/developer/developments')
  const items = getRoleNavItems('agent')
  expect(filterNavigationItems(items, { role: 'viewer', appRole: 'viewer' }).some(item => item.key === 'developments')).toBe(false)
})
