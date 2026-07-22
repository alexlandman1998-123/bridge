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

const {
  buildLegacyPartnerDirectory,
  normalizePartnerDirectoryEntry,
} = await server.ssrLoadModule('/src/services/partnerDirectoryService.js')

try {
const organisationId = 'org-owner'
const directory = buildLegacyPartnerDirectory({
  organisationId,
  relationships: [
    {
      id: 'relationship-1',
      relationshipStatus: 'accepted',
      preferred: true,
      partner: { id: 'org-attorney', name: 'Tucker Attorneys', type: 'attorney_firm' },
    },
  ],
  preferredPartners: [
    {
      id: 'preferred-linked',
      partnerOrganisationId: 'org-attorney',
      partnerType: 'bond_attorney',
      companyName: 'Tucker Attorneys',
      contactPerson: 'Jane Partner',
      email: 'JANE@TUCKER.EXAMPLE',
      isActive: true,
    },
    {
      id: 'preferred-external',
      partnerType: 'bond_originator',
      companyName: 'Bond Co',
      email: 'hello@bond.example',
      isActive: true,
    },
  ],
  invitations: [
    {
      id: 'invite-1',
      fromOrganisationId: organisationId,
      externalPartnerId: 'preferred-external',
      recipientEmail: 'INVITES@BOND.EXAMPLE',
      toOrganisationName: 'Bond Co',
      toWorkspaceType: 'bond_originator',
      status: 'pending',
    },
  ],
})

assert.equal(directory.length, 2)

const attorney = directory.find((entry) => entry.partnerOrganisationId === 'org-attorney')
assert.ok(attorney)
assert.equal(attorney.directoryId, 'organisation:org-attorney')
assert.equal(attorney.status, 'connected')
assert.equal(attorney.primaryContact.name, 'Jane Partner')
assert.deepEqual(attorney.roles, ['transfer_attorney', 'bond_attorney'])

const originator = directory.find((entry) => entry.externalPartnerId === 'preferred-external')
assert.ok(originator)
assert.equal(originator.directoryId, 'external:preferred-external')
assert.equal(originator.invitationId, 'invite-1')
assert.equal(originator.status, 'invite_pending')
assert.equal(originator.primaryContact.email, 'hello@bond.example')
assert.deepEqual(originator.roles, ['bond_originator'])

const normalized = normalizePartnerDirectoryEntry({
  directory_id: 'external:one',
  display_name: 'Example',
  roles: ['agency'],
  invitation_status: 'pending',
})
assert.equal(normalized.status, 'invite_pending')
assert.deepEqual(normalized.roles, ['referral_agency'])

console.log('Unified partner-directory compatibility tests passed.')
} finally {
  await server.close()
}
