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
  const service = await server.ssrLoadModule('/src/services/partnerRoutingResolverService.js')

  const baseInput = {
    sourceOrganisationId: 'org-source',
    sourceUserId: 'user-agent-1',
    sourceTeamId: 'team-1',
    sourceBranchId: 'branch-1',
    sourceRegionId: 'region-1',
    moduleContext: { role: 'agent' },
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
      id: 'rule-region',
      isActive: true,
      isDefault: true,
      sourceOrganisationId: 'org-source',
      sourceScopeType: 'region',
      sourceScopeId: 'region-1',
      targetOrganisationId: 'org-partner',
      targetRoleType: 'bond_originator',
      targetUserId: '',
      assignmentMode: 'organisation_queue',
      assignmentPriority: 60,
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
      id: 'rule-team',
      isActive: true,
      isDefault: true,
      sourceOrganisationId: 'org-source',
      sourceScopeType: 'team',
      sourceScopeId: 'team-1',
      targetOrganisationId: 'org-partner',
      targetRoleType: 'bond_originator',
      targetUserId: 'user-team-manager',
      assignmentMode: 'direct_consultant',
      assignmentPriority: 20,
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
    {
      id: 'rule-transfer',
      isActive: true,
      isDefault: true,
      sourceOrganisationId: 'org-source',
      sourceScopeType: 'organisation',
      targetOrganisationId: 'org-partner',
      targetRoleType: 'transfer_attorney',
      targetUserId: '',
      assignmentMode: 'organisation_queue',
      assignmentPriority: 120,
    },
  ]

  const partnerConnections = {
    connections: [
      {
        id: 'rel-1',
        partnerOrganizationId: 'org-partner',
        partnerRoleType: 'bond_originator',
        partnerRoleTypes: ['bond_originator', 'transfer_attorney'],
        services: [
          { key: 'bond_origination', label: 'Bond Origination', isActive: true },
          { key: 'property_transfers', label: 'Property Transfers', isActive: true },
        ],
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
  assert.equal(userDecision.assignmentMode, 'direct_consultant')

  const branchDecision = await service.universalPartnerRoutingResolver({
    ...baseInput,
    sourceUserId: '',
    sourceScopeId: '',
    targetRoleType: 'bond_originator',
    routingRules: routingRules.filter((rule) => rule.id !== 'rule-user'),
    partnerConnections,
    partnerPeopleByRelationshipId,
  })
  assert.equal(branchDecision.resolutionScope, 'team')
  assert.equal(branchDecision.targetUserId, 'user-team-manager')
  assert.equal(branchDecision.assignmentMode, 'direct_consultant')

  const inactiveFallback = await service.universalPartnerRoutingResolver({
    ...baseInput,
    routingRules: [
      {
        ...routingRules[4],
        targetUserId: 'user-missing',
      },
    ],
    partnerConnections,
    partnerPeopleByRelationshipId: {
      'rel-1': {
        groups: {
          principal: [{ userId: 'user-missing', role: 'principal', isActive: false }],
          branch_managers: [],
          agents: [],
        },
      },
    },
    targetRoleType: 'bond_originator',
  })
  assert.equal(inactiveFallback.targetUserId, null)
  assert.equal(inactiveFallback.assignmentMode, 'organisation_queue')
  assert.match(inactiveFallback.fallbackReason, /falls back to the partner organisation queue/i)

  const unresolvedPersonFallback = await service.universalPartnerRoutingResolver({
    ...baseInput,
    routingRules: [
      {
        ...routingRules[4],
        targetUserId: 'user-not-loaded',
      },
    ],
    partnerConnections,
    partnerPeopleByRelationshipId: {},
    targetRoleType: 'bond_originator',
  })
  assert.equal(unresolvedPersonFallback.targetUserId, null)
  assert.equal(unresolvedPersonFallback.assignmentMode, 'organisation_queue')
  assert.match(unresolvedPersonFallback.fallbackReason, /could not be validated/i)

  const selections = await service.resolvePartnerRoutingSelections({
    ...baseInput,
    routingRules,
    partnerConnections,
    partnerPeopleByRelationshipId,
    targetRoleTypes: ['bond_originator', 'transfer_attorney'],
  })
  assert.equal(selections.length, 2)
  assert.equal(selections[0].roleType, 'bond_originator')

  console.log('partnerRoutingResolverService tests passed')
} finally {
  await server.close()
}
