import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const serviceSource = await readFile(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8')
const onboardingSource = await readFile(new URL('../src/pages/SellerOnboarding.jsx', import.meta.url), 'utf8')

assert.match(
  serviceSource,
  /const sellerOnboardingProgressQueues = new Map\(\)[\s\S]*const sellerOnboardingProjectionQueues = new Map\(\)/,
  'seller onboarding must maintain separate raw-save and derived-projection queues',
)
assert.match(
  serviceSource,
  /async function updateSellerOnboardingProgressInternal\([\s\S]*?export async function updateSellerOnboardingProgress\([\s\S]*?enqueueKeyedOperation\(\s*sellerOnboardingProgressQueues/,
  'seller onboarding progress calls must be serialized per onboarding token',
)
assert.match(
  serviceSource,
  /function enqueueSellerOnboardingProgressProjection\([\s\S]*?enqueueKeyedOperation\(sellerOnboardingProjectionQueues/,
  'canonical and requirement projections must be serialized per listing',
)
assert.match(
  serviceSource,
  /void enqueueSellerOnboardingProgressProjection\(client, \{[\s\S]*?reason: 'seller_onboarding_progress',[\s\S]*?\}\)/,
  'progress saves must schedule projections through the keyed queue',
)
assert.match(
  serviceSource,
  /const context = await getSellerOnboardingByToken\(token, \{[\s\S]*?includeRequirementsAndDocuments: false,[\s\S]*?corePayload: true,[\s\S]*?\}\)/,
  'RPC-missing progress fallback must use the lightweight core onboarding context',
)
assert.match(
  serviceSource,
  /const listingForProgress = refreshedListing \|\| context\.listing[\s\S]*?void enqueueSellerOnboardingProgressProjection\(client, \{[\s\S]*?reason: 'seller_onboarding_progress_fallback'/,
  'RPC-missing progress fallback must queue derived projections without blocking',
)
assert.match(
  onboardingSource,
  /setSaving\(true\)[\s\S]*?finally \{[\s\S]*?setSaving\(false\)/,
  'silent autosaves must participate in the saving lifecycle',
)

console.log('seller onboarding progress serialization contract passed')
