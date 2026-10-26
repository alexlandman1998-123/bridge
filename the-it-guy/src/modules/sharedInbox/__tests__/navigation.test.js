import { expect, it } from 'vitest'
import { APP_ROLES, getRoleNavItems } from '../../../lib/roles'
import { withSharedInboxNavigation } from '../navigation'

it.each(APP_ROLES)('places one Inbox immediately below the %s dashboard', (role) => {
  const source = getRoleNavItems(role, { membershipRole: 'principal' })
  const items = withSharedInboxNavigation(source)
  const inbox = items.findIndex(item => item.label === 'Inbox')
  const dashboard = items.findIndex(item => item.key === 'dashboard' || item.key?.endsWith('_dashboard') || item.label === 'Dashboard')
  expect(inbox).toBe(dashboard < 0 ? 0 : dashboard + 1)
  expect(items[inbox].to).toBe('/inbox')
  expect(withSharedInboxNavigation(items).filter(item => item.label === 'Inbox')).toHaveLength(1)
})
it('retains all role-specific entries without mutating the original navigation', () => {
  const original = [{ key: 'assistant_dashboard', label: 'Dashboard', to: '/assistant/dashboard' }, { key: 'clients', label: 'Clients' }]
  expect(withSharedInboxNavigation(original).filter(item => item.label !== 'Inbox')).toEqual(original)
  expect(original).toHaveLength(2)
})
