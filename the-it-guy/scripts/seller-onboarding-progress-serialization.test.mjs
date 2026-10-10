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
const progressSave = serviceSource.slice(serviceSource.indexOf('async function updateSellerOnboardingProgressInternal('), serviceSource.indexOf('export async function updateSellerOnboardingProgress('))
assert.doesNotMatch(progressSave, /\.from\(/, 'token progress must not fall back to direct table writes')
assert.match(progressSave, /if \(rpc\.error\) \{[\s\S]*?throw rpc\.error/, 'a failed secure save must remain a failed save')
assert.match(
  onboardingSource,
  /setSaving\(true\)[\s\S]*?finally \{[\s\S]*?setSaving\(false\)/,
  'silent autosaves must participate in the saving lifecycle',
)
assert.doesNotMatch(
  onboardingSource,
  /send_onboarding/,
  'multiple-owner onboarding must not offer a separate owner-onboarding route in the MVP.',
)
assert.match(
  onboardingSource,
  /handlePrimaryContactOwnerOneChange[\s\S]*?The primary contact details above are for Owner 1/,
  'multiple-owner onboarding should let the primary contact reuse their details for Owner 1.',
)
assert.match(
  onboardingSource,
  /signatureOnly=\{hasRequestedComplianceSigner\}/,
  'a signer link must render as a dedicated declaration-signing experience instead of normal onboarding.',
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
assert.match(
  pipelineSource,
  /const linkedListingId = normalizeText\([\s\S]*?selectedLeadLinkedListing\?\.id[\s\S]*?selectedLeadLinkedListing\?\.listing_id/,
  'seller onboarding completion polling must reconcile a submitted onboarding through the linked private listing when the CRM lead projection has no listing id',
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
  /if \(listingId && sellerTimelineComplianceStatus\.listingDraftExists && !hasTimelineSignal/,
  'seller lead timeline must require a linked listing draft before synthesizing a listing milestone',
)
assert.match(
  pipelineSource,
  /const listingLive = sellerTimelineComplianceStatus\.canTreatListingAsLive[\s\S]*?const listingCreated = sellerTimelineComplianceStatus\.canTreatListingAsCreated/,
  'created and live timeline labels must use the compliance evidence gates',
)

console.log('seller onboarding progress serialization contract passed')

// Execute the actual page queue and persistence function with delayed saves.
// Submission must consume the preceding draft's receipt, not its render closure.
const queueStart = onboardingSource.indexOf('  function queueSellerSave(')
const queueEnd = onboardingSource.indexOf('\n  }', queueStart) + 4
const persistStart = onboardingSource.indexOf('  async function persistListingUpdate(')
const persistEnd = onboardingSource.indexOf('\n  function handleFormUpdate', persistStart)
const initial = { id: 'listing-a', sellerOnboarding: { id: 'onboarding-a', status: 'in_progress', updatedAt: 'first', formData: {} } }
const saved = { ...initial, sellerOnboarding: { ...initial.sellerOnboarding, updatedAt: 'second', formData: { phone: '0820000000' } } }
const snapshotRef = { current: initial }
const requests = []
let releaseDraft
const draftResponse = new Promise(resolve => { releaseDraft = resolve })
const scope = {
  isDemoOnboarding: false, useDbFirstSellerOnboarding: true, listing: initial, token: 'token-a', currentStep: 1,
  sellerSaveSnapshotRef: snapshotRef, sellerSaveQueueRef: { current: Promise.resolve() },
  SELLER_ONBOARDING_STATUS: { IN_PROGRESS: 'in_progress' },
  setListing: () => {},
  updateSellerOnboardingProgress: async (_token, request) => { requests.push(request); return draftResponse },
}
const runtime = Function(...Object.keys(scope), `${onboardingSource.slice(queueStart, queueEnd)}\n${onboardingSource.slice(persistStart, persistEnd)}\nreturn {queueSellerSave,persistListingUpdate}`)(...Object.values(scope))
const draft = runtime.persistListingUpdate(row => ({ ...row, sellerOnboarding: { ...row.sellerOnboarding, formData: { phone: '0820000000' } } }))
let submittedRevision
const submission = runtime.queueSellerSave(async () => { submittedRevision = snapshotRef.current.sellerOnboarding.updatedAt })
await new Promise(resolve => setImmediate(resolve))
assert.equal(requests.length, 1)
assert.equal(requests[0].listingSnapshot.sellerOnboarding.updatedAt, 'first')
assert.equal(submittedRevision, undefined, 'Submission must wait for the pending autosave')
releaseDraft({ listing: saved })
await Promise.all([draft, submission])
assert.equal(submittedRevision, 'second', 'Submission must use the committed draft revision')
assert.equal(snapshotRef.current.sellerOnboarding.formData.phone, '0820000000')
console.log('actual portal draft/submission queue regression passed')
