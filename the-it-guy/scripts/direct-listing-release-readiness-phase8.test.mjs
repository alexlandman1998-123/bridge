import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { buildDirectListingIntakePayload } from '../src/lib/directListingIntakeModel.js'
import {
  DIRECT_LISTING_RELEASE_PHASES,
  buildDirectListingReleaseReadinessReport,
  buildDirectListingReleaseScenarioListing,
} from '../src/lib/directListingReleaseReadiness.js'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const agentListingsSource = readFileSync(new URL('../src/pages/AgentListings.jsx', import.meta.url), 'utf8')
const sellerOnboardingSource = readFileSync(new URL('../src/pages/SellerOnboarding.jsx', import.meta.url), 'utf8')
const agentListingDetailSource = readFileSync(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('Phase 8 release report passes seeded global and Kingstons scenarios', () => {
  const report = buildDirectListingReleaseReadinessReport()

  assert.equal(report.ready, true)
  assert.equal(report.phase, 8)
  assert.equal(report.counts.scenarios, 4)
  assert.equal(report.counts.blocked, 0)
  assert.equal(report.counts.kingstons, 1)
  assert.equal(report.counts.uploadFree, report.counts.scenarios)
  assert.equal(report.globalContract.declarationOnly, true)
  assert.equal(report.globalContract.uploadsRequired, false)
  assert.equal(report.globalContract.sellerPortalReadsDirectFormat, true)
  assert.equal(report.globalContract.kingstonsSafe, true)
})

test('Phase 8 release report blocks any upload-gated direct listing regression', () => {
  const payload = buildDirectListingIntakePayload({
    sellerType: 'individual',
    sellerName: 'Una',
    sellerSurname: 'Upload',
    sellerEmail: 'upload@example.com',
    sellerPhone: '+27 82 111 5555',
    propertyAddress: '99 Upload Road',
    propertyStructureType: 'full_title',
  })
  const listing = buildDirectListingReleaseScenarioListing({
    scenario: 'regression_upload_gate',
    form: {
      sellerType: 'individual',
      sellerName: 'Una',
      sellerSurname: 'Upload',
      sellerEmail: 'upload@example.com',
      sellerPhone: '+27 82 111 5555',
      propertyAddress: '99 Upload Road',
      propertyStructureType: 'full_title',
    },
    listing: {
      directListingIntake: {
        ...payload,
        uploadsRequired: true,
      },
      complianceDeclarations: {
        ...payload.complianceDeclarations,
        uploadsRequired: true,
      },
    },
  })
  const report = buildDirectListingReleaseReadinessReport({ listings: [listing] })

  assert.equal(report.ready, false)
  assert.ok(report.blockers.some((row) => row.blocker === 'Direct listing requires uploads or evidence'))
})

test('Phase 8 phase registry covers every implemented direct-listing phase', () => {
  assert.deepEqual(DIRECT_LISTING_RELEASE_PHASES.map((phase) => phase.phase), [1, 2, 3, 4, 5, 6, 7, 8])
  assert.ok(DIRECT_LISTING_RELEASE_PHASES.some((phase) => phase.key === 'release_readiness'))
})

test('Phase 8 package scripts expose single-phase and full-chain verification', () => {
  assert.match(packageJson.scripts['test:direct-listing-release-readiness-phase8'], /direct-listing-release-readiness-phase8\.test\.mjs/)
  assert.match(packageJson.scripts['verify:direct-listing-global'], /test:direct-listing-intake-model-phase1/)
  assert.match(packageJson.scripts['verify:direct-listing-global'], /test:direct-listing-release-readiness-phase8/)
})

test('Phase 8 static contract keeps Quick Add, Seller Portal, and audit wiring connected', () => {
  assert.match(agentListingsSource, /uploadsRequired: false/)
  assert.match(agentListingsSource, /SELLER_PORTAL_ACTIVATION_SOURCES\.manualListing/)
  assert.match(sellerOnboardingSource, /buildSellerPortalFormDataFromDirectListing/)
  assert.match(sellerOnboardingSource, /Document uploads are not required from this declaration summary/)
  assert.match(agentListingDetailSource, /buildDirectListingOperationalSummary/)
  assert.match(agentListingDetailSource, /Declarations are audit flags only and do not require uploads/)
})
