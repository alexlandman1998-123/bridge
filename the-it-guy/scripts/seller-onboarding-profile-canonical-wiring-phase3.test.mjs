import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const agencyPipelinePage = await readFile(
  new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url),
  'utf8',
)

assert.match(
  agencyPipelinePage,
  /import \{[\s\S]*?persistSellerProfileOnboardingFormData[\s\S]*?\} from '..\/..\/services\/privateListingService'/,
  'Agency pipeline should import seller profile canonical persistence helper.',
)

const handlerStart = agencyPipelinePage.indexOf('async function handleSaveSellerLeadEditDetails(event)')
assert.notEqual(handlerStart, -1, 'Seller profile save handler should exist.')

const nextHandler = agencyPipelinePage.indexOf('\n  async function ', handlerStart + 1)
const handlerSource = agencyPipelinePage.slice(handlerStart, nextHandler === -1 ? undefined : nextHandler)

assert.match(
  handlerSource,
  /const sellerProfileListingId = normalizeText\([\s\S]*?selectedLeadLinkedListing\?\.id[\s\S]*?selectedLead\?\.listingId/,
  'Seller profile save should resolve the linked listing id for canonical persistence.',
)
assert.match(
  handlerSource,
  /const sellerProfileOnboardingToken = normalizeText\([\s\S]*?selectedLead\?\.sellerOnboardingToken[\s\S]*?selectedLeadLinkedListing\?\.sellerOnboarding\?\.token/,
  'Seller profile save should resolve the seller onboarding token for canonical persistence.',
)
assert.match(
  handlerSource,
  /const persistedSellerProfileOnboarding = isSupabaseConfigured && \(sellerProfileListingId \|\| sellerProfileOnboardingToken\)[\s\S]*?persistSellerProfileOnboardingFormData\(\{/,
  'Seller profile save should write to the canonical seller onboarding row when Supabase context exists.',
)
assert.ok(
  handlerSource.indexOf('persistSellerProfileOnboardingFormData({') < handlerSource.indexOf('await updateAgencyCrmLeadRecord'),
  'Canonical seller onboarding write should happen before lead snapshot persistence.',
)
assert.match(
  handlerSource,
  /const canonicalSellerProfileFormData = isPlainObject\(persistedSellerProfileOnboarding\?\.form_data\)[\s\S]*?persistedSellerProfileOnboarding\.form_data[\s\S]*?: \{/,
  'Seller profile save should prefer the canonical returned form_data and fall back to the local merge.',
)
assert.match(
  handlerSource,
  /formData: canonicalSellerProfileFormData/,
  'Seller onboarding lead snapshot should use canonical merged form data.',
)
assert.match(
  handlerSource,
  /sellerOnboarding\.form_data = sellerOnboarding\.formData/,
  'Seller onboarding lead snapshot should maintain snake_case form_data compatibility.',
)
assert.match(
  handlerSource,
  /rawEnquiryPayload[\s\S]*?sellerOnboarding,[\s\S]*?seller_onboarding: sellerOnboarding/,
  'Raw enquiry payload should mirror the canonical seller onboarding snapshot.',
)

console.log('Seller onboarding profile canonical wiring Phase 3 contract passed.')
