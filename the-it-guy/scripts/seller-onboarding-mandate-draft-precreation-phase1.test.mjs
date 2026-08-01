import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const serviceSource = await readFile(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

function assertIncludes(source, needle, label) {
  assert.ok(source.includes(needle), `${label} is missing: ${needle}`)
}

function assertMatches(source, pattern, label) {
  assert.match(source, pattern, `${label} did not match ${pattern}`)
}

assert.equal(
  packageJson.scripts?.['test:seller-onboarding-mandate-draft-precreation-phase1'],
  'node scripts/seller-onboarding-mandate-draft-precreation-phase1.test.mjs',
)

for (const token of [
  'precreateSellerMandateDraftFromOnboarding',
  'mapSellerOnboardingToMandateData',
  'validateMandateGenerationData',
  'resolveActiveTemplate',
  'createEditableDocumentDraftFromTemplate',
  'updateDocumentPacketVersion',
  'freezeEditableDocumentRevisionForRender',
  'updateDocumentPacket',
  'source_hash',
  'draft_status',
  'draftStatus',
  'phase1DraftPrecreation',
  'resolvedMergeFields',
  'selectedTemplateRevision',
  'seller_onboarding_mandate_draft_precreated',
]) {
  assertIncludes(serviceSource, token, 'Phase 1 mandate draft precreation contract')
}

assertMatches(
  serviceSource,
  /function buildSellerMandateDraftSourceHash[\s\S]+fnv1a_/,
  'Phase 1 should compute a stable source hash from draft inputs',
)

assertMatches(
  serviceSource,
  /deferSellerOnboardingFollowUp\('mandate editable draft pre-creation after onboarding submit'[\s\S]+precreateSellerMandateDraftFromOnboarding/,
  'RPC seller onboarding completion should queue mandate draft precreation',
)

assertMatches(
  serviceSource,
  /deferSellerOnboardingFollowUp\('mandate editable draft pre-creation after onboarding fallback submit'[\s\S]+precreateSellerMandateDraftFromOnboarding/,
  'Fallback seller onboarding completion should queue mandate draft precreation',
)

assertMatches(
  serviceSource,
  /draftStatus === 'ready'[\s\S]+freezeEditableDocumentRevisionForRender/,
  'Only ready mandate drafts should be frozen for render',
)

assertMatches(
  serviceSource,
  /status: draftStatus === 'ready' \? 'ready_for_generation' : 'draft'/,
  'Ready drafts should mark the packet ready for generation',
)

assertMatches(
  serviceSource,
  /private_listings'[\s\S]+mandate_packet_id[\s\S]+leads'[\s\S]+mandate_packet_id/,
  'Created draft packet ids should be synced back to listing and lead references',
)

console.log('Seller onboarding mandate draft precreation phase 1 contract passed.')
