import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

const connectionCompatibilityMigration = await readFile(
  new URL('../../supabase/migrations/202607160004_partner_connections_transaction_stage_compatibility.sql', import.meta.url),
  'utf8',
)

assert(connectionCompatibilityMigration.includes('create or replace function public.bridge_phase4_list_partner_connections'))
assert(connectionCompatibilityMigration.includes("coalesce(tx.stage, tx.current_main_stage, '')"))
assert.equal(connectionCompatibilityMigration.includes('tx.status'), false, 'the partner RPC must not reference the removed transaction status column')

try {
  const utils = await server.ssrLoadModule('/src/lib/newTransactionPartnerOptions.js')

  const directory = [
    {
      id: 'attorney-default',
      partnerType: 'transfer_attorney',
      companyName: 'Alpha Attorneys',
      contactPerson: 'Ada Alpha',
      email: 'ADA@ALPHA.EXAMPLE',
      phone: '+27 11 111 1111',
      partnerOrganisationId: 'org-alpha',
      isPreferredDefault: true,
      isActive: true,
    },
    {
      id: 'attorney-unlinked',
      partnerType: 'conveyancer',
      companyName: 'Bravo Conveyancing',
      email: 'bravo@example.test',
      isPreferredDefault: false,
      isActive: true,
    },
    {
      id: 'attorney-inactive',
      partnerType: 'transfer_attorney',
      companyName: 'Dormant Law',
      isActive: false,
    },
    {
      id: 'originator-default',
      partnerType: 'bond_originator',
      companyName: 'Capital Bonds',
      partnerOrganisationId: 'org-capital',
      isPreferredDefault: true,
      isActive: true,
    },
    {
      id: 'originator-second',
      partnerType: 'bond_originator',
      companyName: 'Delta Originators',
      isPreferredDefault: false,
      isActive: true,
    },
  ]

  const attorneys = utils.getPreferredDirectoryPartnerOptions(directory, 'transfer_attorney')
  const originators = utils.getPreferredDirectoryPartnerOptions(directory, 'bond_originator')

  assert.deepEqual(
    attorneys.map((partner) => partner.companyName),
    ['Alpha Attorneys', 'Bravo Conveyancing'],
    'all active attorney/conveyancer directory entries should pull into the attorney picker',
  )
  assert.deepEqual(
    originators.map((partner) => partner.companyName),
    ['Capital Bonds', 'Delta Originators'],
    'all active bond-originator directory entries should pull into the originator picker',
  )
  assert.equal(attorneys[0].email, 'ada@alpha.example', 'directory emails should be normalized')
  assert.equal(attorneys.some((partner) => partner.companyName === 'Dormant Law'), false, 'inactive entries stay hidden')

  const mergedAttorneys = utils.mergePartnerConnectionOptions(
    [
      {
        id: 'connection-alpha',
        connectionId: 'connection-alpha',
        organisationId: 'org-alpha',
        companyName: 'Alpha Attorneys',
        relationshipType: 'accepted',
        source: 'connected_partner',
      },
    ],
    attorneys,
  )

  assert.equal(mergedAttorneys.length, 2, 'linked directory and connection records should de-duplicate without hiding unlinked firms')
  assert.equal(mergedAttorneys[0].companyName, 'Alpha Attorneys', 'the explicit preferred default should sort first')
  assert.equal(mergedAttorneys[0].connectionId, 'connection-alpha', 'the accepted connection id should survive the merge')
  assert.equal(mergedAttorneys[0].preferredPartnerId, 'attorney-default', 'the preferred directory id should survive the merge')
  assert.equal(mergedAttorneys[0].email, 'ada@alpha.example', 'directory contact details should survive the merge')

  const preferredSelection = utils.partnerOptionToRolePlayerSelection('transfer_attorney', mergedAttorneys[0])
  assert.equal(preferredSelection.selectionSource, 'preferred_partner')
  assert.equal(preferredSelection.partnerConnectionId, 'connection-alpha')
  assert.equal(preferredSelection.preferredPartnerId, 'attorney-default')
  assert.equal(preferredSelection.partnerOrganisationId, 'org-alpha')

  const originatorSelection = utils.partnerOptionToRolePlayerSelection('bond_originator', originators[1])
  assert.equal(originatorSelection.selectionSource, 'preferred_partner', 'unlinked saved partners retain preferred-directory provenance')
  assert.equal(originatorSelection.preferredPartnerId, 'originator-second')
  assert.equal(originatorSelection.partnerOrganisationId, null)

  console.log('partner workflow sequence tests passed')
} finally {
  await server.close()
}
