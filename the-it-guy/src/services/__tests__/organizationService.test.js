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
    __organizationServiceTestUtils,
    getOrganizationTypeLabel,
    normalizeOrganizationRole,
    normalizeOrganizationType,
  } = await server.ssrLoadModule('/src/services/organizationService.js')

  {
    assert.equal(normalizeOrganizationType('Attorney Firm'), 'attorney_firm')
    assert.equal(normalizeOrganizationType('developer_company'), 'developer')
    assert.equal(normalizeOrganizationType('Bond Originator'), 'bond_originator')
    assert.equal(normalizeOrganizationType('unknown'), 'service_provider')
    assert.equal(getOrganizationTypeLabel('attorney_firm'), 'Attorney Firm')
  }

  {
    assert.equal(normalizeOrganizationRole('principal'), 'owner')
    assert.equal(normalizeOrganizationRole('administrator'), 'admin')
    assert.equal(normalizeOrganizationRole('conveyancer'), 'member')
  }

  {
    const organization = __organizationServiceTestUtils.toOrganization({
      id: 'org-1',
      name: 'Tucker Attorneys',
      organization_type: 'attorney_firm',
      organization_subtype: 'transfer_bond_attorney',
      membership_status: 'active',
      organization_role: 'owner',
      member_count: 12,
      pending_requests: 2,
      transaction_count: 84,
    })

    assert.equal(organization.typeLabel, 'Attorney Firm')
    assert.equal(organization.subtype, 'transfer_bond_attorney')
    assert.equal(organization.organizationRole, 'owner')
    assert.equal(organization.memberCount, 12)
    assert.equal(organization.pendingRequests, 2)
    assert.equal(organization.transactionCount, 84)
  }

  {
    const member = __organizationServiceTestUtils.toMember({
      id: 'member-1',
      first_name: 'Sarah',
      last_name: 'Jones',
      email: 'SARAH@TUCKER.CO.ZA',
      membership_status: 'pending',
      organization_role: 'member',
    })

    assert.equal(member.fullName, 'Sarah Jones')
    assert.equal(member.email, 'sarah@tucker.co.za')
    assert.equal(member.membershipStatus, 'pending')
    assert.equal(member.organizationRoleLabel, 'Member')
  }

  console.log('organizationService tests passed')
} finally {
  await server.close()
}
