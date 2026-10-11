import { expect, it, vi } from 'vitest'
vi.mock('../../../lib/featureFlags', () => ({ FEATURE_FLAGS: { disableRoleRestrictions: false } }))
import { evaluateAccessRequirement, getRouteAccessRequirement } from '../permissionResolver.js'
import { PERMISSIONS } from '../permissionRegistry.js'

function context(appRole, workspaceType, workspaceRole = 'owner', status = 'active') {
  return { appRole, role: appRole, workspaceType, currentWorkspace: { id: 'workspace', type: workspaceType }, currentMembership: { id: 'membership', workspaceId: 'workspace', workspaceRole, role: workspaceRole, status } }
}

it('permits active agents and developers with lead permissions on list and detail routes', () => {
  for (const path of ['/developer/leads', '/developer/leads/linked-lead']) {
    const rule = getRouteAccessRequirement(path)
    expect(rule.anyOf.every(entry => entry.permission === PERMISSIONS.viewLeads)).toBe(true)
    expect(evaluateAccessRequirement(rule, context('developer', 'developer_company')).ok).toBe(true)
    for (const role of ['agent', 'team_lead', 'principal']) {
      expect(evaluateAccessRequirement(rule, context('agent', 'agency', role)).ok).toBe(true)
    }
  }
})

it('continues to deny suspended, inactive and pending memberships', () => {
  const rule = getRouteAccessRequirement('/developer/leads/linked-lead')
  for (const status of ['suspended', 'inactive', 'pending']) {
    expect(evaluateAccessRequirement(rule, context('agent', 'agency', 'agent', status)).ok).toBe(false)
  }
})

it('denies clients and unrelated professional workspaces', () => {
  const rule = getRouteAccessRequirement('/developer/leads/linked-lead')
  for (const [role, workspace] of [['client', 'agency'], ['attorney', 'attorney_firm'], ['bond_originator', 'bond_originator'], ['agent', 'attorney_firm']]) {
    expect(evaluateAccessRequirement(rule, context(role, workspace)).ok).toBe(false)
  }
})
