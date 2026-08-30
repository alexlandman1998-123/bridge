import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const workspaceService = await readFile(new URL('../src/services/agentLeadWorkspaceService.js', import.meta.url), 'utf8')
const pipelinePage = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')

assert.match(
  workspaceService,
  /sellerOnboardingSource\s*=\s*row\?\.sellerOnboarding\s*\|\|\s*row\?\.seller_onboarding/,
  'listing normalization must accept both camelCase and database snake_case onboarding records',
)
assert.match(
  workspaceService,
  /sellerOnboarding,\s*\n\s*seller_onboarding:\s*sellerOnboarding,/,
  'listing normalization must retain onboarding data for downstream seller-profile hydration',
)
assert.match(
  workspaceService,
  /formData:\s*onboardingFormData,\s*\n\s*form_data:\s*onboardingFormData,/,
  'normalized onboarding must expose the persisted form under both supported aliases',
)
assert.match(
  pipelinePage,
  /listing\?\.seller_onboarding\s*&&\s*typeof listing\.seller_onboarding === 'object'/,
  'seller profile extraction must fall back to the database snake_case onboarding relation',
)
assert.match(
  pipelinePage,
  /onboarding\?\.residentialAddressDetails\?\.line1[\s\S]*onboarding\?\.residentialAddress/,
  'seller profile must render the residential-address shape written by onboarding',
)
assert.match(
  pipelinePage,
  /onboarding\?\.maritalRegime[\s\S]*onboarding\?\.ownershipType/,
  'seller profile must render the marital/ownership values written by onboarding',
)

console.log('seller profile onboarding hydration regression: ok')
