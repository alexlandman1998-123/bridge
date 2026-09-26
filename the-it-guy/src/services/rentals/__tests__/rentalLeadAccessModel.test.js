import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertRentalLeadAssignee, isRentalLeadVisibleInScope } from '../rentalLeadAccessModel.js'

const unassigned = { branchId: '', assignedAgentId: '', assignedUserId: '', createdBy: '' }
const branchLead = { branchId: 'branch-a', assignedAgentId: '', assignedUserId: '', createdBy: '' }
const assigned = { branchId: 'branch-b', assignedAgentId: 'agent-a', assignedUserId: 'agent-a', createdBy: 'agent-b' }

test('organisation queue includes unassigned rental leads, while branch and agent scopes stay limited', () => {
  assert.equal(isRentalLeadVisibleInScope(unassigned, { scopeLevel: 'organisation', includeAllOrganisationLeads: true }), true)
  assert.equal(isRentalLeadVisibleInScope(branchLead, { scopeLevel: 'branch', branchId: 'branch-a' }), true)
  assert.equal(isRentalLeadVisibleInScope(branchLead, { scopeLevel: 'branch', branchId: 'branch-b' }), false)
  assert.equal(isRentalLeadVisibleInScope(unassigned, { scopeLevel: 'branch', branchId: 'branch-a' }), false)
  assert.equal(isRentalLeadVisibleInScope(assigned, { scopeLevel: 'assigned', assignedAgentId: 'agent-a' }), true)
  assert.equal(isRentalLeadVisibleInScope(assigned, { scopeLevel: 'assigned', assignedAgentId: 'agent-c' }), false)
})

test('assignment requires a manager scope and an active member in that branch and organisation', () => {
  const member = { userId: 'agent-a', status: 'active', organisationId: 'org-a', branchId: 'branch-a' }
  assert.doesNotThrow(() => assertRentalLeadAssignee({ scopeLevel: 'branch', branchId: 'branch-a' }, member, 'org-a'))
  assert.doesNotThrow(() => assertRentalLeadAssignee({ scopeLevel: 'organisation' }, { ...member, status: 'accepted' }, 'org-a'))
  assert.throws(() => assertRentalLeadAssignee({ scopeLevel: 'assigned' }, member, 'org-a'), /Only organisation or branch managers/)
  assert.throws(() => assertRentalLeadAssignee({ scopeLevel: 'branch', branchId: 'branch-b' }, member, 'org-a'), /your branch/)
  assert.throws(() => assertRentalLeadAssignee({ scopeLevel: 'organisation' }, { ...member, organisationId: 'org-b' }, 'org-a'), /this organisation/)
  assert.throws(() => assertRentalLeadAssignee({ scopeLevel: 'organisation' }, { ...member, status: 'invited' }, 'org-a'), /active team member/)
})
