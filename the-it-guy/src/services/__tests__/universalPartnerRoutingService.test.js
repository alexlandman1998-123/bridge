import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const service = await server.ssrLoadModule('/src/services/universalPartnerRoutingService.js')

  service.clearUniversalPartnerRoutingEvents('org-source')

  const baseInput = {
    sourceOrganisationId: 'org-source',
    sourceUserId: 'user-agent-1',
    sourceTeamId: 'team-1',
    sourceBranchId: 'branch-1',
    sourceRegionId: 'region-1',
    module: 'agent',
    moduleContext: { role: 'agent' },
  }

  const partnerConnections = {
    connections: [
      {
        id: 'rel-1',
        partnerOrganizationId: 'org-partner',
        status: 'connected',
      },
    ],
  }

  const partnerPeopleByRelationshipId = {
    'rel-1': {
      groups: {
        principal: [{ userId: 'user-direct', role: 'principal', isActive: true, branchId: 'branch-1', teamId: 'team-1' }],
        branch_managers: [{ userId: 'user-team-manager', role: 'branch_manager', isActive: true, branchId: 'branch-1', teamId: 'team-1' }],
        agents: [{ userId: 'user-agent', role: 'agent', isActive: true, branchId: 'branch-1', teamId: 'team-1' }],
      },
    },
  }

  const routingRules = [
    {
      id: 'rule-org',
      isActive: true,
      isDefault: true,
      sourceOrganisationId: 'org-source',
      sourceScopeType: 'organisation',
      targetOrganisationId: 'org-partner',
      targetRoleType: 'bond_originator',
      targetUserId: '',
      assignmentMode: 'organisation_queue',
      assignmentPriority: 100,
    },
    {
      id: 'rule-branch',
      isActive: true,
      isDefault: true,
      sourceOrganisationId: 'org-source',
      sourceScopeType: 'branch',
      sourceScopeId: 'branch-1',
      targetOrganisationId: 'org-partner',
      targetRoleType: 'bond_originator',
      targetUserId: '',
      assignmentMode: 'organisation_queue',
      assignmentPriority: 40,
    },
    {
      id: 'rule-user',
      isActive: true,
      isDefault: true,
      sourceOrganisationId: 'org-source',
      sourceScopeType: 'user',
      sourceUserId: 'user-agent-1',
      targetOrganisationId: 'org-partner',
      targetRoleType: 'bond_originator',
      targetUserId: 'user-direct',
      assignmentMode: 'direct_consultant',
      assignmentPriority: 10,
    },
  ]

  const userDecision = await service.universalPartnerRoutingResolver({
    ...baseInput,
    routingRules,
    partnerConnections,
    partnerPeopleByRelationshipId,
    targetRoleType: 'bond_originator',
  })
  assert.equal(userDecision.resolutionScope, 'user')
  assert.equal(userDecision.targetOrganisationId, 'org-partner')
  assert.equal(userDecision.targetUserId, 'user-direct')
  assert.equal(userDecision.fallbackUsed, false)

  const overrideDecision = await service.universalPartnerRoutingResolver({
    ...baseInput,
    transactionOverride: {
      targetOrganisationId: 'org-override',
      targetUserId: 'user-override',
      assignmentMode: 'direct_consultant',
    },
    targetRoleType: 'bond_originator',
  })
  assert.equal(overrideDecision.resolutionScope, 'transaction_override')
  assert.equal(overrideDecision.targetUserId, 'user-override')

  const disconnectedDecision = await service.universalPartnerRoutingResolver({
    ...baseInput,
    routingRules: [
      {
        ...routingRules[2],
        targetOrganisationId: 'org-missing',
      },
    ],
    partnerConnections,
    partnerPeopleByRelationshipId,
    targetRoleType: 'bond_originator',
  })
  assert.equal(disconnectedDecision.resolutionScope, 'system_fallback')
  assert.equal(disconnectedDecision.targetOrganisationId, '')
  assert.match(disconnectedDecision.resolutionReason, /no matching partner routing rule found|not connected/i)

  const comparison = service.compareRoutingDecisions(
    { targetUserId: 'a', assignmentMode: 'direct_consultant', resolutionScope: 'user' },
    { targetUserId: 'b', assignmentMode: 'direct_consultant', resolutionScope: 'user' },
  )
  assert.equal(comparison.status, 'mismatch')
  assert.equal(comparison.differences.targetUserId.legacy, 'a')

  const snapshot = await service.getUniversalPartnerRoutingDiagnosticsSnapshot({
    workspaceId: 'org-source',
    routingRules,
  })
  assert.ok(snapshot.totals.totalRoutes >= 3)
  assert.ok(Array.isArray(snapshot.recentEvents))

  const selections = await service.resolvePartnerRoutingSelections({
    ...baseInput,
    routingRules,
    partnerConnections,
    partnerPeopleByRelationshipId,
    targetRoleTypes: ['bond_originator', 'transfer_attorney'],
  })
  assert.equal(selections.length, 1)
  assert.equal(selections[0].roleType, 'bond_originator')
  assert.equal(selections[0].resolutionScope, 'user')
  assert.equal(selections[0].targetRegionId, null)

  console.log('universalPartnerRoutingService tests passed')
} finally {
  await server.close()
}
