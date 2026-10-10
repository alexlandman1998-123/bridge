import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const agencyPipelinePage = await readFile(
  new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url),
  'utf8',
)

assert.match(
  agencyPipelinePage,
  /import \{ saveListingSellerCanonicalUpdate \} from '..\/..\/services\/listings\/listingSellerCanonicalUpdateService.js'/,
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
  /if \(!sellerOnboardingReplacementRequired && isSupabaseConfigured && sellerProfileListingId\)[\s\S]*?saveListingSellerCanonicalUpdate\(\{/,
  'Linked seller profiles must save listing and onboarding through the shared atomic service.',
)
assert.match(
  handlerSource,
  /else if \(!sellerOnboardingReplacementRequired && isSupabaseConfigured && sellerProfileOnboardingToken\)[\s\S]*?persistSellerProfileOnboardingFormData\(\{/,
  'The token-only route retains canonical onboarding persistence.',
)
assert.ok(
  handlerSource.indexOf('persistSellerProfileOnboardingFormData({') < handlerSource.indexOf('await updateAgencyCrmLeadRecord'),
  'Canonical seller onboarding write should happen before lead snapshot persistence.',
)
assert.match(
  handlerSource,
  /const canonicalSellerProfileFormData = sellerOnboardingReplacementRequired[\s\S]*?isPlainObject\(persistedSellerProfileOnboarding\?\.form_data\)[\s\S]*?persistedSellerProfileOnboarding\.form_data[\s\S]*?: \{/,
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

assert.ok(
  handlerSource.indexOf('canonicalSaveResult = await saveListingSellerCanonicalUpdate(') < handlerSource.indexOf('await updateAgencyCrmLeadRecord'),
  'The linked listing save must complete before updating the CRM projection.',
)
const listingPage = await readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
const profileSave = listingPage.slice(listingPage.indexOf('async function handleSaveSellerProfileBuilder'), listingPage.indexOf('function handleSellerInformationEditorSubmit'))
assert.equal((profileSave.match(/saveListingSellerCanonicalUpdate\(/g) || []).length, 1)
assert.doesNotMatch(profileSave, /remoteListingMissing|remote: false/, 'A failed remote profile save must not silently become a local-only save.')
