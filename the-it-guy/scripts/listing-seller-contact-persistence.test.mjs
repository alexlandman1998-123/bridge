import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { buildListingSellerLeadPayload } = await server.ssrLoadModule('/src/lib/listingSellerLeadPayload.js')
  const { __agencyCrmRepositoryTestUtils } = await server.ssrLoadModule('/src/lib/agencyCrmRepository.js')
  const { buildLocalLeadAndContactRows } = __agencyCrmRepositoryTestUtils
  const organisationId = '11111111-1111-4111-8111-111111111111'
  const agentId = '22222222-2222-4222-8222-222222222222'

  const payload = buildListingSellerLeadPayload({
    seller: {
      firstName: 'TEST Seller',
      lastName: 'Mock',
      email: 'TEST.SELLER@EXAMPLE.COM',
      phone: '+27820000001',
    },
    property: {
      title: 'TEST — DO NOT ACTION 101 Mock Avenue',
      propertyAddress: '101 Mock Avenue',
      suburb: 'TEST Suburb',
      city: 'TEST City',
      province: 'TEST Province',
      askingPrice: 1000000,
    },
    assignment: {
      id: agentId,
      name: 'Test Agent',
      email: 'agent@example.com',
      createdBy: agentId,
    },
    source: 'Manual Entry',
    notes: 'TEST — DO NOT ACTION',
  })

  const { contact, lead } = buildLocalLeadAndContactRows(payload, organisationId)
  assert.equal(contact.firstName, 'TEST Seller')
  assert.equal(contact.lastName, 'Mock')
  assert.equal(contact.email, 'test.seller@example.com')
  assert.equal(contact.phone, '+27820000001')
  assert.equal(contact.contactType, 'Seller')
  assert.equal(lead.contactId, contact.contactId)
  assert.equal(lead.sellerName, 'TEST Seller')
  assert.equal(lead.sellerEmail, 'test.seller@example.com')
  assert.equal(lead.sellerPhone, '+27820000001')
  assert.equal(lead.sellerPropertyAddress, '101 Mock Avenue')
  assert.equal(lead.assignedAgentId, agentId)
  assert.equal(lead.assignedUserId, agentId)

  console.log('listing seller contact persistence tests passed')
} finally {
  await server.close()
}
