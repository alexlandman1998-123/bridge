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
    getDeveloperWorkspacePartnerOptions,
    partnerOptionToRolePlayerSelection,
  } = await server.ssrLoadModule('/src/lib/newTransactionPartnerOptions.js')

  const options = getDeveloperWorkspacePartnerOptions(
    {
      defaults: [
        {
          id: 'default-tuckers',
          partnerType: 'transfer_attorney',
          companyName: 'Tuckers Attorneys',
          email: 'Conveyancing@Tuckers.example',
          partnerOrganisationId: 'org-tuckers',
          attorneyFirmId: 'firm-tuckers',
          isPreferredDefault: true,
        },
      ],
      relationships: [
        {
          id: 'relationship-tuckers',
          partnerType: 'transfer_attorney',
          partnerName: 'Tuckers Attorneys',
          partnerInvitationEmail: 'transfer@tuckers.example',
          partnerOrganisationId: 'org-tuckers',
          status: 'accepted',
        },
        {
          id: 'relationship-bond',
          partnerType: 'bond_originator',
          partnerName: 'Bond Route',
          partnerInvitationEmail: 'bond@example.test',
          partnerOrganisationId: 'org-bond',
          status: 'accepted',
        },
      ],
    },
    'transfer_attorney',
  )

  assert.equal(options.length, 1)
  assert.equal(options[0].companyName, 'Tuckers Attorneys')
  assert.equal(options[0].source, 'developer_partner_default')
  assert.equal(options[0].relationshipId, 'relationship-tuckers')
  assert.equal(options[0].partnerOrganisationId, 'org-tuckers')
  assert.equal(options[0].attorneyFirmId, 'firm-tuckers')

  const rolePlayer = partnerOptionToRolePlayerSelection('transfer_attorney', options[0])
  assert.equal(rolePlayer.partnerOrganisationId, 'org-tuckers')
  assert.equal(rolePlayer.partnerRelationshipId, 'relationship-tuckers')
  assert.equal(rolePlayer.partner.email, 'conveyancing@tuckers.example')
  assert.equal(rolePlayer.attorneyFirmId, 'firm-tuckers')
  assert.equal(rolePlayer.firmFirstAllocation, true)

  const bondOptions = getDeveloperWorkspacePartnerOptions(
    {
      relationships: [
        {
          id: 'relationship-bond',
          partnerType: 'bond_originator',
          partnerName: 'Bond Route',
          partnerInvitationEmail: 'bond@example.test',
          partnerOrganisationId: 'org-bond',
          status: 'accepted',
        },
      ],
    },
    'bond_originator',
  )

  assert.equal(bondOptions.length, 1)
  assert.equal(bondOptions[0].companyName, 'Bond Route')
  assert.equal(bondOptions[0].source, 'developer_partner_relationship')

  console.log('newTransactionPartnerOptions tests passed')
} finally {
  await server.close()
}
