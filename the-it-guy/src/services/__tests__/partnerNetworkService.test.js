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
  const {
    PARTNER_DELIVERY_PATHS,
    PARTNER_WORK_DELIVERY_TYPES,
    TRANSACTION_PARTNER_ASSIGNMENT_SOURCES,
    TRANSACTION_PARTNER_ASSIGNMENT_STATUSES,
    __partnerNetworkServiceTestUtils,
    getPartnerRoleTypeForOrganizationType,
    normalizeConnectionStatus,
  } = await server.ssrLoadModule('/src/services/partnerNetworkService.js')

  {
    assert.equal(normalizeConnectionStatus('accepted'), 'connected')
    assert.equal(normalizeConnectionStatus('rejected'), 'declined')
    assert.equal(normalizeConnectionStatus('blocked'), 'blocked')
    assert.equal(normalizeConnectionStatus('unknown'), 'pending')
  }

  {
    assert.equal(getPartnerRoleTypeForOrganizationType('attorney_firm'), 'transfer_attorney')
    assert.equal(getPartnerRoleTypeForOrganizationType('Bond Originator'), 'bond_originator')
    assert.equal(getPartnerRoleTypeForOrganizationType('developer_company'), 'developer')
  }

  {
    const connection = __partnerNetworkServiceTestUtils.toPartnerConnection({
      id: 'connection-1',
      partner_organization_id: 'org-tucker',
      partner_name: 'Tucker Attorneys',
      partner_organization_type: 'attorney_firm',
      service_offerings: ['property_transfers', 'bond_registrations'],
      relationship_type: 'agency_attorney',
      status: 'connected',
      is_preferred: true,
      direction: 'outgoing',
      transaction_count: 48,
      active_transaction_count: 12,
      completed_transaction_count: 36,
    })

    assert.equal(connection.partnerName, 'Tucker Attorneys')
    assert.equal(connection.partnerRoleType, 'transfer_attorney')
    assert.equal(connection.relationshipTypeLabel, 'Agency to Attorney')
    assert.equal(connection.isPreferred, true)
    assert.equal(connection.transactionCount, 48)
    assert.deepEqual(connection.partnerRoleTypes, ['transfer_attorney', 'bond_attorney'])
    assert.equal(__partnerNetworkServiceTestUtils.partnerConnectionSupportsRoleType(connection, 'bond_attorney'), true)
    assert.equal(__partnerNetworkServiceTestUtils.partnerConnectionSupportsRoleType(connection, 'cancellation_attorney'), false)

    const option = __partnerNetworkServiceTestUtils.toTransactionPartnerOption(connection)
    assert.equal(option.id, 'partner-connection:connection-1')
    assert.equal(option.relationshipId, null)
    assert.equal(option.relationshipType, 'preferred')
    assert.equal(option.organisationId, 'org-tucker')
    assert.deepEqual(option.services.map((service) => service.key), ['property_transfers', 'bond_registrations'])
  }

  {
    const workflow = __partnerNetworkServiceTestUtils.resolvePartnerDeliveryWorkflow({
      transactionId: 'tx-1',
      agencyOrganisationId: 'agency-1',
      roleType: 'transfer_attorney',
      connection: {
        id: 'connection-1',
        partnerOrganizationId: 'org-tucker',
        partnerName: 'Tucker Attorneys',
        partner_organization_type: 'attorney_firm',
        services: [{ key: 'property_transfers', label: 'Property Transfers', isActive: true }],
        status: 'connected',
      },
      targetUserId: 'user-attorney-1',
      source: 'routing',
      routingRuleId: 'rule-transfer-default',
      createdBy: 'user-agent-1',
      deliveryPayload: { matterNumber: 'A123' },
    })

    assert.equal(workflow.path, PARTNER_DELIVERY_PATHS.existingConnectedPartner)
    assert.equal(workflow.requiresPlatformInvite, false)
    assert.deepEqual(Object.keys(workflow.assignment), [
      'transaction_id',
      'agency_organisation_id',
      'partner_organisation_id',
      'partner_connection_id',
      'partner_service_type',
      'partner_role',
      'assigned_person_id',
      'assigned_queue_id',
      'delivery_type',
      'assignment_status',
      'onboarding_invite_id',
      'work_item_id',
      'source',
      'routing_rule_id',
      'created_by',
      'accepted_at',
      'activated_at',
      'cancelled_at',
    ])
    assert.equal(workflow.assignment.transaction_id, 'tx-1')
    assert.equal(workflow.assignment.agency_organisation_id, 'agency-1')
    assert.equal(workflow.assignment.assignment_status, TRANSACTION_PARTNER_ASSIGNMENT_STATUSES.active)
    assert.equal(workflow.assignment.partner_organisation_id, 'org-tucker')
    assert.equal(workflow.assignment.partner_connection_id, 'connection-1')
    assert.equal(workflow.assignment.partner_service_type, 'property_transfers')
    assert.equal(workflow.assignment.partner_role, 'transfer_attorney')
    assert.equal(workflow.assignment.assigned_person_id, 'user-attorney-1')
    assert.equal(workflow.assignment.assigned_queue_id, null)
    assert.equal(workflow.assignment.delivery_type, PARTNER_WORK_DELIVERY_TYPES.attorneyInstruction)
    assert.equal(workflow.assignment.onboarding_invite_id, null)
    assert.equal(workflow.assignment.work_item_id, null)
    assert.equal(workflow.assignment.source, TRANSACTION_PARTNER_ASSIGNMENT_SOURCES.routing)
    assert.equal(workflow.assignment.routing_rule_id, 'rule-transfer-default')
    assert.equal(workflow.assignment.created_by, 'user-agent-1')
    assert.equal(workflow.assignment.accepted_at, null)
    assert.equal(workflow.assignment.activated_at, null)
    assert.equal(workflow.assignment.cancelled_at, null)
    assert.equal(workflow.workDelivery.deliveryType, PARTNER_WORK_DELIVERY_TYPES.attorneyInstruction)
    assert.equal(workflow.workDelivery.createImmediately, true)
    assert.equal(workflow.onboarding.createInvite, false)
  }

  {
    const workflow = __partnerNetworkServiceTestUtils.resolvePartnerDeliveryWorkflow({
      transactionId: 'tx-2',
      agencyOrganisationId: 'agency-1',
      roleType: 'bond_originator',
      partnerOrganisationId: 'org-pending-bond',
      assignedQueueId: 'queue-bond-applications',
      source: 'manual',
      deliveryPayload: { financeType: 'bond' },
    })

    assert.equal(workflow.path, PARTNER_DELIVERY_PATHS.externalPartnerOnboarding)
    assert.equal(workflow.requiresPlatformInvite, true)
    assert.equal(workflow.assignment.transaction_id, 'tx-2')
    assert.equal(workflow.assignment.agency_organisation_id, 'agency-1')
    assert.equal(workflow.assignment.assignment_status, TRANSACTION_PARTNER_ASSIGNMENT_STATUSES.pendingOnboarding)
    assert.equal(workflow.assignment.partner_organisation_id, 'org-pending-bond')
    assert.equal(workflow.assignment.partner_connection_id, null)
    assert.equal(workflow.assignment.partner_service_type, 'bond_origination')
    assert.equal(workflow.assignment.partner_role, 'bond_originator')
    assert.equal(workflow.assignment.assigned_person_id, null)
    assert.equal(workflow.assignment.assigned_queue_id, 'queue-bond-applications')
    assert.equal(workflow.assignment.delivery_type, PARTNER_WORK_DELIVERY_TYPES.bondApplicationRequest)
    assert.equal(workflow.assignment.onboarding_invite_id, null)
    assert.equal(workflow.assignment.work_item_id, null)
    assert.equal(workflow.assignment.source, TRANSACTION_PARTNER_ASSIGNMENT_SOURCES.manual)
    assert.equal(workflow.assignment.pending_work_delivery.deliveryType, PARTNER_WORK_DELIVERY_TYPES.bondApplicationRequest)
    assert.equal(workflow.workDelivery.createImmediately, false)
    assert.equal(workflow.onboarding.createInvite, true)
  }

  {
    const candidate = __partnerNetworkServiceTestUtils.toPartnerCandidate({
      id: 'org-betterbond',
      display_name: 'BetterBond',
      organization_type: 'bond_originator',
      connection_status: 'pending',
      connection_direction: 'incoming',
    })

    assert.equal(candidate.name, 'BetterBond')
    assert.equal(candidate.typeLabel, 'Bond Originator')
    assert.equal(candidate.connectionStatus, 'pending')
    assert.equal(candidate.connectionDirection, 'incoming')
  }

  console.log('partnerNetworkService tests passed')
} finally {
  await server.close()
}
