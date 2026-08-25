import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const serviceSource = await readFile(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8')
const onboardingSource = await readFile(new URL('../src/pages/SellerOnboarding.jsx', import.meta.url), 'utf8')
const pipelineSource = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')

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
assert.match(
  pipelineSource,
  /function hasExplicitSellerOnboardingSubmissionEvidence\([\s\S]*?SELLER_ONBOARDING_SUBMITTED_STATUS_KEYS\.has\(status\)/,
  'seller onboarding reconciliation should require explicit submitted/completed status or timestamp',
)
assert.match(
  pipelineSource,
  /const hydratedStatus = normalizeSellerOnboardingStatus\([\s\S]*?hasFormData: false,[\s\S]*?\)/,
  'seller onboarding completion polling must not treat seeded form data as submission evidence',
)
assert.doesNotMatch(
  pipelineSource,
  /const hydratedStatus = normalizeSellerOnboardingStatus\([\s\S]{0,700}hasFormData: Boolean\(/,
  'seller onboarding completion polling should not complete from form_data presence alone',
)
assert.match(
  pipelineSource,
  /if \(leadIsSeller && \(listingId \|\| sellerOnboardingToken\)\) return null/,
  'seller leads with explicit onboarding/listing linkage must not fall back to fuzzy listing label matches',
)
assert.match(
  pipelineSource,
  /const getPrivateListingActivity = createDeferredAction\(loadPrivateListingActions, 'getPrivateListingActivity'\)/,
  'seller lead workspace should be able to hydrate linked private listing activity',
)
assert.match(
  pipelineSource,
  /const \[selectedLeadPrivateListingActivities, setSelectedLeadPrivateListingActivities\] = useState\(\[\]\)/,
  'selected seller lead should keep private listing activity rows in state',
)
assert.match(
  pipelineSource,
  /for \(const activity of selectedLeadPrivateListingActivities\)[\s\S]*?privateListingActivityPresentation\(activity\)/,
  'seller lead activity timeline should include linked private listing lifecycle events',
)
assert.match(
  pipelineSource,
  /const getActivitySourceLabel = \(activity = \{\}, sourceType = 'activity'\) => \{[\s\S]*?typeKey\.includes\('seller_contact'\)[\s\S]*?typeKey\.includes\('seller_lead_created'\)/,
  'seller lead CRM activity rows should use seller workflow labels instead of generic activity labels',
)
assert.match(
  pipelineSource,
  /if \(listingId && sellerJourney\.listingCreated && !hasTimelineSignal/,
  'seller lead timeline must only synthesize listing-created activity from journey evidence',
)

console.log('seller onboarding progress serialization contract passed')
