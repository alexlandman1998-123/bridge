import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'

import {
  resolvePortalBuyerName,
  resolvePortalPropertyLabel,
  resolvePortalSellerName,
} from '../src/services/portalCanonicalFieldFallbacks.js'
import { deriveResidentialDashboardMetrics } from '../src/services/residentialDashboardService.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:dashboard-canonical-fields-phase5'],
  'node scripts/dashboard-canonical-fields-phase5.test.mjs',
  'package.json should expose the dashboard canonical fields Phase 5 contract.',
)

const canonicalOnboardingFormData = {
  buyer: {
    person: {
      first_name: 'Jordan',
      last_name: 'Buyer',
    },
  },
  seller: {
    person: {
      first_name: 'Alex',
      last_name: 'Seller',
    },
  },
  property: {
    address: {
      line_1: '22 Bond Street',
      suburb: 'Newlands',
      city: 'Cape Town',
      postal_code: '7700',
    },
  },
}

const canonicalDashboardRow = {
  id: 'tx-phase-5',
  buyerName: 'Buyer pending',
  buyer_name: 'Buyer pending',
  sellerName: 'Seller pending',
  seller_name: 'Seller pending',
  property: 'Property pending',
  propertyLabel: 'Property pending',
  property_address: 'Property pending',
  onboarding_form_data: canonicalOnboardingFormData,
  transaction: {
    id: 'tx-phase-5',
    buyer_name: 'Buyer pending',
    seller_name: 'Seller pending',
    property_address_line_1: 'Property pending',
    onboarding_form_data: canonicalOnboardingFormData,
  },
}

assert.equal(resolvePortalBuyerName(canonicalDashboardRow), 'Jordan Buyer')
assert.equal(resolvePortalSellerName(canonicalDashboardRow, { fallback: '' }), 'Alex Seller')
assert.equal(resolvePortalPropertyLabel(canonicalDashboardRow, { fallback: '' }), '22 Bond Street')

const residential = deriveResidentialDashboardMetrics({
  source: {
    activeTransactions: [
      {
        ...canonicalDashboardRow,
        current_main_stage: 'FIN',
        purchase_price: 1250000,
      },
    ],
  },
})
assert.equal(residential.activeTransactions.rows[0].clientName, 'Jordan Buyer')
assert.equal(residential.activeTransactions.rows[0].propertyName, '22 Bond Street')

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const attorneyWorkspace = await server.ssrLoadModule('/src/services/attorneyMatterWorkspace.js')
  const attorneyMatters = attorneyWorkspace.buildAttorneyMatterWorkspace({
    currentUser: { id: 'firm-admin', role: 'firm_admin' },
    permissions: { can_view_all_firm_matters: true },
    matterQueue: [
      {
        matterId: 'matter-phase-5',
        matterReference: 'MAT-PHASE-5',
        buyerName: 'Buyer pending',
        sellerName: 'Seller pending',
        propertyLabel: 'Property pending',
        transaction: canonicalDashboardRow.transaction,
      },
    ],
  }, { view: 'all' })
  assert.equal(attorneyMatters.tableRows[0].buyerName, 'Jordan Buyer')
  assert.equal(attorneyMatters.tableRows[0].sellerName, 'Alex Seller')
  assert.equal(attorneyMatters.tableRows[0].propertyLabel, '22 Bond Street')

  const bondTransactions = await server.ssrLoadModule('/src/pages/bond/BondTransactionsPage.jsx')
  const bondRows = bondTransactions.buildHqApplicationRegisterRows([
    {
      ...canonicalDashboardRow,
      client: 'Buyer pending',
      property: 'Property pending',
      createdAt: '2026-08-01T08:00:00.000Z',
      lastActivityAt: '2026-08-01T09:00:00.000Z',
    },
  ], new Date('2026-08-01T10:00:00.000Z').getTime())
  assert.equal(bondRows[0].client, 'Jordan Buyer')
  assert.equal(bondRows[0].propertyDisplay, '22 Bond Street')

  const sourceAssertions = [
    ['../src/pages/Dashboard.jsx', /resolvePortalBuyerName/, /resolvePortalSellerName/, /resolvePortalPropertyLabel/],
    ['../src/pages/Agents.jsx', /resolvePortalBuyerName/, /resolvePortalSellerName/, /resolvePortalPropertyLabel/],
    ['../src/components/AgentTransactionsTable.jsx', /resolvePortalBuyerName/, /resolvePortalPropertyLabel/],
    ['../src/components/BondApplicationsTable.jsx', /resolvePortalBuyerName/, /resolvePortalPropertyLabel/],
    ['../src/components/bond/BondDashboard.jsx', /resolvePortalBuyerName/, /resolvePortalPropertyLabel/],
    ['../src/components/bond/BondHqCommandCentre.jsx', /resolvePortalBuyerName/, /resolvePortalSellerName/, /resolvePortalPropertyLabel/],
    ['../src/services/attorneyDashboard.js', /resolvePortalBuyerName/, /resolvePortalSellerName/, /resolvePortalPropertyLabel/],
    ['../src/services/attorneyOperations.js', /resolvePortalBuyerName/, /resolvePortalSellerName/, /resolvePortalPropertyLabel/],
    ['../src/services/bondConsultantPerformanceService.js', /resolvePortalBuyerName/],
    ['../src/services/bondPartnerCollaborationService.js', /resolvePortalBuyerName/, /resolvePortalPropertyLabel/],
  ]

  for (const [path, ...patterns] of sourceAssertions) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8')
    for (const pattern of patterns) {
      assert.match(source, pattern, `${path} should use ${pattern}`)
    }
  }
} finally {
  await server.close()
}

console.log('Dashboard canonical fields Phase 5 contract passed.')
