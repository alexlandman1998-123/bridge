import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'

import {
  resolvePortalBuyerName,
  resolvePortalPropertyLabel,
  resolvePortalSellerName,
} from '../src/services/portalCanonicalFieldFallbacks.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:portal-canonical-fields-phase4'],
  'node scripts/portal-canonical-fields-phase4.test.mjs',
  'package.json should expose the portal canonical fields Phase 4 contract.',
)

const canonicalSellerForm = {
  seller: {
    company: {
      name: 'Queens Cres Holdings (Pty) Ltd',
    },
  },
  property: {
    address: {
      line_1: '409 Queens Cres',
      suburb: 'Lynnwood',
      city: 'Pretoria',
      postal_code: '0081',
    },
  },
}

assert.equal(
  resolvePortalSellerName({ formData: canonicalSellerForm }),
  'Queens Cres Holdings (Pty) Ltd',
)
assert.equal(
  resolvePortalPropertyLabel({ formData: canonicalSellerForm }, { fallback: 'Property sale' }),
  '409 Queens Cres',
)

const canonicalBuyerRow = {
  transaction: {
    id: 'tx-canonical-buyer',
    onboarding_form_data: {
      buyer: {
        person: {
          first_name: 'Jordan',
          last_name: 'Buyer',
        },
      },
      property: {
        address: {
          line_1: '22 Bond Street',
          city: 'Cape Town',
        },
      },
    },
  },
}

assert.equal(resolvePortalBuyerName(canonicalBuyerRow), 'Jordan Buyer')
assert.equal(resolvePortalPropertyLabel(canonicalBuyerRow), '22 Bond Street')

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const partnerPortal = await server.ssrLoadModule('/src/services/bondPartnerPortalService.js')
  const normalizedApplication = partnerPortal.__bondPartnerPortalServiceTestUtils.normalizeApplication({
    id: 'application-1',
    transaction: canonicalBuyerRow.transaction,
  })
  assert.equal(normalizedApplication.buyer, 'Jordan Buyer')
  assert.equal(normalizedApplication.property, '22 Bond Street')

  const queueService = await server.ssrLoadModule('/src/services/bondOperationalQueueService.js')
  const queueViewModel = queueService.buildBondNewApplicationViewModel({
    transaction: {
      ...canonicalBuyerRow.transaction,
      finance_type: 'bond',
      primary_bond_consultant_user_id: '11111111-1111-4111-8111-111111111111',
    },
  })
  assert.equal(queueViewModel.buyerName, 'Jordan Buyer')
  assert.equal(queueViewModel.propertyLabel, '22 Bond Street')

  const commandCenterSource = await readFile(new URL('../src/services/bondCommandCenterService.js', import.meta.url), 'utf8')
  assert.match(commandCenterSource, /resolvePortalBuyerName/)
  assert.match(commandCenterSource, /resolvePortalPropertyLabel/)

  const clientPortalSource = await readFile(new URL('../src/services/clientPortalWorkspaceService.js', import.meta.url), 'utf8')
  assert.match(clientPortalSource, /resolvePortalSellerName/)
  assert.match(clientPortalSource, /resolvePortalPropertyLabel/)
} finally {
  await server.close()
}

console.log('Portal canonical fields Phase 4 contract passed.')
