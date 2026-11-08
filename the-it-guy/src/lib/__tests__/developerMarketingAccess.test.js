import { expect, it, vi } from 'vitest'
vi.mock('../featureFlags', () => ({ FEATURE_FLAGS: { disableRoleRestrictions: false }, SHOW_INTELLIGENCE_BETA: false }))
import { getRoleNavItems } from '../roles.js'
import { filterNavigationItems } from '../../auth/permissions/navigationPermissions.js'
import { canAccessMobileMarketing, getMobilePageMenuItems } from '../../config/mobileShell.js'

it('gives developer owners the same complete marketing navigation as agents', () => {
  const workspace = { role: 'developer', appRole: 'developer', workspaceType: 'developer_company', currentWorkspace: { id: 'developer-org', type: 'developer_company' }, currentMembership: { workspaceId: 'developer-org', role: 'owner', workspaceRole: 'owner', status: 'active' } }
  const developer = filterNavigationItems(getRoleNavItems('developer'), workspace).find(item => item.key === 'marketing_workspace')
  const agency = getRoleNavItems('agent').find(item => item.key === 'marketing_workspace')
  expect(developer).toBeDefined()
  const destinations = item => [item.to, ...(item.children || []).flatMap(destinations)]
  expect(destinations(developer)).toEqual(destinations(agency))
  expect(destinations(developer)).toContain('/marketing?section=email')
  expect(destinations(developer)).toContain('/marketing?section=whatsapp')
  expect(destinations(developer)).toContain('/marketing?section=website')
})

it('exposes developer mobile marketing without requiring an agency Sales workspace', () => {
  const workspace = { role: 'developer', businessWorkspaceSplitEnabled: true, availableBusinessWorkspaceIds: [] }
  expect(canAccessMobileMarketing(workspace)).toBe(true)
  expect(getMobilePageMenuItems(workspace).filter(item => item.to.startsWith('/mobile/marketing')).map(item => item.key)).toEqual(['marketing', 'campaigns', 'templateShop'])
})

it('retains agency Sales restrictions and does not add marketing to unrelated roles', () => {
  expect(canAccessMobileMarketing({ role: 'agent', businessWorkspaceId: 'rentals' })).toBe(false)
  expect(canAccessMobileMarketing({ role: 'agent', businessWorkspaceSplitEnabled: true, businessWorkspaceId: 'sales', availableBusinessWorkspaceIds: ['rentals'] })).toBe(false)
  for (const role of ['attorney', 'bond_originator', 'client', 'viewer']) {
    expect(canAccessMobileMarketing({ role })).toBe(false)
    expect(getRoleNavItems(role).some(item => item.key === 'marketing_workspace')).toBe(false)
  }
})
