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

    const option = __partnerNetworkServiceTestUtils.toTransactionPartnerOption(connection)
    assert.equal(option.id, 'partner-connection:connection-1')
    assert.equal(option.relationshipId, null)
    assert.equal(option.relationshipType, 'preferred')
    assert.equal(option.organisationId, 'org-tucker')
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
