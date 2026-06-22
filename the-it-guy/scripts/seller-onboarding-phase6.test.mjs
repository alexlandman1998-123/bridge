import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const appRoot = new URL('../', import.meta.url)

async function readAppFile(path) {
  return fs.readFile(new URL(path, appRoot), 'utf8')
}

function assertContract(source, pattern, message) {
  assert.match(source, pattern, message)
}

const listingDetailSource = await readAppFile('src/pages/AgentListingDetail.jsx')

for (const communicationType of [
  'seller_onboarding_link_seller',
  'seller_portal_link_seller',
  'seller_onboarding_submitted_agent',
]) {
  assertContract(
    listingDetailSource,
    new RegExp(`'${communicationType}'`),
    `Seller onboarding diagnostics should include ${communicationType}.`,
  )
}

assertContract(
  listingDetailSource,
  /function buildSellerOnboardingEmailDiagnostics\(deliveries = \[\]\)/,
  'Listing detail should build a dedicated seller onboarding email diagnostic summary.',
)
assertContract(
  listingDetailSource,
  /\.filter\(isSellerOnboardingEmailDelivery\)/,
  'Seller onboarding diagnostics should only summarize seller onboarding delivery rows.',
)
assertContract(
  listingDetailSource,
  /latestFailureMessage/,
  'Seller onboarding diagnostics should expose the latest provider failure message.',
)
assertContract(
  listingDetailSource,
  /Seller Onboarding Email Diagnostics/,
  'Listing detail should render the seller onboarding email diagnostics panel.',
)
assertContract(
  listingDetailSource,
  /No seller onboarding email delivery rows have been logged for this listing yet\./,
  'Listing detail should show an empty state when seller onboarding email rows are missing.',
)
assertContract(
  listingDetailSource,
  /Latest failure:/,
  'Listing detail should surface provider failure details for support.',
)

const packageJson = await readAppFile('package.json')
assertContract(
  packageJson,
  /"test:seller-onboarding-phase6": "node scripts\/seller-onboarding-phase6\.test\.mjs"/,
  'package.json should expose the Phase 6 seller onboarding diagnostic test.',
)

console.log('seller onboarding phase 6 diagnostics passed')
