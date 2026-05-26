import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { __agencyCrmRepositoryTestUtils } = await server.ssrLoadModule('/src/lib/agencyCrmRepository.js')
  const { reconcileAgencyPipelineSnapshot } = await server.ssrLoadModule('/src/lib/agencyPipelineService.js')
  const { buildLocalLeadAndContactRows, buildRemoteLeadCreatePayload, resolveLeadScopeContext } = __agencyCrmRepositoryTestUtils

  const organisationId = '11111111-1111-4111-8111-111111111111'
  const branchId = '22222222-2222-4222-8222-222222222222'
  const assignedUserId = '33333333-3333-4333-8333-333333333333'
  const actorId = '44444444-4444-4444-8444-444444444444'

  const { lead } = buildLocalLeadAndContactRows({
    contact: {
      firstName: 'Taylor',
      lastName: 'Buyer',
      phone: '0820000000',
      email: 'taylor@example.com',
    },
    assignedAgent: {
      id: assignedUserId,
      userId: assignedUserId,
      branchId,
      name: 'Casey Agent',
      email: 'casey@example.com',
    },
    branchId,
    assignedUserId,
    createdBy: actorId,
    leadCategory: 'Buyer',
    leadSource: 'Walk-in',
  }, organisationId)

  assert.equal(lead.organisationId, organisationId)
  assert.equal(lead.branchId, branchId)
  assert.equal(lead.assignedUserId, assignedUserId)
  assert.equal(lead.createdBy, actorId)
  assert.equal(lead.assignedAgentId, assignedUserId)

  const remotePayload = buildRemoteLeadCreatePayload(lead, organisationId, { id: actorId })
  assert.equal(remotePayload.organisation_id, organisationId)
  assert.equal(remotePayload.branch_id, branchId)
  assert.equal(remotePayload.assigned_user_id, assignedUserId)
  assert.equal(remotePayload.assigned_agent_id, assignedUserId)
  assert.equal(remotePayload.created_by, actorId)

  const { lead: fallbackLead } = buildLocalLeadAndContactRows({
    contact: {
      firstName: 'Sam',
      lastName: 'Seller',
      phone: '0830000000',
      email: 'sam@example.com',
    },
    assignedAgent: {
      id: assignedUserId,
      branchId,
      name: 'Casey Agent',
      email: 'casey@example.com',
    },
    branchId,
    leadCategory: 'Seller',
  }, organisationId)

  const fallbackPayload = buildRemoteLeadCreatePayload(fallbackLead, organisationId, { id: actorId })
  assert.equal(fallbackPayload.assigned_user_id, assignedUserId)
  assert.equal(fallbackPayload.created_by, actorId)

  const resolvedScope = await resolveLeadScopeContext(
    organisationId,
    {
      assignedAgent: {
        id: assignedUserId,
        email: 'casey@example.com',
      },
    },
    { id: actorId, email: 'actor@example.com' },
    async () => ({
      user_id: assignedUserId,
      email: 'casey@example.com',
      branch_id: branchId,
    }),
  )
  assert.equal(resolvedScope.assignedUserId, assignedUserId)
  assert.equal(resolvedScope.branchId, branchId)
  assert.equal(resolvedScope.createdBy, actorId)
  assert.equal(resolvedScope.assignedAgent.userId, assignedUserId)
  assert.equal(resolvedScope.assignedAgent.branchId, branchId)

  const reconciled = reconcileAgencyPipelineSnapshot(organisationId, {
    leads: [{
      leadId: lead.leadId,
      organisationId,
      branchId,
      assignedUserId,
      createdBy: actorId,
      assignedAgentId: assignedUserId,
      assignedAgentEmail: 'casey@example.com',
      contactId: lead.contactId,
      leadCategory: 'Buyer',
      leadDirection: 'Inbound',
      leadSource: 'Walk-in',
      stage: 'New Lead',
      status: 'New Lead',
      priority: 'Medium',
      budget: 0,
      estimatedValue: 0,
      notes: 'Regression check',
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
    }],
  }, {
    replaceCollections: ['leads'],
  })
  assert.equal(reconciled.leads[0].branchId, branchId)
  assert.equal(reconciled.leads[0].assignedUserId, assignedUserId)
  assert.equal(reconciled.leads[0].createdBy, actorId)

  console.log('agency-crm-lead-persistence tests passed')
} finally {
  await server.close()
}
